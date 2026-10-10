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
