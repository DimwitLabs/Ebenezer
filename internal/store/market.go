package store

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5"
)

type Security struct {
	ISIN     string `json:"isin"`
	Symbol   string `json:"symbol"`
	BSECode  string `json:"bseCode"`
	Name     string `json:"name"`
	Kind     string `json:"kind"`
	Category string `json:"category"`
}

type Price struct {
	ISIN  string
	Day   time.Time
	Close float64
}

type Quote struct {
	Close float64   `json:"close"`
	Day   time.Time `json:"day"`
}

// SavePrices saves securities and prices in one batch round trip, as they arrive a few thousand at a time.
func (s *Store) SavePrices(ctx context.Context, source string, secs []Security, prices []Price) error {
	batch := &pgx.Batch{}
	for _, sec := range secs {
		batch.Queue(s.q(`INSERT INTO {s}.securities (isin, symbol, bse_code, name, kind, category) VALUES ($1, $2, $3, $4, $5, $6)
			ON CONFLICT (isin) DO UPDATE SET
				symbol = CASE WHEN EXCLUDED.symbol <> '' THEN EXCLUDED.symbol ELSE {s}.securities.symbol END,
				bse_code = CASE WHEN EXCLUDED.bse_code <> '' THEN EXCLUDED.bse_code ELSE {s}.securities.bse_code END,
				name = CASE WHEN EXCLUDED.name <> '' THEN EXCLUDED.name ELSE {s}.securities.name END,
				category = CASE WHEN EXCLUDED.category <> '' THEN EXCLUDED.category ELSE {s}.securities.category END,
				updated_at = now()`), sec.ISIN, sec.Symbol, sec.BSECode, sec.Name, sec.Kind, sec.Category)
	}
	// A source corrects its own close, as a coin's moves all day, but never another's: NSE's close stays over BSE's.
	for _, p := range prices {
		batch.Queue(s.q(`INSERT INTO {s}.prices (isin, day, close, source) VALUES ($1, $2, $3, $4)
			ON CONFLICT (isin, day) DO UPDATE SET close = EXCLUDED.close WHERE {s}.prices.source = EXCLUDED.source`),
			p.ISIN, p.Day, p.Close, source)
	}
	return s.pool.SendBatch(ctx, batch).Close()
}

func (s *Store) PreviousPrices(ctx context.Context, isins []string) (map[string]float64, error) {
	out := map[string]float64{}
	if len(isins) == 0 {
		return out, nil
	}
	rows, err := s.pool.Query(ctx, s.q(`SELECT isin, close::float8 FROM (
		SELECT isin, close, row_number() OVER (PARTITION BY isin ORDER BY day DESC) AS n FROM {s}.prices WHERE isin = ANY($1)
	) p WHERE n = 2`), isins)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var isin string
		var close float64
		if err := rows.Scan(&isin, &close); err != nil {
			return nil, err
		}
		out[isin] = close
	}
	return out, rows.Err()
}

func (s *Store) LatestPrices(ctx context.Context, isins []string) (map[string]Quote, error) {
	out := map[string]Quote{}
	if len(isins) == 0 {
		return out, nil
	}
	rows, err := s.pool.Query(ctx, s.q(`SELECT DISTINCT ON (isin) isin, close::float8, day FROM {s}.prices
		WHERE isin = ANY($1) ORDER BY isin, day DESC`), isins)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var isin string
		var q Quote
		if err := rows.Scan(&isin, &q.Close, &q.Day); err != nil {
			return nil, err
		}
		out[isin] = q
	}
	return out, rows.Err()
}

// SaveIndustries updates each company's industry; one missing from the list keeps whatever industry it had.
func (s *Store) SaveIndustries(ctx context.Context, industries map[string]string) error {
	isins := make([]string, 0, len(industries))
	names := make([]string, 0, len(industries))
	for isin, ind := range industries {
		isins = append(isins, isin)
		names = append(names, ind)
	}
	_, err := s.pool.Exec(ctx, s.q(`UPDATE {s}.securities s SET category = u.ind FROM unnest($1::text[], $2::text[]) AS u(isin, ind)
		WHERE s.isin = u.isin AND s.category IS DISTINCT FROM u.ind`), isins, names)
	return err
}

func (s *Store) Categories(ctx context.Context, isins []string) (map[string]string, error) {
	out := map[string]string{}
	if len(isins) == 0 {
		return out, nil
	}
	rows, err := s.pool.Query(ctx, s.q(`SELECT isin, category FROM {s}.securities WHERE isin = ANY($1) AND category <> ''`), isins)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var isin, c string
		if err := rows.Scan(&isin, &c); err != nil {
			return nil, err
		}
		out[isin] = c
	}
	return out, rows.Err()
}

type Close struct {
	Day   string  `json:"day"`
	Close float64 `json:"close"`
}

func (s *Store) PriceHistory(ctx context.Context, isin string, since time.Time) ([]Close, error) {
	rows, err := s.pool.Query(ctx, s.q(`SELECT to_char(day, 'YYYY-MM-DD'), close::float8 FROM {s}.prices WHERE isin = $1 AND day >= $2 ORDER BY day`), isin, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Close{}
	for rows.Next() {
		var c Close
		if err := rows.Scan(&c.Day, &c.Close); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) PriceHistories(ctx context.Context, isins []string, since time.Time) (map[string][]Close, error) {
	out := map[string][]Close{}
	if len(isins) == 0 {
		return out, nil
	}
	rows, err := s.pool.Query(ctx, s.q(`SELECT isin, to_char(day, 'YYYY-MM-DD'), close::float8 FROM {s}.prices
		WHERE isin = ANY($1) AND day >= $2 ORDER BY isin, day`), isins, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var isin string
		var c Close
		if err := rows.Scan(&isin, &c.Day, &c.Close); err != nil {
			return nil, err
		}
		out[isin] = append(out[isin], c)
	}
	return out, rows.Err()
}

func (s *Store) PriceDays(ctx context.Context, source string, since time.Time) (map[string]bool, error) {
	rows, err := s.pool.Query(ctx, s.q(`SELECT DISTINCT to_char(day, 'YYYY-MM-DD') FROM {s}.prices WHERE source = $1 AND day >= $2`), source, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]bool{}
	for rows.Next() {
		var d string
		if err := rows.Scan(&d); err != nil {
			return nil, err
		}
		out[d] = true
	}
	return out, rows.Err()
}

func (s *Store) SecuritiesBySymbol(ctx context.Context, symbols []string) (map[string]Security, error) {
	out := map[string]Security{}
	if len(symbols) == 0 {
		return out, nil
	}
	rows, err := s.pool.Query(ctx, s.q(`SELECT isin, symbol, bse_code, name, kind FROM {s}.securities WHERE symbol = ANY($1) OR bse_code = ANY($1)`), symbols)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var sec Security
		if err := rows.Scan(&sec.ISIN, &sec.Symbol, &sec.BSECode, &sec.Name, &sec.Kind); err != nil {
			return nil, err
		}
		out[sec.Symbol] = sec
		if sec.BSECode != "" {
			out[sec.BSECode] = sec
		}
	}
	return out, rows.Err()
}

func (s *Store) SearchSecurities(ctx context.Context, query string, limit int) ([]Security, error) {
	rows, err := s.pool.Query(ctx, s.q(`SELECT isin, symbol, bse_code, name, kind FROM {s}.securities
		WHERE isin = upper($1) OR symbol ILIKE $1 || '%' OR name ILIKE '%' || $1 || '%'
		ORDER BY (symbol ILIKE $1) DESC, length(name) LIMIT $2`), query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Security{}
	for rows.Next() {
		var sec Security
		if err := rows.Scan(&sec.ISIN, &sec.Symbol, &sec.BSECode, &sec.Name, &sec.Kind); err != nil {
			return nil, err
		}
		out = append(out, sec)
	}
	return out, rows.Err()
}

type IndexClose struct {
	Name  string
	Day   time.Time
	Close float64
	PE    *float64
	PB    *float64
	DY    *float64
}

func (s *Store) SaveIndexCloses(ctx context.Context, closes []IndexClose) error {
	batch := &pgx.Batch{}
	for _, c := range closes {
		batch.Queue(s.q(`INSERT INTO {s}.index_closes (name, day, close, pe, pb, dy) VALUES ($1, $2, $3, $4, $5, $6)
			ON CONFLICT (name, day) DO NOTHING`), c.Name, c.Day, c.Close, c.PE, c.PB, c.DY)
	}
	return s.pool.SendBatch(ctx, batch).Close()
}

func (s *Store) IndexSeries(ctx context.Context, name string, from time.Time) ([]IndexClose, error) {
	rows, err := s.pool.Query(ctx, s.q(`SELECT name, day, close::float8, pe::float8, pb::float8, dy::float8 FROM {s}.index_closes
		WHERE name = $1 AND day >= $2 ORDER BY day`), name, from)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []IndexClose{}
	for rows.Next() {
		var c IndexClose
		if err := rows.Scan(&c.Name, &c.Day, &c.Close, &c.PE, &c.PB, &c.DY); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) IndexDays(ctx context.Context, name string) (map[string]bool, error) {
	rows, err := s.pool.Query(ctx, s.q(`SELECT to_char(day, 'YYYY-MM-DD') FROM {s}.index_closes WHERE name = $1`), name)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]bool{}
	for rows.Next() {
		var d string
		if err := rows.Scan(&d); err != nil {
			return nil, err
		}
		out[d] = true
	}
	return out, rows.Err()
}

type Snapshot struct {
	Day      string  `json:"day"`
	NetWorth float64 `json:"netWorth"`
	Invested float64 `json:"invested"`
}

func (s *Store) SaveSnapshot(ctx context.Context, portfolioID string, day time.Time, netWorth, invested float64) error {
	_, err := s.pool.Exec(ctx, s.q(`INSERT INTO {s}.snapshots (portfolio_id, day, net_worth, invested) VALUES ($1, $2, $3, $4)
		ON CONFLICT (portfolio_id, day) DO UPDATE SET net_worth = EXCLUDED.net_worth, invested = EXCLUDED.invested`),
		portfolioID, day, netWorth, invested)
	return err
}

func (s *Store) Snapshots(ctx context.Context, portfolioID string) ([]Snapshot, error) {
	rows, err := s.pool.Query(ctx, s.q(`SELECT to_char(day, 'YYYY-MM-DD'), net_worth::float8, invested::float8 FROM {s}.snapshots
		WHERE portfolio_id = $1 ORDER BY day`), portfolioID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Snapshot{}
	for rows.Next() {
		var sn Snapshot
		if err := rows.Scan(&sn.Day, &sn.NetWorth, &sn.Invested); err != nil {
			return nil, err
		}
		out = append(out, sn)
	}
	return out, rows.Err()
}

type JobRun struct {
	ID          int64      `json:"id"`
	Job         string     `json:"job"`
	PortfolioID *string    `json:"portfolioId"`
	StartedAt   time.Time  `json:"startedAt"`
	FinishedAt  *time.Time `json:"finishedAt"`
	OK          *bool      `json:"ok"`
	Message     string     `json:"message"`
	Facts       []Fact     `json:"facts"`
}

type Fact struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

func (s *Store) StartJob(ctx context.Context, job string, portfolioID *string) (int64, error) {
	var id int64
	err := s.pool.QueryRow(ctx, s.q(`INSERT INTO {s}.job_runs (job, portfolio_id) VALUES ($1, $2) RETURNING id`), job, portfolioID).Scan(&id)
	return id, err
}

func (s *Store) FinishJob(ctx context.Context, id int64, ok bool, message string, facts []Fact) error {
	if facts == nil {
		facts = []Fact{}
	}
	raw, err := json.Marshal(facts)
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx, s.q(`UPDATE {s}.job_runs SET finished_at = now(), ok = $2, message = $3, facts = $4::jsonb WHERE id = $1`), id, ok, message, string(raw))
	return err
}

// CloseInterruptedJobs closes as failed any run still open at startup, as the last shutdown cut it off.
func (s *Store) CloseInterruptedJobs(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, s.q(`UPDATE {s}.job_runs SET finished_at = now(), ok = false, message = 'stopped by a restart; run it again'
		WHERE finished_at IS NULL`))
	return err
}

func (s *Store) LastRuns(ctx context.Context, portfolioID string) ([]JobRun, error) {
	rows, err := s.pool.Query(ctx, s.q(`SELECT DISTINCT ON (job) id, job, portfolio_id::text, started_at, finished_at, ok, message, facts
		FROM {s}.job_runs WHERE portfolio_id IS NULL OR portfolio_id = $1 ORDER BY job, started_at DESC`), portfolioID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []JobRun{}
	for rows.Next() {
		var r JobRun
		if err := rows.Scan(&r.ID, &r.Job, &r.PortfolioID, &r.StartedAt, &r.FinishedAt, &r.OK, &r.Message, &r.Facts); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

type InstanceSettings struct {
	PricesTime      string  `json:"pricesTime"`
	GoldPerGram     float64 `json:"goldPerGram"`
	SilverPerGram   float64 `json:"silverPerGram"`
	OpenRouterModel string  `json:"openRouterModel"`
	HealthTime      string  `json:"healthTime"`
	NtfyURL         string  `json:"ntfyUrl"`
	NtfyUser        string  `json:"ntfyUser"`
	SMTPHost        string  `json:"smtpHost"`
	SMTPPort        int     `json:"smtpPort"`
	SMTPSecurity    string  `json:"smtpSecurity"`
	SMTPUser        string  `json:"smtpUser"`
	SMTPFrom        string  `json:"smtpFrom"`
}

func DefaultInstanceSettings() InstanceSettings {
	return InstanceSettings{PricesTime: "18:45", OpenRouterModel: "anthropic/claude-sonnet-5.5", HealthTime: "09:00", SMTPPort: 587, SMTPSecurity: "starttls"}
}

func (s *Store) InstanceSettings(ctx context.Context) (InstanceSettings, error) {
	is := DefaultInstanceSettings()
	_, err := s.Setting(ctx, "instance", &is)
	return is, err
}

func (s *Store) SaveInstanceSettings(ctx context.Context, is InstanceSettings) error {
	return s.SetSetting(ctx, "instance", is)
}

func (s *Store) Setting(ctx context.Context, key string, v any) (bool, error) {
	var raw []byte
	err := s.pool.QueryRow(ctx, s.q(`SELECT value FROM {s}.settings WHERE key = $1`), key).Scan(&raw)
	if err != nil {
		if notFound(err) == ErrNotFound {
			return false, nil
		}
		return false, err
	}
	return true, json.Unmarshal(raw, v)
}

func (s *Store) SetSetting(ctx context.Context, key string, v any) error {
	raw, err := json.Marshal(v)
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx, s.q(`INSERT INTO {s}.settings (key, value) VALUES ($1, $2)
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`), key, string(raw))
	return err
}
