package value

import (
	"math"
	"sort"
	"time"
)

// Flow is a dated amount, negative when money goes in and positive when it comes back, the terminal value included.
type Flow struct {
	Date   time.Time `json:"date"`
	Amount float64   `json:"amount"`
}

const daysPerYear = 365.0

func npv(rate float64, flows []Flow, t0 time.Time) float64 {
	total := 0.0
	for _, f := range flows {
		years := f.Date.Sub(t0).Hours() / 24 / daysPerYear
		total += f.Amount / math.Pow(1+rate, years)
	}
	return total
}

// XIRR returns the annual rate the flows imply, or false when they define none: no money in, no money out, or no sign change in the bracket.
func XIRR(flows []Flow) (float64, bool) {
	if len(flows) < 2 {
		return 0, false
	}
	sorted := append([]Flow(nil), flows...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Date.Before(sorted[j].Date) })
	var in, out bool
	for _, f := range sorted {
		in = in || f.Amount < 0
		out = out || f.Amount > 0
	}
	if !in || !out {
		return 0, false
	}
	t0 := sorted[0].Date
	if sorted[len(sorted)-1].Date.Sub(t0) < 24*time.Hour {
		return 0, false
	}

	rate := 0.1
	for i := 0; i < 50; i++ {
		f := npv(rate, sorted, t0)
		const h = 1e-6
		d := (npv(rate+h, sorted, t0) - f) / h
		if d == 0 || math.IsNaN(d) {
			break
		}
		next := rate - f/d
		if next <= -0.9999 || math.IsNaN(next) || math.IsInf(next, 0) {
			break
		}
		if math.Abs(next-rate) < 1e-9 {
			return next, true
		}
		rate = next
	}

	lo, hi := -0.9999, 100.0
	flo, fhi := npv(lo, sorted, t0), npv(hi, sorted, t0)
	if flo*fhi > 0 {
		return 0, false
	}
	for i := 0; i < 300; i++ {
		mid := (lo + hi) / 2
		fm := npv(mid, sorted, t0)
		if math.Abs(fm) < 1e-7 || hi-lo < 1e-10 {
			return mid, true
		}
		if flo*fm < 0 {
			hi = mid
		} else {
			lo, flo = mid, fm
		}
	}
	return (lo + hi) / 2, true
}
