package app

import (
	"strings"
	"testing"
	"time"
)

func TestAFailingSourceIsAlertedDailyAndSaidToBeBack(t *testing.T) {
	day := func(d int) time.Time { return time.Date(2026, 10, d, 9, 0, 0, 0, Zone) }
	var prev []Check
	run := func(now time.Time, ok bool) ([]string, []string) {
		checks := []Check{{Name: "NSE bhavcopy", OK: ok, Detail: "404 Not Found"}}
		alerts, back := review(prev, checks, now)
		prev = checks
		return alerts, back
	}
	if alerts, _ := run(day(1), false); len(alerts) != 0 {
		t.Fatalf("one failure alerted: %v", alerts)
	}
	if alerts, _ := run(day(2), false); len(alerts) != 1 || !strings.Contains(alerts[0], "failed for 2 days") {
		t.Fatalf("second failure = %v", alerts)
	}
	if alerts, _ := run(day(2).Add(time.Hour), false); len(alerts) != 0 {
		t.Fatalf("a second run the same day alerted again: %v", alerts)
	}
	if alerts, _ := run(day(3), false); len(alerts) != 1 || !strings.Contains(alerts[0], "failed for 3 days") {
		t.Fatalf("third day = %v", alerts)
	}
	if alerts, back := run(day(4), true); len(alerts) != 0 || len(back) != 1 || !strings.Contains(back[0], "after failing for 3 days") {
		t.Fatalf("recovery = %v, %v", alerts, back)
	}
	if _, back := run(day(5), true); len(back) != 0 {
		t.Fatalf("said it was back twice: %v", back)
	}
	run(day(6), false)
	if _, back := run(day(7), true); len(back) != 0 {
		t.Fatalf("a single blip was said to be back: %v", back)
	}
}
