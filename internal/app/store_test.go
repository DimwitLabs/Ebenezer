package app

import (
	"context"
	"crypto/rand"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/DimwitLabs/ebenezer/internal/market"
	"github.com/DimwitLabs/ebenezer/internal/store"
)

// testStore needs a real Postgres at EBENEZER_TEST_DATABASE_URL; each test gets its own schema.
func testStore(t *testing.T) *store.Store {
	t.Helper()
	url := os.Getenv("EBENEZER_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("EBENEZER_TEST_DATABASE_URL not set")
	}
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	schema := fmt.Sprintf("ebenezer_test_%x", b)
	ctx := context.Background()
	st, err := store.Open(ctx, url, schema)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		conn, err := pgx.Connect(ctx, url)
		if err == nil {
			_, _ = conn.Exec(ctx, "DROP SCHEMA "+pgx.Identifier{schema}.Sanitize()+" CASCADE")
			conn.Close(ctx)
		}
		st.Close()
	})
	return st
}

type roundTrip func(*http.Request) (*http.Response, error)

func (f roundTrip) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestABackfillCutShortKeepsTheHolidaysItFound(t *testing.T) {
	a := New(testStore(t), Config{})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	a.Market = &market.Client{HTTP: &http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
		if err := r.Context().Err(); err != nil {
			return nil, err
		}
		cancel()
		return &http.Response{StatusCode: http.StatusNotFound, Body: io.NopCloser(strings.NewReader("")), Request: r}, nil
	})}}
	if _, err := a.backfill(ctx); err == nil {
		t.Fatal("a stopped backfill reported success")
	}
	holidays := map[string]bool{}
	if _, err := a.Store.Setting(context.Background(), holidaysSetting, &holidays); err != nil {
		t.Fatal(err)
	}
	if len(holidays) != 1 {
		t.Fatalf("holidays kept = %v", holidays)
	}
}

func TestACloseIsCorrectedOnlyByItsOwnSource(t *testing.T) {
	st := testStore(t)
	ctx := context.Background()
	day := time.Date(2026, 10, 9, 0, 0, 0, 0, time.UTC)
	save := func(source, isin string, close float64) {
		t.Helper()
		if err := st.SavePrices(ctx, source, []store.Security{{ISIN: isin, Kind: "stock"}}, []store.Price{{ISIN: isin, Day: day, Close: close}}); err != nil {
			t.Fatal(err)
		}
	}
	save("coingecko", "CRYPTO-BTC", 100)
	save("coingecko", "CRYPTO-BTC", 120)
	save("nse", "INE002A01018", 50)
	save("bse", "INE002A01018", 51)
	got, err := st.PriceHistories(ctx, []string{"CRYPTO-BTC", "INE002A01018"}, day)
	if err != nil {
		t.Fatal(err)
	}
	if c := got["CRYPTO-BTC"]; len(c) != 1 || c[0].Close != 120 {
		t.Fatalf("coin = %v, want the later price", c)
	}
	if c := got["INE002A01018"]; len(c) != 1 || c[0].Close != 50 {
		t.Fatalf("share = %v, want NSE's close kept over BSE's", c)
	}
}

func TestOnlyOneOwnerWhenSetupRaces(t *testing.T) {
	st := testStore(t)
	ctx := context.Background()
	const n = 8
	errs := make(chan error, n)
	for i := range n {
		go func() {
			_, err := st.CreateOwner(ctx, fmt.Sprintf("owner%d@example.com", i), "Owner", "hash")
			errs <- err
		}()
	}
	won := 0
	for range n {
		if err := <-errs; err == nil {
			won++
		}
	}
	if users, err := st.CountUsers(ctx); err != nil || won != 1 || users != 1 {
		t.Fatalf("%d setups won, %d users, err %v", won, users, err)
	}
}
