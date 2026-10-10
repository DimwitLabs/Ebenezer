package app

import (
	"strings"
	"time"

	"github.com/DimwitLabs/ebenezer/internal/store"
)

type CardState struct {
	store.Card
	LastStatement time.Time `json:"lastStatement"`
	NextStatement time.Time `json:"nextStatement"`
	Due           time.Time `json:"due"`
	Billed        float64   `json:"billed"`
	PaidOff       float64   `json:"paidOff"`
	Cycle         float64   `json:"cycle"`
	Owed          float64   `json:"owed"`
	Unpaid        float64   `json:"unpaid"`
	Peak          float64   `json:"peak"`
	Spends        int       `json:"spends"`
}

func (c CardState) unpaid() float64 { return max(0, c.Billed-c.PaidOff) }

// statementOn returns a month's statement date; months without the day, like 31 in February, close on their last day.
func statementOn(year int, month time.Month, day int) time.Time {
	last := time.Date(year, month+1, 0, 0, 0, 0, 0, time.UTC).Day()
	return time.Date(year, month, min(day, last), 0, 0, 0, 0, time.UTC)
}

func LastStatementOn(day int, today time.Time) time.Time {
	s := statementOn(today.Year(), today.Month(), day)
	if s.After(today) {
		s = statementOn(today.Year(), today.Month()-1, day)
	}
	return s
}

func nextStatement(after time.Time, day int) time.Time {
	s := statementOn(after.Year(), after.Month(), day)
	if !s.After(after) {
		s = statementOn(after.Year(), after.Month()+1, day)
	}
	return s
}

// StateOf works out where a card's statements stand; one Ebenezer did not see is assumed unpaid, so it carries into the next one until marked paid.
func StateOf(c store.Card, spends []store.Spend, today time.Time) CardState {
	key := "card:" + c.ID
	st := CardState{Card: c, LastStatement: c.StatementOn, Billed: c.StatementBalance, PaidOff: c.Paid}
	if c.StatementOn.Year() == today.Year() {
		st.Peak = c.StatementBalance
	}
	var mine []store.Spend
	for _, sp := range spends {
		if sp.PaidWith == key && sp.Day.After(c.StatementOn) {
			mine = append(mine, sp)
		}
	}
	cycle := c.SpentBefore
	for s := nextStatement(c.StatementOn, c.StatementDay); !s.After(today); s = nextStatement(s, c.StatementDay) {
		for _, sp := range mine {
			if sp.Day.After(st.LastStatement) && !sp.Day.After(s) {
				cycle += sp.Amount
			}
		}
		st.Billed = st.unpaid() + cycle
		st.PaidOff = 0
		st.LastStatement = s
		cycle = 0
		if s.Year() == today.Year() {
			st.Peak = max(st.Peak, st.Billed)
		}
	}
	for _, sp := range mine {
		if sp.Day.After(st.LastStatement) {
			cycle += sp.Amount
			st.Spends++
		}
	}
	st.Cycle = cycle
	st.Unpaid = st.unpaid()
	st.Owed = st.Unpaid + st.Cycle
	st.NextStatement = nextStatement(st.LastStatement, c.StatementDay)
	st.Due = st.LastStatement.AddDate(0, 0, c.DueDays)
	return st
}

// MarkPaid marks the latest statement paid, which clears everything before it too, as the statement carried it.
func MarkPaid(st CardState) store.Card {
	c := st.Card
	if !st.LastStatement.Equal(c.StatementOn) {
		c.SpentBefore = 0
	}
	c.StatementOn, c.StatementBalance, c.Paid = st.LastStatement, st.Billed, st.Billed
	return c
}

func NetworkOf(name string) string {
	n := strings.ToLower(strings.TrimSpace(name))
	for _, k := range []string{"visa", "mastercard", "amex", "rupay", "diners"} {
		if n == k {
			return k
		}
	}
	return "other"
}
