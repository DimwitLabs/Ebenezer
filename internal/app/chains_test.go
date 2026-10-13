package app

import (
	"context"
	"testing"
	"time"
)

func TestAStopAimedAtAFinishedJobDoesNotStopItsNextRun(t *testing.T) {
	a := New(nil, Config{})
	a.stopped["news:p"] = true
	_, done, err := a.begin(context.Background(), "news:p", time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	defer done()
	if a.wasStopped("news:p") {
		t.Fatal("a stale stop marked the next run stopped")
	}
}

func TestAChainWaitingOnAnotherRunTakesItsOutcome(t *testing.T) {
	a := New(nil, Config{})
	_, done, err := a.begin(context.Background(), "snapshot:p", time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	go func() {
		time.Sleep(50 * time.Millisecond)
		a.mu.Lock()
		a.lastOK["snapshot:p"] = false
		a.mu.Unlock()
		done()
	}()
	if a.step(context.Background(), "chain:news:p", "snapshot", "p", nil) {
		t.Fatal("the chain carried on after the run it waited on failed")
	}
	if step := a.chainStep["chain:news:p"]; step != "" {
		t.Fatalf("chain left pointing at %q", step)
	}
}
