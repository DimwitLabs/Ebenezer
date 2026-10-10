package app

import (
	"bytes"
	"context"
	_ "embed"
	"fmt"
	htmltemplate "html/template"
	"maps"
	"math"
	"sort"
	"strings"
	texttemplate "text/template"
	"time"

	"github.com/DimwitLabs/ebenezer/internal/kinds"
	"github.com/DimwitLabs/ebenezer/internal/store"
	"github.com/DimwitLabs/ebenezer/internal/value"
)

var Weekdays = []string{"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"}

var ReportSections = []string{"summary", "note", "sections", "movers", "news", "health"}

//go:embed report.html
var reportHTML string

//go:embed report.txt
var reportText string

var (
	htmlReport = htmltemplate.Must(htmltemplate.New("report").Parse(reportHTML))
	textReport = texttemplate.Must(texttemplate.New("report").Parse(reportText))
)

type figure struct {
	Label, Value, Tone string
}

type sectionLine struct {
	Name, Value, Gain, GainTone, XIRR, XIRRTone, Share string
}

type mover struct {
	Name, Change, Tone, Detail string
}

type story struct {
	Title, Link, Source, Scrips, Reason, Age string
	Judged                                   bool
}

// ReportPalette is the default ledger green from the app's colour rules; a portfolio's saved colours are laid over it.
var ReportPalette = map[string]string{
	"primary": "#206a4e", "onPrimary": "#f5fbf5", "page": "#f5fbf5", "card": "#eaefe9", "hero": "#a9f2cd", "onHero": "#005138",
	"heroInk2": "#257459", "tag": "#e4eae4", "rule": "#dee4de", "line": "#bfc9c1", "ink": "#2c322e", "ink2": "#4c554f",
	"ink3": "#5c655f", "chip": "#cfe9d9", "onChip": "#364b40", "note": "#c1e9fb", "onNote": "#244c5b", "error": "#ba1a1a",
	"alert": "#ffdad6", "onAlert": "#93000a",
}

func palette(own map[string]string) map[string]string {
	c := maps.Clone(ReportPalette)
	for k, v := range own {
		if _, ok := c[k]; ok {
			c[k] = v
		}
	}
	return c
}

type reportData struct {
	C                             map[string]string
	Portfolio, Day, PricedOn, URL string
	NewsURL                       string
	Show                          map[string]bool
	NetWorth, Change, ChangeTone  string
	Figures                       []figure
	Note                          Note
	Sections                      []sectionLine
	Gainers, Losers               []mover
	News                          []story
	Health                        []string
}

func tone(x float64) string {
	switch {
	case x > 0.00005:
		return "up"
	case x < -0.00005:
		return "down"
	}
	return ""
}

func pctOrDash(x *float64) (string, string) {
	if x == nil {
		return "—", ""
	}
	return Pct(*x), tone(*x)
}

func (a *App) Report(ctx context.Context, p *store.Portfolio) (subject, html, text string, err error) {
	sum, err := a.Summary(ctx, p)
	if err != nil {
		return "", "", "", err
	}
	items, err := a.NoteNews(ctx, p)
	if err != nil {
		return "", "", "", err
	}
	note, _, _ := a.VoicedNotes(ctx, p, sum, items)
	today := time.Now().In(Zone)
	d := reportData{C: palette(p.Settings.Palette), Portfolio: p.Name, Day: today.Format("Monday, 2 January 2006"), URL: a.PublicURL(),
		NetWorth: Short(sum.NetWorth), Show: map[string]bool{}, Note: note}
	for _, s := range p.Settings.Report.Sections {
		d.Show[s] = true
	}
	if u := a.PublicURL(); u != "" {
		d.NewsURL = u + "/p/" + p.Slug + "/news"
	}
	if sum.PricedOn != nil {
		d.PricedOn = sum.PricedOn.Format("2 Jan 2006")
	}

	snaps, err := a.Store.Snapshots(ctx, p.ID)
	if err != nil {
		return "", "", "", err
	}
	todayKey := today.Format("2006-01-02")
	for i := len(snaps) - 1; i >= 0; i-- {
		if snaps[i].Day < todayKey {
			change := sum.NetWorth - snaps[i].NetWorth
			d.Change, d.ChangeTone = Signed(change)+" since "+dayName(snaps[i].Day), tone(change)
			break
		}
	}
	w, wt := pctOrDash(sum.Wealth.XIRR)
	b, bt := pctOrDash(sum.Wealth.Benchmark)
	d.Figures = []figure{
		{"Owned", Short(sum.Assets), ""},
		{"Owed", Short(sum.Liabilities), ""},
		{"Put in", Short(sum.Invested), ""},
		{"Wealth XIRR", w, wt},
		{sum.Benchmark + ", same money", b, bt},
	}
	if !sum.Wealth.Eligible {
		d.Figures[3].Value = fmt.Sprintf("after %d days", p.Settings.XIRRMinDays)
	}

	var held []value.Position
	for i, r := range sum.Summary.Sections {
		sec := sum.Sections[i]
		if len(r.Positions) == 0 && r.Value == 0 {
			continue
		}
		line := sectionLine{Name: sec.Name, Value: Short(r.Value)}
		if sec.Valuation != kinds.Liability && sec.Valuation != kinds.Balance && r.Invested > 0 {
			gain := r.Value - r.Unknown - r.Invested
			line.Gain, line.GainTone = Signed(gain), tone(gain)
		}
		line.XIRR, line.XIRRTone = pctOrDash(r.Returns.XIRR)
		if sec.Valuation != kinds.Liability && sec.Counts && sum.Assets > 0 {
			line.Share = PlainPct(r.Value/sum.Assets, 0)
		}
		d.Sections = append(d.Sections, line)
		held = append(held, r.Positions...)
	}

	movers, err := a.movers(ctx, held)
	if err != nil {
		return "", "", "", err
	}
	for _, m := range movers {
		if m.Tone == "up" && len(d.Gainers) < 3 {
			d.Gainers = append(d.Gainers, m)
		}
	}
	for i := len(movers) - 1; i >= 0; i-- {
		if movers[i].Tone == "down" && len(d.Losers) < 3 {
			d.Losers = append(d.Losers, movers[i])
		}
	}

	d.News = topStories(items, today)
	if h, err := a.LastHealth(ctx); err == nil {
		for _, c := range h.Checks {
			if !c.OK {
				d.Health = append(d.Health, c.Name+": "+c.Detail)
			}
		}
	}

	var hb, tb bytes.Buffer
	if err := htmlReport.Execute(&hb, d); err != nil {
		return "", "", "", err
	}
	if err := textReport.Execute(&tb, d); err != nil {
		return "", "", "", err
	}
	subject = fmt.Sprintf("%s: %s", p.Name, d.NetWorth)
	if d.Change != "" {
		subject += ", " + d.Change
	}
	return subject, hb.String(), tb.String(), nil
}

var keepUpper = map[string]bool{"ETF": true, "NAV": true, "IDCW": true, "ELSS": true, "SBI": true, "HDFC": true, "ICICI": true,
	"LIC": true, "ITC": true, "TCS": true, "NTPC": true, "ONGC": true, "BSE": true, "NSE": true, "UTI": true, "IT": true, "PSU": true, "SGB": true}

// NameCase recases exchange names, which arrive in capitals.
func NameCase(s string) string {
	if s == "" || s != strings.ToUpper(s) {
		return s
	}
	words := strings.Fields(strings.ToLower(s))
	for i, w := range words {
		bare := strings.ToUpper(strings.Trim(w, ".()"))
		switch {
		case keepUpper[bare]:
			words[i] = strings.ToUpper(w)
		case bare == "LTD":
			words[i] = "Ltd"
		default:
			words[i] = strings.ToUpper(w[:1]) + w[1:]
		}
	}
	return strings.Join(words, " ")
}

func dayName(iso string) string {
	t, err := time.Parse("2006-01-02", iso)
	if err != nil {
		return iso
	}
	if Today().Sub(t) <= 24*time.Hour {
		return "yesterday"
	}
	return t.Format("2 Jan")
}

func (a *App) movers(ctx context.Context, held []value.Position) ([]mover, error) {
	var isins []string
	for _, p := range held {
		if p.ISIN != "" && p.Price != nil {
			isins = append(isins, p.ISIN)
		}
	}
	prev, err := a.Store.PreviousPrices(ctx, isins)
	if err != nil {
		return nil, err
	}
	type ranked struct {
		mover
		by float64
	}
	var rs []ranked
	for _, p := range held {
		before, ok := prev[p.ISIN]
		if !ok || p.Price == nil || before <= 0 {
			continue
		}
		change := p.Quantity * (*p.Price - before)
		if math.Abs(change) < 1 {
			continue
		}
		rs = append(rs, ranked{mover{Name: NameCase(p.Name), Change: Signed(change), Tone: tone(change),
			Detail: fmt.Sprintf("%s to %s", Pct(*p.Price/before-1), Rupees(*p.Price))}, change})
	}
	sort.Slice(rs, func(i, j int) bool { return rs[i].by > rs[j].by })
	out := make([]mover, len(rs))
	for i, r := range rs {
		out[i] = r.mover
	}
	return out, nil
}

func (a *App) sendReport(ctx context.Context, portfolioID string) (string, error) {
	p, err := a.portfolio(ctx, portfolioID)
	if err != nil {
		return "", err
	}
	to := p.Settings.Report.To
	if len(to) == 0 {
		return "", fmt.Errorf("add an address to send the report to in Settings")
	}
	subject, html, text, err := a.Report(ctx, p)
	if err != nil {
		return "", err
	}
	if err := a.SendMail(ctx, to, subject, html, text); err != nil {
		return "", err
	}
	for _, t := range to {
		fact(ctx, "To", t)
	}
	return "Sent to " + plural(len(to), "address", "addresses"), nil
}

// topStories picks the stories to show; unjudged recent stories fill in when signal is thin (say, no AI key), and humbug and routine filings never do.
func topStories(items []store.NewsItem, now time.Time) []story {
	const most, least = 8, 3
	pick := func(it store.NewsItem, judged bool) story {
		s := story{Title: it.Title, Link: it.Link, Source: it.Source, Scrips: strings.Join(it.Scrips, ", "), Reason: it.Reason, Judged: judged}
		if it.PublishedAt != nil {
			s.Age = storyAge(now.Sub(*it.PublishedAt))
		}
		return s
	}
	var out []story
	for _, it := range items {
		if it.Verdict == "signal" && len(out) < most {
			out = append(out, pick(it, true))
		}
	}
	for _, it := range items {
		if len(out) >= least {
			break
		}
		if it.Verdict == "" {
			out = append(out, pick(it, false))
		}
	}
	return out
}

func storyAge(d time.Duration) string {
	switch h := int(d.Hours()); {
	case h < 1:
		return "just now"
	case h < 24:
		return fmt.Sprintf("%dh ago", h)
	case h < 48:
		return "yesterday"
	default:
		return fmt.Sprintf("%d days ago", h/24)
	}
}
