package app

import (
	"fmt"
	"math"
	"strings"

	"github.com/DimwitLabs/ebenezer/internal/store"
)

type NoteLine struct {
	Icon    string `json:"icon"`
	Text    string `json:"text"`
	Section string `json:"section,omitempty"`
}

type Note struct {
	Lead    string     `json:"lead"`
	Lines   []NoteLine `json:"lines"`
	Signoff string     `json:"signoff"`
	Sees    string     `json:"sees,omitempty"`
}

var Personalities = map[string]string{
	"accountant": "You are Ebenezer, a sceptical accountant reviewing money for one retail investor in India.",
	"coach":      "You are Ebenezer, a patient coach who helps one retail investor in India stay the course.",
	"plain":      "You are Ebenezer, a neutral ledger that reports money for one retail investor in India without opinion.",
}

var Tones = map[string]string{
	"dry":     "Write dry and plain.",
	"warm":    "Write warmly and kindly, without flattery.",
	"blunt":   "Write bluntly, in as few words as possible.",
	"playful": "Write with light wit, never at the expense of the facts.",
}

var signoffs = map[string]string{
	"accountant": "Ebenezer is a sceptical accountant, not a licensed adviser. Check before you act.",
	"coach":      "Ebenezer is a coach, not a licensed adviser. Check before you act.",
	"plain":      "A ledger, not licensed advice. Check before you act.",
	"custom":     "Written in the voice you chose. Not licensed advice; check before you act.",
}

func ModelFor(is store.InstanceSettings, p *store.Portfolio) string {
	if m := strings.TrimSpace(p.Settings.Voice.Model); m != "" {
		return m
	}
	return is.OpenRouterModel
}

// Persona returns the persona for a voice; it is also given to the news judge, so news reasons sound like the rest of Ebenezer.
func Persona(v store.Voice) string {
	p, ok := Personalities[v.Personality]
	if v.Personality == "custom" && v.Custom != "" {
		p, ok = "You are Ebenezer. "+v.Custom, true
	}
	if !ok {
		p = Personalities["accountant"]
	}
	t, ok := Tones[v.Tone]
	if !ok {
		t = Tones["dry"]
	}
	return p + " " + t
}

type phrases struct {
	empty, up, down, unpriced, ahead, behind, level, news, cash, owe, clear string
}

// phrasebook holds each tone's phrases; placeholders are filled in order, and every tone says the same facts.
var phrasebook = map[string]phrases{
	"dry": {
		empty:    "An empty ledger. Bring something in and I will start counting.",
		up:       "What you own is worth %s against %s put in.",
		down:     "What you own is worth %s, less than the %s put in.",
		unpriced: "%d holding(s) have no price yet, so I counted them at cost. Check the ISIN in Data.",
		ahead:    "Stocks: ahead of %s by %s a year. Keep an eye on whether that lasts.",
		behind:   "Stocks: behind %s by %s a year. The index would have done better with the same money on the same days.",
		level:    "Stocks: level with %s. An index fund would have done the same with less effort.",
		news:     "%d piece(s) of news worth reading, %d humbug I put aside.",
		cash:     "%s of what you own sits in savings. Inflation is eating it at %s a year.",
		owe:      "You owe %s, %s of what you own.",
		clear:    "Nothing needs you today.",
	},
	"warm": {
		empty:    "Nothing here yet. Bring in what you have and we will look at it together.",
		up:       "You have built %s from the %s you put in. Well done.",
		down:     "You own %s for the %s you put in. Markets dip; give it time.",
		unpriced: "%d holding(s) are still waiting for a price, so I used what you paid. The ISIN in Data may need a look.",
		ahead:    "Your stocks are ahead of %s by %s a year. A good run; let us see it hold.",
		behind:   "Your stocks trail %s by %s a year. Worth asking whether an index fund would be kinder to you.",
		level:    "Your stocks are keeping pace with %s. Steady is fine.",
		news:     "%d piece(s) of news are worth your time; I set aside %d you can skip.",
		cash:     "%s of what you own is in savings. With inflation at %s, some of it could work harder.",
		owe:      "You owe %s, about %s of what you own. Keep chipping away.",
		clear:    "All quiet. Enjoy your day.",
	},
	"blunt": {
		empty:    "Empty. Import something.",
		up:       "Worth %s. Put in %s.",
		down:     "Worth %s. Put in %s. Down.",
		unpriced: "%d holding(s) unpriced, counted at cost. Fix the ISIN.",
		ahead:    "Stocks beat %s by %s a year.",
		behind:   "Stocks lag %s by %s a year. Buy the index.",
		level:    "Stocks match %s. Buy the index.",
		news:     "%d story/stories matter. %d don't.",
		cash:     "%s idle in savings. Inflation: %s.",
		owe:      "Debt %s, %s of assets.",
		clear:    "Nothing to do.",
	},
	"playful": {
		empty:    "The vault echoes. Bring something in and I will start counting coins.",
		up:       "Your pile stands at %s, grown from %s. Bah, humbug? Not today.",
		down:     "Your pile stands at %s, short of the %s that went in. Even Scrooge had bad years.",
		unpriced: "%d holding(s) refuse to tell me their price, so I counted them at cost. Interrogate the ISIN in Data.",
		ahead:    "Your stocks are outrunning %s by %s a year. Do not get cocky.",
		behind:   "Your stocks are losing to %s by %s a year. The index is laughing quietly.",
		level:    "Your stocks and %s are neck and neck. The index did it asleep.",
		news:     "%d bit(s) of real news, and %d humbug swept under the rug.",
		cash:     "%s of your money is napping in savings while inflation nibbles %s a year.",
		owe:      "You owe %s, %s of what you own. The ghosts are watching.",
		clear:    "Nothing needs you. Go outside.",
	},
}

func (a *App) Note(sum *PortfolioSummary, items []store.NewsItem, v store.Voice) Note {
	ph, ok := phrasebook[v.Tone]
	if !ok {
		ph = phrasebook["dry"]
	}
	n := Note{Lines: []NoteLine{}, Signoff: signoffs[v.Personality]}
	if n.Signoff == "" {
		n.Signoff = signoffs["accountant"]
	}
	// Holdings with no known cost are left out of both sides, or their value would read as gain.
	known := sum.Assets - sum.Unknown
	switch {
	case sum.Assets == 0:
		n.Lead = ph.empty
	case known >= sum.Invested:
		n.Lead = fmt.Sprintf(ph.up, Short(known), Short(sum.Invested))
	default:
		n.Lead = fmt.Sprintf(ph.down, Short(known), Short(sum.Invested))
	}
	add := func(icon, text string) { n.Lines = append(n.Lines, NoteLine{Icon: icon, Text: text}) }
	unpriced := 0
	for _, r := range sum.Summary.Sections {
		unpriced += r.Unpriced
	}
	if unpriced > 0 {
		add("help", fmt.Sprintf(ph.unpriced, unpriced))
	}
	if s := sum.Stocks; s.Eligible && s.XIRR != nil && s.Benchmark != nil {
		gap := *s.XIRR - *s.Benchmark
		switch {
		case math.Abs(gap) < 0.005:
			add("candlestick_chart", fmt.Sprintf(ph.level, sum.Benchmark))
		case gap > 0:
			add("candlestick_chart", fmt.Sprintf(ph.ahead, sum.Benchmark, PlainPct(gap, 1)))
		default:
			add("candlestick_chart", fmt.Sprintf(ph.behind, sum.Benchmark, PlainPct(-gap, 1)))
		}
	}
	signal, humbug := 0, 0
	for _, it := range items {
		switch it.Verdict {
		case "signal":
			signal++
		case "humbug":
			humbug++
		}
	}
	if signal > 0 {
		add("newspaper", fmt.Sprintf(ph.news, signal, humbug))
	}
	cash := 0.0
	for i, r := range sum.Summary.Sections {
		if sec := sum.Sections[i]; sec.Kind == "savings" && sec.Counts {
			cash += r.Value
		}
	}
	if sum.Assets > 0 && cash/sum.Assets > 0.25 {
		add("savings", fmt.Sprintf(ph.cash, PlainPct(cash/sum.Assets, 0), PlainPct(sum.Wealth.Inflation/100, 1)))
	}
	if sum.Liabilities > 0 {
		add("request_quote", fmt.Sprintf(ph.owe, Short(sum.Liabilities), PlainPct(sum.Liabilities/math.Max(1, sum.Assets), 0)))
	}
	if len(n.Lines) == 0 {
		add("check", ph.clear)
	}
	return n
}
