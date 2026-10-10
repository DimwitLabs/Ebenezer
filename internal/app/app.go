package app

import (
	"context"
	"encoding/json"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/DimwitLabs/ebenezer/internal/kinds"
	"github.com/DimwitLabs/ebenezer/internal/market"
	"github.com/DimwitLabs/ebenezer/internal/news"
	"github.com/DimwitLabs/ebenezer/internal/seal"
	"github.com/DimwitLabs/ebenezer/internal/store"
	"github.com/DimwitLabs/ebenezer/internal/value"
)

// Zone is the time zone from TZ, falling back to India time: a container left on UTC is never what an Indian investor means.
var Zone = zone(os.Getenv("TZ"))

func zone(name string) *time.Location {
	if name != "" {
		if loc, err := time.LoadLocation(name); err == nil {
			return loc
		}
	}
	if loc, err := time.LoadLocation("Asia/Kolkata"); err == nil {
		return loc
	}
	return market.IST
}

type Config struct {
	Seal      *seal.Box
	Secrets   map[string]string
	NtfyURL   string
	PublicURL string
}

type App struct {
	Store  *store.Store
	Market *market.Client
	News   *news.Fetcher
	cfg    Config

	mu       sync.Mutex
	running  map[string]bool
	progress map[string]Progress
	cancels  map[string]context.CancelFunc
	stopped  map[string]bool
	// How each job's latest run ended, for a chain that waited on a run it did not start.
	lastOK map[string]bool
	// Job key each running chain is on, so stopping the chain marks that step stopped.
	chainStep map[string]string
	scripAt   map[string]time.Time
	// Throttles page-load retries after a failed notes write.
	voicedFailed map[string]time.Time
	historyTried time.Time
	models       []Model
	// Secrets that would not open under this key, logged once each.
	unopened sync.Map
	modelsAt time.Time
	rebuild  sync.Mutex
}

func New(st *store.Store, cfg Config) *App {
	return &App{Store: st, Market: market.New(), News: news.NewFetcher(), cfg: cfg, running: map[string]bool{}, progress: map[string]Progress{},
		cancels: map[string]context.CancelFunc{}, stopped: map[string]bool{}, lastOK: map[string]bool{}, chainStep: map[string]string{}, scripAt: map[string]time.Time{}, voicedFailed: map[string]time.Time{}}
}

func Today() time.Time {
	now := time.Now().In(market.IST)
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
}

func (a *App) PublicURL() string { return a.cfg.PublicURL }

func (a *App) NtfyURL(ctx context.Context) string {
	is, err := a.Store.InstanceSettings(ctx)
	if err == nil && is.NtfyURL != "" {
		return is.NtfyURL
	}
	return a.cfg.NtfyURL
}

// RebuildHoldings fills ISINs and official names so prices and news can find each scrip by more than its ticker.
func (a *App) RebuildHoldings(ctx context.Context, sec *store.Section) error {
	k, ok := kinds.Get(sec.Kind)
	if !ok || !k.Holdings {
		return nil
	}
	// An import during the evening rebuild must not have its rows overwritten by an older read.
	a.rebuild.Lock()
	defer a.rebuild.Unlock()
	rows, err := a.Store.Rows(ctx, sec.ID)
	if err != nil {
		return err
	}
	resolved, err := a.resolveRows(ctx, decodeRows(rows))
	if err != nil {
		return err
	}
	derived := value.Holdings(sec.Kind, resolved)
	isins := make([]string, 0, len(derived))
	for _, d := range derived {
		isins = append(isins, d.ISIN)
	}
	known, err := a.Store.SecuritiesByISIN(ctx, isins)
	if err != nil {
		return err
	}
	out := make([]store.Holding, 0, len(derived))
	for _, d := range derived {
		h := store.Holding{Key: d.Key, ISIN: d.ISIN, Symbol: d.Symbol, Name: d.Name, Quantity: d.Quantity, Cost: d.Cost, Realised: d.Realised, CostUnknown: d.CostUnknown}
		if sec, ok := known[h.ISIN]; ok {
			h.Name = sec.Name
			if h.Symbol == "" || h.Symbol == h.ISIN {
				h.Symbol = sec.Symbol
			}
		}
		if h.Quantity > 0 {
			first := d.FirstDate.Format("2006-01-02")
			h.FirstDate = &first
		}
		out = append(out, h)
	}
	return a.Store.ReplaceHoldings(ctx, sec.ID, out)
}

// resolveRows resolves ticker or BSE-code rows to an ISIN so a scrip entered both ways lands in one holding.
func (a *App) resolveRows(ctx context.Context, rows []map[string]any) ([]map[string]any, error) {
	var symbols []string
	for _, r := range rows {
		if value.Text(r["isin"]) == "" {
			if s := strings.ToUpper(value.Text(r["symbol"])); s != "" {
				symbols = append(symbols, s)
			}
		}
	}
	if len(symbols) == 0 {
		return rows, nil
	}
	known, err := a.Store.SecuritiesBySymbol(ctx, symbols)
	if err != nil {
		return nil, err
	}
	for _, r := range rows {
		if value.Text(r["isin"]) != "" {
			continue
		}
		if sec, ok := known[strings.ToUpper(value.Text(r["symbol"]))]; ok {
			r["isin"] = sec.ISIN
		}
	}
	return rows, nil
}

// Trades returns a section's trades for one holding, newest first.
func (a *App) Trades(ctx context.Context, sec store.Section, key string) ([]value.Trade, error) {
	stored, err := a.Store.Rows(ctx, sec.ID)
	if err != nil {
		return nil, err
	}
	rows, err := a.resolveRows(ctx, decodeRows(stored))
	if err != nil {
		return nil, err
	}
	out := []value.Trade{}
	for _, r := range rows {
		if t, ok := value.ParseTrade(sec.Kind, r); ok && t.Key == key {
			out = append(out, t)
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Day.After(out[j].Day) })
	return out, nil
}

func decodeRows(rows []store.Row) []map[string]any {
	out := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		var m map[string]any
		if json.Unmarshal(r.Data, &m) == nil {
			if r.Basis != "" {
				m[value.BasisKey] = r.Basis
			}
			out = append(out, m)
		}
	}
	return out
}

type PortfolioSummary struct {
	value.Summary
	Sections  []store.Section `json:"sectionList"`
	PricedOn  *time.Time      `json:"pricedOn"`
	Benchmark string          `json:"benchmark"`
	CardsOwed float64         `json:"cardsOwed"`
	policies  []map[string]any
	series    value.Series
}

func (a *App) Summary(ctx context.Context, p *store.Portfolio) (*PortfolioSummary, error) {
	sum, err := a.summarise(ctx, p)
	if err != nil {
		return nil, err
	}
	a.needHistory(sum.Summary, sum.series)
	return sum, nil
}

func (a *App) summarise(ctx context.Context, p *store.Portfolio) (*PortfolioSummary, error) {
	secs, err := a.Store.Sections(ctx, p.ID)
	if err != nil {
		return nil, err
	}
	is, err := a.Store.InstanceSettings(ctx)
	if err != nil {
		return nil, err
	}
	spends, err := a.Store.Spends(ctx, p.ID)
	if err != nil {
		return nil, err
	}
	var vsecs []value.Section
	var isins []string
	for _, sec := range secs {
		rows, err := a.Store.Rows(ctx, sec.ID)
		if err != nil {
			return nil, err
		}
		vs := value.Section{ID: sec.ID, Kind: sec.Kind, Valuation: sec.Valuation, Rate: sec.Rate, ValueField: sec.ValueField,
			CostField: sec.CostField, DateField: sec.DateField, Counts: sec.Counts, Rows: decodeRows(rows)}
		if sec.Kind == "savings" {
			vs.Rows = deductSpends(rows, spends)
		}
		if sec.Valuation == kinds.Market || sec.Valuation == kinds.NAV {
			if vs.Rows, err = a.resolveRows(ctx, vs.Rows); err != nil {
				return nil, err
			}
			hs, err := a.Store.Holdings(ctx, sec.ID)
			if err != nil {
				return nil, err
			}
			for _, h := range hs {
				vh := value.Holding{Key: h.Key, ISIN: h.ISIN, Name: h.Name, Quantity: h.Quantity, Cost: h.Cost, CostUnknown: h.CostUnknown}
				if vh.Name == "" {
					vh.Name = h.Symbol
				}
				vs.Holdings = append(vs.Holdings, vh)
				if h.ISIN != "" {
					isins = append(isins, h.ISIN)
				}
			}
		}
		vsecs = append(vsecs, vs)
	}
	quotes, err := a.Store.LatestPrices(ctx, isins)
	if err != nil {
		return nil, err
	}
	prices := value.Prices{}
	var pricedOn *time.Time
	for isin, q := range quotes {
		prices[isin] = q.Close
		if pricedOn == nil || q.Day.After(*pricedOn) {
			d := q.Day
			pricedOn = &d
		}
	}
	series, err := a.benchmarkSeries(ctx, p.Settings.Benchmark)
	if err != nil {
		return nil, err
	}
	gold, silver, err := a.metalRates(ctx, is.GoldPerGram, is.SilverPerGram)
	if err != nil {
		return nil, err
	}
	cats, err := a.Store.Categories(ctx, isins)
	if err != nil {
		return nil, err
	}
	for isin, c := range cats {
		cats[isin] = ShortGroup(c)
	}
	env := value.Env{Today: Today(), Prices: prices, Categories: cats, GoldPerGram: gold, SilverPerGram: silver}
	sum := value.Summarise(vsecs, env, value.Options{Inflation: p.Settings.Inflation, XIRRMinDays: p.Settings.XIRRMinDays, Benchmark: series, Moves: p.Settings.Moves})
	owed, err := a.cardsOwed(ctx, p.ID, spends)
	if err != nil {
		return nil, err
	}
	sum.Liabilities += owed
	sum.NetWorth -= owed
	out := &PortfolioSummary{Summary: sum, Sections: secs, PricedOn: pricedOn, Benchmark: p.Settings.Benchmark, CardsOwed: owed, series: series}
	for _, vs := range vsecs {
		if vs.Valuation == kinds.Cover {
			out.policies = append(out.policies, vs.Rows...)
		}
	}
	return out, nil
}

func (a *App) benchmarkSeries(ctx context.Context, name string) (value.Series, error) {
	closes, err := a.Store.IndexSeries(ctx, name, time.Time{})
	if err != nil {
		return nil, err
	}
	s := make(value.Series, 0, len(closes))
	for _, c := range closes {
		s = append(s, value.IndexPoint{Day: c.Day, Close: c.Close})
	}
	return s, nil
}

// EarliestFlow returns the day of the portfolio's first cash flow, as the benchmark needs index closes back to it.
func (a *App) EarliestFlow(ctx context.Context, p *store.Portfolio) (time.Time, error) {
	sum, err := a.summarise(ctx, p)
	if err != nil {
		return time.Time{}, err
	}
	return summaryFirstFlow(sum.Summary), nil
}

func summaryFirstFlow(sum value.Summary) time.Time {
	var all []value.Flow
	for _, r := range sum.Sections {
		all = append(all, r.Flows...)
	}
	return firstFlow(all)
}

func firstFlow(flows []value.Flow) time.Time {
	var first time.Time
	for _, f := range flows {
		if first.IsZero() || f.Date.Before(first) {
			first = f.Date
		}
	}
	return first
}

type Position struct {
	SectionID string  `json:"sectionId"`
	Kind      string  `json:"kind"`
	Key       string  `json:"key"`
	ISIN      string  `json:"isin"`
	Name      string  `json:"name"`
	Quantity  float64 `json:"quantity"`
	Cost      float64 `json:"cost"`
}

// PositionsOn returns the positions held on day, so a statement can be checked against what Ebenezer would have shown then, not later trades.
func (a *App) PositionsOn(ctx context.Context, portfolioID string, day time.Time) ([]Position, error) {
	secs, err := a.Store.Sections(ctx, portfolioID)
	if err != nil {
		return nil, err
	}
	out := []Position{}
	for _, sec := range secs {
		k, ok := kinds.Get(sec.Kind)
		if !ok || !k.Holdings {
			continue
		}
		rows, err := a.Store.Rows(ctx, sec.ID)
		if err != nil {
			return nil, err
		}
		var upTo []map[string]any
		for _, r := range decodeRows(rows) {
			if d, ok := value.Date(r["date"]); ok && !d.After(day) {
				upTo = append(upTo, r)
			}
		}
		resolved, err := a.resolveRows(ctx, upTo)
		if err != nil {
			return nil, err
		}
		for _, d := range value.Holdings(sec.Kind, resolved) {
			if d.Quantity > 0 {
				out = append(out, Position{SectionID: sec.ID, Kind: sec.Kind, Key: d.Key, ISIN: d.ISIN, Name: d.Name, Quantity: d.Quantity, Cost: d.Cost})
			}
		}
	}
	return out, nil
}
