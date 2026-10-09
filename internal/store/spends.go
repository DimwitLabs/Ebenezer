package store

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"time"
)

type Card struct {
	ID               string    `json:"id"`
	Kind             string    `json:"kind"`
	Bank             string    `json:"bank"`
	Name             string    `json:"name"`
	Nickname         string    `json:"nickname"`
	Network          string    `json:"network"`
	Color            string    `json:"color"`
	Limit            *float64  `json:"limit"`
	StatementDay     int       `json:"statementDay"`
	DueDays          int       `json:"dueDays"`
	Interest         *float64  `json:"interest"`
	AnnualFee        *float64  `json:"annualFee"`
	StatementOn      time.Time `json:"statementOn"`
	StatementBalance float64   `json:"statementBalance"`
	Paid             float64   `json:"paid"`
	SpentBefore      float64   `json:"spentBefore"`
}

const cardColumns = `id::text, kind, bank, name, nickname, network, color, credit_limit::float8, statement_day, due_days,
	interest::float8, annual_fee::float8, statement_on, statement_balance::float8, paid::float8, spent_before::float8`

func scanCard(row interface{ Scan(...any) error }) (Card, error) {
	var c Card
	err := row.Scan(&c.ID, &c.Kind, &c.Bank, &c.Name, &c.Nickname, &c.Network, &c.Color, &c.Limit, &c.StatementDay, &c.DueDays,
		&c.Interest, &c.AnnualFee, &c.StatementOn, &c.StatementBalance, &c.Paid, &c.SpentBefore)
	return c, notFound(err)
}

func (s *Store) Cards(ctx context.Context, portfolioID string) ([]Card, error) {
	rows, err := s.pool.Query(ctx, s.q(`SELECT `+cardColumns+` FROM {s}.cards WHERE portfolio_id = $1 ORDER BY position, created_at`), portfolioID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Card{}
	for rows.Next() {
		c, err := scanCard(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) SaveCard(ctx context.Context, portfolioID string, c *Card) error {
	if c.ID == "" {
		c.ID = NewID()
		_, err := s.pool.Exec(ctx, s.q(`INSERT INTO {s}.cards (id, portfolio_id, kind, bank, name, nickname, network, color, credit_limit,
			statement_day, due_days, interest, annual_fee, statement_on, statement_balance, paid, spent_before, position)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
				(SELECT coalesce(max(position), 0) + 1 FROM {s}.cards WHERE portfolio_id = $2))`),
			c.ID, portfolioID, c.Kind, c.Bank, c.Name, c.Nickname, c.Network, c.Color, c.Limit, c.StatementDay, c.DueDays,
			c.Interest, c.AnnualFee, c.StatementOn, c.StatementBalance, c.Paid, c.SpentBefore)
		return err
	}
	tag, err := s.pool.Exec(ctx, s.q(`UPDATE {s}.cards SET kind = $3, bank = $4, name = $5, nickname = $6, network = $7, color = $8,
		credit_limit = $9, statement_day = $10, due_days = $11, interest = $12, annual_fee = $13, statement_on = $14,
		statement_balance = $15, paid = $16, spent_before = $17 WHERE portfolio_id = $1 AND id = $2`),
		portfolioID, c.ID, c.Kind, c.Bank, c.Name, c.Nickname, c.Network, c.Color, c.Limit, c.StatementDay, c.DueDays,
		c.Interest, c.AnnualFee, c.StatementOn, c.StatementBalance, c.Paid, c.SpentBefore)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

// DeleteCard deletes a card; spends paid with it keep their record but no longer say how they were paid.
func (s *Store) DeleteCard(ctx context.Context, portfolioID, id string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, s.q(`UPDATE {s}.spends SET paid_with = '' WHERE portfolio_id = $1 AND paid_with = $2`), portfolioID, "card:"+id); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, s.q(`DELETE FROM {s}.cards WHERE portfolio_id = $1 AND id = $2`), portfolioID, id); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

type Spend struct {
	ID       string    `json:"id"`
	Day      time.Time `json:"day"`
	Item     string    `json:"item"`
	Amount   float64   `json:"amount"`
	Category string    `json:"category"`
	PaidWith string    `json:"paidWith"`
	Asking   bool      `json:"asking"`
	Note     string    `json:"note"`
	ImportID *string   `json:"importId,omitempty"`
}

const spendColumns = `id::text, day, item, amount::float8, category, paid_with, asking, note, import_id::text`

func (s *Store) Spends(ctx context.Context, portfolioID string) ([]Spend, error) {
	rows, err := s.pool.Query(ctx, s.q(`SELECT `+spendColumns+` FROM {s}.spends WHERE portfolio_id = $1 ORDER BY day DESC, created_at DESC, id`), portfolioID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Spend{}
	for rows.Next() {
		var sp Spend
		if err := rows.Scan(&sp.ID, &sp.Day, &sp.Item, &sp.Amount, &sp.Category, &sp.PaidWith, &sp.Asking, &sp.Note, &sp.ImportID); err != nil {
			return nil, err
		}
		out = append(out, sp)
	}
	return out, rows.Err()
}

func (s *Store) AddSpends(ctx context.Context, portfolioID string, spends []Spend) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	for i := range spends {
		spends[i].ID = NewID()
		sp := spends[i]
		if _, err := tx.Exec(ctx, s.q(`INSERT INTO {s}.spends (id, portfolio_id, day, item, amount, category, paid_with, asking, note)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`), sp.ID, portfolioID, sp.Day, sp.Item, sp.Amount, sp.Category, sp.PaidWith, sp.Asking, sp.Note); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (s *Store) UpdateSpend(ctx context.Context, portfolioID string, sp Spend) error {
	tag, err := s.pool.Exec(ctx, s.q(`UPDATE {s}.spends SET day = $3, item = $4, amount = $5, category = $6, paid_with = $7, asking = $8, note = $9
		WHERE portfolio_id = $1 AND id = $2`), portfolioID, sp.ID, sp.Day, sp.Item, sp.Amount, sp.Category, sp.PaidWith, sp.Asking, sp.Note)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	return s.pruneCategories(ctx, portfolioID)
}

func (s *Store) DeleteSpends(ctx context.Context, portfolioID string, ids []string) (int, error) {
	tag, err := s.pool.Exec(ctx, s.q(`DELETE FROM {s}.spends WHERE portfolio_id = $1 AND id::text = ANY($2)`), portfolioID, ids)
	if err != nil {
		return 0, err
	}
	return int(tag.RowsAffected()), s.pruneCategories(ctx, portfolioID)
}

func (s *Store) MoveSpends(ctx context.Context, portfolioID string, ids []string, category string) (int, error) {
	tag, err := s.pool.Exec(ctx, s.q(`UPDATE {s}.spends SET category = $3 WHERE portfolio_id = $1 AND id::text = ANY($2)`), portfolioID, ids, category)
	if err != nil {
		return 0, err
	}
	return int(tag.RowsAffected()), s.pruneCategories(ctx, portfolioID)
}

// pruneCategories drops empty categories: a category lives as long as a spend is in it, so one emptied any way at all leaves the list.
func (s *Store) pruneCategories(ctx context.Context, portfolioID string) error {
	_, err := s.pool.Exec(ctx, s.q(`DELETE FROM {s}.spend_categories c WHERE c.portfolio_id = $1
		AND NOT EXISTS (SELECT 1 FROM {s}.spends sp WHERE sp.portfolio_id = c.portfolio_id AND sp.category = c.name)`), portfolioID)
	return err
}

type SpendCategory struct {
	Name string `json:"name"`
	Icon string `json:"icon"`
}

func (s *Store) SpendCategories(ctx context.Context, portfolioID string) ([]SpendCategory, error) {
	rows, err := s.pool.Query(ctx, s.q(`SELECT name, icon FROM {s}.spend_categories WHERE portfolio_id = $1 ORDER BY name`), portfolioID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []SpendCategory{}
	for rows.Next() {
		var c SpendCategory
		if err := rows.Scan(&c.Name, &c.Icon); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) AddSpendCategories(ctx context.Context, portfolioID string, cats []SpendCategory) error {
	for _, c := range cats {
		if _, err := s.pool.Exec(ctx, s.q(`INSERT INTO {s}.spend_categories (portfolio_id, name, icon) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`),
			portfolioID, c.Name, c.Icon); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) SetCategoryIcon(ctx context.Context, portfolioID, name, icon string) error {
	tag, err := s.pool.Exec(ctx, s.q(`UPDATE {s}.spend_categories SET icon = $3 WHERE portfolio_id = $1 AND name = $2`), portfolioID, name, icon)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

func (s *Store) EmptyCategory(ctx context.Context, portfolioID, name string) error {
	if _, err := s.pool.Exec(ctx, s.q(`UPDATE {s}.spends SET category = '' WHERE portfolio_id = $1 AND category = $2`), portfolioID, name); err != nil {
		return err
	}
	return s.pruneCategories(ctx, portfolioID)
}

// RenameSpendCategory renames a category; renaming onto one that already exists joins the two.
func (s *Store) RenameSpendCategory(ctx context.Context, portfolioID, from, to string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, s.q(`UPDATE {s}.spends SET category = $3 WHERE portfolio_id = $1 AND category = $2`), portfolioID, from, to); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, s.q(`INSERT INTO {s}.spend_categories (portfolio_id, name, icon)
		SELECT portfolio_id, $3, icon FROM {s}.spend_categories WHERE portfolio_id = $1 AND name = $2 ON CONFLICT DO NOTHING`), portfolioID, from, to); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, s.q(`DELETE FROM {s}.spend_categories WHERE portfolio_id = $1 AND name = $2`), portfolioID, from); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

type SpendImport struct {
	ID        string    `json:"id"`
	Source    string    `json:"source"`
	Added     int       `json:"added"`
	Skipped   int       `json:"skipped"`
	CreatedAt time.Time `json:"createdAt"`
}

func spendHash(sp Spend, n int) string {
	sum := sha256.Sum256(fmt.Appendf(nil, "%s|%s|%.2f|%s|%s#%d", sp.Day.Format(time.DateOnly), strings.ToLower(sp.Item), sp.Amount, sp.Category, sp.PaidWith, n))
	return hex.EncodeToString(sum[:])
}

// ImportSpends numbers repeats inside one file rather than dropping them, as an export lists two identical coffees on one day as two rows.
func (s *Store) ImportSpends(ctx context.Context, portfolioID, userID, source string, spends []Spend, cats []SpendCategory) (*SpendImport, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	imp := &SpendImport{ID: NewID(), Source: source, CreatedAt: time.Now()}
	if _, err := tx.Exec(ctx, s.q(`INSERT INTO {s}.spend_imports (id, portfolio_id, source, added, skipped, user_id) VALUES ($1, $2, $3, 0, 0, $4)`),
		imp.ID, portfolioID, source, userID); err != nil {
		return nil, err
	}
	for _, c := range cats {
		if _, err := tx.Exec(ctx, s.q(`INSERT INTO {s}.spend_categories (portfolio_id, name, icon) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`),
			portfolioID, c.Name, c.Icon); err != nil {
			return nil, err
		}
	}
	seen := map[string]int{}
	for _, sp := range spends {
		first := spendHash(sp, 0)
		hash := spendHash(sp, seen[first])
		seen[first]++
		tag, err := tx.Exec(ctx, s.q(`INSERT INTO {s}.spends (id, portfolio_id, day, item, amount, category, paid_with, note, import_id, row_hash)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (portfolio_id, row_hash) DO NOTHING`),
			NewID(), portfolioID, sp.Day, sp.Item, sp.Amount, sp.Category, sp.PaidWith, sp.Note, imp.ID, hash)
		if err != nil {
			return nil, err
		}
		imp.Added += int(tag.RowsAffected())
	}
	imp.Skipped = len(spends) - imp.Added
	if _, err := tx.Exec(ctx, s.q(`UPDATE {s}.spend_imports SET added = $2, skipped = $3 WHERE id = $1`), imp.ID, imp.Added, imp.Skipped); err != nil {
		return nil, err
	}
	return imp, tx.Commit(ctx)
}

func (s *Store) SpendImports(ctx context.Context, portfolioID string) ([]SpendImport, error) {
	rows, err := s.pool.Query(ctx, s.q(`SELECT id::text, source, added, skipped, created_at FROM {s}.spend_imports WHERE portfolio_id = $1 ORDER BY created_at DESC`), portfolioID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []SpendImport{}
	for rows.Next() {
		var i SpendImport
		if err := rows.Scan(&i.ID, &i.Source, &i.Added, &i.Skipped, &i.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, i)
	}
	return out, rows.Err()
}

func (s *Store) DeleteSpendImport(ctx context.Context, portfolioID, id string) error {
	tag, err := s.pool.Exec(ctx, s.q(`DELETE FROM {s}.spend_imports WHERE portfolio_id = $1 AND id = $2`), portfolioID, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return s.pruneCategories(ctx, portfolioID)
}
