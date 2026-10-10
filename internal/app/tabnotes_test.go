package app

import (
	"reflect"
	"regexp"
	"strings"
	"testing"

	"github.com/DimwitLabs/ebenezer/internal/store"
	"github.com/DimwitLabs/ebenezer/internal/value"
)

var verbs = regexp.MustCompile(`%[sd]`)

// TestTabbookTonesMatch checks every tone's placeholders match, as mismatched ones would print %!s(MISSING).
func TestTabbookTonesMatch(t *testing.T) {
	dry := reflect.ValueOf(tabbook["dry"])
	for tone, ph := range tabbook {
		v := reflect.ValueOf(ph)
		for i := 0; i < v.NumField(); i++ {
			name := v.Type().Field(i).Name
			got, want := v.Field(i).String(), dry.Field(i).String()
			if got == "" {
				t.Errorf("%s.%s is empty", tone, name)
			}
			if a, b := strings.Join(verbs.FindAllString(got, -1), ""), strings.Join(verbs.FindAllString(want, -1), ""); a != b {
				t.Errorf("%s.%s has placeholders %q, dry has %q", tone, name, a, b)
			}
		}
	}
	for tone := range Tones {
		if _, ok := tabbook[tone]; !ok {
			t.Errorf("no tab phrases for tone %q", tone)
		}
	}
}

func TestSectionNotes(t *testing.T) {
	ps := []value.Position{
		{Name: "ITC LTD", Value: 30000, Invested: 45000, Group: "FMCG"},
		{Name: "INFOSYS LTD", Value: 20000, Invested: 15000, Group: "IT"},
		{Name: "TCS", Value: 15000, Invested: 12000, Group: "IT", Stale: true},
	}
	lines := sectionNotes("stocks", "Stocks", ps, tabbook["dry"])
	got := make([]string, len(lines))
	for i, l := range lines {
		got[i] = l.Text
	}
	want := []string{
		"IT is the biggest at 54%, across 2 sectors.",
		"ITC Ltd is 46% of your stocks.",
		"Infosys Ltd has grown most, +33.3%.",
		"ITC Ltd is down (33.3%).",
		"1 has no price yet, so I counted it at cost.",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("notes =\n%q\nwant\n%q", got, want)
	}
}

func TestSectionNotesNeverCallALossGrowth(t *testing.T) {
	ps := []value.Position{{Name: "A", Value: 80, Invested: 100}, {Name: "B", Value: 50, Invested: 100}}
	for _, l := range sectionNotes("stocks", "Stocks", ps, tabbook["dry"]) {
		if strings.Contains(l.Text, "grown") {
			t.Fatalf("a loss read as growth: %q", l.Text)
		}
	}
}

func TestOverviewNotesOpenSections(t *testing.T) {
	xa, xb := 0.2, -0.1
	sum := &PortfolioSummary{
		Summary: value.Summary{Assets: 100, Sections: []value.Result{
			{Value: 60, Positions: []value.Position{{Name: "A", Value: 60}}, Returns: value.Returns{XIRR: &xa, Eligible: true}},
			{Value: 40, Returns: value.Returns{XIRR: &xb, Eligible: true}},
		}},
		Sections: []store.Section{{ID: "s1", Name: "Stocks", Kind: "stocks", Valuation: "market", Counts: true}, {ID: "s2", Name: "Savings", Kind: "savings", Valuation: "balance", Counts: true}},
	}
	notes := (&App{}).TabNotes(sum, "blunt")
	ov := notes["overview"].Lines
	if len(ov) < 2 || ov[0].Section != "s1" || ov[1].Section != "s2" || ov[0].Text != "Best: Stocks, +20.0% a year." {
		t.Fatalf("overview = %+v", ov)
	}
	if len(notes["s2"].Lines) != 0 || notes["s2"].Quiet != tabbook["blunt"].quiet {
		t.Fatalf("empty section note = %+v", notes["s2"])
	}
}

func TestCoverNotesUseTheirNumbers(t *testing.T) {
	sum := &PortfolioSummary{
		Summary: value.Summary{Assets: 631000, Liabilities: 300000, Protection: &value.Protection{Life: 1e7, LifeN: 1},
			Sections: []value.Result{{Value: 125000}, {Value: 200000}, {}}},
		Sections: []store.Section{{ID: "a", Kind: "savings", Counts: true}, {ID: "b", Kind: "deposits", Counts: true}, {ID: "c", Kind: "insurance", Valuation: "cover"}},
		policies: []map[string]any{{"policy": "Click 2 Protect", "type": "Term life", "cover": "10000000"}},
	}
	got := []string{}
	for _, l := range coverNotes(sum, tabbook["dry"]) {
		got = append(got, l.Text)
	}
	want := []string{
		"No health cover is listed, so a hospital bill would come out of your ₹3.25 L in savings and deposits.",
		"Your ₹1.00 Cr of life cover clears what you owe 33× over and leaves ₹97.00 L for your family.",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("notes =\n%q\nwant\n%q", got, want)
	}
}
