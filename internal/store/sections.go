package store

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/DimwitLabs/ebenezer/internal/kinds"
)

type Section struct {
	ID          string        `json:"id"`
	PortfolioID string        `json:"portfolioId"`
	Kind        string        `json:"kind"`
	Name        string        `json:"name"`
	Icon        string        `json:"icon"`
	Description string        `json:"description"`
	Valuation   string        `json:"valuation"`
	Rate        *float64      `json:"rate"`
	ValueField  string        `json:"valueField"`
	CostField   string        `json:"costField"`
	DateField   string        `json:"dateField"`
	Fields      []kinds.Field `json:"fields"`
	Counts      bool          `json:"counts"`
	Position    int           `json:"position"`
	Rows        int           `json:"rows"`
	Holdings    int           `json:"holdings"`
	LastImport  *time.Time    `json:"lastImport"`
}

const sectionColumns = `s.id::text, s.portfolio_id::text, s.kind, s.name, s.icon, s.description, s.valuation, s.rate::float8,
	s.value_field, s.cost_field, s.date_field, s.fields, s.counts, s.position,
	(SELECT count(*) FROM {s}.rows r WHERE r.section_id = s.id)::int,
	(SELECT count(*) FROM {s}.holdings h WHERE h.section_id = s.id)::int,
	(SELECT max(i.created_at) FROM {s}.imports i WHERE i.section_id = s.id)`

func scanSection(row interface{ Scan(...any) error }) (*Section, error) {
	sec := &Section{}
	var fields []byte
	if err := row.Scan(&sec.ID, &sec.PortfolioID, &sec.Kind, &sec.Name, &sec.Icon, &sec.Description, &sec.Valuation, &sec.Rate,
		&sec.ValueField, &sec.CostField, &sec.DateField, &fields, &sec.Counts, &sec.Position, &sec.Rows, &sec.Holdings, &sec.LastImport); err != nil {
		return nil, notFound(err)
	}
	// Built-in kinds always use today's definition, so new fields and examples reach old sections.
	if k, ok := kinds.Get(sec.Kind); ok && k.Key != "custom" {
		sec.Fields = k.Fields
		return sec, nil
	}
	if err := json.Unmarshal(fields, &sec.Fields); err != nil {
		return nil, err
	}
	return sec, nil
}

func (s *Store) Sections(ctx context.Context, portfolioID string) ([]Section, error) {
	rows, err := s.pool.Query(ctx, s.q(`SELECT `+sectionColumns+` FROM {s}.sections s WHERE s.portfolio_id = $1 ORDER BY s.position, s.created_at`), portfolioID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Section{}
	for rows.Next() {
		sec, err := scanSection(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *sec)
	}
	return out, rows.Err()
}

func (s *Store) SectionForUser(ctx context.Context, sectionID, userID string) (*Section, error) {
	return scanSection(s.pool.QueryRow(ctx, s.q(`SELECT `+sectionColumns+` FROM {s}.sections s
		JOIN {s}.portfolio_members m ON m.portfolio_id = s.portfolio_id
		WHERE s.id = $1 AND m.user_id = $2`), sectionID, userID))
}

func (s *Store) CreateSection(ctx context.Context, sec *Section) error {
	sec.ID = NewID()
	fields, err := json.Marshal(sec.Fields)
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx, s.q(`INSERT INTO {s}.sections
		(id, portfolio_id, kind, name, icon, description, valuation, rate, value_field, cost_field, date_field, fields, counts, position)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
			(SELECT coalesce(max(position), 0) + 1 FROM {s}.sections WHERE portfolio_id = $2))`),
		sec.ID, sec.PortfolioID, sec.Kind, sec.Name, sec.Icon, sec.Description, sec.Valuation, sec.Rate,
		sec.ValueField, sec.CostField, sec.DateField, string(fields), sec.Counts)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return ErrConflict
	}
	return err
}

func (s *Store) UpdateSection(ctx context.Context, sec *Section) error {
	fields, err := json.Marshal(sec.Fields)
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx, s.q(`UPDATE {s}.sections SET name = $2, icon = $3, description = $4, valuation = $5, rate = $6,
		value_field = $7, cost_field = $8, date_field = $9, fields = $10, counts = $11 WHERE id = $1`),
		sec.ID, sec.Name, sec.Icon, sec.Description, sec.Valuation, sec.Rate, sec.ValueField, sec.CostField, sec.DateField, string(fields), sec.Counts)
	return err
}

func (s *Store) DeleteSection(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, s.q(`DELETE FROM {s}.sections WHERE id = $1`), id)
	return err
}

// BasisOpening is priced at the statement's day and BasisSnapshot at its own cost; both give way to real trades.
const (
	BasisOpening  = "opening"
	BasisSnapshot = "snapshot"
)

type Row struct {
	ID        string          `json:"id"`
	Data      json.RawMessage `json:"data"`
	Basis     string          `json:"basis,omitempty"`
	CreatedAt time.Time       `json:"createdAt"`
}

func (s *Store) Rows(ctx context.Context, sectionID string) ([]Row, error) {
	rows, err := s.pool.Query(ctx, s.q(`SELECT id::text, data, basis, created_at FROM {s}.rows WHERE section_id = $1 ORDER BY created_at, id`), sectionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Row{}
	for rows.Next() {
		var r Row
		var data []byte
		if err := rows.Scan(&r.ID, &data, &r.Basis, &r.CreatedAt); err != nil {
			return nil, err
		}
		r.Data = data
		out = append(out, r)
	}
	return out, rows.Err()
}

// rowHash hashes the re-marshalled map, which gives sorted keys, so the same row pasted twice is recognised.
func rowHash(data map[string]any) (string, []byte, error) {
	b, err := json.Marshal(data)
	if err != nil {
		return "", nil, err
	}
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:]), b, nil
}

// insertRows numbers repeats within a batch rather than dropping them, as tradebooks can list identical fills with no trade id.
func insertRows(ctx context.Context, tx pgx.Tx, s *Store, sectionID string, importID *string, basis string, rows []map[string]any) (int, error) {
	added := 0
	repeats := map[string]int{}
	for _, data := range rows {
		hash, b, err := rowHash(data)
		if err != nil {
			return 0, err
		}
		if n := repeats[hash]; n > 0 {
			repeats[hash]++
			sum := sha256.Sum256(fmt.Appendf(nil, "%s#%d", hash, n))
			hash = hex.EncodeToString(sum[:])
		} else {
			repeats[hash] = 1
		}
		tag, err := tx.Exec(ctx, s.q(`INSERT INTO {s}.rows (id, section_id, data, row_hash, import_id, basis) VALUES ($1, $2, $3, $4, $5, $6)
			ON CONFLICT (section_id, row_hash) DO NOTHING`), NewID(), sectionID, string(b), hash, importID, basis)
		if err != nil {
			return 0, err
		}
		added += int(tag.RowsAffected())
	}
	return added, nil
}

func (s *Store) AddRow(ctx context.Context, sectionID string, data map[string]any) (bool, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)
	added, err := insertRows(ctx, tx, s, sectionID, nil, "", []map[string]any{data})
	if err != nil {
		return false, err
	}
	return added == 1, tx.Commit(ctx)
}

func (s *Store) UpdateRow(ctx context.Context, sectionID, rowID string, data map[string]any) error {
	hash, b, err := rowHash(data)
	if err != nil {
		return err
	}
	tag, err := s.pool.Exec(ctx, s.q(`UPDATE {s}.rows SET data = $3, row_hash = $4 WHERE id = $2 AND section_id = $1`), sectionID, rowID, string(b), hash)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return ErrConflict
	}
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) DeleteRow(ctx context.Context, sectionID, rowID string) error {
	_, err := s.pool.Exec(ctx, s.q(`DELETE FROM {s}.rows WHERE id = $2 AND section_id = $1`), sectionID, rowID)
	return err
}

type Holding struct {
	Key         string  `json:"key"`
	ISIN        string  `json:"isin"`
	Symbol      string  `json:"symbol"`
	Name        string  `json:"name"`
	Quantity    float64 `json:"quantity"`
	Cost        float64 `json:"cost"`
	Realised    float64 `json:"realised"`
	FirstDate   *string `json:"firstDate"`
	CostUnknown bool    `json:"costUnknown"`
}

func (s *Store) Holdings(ctx context.Context, sectionID string) ([]Holding, error) {
	rows, err := s.pool.Query(ctx, s.q(`SELECT key, isin, symbol, name, quantity::float8, cost::float8, realised::float8, to_char(first_date, 'YYYY-MM-DD'), cost_unknown
		FROM {s}.holdings WHERE section_id = $1 ORDER BY cost DESC`), sectionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Holding{}
	for rows.Next() {
		var h Holding
		if err := rows.Scan(&h.Key, &h.ISIN, &h.Symbol, &h.Name, &h.Quantity, &h.Cost, &h.Realised, &h.FirstDate, &h.CostUnknown); err != nil {
			return nil, err
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

type Import struct {
	ID          string    `json:"id"`
	SectionID   string    `json:"sectionId"`
	SectionName string    `json:"sectionName"`
	Source      string    `json:"source"`
	Added       int       `json:"added"`
	Skipped     int       `json:"skipped"`
	Replaced    int       `json:"replaced,omitempty"`
	CreatedAt   time.Time `json:"createdAt"`
}

type ImportBatch struct {
	Source  string
	UserID  string
	Rows    []map[string]any
	Replace bool
	Basis   string
}

func (s *Store) ReplaceHoldings(ctx context.Context, sectionID string, hs []Holding) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, "ebenezer-holdings:"+sectionID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, s.q(`DELETE FROM {s}.holdings WHERE section_id = $1`), sectionID); err != nil {
		return err
	}
	for _, h := range hs {
		if _, err := tx.Exec(ctx, s.q(`INSERT INTO {s}.holdings (section_id, key, isin, symbol, name, quantity, cost, realised, first_date, cost_unknown)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10)`),
			sectionID, h.Key, h.ISIN, h.Symbol, h.Name, h.Quantity, h.Cost, h.Realised, h.FirstDate, h.CostUnknown); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (s *Store) Import(ctx context.Context, sectionID string, b ImportBatch) (*Import, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	imp := &Import{ID: NewID(), SectionID: sectionID, Source: b.Source, CreatedAt: time.Now()}
	if _, err := tx.Exec(ctx, s.q(`INSERT INTO {s}.imports (id, section_id, source, added, skipped, user_id) VALUES ($1, $2, $3, 0, 0, $4)`),
		imp.ID, sectionID, b.Source, b.UserID); err != nil {
		return nil, err
	}
	if b.Replace {
		if _, err := tx.Exec(ctx, s.q(`DELETE FROM {s}.rows WHERE section_id = $1`), sectionID); err != nil {
			return nil, err
		}
	}
	added, err := insertRows(ctx, tx, s, sectionID, &imp.ID, b.Basis, b.Rows)
	if err != nil {
		return nil, err
	}
	if b.Basis == "" {
		// Real trades for a scrip replace whatever a statement guessed for it.
		tag, err := tx.Exec(ctx, s.q(`WITH keyed AS (
				SELECT r.id, r.basis, r.import_id, upper(coalesce(nullif(r.data->>'isin', ''),
					(SELECT x.isin FROM {s}.securities x WHERE x.symbol = upper(r.data->>'symbol') LIMIT 1))) AS isin
				FROM {s}.rows r WHERE r.section_id = $1)
			DELETE FROM {s}.rows WHERE id IN (
				SELECT o.id FROM keyed o WHERE o.basis <> '' AND o.isin IN (SELECT n.isin FROM keyed n WHERE n.import_id = $2 AND n.isin IS NOT NULL))`),
			sectionID, imp.ID)
		if err != nil {
			return nil, err
		}
		imp.Replaced = int(tag.RowsAffected())
	}
	imp.Added, imp.Skipped = added, len(b.Rows)-added
	if _, err := tx.Exec(ctx, s.q(`UPDATE {s}.imports SET added = $2, skipped = $3 WHERE id = $1`), imp.ID, imp.Added, imp.Skipped); err != nil {
		return nil, err
	}
	return imp, tx.Commit(ctx)
}

func (s *Store) Imports(ctx context.Context, portfolioID string, limit int) ([]Import, error) {
	rows, err := s.pool.Query(ctx, s.q(`SELECT i.id::text, i.section_id::text, s.name, i.source, i.added, i.skipped, i.created_at
		FROM {s}.imports i JOIN {s}.sections s ON s.id = i.section_id
		WHERE s.portfolio_id = $1 ORDER BY i.created_at DESC LIMIT $2`), portfolioID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Import{}
	for rows.Next() {
		var i Import
		if err := rows.Scan(&i.ID, &i.SectionID, &i.SectionName, &i.Source, &i.Added, &i.Skipped, &i.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, i)
	}
	return out, rows.Err()
}

type Template struct {
	ID      string          `json:"id"`
	Kind    string          `json:"kind"`
	Name    string          `json:"name"`
	Payload json.RawMessage `json:"payload"`
}

func (s *Store) Templates(ctx context.Context, portfolioID string) ([]Template, error) {
	rows, err := s.pool.Query(ctx, s.q(`SELECT id::text, kind, name, payload FROM {s}.templates WHERE portfolio_id = $1 ORDER BY name`), portfolioID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Template{}
	for rows.Next() {
		var t Template
		var payload []byte
		if err := rows.Scan(&t.ID, &t.Kind, &t.Name, &payload); err != nil {
			return nil, err
		}
		t.Payload = payload
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Store) SaveTemplate(ctx context.Context, portfolioID string, t Template) error {
	_, err := s.pool.Exec(ctx, s.q(`INSERT INTO {s}.templates (id, portfolio_id, kind, name, payload) VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (portfolio_id, kind, name) DO UPDATE SET payload = EXCLUDED.payload`),
		NewID(), portfolioID, t.Kind, t.Name, string(t.Payload))
	return err
}

func (s *Store) DeleteTemplate(ctx context.Context, portfolioID, id string) error {
	_, err := s.pool.Exec(ctx, s.q(`DELETE FROM {s}.templates WHERE id = $2 AND portfolio_id = $1`), portfolioID, id)
	return err
}
