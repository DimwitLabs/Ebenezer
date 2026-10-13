package store

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5/pgconn"
)

const DefaultColor = "#006c4b"

type Portfolio struct {
	ID       string            `json:"id"`
	Name     string            `json:"name"`
	Slug     string            `json:"slug"`
	Icon     string            `json:"icon"`
	Color    string            `json:"color"`
	People   []string          `json:"people"`
	OwnerID  *string           `json:"ownerId"`
	Owner    string            `json:"owner"`
	Currency string            `json:"currency"`
	FYStart  int               `json:"fyStart"`
	Settings PortfolioSettings `json:"settings"`
}

type NewsSettings struct {
	Enabled    bool            `json:"enabled"`
	Times      []string        `json:"times"`
	WindowDays int             `json:"windowDays"`
	PerScrip   int             `json:"perScrip"`
	AIJudge    bool            `json:"aiJudge"`
	Judge      json.RawMessage `json:"judge,omitempty"`
}

type Voice struct {
	Personality  string `json:"personality"`
	Custom       string `json:"custom"`
	Tone         string `json:"tone"`
	Instructions string `json:"instructions"`
	// empty uses the instance's model
	Model string `json:"model"`
}

type ReportSettings struct {
	Enabled  bool     `json:"enabled"`
	Time     string   `json:"time"`
	Days     []string `json:"days"`
	To       []string `json:"to"`
	Sections []string `json:"sections"`
}

type PortfolioSettings struct {
	Benchmark    string            `json:"benchmark"`
	Inflation    float64           `json:"inflation"`
	XIRRMinDays  int               `json:"xirrMinDays"`
	MorningCount string            `json:"morningCount"`
	News         NewsSettings      `json:"news"`
	Voice        Voice             `json:"voice"`
	Report       ReportSettings    `json:"report"`
	Moves        map[string]string `json:"moves"`
	// derived by the app, where the colour rules live, and saved whenever the colour changes
	Palette map[string]string `json:"palette,omitempty"`
}

func DefaultPortfolioSettings() PortfolioSettings {
	return PortfolioSettings{
		Benchmark:    "Nifty 50",
		Inflation:    5.5,
		XIRRMinDays:  90,
		MorningCount: "07:30",
		News:         NewsSettings{Enabled: true, Times: []string{"07:00", "18:30"}, WindowDays: 3, PerScrip: 6, AIJudge: true},
		Voice:        Voice{Personality: "accountant", Tone: "dry"},
		Report: ReportSettings{Time: "08:00", To: []string{}, Days: []string{"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"},
			Sections: []string{"summary", "note", "sections", "movers", "news", "health"}},
		Moves: map[string]string{},
	}
}

func decodePortfolioSettings(raw []byte) PortfolioSettings {
	ps := DefaultPortfolioSettings()
	_ = json.Unmarshal(raw, &ps)
	if ps.Report.To == nil {
		ps.Report.To = []string{}
	}
	if ps.Report.Days == nil {
		ps.Report.Days = []string{}
	}
	if ps.Report.Sections == nil {
		ps.Report.Sections = []string{}
	}
	if ps.Moves == nil {
		ps.Moves = map[string]string{}
	}
	return ps
}

const portfolioColumns = `p.id::text, p.name, p.slug, p.icon, p.color, p.currency, p.fy_start, p.settings,
	ARRAY(SELECT u.name FROM {s}.portfolio_members pm JOIN {s}.users u ON u.id = pm.user_id WHERE pm.portfolio_id = p.id ORDER BY u.created_at),
	p.owner_id::text, coalesce((SELECT u.name FROM {s}.users u WHERE u.id = p.owner_id), '')`

// Slug turns a name into a link; names that make the same slug cannot coexist, so "Family" and "family!" are one name.
func Slug(name string) string {
	var b strings.Builder
	dash := false
	for _, r := range strings.ToLower(name) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			if dash && b.Len() > 0 {
				b.WriteByte('-')
			}
			b.WriteRune(r)
			dash = false
		} else {
			dash = true
		}
	}
	return b.String()
}

func conflict(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return ErrConflict
	}
	return err
}

func scanPortfolio(row interface{ Scan(...any) error }) (*Portfolio, error) {
	p := &Portfolio{}
	var raw []byte
	if err := row.Scan(&p.ID, &p.Name, &p.Slug, &p.Icon, &p.Color, &p.Currency, &p.FYStart, &raw, &p.People, &p.OwnerID, &p.Owner); err != nil {
		return nil, notFound(err)
	}
	p.Settings = decodePortfolioSettings(raw)
	return p, nil
}

func (s *Store) ListPortfolios(ctx context.Context, userID string) ([]Portfolio, error) {
	rows, err := s.pool.Query(ctx, s.q(`SELECT `+portfolioColumns+` FROM {s}.portfolios p
		JOIN {s}.portfolio_members m ON m.portfolio_id = p.id WHERE m.user_id = $1 ORDER BY p.created_at`), userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Portfolio{}
	for rows.Next() {
		p, err := scanPortfolio(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *p)
	}
	return out, rows.Err()
}

func (s *Store) AllPortfolios(ctx context.Context) ([]Portfolio, error) {
	rows, err := s.pool.Query(ctx, s.q(`SELECT `+portfolioColumns+` FROM {s}.portfolios p ORDER BY p.created_at`))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Portfolio{}
	for rows.Next() {
		p, err := scanPortfolio(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *p)
	}
	return out, rows.Err()
}

func (s *Store) Portfolio(ctx context.Context, id, userID string) (*Portfolio, error) {
	return scanPortfolio(s.pool.QueryRow(ctx, s.q(`SELECT `+portfolioColumns+` FROM {s}.portfolios p
		JOIN {s}.portfolio_members m ON m.portfolio_id = p.id WHERE p.id = $1 AND m.user_id = $2`), id, userID))
}

func (s *Store) CreatePortfolio(ctx context.Context, user *User, name, currency string, fyStart int) (*Portfolio, error) {
	p := &Portfolio{ID: NewID(), Name: name, Slug: Slug(name), Icon: "account_balance_wallet", Color: DefaultColor, Currency: currency, FYStart: fyStart, Settings: DefaultPortfolioSettings(),
		People: []string{user.Name}, OwnerID: &user.ID, Owner: user.Name}
	raw, err := json.Marshal(p.Settings)
	if err != nil {
		return nil, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, s.q(`INSERT INTO {s}.portfolios (id, name, slug, currency, fy_start, settings, owner_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`),
		p.ID, name, p.Slug, currency, fyStart, string(raw), user.ID); err != nil {
		return nil, conflict(err)
	}
	if _, err := tx.Exec(ctx, s.q(`INSERT INTO {s}.portfolio_members (portfolio_id, user_id) VALUES ($1, $2)`), p.ID, user.ID); err != nil {
		return nil, err
	}
	return p, tx.Commit(ctx)
}

func (s *Store) UpdatePortfolio(ctx context.Context, p *Portfolio) error {
	raw, err := json.Marshal(p.Settings)
	if err != nil {
		return err
	}
	// Moves keep their stored value, so a settings save racing a move cannot undo it.
	p.Slug = Slug(p.Name)
	_, err = s.pool.Exec(ctx, s.q(`UPDATE {s}.portfolios SET name = $2, slug = $3, currency = $4, fy_start = $5,
		settings = $6::jsonb || jsonb_build_object('moves', coalesce(settings->'moves', '{}'::jsonb)), icon = $7, color = $8 WHERE id = $1`),
		p.ID, p.Name, p.Slug, p.Currency, p.FYStart, string(raw), p.Icon, p.Color)
	return conflict(err)
}

// SetMove sets or clears one holding's move in place, without reading and rewriting the other settings, so it cannot race a settings save.
func (s *Store) SetMove(ctx context.Context, portfolioID, isin, sectionID string) error {
	var err error
	if sectionID == "" {
		_, err = s.pool.Exec(ctx, s.q(`UPDATE {s}.portfolios SET settings = jsonb_set(settings, '{moves}',
			coalesce(settings->'moves', '{}'::jsonb) - $2::text) WHERE id = $1`), portfolioID, isin)
	} else {
		_, err = s.pool.Exec(ctx, s.q(`UPDATE {s}.portfolios SET settings = jsonb_set(settings, '{moves}',
			coalesce(settings->'moves', '{}'::jsonb) || jsonb_build_object($2::text, $3::text)) WHERE id = $1`), portfolioID, isin, sectionID)
	}
	return err
}

func (s *Store) DeletePortfolio(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, s.q(`DELETE FROM {s}.portfolios WHERE id = $1`), id)
	return err
}

func (s *Store) Members(ctx context.Context, portfolioID string) ([]User, error) {
	rows, err := s.pool.Query(ctx, s.q(`SELECT u.id::text, u.email, u.name, u.is_owner, u.must_change_password, u.password_hash
		FROM {s}.users u JOIN {s}.portfolio_members m ON m.user_id = u.id WHERE m.portfolio_id = $1 ORDER BY u.created_at`), portfolioID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []User{}
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *u)
	}
	return out, rows.Err()
}

func (s *Store) SetMember(ctx context.Context, portfolioID, userID string, member bool) error {
	if member {
		_, err := s.pool.Exec(ctx, s.q(`INSERT INTO {s}.portfolio_members (portfolio_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`), portfolioID, userID)
		return err
	}
	_, err := s.pool.Exec(ctx, s.q(`DELETE FROM {s}.portfolio_members WHERE portfolio_id = $1 AND user_id = $2`), portfolioID, userID)
	return err
}
