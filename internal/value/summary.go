package value

import (
	"math"
	"sort"
	"time"

	"github.com/DimwitLabs/ebenezer/internal/kinds"
)

type Returns struct {
	XIRR      *float64 `json:"xirr"`
	Benchmark *float64 `json:"benchmark"`
	Inflation float64  `json:"inflation"`
	Days      int      `json:"days"`
	Eligible  bool     `json:"eligible"`
}

type Summary struct {
	NetWorth    float64     `json:"netWorth"`
	Assets      float64     `json:"assets"`
	Liabilities float64     `json:"liabilities"`
	Invested    float64     `json:"invested"`
	Unknown     float64     `json:"unknown"`
	Wealth      Returns     `json:"wealth"`
	Stocks      Returns     `json:"stocks"`
	Sections    []Result    `json:"sections"`
	Protection  *Protection `json:"protection"`
}

type IndexPoint struct {
	Day   time.Time
	Close float64
}

type Series []IndexPoint

func (s Series) At(day time.Time) (float64, bool) {
	i := sort.Search(len(s), func(i int) bool { return s[i].Day.After(day) })
	if i == 0 {
		return 0, false
	}
	return s[i-1].Close, true
}

type Options struct {
	Inflation   float64
	XIRRMinDays int
	Benchmark   Series
	Moves       map[string]string
}

func Summarise(sections []Section, env Env, opt Options) Summary {
	sum := Summary{Sections: []Result{}}
	for _, sec := range sections {
		sum.Sections = append(sum.Sections, Value(sec, env))
	}
	move(sum.Sections, opt.Moves)
	var wealthFlows, stockFlows []Flow
	var assets, stockValue float64
	for i, sec := range sections {
		r := &sum.Sections[i]
		if sec.Valuation != kinds.Liability {
			r.Returns = returns(r.Flows, r.FlowValue, env.Today, opt)
		}
		if !sec.Counts {
			continue
		}
		sum.NetWorth += r.Value
		sum.Invested += r.Invested
		sum.Unknown += r.Unknown
		if sec.Valuation == kinds.Liability {
			sum.Liabilities -= r.Value
		} else {
			sum.Assets += r.Value
		}
		if sec.Valuation != kinds.Liability {
			wealthFlows = append(wealthFlows, r.Flows...)
			assets += r.FlowValue
		}
		if sec.Kind == "stocks" {
			stockFlows = append(stockFlows, r.Flows...)
			stockValue += r.FlowValue
		}
	}
	sum.Protection = protect(sections, env.Today)
	sum.Wealth = returns(wealthFlows, assets, env.Today, opt)
	sum.Stocks = returns(stockFlows, stockValue, env.Today, opt)
	return sum
}

func move(results []Result, moves map[string]string) {
	if len(moves) == 0 {
		return
	}
	index := map[string]int{}
	for i, r := range results {
		index[r.SectionID] = i
	}
	for i := range results {
		from := &results[i]
		kept := from.Positions[:0]
		for _, p := range from.Positions {
			j, ok := index[moves[p.ISIN]]
			if p.ISIN == "" || !ok || j == i {
				kept = append(kept, p)
				continue
			}
			to := &results[j]
			from.Value -= p.Value
			if p.CostUnknown {
				from.Unknown -= p.Value
				to.Unknown += p.Value
			} else {
				from.Invested -= p.Invested
				to.Invested += p.Invested
			}
			from.Flows = without(from.Flows, p.flows)
			p.From = from.SectionID
			to.Value += p.Value
			to.Flows = append(to.Flows, p.flows...)
			if len(p.flows) > 0 {
				from.FlowValue -= p.Value
				to.FlowValue += p.Value
			}
			to.Positions = append(to.Positions, p)
		}
		from.Positions = kept
	}
}

func without(all, drop []Flow) []Flow {
	left := map[Flow]int{}
	for _, f := range drop {
		left[f]++
	}
	out := make([]Flow, 0, len(all))
	for _, f := range all {
		if left[f] > 0 {
			left[f]--
			continue
		}
		out = append(out, f)
	}
	return out
}

func returns(flows []Flow, value float64, today time.Time, opt Options) Returns {
	r := Returns{Inflation: opt.Inflation}
	if len(flows) == 0 {
		return r
	}
	first := flows[0].Date
	for _, f := range flows {
		if f.Date.Before(first) {
			first = f.Date
		}
	}
	r.Days = int(today.Sub(first).Hours() / 24)
	r.Eligible = r.Days >= opt.XIRRMinDays
	if !r.Eligible {
		return r
	}
	all := append(append([]Flow(nil), flows...), Flow{Date: today, Amount: value})
	if x, ok := XIRR(all); ok {
		r.XIRR = round(x)
	}
	if b, ok := Benchmark(flows, opt.Benchmark, today); ok {
		r.Benchmark = round(b)
	}
	return r
}

// Benchmark replays the same flows through the index: rupees in buy index units that day, rupees out sell them.
func Benchmark(flows []Flow, series Series, today time.Time) (float64, bool) {
	last, ok := series.At(today)
	if !ok {
		return 0, false
	}
	units := 0.0
	for _, f := range flows {
		close, ok := series.At(f.Date)
		if !ok || close <= 0 {
			return 0, false
		}
		units -= f.Amount / close
	}
	if units < 0 {
		units = 0
	}
	all := append(append([]Flow(nil), flows...), Flow{Date: today, Amount: units * last})
	return XIRR(all)
}

func round(x float64) *float64 {
	v := math.Round(x*10000) / 10000
	return &v
}
