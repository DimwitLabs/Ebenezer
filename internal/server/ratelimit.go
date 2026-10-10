package server

import (
	"sync"
	"time"
)

const maxKeys = 50_000

// pruneEvery caps how often a flood of new keys can make a full limiter scan every key to make room.
const pruneEvery = time.Second

type limiter struct {
	mu     sync.Mutex
	limit  int
	window time.Duration
	hits   map[string][]time.Time
	pruned time.Time
}

func newLimiter(limit int, window time.Duration) *limiter {
	return &limiter{limit: limit, window: window, hits: map[string][]time.Time{}}
}

func (l *limiter) allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	if _, ok := l.hits[key]; !ok && len(l.hits) >= maxKeys {
		if now.Sub(l.pruned) >= pruneEvery {
			l.dropStale(now)
			l.pruned = now
		}
		if len(l.hits) >= maxKeys {
			return false
		}
	}
	recent := l.hits[key][:0]
	for _, t := range l.hits[key] {
		if now.Sub(t) < l.window {
			recent = append(recent, t)
		}
	}
	if len(recent) >= l.limit {
		l.hits[key] = recent
		return false
	}
	l.hits[key] = append(recent, now)
	return true
}

func (l *limiter) sweep() {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.dropStale(time.Now())
}

func (l *limiter) dropStale(now time.Time) {
	for k, ts := range l.hits {
		if len(ts) == 0 || now.Sub(ts[len(ts)-1]) >= l.window {
			delete(l.hits, k)
		}
	}
}
