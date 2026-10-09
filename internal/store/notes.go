package store

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
)

// VoicedNotes holds saved notes; Voice names the version of the rules they were written under.
type VoicedNotes struct {
	Voice string
	Notes json.RawMessage
}

func (s *Store) VoicedNotes(ctx context.Context, portfolioID string) (VoicedNotes, error) {
	var v VoicedNotes
	var raw []byte
	err := s.pool.QueryRow(ctx, s.q(`SELECT voice, lines FROM {s}.voiced_notes WHERE portfolio_id = $1`), portfolioID).Scan(&v.Voice, &raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return v, nil
	}
	v.Notes = raw
	return v, err
}

func (s *Store) SaveVoicedNotes(ctx context.Context, portfolioID string, v VoicedNotes) error {
	_, err := s.pool.Exec(ctx, s.q(`INSERT INTO {s}.voiced_notes (portfolio_id, voice, lines) VALUES ($1, $2, $3)
		ON CONFLICT (portfolio_id) DO UPDATE SET voice = EXCLUDED.voice, lines = EXCLUDED.lines, updated_at = now()`), portfolioID, v.Voice, string(v.Notes))
	return err
}
