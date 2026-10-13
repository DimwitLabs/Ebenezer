package app

import (
	"slices"
	"testing"
	"time"

	"github.com/DimwitLabs/ebenezer/internal/store"
)

func TestNextRunFindsTheFirstSlotAfterNow(t *testing.T) {
	ist := time.FixedZone("IST", 5*3600+1800)
	fri := time.Date(2026, 10, 9, 19, 0, 0, 0, ist)
	if got := (When{Days: weekdays, Times: []string{"18:45"}}).Next(fri); got == nil || !got.Equal(time.Date(2026, 10, 12, 18, 45, 0, 0, ist)) {
		t.Fatalf("weekdays after Friday evening = %v", got)
	}
	if got := (When{Days: everyDay, Times: []string{"07:00", "18:30", "21:00"}}).Next(fri); got == nil || !got.Equal(time.Date(2026, 10, 9, 21, 0, 0, 0, ist)) {
		t.Fatalf("later the same day = %v", got)
	}
	if got := dayNames([]string{"Sun", "Mon"}); !slices.Equal(got, []time.Weekday{time.Monday, time.Sunday}) {
		t.Fatalf("day names = %v", got)
	}
}

func TestEveryJobSaysWhenItRuns(t *testing.T) {
	is := store.DefaultInstanceSettings()
	p := &store.Portfolio{}
	want := map[string]string{
		"prices": "Weekdays at 18:45",
		"crypto": "Saturdays and Sundays at 18:45",
		"notes":  "After prices, crypto and news",
		"report": byHand,
	}
	for _, j := range Jobs {
		got := JobWhen(j.Name, is, p)
		if got == "" {
			t.Errorf("%s has no schedule text", j.Name)
		}
		if w, ok := want[j.Name]; ok && got != w {
			t.Errorf("%s = %q, want %q", j.Name, got, w)
		}
	}
}

func TestTheClockFiresWhatTheScreensShow(t *testing.T) {
	is := store.DefaultInstanceSettings()
	sat := time.Date(2026, 10, 10, 18, 45, 0, 0, time.UTC)
	if ChainWhen("prices", is, nil).Due(sat) || !ChainWhen("crypto", is, nil).Due(sat) {
		t.Fatal("Saturday evening should run crypto, not prices")
	}
	p := &store.Portfolio{}
	p.Settings.Report.Enabled, p.Settings.Report.Days, p.Settings.Report.Time = true, []string{"Sat"}, "18:45"
	if !ChainWhen("report", is, p).Due(sat) {
		t.Fatal("report not due on its day")
	}
}

func TestLastFindsTheMostRecentDueTime(t *testing.T) {
	ist := time.FixedZone("IST", 5*3600+1800)
	at := func(d, h, m int) time.Time { return time.Date(2026, 10, d, h, m, 0, 0, ist) }
	prices := When{Days: weekdays, Times: []string{"18:45"}}
	news := When{Days: everyDay, Times: []string{"07:00", "18:30"}}
	cases := []struct {
		name string
		w    When
		now  time.Time
		want *time.Time
	}{
		{"the due minute itself", prices, at(12, 18, 45), ptr(at(12, 18, 45))},
		{"a minute before, on a weekday", prices, at(12, 18, 44), ptr(at(9, 18, 45))},
		{"Monday morning skips the weekend", prices, at(12, 9, 2), ptr(at(9, 18, 45))},
		{"Sunday night looks back to Friday", prices, at(11, 23, 59), ptr(at(9, 18, 45))},
		{"just after midnight is yesterday's last slot", news, at(12, 0, 5), ptr(at(11, 18, 30))},
		{"between two slots on one day", news, at(12, 12, 0), ptr(at(12, 7, 0))},
		{"run only by hand", When{Text: byHand}, at(12, 12, 0), nil},
	}
	for _, c := range cases {
		got := c.w.Last(c.now)
		if (got == nil) != (c.want == nil) || (got != nil && !got.Equal(*c.want)) {
			t.Errorf("%s: Last = %v, want %v", c.name, got, c.want)
		}
	}
}

func TestOnlyASleptThroughRunIsCaughtUp(t *testing.T) {
	ist := time.FixedZone("IST", 5*3600+1800)
	prices := When{Days: weekdays, Times: []string{"18:45"}}
	mon := time.Date(2026, 10, 12, 9, 2, 0, 0, ist)
	fri := time.Date(2026, 10, 9, 18, 45, 0, 0, ist)
	if got := prices.Missed(mon, mon, fri.Add(-24*time.Hour)); got == nil || !got.Equal(fri) {
		t.Fatalf("Friday's run slept through = %v", got)
	}
	if got := prices.Missed(mon, mon, fri.Add(10*time.Second)); got != nil {
		t.Fatalf("caught up though Friday's ran: %v", got)
	}
	if got := prices.Missed(mon, mon, time.Time{}); got != nil {
		t.Fatalf("caught up a job that has never run: %v", got)
	}
	in := time.Date(2026, 10, 12, 18, 45, 30, 0, ist)
	if got := prices.Missed(in, in, fri); got != nil {
		t.Fatalf("caught up in the due minute itself: %v", got)
	}
}

func TestASlotMovedEarlierWhileAwakeIsNotCaughtUp(t *testing.T) {
	ist := time.FixedZone("IST", 5*3600+1800)
	awake := time.Date(2026, 10, 12, 8, 0, 0, 0, ist)
	lastRun := time.Date(2026, 10, 9, 21, 0, 5, 0, ist)
	now := time.Date(2026, 10, 12, 20, 0, 0, 0, ist)
	moved := When{Days: weekdays, Times: []string{"19:00"}}
	if got := moved.Missed(now, awake, lastRun); got != nil {
		t.Fatalf("a slot moved to before now, with the scheduler up since morning, was caught up: %v", got)
	}
	if got := moved.Missed(now, now, lastRun); got == nil || !got.Equal(time.Date(2026, 10, 12, 19, 0, 0, 0, ist)) {
		t.Fatalf("the same slot slept through = %v", got)
	}
}

func ptr(t time.Time) *time.Time { return &t }
