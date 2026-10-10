package app

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/DimwitLabs/ebenezer/internal/kinds"
	"github.com/DimwitLabs/ebenezer/internal/store"
	"github.com/DimwitLabs/ebenezer/internal/value"
)

// Ask reads the whole ledger; notes read slices built from the same pieces, so a section reads the same wherever it is sent.

func (a *App) Ledger(ctx context.Context, p *store.Portfolio) (string, error) {
	sum, err := a.Summary(ctx, p)
	if err != nil {
		return "", err
	}
	items, err := a.Store.News(ctx, p.ID, time.Now().AddDate(0, 0, -max(1, p.Settings.News.WindowDays)), 100)
	if err != nil {
		return "", err
	}
	l := &ledger{a: a, ctx: ctx, p: p, sum: sum}
	l.head()
	if err := l.sections(false); err != nil {
		return "", err
	}
	l.news(items)
	e, err := a.Expenses(ctx, p)
	if err != nil {
		return "", err
	}
	if len(e.Spends) > 0 || len(e.Cards) > 0 {
		l.line("\nSpending and cards:")
		l.WriteString(expenseFacts(e, Today()))
	}
	return l.String(), nil
}

func (a *App) TodayLedger(ctx context.Context, p *store.Portfolio, sum *PortfolioSummary, items []store.NewsItem) (string, error) {
	l := &ledger{a: a, ctx: ctx, p: p, sum: sum}
	l.head()
	if err := l.today(); err != nil {
		return "", err
	}
	if err := l.sections(false); err != nil {
		return "", err
	}
	l.news(items)
	return l.String(), nil
}

func (a *App) OverviewLedger(ctx context.Context, p *store.Portfolio, sum *PortfolioSummary) (string, error) {
	l := &ledger{a: a, ctx: ctx, p: p, sum: sum}
	l.head()
	if err := l.overTime(); err != nil {
		return "", err
	}
	if err := l.sections(false); err != nil {
		return "", err
	}
	return l.String(), nil
}

func (a *App) SectionLedger(ctx context.Context, p *store.Portfolio, sum *PortfolioSummary, i int) (string, error) {
	l := &ledger{a: a, ctx: ctx, p: p, sum: sum}
	l.line("Portfolio %q, today %s.", p.Name, Today().Format("2 Jan 2006"))
	if sum.PricedOn != nil {
		l.line("Prices from %s.", sum.PricedOn.Format("2 Jan 2006"))
	}
	l.line("For scale, the whole portfolio owns %s and owes %s; net worth %s.", Compact(sum.Assets), Compact(sum.Liabilities), Compact(sum.NetWorth))
	l.line("Inflation assumed %.1f%% a year.", p.Settings.Inflation)
	if err := l.section(i, true); err != nil {
		return "", err
	}
	return l.String(), nil
}

type ledger struct {
	strings.Builder
	a   *App
	ctx context.Context
	p   *store.Portfolio
	sum *PortfolioSummary
}

func (l *ledger) line(format string, args ...any) { fmt.Fprintf(l, format+"\n", args...) }

func (l *ledger) ret(r value.Returns) string {
	if r.Days == 0 && r.XIRR == nil {
		return "not measurable (no dated money in or out)"
	}
	if !r.Eligible {
		return fmt.Sprintf("not shown yet (money in for %d days; XIRR waits for %d)", r.Days, l.p.Settings.XIRRMinDays)
	}
	s := "unknown"
	if r.XIRR != nil {
		s = Pct(*r.XIRR) + " a year"
	}
	if r.Benchmark != nil {
		s += fmt.Sprintf(", against %s for the same money in %s", Pct(*r.Benchmark), l.sum.Benchmark)
	}
	return s + fmt.Sprintf(", over %d days", r.Days)
}

func (l *ledger) head() {
	sum := l.sum
	l.line("Portfolio %q, today %s.", l.p.Name, Today().Format("2 Jan 2006"))
	if sum.PricedOn != nil {
		l.line("Prices from %s.", sum.PricedOn.Format("2 Jan 2006"))
	}
	l.line("Net worth %s: owned %s, owed %s, put in %s.", Compact(sum.NetWorth), Compact(sum.Assets), Compact(sum.Liabilities), Compact(sum.Invested))
	if sum.Unknown > 0 {
		l.line("%s of what is owned came from a statement with no purchase history, so its cost is unknown and it is not in the put-in figure.", Compact(sum.Unknown))
	}
	l.line("Inflation assumed %.1f%% a year.", l.p.Settings.Inflation)
	l.line("Wealth XIRR (every dated rupee): %s.", l.ret(sum.Wealth))
	l.line("Stocks XIRR: %s.", l.ret(sum.Stocks))
}

func (l *ledger) sections(detail bool) error {
	for i := range l.sum.Sections {
		if err := l.section(i, detail); err != nil {
			return err
		}
	}
	return nil
}

func (l *ledger) section(i int, detail bool) error {
	r, sec := l.sum.Summary.Sections[i], l.sum.Sections[i]
	l.line("")
	counted := ""
	if !sec.Counts {
		counted = ", not counted in net worth"
	}
	switch sec.Valuation {
	case kinds.Liability:
		l.line("Section %q (%s, money owed)%s: %s outstanding.", sec.Name, sec.Kind, counted, Compact(-r.Value))
	case kinds.Cover:
		l.line("Section %q (%s, cover held, never counted as owned).", sec.Name, sec.Kind)
	case kinds.Balance:
		l.line("Section %q (%s, bank balances that earn only their interest; no yearly return applies)%s: %s held.", sec.Name, sec.Kind, counted, Compact(r.Value))
	default:
		l.line("Section %q (%s)%s: value %s, put in %s, XIRR %s.", sec.Name, sec.Kind, counted, Compact(r.Value), Compact(r.Invested), l.ret(r.Returns))
	}
	if sec.Description != "" {
		l.line("The owner describes it: %s", sec.Description)
	}
	infl := l.p.Settings.Inflation
	if x := r.Returns.XIRR; x != nil && r.Returns.Eligible && sec.Valuation != kinds.Liability && sec.Valuation != kinds.Cover {
		l.line("After %.1f%% inflation: %s a year.", infl, Pct((1+*x)/(1+infl/100)-1))
	}
	if sec.Kind == "savings" && r.Value > 0 {
		if err := l.idle(sec, r); err != nil {
			return err
		}
	}
	if sec.Valuation == kinds.Cover {
		l.cover()
	}
	l.checks(r)
	holdings := sec.Valuation == kinds.Market || sec.Valuation == kinds.NAV
	if detail {
		if sec.Counts && l.sum.Assets > 0 && sec.Valuation != kinds.Liability && sec.Valuation != kinds.Cover {
			l.line("It is %s of what is owned.", PlainPct(r.Value/l.sum.Assets, 1))
		}
		if gain := r.Value - r.Invested; r.Invested > 0 && sec.Valuation != kinds.Liability && sec.Valuation != kinds.Cover && sec.Valuation != kinds.Balance {
			l.line("On what was put in: %s.", gainOrLoss(gain, r.Invested))
		}
		l.groups(r)
	}
	if sec.Valuation != kinds.Cover {
		l.positions(sec, r, detail)
	}
	if detail && !holdings {
		if err := l.rows(sec); err != nil {
			return err
		}
	}
	if sec.Kind == "stocks" && sec.Valuation == kinds.Market {
		habits, err := l.a.habits(l.ctx, &sec)
		if err != nil {
			return err
		}
		l.WriteString(habits)
	}
	if detail {
		l.byYear("Money in and out of this section by year", r.Flows)
	}
	return nil
}

func (l *ledger) positions(sec store.Section, r value.Result, detail bool) {
	ps := append([]value.Position(nil), r.Positions...)
	sort.Slice(ps, func(i, j int) bool { return ps[i].Value > ps[j].Value })
	for j, pos := range ps {
		if j == 15 && !detail {
			l.line("  …and %d more.", len(ps)-15)
			break
		}
		x := ""
		if pos.XIRR != nil {
			x = ", XIRR " + Pct(*pos.XIRR)
		}
		from := ""
		if pos.From != "" {
			from = " (moved here from another section)"
		}
		if sec.Valuation == kinds.Liability {
			l.line("  %s: owed %s.", pos.Name, Compact(-pos.Value))
			continue
		}
		if pos.CostUnknown {
			l.line("  %s%s: value %s, cost unknown (from a statement with no purchase history).", NameCase(pos.Name), from, Compact(pos.Value))
			continue
		}
		if !detail {
			l.line("  %s%s: value %s, cost %s%s.", NameCase(pos.Name), from, Compact(pos.Value), Compact(pos.Invested), x)
			continue
		}
		var more []string
		if pos.Invested > 0 {
			more = append(more, gainOrLoss(pos.Value-pos.Invested, pos.Invested))
		}
		if r.Value > 0 {
			more = append(more, PlainPct(pos.Value/r.Value, 1)+" of the section")
		}
		if pos.Group != "" {
			more = append(more, pos.Group)
		}
		if pos.Days > 0 {
			more = append(more, fmt.Sprintf("held %d days", pos.Days))
		}
		if pos.Stale {
			more = append(more, "no price yet")
		}
		l.line("  %s%s: value %s, cost %s%s; %s.", NameCase(pos.Name), from, Compact(pos.Value), Compact(pos.Invested), x, strings.Join(more, ", "))
	}
}

// idle says what cash in savings loses to inflation in a year, at the interest entered for it.
func (l *ledger) idle(sec store.Section, r value.Result) error {
	raw, err := l.a.Store.Rows(l.ctx, sec.ID)
	if err != nil {
		return err
	}
	earning, weighted := 0.0, 0.0
	for _, row := range decodeRows(raw) {
		bal, _ := value.Number(row["balance"])
		if rate, ok := value.Number(row["rate"]); ok && rate > 0 {
			earning += bal
			weighted += bal * rate
		}
	}
	infl := l.p.Settings.Inflation
	if earning == 0 {
		l.line("No interest rate is entered, so it is counted as earning nothing; at %.1f%% inflation it loses about %s of buying power a year.", infl, Compact(r.Value*(1-1/(1+infl/100))))
		return nil
	}
	rate := weighted / earning
	lost := r.Value * (1 - (1+rate/100*earning/r.Value)/(1+infl/100))
	l.line("It earns %.1f%% on average where a rate is entered; against %.1f%% inflation it loses about %s of buying power a year.", rate, infl, Compact(lost))
	return nil
}

func (l *ledger) cover() {
	pr := l.sum.Protection
	if pr == nil {
		return
	}
	if pr.LifeN == 0 {
		l.line("Life cover: none.")
	} else {
		l.line("Life cover %s across %d policy(ies).", Compact(pr.Life), pr.LifeN)
		if owed := l.sum.Liabilities; owed > 0 {
			l.line("Life cover is %s what is owed, and leaves %s after clearing it.", times(pr.Life/owed), Compact(pr.Life-owed))
		}
	}
	if pr.HealthN == 0 {
		l.line("Health cover: none.")
	} else {
		l.line("Health cover %s across %d policy(ies).", Compact(pr.Health), pr.HealthN)
	}
	if pr.Premiums > 0 {
		l.line("Premiums %s a year.", Compact(pr.Premiums))
	}
	l.line("Cash in savings and deposits, which would meet a bill the cover does not: %s.", Compact(l.cash()))
}

func (l *ledger) checks(r value.Result) {
	var doubts []string
	for _, pos := range r.Positions {
		if !pos.CostUnknown && pos.Invested > 0 && pos.Value > 10*pos.Invested {
			doubts = append(doubts, fmt.Sprintf("%s's cost of %s against a value of %s looks too low to be right; if it is a typo, every return in this section is wrong.", NameCase(pos.Name), Compact(pos.Invested), Compact(pos.Value)))
		}
	}
	if r.Unpriced > 0 {
		doubts = append(doubts, fmt.Sprintf("%d holding(s) have no price yet and are counted at cost.", r.Unpriced))
	}
	if len(doubts) > 0 {
		l.line("Entries that look wrong:")
		for _, d := range doubts {
			l.line("  %s", d)
		}
	}
}

// gainOrLoss describes a change in words, so a loss is never read off a bracket.
func gainOrLoss(change, base float64) string {
	word := "gain"
	if change < 0 {
		word = "loss"
	}
	return fmt.Sprintf("%s %s, %s", word, Compact(math.Abs(change)), PlainPct(math.Abs(change)/base, 1))
}

func (l *ledger) groups(r value.Result) {
	by := map[string]float64{}
	for _, p := range r.Positions {
		if p.Group != "" {
			by[p.Group] += p.Value
		}
	}
	if len(by) < 2 || r.Value <= 0 {
		return
	}
	names := make([]string, 0, len(by))
	for g := range by {
		names = append(names, g)
	}
	sort.Slice(names, func(i, j int) bool { return by[names[i]] > by[names[j]] })
	parts := make([]string, len(names))
	for i, g := range names {
		parts[i] = fmt.Sprintf("%s %s", g, PlainPct(by[g]/r.Value, 0))
	}
	l.line("By group: %s.", strings.Join(parts, ", "))
}

func (l *ledger) rows(sec store.Section) error {
	raw, err := l.a.Store.Rows(l.ctx, sec.ID)
	if err != nil {
		return err
	}
	rows := decodeRows(raw)
	if len(rows) == 0 {
		return nil
	}
	l.line("Rows as entered:")
	today := Today()
	for _, row := range rows {
		var parts []string
		for _, f := range sec.Fields {
			v := row[f.Key]
			s := value.Text(v)
			if s == "" {
				continue
			}
			switch f.Type {
			case "money":
				if n, ok := value.Number(v); ok {
					s = Compact(n)
				}
			case "percent":
				s = strings.TrimSuffix(s, "%") + "%"
			case "date":
				d, ok := value.Date(v)
				if f.Key == "renews_on" {
					d, ok = value.NextDue(v, value.Text(row["pays"]), today)
				}
				if ok {
					s = d.Format("2 Jan 2006")
					if days := int(d.Sub(today).Hours() / 24); days >= 0 {
						s += fmt.Sprintf(" (in %d days)", days)
					}
				}
			}
			parts = append(parts, f.Label+" "+s)
		}
		l.line("  %s.", strings.Join(parts, "; "))
	}
	return nil
}

func (l *ledger) byYear(title string, flows []value.Flow) {
	in, out := map[int]float64{}, map[int]float64{}
	var years []int
	for _, f := range flows {
		y := f.Date.Year()
		if _, seen := in[y]; !seen {
			if _, seen := out[y]; !seen {
				years = append(years, y)
			}
		}
		if f.Amount < 0 {
			in[y] += -f.Amount
		} else {
			out[y] += f.Amount
		}
	}
	if len(years) == 0 {
		return
	}
	sort.Ints(years)
	parts := make([]string, len(years))
	for i, y := range years {
		parts[i] = fmt.Sprintf("%d in %s", y, Compact(in[y]))
		if out[y] > 0 {
			parts[i] += fmt.Sprintf(", out %s", Compact(out[y]))
		}
	}
	l.line("%s: %s.", title, strings.Join(parts, "; "))
}

func (l *ledger) cash() float64 {
	cash := 0.0
	for i, sec := range l.sum.Sections {
		if sec.Counts && (sec.Kind == "savings" || sec.Kind == "deposits") {
			cash += l.sum.Summary.Sections[i].Value
		}
	}
	return cash
}

func (l *ledger) news(items []store.NewsItem) {
	first := true
	for _, it := range items {
		if it.Verdict != "signal" {
			continue
		}
		if first {
			l.line("")
			l.line("News judged worth reading:")
			first = false
		}
		l.line("  %s (%s): %s", it.Title, strings.Join(it.Scrips, ", "), it.Reason)
	}
}

func (l *ledger) today() error {
	sum, today := l.sum, Today()
	l.line("")
	l.line("Today:")
	snaps, err := l.a.Store.Snapshots(l.ctx, l.p.ID)
	if err != nil {
		return err
	}
	for i := len(snaps) - 1; i >= 0; i-- {
		if d, ok := value.Date(snaps[i].Day); ok && d.Before(today) {
			l.line("Net worth on %s was %s; it is %s now, a change of %s.", d.Format("2 Jan 2006"), Compact(snaps[i].NetWorth), Compact(sum.NetWorth), CompactSigned(sum.NetWorth-snaps[i].NetWorth))
			break
		}
	}
	since := today.AddDate(0, 0, -10)
	if closes, err := l.a.Store.IndexSeries(l.ctx, sum.Benchmark, since); err != nil {
		return err
	} else if n := len(closes); n >= 2 {
		last, prev := closes[n-1], closes[n-2]
		l.line("%s moved %s on %s.", sum.Benchmark, Pct(last.Close/prev.Close-1), last.Day.Format("2 Jan 2006"))
	}
	type move struct {
		name, line string
		change     float64
	}
	var isins []string
	for i, sec := range sum.Sections {
		if sec.Valuation == kinds.Market || sec.Valuation == kinds.NAV {
			for _, pos := range sum.Summary.Sections[i].Positions {
				if pos.ISIN != "" && pos.Quantity != 0 {
					isins = append(isins, pos.ISIN)
				}
			}
		}
	}
	history, err := l.a.Store.PriceHistories(l.ctx, isins, since)
	if err != nil {
		return err
	}
	for i, sec := range sum.Sections {
		if sec.Valuation != kinds.Market && sec.Valuation != kinds.NAV {
			continue
		}
		var moves []move
		total := 0.0
		for _, pos := range sum.Summary.Sections[i].Positions {
			if pos.ISIN == "" || pos.Quantity == 0 {
				continue
			}
			closes := history[pos.ISIN]
			n := len(closes)
			if n < 2 || closes[n-2].Close == 0 {
				continue
			}
			last, prev := closes[n-1], closes[n-2]
			change := pos.Quantity * (last.Close - prev.Close)
			total += change
			day, _ := value.Date(last.Day)
			moves = append(moves, move{pos.Name, fmt.Sprintf("  %s: %s, %s, on %s.", NameCase(pos.Name), CompactSigned(change), Pct(last.Close/prev.Close-1), day.Format("2 Jan 2006")), change})
		}
		if len(moves) == 0 {
			continue
		}
		sort.Slice(moves, func(a, b int) bool { return math.Abs(moves[a].change) > math.Abs(moves[b].change) })
		l.line("%s moved %s on the last trading day:", sec.Name, CompactSigned(total))
		for _, m := range moves {
			l.line("%s", m.line)
		}
	}
	due, err := l.dueSoon(today, 30)
	if err != nil {
		return err
	}
	if len(due) > 0 {
		l.line("Falling due in the next 30 days:")
		for _, d := range due {
			l.line("  %s", d)
		}
	}
	return nil
}

func (l *ledger) dueSoon(today time.Time, within int) ([]string, error) {
	var out []string
	for _, sec := range l.sum.Sections {
		if sec.Valuation == kinds.Market || sec.Valuation == kinds.NAV {
			continue
		}
		raw, err := l.a.Store.Rows(l.ctx, sec.ID)
		if err != nil {
			return nil, err
		}
		for _, row := range decodeRows(raw) {
			name := ""
			for _, f := range sec.Fields {
				if f.Type == "text" && value.Text(row[f.Key]) != "" {
					name = value.Text(row[f.Key])
					break
				}
			}
			for _, f := range sec.Fields {
				if f.Type != "date" {
					continue
				}
				d, ok := value.Date(row[f.Key])
				if f.Key == "renews_on" {
					d, ok = value.NextDue(row[f.Key], value.Text(row["pays"]), today)
				}
				if days := int(d.Sub(today).Hours() / 24); ok && days >= 0 && days <= within {
					out = append(out, fmt.Sprintf("%s (%s): %s on %s, in %d days.", name, sec.Name, f.Label, d.Format("2 Jan 2006"), days))
				}
			}
		}
	}
	return out, nil
}

func (l *ledger) overTime() error {
	sum, today := l.sum, Today()
	l.line("")
	l.line("Over time:")
	var flows []value.Flow
	for i, sec := range sum.Sections {
		if sec.Counts && sec.Valuation != kinds.Liability && sec.Valuation != kinds.Cover {
			flows = append(flows, sum.Summary.Sections[i].Flows...)
		}
	}
	if first := firstFlow(flows); !first.IsZero() {
		l.line("Money first went in on %s, %d days ago.", first.Format("2 Jan 2006"), int(today.Sub(first).Hours()/24))
	}
	l.byYear("Money in and out by year", flows)
	snaps, err := l.a.Store.Snapshots(l.ctx, l.p.ID)
	if err != nil {
		return err
	}
	at := func(back int) *store.Snapshot {
		cut := today.AddDate(0, 0, -back)
		var got *store.Snapshot
		for i := range snaps {
			if d, ok := value.Date(snaps[i].Day); ok && !d.After(cut) {
				got = &snaps[i]
			}
		}
		return got
	}
	if len(snaps) > 0 {
		s := snaps[0]
		d, _ := value.Date(s.Day)
		l.line("Net worth was first recorded on %s at %s, with %s put in.", d.Format("2 Jan 2006"), Compact(s.NetWorth), Compact(s.Invested))
	}
	for _, back := range []struct {
		days  int
		label string
	}{{30, "a month ago"}, {365, "a year ago"}} {
		if s := at(back.days); s != nil {
			l.line("Net worth %s was %s; it is %s now, a change of %s.", back.label, Compact(s.NetWorth), Compact(sum.NetWorth), CompactSigned(sum.NetWorth-s.NetWorth))
		}
	}
	if sum.Assets > 0 {
		var parts []string
		for i, sec := range sum.Sections {
			if r := sum.Summary.Sections[i]; sec.Counts && r.Value > 0 {
				parts = append(parts, fmt.Sprintf("%s %s", sec.Name, PlainPct(r.Value/sum.Assets, 0)))
			}
		}
		if len(parts) > 0 {
			l.line("Share of what is owned: %s.", strings.Join(parts, ", "))
		}
	}
	return nil
}

func (a *App) habits(ctx context.Context, sec *store.Section) (string, error) {
	raw, err := a.Store.Rows(ctx, sec.ID)
	if err != nil {
		return "", err
	}
	rows, err := a.resolveRows(ctx, decodeRows(raw))
	if err != nil {
		return "", err
	}
	buys, sells := 0, 0
	isins := map[string]bool{}
	var list []string
	for _, r := range rows {
		if value.IsSale(sec.Kind, r) {
			sells++
		} else {
			buys++
		}
		if isin := strings.ToUpper(value.Text(r["isin"])); isin != "" && !isins[isin] {
			isins[isin] = true
			list = append(list, isin)
		}
	}
	quotes, err := a.Store.LatestPrices(ctx, list)
	if err != nil {
		return "", err
	}
	prices := value.Prices{}
	for isin, q := range quotes {
		prices[isin] = q.Close
	}
	hs, err := a.Store.Holdings(ctx, sec.ID)
	if err != nil {
		return "", err
	}
	realised, held, days := 0.0, 0, 0.0
	for _, h := range hs {
		realised += h.Realised
		if h.Quantity > 0 && h.FirstDate != nil {
			if d, ok := value.Date(*h.FirstDate); ok {
				held++
				days += Today().Sub(d).Hours() / 24
			}
		}
	}
	var b strings.Builder
	word := "gain"
	if realised < 0 {
		word = "loss"
	}
	fmt.Fprintf(&b, "  Trading: %d buys and %d sells across %d scrips; realised %s on sales %s.\n", buys, sells, len(list), word, Compact(math.Abs(realised)))
	if held > 0 {
		fmt.Fprintf(&b, "  Current holdings were first bought %.0f days ago on average.\n", days/float64(held))
	}
	cf := value.NeverSold(sec.Kind, rows, prices, Today())
	if cf.XIRR != nil && sells > 0 {
		fmt.Fprintf(&b, "  Had nothing ever been sold, every buy would now be worth %s against %s put in, an XIRR of %s.\n", Compact(cf.Value), Compact(cf.Invested), Pct(*cf.XIRR))
	}
	return b.String(), nil
}
