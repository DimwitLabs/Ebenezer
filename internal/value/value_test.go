package value

import (
	"math"
	"testing"
	"time"

	"github.com/DimwitLabs/ebenezer/internal/kinds"
)

func day(s string) time.Time {
	t, _ := time.Parse("2006-01-02", s)
	return t
}

func near(t *testing.T, got, want, tol float64) {
	t.Helper()
	if math.Abs(got-want) > tol {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestXIRRDoubleInOneYear(t *testing.T) {
	x, ok := XIRR([]Flow{{day("2025-01-01"), -100}, {day("2026-01-01"), 200}})
	if !ok {
		t.Fatal("no rate")
	}
	near(t, x, 1.0, 1e-6)
}

func TestXIRRMatchesSpreadsheet(t *testing.T) {
	flows := []Flow{
		{day("2008-01-01"), -10000},
		{day("2008-03-01"), 2750},
		{day("2008-10-30"), 4250},
		{day("2009-02-15"), 3250},
		{day("2009-04-01"), 2750},
	}
	x, ok := XIRR(flows)
	if !ok {
		t.Fatal("no rate")
	}
	near(t, x, 0.373362535, 1e-6)
}

func TestXIRRLoss(t *testing.T) {
	x, ok := XIRR([]Flow{{day("2025-01-01"), -100}, {day("2026-01-01"), 10}})
	if !ok {
		t.Fatal("no rate")
	}
	near(t, x, -0.9, 1e-6)
}

func TestXIRRNeedsBothSigns(t *testing.T) {
	if _, ok := XIRR([]Flow{{day("2025-01-01"), -100}, {day("2026-01-01"), -10}}); ok {
		t.Fatal("expected no rate")
	}
}

func TestNumber(t *testing.T) {
	cases := map[string]float64{"1,23,456.50": 123456.5, "₹ 1,000": 1000, "(250)": -250, "7.1%": 7.1}
	for in, want := range cases {
		got, ok := Number(in)
		if !ok || got != want {
			t.Errorf("%q: got %v %v", in, got, ok)
		}
	}
	if _, ok := Number("abc"); ok {
		t.Error("abc parsed")
	}
}

func TestDate(t *testing.T) {
	for _, s := range []string{"2025-04-01", "01-Apr-2025", "01/04/2025", "1 Apr 2025"} {
		d, ok := Date(s)
		if !ok || !d.Equal(day("2025-04-01")) {
			t.Errorf("%q: got %v %v", s, d, ok)
		}
	}
}

func TestDepositQuarterly(t *testing.T) {
	v := Deposit(100000, 7, "Quarterly", day("2025-01-01"), day("2026-01-01"))
	near(t, v, 107185.9, 1)
}

func TestStocksSection(t *testing.T) {
	sec := Section{Kind: "stocks", Valuation: "market", Counts: true,
		Rows: []map[string]any{
			{"date": "2025-01-01", "isin": "INE002A01018", "action": "Buy", "quantity": "10", "price": "100", "charges": "0"},
		},
		Holdings: []Holding{{Key: "INE002A01018", ISIN: "INE002A01018", Name: "Reliance Industries", Quantity: 10, Cost: 1000}},
	}
	env := Env{Today: day("2026-01-01"), Prices: Prices{"INE002A01018": 150}}
	r := Value(sec, env)
	near(t, r.Value, 1500, 1e-9)
	if r.Positions[0].XIRR == nil {
		t.Fatal("no position xirr")
	}
	near(t, *r.Positions[0].XIRR, 0.5, 1e-6)
}

func TestUnpricedFallsBackToCost(t *testing.T) {
	sec := Section{Kind: "funds", Valuation: "nav", Holdings: []Holding{{Key: "X", ISIN: "INF000000000", Quantity: 5, Cost: 500}}}
	r := Value(sec, Env{Today: day("2026-01-01"), Prices: Prices{}})
	if r.Value != 500 || r.Unpriced != 1 || !r.Positions[0].Stale {
		t.Fatalf("got %+v", r)
	}
}

func TestSummaryWealthAndBenchmark(t *testing.T) {
	sections := []Section{
		{Kind: "stocks", Valuation: "market", Counts: true,
			Rows:     []map[string]any{{"date": "2025-01-01", "isin": "A", "action": "Buy", "quantity": 1.0, "price": 100.0}},
			Holdings: []Holding{{Key: "A", ISIN: "A", Quantity: 1, Cost: 100}}},
		{Kind: "savings", Valuation: "balance", ValueField: "balance", Counts: true,
			Rows: []map[string]any{{"account": "HDFC", "balance": "5000"}}},
		{Kind: "loans", Valuation: "liability", ValueField: "outstanding", Counts: true,
			Rows: []map[string]any{{"lender": "SBI", "outstanding": "1000"}}},
	}
	env := Env{Today: day("2026-01-01"), Prices: Prices{"A": 120}}
	series := Series{{day("2025-01-01"), 1000}, {day("2026-01-01"), 1100}}
	sum := Summarise(sections, env, Options{Inflation: 5.5, XIRRMinDays: 90, Benchmark: series})
	near(t, sum.NetWorth, 120+5000-1000, 1e-9)
	near(t, sum.Assets, 5120, 1e-9)
	near(t, sum.Liabilities, 1000, 1e-9)
	if sum.Stocks.XIRR == nil || sum.Stocks.Benchmark == nil {
		t.Fatalf("missing returns %+v", sum.Stocks)
	}
	near(t, *sum.Stocks.XIRR, 0.2, 1e-4)
	near(t, *sum.Stocks.Benchmark, 0.1, 1e-4)
}

func TestXIRRWaitsForMinDays(t *testing.T) {
	r := returns([]Flow{{day("2026-01-01"), -100}}, 110, day("2026-02-01"), Options{XIRRMinDays: 90})
	if r.Eligible || r.XIRR != nil || r.Days != 31 {
		t.Fatalf("got %+v", r)
	}
}

func TestHoldingsFirstInFirstOut(t *testing.T) {
	hs := Holdings("stocks", []map[string]any{
		{"date": "2025-01-01", "symbol": "itc", "action": "Buy", "quantity": "10", "price": "100"},
		{"date": "2025-02-01", "symbol": "ITC", "action": "Buy", "quantity": "10", "price": "200"},
		{"date": "2025-03-01", "symbol": "ITC", "action": "Sell", "quantity": "5", "price": "300"},
	})
	if len(hs) != 1 {
		t.Fatalf("got %+v", hs)
	}
	h := hs[0]
	near(t, h.Quantity, 15, 1e-9)
	near(t, h.Cost, 2500, 1e-9)
	near(t, h.Realised, 1000, 1e-9)
}

func TestHoldingsFundsByUnits(t *testing.T) {
	hs := Holdings("funds", []map[string]any{
		{"date": "2025-01-01", "scheme": "PPFAS Flexi", "isin": "INF879O01027", "action": "Purchase", "amount": "1000", "units": "10"},
		{"date": "2025-06-01", "scheme": "PPFAS Flexi", "isin": "INF879O01027", "action": "Redemption", "amount": "600", "units": "-5"},
	})
	near(t, hs[0].Quantity, 5, 1e-9)
	near(t, hs[0].Cost, 500, 1e-9)
	near(t, hs[0].Realised, 100, 1e-9)
}

func TestHoldingsAndFlowsAgreeOnSales(t *testing.T) {
	cases := []struct {
		kind string
		row  map[string]any
		sale bool
	}{
		{"stocks", map[string]any{"action": "Sell", "quantity": 5}, true},
		{"stocks", map[string]any{"action": "Buy", "quantity": -5}, true},
		{"stocks", map[string]any{"action": "Split", "quantity": 5}, false},
		{"funds", map[string]any{"action": "Switch-out", "units": 2}, true},
		{"funds", map[string]any{"action": "Purchase", "units": -2}, true},
		{"funds", map[string]any{"action": "SIP", "units": 2}, false},
	}
	for _, c := range cases {
		if got := IsSale(c.kind, c.row); got != c.sale {
			t.Errorf("IsSale(%s, %v) = %v", c.kind, c.row, got)
		}
		row := map[string]any{"date": "2024-01-01", "symbol": "X", "scheme": "X", "price": 10, "amount": 20}
		for k, v := range c.row {
			row[k] = v
		}
		_, f, _ := TradeFlow(c.kind, row)
		if (f.Amount > 0) != c.sale {
			t.Errorf("TradeFlow(%s, %v) amount %v", c.kind, c.row, f.Amount)
		}
	}
}

func TestGoldETFMovesToGold(t *testing.T) {
	stocks := Section{ID: "s", Kind: "stocks", Valuation: "market", Counts: true,
		Rows: []map[string]any{
			{"date": "2025-01-01", "isin": "INE002A01018", "action": "Buy", "quantity": 10, "price": 100},
			{"date": "2025-01-01", "isin": "INF204KB17I5", "action": "Buy", "quantity": 100, "price": 50},
		},
		Holdings: []Holding{
			{Key: "INE002A01018", ISIN: "INE002A01018", Name: "Reliance Industries", Quantity: 10, Cost: 1000},
			{Key: "INF204KB17I5", ISIN: "INF204KB17I5", Name: "Nippon India ETF Gold BeES", Quantity: 100, Cost: 5000},
		},
	}
	gold := Section{ID: "g", Kind: "gold", Valuation: "gold", Counts: true, CostField: "cost", DateField: "bought_on",
		Rows: []map[string]any{{"item": "Coin", "grams": 10, "metal": "Gold 22K", "bought_on": "2025-01-01", "cost": 100000}}}
	env := Env{Today: day("2026-01-01"), Prices: Prices{"INE002A01018": 150, "INF204KB17I5": 60}, GoldPerGram: 12000}
	sum := Summarise([]Section{stocks, gold}, env, Options{Moves: map[string]string{"INF204KB17I5": "g"}})
	s, g := sum.Sections[0], sum.Sections[1]
	near(t, s.Value, 1500, 1e-9)
	near(t, g.Value, 110000+6000, 1e-6)
	if len(s.Positions) != 1 || len(g.Positions) != 2 || g.Positions[1].From != "s" || !g.Positions[1].Bullion {
		t.Fatalf("positions: stocks %+v gold %+v", s.Positions, g.Positions)
	}
	near(t, *sum.Stocks.XIRR, 0.5, 1e-6)
	if s.Returns.XIRR == nil || g.Returns.XIRR == nil {
		t.Fatal("each section needs its own XIRR")
	}
}

func TestNeverSold(t *testing.T) {
	rows := []map[string]any{
		{"date": "2025-01-01", "isin": "INE002A01018", "action": "Buy", "quantity": 10, "price": 100},
		{"date": "2025-06-01", "isin": "INE002A01018", "action": "Sell", "quantity": 10, "price": 110},
		{"date": "2025-01-01", "isin": "INE000000000", "action": "Buy", "quantity": 5, "price": 100},
	}
	cf := NeverSold("stocks", rows, Prices{"INE002A01018": 200}, day("2026-01-01"))
	near(t, cf.Value, 2000, 1e-9)
	near(t, cf.Invested, 1000, 1e-9)
	near(t, *cf.XIRR, 1, 1e-6)
}

func TestRecurringDeposit(t *testing.T) {
	sec := Section{Kind: "deposits", Valuation: "deposit", Rows: []map[string]any{
		{"bank": "SBI", "type": "Recurring", "amount": "5000", "rate": "7", "start": "2025-01-01", "maturity": "2026-01-01"},
	}}
	matured := Value(sec, Env{Today: day("2026-03-01")})
	// Twelve instalments of ₹5,000 at 7% compounded quarterly mature at about ₹62,300, as bank calculators say.
	if matured.Invested != 60000 || matured.Value < 62100 || matured.Value > 62500 {
		t.Fatalf("matured RD: invested %.0f, value %.0f", matured.Invested, matured.Value)
	}
	if got := Value(sec, Env{Today: day("2025-06-15")}); got.Invested != 30000 {
		t.Errorf("by mid-June six instalments are in, not %.0f", got.Invested/5000)
	}
	fixed := Value(Section{Kind: "deposits", Valuation: "deposit", Rows: []map[string]any{
		{"bank": "SBI", "amount": "100000", "rate": "7", "start": "2025-01-01", "maturity": "2026-01-01"},
	}}, Env{Today: day("2026-01-01")})
	if fixed.Invested != 100000 || len(fixed.Flows) != 1 {
		t.Errorf("a row without a type is still a fixed deposit: %+v", fixed)
	}
}

func TestDepositStandingInstructions(t *testing.T) {
	fd := func(instruction string) Result {
		return Value(Section{Kind: "deposits", Valuation: "deposit", Rows: []map[string]any{
			{"bank": "SBI", "amount": "100000", "rate": "8", "compounding": "Yearly", "start": "2023-01-01", "maturity": "2024-01-01", "on_maturity": instruction},
		}}, Env{Today: day("2025-01-01")})
	}
	held := fd("")
	if math.Abs(held.Value-108000) > 50 {
		t.Errorf("with no instruction a matured deposit stops at its maturity value, got %.0f", held.Value)
	}
	paid := fd("Credit to account")
	if paid.Value != 0 || paid.Invested != 0 || len(paid.Flows) != 2 || paid.Flows[1].Amount < 107900 {
		t.Errorf("paid out: %+v", paid)
	}
	renewed := fd("Reinvest")
	if math.Abs(renewed.Value-116640) > 100 {
		t.Errorf("reinvested for a second year should be about 1,16,640, got %.0f", renewed.Value)
	}
	split := fd("Reinvest principal, credit interest")
	// On 1 Jan 2025 the second year has just ended too, so two years of interest have been paid out.
	if split.Value != 100000 || len(split.Flows) != 3 || math.Abs(split.Flows[2].Amount-8000) > 50 || !split.Flows[2].Date.Equal(day("2025-01-01")) {
		t.Errorf("principal reinvested, interest paid: value %.0f, flows %+v", split.Value, split.Flows)
	}
}

func TestSavingsInterest(t *testing.T) {
	sec := Section{Valuation: kinds.Balance, ValueField: "balance", DateField: "as_of", Rows: []map[string]any{
		{"account": "HDFC", "balance": "100000", "as_of": "2025-01-01", "rate": "4"},
		{"account": "Cash", "balance": "5000"},
	}}
	r := Value(sec, Env{Today: day("2026-01-01")})
	want := Deposit(100000, 4, "Quarterly", day("2025-01-01"), day("2026-01-01")) + 5000
	if math.Abs(r.Value-want) > 0.01 || r.Invested != 105000 {
		t.Fatalf("value %v invested %v, want %v and 105000", r.Value, r.Invested, want)
	}
}

func TestTradesAndFlowsReadARowAlike(t *testing.T) {
	cases := []struct {
		kind string
		row  map[string]any
		flow float64
	}{
		{"stocks", map[string]any{"date": "2025-01-01", "isin": "INE002A01018", "action": "Buy", "quantity": 10, "price": 100, "charges": 5}, -1005},
		{"stocks", map[string]any{"date": "2025-02-01", "isin": "INE002A01018", "action": "Sell", "quantity": 4, "price": 120, "charges": 5}, 475},
		{"funds", map[string]any{"date": "2025-01-01", "isin": "INF879O01027", "scheme": "PPFAS Flexi", "action": "Purchase", "amount": 1000, "units": 10}, -1000},
		{"funds", map[string]any{"date": "2025-02-01", "isin": "INF879O01027", "scheme": "PPFAS Flexi", "action": "Redemption", "amount": 600, "units": -5}, 600},
		{"funds", map[string]any{"date": "2025-03-01", "isin": "INF879O01027", "scheme": "PPFAS Flexi", "action": "Dividend Payout", "amount": 40}, 40},
	}
	for _, c := range cases {
		key, f, ok := TradeFlow(c.kind, c.row)
		if !ok {
			t.Fatalf("no flow for %v", c.row)
		}
		near(t, f.Amount, c.flow, 1e-9)
		tr, traded := ParseTrade(c.kind, c.row)
		payout := c.row["action"] == "Dividend Payout"
		if traded == payout {
			t.Fatalf("ParseTrade(%v) traded = %v", c.row, traded)
		}
		if !traded {
			continue
		}
		if tr.Key != key || !tr.Day.Equal(f.Date) || math.Abs(tr.Amount) != math.Abs(f.Amount) || tr.Sell != (f.Amount > 0) {
			t.Fatalf("trade %+v disagrees with flow %s %+v", tr, key, f)
		}
	}
}
