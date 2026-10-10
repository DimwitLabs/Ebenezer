package app

import (
	"context"
	"errors"
	"log/slog"
	"time"
)

// Chain is a set of jobs run in order, named for what it does rather than when, since every time can be changed.
type Chain struct {
	Name  string `json:"name"`
	Label string `json:"label"`
	Steps []Step `json:"steps"`
	// Non-portfolio chains run shared steps once and portfolio steps for every portfolio.
	Portfolio bool `json:"portfolio"`
}

type Step struct {
	Job   string `json:"job"`
	Label string `json:"label"`
}

var Chains = []Chain{
	{Name: "prices", Label: "Prices", Steps: []Step{{"prices", "Exchange and fund prices"}, {"benchmark", "Benchmark history"}, {"snapshot", "Net worth snapshot"}, {"notes", "Ebenezer's notes"}}},
	{Name: "crypto", Label: "Crypto", Steps: []Step{{"crypto", "Coin prices"}, {"snapshot", "Net worth snapshot"}, {"notes", "Ebenezer's notes"}}},
	{Name: "news", Label: "News", Portfolio: true, Steps: []Step{{"news", "Fetch and judge news"}, {"notes", "Ebenezer's notes"}}},
	{Name: "report", Label: "Email report", Portfolio: true, Steps: []Step{{"report", "Email report"}}},
	{Name: "health", Label: "Health check", Steps: []Step{{"health", "Health check"}}},
}

func ChainByName(name string) (Chain, bool) {
	for _, c := range Chains {
		if c.Name == name {
			return c, true
		}
	}
	return Chain{}, false
}

func chainKey(c Chain, portfolioID string) string {
	if !c.Portfolio {
		portfolioID = ""
	}
	return "chain:" + c.Name + ":" + portfolioID
}

func (a *App) StartChain(name, portfolioID string) error {
	c, ok := ChainByName(name)
	if !ok {
		return errors.New("no such schedule")
	}
	key := chainKey(c, portfolioID)
	ctx, done, err := a.begin(context.Background(), key, 2*time.Hour)
	if err != nil {
		return err
	}
	go func() {
		defer done()
		a.runChain(ctx, key, c, portfolioID)
	}()
	return nil
}

func (a *App) startChainQuietly(name, portfolioID string) {
	if err := a.StartChain(name, portfolioID); err != nil && !errors.Is(err, ErrRunning) {
		slog.Error("starting schedule", "schedule", name, "err", err)
	}
}

func (a *App) ChainRunning(name, portfolioID string) bool {
	c, _ := ChainByName(name)
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.running[chainKey(c, portfolioID)]
}

func (a *App) StopChain(name, portfolioID string) error {
	c, _ := ChainByName(name)
	key := chainKey(c, portfolioID)
	a.mu.Lock()
	defer a.mu.Unlock()
	cancel, ok := a.cancels[key]
	if !ok {
		return ErrNotRunning
	}
	if step := a.chainStep[key]; step != "" {
		a.stopped[step] = true
	}
	cancel()
	return nil
}

// runChain runs a chain's steps in order; a failing shared step stops the chain, and a failing portfolio step stops it for that portfolio only.
func (a *App) runChain(ctx context.Context, key string, c Chain, portfolioID string) {
	failed := map[string]bool{}
	for _, s := range c.Steps {
		j, _ := JobByName(s.Job)
		pids := []string{""}
		if j.Portfolio {
			pids = []string{portfolioID}
			if !c.Portfolio {
				ps, err := a.Store.AllPortfolios(ctx)
				if err != nil {
					slog.Error("listing portfolios", "err", err)
					return
				}
				pids = pids[:0]
				for _, p := range ps {
					pids = append(pids, p.ID)
				}
			}
		}
		for _, pid := range pids {
			if failed[pid] || (s.Job == "notes" && !a.mayVoice(ctx, pid)) {
				continue
			}
			ok := a.step(ctx, key, s.Job, pid)
			if ctx.Err() != nil {
				return
			}
			if !ok {
				if !j.Portfolio {
					return
				}
				failed[pid] = true
			}
		}
	}
}

// step runs one job of a chain; a copy already running, started by hand or by a page load, is waited for rather than run twice.
func (a *App) step(ctx context.Context, chain, job, portfolioID string) bool {
	key := job + ":" + portfolioID
	sctx, done, err := a.begin(ctx, key, 30*time.Minute)
	if errors.Is(err, ErrRunning) {
		for a.Running(job, portfolioID) {
			select {
			case <-ctx.Done():
				return false
			case <-time.After(2 * time.Second):
			}
		}
		a.mu.Lock()
		defer a.mu.Unlock()
		return a.lastOK[key]
	}
	defer done()
	a.mu.Lock()
	a.chainStep[chain] = key
	a.mu.Unlock()
	defer func() {
		a.mu.Lock()
		delete(a.chainStep, chain)
		a.mu.Unlock()
	}()
	return a.run(sctx, job, portfolioID)
}
