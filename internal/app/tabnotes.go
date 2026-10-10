package app

import (
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/DimwitLabs/ebenezer/internal/kinds"
	"github.com/DimwitLabs/ebenezer/internal/value"
)

// tabPhrases holds a tone's tab notes; like the daily phrasebook, every tone says the same facts, and placeholders are filled in order.
type tabPhrases struct {
	best, worst, biggest, cash, unpriced, stray                               string
	group, top, top3, grown, down, tiny, noCost, noPrice                      string
	short, bare, covered, renews, noTerm, noHealth, noHealthBare, ends, mixed string
	quiet                                                                     string
}

var tabbook = map[string]tabPhrases{
	"dry": {
		best:         "%s is doing the most work at %s a year.",
		worst:        "%s is doing the least at %s a year.",
		biggest:      "Your biggest holding, %s, is %s of what you own.",
		cash:         "%s of what you own sits in savings, losing %s a year to inflation.",
		unpriced:     "%s no price, so I counted %s at cost.",
		stray:        "%s like gold. Count %s under %s?",
		group:        "%s is the biggest at %s, across %d %s.",
		top:          "%s is %s of your %s.",
		top3:         "Your top three make up %s.",
		grown:        "%s has grown most, %s.",
		down:         "%s is down %s.",
		tiny:         "%d are under 1%% each, too small to move the total.",
		noCost:       "%d of %d have no purchase price, so I left them out of gain.",
		noPrice:      "%s no price yet, so I counted %s at cost.",
		short:        "Your life cover is %s short of what you owe. Your family would inherit the rest of the loans.",
		bare:         "You owe %s and have no life cover. Your family would inherit the loans.",
		renews:       "%s renews %s%s.",
		noTerm:       "No term life cover is listed, so the %s you own would be all your family has to go on.",
		noHealth:     "No health cover is listed, so a hospital bill would come out of your %s in savings and deposits.",
		noHealthBare: "No health cover is listed, and nothing sits in savings or deposits to pay a hospital bill.",
		covered:      "Your %s of life cover clears what you owe %s over and leaves %s for your family.",
		ends:         "%s ends %s. Its cover goes with it.",
		mixed:        "Life with savings plans mix cover and investing, and usually do neither well.",
		quiet:        "Nothing here needs you.",
	},
	"warm": {
		best:         "%s is pulling the most weight, at %s a year.",
		worst:        "%s is the slowest, at %s a year. Worth a gentle look.",
		biggest:      "%s is your biggest holding, %s of everything you own.",
		cash:         "%s of what you own rests in savings, where inflation takes %s a year.",
		unpriced:     "%s no price yet, so for %s I used what you paid.",
		stray:        "%s like gold. Shall we count %s under %s?",
		group:        "%s leads at %s, across %d %s.",
		top:          "%s makes up %s of your %s.",
		top3:         "Your three largest are %s of the whole.",
		grown:        "%s has grown the most, %s. Nicely done.",
		down:         "%s is down %s. Give it time, or give it thought.",
		tiny:         "%d are under 1%% each; they barely move the total.",
		noCost:       "%d of %d have no purchase price, so I kept them out of gain.",
		noPrice:      "%s no price yet, so for %s I used what you paid.",
		short:        "Your life cover falls %s short of what you owe. Your family would carry the rest.",
		bare:         "You owe %s and have no life cover yet. Your family would carry the loans.",
		renews:       "%s renews %s%s.",
		noTerm:       "There is no term life cover yet, so the %s you own would be all your family had to go on.",
		noHealth:     "There is no health cover yet, so a hospital bill would be paid from your %s in savings and deposits.",
		noHealthBare: "There is no health cover yet, and no savings or deposits to fall back on for a hospital bill.",
		covered:      "Your %s of life cover would clear your loans %s over and still leave %s for your family.",
		ends:         "%s ends %s, and its cover ends with it.",
		mixed:        "Life with savings plans try to insure and invest at once, and rarely do either well.",
		quiet:        "All calm here.",
	},
	"blunt": {
		best:         "Best: %s, %s a year.",
		worst:        "Worst: %s, %s a year.",
		biggest:      "Biggest holding: %s, %s of assets.",
		cash:         "%s idle in savings. Inflation: %s.",
		unpriced:     "%s no price. Counted %s at cost.",
		stray:        "%s like gold. Move %s to %s.",
		group:        "%s leads: %s, of %d %s.",
		top:          "%s: %s of %s.",
		top3:         "Top three: %s.",
		grown:        "Best: %s, %s.",
		down:         "Worst: %s, %s.",
		tiny:         "%d under 1%% each. Noise.",
		noCost:       "%d of %d lack a cost. Left out of gain.",
		noPrice:      "%s no price. Counted %s at cost.",
		short:        "Life cover %s short of debt.",
		bare:         "Debt %s. No life cover.",
		renews:       "%s renews %s%s.",
		noTerm:       "No term cover. Family gets %s, nothing more.",
		noHealth:     "No health cover. Hospital bills hit your %s cash.",
		noHealthBare: "No health cover. No cash for a hospital bill.",
		covered:      "Life cover %s: debt covered %s. %s left over.",
		ends:         "%s ends %s.",
		mixed:        "Life with savings: poor cover, poor returns.",
		quiet:        "Nothing to do.",
	},
	"playful": {
		best:         "%s is the hardest worker in the counting house, at %s a year.",
		worst:        "%s is dozing by the fire at %s a year.",
		biggest:      "%s is the fattest purse, %s of all you own.",
		cash:         "%s of your pile naps in savings while inflation nibbles %s a year.",
		unpriced:     "%s no price to show me, so I counted %s at cost.",
		stray:        "%s suspiciously golden. Count %s under %s?",
		group:        "%s rules the roost at %s, across %d %s.",
		top:          "%s is %s of your %s. Quite the favourite.",
		top3:         "Your top three hog %s.",
		grown:        "%s has grown most, %s. Bah, humbug? Not today.",
		down:         "%s is down %s. Even Scrooge had bad years.",
		tiny:         "%d are under 1%% each, crumbs on the ledger.",
		noCost:       "%d of %d will not tell me what they cost, so they sit out of gain.",
		noPrice:      "%s no price to show me, so I counted %s at cost.",
		short:        "Your life cover is %s short of your debts. The ghosts would hand the rest to your family.",
		bare:         "You owe %s and have no life cover. The ghosts would hand it all to your family.",
		renews:       "%s renews %s%s.",
		noTerm:       "No term cover in the vault, so your family would inherit %s and not a coin more.",
		noHealth:     "No health cover in the vault, so a hospital bill would raid your %s of savings and deposits.",
		noHealthBare: "No health cover and no cash in the vault. A hospital bill would have nowhere to land.",
		covered:      "Your %s of life cover could pay off your debts %s over and leave %s in the stocking.",
		ends:         "%s ends %s, cover and all.",
		mixed:        "Life with savings plans juggle cover and investing, and drop both.",
		quiet:        "Nothing stirs. Go outside.",
	},
}

type TabNote struct {
	Lines []NoteLine `json:"lines"`
	Quiet string     `json:"quiet,omitempty"`
	Sees  string     `json:"sees,omitempty"`
}

// TabNotes are keyed "overview" or by section id.
type TabNotes map[string]TabNote

func them(n int) string {
	if n == 1 {
		return "it"
	}
	return "them"
}

func plural(n int, one, many string) string {
	if n == 1 {
		return "1 " + one
	}
	return fmt.Sprintf("%d %s", n, many)
}

func (a *App) TabNotes(sum *PortfolioSummary, tone string) TabNotes {
	ph, ok := tabbook[tone]
	if !ok {
		ph = tabbook["dry"]
	}
	note := func(lines []NoteLine) TabNote {
		if len(lines) == 0 {
			return TabNote{Lines: []NoteLine{}, Quiet: ph.quiet}
		}
		return TabNote{Lines: lines}
	}
	out := TabNotes{"overview": note(overviewNotes(sum, ph))}
	for i, sec := range sum.Sections {
		if sec.Valuation == kinds.Cover {
			out[sec.ID] = note(coverNotes(sum, ph))
		} else {
			r := sum.Summary.Sections[i]
			var lines []NoteLine
			if sec.Valuation == kinds.Balance && sec.Counts && sum.Assets > 0 && r.Value > 0 && len(r.Positions) > 0 {
				lines = append(lines, NoteLine{Icon: "savings", Text: fmt.Sprintf(ph.cash, PlainPct(r.Value/sum.Assets, 0), PlainPct(sum.Wealth.Inflation/100, 1))})
			}
			lines = append(lines, sectionNotes(sec.Kind, sec.Name, r.Positions, ph)...)
			if len(r.Positions) == 1 {
				lines = append(lines, NoteLine{Icon: "compare_arrows", Text: "With one entry there is nothing to compare yet. Add the rest and I'll say where the money sits and what is doing the work."})
			}
			out[sec.ID] = note(lines)
		}
	}
	return out
}

func overviewNotes(sum *PortfolioSummary, ph tabPhrases) []NoteLine {
	var out []NoteLine
	type rated struct {
		id, name string
		xirr     float64
	}
	var rs []rated
	for i, sec := range sum.Sections {
		r := sum.Summary.Sections[i]
		if sec.Valuation != kinds.Liability && sec.Valuation != kinds.Cover && r.Returns.Eligible && r.Returns.XIRR != nil {
			rs = append(rs, rated{sec.ID, sec.Name, *r.Returns.XIRR})
		}
	}
	if len(rs) >= 2 {
		sort.SliceStable(rs, func(i, j int) bool { return rs[i].xirr > rs[j].xirr })
		best, worst := rs[0], rs[len(rs)-1]
		out = append(out, NoteLine{Icon: "trending_up", Text: fmt.Sprintf(ph.best, best.name, Pct(best.xirr)), Section: best.id})
		out = append(out, NoteLine{Icon: "trending_down", Text: fmt.Sprintf(ph.worst, worst.name, Pct(worst.xirr)), Section: worst.id})
	}
	var top *value.Position
	topSec := ""
	cash := 0.0
	unpriced, stray := 0, 0
	straySec := ""
	for i, sec := range sum.Sections {
		r := sum.Summary.Sections[i]
		unpriced += r.Unpriced
		if sec.Kind == "savings" && sec.Counts {
			cash += r.Value
		}
		for j := range r.Positions {
			p := &r.Positions[j]
			if sec.Counts && (sec.Valuation == kinds.Market || sec.Valuation == kinds.NAV) && (top == nil || p.Value > top.Value) {
				top, topSec = p, sec.ID
			}
			if sec.Kind != "gold" && p.Bullion {
				if stray == 0 {
					straySec = sec.ID
				}
				stray++
			}
		}
	}
	if top != nil && sum.Assets > 0 {
		out = append(out, NoteLine{Icon: "pie_chart", Text: fmt.Sprintf(ph.biggest, NameCase(top.Name), PlainPct(top.Value/sum.Assets, 1)), Section: topSec})
	}
	if sum.Assets > 0 && cash > 0 {
		out = append(out, NoteLine{Icon: "savings", Text: fmt.Sprintf(ph.cash, PlainPct(cash/sum.Assets, 0), PlainPct(sum.Wealth.Inflation/100, 1))})
	}
	if unpriced > 0 {
		out = append(out, NoteLine{Icon: "help", Text: fmt.Sprintf(ph.unpriced, plural(unpriced, "holding has", "holdings have"), them(unpriced))})
	}
	if stray > 0 {
		gold := "Bullion"
		for _, sec := range sum.Sections {
			if sec.Kind == "gold" {
				gold = sec.Name
				break
			}
		}
		out = append(out, NoteLine{Icon: "diamond", Text: fmt.Sprintf(ph.stray, plural(stray, "holding looks", "holdings look"), them(stray), gold), Section: straySec})
	}
	return out
}

var shortGroup = map[string]string{
	"Automobile and Auto Components":    "Auto",
	"Fast Moving Consumer Goods":        "FMCG",
	"Oil Gas & Consumable Fuels":        "Oil & Gas",
	"Media Entertainment & Publication": "Media",
	"Information Technology":            "IT",
	"Construction Materials":            "Cement & materials",
	"Telecommunication":                 "Telecom",
}

func ShortGroup(g string) string {
	if s, ok := shortGroup[g]; ok {
		return s
	}
	return g
}

func sectionNotes(kind, name string, positions []value.Position, ph tabPhrases) []NoteLine {
	ps := append([]value.Position(nil), positions...)
	sort.SliceStable(ps, func(i, j int) bool { return math.Abs(ps[i].Value) > math.Abs(ps[j].Value) })
	total := 0.0
	for _, p := range ps {
		total += math.Abs(p.Value)
	}
	if total == 0 {
		return nil
	}
	share := func(v float64) string { return PlainPct(math.Abs(v)/total, 0) }
	var out []NoteLine
	if kind == "stocks" || kind == "funds" {
		groups := map[string]float64{}
		for _, p := range ps {
			g := p.Group
			if g == "" {
				g = "Other"
			}
			groups[g] += p.Value
		}
		if len(groups) > 1 {
			top, best := "", math.Inf(-1)
			for g, v := range groups {
				if v > best || (v == best && g < top) {
					top, best = g, v
				}
			}
			noun := "sectors"
			if kind == "funds" {
				noun = "categories"
			}
			out = append(out, NoteLine{Icon: "category", Text: fmt.Sprintf(ph.group, top, share(best), len(groups), noun)})
		}
	}
	if len(ps) > 1 {
		out = append(out, NoteLine{Icon: "pie_chart", Text: fmt.Sprintf(ph.top, NameCase(ps[0].Name), share(ps[0].Value), strings.ToLower(name))})
	}
	if len(ps) > 4 {
		out = append(out, NoteLine{Icon: "stacked_bar_chart", Text: fmt.Sprintf(ph.top3, share(ps[0].Value+ps[1].Value+ps[2].Value))})
	}
	growth := func(p value.Position) float64 { return (p.Value - p.Invested) / p.Invested }
	var known []value.Position
	unknown, stale, tiny := 0, 0, 0
	for _, p := range ps {
		if p.Invested > 0 && !p.CostUnknown {
			known = append(known, p)
		}
		if p.CostUnknown {
			unknown++
		}
		if p.Stale {
			stale++
		}
		if math.Abs(p.Value)/total < 0.01 {
			tiny++
		}
	}
	if len(known) > 1 {
		sort.SliceStable(known, func(i, j int) bool { return growth(known[i]) > growth(known[j]) })
		if growth(known[0]) > 0 {
			out = append(out, NoteLine{Icon: "trending_up", Text: fmt.Sprintf(ph.grown, NameCase(known[0].Name), Pct(growth(known[0])))})
		}
		if last := known[len(known)-1]; growth(last) < 0 {
			out = append(out, NoteLine{Icon: "trending_down", Text: fmt.Sprintf(ph.down, NameCase(last.Name), Pct(growth(last)))})
		}
	}
	if tiny > 2 {
		out = append(out, NoteLine{Icon: "scatter_plot", Text: fmt.Sprintf(ph.tiny, tiny)})
	}
	if unknown > 0 {
		out = append(out, NoteLine{Icon: "help", Text: fmt.Sprintf(ph.noCost, unknown, len(ps))})
	}
	if stale > 0 {
		out = append(out, NoteLine{Icon: "price_change", Text: fmt.Sprintf(ph.noPrice, plural(stale, "has", "have"), them(stale))})
	}
	if len(out) > 5 {
		out = out[:5]
	}
	return out
}

const renewSoon = 45

func coverNotes(sum *PortfolioSummary, ph tabPhrases) []NoteLine {
	var out []NoteLine
	life, owed := 0.0, sum.Liabilities
	if sum.Protection != nil {
		life = sum.Protection.Life
	}
	bare := owed > 0 && life == 0
	switch {
	case owed > 0 && life > 0 && life < owed:
		out = append(out, NoteLine{Icon: "warning", Text: fmt.Sprintf(ph.short, Short(owed-life))})
	case bare:
		out = append(out, NoteLine{Icon: "warning", Text: fmt.Sprintf(ph.bare, Short(owed))})
	}
	// Reachable money that would pay a hospital bill without health cover.
	cash := 0.0
	for i, sec := range sum.Sections {
		if sec.Counts && (sec.Kind == "savings" || sec.Kind == "deposits") {
			cash += sum.Summary.Sections[i].Value
		}
	}
	today := Today()
	types := map[string]bool{}
	var renewing, ending []NoteLine
	type due struct {
		days int
		line NoteLine
	}
	var soon []due
	for _, row := range sum.policies {
		if end, ok := value.Date(row["ends_on"]); ok && end.Before(today) {
			continue
		}
		name := value.Text(row["policy"])
		if name == "" {
			name = "Unnamed policy"
		}
		types[value.Text(row["type"])] = true
		pays := strings.ToLower(value.Text(row["pays"]))
		if next, ok := value.NextDue(row["renews_on"], pays, today); ok {
			if days := int(next.Sub(today).Hours() / 24); days <= renewSoon {
				premium, _ := value.Number(row["premium"])
				owing := ""
				if premium > 0 {
					owing = ", " + Rupees(premium) + " due"
				}
				soon = append(soon, due{days, NoteLine{Icon: "event", Text: fmt.Sprintf(ph.renews, name, inDays(days), owing)}})
			}
		}
		if end, ok := value.Date(row["ends_on"]); ok && end.Sub(today) <= 365*24*time.Hour {
			ending = append(ending, NoteLine{Icon: "event_busy", Text: fmt.Sprintf(ph.ends, name, end.Format("2 Jan 2006"))})
		}
	}
	sort.SliceStable(soon, func(i, j int) bool { return soon[i].days < soon[j].days })
	for _, d := range soon {
		renewing = append(renewing, d.line)
	}
	out = append(out, renewing...)
	if !types["Health"] {
		if cash > 0 {
			out = append(out, NoteLine{Icon: "health_and_safety", Text: fmt.Sprintf(ph.noHealth, Short(cash))})
		} else {
			out = append(out, NoteLine{Icon: "health_and_safety", Text: ph.noHealthBare})
		}
	}
	// With loans and no life cover at all, the line above already says it.
	if !types["Term life"] && !bare && sum.Assets > 0 {
		out = append(out, NoteLine{Icon: "shield_person", Text: fmt.Sprintf(ph.noTerm, Short(sum.Assets))})
	}
	if owed > 0 && life >= owed {
		out = append(out, NoteLine{Icon: "verified_user", Text: fmt.Sprintf(ph.covered, Short(life), times(life/owed), Short(life-owed))})
	}
	out = append(out, ending...)
	if types["Life with savings"] {
		out = append(out, NoteLine{Icon: "savings", Text: ph.mixed})
	}
	if len(out) > 5 {
		out = out[:5]
	}
	return out
}

func times(x float64) string {
	if x >= 10 {
		return fmt.Sprintf("%.0f×", x)
	}
	return strings.TrimSuffix(fmt.Sprintf("%.1f", x), ".0") + "×"
}

func inDays(n int) string {
	switch n {
	case 0:
		return "today"
	case 1:
		return "tomorrow"
	}
	return fmt.Sprintf("in %d days", n)
}
