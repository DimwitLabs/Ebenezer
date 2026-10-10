package app

import (
	"context"
	"sync"

	"github.com/DimwitLabs/ebenezer/internal/store"
)

type factsKey struct{}

type facts struct {
	mu   sync.Mutex
	list []store.Fact
}

func withFacts(ctx context.Context) (context.Context, *facts) {
	f := &facts{}
	return context.WithValue(ctx, factsKey{}, f), f
}

// fact records a fact for the current run; outside a run, facts go nowhere.
func fact(ctx context.Context, label, value string) {
	f, ok := ctx.Value(factsKey{}).(*facts)
	if !ok {
		return
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	f.list = append(f.list, store.Fact{Label: label, Value: value})
}

func (f *facts) all() []store.Fact {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.list
}
