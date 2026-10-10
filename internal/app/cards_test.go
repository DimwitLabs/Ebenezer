package app

import (
	"math"
	"testing"
	"time"

	"github.com/DimwitLabs/ebenezer/internal/store"
)

func day(s string) time.Time {
	d, err := time.Parse(time.DateOnly, s)
	if err != nil {
		panic(err)
	}
	return d
}

func spend(on string, amount float64, paid string) store.Spend {
	return store.Spend{Day: day(on), Amount: amount, PaidWith: paid}
}

func near(t *testing.T, name string, got, want float64) {
	t.Helper()
	if math.Abs(got-want) > 1e-6 {
		t.Errorf("%s = %v, want %v", name, got, want)
	}
}

func TestStateWithinFirstCycle(t *testing.T) {
	c := store.Card{ID: "c", StatementDay: 17, DueDays: 20, StatementOn: day("2026-09-17"), StatementBalance: 22410, Paid: 10000, SpentBefore: 1000}
	st := StateOf(c, []store.Spend{spend("2026-09-17", 50, "card:c"), spend("2026-09-20", 500, "card:c"), spend("2026-09-21", 70, "card:x")}, day("2026-10-11"))
	near(t, "billed", st.Billed, 22410)
	near(t, "unpaid", st.Unpaid, 12410)
	near(t, "cycle", st.Cycle, 1500)
	near(t, "owed", st.Owed, 13910)
	if !st.Due.Equal(day("2026-10-07")) || !st.NextStatement.Equal(day("2026-10-17")) {
		t.Errorf("due %v next %v", st.Due, st.NextStatement)
	}
}

func TestStatementsCarryUntilPaid(t *testing.T) {
	c := store.Card{ID: "c", StatementDay: 31, DueDays: 15, StatementOn: day("2026-08-31"), StatementBalance: 100, Paid: 100}
	spends := []store.Spend{spend("2026-09-05", 200, "card:c"), spend("2026-09-30", 50, "card:c"), spend("2026-10-01", 30, "card:c"), spend("2026-10-02", -10, "card:c")}
	st := StateOf(c, spends, day("2026-10-11"))
	if !st.LastStatement.Equal(day("2026-09-30")) {
		t.Fatalf("last statement %v, want 30 Sep", st.LastStatement)
	}
	near(t, "billed", st.Billed, 250)
	near(t, "cycle", st.Cycle, 20)
	near(t, "owed", st.Owed, 270)
	paid := MarkPaid(st)
	again := StateOf(paid, spends, day("2026-10-11"))
	near(t, "owed after paying", again.Owed, 20)
	later := StateOf(paid, spends, day("2026-11-05"))
	near(t, "next statement", later.Billed, 20)
	near(t, "peak", later.Peak, 250)
}
