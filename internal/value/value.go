package value

import (
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/DimwitLabs/ebenezer/internal/kinds"
)

type Holding struct {
	Key         string
	ISIN        string
	Name        string
	Quantity    float64
	Cost        float64
	CostUnknown bool
}

type Section struct {
	ID         string
	Kind       string
	Valuation  string
	Rate       *float64
	ValueField string
	CostField  string
	DateField  string
	Counts     bool
	Rows       []map[string]any
	Holdings   []Holding
}

type Prices map[string]float64

type Position struct {
	Key      string   `json:"key"`
	Name     string   `json:"name"`
	ISIN     string   `json:"isin,omitempty"`
	Quantity float64  `json:"quantity,omitempty"`
	Price    *float64 `json:"price"`
	Value    float64  `json:"value"`
	Invested float64  `json:"invested"`
	XIRR     *float64 `json:"xirr"`
	// industry for a share, category for a fund
	Group string `json:"group,omitempty"`
	// lets a rate over only a few weeks be held back
	Days    int    `json:"days"`
	Stale   bool   `json:"stale,omitempty"`
	Bullion bool   `json:"bullion,omitempty"`
	From    string `json:"from,omitempty"`
	// counted in value but not invested, so it adds no false gain
	CostUnknown bool `json:"costUnknown,omitempty"`
	flows       []Flow
}

type Result struct {
	SectionID string     `json:"sectionId"`
	Value     float64    `json:"value"`
	Invested  float64    `json:"invested"`
	Positions []Position `json:"positions"`
	Flows     []Flow     `json:"-"`
	FlowValue float64    `json:"-"`
	Unpriced  int        `json:"unpriced"`
	Unknown   float64    `json:"unknown"`
	Returns   Returns    `json:"returns"`
}

type Env struct {
	Today         time.Time
	Prices        Prices
	Categories    map[string]string
	GoldPerGram   float64
	SilverPerGram float64
}

func (e Env) MetalRate(metal string) float64 {
	switch strings.ToLower(strings.TrimSpace(metal)) {
	case "silver":
		return e.SilverPerGram
	case "gold 22k":
		return e.GoldPerGram * 22 / 24
	case "gold 18k":
		return e.GoldPerGram * 18 / 24
	}
	return e.GoldPerGram
}

func (e Env) years(from time.Time) float64 {
	return e.Today.Sub(from).Hours() / 24 / daysPerYear
}

// Value values a section; its flows exclude the terminal value so wealth XIRR can be taken across every section at once.
func Value(sec Section, env Env) Result {
	r := Result{SectionID: sec.ID, Positions: []Position{}}
	switch sec.Valuation {
	case kinds.Market, kinds.NAV:
		valueHoldings(sec, env, &r)
	case kinds.Gold:
		eachRow(sec, env, &r, func(row map[string]any) (float64, float64, string) {
			grams, _ := Number(row["grams"])
			cost, _ := Number(row[sec.CostField])
			return grams * env.MetalRate(Text(row["metal"])), cost, Text(row["item"])
		})
	case kinds.Deposit:
		valueDeposits(sec, env, &r)
	case kinds.Balance, kinds.Manual:
		eachRow(sec, env, &r, func(row map[string]any) (float64, float64, string) {
			v, _ := Number(row[sec.ValueField])
			c, ok := Number(row[sec.CostField])
			if !ok {
				c = v
			}
			if rate, ok := Number(row["rate"]); ok && sec.Valuation == kinds.Balance {
				if d, ok := Date(row[sec.DateField]); ok && d.Before(env.Today) {
					v = Deposit(v, rate, "Quarterly", d, env.Today)
				}
			}
			return v, c, rowName(row)
		})
	case kinds.Liability:
		eachRow(sec, env, &r, func(row map[string]any) (float64, float64, string) {
			v, _ := Number(row[sec.ValueField])
			return -v, 0, rowName(row)
		})
	case kinds.Rate:
		eachRow(sec, env, &r, func(row map[string]any) (float64, float64, string) {
			c, _ := Number(row[sec.CostField])
			rate := 0.0
			if sec.Rate != nil {
				rate = *sec.Rate
			}
			v := c
			if d, ok := Date(row[sec.DateField]); ok && d.Before(env.Today) {
				v = c * math.Pow(1+rate/100, env.years(d))
			}
			return v, c, rowName(row)
		})
	}
	return r
}

func (p *Position) returns(flows []Flow, today time.Time) {
	first := today
	for _, f := range flows {
		if f.Date.Before(first) {
			first = f.Date
		}
	}
	p.Days = int(today.Sub(first).Hours() / 24)
	if x, ok := XIRR(append(append([]Flow(nil), flows...), Flow{Date: today, Amount: p.Value})); ok {
		p.XIRR = &x
	}
}

func eachRow(sec Section, env Env, r *Result, f func(map[string]any) (value, cost float64, name string)) {
	for i, row := range sec.Rows {
		v, c, name := f(row)
		r.Value += v
		r.Invested += c
		p := Position{Key: strconv.Itoa(i), Name: name, Value: v, Invested: c}
		if d, ok := Date(row[sec.DateField]); ok && c > 0 {
			in := Flow{Date: d, Amount: -c}
			r.Flows = append(r.Flows, in)
			r.FlowValue += v
			p.returns([]Flow{in}, env.Today)
		}
		r.Positions = append(r.Positions, p)
	}
}

// valueDeposits values deposits with each RD instalment earning from its own date, which is how banks quote an RD's maturity value.
func valueDeposits(sec Section, env Env, r *Result) {
	for i, row := range sec.Rows {
		amount, _ := Number(row["amount"])
		rate, _ := Number(row["rate"])
		name := Text(row["bank"])
		p := Position{Key: strconv.Itoa(i), Name: name}
		start, ok := Date(row["start"])
		if !ok {
			p.Value, p.Invested = amount, amount
			r.Value += amount
			r.Invested += amount
			r.Positions = append(r.Positions, p)
			continue
		}
		end := env.Today
		maturity, matures := Date(row["maturity"])
		if matures && maturity.Before(end) {
			end = maturity
		}
		compounding := Text(row["compounding"])
		var flows []Flow
		for _, day := range instalments(row, start, maturity, matures, env.Today) {
			p.Value += Deposit(amount, rate, compounding, day, end)
			p.Invested += amount
			flows = append(flows, Flow{Date: day, Amount: -amount})
		}
		if matures && maturity.Before(env.Today) {
			p.Value, flows = afterMaturity(Text(row["on_maturity"]), p.Value, p.Invested, rate, compounding, start, maturity, env.Today, flows)
			switch Text(row["on_maturity"]) {
			case kinds.CreditToAccount:
				// nothing is left in it, so nothing counts as invested; the flows keep its XIRR
				p.Invested = 0
				p.Name += " · matured, paid out"
			case kinds.Reinvest, kinds.ReinvestPrincipal:
				p.Name += " · renewed"
			}
		}
		r.Value += p.Value
		r.Invested += p.Invested
		if len(flows) > 0 {
			r.Flows = append(r.Flows, flows...)
			r.FlowValue += p.Value
			p.returns(flows, env.Today)
		}
		r.Positions = append(r.Positions, p)
	}
}

func afterMaturity(instruction string, value, principal, rate float64, compounding string, start, maturity, today time.Time, flows []Flow) (float64, []Flow) {
	switch instruction {
	case kinds.CreditToAccount:
		return 0, append(flows, Flow{Date: maturity, Amount: value})
	case kinds.Reinvest, kinds.ReinvestPrincipal:
	default:
		return value, flows
	}
	// Banks renew on the same calendar date whatever leap years do, so terms are months plus days.
	months := (maturity.Year()-start.Year())*12 + int(maturity.Month()-start.Month())
	if start.AddDate(0, months, 0).After(maturity) {
		months--
	}
	days := int(maturity.Sub(start.AddDate(0, months, 0)).Hours() / 24)
	if months <= 0 && days <= 0 {
		return value, flows
	}
	from := maturity
	for i := 0; i < 400; i++ {
		if instruction == kinds.ReinvestPrincipal && value > principal {
			flows = append(flows, Flow{Date: from, Amount: value - principal})
			value = principal
		}
		next := from.AddDate(0, months, days)
		if next.After(today) {
			return Deposit(value, rate, compounding, from, today), flows
		}
		value = Deposit(value, rate, compounding, from, next)
		from = next
	}
	return value, flows
}

func Recurring(row map[string]any) bool {
	t := strings.ToLower(Text(row["type"]))
	return t == "recurring" || t == "rd"
}

func instalments(row map[string]any, start, maturity time.Time, matures bool, today time.Time) []time.Time {
	if !Recurring(row) {
		if start.After(today) {
			return nil
		}
		return []time.Time{start}
	}
	var days []time.Time
	for k := 0; k < 600; k++ {
		d := start.AddDate(0, k, 0)
		if d.After(today) || (matures && !d.Before(maturity)) {
			break
		}
		days = append(days, d)
	}
	return days
}

func rowName(row map[string]any) string {
	for _, k := range []string{"name", "account", "lender", "property", "item", "bank", "title"} {
		if s := Text(row[k]); s != "" {
			return s
		}
	}
	for _, v := range row {
		if s, ok := v.(string); ok && s != "" {
			if _, isNum := Number(s); !isNum {
				return s
			}
		}
	}
	return ""
}

var bullionName = regexp.MustCompile(`(?i)\bgold\b|\bsilver\b|\bbullion\b|\bSGB|sovereign gold`)

func valueHoldings(sec Section, env Env, r *Result) {
	flows := map[string][]Flow{}
	for _, row := range sec.Rows {
		key, f, ok := TradeFlow(sec.Kind, row)
		if ok && !opening(row) {
			flows[key] = append(flows[key], f)
			r.Flows = append(r.Flows, f)
		}
	}
	for _, h := range sec.Holdings {
		if h.Quantity <= 0 {
			continue
		}
		p := Position{Key: h.Key, Name: h.Name, ISIN: h.ISIN, Quantity: h.Quantity, Invested: h.Cost, Bullion: bullionName.MatchString(h.Name), CostUnknown: h.CostUnknown, Group: env.Categories[h.ISIN]}
		if price, ok := env.Prices[h.ISIN]; ok && price > 0 {
			p.Price = &price
			p.Value = h.Quantity * price
		} else {
			p.Value = h.Cost
			p.Stale = true
			r.Unpriced++
		}
		hf := flows[h.Key]
		if len(hf) == 0 && h.ISIN != "" {
			hf = flows[h.ISIN]
		}
		p.flows = hf
		if len(hf) > 0 {
			r.FlowValue += p.Value
			p.returns(hf, env.Today)
		}
		r.Value += p.Value
		if p.CostUnknown {
			r.Unknown += p.Value
		} else {
			r.Invested += p.Invested
		}
		r.Positions = append(r.Positions, p)
	}
}

// TradeFlow reads a row as a trade, so a position and its cash flows never disagree; a fund's dividend payout is money back without one.
func TradeFlow(kind string, row map[string]any) (string, Flow, bool) {
	t, ok := parseRow(kind, row)
	if !ok || t.Amount == 0 {
		return t.Key, Flow{}, false
	}
	if t.Sell || t.payout {
		return t.Key, Flow{Date: t.Day, Amount: t.Amount}, true
	}
	return t.Key, Flow{Date: t.Day, Amount: -t.Amount}, true
}

func Deposit(amount, rate float64, compounding string, start, end time.Time) float64 {
	if !end.After(start) {
		return amount
	}
	years := end.Sub(start).Hours() / 24 / daysPerYear
	r := rate / 100
	n := 4.0
	switch strings.ToLower(compounding) {
	case "simple":
		return amount * (1 + r*years)
	case "monthly":
		n = 12
	case "yearly":
		n = 1
	}
	return amount * math.Pow(1+r/n, n*years)
}
