package app

import (
	"slices"
	"strings"
	"time"

	"github.com/DimwitLabs/ebenezer/internal/store"
)

var (
	weekdays = []time.Weekday{time.Monday, time.Tuesday, time.Wednesday, time.Thursday, time.Friday}
	weekends = []time.Weekday{time.Saturday, time.Sunday}
	everyDay = append(slices.Clone(weekdays), weekends...)
)

// When says when a chain runs on its own; no days means only when someone runs it.
type When struct {
	Text  string
	Days  []time.Weekday
	Times []string
}

const byHand = "Only when you run it"

// ChainWhen is the one place a schedule is read from settings, for the clock and for the screens alike.
func ChainWhen(name string, is store.InstanceSettings, p *store.Portfolio) When {
	switch name {
	case "prices":
		return When{"Weekdays at " + is.PricesTime, weekdays, []string{is.PricesTime}}
	case "crypto":
		// Coins trade at weekends too, when the exchanges have nothing new.
		return When{"Saturdays and Sundays at " + is.PricesTime, weekends, []string{is.PricesTime}}
	case "health":
		return When{"Daily at " + is.HealthTime, everyDay, []string{is.HealthTime}}
	case "news":
		if n := p.Settings.News; n.Enabled && len(n.Times) > 0 {
			return When{"Daily at " + strings.Join(n.Times, ", "), everyDay, n.Times}
		}
	case "report":
		if r := p.Settings.Report; r.Enabled && len(r.Days) > 0 {
			return When{strings.Join(r.Days, ", ") + " at " + r.Time, dayNames(r.Days), []string{r.Time}}
		}
	}
	return When{Text: byHand}
}

// JobWhen describes when a job runs: one that starts its own chain shares its schedule, and one further down runs after the chains it is in.
func JobWhen(name string, is store.InstanceSettings, p *store.Portfolio) string {
	var after []string
	for _, c := range Chains {
		for i, s := range c.Steps {
			if s.Job != name {
				continue
			}
			if i == 0 && c.Name == name {
				return ChainWhen(c.Name, is, p).Text
			}
			after = append(after, strings.ToLower(c.Label))
		}
	}
	switch len(after) {
	case 0:
		return byHand
	case 1:
		return "After " + after[0]
	}
	return "After " + strings.Join(after[:len(after)-1], ", ") + " and " + after[len(after)-1]
}

func (w When) Due(now time.Time) bool {
	return slices.Contains(w.Days, now.Weekday()) && slices.Contains(w.Times, now.Format("15:04"))
}

func (w When) Next(now time.Time) *time.Time {
	for d := 0; d <= 7; d++ {
		var best *time.Time
		for _, when := range w.slots(now.AddDate(0, 0, d)) {
			if when.After(now) && (best == nil || when.Before(*best)) {
				best = &when
			}
		}
		if best != nil {
			return best
		}
	}
	return nil
}

// Last is the latest due time at or before now, within the past week.
func (w When) Last(now time.Time) *time.Time {
	for d := 0; d <= 7; d++ {
		var best *time.Time
		for _, when := range w.slots(now.AddDate(0, 0, -d)) {
			if !when.After(now) && (best == nil || when.After(*best)) {
				best = &when
			}
		}
		if best != nil {
			return best
		}
	}
	return nil
}

func (w When) slots(day time.Time) []time.Time {
	if !slices.Contains(w.Days, day.Weekday()) {
		return nil
	}
	var out []time.Time
	for _, t := range w.Times {
		at, err := time.ParseInLocation("15:04", t, day.Location())
		if err == nil {
			out = append(out, time.Date(day.Year(), day.Month(), day.Day(), at.Hour(), at.Minute(), 0, 0, day.Location()))
		}
	}
	return out
}

// Missed is the due time a chain slept through: the latest before the scheduler woke at awake, with no run since and its minute past.
// Only times before awake count, so a slot moved earlier while the scheduler ran is not mistaken for one slept through; a chain never run waits for its first time.
func (w When) Missed(now, awake, lastRun time.Time) *time.Time {
	due := w.Last(awake)
	if due == nil || lastRun.IsZero() || !lastRun.Before(*due) || now.Sub(*due) < time.Minute {
		return nil
	}
	return due
}

func dayNames(names []string) []time.Weekday {
	var out []time.Weekday
	for i, n := range Weekdays {
		if slices.Contains(names, n) {
			out = append(out, time.Weekday((i+1)%7))
		}
	}
	return out
}
