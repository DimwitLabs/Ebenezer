package app

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/DimwitLabs/ebenezer/internal/openrouter"
	"github.com/DimwitLabs/ebenezer/internal/store"
)

// Tidy is a script the model wrote and its summary; the script runs in the browser's sandbox, never on the server.
type Tidy struct {
	Summary string   `json:"summary"`
	Steps   []string `json:"steps"`
	Code    string   `json:"code"`
}

type TidyAsk struct {
	Fields   []TidyField  `json:"fields"`
	Columns  []string     `json:"columns"`
	Unused   []string     `json:"unused"`
	Sample   []TidySample `json:"sample"`
	Previous string       `json:"previous"`
	Change   string       `json:"change"`
}

type TidySample struct {
	Row      map[string]string `json:"row"`
	Raw      map[string]string `json:"raw,omitempty"`
	Problems []string          `json:"problems,omitempty"`
}

type TidyField struct {
	Key      string   `json:"key"`
	Type     string   `json:"type"`
	Required bool     `json:"required,omitempty"`
	Choices  []string `json:"choices,omitempty"`
}

const tidyPrompt = `You turn rows of a spreadsheet import into the fields of a section in Ebenezer, a personal finance app.
Reply with JSON only: {"summary": "...", "steps": ["..."], "code": "..."}

code: the body of a JavaScript function. In scope: rows, an array of objects of strings keyed by the
field keys given, holding the columns the person matched; raw, the file's original rows with every
column under its own header, where raw[Number(row._i)] is the row rows[i] came from; helpers.number(v)
reads any number, helpers.date(v) gives YYYY-MM-DD reading day first, helpers.date(v, true) reads
month first, helpers.round(n) rounds. The body must return the new array. No network, no imports, no comments.

Work out each field from the whole original row, not only the matched column. When the file splits
what a field means across several columns, combine them: a trade's charges are its brokerage,
exchange and transaction charges, stamp duty, taxes and other fees added together, whichever of
those the file has as amounts. Fill an unmatched field when the columns make it clear. Never use a
column for something it does not mean.
Every row must pass: required fields filled, number, money and percent fields plain numbers, date
fields YYYY-MM-DD, choice fields exactly one of their choices. Sample rows that fail come with
their problems; the rest of the file fails the same ways. Repair values, never drop a row for a
badly written one: numbers in words become digits ("ten" is 10), "1,200.50" and "(45)" are numbers,
"B" or "Purchase" maps to the nearest choice, and an empty required field is filled from the row's
other values when they make it clear, such as a sell from a negative quantity. Read dates month
first only when the sample proves it. Keep every other value as it is, and keep each row's "_i" key as it is. The only rows to leave out
are ones that are not data at all, such as totals, headers repeated mid-file, or blank lines.
Never merge or invent rows. When nothing needs doing, return rows as they are.

summary: one plain sentence, under 30 words, saying what the script does to these rows.
steps: one short sentence per decision the script makes, naming the columns it reads, such as
"Charges adds Brokerage, Transaction Charges and Stamp Duty." Leave out fields taken as they are.`

func (a *App) TidyScript(ctx context.Context, p *store.Portfolio, ask TidyAsk) (Tidy, error) {
	key := a.Secret(ctx, OpenRouterKey)
	if key == "" {
		return Tidy{}, ErrNoAI
	}
	is, err := a.Store.InstanceSettings(ctx)
	if err != nil {
		return Tidy{}, err
	}
	if len(ask.Sample) > 3 {
		ask.Sample = ask.Sample[:3]
	}
	rows, err := json.Marshal(ask.Sample)
	if err != nil {
		return Tidy{}, err
	}
	fields, err := json.Marshal(ask.Fields)
	if err != nil {
		return Tidy{}, err
	}
	user := fmt.Sprintf("Fields: %s\nThe file's columns: %s\nColumns matched to no field: %s\nSample rows, matched to fields, each with its original row: %s",
		fields, strings.Join(ask.Columns, ", "), strings.Join(ask.Unused, ", "), rows)
	switch {
	case ask.Previous != "":
		user += fmt.Sprintf("\n\nThe script so far:\n%s\n\nChange it: %s", ask.Previous, ask.Change)
	case ask.Change != "":
		user += "\n\nAlso: " + ask.Change
	}
	text, err := a.ai(key).Chat(ctx, openrouter.Request{Model: ModelFor(is, p), Temperature: 0.1, MaxTokens: 2500, JSON: true,
		Messages: []openrouter.Message{{Role: "system", Content: tidyPrompt}, {Role: "user", Content: user}}})
	if err != nil {
		return Tidy{}, err
	}
	var t Tidy
	if err := json.Unmarshal([]byte(text), &t); err != nil {
		return Tidy{}, fmt.Errorf("the model's answer was not a script: %w", err)
	}
	t.Summary, t.Code = strings.TrimSpace(t.Summary), strings.TrimSpace(t.Code)
	steps := t.Steps[:0]
	for _, st := range t.Steps {
		if st = strings.TrimSpace(st); st != "" && len(st) <= 240 && len(steps) < 8 {
			steps = append(steps, st)
		}
	}
	t.Steps = steps
	if t.Summary == "" || t.Code == "" || len(t.Code) > 12000 {
		return Tidy{}, fmt.Errorf("the model didn't write a script I can use; try again")
	}
	return t, nil
}
