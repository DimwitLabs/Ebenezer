package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
)

type User struct {
	ID           string `json:"id"`
	Email        string `json:"email"`
	Name         string `json:"name"`
	IsOwner      bool   `json:"isOwner"`
	MustChange   bool   `json:"mustChangePassword"`
	PasswordHash string `json:"-"`
}

const userColumns = `id::text, email, name, is_owner, must_change_password, password_hash`

func scanUser(row interface{ Scan(...any) error }) (*User, error) {
	u := &User{}
	if err := row.Scan(&u.ID, &u.Email, &u.Name, &u.IsOwner, &u.MustChange, &u.PasswordHash); err != nil {
		return nil, notFound(err)
	}
	return u, nil
}

func (s *Store) CountUsers(ctx context.Context) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, s.q(`SELECT count(*) FROM {s}.users`)).Scan(&n)
	return n, err
}

func (s *Store) CreateUser(ctx context.Context, email, name, passwordHash string) (*User, error) {
	u := &User{ID: NewID(), Email: email, Name: name, MustChange: true, PasswordHash: passwordHash}
	_, err := s.pool.Exec(ctx, s.q(`INSERT INTO {s}.users (id, email, name, password_hash, must_change_password) VALUES ($1, $2, $3, $4, true)`),
		u.ID, u.Email, u.Name, u.PasswordHash)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return nil, ErrConflict
	}
	return u, err
}

// CreateOwner only succeeds on an empty instance, so two people racing through setup cannot both win.
func (s *Store) CreateOwner(ctx context.Context, email, name, passwordHash string) (*User, error) {
	u := &User{ID: NewID(), Email: email, Name: name, IsOwner: true, PasswordHash: passwordHash}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, "ebenezer-setup:"+s.schema); err != nil {
		return nil, err
	}
	tag, err := tx.Exec(ctx, s.q(`INSERT INTO {s}.users (id, email, name, password_hash, is_owner)
		SELECT $1, $2, $3, $4, true WHERE NOT EXISTS (SELECT 1 FROM {s}.users)`), u.ID, u.Email, u.Name, u.PasswordHash)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrConflict
	}
	return u, tx.Commit(ctx)
}

// SetPassword also signs out every other session, so a stolen cookie stops working with the old password.
func (s *Store) SetPassword(ctx context.Context, userID, passwordHash string, keepSession []byte) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, s.q(`UPDATE {s}.users SET password_hash = $2, must_change_password = false WHERE id = $1`), userID, passwordHash); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, s.q(`DELETE FROM {s}.sessions WHERE user_id = $1 AND token_hash <> $2`), userID, keepSession); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ResetFirstPassword sets a new first password and signs out anywhere the old one was used.
func (s *Store) ResetFirstPassword(ctx context.Context, userID, passwordHash string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	tag, err := tx.Exec(ctx, s.q(`UPDATE {s}.users SET password_hash = $2 WHERE id = $1 AND must_change_password`), userID, passwordHash)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	if _, err := tx.Exec(ctx, s.q(`DELETE FROM {s}.sessions WHERE user_id = $1`), userID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Store) UserByID(ctx context.Context, id string) (*User, error) {
	return scanUser(s.pool.QueryRow(ctx, s.q(`SELECT `+userColumns+` FROM {s}.users WHERE id = $1`), id))
}

func (s *Store) UserByEmail(ctx context.Context, email string) (*User, error) {
	return scanUser(s.pool.QueryRow(ctx, s.q(`SELECT `+userColumns+` FROM {s}.users WHERE email = $1`), email))
}

func (s *Store) Owner(ctx context.Context) (*User, error) {
	return scanUser(s.pool.QueryRow(ctx, s.q(`SELECT `+userColumns+` FROM {s}.users WHERE is_owner`)))
}

func (s *Store) ListUsers(ctx context.Context) ([]User, error) {
	rows, err := s.pool.Query(ctx, s.q(`SELECT `+userColumns+` FROM {s}.users ORDER BY created_at`))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []User
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *u)
	}
	return out, rows.Err()
}

// SoleMemberOf lists the portfolios that would be stranded without this person.
func (s *Store) SoleMemberOf(ctx context.Context, userID string) ([]string, error) {
	rows, err := s.pool.Query(ctx, s.q(`SELECT p.name FROM {s}.portfolios p
		JOIN {s}.portfolio_members m ON m.portfolio_id = p.id AND m.user_id = $1
		WHERE (SELECT count(*) FROM {s}.portfolio_members o WHERE o.portfolio_id = p.id) = 1 ORDER BY p.name`), userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var names []string
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			return nil, err
		}
		names = append(names, n)
	}
	return names, rows.Err()
}

func (s *Store) DeleteUser(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, s.q(`DELETE FROM {s}.users WHERE id = $1 AND NOT is_owner`), id)
	return err
}

func (s *Store) CreateSession(ctx context.Context, tokenHash []byte, userID string, ttl time.Duration) error {
	_, err := s.pool.Exec(ctx, s.q(`INSERT INTO {s}.sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`),
		tokenHash, userID, time.Now().Add(ttl))
	return err
}

func (s *Store) SessionUser(ctx context.Context, tokenHash []byte) (*User, error) {
	return scanUser(s.pool.QueryRow(ctx, s.q(`
		SELECT u.id::text, u.email, u.name, u.is_owner, u.must_change_password, u.password_hash
		FROM {s}.sessions s JOIN {s}.users u ON u.id = s.user_id
		WHERE s.token_hash = $1 AND s.expires_at > now()`), tokenHash))
}

func (s *Store) DeleteSession(ctx context.Context, tokenHash []byte) error {
	_, err := s.pool.Exec(ctx, s.q(`DELETE FROM {s}.sessions WHERE token_hash = $1`), tokenHash)
	return err
}

func (s *Store) PurgeExpiredSessions(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, s.q(`DELETE FROM {s}.sessions WHERE expires_at <= now()`))
	return err
}
