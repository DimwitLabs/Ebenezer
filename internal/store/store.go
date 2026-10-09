package store

import (
	"context"
	"crypto/rand"
	_ "embed"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed schema.sql
var schema string

var (
	ErrNotFound = errors.New("not found")
	ErrConflict = errors.New("already exists")
)

type Store struct {
	pool   *pgxpool.Pool
	schema string
}

// Open connects with the simple protocol and explicit schemas because transaction poolers drop prepared statements and search_path.
func Open(ctx context.Context, databaseURL, schema string) (*Store, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("database url: %w", err)
	}
	cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	s := &Store{pool: pool, schema: pgx.Identifier{schema}.Sanitize()}
	if err := s.createTables(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) Close()                         { s.pool.Close() }
func (s *Store) Ping(ctx context.Context) error { return s.pool.Ping(ctx) }

func (s *Store) q(sql string) string { return strings.ReplaceAll(sql, "{s}", s.schema) }

func (s *Store) createTables(ctx context.Context) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, "ebenezer-schema:"+s.schema); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, s.q(`CREATE SCHEMA IF NOT EXISTS {s}`)); err != nil {
		return fmt.Errorf("create schema: %w", err)
	}
	var made bool
	if err := tx.QueryRow(ctx, `SELECT to_regclass($1) IS NOT NULL`, s.schema+".users").Scan(&made); err != nil {
		return err
	}
	if !made {
		if _, err := tx.Exec(ctx, s.q(schema)); err != nil {
			return fmt.Errorf("create tables: %w", err)
		}
	}
	return tx.Commit(ctx)
}

func NewID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

func notFound(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	return err
}
