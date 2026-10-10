package app

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/DimwitLabs/ebenezer/internal/openrouter"
)

const testLedger = `Section "Stocks" (stocks): value ₹69,366, put in ₹1.10 L, XIRR (25.8%) a year, against (3.3%) for the same money in Nifty 50, over 646 days.
  Reliance Industries Ltd: XIRR (10.9%).
  ITC Ltd: value ₹26,600, cost ₹45,020, XIRR (25.7%); loss ₹18,420, 40.9%, 38.3% of the section, FMCG.
  Parag Parikh Flexi Cap Fund - Direct Plan - Growth: value ₹61,359.`

func TestFaithful(t *testing.T) {
	for said, want := range map[string]bool{
		"Your stocks are falling 25.8% a year while Nifty 50 lost only 3.3%.": true,
		"ITC Ltd alone is 38.3% of the section, down ₹18,420.":                true,
		"Two of your 4 holdings are in FMCG.":                                 false,
		"Stocks are falling about 26% a year.":                                false,
		"ITC Ltd is down ₹18,000.":                                            false,
		"Your stocks trail the index by 22.5 points.":                         false,
		"Your biggest holding, [PERSON_NAME], is worth ₹61,359.":              false,
		"Parag Parikh Flexi Cap Fund is worth ₹61,359, more than Infosys.":    false,
		"Had nothing been sold, it would be ₹10.9k more.":                     false,
		"ITC Ltd is worth ₹26,600 and the section ₹1.10 lakh put in.":         true,
		"Even so, ITC Ltd is worth ₹26,600.":                                  true,
	} {
		if got := faithful(said, testLedger); got != want {
			t.Errorf("faithful(%q) = %v, want %v", said, got, want)
		}
	}
}

func fakeModel(t *testing.T, lines []map[string]any) openrouter.Client {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		content, _ := json.Marshal(map[string]any{"lines": lines})
		_ = json.NewEncoder(w).Encode(map[string]any{"choices": []map[string]any{{"message": map[string]any{"content": string(content)}}}})
	}))
	t.Cleanup(srv.Close)
	return openrouter.Client{HTTP: srv.Client(), URL: srv.URL, Key: "test"}
}

func TestWriteNoteKeepsOnlyFaithfulLines(t *testing.T) {
	c := fakeModel(t, []map[string]any{
		{"text": "Your stocks are falling 25.8% a year, against 3.3% for Nifty 50.", "about": "Stocks"},
		{"text": "That is roughly 22 points behind.", "about": "Stocks"},
		{"text": "ITC Ltd is 38.3% of the section and down ₹18,420.", "about": "Stocks"},
	})
	w, err := writeNote(context.Background(), c, "m", "You are Ebenezer.", "", slice{"s1", testLedger, "focus"})
	if err != nil {
		t.Fatal(err)
	}
	if w.Failed || len(w.Lines) != 2 || w.Lines[1].Text != "ITC Ltd is 38.3% of the section and down ₹18,420." {
		t.Fatalf("written = %+v", w)
	}
}

func TestWriteNoteThatKeepsNothingFails(t *testing.T) {
	c := fakeModel(t, []map[string]any{{"text": "Stocks are down about a quarter, 25% a year."}})
	w, err := writeNote(context.Background(), c, "m", "You are Ebenezer.", "", slice{"s1", testLedger, "focus"})
	if err != nil {
		t.Fatal(err)
	}
	if !w.Failed {
		t.Fatalf("an unfaithful note was kept: %+v", w)
	}
	c = fakeModel(t, []map[string]any{})
	if w, _ := writeNote(context.Background(), c, "m", "p", "", slice{"s1", testLedger, "f"}); w.Failed {
		t.Fatalf("a quiet section failed: %+v", w)
	}
	if w, _ := writeNote(context.Background(), c, "m", "p", "", slice{"today", testLedger, "f"}); !w.Failed {
		t.Fatalf("an empty Today note was kept: %+v", w)
	}
}
