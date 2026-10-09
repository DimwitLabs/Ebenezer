package value

import (
	"strings"
	"time"

	"github.com/DimwitLabs/ebenezer/internal/kinds"
)

type Renewal struct {
	Policy  string  `json:"policy"`
	Day     string  `json:"day"`
	Premium float64 `json:"premium"`
}

type Protection struct {
	Policies int      `json:"policies"`
	Life     float64  `json:"life"`
	LifeN    int      `json:"lifeN"`
	Health   float64  `json:"health"`
	HealthN  int      `json:"healthN"`
	Premiums float64  `json:"premiums"`
	Next     *Renewal `json:"next"`
}

var perYear = map[string]float64{"monthly": 12, "quarterly": 4, "half-yearly": 2, "yearly": 1}

var months = map[string]int{"monthly": 1, "quarterly": 3, "half-yearly": 6, "yearly": 12}

// NextDue rolls a due date forward to the next renewal; a date still past after rolling forward, as for a single premium, has none ahead.
func NextDue(v any, pays string, today time.Time) (time.Time, bool) {
	due, ok := Date(v)
	if !ok {
		return time.Time{}, false
	}
	for step := months[pays]; step > 0 && due.Before(today); {
		due = due.AddDate(0, step, 0)
	}
	return due, !due.Before(today)
}

func protect(sections []Section, today time.Time) *Protection {
	var p Protection
	for _, sec := range sections {
		if sec.Valuation != kinds.Cover {
			continue
		}
		for _, row := range sec.Rows {
			if end, ok := Date(row["ends_on"]); ok && end.Before(today) {
				continue
			}
			p.Policies++
			cover, _ := Number(row["cover"])
			switch Text(row["type"]) {
			case "Term life", "Life with savings":
				p.Life += cover
				p.LifeN++
			case "Health":
				p.Health += cover
				p.HealthN++
			}
			pays := strings.ToLower(Text(row["pays"]))
			premium, _ := Number(row["premium"])
			p.Premiums += premium * perYear[pays]
			due, ok := NextDue(row["renews_on"], pays, today)
			if !ok {
				continue
			}
			if p.Next == nil || due.Format("2006-01-02") < p.Next.Day {
				p.Next = &Renewal{Policy: Text(row["policy"]), Day: due.Format("2006-01-02"), Premium: premium}
			}
		}
	}
	if p.Policies == 0 {
		return nil
	}
	return &p
}
