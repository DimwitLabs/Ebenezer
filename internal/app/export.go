package app

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"io"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/DimwitLabs/ebenezer/internal/kinds"
	"github.com/DimwitLabs/ebenezer/internal/store"
	"github.com/DimwitLabs/ebenezer/internal/value"
)

type ExportFile struct {
	Name string `json:"name"`
	Rows int    `json:"rows"`
	Size int    `json:"size"`
	body []byte
}

var unsafeName = regexp.MustCompile(`[^a-z0-9]+`)

func fileName(name string) string {
	n := strings.Trim(unsafeName.ReplaceAllString(strings.ToLower(name), "-"), "-")
	if n == "" {
		n = "section"
	}
	return n
}

func csvOf(header []string, rows [][]string) []byte {
	var b bytes.Buffer
	w := csv.NewWriter(&b)
	_ = w.Write(header)
	_ = w.WriteAll(rows)
	return b.Bytes()
}

func money(n float64) string { return strconv.FormatFloat(n, 'f', -1, 64) }

func optional(n *float64) string {
	if n == nil {
		return ""
	}
	return money(*n)
}

// ExportFiles builds a portfolio's CSV files with the field labels Import matches on as headers, so each file goes back in as it came out.
func (a *App) ExportFiles(ctx context.Context, p *store.Portfolio) ([]ExportFile, error) {
	secs, err := a.Store.Sections(ctx, p.ID)
	if err != nil {
		return nil, err
	}
	var out []ExportFile
	taken := map[string]int{}
	add := func(name string, header []string, rows [][]string) {
		if len(rows) == 0 {
			return
		}
		if n := taken[name]; n > 0 {
			taken[name]++
			name = name + "-" + strconv.Itoa(n+1)
		} else {
			taken[name] = 1
		}
		body := csvOf(header, rows)
		out = append(out, ExportFile{Name: name + ".csv", Rows: len(rows), Size: len(body), body: body})
	}
	for _, sec := range secs {
		stored, err := a.Store.Rows(ctx, sec.ID)
		if err != nil {
			return nil, err
		}
		header := make([]string, len(sec.Fields))
		for i, f := range sec.Fields {
			header[i] = f.Label
		}
		rows := make([][]string, 0, len(stored))
		for _, r := range stored {
			var data map[string]any
			if json.Unmarshal(r.Data, &data) != nil {
				continue
			}
			row := make([]string, len(sec.Fields))
			for i, f := range sec.Fields {
				row[i] = value.Text(data[f.Key])
			}
			rows = append(rows, row)
		}
		add(fileName(sec.Name), header, rows)
	}
	e, err := a.Expenses(ctx, p)
	if err != nil {
		return nil, err
	}
	var spends [][]string
	for _, sp := range e.Spends {
		spends = append(spends, []string{sp.Day.Format(time.DateOnly), sp.Item, money(sp.Amount), sp.Category, e.MethodName(sp.PaidWith), sp.Note})
	}
	add("expenses", labels(kinds.ExpenseFields), spends)
	var cards [][]string
	for _, c := range e.Cards {
		cards = append(cards, []string{c.Bank, c.Name, c.Nickname, c.Kind, c.Network, optional(c.Limit), strconv.Itoa(c.StatementDay), strconv.Itoa(c.DueDays),
			optional(c.Interest), optional(c.AnnualFee), c.LastStatement.Format(time.DateOnly), money(c.Billed), money(c.PaidOff), money(spentBefore(c)), c.Color})
	}
	add("credit-cards", labels(kinds.CardFields), cards)
	return out, nil
}

type ExportPart struct {
	Folder string
	Files  []ExportFile
}

func WriteZip(w io.Writer, parts []ExportPart) error {
	z := zip.NewWriter(w)
	for _, part := range parts {
		for _, f := range part.Files {
			fw, err := z.Create(part.Folder + "/" + f.Name)
			if err != nil {
				return err
			}
			if _, err := fw.Write(f.body); err != nil {
				return err
			}
		}
	}
	return z.Close()
}

// spentBefore returns only what was set by hand, and nothing once a later statement has taken it in; spends told to Ebenezer go out in expenses.csv.
func spentBefore(c CardState) float64 {
	if c.LastStatement.Equal(c.StatementOn) {
		return c.SpentBefore
	}
	return 0
}

func labels(fields []kinds.Field) []string {
	out := make([]string, len(fields))
	for i, f := range fields {
		out[i] = f.Label
	}
	return out
}
