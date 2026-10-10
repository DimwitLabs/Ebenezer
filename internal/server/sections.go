package server

import (
	"errors"
	"net/http"
	"regexp"
	"slices"
	"strings"

	"github.com/DimwitLabs/ebenezer/internal/kinds"
	"github.com/DimwitLabs/ebenezer/internal/store"
	"github.com/DimwitLabs/ebenezer/internal/value"
)

func (s *Server) listSections(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	secs, err := s.store.Sections(r.Context(), p.ID)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, secs)
	return nil
}

type sectionBody struct {
	Kind        string        `json:"kind"`
	Name        string        `json:"name"`
	Icon        string        `json:"icon"`
	Description *string       `json:"description"`
	Valuation   string        `json:"valuation"`
	Rate        *float64      `json:"rate"`
	ValueField  string        `json:"valueField"`
	CostField   string        `json:"costField"`
	DateField   string        `json:"dateField"`
	Fields      []kinds.Field `json:"fields"`
	Counts      *bool         `json:"counts"`
}

var (
	iconPattern     = regexp.MustCompile(`^[a-z0-9_]{1,40}$`)
	colorPattern    = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
	fieldKeyPattern = regexp.MustCompile(`^[a-z][a-z0-9_]{0,39}$`)
)

func (s *Server) createSection(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	var body sectionBody
	if err := readJSON(r, &body); err != nil {
		return err
	}
	k, found := kinds.Get(body.Kind)
	if !found {
		return fail(http.StatusBadRequest, "unknown kind %q", body.Kind)
	}
	sec := sectionFromKind(p.ID, k)
	if err := applySection(&sec, body, k); err != nil {
		return err
	}
	err = s.store.CreateSection(r.Context(), &sec)
	if errors.Is(err, store.ErrConflict) {
		return fail(http.StatusConflict, "this portfolio already has a %s section; only custom sections can repeat", k.Name)
	}
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusCreated, sec)
	return nil
}

// applySection applies an edit to a section; built-in kinds keep their fields and valuation so prices and XIRR keep working.
func applySection(sec *store.Section, body sectionBody, k kinds.Kind) error {
	if n := strings.TrimSpace(body.Name); n != "" {
		if len(n) > 60 {
			return fail(http.StatusBadRequest, "keep the section name under 60 characters")
		}
		sec.Name = n
	}
	if body.Icon != "" {
		if !iconPattern.MatchString(body.Icon) {
			return fail(http.StatusBadRequest, "pick an icon from the list")
		}
		sec.Icon = body.Icon
	}
	if body.Description != nil {
		if len(*body.Description) > 2000 {
			return fail(http.StatusBadRequest, "keep the description under 2000 characters")
		}
		sec.Description = strings.TrimSpace(*body.Description)
	}
	if body.Counts != nil && k.Valuation != kinds.Cover {
		sec.Counts = *body.Counts
	}
	if k.Key != "custom" {
		return nil
	}
	if !slices.Contains(kinds.CustomValuations, body.Valuation) {
		return fail(http.StatusBadRequest, "a custom section is valued by your figure, by a growth rate, or not at all")
	}
	if len(body.Fields) == 0 || len(body.Fields) > 30 {
		return fail(http.StatusBadRequest, "a custom section needs between 1 and 30 fields")
	}
	seen := map[string]bool{}
	for i := range body.Fields {
		f := &body.Fields[i]
		f.Label = strings.TrimSpace(f.Label)
		if f.Key == "" {
			f.Key = slug(f.Label)
		}
		if !fieldKeyPattern.MatchString(f.Key) || seen[f.Key] || f.Label == "" {
			return fail(http.StatusBadRequest, "every field needs its own label")
		}
		seen[f.Key] = true
		if !slices.Contains(kinds.FieldTypes, f.Type) {
			return fail(http.StatusBadRequest, "field %q has an unknown type", f.Label)
		}
	}
	need := func(key, what string) error {
		if key != "" && !seen[key] {
			return fail(http.StatusBadRequest, "the %s field isn't one of the section's fields", what)
		}
		return nil
	}
	for _, c := range []struct{ key, what string }{{body.ValueField, "value"}, {body.CostField, "cost"}, {body.DateField, "date"}} {
		if err := need(c.key, c.what); err != nil {
			return err
		}
	}
	switch body.Valuation {
	case kinds.Manual:
		if body.ValueField == "" {
			return fail(http.StatusBadRequest, "say which field holds the current value")
		}
	case kinds.Rate:
		if body.CostField == "" || body.DateField == "" || body.Rate == nil {
			return fail(http.StatusBadRequest, "growth by rate needs a cost field, a date field and a rate")
		}
	}
	sec.Valuation, sec.Rate, sec.Fields = body.Valuation, body.Rate, body.Fields
	sec.ValueField, sec.CostField, sec.DateField = body.ValueField, body.CostField, body.DateField
	return nil
}

var nonWord = regexp.MustCompile(`[^a-z0-9]+`)

func slug(label string) string {
	s := strings.Trim(nonWord.ReplaceAllString(strings.ToLower(label), "_"), "_")
	if s == "" || s[0] < 'a' || s[0] > 'z' {
		s = "f_" + s
	}
	return s[:min(len(s), 40)]
}

func (s *Server) updateSection(w http.ResponseWriter, r *http.Request) error {
	_, sec, err := s.section(r)
	if err != nil {
		return err
	}
	var body sectionBody
	if err := readJSON(r, &body); err != nil {
		return err
	}
	k, _ := kinds.Get(sec.Kind)
	if k.Key == "custom" && body.Valuation == "" {
		body.Valuation, body.Rate, body.Fields = sec.Valuation, sec.Rate, sec.Fields
		body.ValueField, body.CostField, body.DateField = sec.ValueField, sec.CostField, sec.DateField
	}
	if err := applySection(sec, body, k); err != nil {
		return err
	}
	if err := s.store.UpdateSection(r.Context(), sec); err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, sec)
	return nil
}

func (s *Server) deleteSection(w http.ResponseWriter, r *http.Request) error {
	_, sec, err := s.section(r)
	if err != nil {
		return err
	}
	if err := s.store.DeleteSection(r.Context(), sec.ID); err != nil {
		return err
	}
	return ok(w)
}

func (s *Server) rows(w http.ResponseWriter, r *http.Request) error {
	_, sec, err := s.section(r)
	if err != nil {
		return err
	}
	rows, err := s.store.Rows(r.Context(), sec.ID)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, rows)
	return nil
}

// cleanRow keeps only the section's own fields, so a pasted sheet cannot smuggle in extra columns.
func cleanRow(sec *store.Section, data map[string]any) (map[string]any, error) {
	out := map[string]any{}
	for _, f := range sec.Fields {
		v, present := data[f.Key]
		if !present || v == nil {
			if f.Required {
				return nil, fail(http.StatusBadRequest, "%s is required", f.Label)
			}
			continue
		}
		switch t := v.(type) {
		case string:
			t = strings.TrimSpace(t)
			if len(t) > 500 {
				return nil, fail(http.StatusBadRequest, "%s is too long", f.Label)
			}
			if t == "" {
				if f.Required {
					return nil, fail(http.StatusBadRequest, "%s is required", f.Label)
				}
				continue
			}
			if f.Type == "date" {
				d, ok := value.Date(t)
				if !ok {
					return nil, fail(http.StatusBadRequest, "%s %q isn't a date I can read; use 2025-04-01 or 01-Apr-2025", f.Label, t)
				}
				t = d.Format("2006-01-02")
			}
			out[f.Key] = t
		case float64, bool:
			out[f.Key] = t
		default:
			return nil, fail(http.StatusBadRequest, "%s should be text or a number", f.Label)
		}
	}
	if len(out) == 0 {
		return nil, fail(http.StatusBadRequest, "that row is empty")
	}
	return out, nil
}

func (s *Server) addRow(w http.ResponseWriter, r *http.Request) error {
	_, sec, err := s.section(r)
	if err != nil {
		return err
	}
	var data map[string]any
	if err := readJSON(r, &data); err != nil {
		return err
	}
	row, err := cleanRow(sec, data)
	if err != nil {
		return err
	}
	added, err := s.store.AddRow(r.Context(), sec.ID, row)
	if err != nil {
		return err
	}
	if !added {
		return fail(http.StatusConflict, "that exact row is already there")
	}
	if err := s.app.RebuildHoldings(r.Context(), sec); err != nil {
		return err
	}
	writeJSON(w, http.StatusCreated, map[string]bool{"added": true})
	return nil
}

func (s *Server) updateRow(w http.ResponseWriter, r *http.Request) error {
	_, sec, err := s.section(r)
	if err != nil {
		return err
	}
	var data map[string]any
	if err := readJSON(r, &data); err != nil {
		return err
	}
	row, err := cleanRow(sec, data)
	if err != nil {
		return err
	}
	rid := r.PathValue("rid")
	if !uuidPattern.MatchString(rid) {
		return fail(http.StatusNotFound, "no such row")
	}
	err = s.store.UpdateRow(r.Context(), sec.ID, rid, row)
	if errors.Is(err, store.ErrNotFound) {
		return fail(http.StatusNotFound, "no such row")
	}
	if errors.Is(err, store.ErrConflict) {
		return fail(http.StatusConflict, "that exact row is already there")
	}
	if err != nil {
		return err
	}
	if err := s.app.RebuildHoldings(r.Context(), sec); err != nil {
		return err
	}
	return ok(w)
}

func (s *Server) deleteRow(w http.ResponseWriter, r *http.Request) error {
	_, sec, err := s.section(r)
	if err != nil {
		return err
	}
	rid := r.PathValue("rid")
	if !uuidPattern.MatchString(rid) {
		return fail(http.StatusNotFound, "no such row")
	}
	if err := s.store.DeleteRow(r.Context(), sec.ID, rid); err != nil {
		return err
	}
	if err := s.app.RebuildHoldings(r.Context(), sec); err != nil {
		return err
	}
	return ok(w)
}

func (s *Server) holdings(w http.ResponseWriter, r *http.Request) error {
	_, sec, err := s.section(r)
	if err != nil {
		return err
	}
	hs, err := s.store.Holdings(r.Context(), sec.ID)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, hs)
	return nil
}

const maxImportBody = 16 << 20

func (s *Server) importRows(w http.ResponseWriter, r *http.Request) error {
	u, sec, err := s.section(r)
	if err != nil {
		return err
	}
	var body struct {
		Source  string           `json:"source"`
		Rows    []map[string]any `json:"rows"`
		Replace bool             `json:"replace"`
		Basis   string           `json:"basis"`
	}
	if err := readJSONUpTo(r, &body, maxImportBody); err != nil {
		return err
	}
	if len(body.Rows) == 0 {
		return fail(http.StatusBadRequest, "there's nothing to import")
	}
	if body.Basis != "" && body.Basis != store.BasisOpening && body.Basis != store.BasisSnapshot {
		return fail(http.StatusBadRequest, "unknown basis %q", body.Basis)
	}
	if len(body.Rows) > 50000 {
		return fail(http.StatusBadRequest, "import at most 50,000 rows at a time")
	}
	rows := make([]map[string]any, 0, len(body.Rows))
	for i, data := range body.Rows {
		row, err := cleanRow(sec, data)
		if err != nil {
			var ae *apiError
			if errors.As(err, &ae) {
				return fail(ae.status, "row %d: %s", i+1, ae.message)
			}
			return err
		}
		rows = append(rows, row)
	}
	source := strings.TrimSpace(body.Source)
	if source == "" {
		source = "Pasted CSV"
	}
	imp, err := s.store.Import(r.Context(), sec.ID, store.ImportBatch{Source: source[:min(len(source), 120)], UserID: u.ID, Rows: rows, Replace: body.Replace, Basis: body.Basis})
	if err != nil {
		return err
	}
	if err := s.app.RebuildHoldings(r.Context(), sec); err != nil {
		return err
	}
	s.app.AfterImport()
	imp.SectionName = sec.Name
	writeJSON(w, http.StatusCreated, imp)
	return nil
}

func (s *Server) imports(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	is, err := s.store.Imports(r.Context(), p.ID, 50)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, is)
	return nil
}

func (s *Server) templates(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	ts, err := s.store.Templates(r.Context(), p.ID)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, ts)
	return nil
}

func (s *Server) saveTemplate(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	var t store.Template
	if err := readJSONUpTo(r, &t, 256<<10); err != nil {
		return err
	}
	t.Name = strings.TrimSpace(t.Name)
	if t.Name == "" || len(t.Name) > 80 {
		return fail(http.StatusBadRequest, "name the template, in up to 80 characters")
	}
	if _, found := kinds.Get(t.Kind); !found && t.Kind != kinds.Expenses && t.Kind != kinds.Cards {
		return fail(http.StatusBadRequest, "unknown kind %q", t.Kind)
	}
	if len(t.Payload) == 0 {
		return fail(http.StatusBadRequest, "the template is empty")
	}
	if err := s.store.SaveTemplate(r.Context(), p.ID, t); err != nil {
		return err
	}
	return ok(w)
}

func (s *Server) deleteTemplate(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	id := r.PathValue("id")
	if !uuidPattern.MatchString(id) {
		return fail(http.StatusNotFound, "no such template")
	}
	if err := s.store.DeleteTemplate(r.Context(), p.ID, id); err != nil {
		return err
	}
	return ok(w)
}
