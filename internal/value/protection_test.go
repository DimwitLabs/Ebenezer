package value

import (
	"testing"
	"time"
)

func TestProtection(t *testing.T) {
	today := time.Date(2026, 10, 7, 0, 0, 0, 0, time.UTC)
	sec := Section{Kind: "insurance", Valuation: "cover", Rows: []map[string]any{
		{"policy": "Term", "type": "Term life", "cover": "15000000", "premium": "18200", "pays": "Yearly", "renews_on": "2024-03-03"},
		{"policy": "Family floater", "type": "Health", "cover": "2000000", "premium": "1800", "pays": "Monthly", "renews_on": "2026-09-12"},
		{"policy": "Old car", "type": "Vehicle", "cover": "500000", "premium": "5000", "pays": "Yearly", "ends_on": "2025-01-01"},
		{"policy": "Endowment", "type": "Life with savings", "cover": "1000000", "premium": "50000", "pays": "Once"},
	}}
	p := protect([]Section{{Kind: "savings", Valuation: "balance"}, sec}, today)
	if p == nil || p.Policies != 3 || p.Life != 16000000 || p.LifeN != 2 || p.Health != 2000000 || p.HealthN != 1 {
		t.Fatalf("totals: %+v", p)
	}
	if p.Premiums != 18200+1800*12 {
		t.Errorf("premiums %v", p.Premiums)
	}
	if p.Next == nil || p.Next.Policy != "Family floater" || p.Next.Day != "2026-10-12" {
		t.Errorf("next %+v", p.Next)
	}
	if protect([]Section{{Kind: "savings", Valuation: "balance"}}, today) != nil {
		t.Error("no insurance should mean no protection")
	}
}
