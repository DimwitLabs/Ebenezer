package app

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/DimwitLabs/ebenezer/internal/market"
	"github.com/DimwitLabs/ebenezer/internal/news"
	"github.com/DimwitLabs/ebenezer/internal/store"
	"github.com/DimwitLabs/ebenezer/internal/value"
)

type Job struct {
	Name        string `json:"name"`
	Label       string `json:"label"`
	Description string `json:"description"`
	Portfolio   bool   `json:"portfolio"`
}

var Jobs = []Job{
	{Name: "prices", Label: "Prices", Description: "BSE and NSE closes, AMFI NAVs, NSE index levels, and gold and silver rates"},
	{Name: "benchmark", Label: "Benchmark history", Description: "Index closes back to your first investment, for the comparison, and the last month of share closes"},
	{Name: "crypto", Label: "Crypto prices", Description: "Coin prices in rupees from CoinGecko; the weekday price run includes them, this one keeps weekends current"},
	{Name: "snapshot", Label: "Net worth snapshot", Description: "Records today's net worth for the Past chart", Portfolio: true},
	{Name: "news", Label: "News", Description: "Fetches and judges news for every scrip you hold", Portfolio: true},
	{Name: "notes", Label: "Ebenezer's notes", Description: "Writes my notes on Today and Portfolio, for whatever changed", Portfolio: true},
	{Name: "report", Label: "Email report", Description: "Sends this portfolio's report to the addresses in Settings", Portfolio: true},
	{Name: "health", Label: "Health check", Description: "Checks every outside source still answers the way I expect"},
}

func JobByName(name string) (Job, bool) {
	for _, j := range Jobs {
		if j.Name == name {
			return j, true
		}
	}
	return Job{}, false
}

var (
	ErrRunning    = errors.New("already running")
	ErrNotRunning = errors.New("not running")
	errStopped    = errors.New("stopped by you")
)

type Progress struct {
	Text  string `json:"text"`
	Done  int    `json:"done"`
	Total int    `json:"total"`
}

// Start runs a job in the background; manual runs go through here too, so "Run now" always works whatever the schedule says.
func (a *App) Start(job string, portfolioID string) error {
	ctx, done, err := a.begin(context.Background(), job+":"+portfolioID, 30*time.Minute)
	if err != nil {
		return err
	}
	go func() {
		defer done()
		a.run(ctx, job, portfolioID, nil)
	}()
	return nil
}

func (a *App) begin(parent context.Context, key string, limit time.Duration) (context.Context, func(), error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.running[key] {
		return nil, nil, ErrRunning
	}
	ctx, cancel := context.WithTimeout(parent, limit)
	a.running[key] = true
	delete(a.stopped, key)
	a.cancels[key] = cancel
	return ctx, func() {
		cancel()
		a.mu.Lock()
		delete(a.running, key)
		delete(a.cancels, key)
		delete(a.progress, key)
		a.mu.Unlock()
	}, nil
}

// Stop cancels a running job; whatever it saved before stopping stays, as every job saves as it goes.
func (a *App) Stop(job, portfolioID string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	cancel, ok := a.cancels[job+":"+portfolioID]
	if !ok {
		return ErrNotRunning
	}
	a.stopped[job+":"+portfolioID] = true
	cancel()
	return nil
}

func (a *App) wasStopped(key string) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	s := a.stopped[key]
	delete(a.stopped, key)
	return s
}

func (a *App) Running(job, portfolioID string) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.running[job+":"+portfolioID]
}

func (a *App) Progress(job, portfolioID string) *Progress {
	a.mu.Lock()
	defer a.mu.Unlock()
	if p, ok := a.progress[job+":"+portfolioID]; ok {
		return &p
	}
	return nil
}

func (a *App) setProgress(key string, p Progress) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.progress[key] = p
}

// run runs one job; catchUp is the due time it makes up for, when the server was down then.
func (a *App) run(ctx context.Context, job, portfolioID string, catchUp *time.Time) (ok bool) {
	defer func() {
		a.mu.Lock()
		a.lastOK[job+":"+portfolioID] = ok
		a.mu.Unlock()
	}()
	var pid *string
	if portfolioID != "" {
		pid = &portfolioID
	}
	id, err := a.Store.StartJob(ctx, job, pid, catchUp)
	if errors.Is(err, store.ErrNotFound) {
		slog.Info("already caught up", "job", job, "portfolio", portfolioID)
		return false
	}
	if err != nil {
		slog.Error("starting job", "job", job, "err", err)
		return false
	}
	ctx, details := withFacts(ctx)
	var msg string
	switch job {
	case "prices":
		msg, err = a.prices(ctx)
	case "crypto":
		msg, err = a.cryptoPrices(ctx)
	case "benchmark":
		msg, err = a.backfill(ctx)
	case "snapshot":
		msg, err = a.snapshot(ctx, portfolioID)
	case "news":
		msg, err = a.news(ctx, portfolioID)
	case "notes":
		msg, err = a.writeNotes(ctx, portfolioID)
	case "report":
		msg, err = a.sendReport(ctx, portfolioID)
	case "health":
		msg, err = a.health(ctx)
	default:
		err = fmt.Errorf("no job called %q", job)
	}
	if a.wasStopped(job + ":" + portfolioID) {
		err = errStopped
	}
	if err != nil {
		slog.Error("job failed", "job", job, "portfolio", portfolioID, "err", err)
		if msg != "" {
			msg += "; "
		}
		msg += err.Error()
	}
	if ferr := a.Store.FinishJob(context.Background(), id, err == nil, msg, details.all()); ferr != nil {
		slog.Error("finishing job", "job", job, "err", ferr)
	}
	return err == nil
}

// AfterImport starts the benchmark job after an import; tests leave Market unset so they never reach the exchanges.
func (a *App) AfterImport() {
	if a.Market != nil {
		a.startQuietly("benchmark", "")
	}
}

func (a *App) startQuietly(job, pid string) {
	if err := a.Start(job, pid); err != nil && !errors.Is(err, ErrRunning) {
		slog.Error("starting job", "job", job, "err", err)
	}
}

// lastTradingDay walks back to the latest published file, which skips weekends and holidays without a holiday calendar.
func (a *App) lastTradingDay(ctx context.Context) (time.Time, []market.Quote, error) {
	day := Today()
	for i := 0; i < 8; i++ {
		d := day.AddDate(0, 0, -i)
		if d.Weekday() == time.Saturday || d.Weekday() == time.Sunday {
			continue
		}
		q, err := a.Market.NSE(ctx, d)
		if err == nil {
			return d, q, nil
		}
		if !errors.Is(err, market.ErrNoData) {
			slog.Warn("nse bhavcopy", "day", d.Format("2006-01-02"), "err", err)
		}
	}
	return time.Time{}, nil, errors.New("no NSE bhavcopy in the last week")
}

func toStore(qs []market.Quote, skipSymbol map[string]bool) ([]store.Security, []store.Price) {
	secs := make([]store.Security, 0, len(qs))
	prices := make([]store.Price, 0, len(qs))
	for _, q := range qs {
		sym := q.Symbol
		if skipSymbol[q.ISIN] {
			sym = ""
		}
		secs = append(secs, store.Security{ISIN: q.ISIN, Symbol: sym, BSECode: q.BSECode, Name: q.Name, Kind: q.Kind, Category: q.Category})
		prices = append(prices, store.Price{ISIN: q.ISIN, Day: q.Day, Close: q.Close})
	}
	return secs, prices
}

// saveExchanges saves the NSE and BSE closes; BSE failing to answer comes back apart from a failed save, as NSE's closes still stand without it.
func (a *App) saveExchanges(ctx context.Context, day time.Time, nse []market.Quote) (bse int, bseErr, err error) {
	onNSE := map[string]bool{}
	for _, q := range nse {
		onNSE[q.ISIN] = true
	}
	secs, prices := toStore(nse, nil)
	if err := a.Store.SavePrices(ctx, "nse", secs, prices); err != nil {
		return 0, nil, err
	}
	quotes, bseErr := a.Market.BSE(ctx, day)
	if bseErr != nil {
		return 0, bseErr, nil
	}
	// NSE's ticker is the one people know, so BSE only fills the symbol for BSE-only scrips.
	secs, prices = toStore(quotes, onNSE)
	return len(quotes), nil, a.Store.SavePrices(ctx, "bse", secs, prices)
}

func (a *App) prices(ctx context.Context) (string, error) {
	var parts, problems []string
	day, nse, err := a.lastTradingDay(ctx)
	if err != nil {
		problems = append(problems, err.Error())
	} else {
		bse, bseErr, err := a.saveExchanges(ctx, day, nse)
		if err != nil {
			return "", err
		}
		parts = append(parts, "NSE")
		fact(ctx, "NSE", Count(len(nse))+" closes")
		if bseErr != nil {
			problems = append(problems, "BSE: "+bseErr.Error())
		} else {
			parts = append(parts, "BSE")
			fact(ctx, "BSE", Count(bse)+" closes")
		}
		if ind, err := a.Market.Industries(ctx); err != nil {
			problems = append(problems, "industries: "+err.Error())
		} else if err := a.Store.SaveIndustries(ctx, ind); err != nil {
			return "", err
		}
		if idx, err := a.Market.Indices(ctx, day); err != nil {
			problems = append(problems, "indices: "+err.Error())
		} else {
			if err := a.Store.SaveIndexCloses(ctx, indexRows(idx)); err != nil {
				return "", err
			}
			parts = append(parts, "indices")
			fact(ctx, "Indices", Count(len(idx)))
		}
	}
	if navs, err := a.Market.AMFI(ctx); err != nil {
		problems = append(problems, "AMFI: "+err.Error())
	} else {
		secs, prices := toStore(navs, nil)
		if err := a.Store.SavePrices(ctx, "amfi", secs, prices); err != nil {
			return "", err
		}
		parts = append(parts, "AMFI")
		fact(ctx, "AMFI", Count(len(navs))+" NAVs")
	}
	if err := a.fetchMetals(ctx); err != nil {
		problems = append(problems, "gold: "+err.Error())
	} else {
		parts = append(parts, "bullion")
	}
	if m, err := a.cryptoPrices(ctx); err != nil {
		problems = append(problems, "crypto: "+err.Error())
	} else if m != "" {
		parts = append(parts, "coins")
	}
	msg := fmt.Sprintf("Closes from %d sources", len(parts))
	if !day.IsZero() {
		msg = fmt.Sprintf("Closes for %s from %d sources", day.Format("2 Jan"), len(parts))
	}
	// One source failing should not hold back holdings built from the others.
	if err := a.RebuildAll(ctx); err != nil {
		problems = append(problems, "rebuilding holdings: "+err.Error())
	}
	if len(problems) > 0 {
		return msg, errors.New(strings.Join(problems, "; "))
	}
	return msg, nil
}

func indexRows(idx []market.IndexClose) []store.IndexClose {
	out := make([]store.IndexClose, 0, len(idx))
	for _, c := range idx {
		out = append(out, store.IndexClose{Name: c.Name, Day: c.Day, Close: c.Close, PE: c.PE, PB: c.PB, DY: c.DY})
	}
	return out
}

// RebuildAll runs after each price run to resolve ticker-only holdings, and at startup so kind changes show at once.
func (a *App) RebuildAll(ctx context.Context) error {
	return a.rebuildKind(ctx, "")
}

// rebuildKind rebuilds the sections of one kind; an empty kind rebuilds every section.
func (a *App) rebuildKind(ctx context.Context, kind string) error {
	ps, err := a.Store.AllPortfolios(ctx)
	if err != nil {
		return err
	}
	for _, p := range ps {
		secs, err := a.Store.Sections(ctx, p.ID)
		if err != nil {
			return err
		}
		for i := range secs {
			if kind != "" && secs[i].Kind != kind {
				continue
			}
			if err := a.RebuildHoldings(ctx, &secs[i]); err != nil {
				return err
			}
		}
	}
	return nil
}

const holidaysSetting = "index_holidays"

// indexFloorSetting names the setting for the first day NSE has index closes for, found by the backfill.
const indexFloorSetting = "index_floor"

// sourceGap is how many weekdays in a row without a file end a source; no run of exchange holidays comes close.
const sourceGap = 15

var sourceRecheck = time.Minute

const benchmarkRetry = time.Hour

// olderHistory fills benchmark closes from Yahoo Finance from before NSE's files begin, where it carries that index.
func (a *App) olderHistory(ctx context.Context, ps []store.Portfolio, first, until time.Time) string {
	seen := map[string]bool{}
	var said []string
	for _, p := range ps {
		name := p.Settings.Benchmark
		if seen[name] {
			continue
		}
		seen[name] = true
		have, err := a.Store.IndexSeries(ctx, name, first)
		if err == nil && len(have) > 0 && !have[0].Day.After(first.AddDate(0, 0, 7)) {
			continue
		}
		closes, err := a.Market.YahooIndex(ctx, name, first, until)
		switch {
		case errors.Is(err, market.ErrNoData):
			said = append(said, fmt.Sprintf("%s has no closes before %s from NSE or %s", name, until.Format("2 Jan 2006"), market.YahooSource))
		case err != nil:
			said = append(said, fmt.Sprintf("%s's closes before %s could not be read from %s: %v", name, until.Format("2 Jan 2006"), market.YahooSource, err))
		default:
			if err := a.Store.SaveIndexCloses(ctx, indexRows(closes)); err != nil {
				said = append(said, err.Error())
				continue
			}
			said = append(said, fmt.Sprintf("%d days of %s before %s from %s", len(closes), name, until.Format("2 Jan 2006"), market.YahooSource))
		}
	}
	if len(said) == 0 {
		return "older closes already held"
	}
	return strings.Join(said, "; ")
}

func (a *App) indexFloor(ctx context.Context) time.Time {
	var s string
	if _, err := a.Store.Setting(ctx, indexFloorSetting, &s); err != nil || s == "" {
		return time.Time{}
	}
	d, _ := time.Parse("2006-01-02", s)
	return d
}

// needHistory backfills on the next look rather than the next evening; where no source reaches the money, at most hourly.
func (a *App) needHistory(sum value.Summary, series value.Series) {
	first := summaryFirstFlow(sum)
	if first.IsZero() || a.Market == nil {
		return
	}
	if len(series) > 0 && !series[0].Day.After(first.AddDate(0, 0, 7)) {
		return
	}
	a.mu.Lock()
	tried := a.historyTried
	if time.Since(tried) < benchmarkRetry {
		a.mu.Unlock()
		return
	}
	a.historyTried = time.Now()
	a.mu.Unlock()
	a.startQuietly("benchmark", "")
}

// recentDays is how far back the backfill fetches recent closes, so a scrip imported today already has a chart.
const recentDays = 31

func (a *App) backfill(ctx context.Context) (string, error) {
	holidays := map[string]bool{}
	if _, err := a.Store.Setting(ctx, holidaysSetting, &holidays); err != nil {
		return "", err
	}
	// The exchanges and AMFI fail on their own, so a slow fund report never holds back the index.
	recent, rerr := a.recentCloses(ctx, holidays)
	msg, err := a.indexHistory(ctx, holidays)
	if recent != "" {
		fact(ctx, "Last month", recent)
	}
	// Saved even when the run is stopped, so the days found are never asked for again.
	serr := a.Store.SetSetting(context.WithoutCancel(ctx), holidaysSetting, holidays)
	return msg, errors.Join(rerr, err, serr)
}

func (a *App) recentCloses(ctx context.Context, holidays map[string]bool) (string, error) {
	since := Today().AddDate(0, 0, -recentDays)
	shares, sharesErr := a.recentShares(ctx, since, holidays)
	funds, fundsErr := a.recentFunds(ctx, since, holidays)
	coins, coinsErr := a.recentCoins(ctx, since)
	msgs := []string{}
	for _, m := range []string{shares, funds, coins} {
		if m != "" {
			msgs = append(msgs, m)
		}
	}
	return strings.Join(msgs, "; "), errors.Join(sharesErr, fundsErr, coinsErr)
}

func (a *App) recentShares(ctx context.Context, since time.Time, holidays map[string]bool) (string, error) {
	have, err := a.Store.PriceDays(ctx, "nse", since)
	if err != nil {
		return "", err
	}
	fetched := 0
	for d := Today().AddDate(0, 0, -1); !d.Before(since); d = d.AddDate(0, 0, -1) {
		key := d.Format("2006-01-02")
		if d.Weekday() == time.Saturday || d.Weekday() == time.Sunday || have[key] || holidays[key] {
			continue
		}
		nse, err := a.Market.NSE(ctx, d)
		if errors.Is(err, market.ErrNoData) {
			holidays[key] = true
			continue
		}
		if err != nil {
			return fmt.Sprintf("%d days of share closes added", fetched), err
		}
		_, bseErr, err := a.saveExchanges(ctx, d, nse)
		if err != nil {
			return "", err
		}
		if bseErr != nil && !errors.Is(bseErr, market.ErrNoData) {
			slog.Warn("bse bhavcopy", "day", key, "err", bseErr)
		}
		fetched++
		select {
		case <-ctx.Done():
			return fmt.Sprintf("%d days of share closes added", fetched), ctx.Err()
		case <-time.After(250 * time.Millisecond):
		}
	}
	if fetched == 0 {
		return "", nil
	}
	return fmt.Sprintf("%d days of share closes added", fetched), nil
}

// fundChunkDays keeps AMFI history requests short: the report takes about five seconds per day of range to build, so a month in one request outlasts the client timeout.
const fundChunkDays = 5

func (a *App) recentFunds(ctx context.Context, since time.Time, holidays map[string]bool) (string, error) {
	have, err := a.Store.PriceDays(ctx, "amfi", since)
	if err != nil {
		return "", err
	}
	missing := []time.Time{}
	for d := since; d.Before(Today()); d = d.AddDate(0, 0, 1) {
		key := d.Format("2006-01-02")
		if d.Weekday() == time.Saturday || d.Weekday() == time.Sunday || have[key] || holidays[key] {
			continue
		}
		missing = append(missing, d)
	}
	added := 0
	for len(missing) > 0 {
		from, to := missing[0], missing[0]
		want := map[string]bool{}
		for len(missing) > 0 && missing[0].Before(from.AddDate(0, 0, fundChunkDays)) {
			to = missing[0]
			want[to.Format("2006-01-02")] = true
			missing = missing[1:]
		}
		navs, err := a.Market.AMFIHistory(ctx, from, to)
		if errors.Is(err, market.ErrNoData) {
			continue
		}
		if err != nil {
			return fmt.Sprintf("%d days of fund NAVs added", added), err
		}
		kept := []market.Quote{}
		days := map[string]bool{}
		for _, q := range navs {
			if key := q.Day.Format("2006-01-02"); want[key] {
				kept = append(kept, q)
				days[key] = true
			}
		}
		if len(kept) > 0 {
			secs, prices := toStore(kept, nil)
			if err := a.Store.SavePrices(ctx, "amfi", secs, prices); err != nil {
				return fmt.Sprintf("%d days of fund NAVs added", added), err
			}
		}
		added += len(days)
	}
	if added == 0 {
		return "", nil
	}
	return fmt.Sprintf("%d days of fund NAVs added", added), nil
}

func (a *App) indexHistory(ctx context.Context, holidays map[string]bool) (string, error) {
	ps, err := a.Store.AllPortfolios(ctx)
	if err != nil {
		return "", err
	}
	var first time.Time
	for i := range ps {
		f, err := a.EarliestFlow(ctx, &ps[i])
		if err != nil {
			return "", err
		}
		if !f.IsZero() && (first.IsZero() || f.Before(first)) {
			first = f
		}
	}
	if first.IsZero() {
		return "nothing invested yet", nil
	}
	have, err := a.Store.IndexDays(ctx, "Nifty 50")
	if err != nil {
		return "", err
	}
	first = first.AddDate(0, 0, -7)
	// The source's own first day is found by walking back, not assumed, and never asked past again.
	from, floor := first, a.indexFloor(ctx)
	if from.Before(floor) {
		from = floor
	}
	var days []time.Time
	for d := Today().AddDate(0, 0, -1); !d.Before(from); d = d.AddDate(0, 0, -1) {
		key := d.Format("2006-01-02")
		if d.Weekday() != time.Saturday && d.Weekday() != time.Sunday && !have[key] && !holidays[key] {
			days = append(days, d)
		}
	}
	// Holidays found are kept as it goes, so a stopped run picks up where it left off.
	progress := func(done int) {
		a.setProgress("benchmark:", Progress{Text: fmt.Sprintf("%d of %d days of index closes", done, len(days)), Done: done, Total: len(days)})
	}
	fetched, missing := 0, 0
	var streak []time.Time
	oldest := time.Time{}
	for k := range have {
		if d, err := time.Parse("2006-01-02", k); err == nil && (oldest.IsZero() || d.Before(oldest)) {
			oldest = d
		}
	}
	for i, d := range days {
		key := d.Format("2006-01-02")
		if i%50 == 0 {
			progress(i)
			_ = a.Store.SetSetting(ctx, holidaysSetting, holidays)
		}
		idx, err := a.Market.Indices(ctx, d)
		if errors.Is(err, market.ErrNoData) {
			holidays[key] = true
			missing++
			// NSE answers throttled requests with "not found" too, so a long gap is rechecked before it counts as the start.
			if streak = append(streak, d); len(streak) >= sourceGap && !oldest.IsZero() {
				if !a.sourceEnded(ctx, streak[0]) {
					for _, s := range streak {
						delete(holidays, s.Format("2006-01-02"))
					}
					return fmt.Sprintf("%d days added", fetched), fmt.Errorf("NSE stopped sending files at %s; the rest is fetched on a later run", streak[0].Format("2 Jan 2006"))
				}
				from = oldest
				if err := a.Store.SetSetting(ctx, indexFloorSetting, oldest.Format("2006-01-02")); err != nil {
					return "", err
				}
				break
			}
			continue
		}
		if err != nil {
			return fmt.Sprintf("%d days added", fetched), err
		}
		if err := a.Store.SaveIndexCloses(ctx, indexRows(idx)); err != nil {
			return "", err
		}
		streak, oldest = nil, d
		fetched++
		select {
		case <-ctx.Done():
			return fmt.Sprintf("%d days added", fetched), ctx.Err()
		case <-time.After(250 * time.Millisecond):
		}
	}
	fact(ctx, "Back to", from.Format("2 Jan 2006"))
	fact(ctx, "From NSE", plural(fetched, "day", "days"))
	fact(ctx, "Holidays", Count(missing))
	if first.Before(from) {
		fact(ctx, "Older closes", a.olderHistory(ctx, ps, first, from))
	}
	if fetched == 0 {
		return "Up to date", nil
	}
	return plural(fetched, "day", "days") + " of index closes added", nil
}

// sourceEnded retries a missed day after a pause to tell a real end of NSE's files from a spell of throttling.
func (a *App) sourceEnded(ctx context.Context, day time.Time) bool {
	select {
	case <-ctx.Done():
		return false
	case <-time.After(sourceRecheck):
	}
	_, err := a.Market.Indices(ctx, day)
	return errors.Is(err, market.ErrNoData)
}

func (a *App) snapshot(ctx context.Context, portfolioID string) (string, error) {
	p, err := a.portfolio(ctx, portfolioID)
	if err != nil {
		return "", err
	}
	sum, err := a.Summary(ctx, p)
	if err != nil {
		return "", err
	}
	if err := a.Store.SaveSnapshot(ctx, p.ID, Today(), sum.NetWorth, sum.Invested+sum.Unknown); err != nil {
		return "", err
	}
	fact(ctx, "Net worth", Short(sum.NetWorth))
	fact(ctx, "Put in", Short(sum.Invested))
	fact(ctx, "Day", Today().Format("2 Jan 2006"))
	return "Net worth " + Short(sum.NetWorth), nil
}

func (a *App) portfolio(ctx context.Context, id string) (*store.Portfolio, error) {
	ps, err := a.Store.AllPortfolios(ctx)
	if err != nil {
		return nil, err
	}
	for i := range ps {
		if ps[i].ID == id {
			return &ps[i], nil
		}
	}
	return nil, store.ErrNotFound
}

func (a *App) Scrips(ctx context.Context, portfolioID string) ([]news.Scrip, error) {
	secs, err := a.Store.Sections(ctx, portfolioID)
	if err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	var held []store.Holding
	var isins []string
	for _, sec := range secs {
		if sec.Kind != "stocks" {
			continue
		}
		hs, err := a.Store.Holdings(ctx, sec.ID)
		if err != nil {
			return nil, err
		}
		for _, h := range hs {
			if h.Quantity <= 0 || seen[h.Key] {
				continue
			}
			seen[h.Key] = true
			held = append(held, h)
			isins = append(isins, h.ISIN)
		}
	}
	known, err := a.Store.SecuritiesByISIN(ctx, isins)
	if err != nil {
		return nil, err
	}
	out := make([]news.Scrip, 0, len(held))
	for _, h := range held {
		sc := news.Scrip{Code: h.Symbol, Name: h.Name, ISIN: h.ISIN, Quantity: h.Quantity}
		if sec, ok := known[h.ISIN]; ok {
			sc.BSECode = sec.BSECode
			if sec.Name != "" {
				sc.Name = sec.Name
			}
			if sc.Code == "" {
				sc.Code = sec.Symbol
			}
		}
		if sc.Code == "" {
			sc.Code = h.Key
		}
		if sc.Name == "" {
			sc.Name = sc.Code
		}
		out = append(out, sc)
	}
	return out, nil
}

// newsRun holds one news run's state; seen keeps a story stored once however many runs see it.
type newsRun struct {
	a    *App
	p    *store.Portfolio
	opt  news.Options
	seen map[string]bool
}

func (a *App) newsRun(ctx context.Context, p *store.Portfolio) (*newsRun, error) {
	ns := p.Settings.News
	judge, err := news.LoadJudge(ns.Judge)
	if err != nil {
		return nil, err
	}
	judge.Persona = Persona(p.Settings.Voice)
	opt := news.Options{WindowDays: max(1, ns.WindowDays), PerScrip: max(1, ns.PerScrip), Judge: judge}
	if ns.AIJudge {
		if opt.AI, err = a.newsAI(ctx, p); err != nil {
			return nil, err
		}
	}
	seen, err := a.Store.NewsLinks(ctx, p.ID, time.Now().AddDate(0, 0, -30))
	if err != nil {
		return nil, err
	}
	return &newsRun{a: a, p: p, opt: opt, seen: seen}, nil
}

func (n *newsRun) save(ctx context.Context, items []news.Item) (int, error) {
	var fresh []store.NewsItem
	for _, it := range items {
		// A story the judge never saw is left for the next run rather than saved unjudged for good.
		if n.seen[it.Link] || (n.opt.AI != nil && it.Verdict == "") {
			continue
		}
		n.seen[it.Link] = true
		var pub *time.Time
		if !it.Published.IsZero() {
			t := it.Published
			pub = &t
		}
		fresh = append(fresh, store.NewsItem{Link: it.Link, Title: it.Title, Source: it.Source, Snippet: it.Snippet, PublishedAt: pub,
			Scrips: it.Scrips, About: nonNil(it.About), Verdict: it.Verdict, Category: it.Category, Reason: it.Reason, Also: it.Also})
	}
	return len(fresh), n.a.Store.SaveNews(ctx, n.p.ID, fresh)
}

func (a *App) news(ctx context.Context, portfolioID string) (string, error) {
	p, err := a.portfolio(ctx, portfolioID)
	if err != nil {
		return "", err
	}
	scrips, err := a.Scrips(ctx, portfolioID)
	if err != nil {
		return "", err
	}
	if len(scrips) == 0 {
		return "no stocks held", nil
	}
	n, err := a.newsRun(ctx, p)
	if err != nil {
		return "", err
	}
	// Each group is saved as soon as it is judged, so the News screen fills in while the run goes on.
	saved := 0
	key := "news:" + portfolioID
	a.setProgress(key, Progress{Text: fmt.Sprintf("0 of %d scrips read", len(scrips)), Total: len(scrips)})
	n.opt.Each = func(items []news.Item, done int) error {
		added, err := n.save(ctx, items)
		saved += added
		a.setProgress(key, Progress{Text: fmt.Sprintf("%d of %d scrips read, %d new stories", done, len(scrips), saved), Done: done, Total: len(scrips)})
		return err
	}
	rep, err := a.News.Collect(ctx, scrips, n.opt, time.Now())
	msg := plural(saved, "new story", "new stories")
	fact(ctx, "Scrips", Count(len(scrips)))
	fact(ctx, "Stories", Count(rep.Fetched))
	fact(ctx, "New", Count(saved))
	if n.opt.AI == nil {
		fact(ctx, "Judged", "no, as there is no AI key")
	}
	if len(rep.Failed) > 0 {
		fact(ctx, "Sources failed", Count(len(rep.Failed)))
		if rep.GoogleFailed == len(scrips) && err == nil {
			err = errors.New(rep.Failed[0])
		}
	}
	return msg, err
}

var ErrTooSoon = errors.New("checked a moment ago")

func (a *App) newsAI(ctx context.Context, p *store.Portfolio) (*news.AI, error) {
	key := a.Secret(ctx, OpenRouterKey)
	if key == "" {
		return nil, nil
	}
	is, err := a.Store.InstanceSettings(ctx)
	if err != nil {
		return nil, err
	}
	return &news.AI{Client: a.ai(key), Model: ModelFor(is, p)}, nil
}

// JudgeOne judges one story with the model even when the scheduled judge is off, since asking is the go-ahead.
func (a *App) JudgeOne(ctx context.Context, p *store.Portfolio, id int64) (store.NewsItem, error) {
	it, err := a.Store.NewsItem(ctx, p.ID, id)
	if err != nil || it.Verdict != "" {
		return it, err
	}
	ai, err := a.newsAI(ctx, p)
	if err != nil {
		return it, err
	}
	if ai == nil {
		return it, ErrNoAI
	}
	judge, err := news.LoadJudge(p.Settings.News.Judge)
	if err != nil {
		return it, err
	}
	judge.Persona = Persona(p.Settings.Voice)
	scrips, err := a.Scrips(ctx, p.ID)
	if err != nil {
		return it, err
	}
	in := news.Item{Scrips: it.Scrips, Title: it.Title, Source: it.Source, Link: it.Link, Snippet: it.Snippet, Routine: judge.Routine(it.Title)}
	if it.PublishedAt != nil {
		in.Published = *it.PublishedAt
	}
	out, err := ai.Judge(ctx, judge, []news.Item{in}, scrips, time.Now())
	if err != nil {
		return it, err
	}
	if len(out) == 0 || out[0].Verdict == "" {
		return it, errors.New("the model gave no verdict")
	}
	it.Verdict, it.About, it.Category, it.Reason = out[0].Verdict, nonNil(out[0].About), out[0].Category, out[0].Reason
	return it, a.Store.JudgeNews(ctx, p.ID, it)
}

// ScripNews fetches one scrip's news; two minutes between looks keeps a double click from paying twice.
func (a *App) ScripNews(ctx context.Context, p *store.Portfolio, isin string) (int, error) {
	key := p.ID + ":" + isin
	a.mu.Lock()
	if time.Since(a.scripAt[key]) < 2*time.Minute {
		a.mu.Unlock()
		return 0, ErrTooSoon
	}
	a.scripAt[key] = time.Now()
	a.mu.Unlock()
	scrips, err := a.Scrips(ctx, p.ID)
	if err != nil {
		return 0, err
	}
	var one []news.Scrip
	for _, sc := range scrips {
		if sc.ISIN == isin {
			one = append(one, sc)
		}
	}
	if len(one) == 0 {
		return 0, nil
	}
	n, err := a.newsRun(ctx, p)
	if err != nil {
		return 0, err
	}
	rep, err := a.News.Collect(ctx, one, n.opt, time.Now())
	added, serr := n.save(ctx, rep.Items)
	return added, errors.Join(err, serr)
}

func nonNil(xs []string) []string {
	if xs == nil {
		return []string{}
	}
	return xs
}

func (a *App) Schedule(ctx context.Context) {
	// A new install would value gold at nothing until the first evening run.
	if m, err := a.LastMetals(ctx); err == nil && m.At.IsZero() {
		if err := a.fetchMetals(ctx); err != nil {
			slog.Warn("first gold rate", "err", err)
		}
	}
	// Starting from the current minute keeps a restart from firing that minute's jobs twice.
	start := time.Now().In(Zone)
	a.tick(ctx, start, false, &start)
	last := start.Format("2006-01-02 15:04")
	// The first tick after the start minute catches up a slot due in that minute; after it, the scheduler has been awake for every slot.
	awake := &start
	t := time.NewTicker(30 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			now := time.Now().In(Zone)
			if minute := now.Format("2006-01-02 15:04"); minute != last {
				last = minute
				a.tick(ctx, now, true, awake)
				awake = nil
			}
		}
	}
}

// tick starts what is due this minute and, given when the scheduler woke, catches up what was due before it; at startup only the catching up, as a restart must not run this minute twice.
func (a *App) tick(ctx context.Context, now time.Time, onTime bool, awake *time.Time) {
	is, err := a.Store.InstanceSettings(ctx)
	if err != nil {
		slog.Error("reading settings", "err", err)
		return
	}
	ps, err := a.Store.AllPortfolios(ctx)
	if err != nil {
		slog.Error("listing portfolios", "err", err)
	}
	var started map[string]time.Time
	if awake != nil {
		if started, err = a.Store.LastStarts(ctx); err != nil {
			slog.Error("reading last runs", "err", err)
		}
	}
	for _, c := range Chains {
		targets := []*store.Portfolio{nil}
		if c.Portfolio {
			targets = targets[:0]
			for i := range ps {
				targets = append(targets, &ps[i])
			}
		}
		for _, p := range targets {
			pid := ""
			if p != nil {
				pid = p.ID
			}
			w := ChainWhen(c.Name, is, p)
			if onTime && w.Due(now) {
				a.startChainQuietly(c.Name, pid, nil)
			} else if awake != nil {
				if due := w.Missed(now, *awake, started[c.Steps[0].Job+":"+pid]); due != nil {
					slog.Info("catching up", "schedule", c.Name, "portfolio", pid, "missed", due.Format("2006-01-02 15:04"))
					a.startChainQuietly(c.Name, pid, due)
				}
			}
		}
	}
}
