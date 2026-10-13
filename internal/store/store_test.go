package store

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

// openTwice opens a fresh schema at EBENEZER_TEST_DATABASE_URL, and gives a way to open it again as a restart would.
func openTwice(t *testing.T) (*Store, func() *Store) {
	t.Helper()
	url := os.Getenv("EBENEZER_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("EBENEZER_TEST_DATABASE_URL not set")
	}
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	schema := fmt.Sprintf("ebenezer_test_%x", b)
	ctx := context.Background()
	open := func() *Store {
		t.Helper()
		st, err := Open(ctx, url, schema)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(st.Close)
		return st
	}
	t.Cleanup(func() {
		if conn, err := pgx.Connect(ctx, url); err == nil {
			_, _ = conn.Exec(ctx, "DROP SCHEMA "+pgx.Identifier{schema}.Sanitize()+" CASCADE")
			conn.Close(ctx)
		}
	})
	return open(), open
}

func (s *Store) shape(t *testing.T) string {
	t.Helper()
	var out string
	err := s.pool.QueryRow(context.Background(), `SELECT
		(SELECT string_agg(table_name || '.' || column_name, ',' ORDER BY table_name, column_name) FROM information_schema.columns WHERE table_schema = $1) || '|' ||
		(SELECT string_agg(conname, ',' ORDER BY conname) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = $1) || '|' ||
		(SELECT string_agg(indexname, ',' ORDER BY indexname) FROM pg_indexes WHERE schemaname = $1)`, strings.Trim(s.schema, `"`)).Scan(&out)
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func TestTheSchemaRunsOnEveryStartAndChangesNothing(t *testing.T) {
	first, open := openTwice(t)
	before := first.shape(t)
	if after := open().shape(t); after != before {
		t.Fatalf("a second start changed the schema:\n%s\n%s", before, after)
	}
}

func TestAnOlderDatabaseIsBroughtUpToDate(t *testing.T) {
	st, open := openTwice(t)
	ctx := context.Background()
	if _, err := st.pool.Exec(ctx, st.q(`ALTER TABLE {s}.portfolios DROP COLUMN owner_id; ALTER TABLE {s}.job_runs DROP COLUMN catch_up_for`)); err != nil {
		t.Fatal(err)
	}
	admin, err := st.CreateOwner(ctx, "admin@example.com", "Admin", "hash")
	if err != nil {
		t.Fatal(err)
	}
	guest, err := st.CreateUser(ctx, "guest@example.com", "Guest", "hash")
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range []struct{ id, name string }{{NewID(), "Shared"}, {NewID(), "Guest's"}} {
		if _, err := st.pool.Exec(ctx, st.q(`INSERT INTO {s}.portfolios (id, name, slug) VALUES ($1, $2, $3)`), p.id, p.name, Slug(p.name)); err != nil {
			t.Fatal(err)
		}
		if err := st.SetMember(ctx, p.id, guest.ID, true); err != nil {
			t.Fatal(err)
		}
		if p.name == "Shared" {
			if err := st.SetMember(ctx, p.id, admin.ID, true); err != nil {
				t.Fatal(err)
			}
		}
	}

	ps, err := open().AllPortfolios(ctx)
	if err != nil {
		t.Fatal(err)
	}
	owners := map[string]string{}
	for _, p := range ps {
		owners[p.Name] = p.Owner
	}
	if owners["Shared"] != "Admin" || owners["Guest's"] != "Guest" {
		t.Fatalf("owners after the upgrade = %v", owners)
	}
}

func TestACatchUpRunsOnceHoweverManyCopiesTry(t *testing.T) {
	st, _ := openTwice(t)
	ctx := context.Background()
	missed := time.Now().Add(-time.Hour).Truncate(time.Minute)
	if _, err := st.StartJob(ctx, "prices", nil, &missed); err != nil {
		t.Fatal(err)
	}
	if _, err := st.StartJob(ctx, "prices", nil, &missed); !errors.Is(err, ErrNotFound) {
		t.Fatalf("a second catch-up for the same time = %v", err)
	}
	runs, err := st.LastRuns(ctx, NewID())
	if err != nil {
		t.Fatal(err)
	}
	if len(runs) != 1 || runs[0].CatchUpFor == nil || !runs[0].CatchUpFor.Equal(missed) {
		t.Fatalf("runs = %+v", runs)
	}
	started, err := st.LastStarts(ctx)
	if err != nil || started["prices:"].IsZero() {
		t.Fatalf("last starts = %v, %v", started, err)
	}
}
