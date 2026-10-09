package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

type NewsItem struct {
	ID          int64      `json:"id"`
	Link        string     `json:"link"`
	Title       string     `json:"title"`
	Source      string     `json:"source"`
	Snippet     string     `json:"snippet"`
	PublishedAt *time.Time `json:"publishedAt"`
	Scrips      []string   `json:"scrips"`
	About       []string   `json:"about"`
	Verdict     string     `json:"verdict"`
	Category    string     `json:"category"`
	Reason      string     `json:"reason"`
	Also        int        `json:"also"`
}

// SaveNews stores stories; one already judged keeps its first verdict, so a later run never flips what the reader saw.
func (s *Store) SaveNews(ctx context.Context, portfolioID string, items []NewsItem) error {
	batch := &pgx.Batch{}
	for _, it := range items {
		batch.Queue(s.q(`INSERT INTO {s}.news (portfolio_id, link, title, source, snippet, published_at, scrips, about, verdict, category, reason, also)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT (portfolio_id, link) DO NOTHING`),
			portfolioID, it.Link, it.Title, it.Source, it.Snippet, it.PublishedAt, it.Scrips, it.About, it.Verdict, it.Category, it.Reason, it.Also)
	}
	return s.pool.SendBatch(ctx, batch).Close()
}

func (s *Store) NewsLink(ctx context.Context, portfolioID string, id int64) (link, title string, err error) {
	err = s.pool.QueryRow(ctx, s.q(`SELECT link, title FROM {s}.news WHERE portfolio_id = $1 AND id = $2`), portfolioID, id).Scan(&link, &title)
	return link, title, notFound(err)
}

func (s *Store) NewsItem(ctx context.Context, portfolioID string, id int64) (NewsItem, error) {
	var it NewsItem
	err := s.pool.QueryRow(ctx, s.q(`SELECT id, link, title, source, snippet, published_at, scrips, about, verdict, category, reason, also
		FROM {s}.news WHERE portfolio_id = $1 AND id = $2`), portfolioID, id).Scan(&it.ID, &it.Link, &it.Title, &it.Source, &it.Snippet,
		&it.PublishedAt, &it.Scrips, &it.About, &it.Verdict, &it.Category, &it.Reason, &it.Also)
	return it, notFound(err)
}

func (s *Store) JudgeNews(ctx context.Context, portfolioID string, it NewsItem) error {
	_, err := s.pool.Exec(ctx, s.q(`UPDATE {s}.news SET verdict = $3, about = $4, category = $5, reason = $6
		WHERE portfolio_id = $1 AND id = $2 AND verdict = ''`), portfolioID, it.ID, it.Verdict, it.About, it.Category, it.Reason)
	return err
}

func (s *Store) NewsLinks(ctx context.Context, portfolioID string, since time.Time) (map[string]bool, error) {
	rows, err := s.pool.Query(ctx, s.q(`SELECT link FROM {s}.news WHERE portfolio_id = $1 AND fetched_at >= $2`), portfolioID, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]bool{}
	for rows.Next() {
		var l string
		if err := rows.Scan(&l); err != nil {
			return nil, err
		}
		out[l] = true
	}
	return out, rows.Err()
}

func (s *Store) News(ctx context.Context, portfolioID string, since time.Time, limit int) ([]NewsItem, error) {
	rows, err := s.pool.Query(ctx, s.q(`SELECT id, link, title, source, snippet, published_at, scrips, about, verdict, category, reason, also
		FROM {s}.news WHERE portfolio_id = $1 AND coalesce(published_at, fetched_at) >= $2
		ORDER BY coalesce(published_at, fetched_at) DESC LIMIT $3`), portfolioID, since, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []NewsItem{}
	for rows.Next() {
		var it NewsItem
		if err := rows.Scan(&it.ID, &it.Link, &it.Title, &it.Source, &it.Snippet, &it.PublishedAt, &it.Scrips, &it.About,
			&it.Verdict, &it.Category, &it.Reason, &it.Also); err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

func (s *Store) SecuritiesByISIN(ctx context.Context, isins []string) (map[string]Security, error) {
	out := map[string]Security{}
	if len(isins) == 0 {
		return out, nil
	}
	rows, err := s.pool.Query(ctx, s.q(`SELECT isin, symbol, bse_code, name, kind, category FROM {s}.securities WHERE isin = ANY($1)`), isins)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var sec Security
		if err := rows.Scan(&sec.ISIN, &sec.Symbol, &sec.BSECode, &sec.Name, &sec.Kind, &sec.Category); err != nil {
			return nil, err
		}
		out[sec.ISIN] = sec
	}
	return out, rows.Err()
}
