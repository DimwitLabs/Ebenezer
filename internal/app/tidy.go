package app

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/DimwitLabs/ebenezer/internal/openrouter"
)

// Tidy is a script the model wrote and its summary; the script runs in the browser's sandbox, never on the server.
type Tidy struct {
	Summary string `json:"summary"`
	Code    string `json:"code"`
}

type TidyAsk struct {
	Fields   []TidyField  `json:"fields"`
	Columns  []string     `json:"columns"`
	Sample   []TidySample `json:"sample"`
	Previous string       `json:"previous"`
	Change   string       `json:"change"`
}

type TidySample struct {
	Row      map[string]string `json:"row"`
	Problems []string          `json:"problems,omitempty"`
}

type TidyField struct {
	Key      string   `json:"key"`
	Type     string   `json:"type"`
	Required bool     `json:"required,omitempty"`
	Choices  []string `json:"choices,omitempty"`
}

const tidyPrompt = `You reshape rows of a spreadsheet import so Ebenezer, a personal finance app, can read them.
Reply with JSON only: {"summary": "...", "code": "..."}

code: the body of a JavaScript function. rows is in scope, an array of objects of strings keyed by
the field keys given; the body must return the new array. helpers.number(v) reads any number,
helpers.date(v) gives YYYY-MM-DD reading day first, helpers.date(v, true) reads month first,
helpers.round(n) rounds. No network, no imports, no comments.
Every row must pass: required fields filled, number, money and percent fields plain numbers, date
fields YYYY-MM-DD, choice fields exactly one of their choices. Sample rows that fail come with
their problems; the rest of the file fails the same ways. Repair values, never drop a row for a
badly written one: numbers in words become digits ("ten" is 10), "1,200.50" and "(45)" are numbers,
"B" or "Purchase" maps to the nearest choice, and an empty required field is filled from the row's
other values when they make it clear, such as a sell from a negative quantity. Read dates month
first only when the sample proves it. Keep every other value as it is, and keep each row's "_i" key as it is. The only rows to leave out
are ones that are not data at all, such as totals, headers repeated mid-file, or blank lines.
Never merge or invent rows.
summary: one plain sentence, under 30 words, saying what the script does to these rows.`

func (a *App) TidyScript(ctx context.Context, ask TidyAsk) (Tidy, error) {
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
	user := fmt.Sprintf("Fields: %s\nThe file's columns: %s\nSample rows, already matched to fields: %s",
		fields, strings.Join(ask.Columns, ", "), rows)
	switch {
	case ask.Previous != "":
		user += fmt.Sprintf("\n\nThe script so far:\n%s\n\nChange it: %s", ask.Previous, ask.Change)
	case ask.Change != "":
		user += "\n\nAlso: " + ask.Change
	}
	text, err := a.ai(key).Chat(ctx, openrouter.Request{Model: is.OpenRouterModel, Temperature: 0.1, MaxTokens: 2500, JSON: true,
		Messages: []openrouter.Message{{Role: "system", Content: tidyPrompt}, {Role: "user", Content: user}}})
	if err != nil {
		return Tidy{}, err
	}
	var t Tidy
	if err := json.Unmarshal([]byte(text), &t); err != nil {
		return Tidy{}, fmt.Errorf("the model's answer was not a script: %w", err)
	}
	t.Summary, t.Code = strings.TrimSpace(t.Summary), strings.TrimSpace(t.Code)
	if t.Summary == "" || t.Code == "" || len(t.Code) > 12000 {
		return Tidy{}, fmt.Errorf("the model didn't write a script I can use; try again")
	}
	return t, nil
}
