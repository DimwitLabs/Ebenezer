package server

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/DimwitLabs/ebenezer/internal/app"
	"github.com/DimwitLabs/ebenezer/internal/seal"
	"github.com/DimwitLabs/ebenezer/internal/store"
	"github.com/DimwitLabs/ebenezer/internal/value"
)

// newTestServer needs a real Postgres at EBENEZER_TEST_DATABASE_URL; each test gets its own schema.
func newTestServer(t *testing.T) *httptest.Server {
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
	static := fstest.MapFS{
		"index.html":          {Data: []byte("<!doctype html><title>Ebenezer</title>")},
		"assets/app.js":       {Data: []byte("console.log(1)")},
		"assets/sandbox-1.js": {Data: []byte("self.onmessage=()=>{}")},
	}
	box, _ := seal.New(strings.Repeat("k", seal.MinKey))
	a := app.New(st, app.Config{Seal: box})
	a.Market = nil
	srv := New(a, Config{SessionTTL: time.Hour}, static)
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)
	return ts
}

type client struct {
	t    *testing.T
	base string
	http *http.Client
}

func newClient(t *testing.T, ts *httptest.Server) *client {
	jar, _ := cookiejar.New(nil)
	return &client{t: t, base: ts.URL, http: &http.Client{Jar: jar}}
}

func (c *client) do(method, path string, body any, out any) int {
	c.t.Helper()
	var r io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		r = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, c.base+path, r)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Ebenezer-Request", "1")
	res, err := c.http.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer res.Body.Close()
	if out != nil && res.StatusCode < 300 {
		if err := json.NewDecoder(res.Body).Decode(out); err != nil {
			c.t.Fatalf("%s %s: %v", method, path, err)
		}
	}
	return res.StatusCode
}

func (c *client) must(want int, method, path string, body any, out any) {
	c.t.Helper()
	if got := c.do(method, path, body, out); got != want {
		c.t.Fatalf("%s %s: status %d, want %d", method, path, got, want)
	}
}

type portfolio struct {
	ID string `json:"id"`
}

type section struct {
	ID   string `json:"id"`
	Kind string `json:"kind"`
}

func setUp(t *testing.T, ts *httptest.Server) (*client, string, map[string]string) {
	t.Helper()
	c := newClient(t, ts)
	c.must(http.StatusCreated, "POST", "/api/setup", map[string]string{"email": "owner@example.com", "name": "Owner", "password": "correct horse battery"}, nil)
	var p portfolio
	c.must(http.StatusCreated, "POST", "/api/portfolios", map[string]any{"name": "Family", "kinds": []string{"stocks", "savings", "loans"}}, &p)
	var secs []section
	c.must(http.StatusOK, "GET", "/api/portfolios/"+p.ID+"/sections", nil, &secs)
	byKind := map[string]string{}
	for _, s := range secs {
		byKind[s.Kind] = s.ID
	}
	return c, p.ID, byKind
}

func TestSetupOnlyOnce(t *testing.T) {
	ts := newTestServer(t)
	setUp(t, ts)
	other := newClient(t, ts)
	if got := other.do("POST", "/api/setup", map[string]string{"email": "x@example.com", "name": "X", "password": "correct horse battery"}, nil); got < 400 {
		t.Fatalf("second setup allowed: %d", got)
	}
}

func TestLogin(t *testing.T) {
	ts := newTestServer(t)
	setUp(t, ts)
	c := newClient(t, ts)
	if got := c.do("POST", "/api/login", map[string]string{"email": "owner@example.com", "password": "wrong password here"}, nil); got != http.StatusUnauthorized {
		t.Fatalf("wrong password: %d", got)
	}
	if got := c.do("POST", "/api/login", map[string]string{"email": "nobody@example.com", "password": "wrong password here"}, nil); got != http.StatusUnauthorized {
		t.Fatalf("unknown email: %d", got)
	}
	c.must(http.StatusOK, "POST", "/api/login", map[string]string{"email": "OWNER@example.com", "password": "correct horse battery"}, nil)
	var ps []portfolio
	c.must(http.StatusOK, "GET", "/api/portfolios", nil, &ps)
	if len(ps) != 1 {
		t.Fatalf("portfolios = %d", len(ps))
	}
	c.must(http.StatusOK, "POST", "/api/logout", nil, nil)
	if got := c.do("GET", "/api/portfolios", nil, nil); got != http.StatusUnauthorized {
		t.Fatalf("after logout: %d", got)
	}
}

func TestCSRFHeaderRequired(t *testing.T) {
	ts := newTestServer(t)
	res, err := http.Post(ts.URL+"/api/setup", "application/json", strings.NewReader(`{}`))
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("status %d", res.StatusCode)
	}
}

func TestSandboxCannotReachNetwork(t *testing.T) {
	ts := newTestServer(t)
	res, err := http.Get(ts.URL + "/assets/sandbox-1.js")
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if csp := res.Header.Get("Content-Security-Policy"); !strings.Contains(csp, "connect-src 'none'") {
		t.Fatalf("sandbox csp = %q", csp)
	}
	res, err = http.Get(ts.URL + "/")
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if csp := res.Header.Get("Content-Security-Policy"); strings.Contains(csp, "unsafe-eval") {
		t.Fatalf("page csp allows eval: %q", csp)
	}
}

func TestOthersCannotSeeAPortfolio(t *testing.T) {
	ts := newTestServer(t)
	owner, pid, secs := setUp(t, ts)
	owner.must(http.StatusCreated, "POST", "/api/users", map[string]string{"email": "guest@example.com", "name": "Guest", "password": "another long password"}, nil)

	guest := newClient(t, ts)
	guest.firstSignIn("guest@example.com", "another long password")
	for _, path := range []string{"/api/portfolios/" + pid, "/api/portfolios/" + pid + "/summary", "/api/sections/" + secs["stocks"] + "/rows"} {
		if got := guest.do("GET", path, nil, nil); got != http.StatusNotFound {
			t.Fatalf("guest GET %s: %d", path, got)
		}
	}
	if got := guest.do("POST", "/api/sections/"+secs["savings"]+"/rows", map[string]any{"account": "x", "balance": 1}, nil); got != http.StatusNotFound {
		t.Fatalf("guest add row: %d", got)
	}
	if got := guest.do("POST", "/api/users", map[string]string{"email": "g2@example.com", "name": "G", "password": "another long password"}, nil); got != http.StatusForbidden {
		t.Fatalf("guest add user: %d", got)
	}
	if got := guest.do("GET", "/api/portfolios/not-a-uuid", nil, nil); got != http.StatusNotFound {
		t.Fatalf("bad id: %d", got)
	}
}

func TestImportBuildsHoldingsAndSummary(t *testing.T) {
	ts := newTestServer(t)
	c, pid, secs := setUp(t, ts)

	c.must(http.StatusCreated, "POST", "/api/sections/"+secs["stocks"]+"/import", map[string]any{
		"source": "Test",
		"rows": []map[string]any{
			{"date": "05/01/2024", "symbol": "INFY", "isin": "INE009A01021", "action": "Buy", "quantity": "10", "price": "1,500", "extra": "dropped"},
			{"date": "2024-03-01", "symbol": "INFY", "isin": "INE009A01021", "action": "Buy", "quantity": 5, "price": 1600},
			{"date": "2024-06-01", "symbol": "INFY", "isin": "INE009A01021", "action": "Sell", "quantity": 12, "price": 1700},
		},
	}, nil)

	var rows []struct {
		Data map[string]any `json:"data"`
	}
	c.must(http.StatusOK, "GET", "/api/sections/"+secs["stocks"]+"/rows", nil, &rows)
	if len(rows) != 3 {
		t.Fatalf("rows = %d", len(rows))
	}
	for _, r := range rows {
		if _, ok := r.Data["extra"]; ok {
			t.Fatal("unknown field kept")
		}
		if d, _ := r.Data["date"].(string); len(d) != 10 || d[4] != '-' {
			t.Fatalf("date not normalised: %v", r.Data["date"])
		}
	}

	var hs []store.Holding
	c.must(http.StatusOK, "GET", "/api/sections/"+secs["stocks"]+"/holdings", nil, &hs)
	if len(hs) != 1 || hs[0].Quantity != 3 || hs[0].Cost != 3*1600 {
		t.Fatalf("holdings = %+v", hs)
	}

	c.must(http.StatusCreated, "POST", "/api/sections/"+secs["savings"]+"/rows", map[string]any{"account": "Bank", "balance": 100000}, nil)
	c.must(http.StatusCreated, "POST", "/api/sections/"+secs["loans"]+"/rows", map[string]any{"lender": "Bank", "outstanding": 40000}, nil)
	if got := c.do("POST", "/api/sections/"+secs["savings"]+"/rows", map[string]any{"account": "Bank"}, nil); got != http.StatusBadRequest {
		t.Fatalf("missing required field: %d", got)
	}

	var sum struct {
		NetWorth    float64 `json:"netWorth"`
		Assets      float64 `json:"assets"`
		Liabilities float64 `json:"liabilities"`
	}
	c.must(http.StatusOK, "GET", "/api/portfolios/"+pid+"/summary", nil, &sum)
	if sum.Liabilities != 40000 || sum.Assets < 100000 || sum.NetWorth != sum.Assets-sum.Liabilities {
		t.Fatalf("summary = %+v", sum)
	}
}

func TestIdenticalFillsBothCount(t *testing.T) {
	ts := newTestServer(t)
	c, _, secs := setUp(t, ts)
	fill := map[string]any{"date": "2024-01-05", "symbol": "INFY", "action": "Buy", "quantity": 10, "price": 1500}
	body := map[string]any{"rows": []map[string]any{fill, fill}}
	c.must(http.StatusCreated, "POST", "/api/sections/"+secs["stocks"]+"/import", body, nil)
	c.must(http.StatusCreated, "POST", "/api/sections/"+secs["stocks"]+"/import", body, nil)
	var hs []store.Holding
	c.must(http.StatusOK, "GET", "/api/sections/"+secs["stocks"]+"/holdings", nil, &hs)
	if len(hs) != 1 || hs[0].Quantity != 20 {
		t.Fatalf("holdings = %+v", hs)
	}
}

func TestPasswordChangeSignsOutOtherSessions(t *testing.T) {
	ts := newTestServer(t)
	c, _, _ := setUp(t, ts)
	other := newClient(t, ts)
	other.must(http.StatusOK, "POST", "/api/login", map[string]string{"email": "owner@example.com", "password": "correct horse battery"}, nil)
	c.must(http.StatusOK, "PUT", "/api/me/password", map[string]string{"current": "correct horse battery", "new": "a brand new passphrase"}, nil)
	if got := other.do("GET", "/api/portfolios", nil, nil); got != http.StatusUnauthorized {
		t.Fatalf("other session after change: %d", got)
	}
	c.must(http.StatusOK, "GET", "/api/portfolios", nil, nil)
}

func TestCannotStrandAPortfolio(t *testing.T) {
	ts := newTestServer(t)
	owner, _, _ := setUp(t, ts)
	var guestUser struct {
		ID string `json:"id"`
	}
	owner.must(http.StatusCreated, "POST", "/api/users", map[string]string{"email": "guest@example.com", "name": "Guest", "password": "another long password"}, &guestUser)
	guest := newClient(t, ts)
	guest.firstSignIn("guest@example.com", "another long password")
	guest.must(http.StatusCreated, "POST", "/api/portfolios", map[string]any{"name": "Mine"}, nil)
	if got := owner.do("DELETE", "/api/users/"+guestUser.ID, nil, nil); got != http.StatusConflict {
		t.Fatalf("delete sole member: %d", got)
	}
}

func TestRenameKeepsDescription(t *testing.T) {
	ts := newTestServer(t)
	c, _, secs := setUp(t, ts)
	c.must(http.StatusOK, "PATCH", "/api/sections/"+secs["savings"], map[string]any{"description": "Emergency fund"}, nil)
	c.must(http.StatusOK, "PATCH", "/api/sections/"+secs["savings"], map[string]any{"name": "Cash"}, nil)
	var s struct {
		Description string `json:"description"`
	}
	c.must(http.StatusOK, "PATCH", "/api/sections/"+secs["savings"], map[string]any{}, &s)
	if s.Description != "Emergency fund" {
		t.Fatalf("description = %q", s.Description)
	}
}

func TestOneSectionPerKind(t *testing.T) {
	ts := newTestServer(t)
	c, pid, _ := setUp(t, ts)
	if got := c.do("POST", "/api/portfolios/"+pid+"/sections", map[string]any{"kind": "stocks"}, nil); got != http.StatusConflict {
		t.Fatalf("second stocks section: %d", got)
	}
	custom := map[string]any{"kind": "custom", "name": "Art", "valuation": "manual", "valueField": "value",
		"fields": []map[string]any{{"label": "Value", "type": "money"}}}
	c.must(http.StatusCreated, "POST", "/api/portfolios/"+pid+"/sections", custom, nil)
	c.must(http.StatusCreated, "POST", "/api/portfolios/"+pid+"/sections", custom, nil)
}

func TestMoveCreatesGoldAndSurvivesSettingsSave(t *testing.T) {
	ts := newTestServer(t)
	c, pid, _ := setUp(t, ts)
	var p struct {
		Settings map[string]any `json:"settings"`
	}
	c.must(http.StatusOK, "PUT", "/api/portfolios/"+pid+"/moves", map[string]any{"isin": "INF204KB17I5", "to": "gold"}, &p)
	moves, _ := p.Settings["moves"].(map[string]any)
	if moves["INF204KB17I5"] == nil {
		t.Fatalf("move not saved: %v", p.Settings)
	}
	p.Settings["moves"] = map[string]any{}
	c.must(http.StatusOK, "PATCH", "/api/portfolios/"+pid, map[string]any{"settings": p.Settings}, &p)
	if moves, _ := p.Settings["moves"].(map[string]any); moves["INF204KB17I5"] == nil {
		t.Fatal("a settings save undid the move")
	}
	var secs []section
	c.must(http.StatusOK, "GET", "/api/portfolios/"+pid+"/sections", nil, &secs)
	found := false
	for _, s := range secs {
		found = found || s.Kind == "gold"
	}
	if !found {
		t.Fatal("gold section not created")
	}
}

func TestSecretsAreNeverSentBack(t *testing.T) {
	ts := newTestServer(t)
	c, _, _ := setUp(t, ts)
	c.must(http.StatusOK, "PUT", "/api/settings/secrets/ntfy_password", map[string]string{"value": "hunter2-secret"}, nil)
	req, _ := http.NewRequest("GET", ts.URL+"/api/settings", nil)
	res, err := c.http.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if strings.Contains(string(body), "hunter2") || !strings.Contains(string(body), `"ntfy_password":{"set":true`) {
		t.Fatalf("settings = %s", body)
	}
	if got := c.do("PUT", "/api/settings/secrets/anything", map[string]string{"value": "x"}, nil); got != http.StatusNotFound {
		t.Fatalf("unknown secret: %d", got)
	}
}

func TestReportPreview(t *testing.T) {
	ts := newTestServer(t)
	c, pid, secs := setUp(t, ts)
	c.must(http.StatusCreated, "POST", "/api/sections/"+secs["savings"]+"/rows", map[string]any{"account": "Bank", "balance": 100000}, nil)
	res, err := c.http.Get(ts.URL + "/api/portfolios/" + pid + "/report")
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if res.StatusCode != http.StatusOK || !strings.Contains(string(body), "Family") || !strings.Contains(string(body), "₹1.00\u202fL") {
		t.Fatalf("report %d: %.400s", res.StatusCode, body)
	}
}

func TestOnlyOwnerChoosesReportRecipients(t *testing.T) {
	ts := newTestServer(t)
	owner, pid, _ := setUp(t, ts)
	var guestUser struct {
		ID string `json:"id"`
	}
	owner.must(http.StatusCreated, "POST", "/api/users", map[string]string{"email": "guest@example.com", "name": "Guest", "password": "another long password"}, &guestUser)
	owner.must(http.StatusOK, "PUT", "/api/portfolios/"+pid+"/members/"+guestUser.ID, nil, nil)
	guest := newClient(t, ts)
	guest.firstSignIn("guest@example.com", "another long password")
	var p struct {
		Settings map[string]any `json:"settings"`
	}
	guest.must(http.StatusOK, "GET", "/api/portfolios/"+pid, nil, &p)
	report := p.Settings["report"].(map[string]any)
	report["to"] = []string{"stranger@example.com"}
	if got := guest.do("PATCH", "/api/portfolios/"+pid, map[string]any{"settings": p.Settings}, nil); got != http.StatusForbidden {
		t.Fatalf("guest changing recipients: %d", got)
	}
	report["to"] = []string{}
	report["time"] = "09:00"
	guest.must(http.StatusOK, "PATCH", "/api/portfolios/"+pid, map[string]any{"settings": p.Settings}, nil)
}

func TestOnlyOwnerShares(t *testing.T) {
	ts := newTestServer(t)
	owner, pid, _ := setUp(t, ts)
	var guestUser, other struct {
		ID string `json:"id"`
	}
	var users []struct {
		ID      string `json:"id"`
		IsOwner bool   `json:"isOwner"`
	}
	owner.must(http.StatusOK, "GET", "/api/users", nil, &users)
	ownerID := users[0].ID
	owner.must(http.StatusCreated, "POST", "/api/users", map[string]string{"email": "guest@example.com", "name": "Guest", "password": "another long password"}, &guestUser)
	owner.must(http.StatusCreated, "POST", "/api/users", map[string]string{"email": "other@example.com", "name": "Other", "password": "a third long password"}, &other)
	owner.must(http.StatusOK, "PUT", "/api/portfolios/"+pid+"/members/"+guestUser.ID, nil, nil)
	guest := newClient(t, ts)
	guest.firstSignIn("guest@example.com", "another long password")
	guest.must(http.StatusForbidden, "PUT", "/api/portfolios/"+pid+"/members/"+other.ID, nil, nil)
	guest.must(http.StatusForbidden, "DELETE", "/api/portfolios/"+pid+"/members/"+ownerID, nil, nil)
	owner.must(http.StatusOK, "DELETE", "/api/portfolios/"+pid+"/members/"+guestUser.ID, nil, nil)
}

func TestOnlyAPortfoliosOwnerDeletesIt(t *testing.T) {
	ts := newTestServer(t)
	admin, family, _ := setUp(t, ts)
	var guestUser struct {
		ID string `json:"id"`
	}
	admin.must(http.StatusCreated, "POST", "/api/users", map[string]string{"email": "guest@example.com", "name": "Guest", "password": "another long password"}, &guestUser)
	admin.must(http.StatusOK, "PUT", "/api/portfolios/"+family+"/members/"+guestUser.ID, nil, nil)
	guest := newClient(t, ts)
	guest.firstSignIn("guest@example.com", "another long password")
	var mine struct {
		ID      string `json:"id"`
		OwnerID string `json:"ownerId"`
		Owner   string `json:"owner"`
	}
	guest.must(http.StatusCreated, "POST", "/api/portfolios", map[string]any{"name": "Mine"}, &mine)
	if mine.OwnerID != guestUser.ID || mine.Owner != "Guest" {
		t.Fatalf("new portfolio owner = %+v", mine)
	}

	guest.must(http.StatusForbidden, "DELETE", "/api/portfolios/"+family, nil, nil)
	admin.must(http.StatusNotFound, "DELETE", "/api/portfolios/"+mine.ID, nil, nil)
	guest.must(http.StatusOK, "DELETE", "/api/portfolios/"+mine.ID, nil, nil)
	admin.must(http.StatusOK, "DELETE", "/api/portfolios/"+family, nil, nil)
}

func TestScripDetailOnlyForHeldScrips(t *testing.T) {
	ts := newTestServer(t)
	c, pid, secs := setUp(t, ts)
	c.must(http.StatusCreated, "POST", "/api/sections/"+secs["stocks"]+"/import", map[string]any{
		"source": "Test",
		"rows":   []map[string]any{{"date": "2024-01-05", "symbol": "INFY", "isin": "INE009A01021", "action": "Buy", "quantity": 10, "price": 1500}},
	}, nil)
	var v struct {
		Holding store.Holding    `json:"holding"`
		History []store.Close    `json:"history"`
		News    []store.NewsItem `json:"news"`
		Trades  []value.Trade    `json:"trades"`
	}
	c.must(http.StatusOK, "GET", "/api/portfolios/"+pid+"/scrips/INE009A01021", nil, &v)
	if v.Holding.Quantity != 10 || v.History == nil || v.News == nil || len(v.Trades) != 1 || v.Trades[0].Amount != 15000 || v.Trades[0].Date != "2024-01-05" {
		t.Fatalf("scrip = %+v", v)
	}
	c.must(http.StatusNotFound, "GET", "/api/portfolios/"+pid+"/scrips/INE002A01018", nil, nil)
	c.must(http.StatusNotFound, "GET", "/api/portfolios/"+pid+"/scrips/not-an-isin", nil, nil)
	c.must(http.StatusNotFound, "POST", "/api/portfolios/"+pid+"/news/999/judge", nil, nil)
	c.must(http.StatusNotFound, "POST", "/api/portfolios/"+pid+"/news/x/judge", nil, nil)
}

func TestPortfolioNamesMakeUniqueLinks(t *testing.T) {
	ts := newTestServer(t)
	c, pid, _ := setUp(t, ts)
	var p struct {
		Slug string `json:"slug"`
	}
	c.must(http.StatusCreated, "POST", "/api/portfolios", map[string]any{"name": "Mum & Dad"}, &p)
	if p.Slug != "mum-dad" {
		t.Fatalf("slug %q", p.Slug)
	}
	c.must(http.StatusConflict, "POST", "/api/portfolios", map[string]any{"name": "mum dad!"}, nil)
	c.must(http.StatusConflict, "PATCH", "/api/portfolios/"+pid, map[string]any{"name": "MUM-DAD"}, nil)
	c.must(http.StatusBadRequest, "POST", "/api/portfolios", map[string]any{"name": "!!!"}, nil)
}

func TestInsuranceIsNeverCounted(t *testing.T) {
	ts := newTestServer(t)
	c, pid, _ := setUp(t, ts)
	var sec struct {
		ID     string `json:"id"`
		Counts bool   `json:"counts"`
	}
	c.must(http.StatusCreated, "POST", "/api/portfolios/"+pid+"/sections", map[string]any{"kind": "insurance", "counts": true}, &sec)
	if sec.Counts {
		t.Fatal("an insurance section was counted in net worth")
	}
}

func TestTradesReplaceOpeningPositions(t *testing.T) {
	ts := newTestServer(t)
	c, pid, secs := setUp(t, ts)
	opening := map[string]any{"date": "2026-08-31", "isin": "INE009A01021", "action": "Buy", "quantity": 10, "price": 1800}
	other := map[string]any{"date": "2026-08-31", "isin": "INE002A01018", "action": "Buy", "quantity": 5, "price": 1300}
	c.must(http.StatusCreated, "POST", "/api/sections/"+secs["stocks"]+"/import", map[string]any{"source": "x.pdf", "basis": "opening", "rows": []map[string]any{opening, other}}, nil)
	var v struct {
		Holding store.Holding `json:"holding"`
	}
	c.must(http.StatusOK, "GET", "/api/portfolios/"+pid+"/scrips/INE009A01021", nil, &v)
	if !v.Holding.CostUnknown {
		t.Fatal("a statement's opening position should have no known cost")
	}
	var imp store.Import
	c.must(http.StatusCreated, "POST", "/api/sections/"+secs["stocks"]+"/import", map[string]any{"source": "tradebook", "rows": []map[string]any{
		{"date": "2022-03-01", "isin": "INE009A01021", "action": "Buy", "quantity": 10, "price": 1500},
	}}, &imp)
	if imp.Replaced != 1 {
		t.Fatalf("replaced %d opening rows, want 1", imp.Replaced)
	}
	c.must(http.StatusOK, "GET", "/api/portfolios/"+pid+"/scrips/INE009A01021", nil, &v)
	if v.Holding.CostUnknown || v.Holding.Quantity != 10 || v.Holding.Cost != 15000 {
		t.Fatalf("after the tradebook, holding = %+v", v.Holding)
	}
	c.must(http.StatusOK, "GET", "/api/portfolios/"+pid+"/scrips/INE002A01018", nil, &v)
	if !v.Holding.CostUnknown {
		t.Fatal("a scrip the tradebook did not mention keeps its opening position")
	}
	c.must(http.StatusBadRequest, "POST", "/api/sections/"+secs["stocks"]+"/import", map[string]any{"source": "x", "basis": "guess", "rows": []map[string]any{other}}, nil)
}

func TestStoppingAJobThatIsNotRunning(t *testing.T) {
	ts := newTestServer(t)
	c, pid, _ := setUp(t, ts)
	c.must(http.StatusConflict, "DELETE", "/api/portfolios/"+pid+"/jobs/news", nil, nil)
	c.must(http.StatusNotFound, "DELETE", "/api/portfolios/"+pid+"/jobs/nope", nil, nil)
}

func TestTidyWithoutAnAIModel(t *testing.T) {
	ts := newTestServer(t)
	c, pid, _ := setUp(t, ts)
	var got map[string]any
	c.must(http.StatusOK, "POST", "/api/portfolios/"+pid+"/tidy", map[string]any{"fields": []map[string]any{{"key": "symbol", "type": "text"}}}, &got)
	if got["ai"] != false {
		t.Fatalf("without a model the import should be told so, got %v", got)
	}
	c.must(http.StatusBadRequest, "POST", "/api/portfolios/"+pid+"/tidy", map[string]any{"previous": "return rows;", "change": ""}, nil)
}

func TestSchedulesRunTheirStepsInTurn(t *testing.T) {
	ts := newTestServer(t)
	c, pid, _ := setUp(t, ts)
	var list []struct {
		Name    string `json:"name"`
		Running bool   `json:"running"`
		Steps   []struct {
			Job string `json:"job"`
		} `json:"steps"`
	}
	c.must(http.StatusOK, "GET", "/api/portfolios/"+pid+"/schedules", nil, &list)
	if len(list) == 0 || list[0].Name != "prices" || len(list[0].Steps) != 4 {
		t.Fatalf("schedules = %+v", list)
	}
	c.must(http.StatusAccepted, "POST", "/api/portfolios/"+pid+"/schedules/news", nil, nil)
	for deadline := time.Now().Add(10 * time.Second); ; {
		c.must(http.StatusOK, "GET", "/api/portfolios/"+pid+"/schedules", nil, &list)
		running := false
		for _, s := range list {
			running = running || s.Running
		}
		if !running {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("the news schedule never finished")
		}
		time.Sleep(100 * time.Millisecond)
	}
	var jobs []struct {
		Name    string        `json:"name"`
		LastRun *store.JobRun `json:"lastRun"`
	}
	c.must(http.StatusOK, "GET", "/api/portfolios/"+pid+"/jobs", nil, &jobs)
	for _, j := range jobs {
		if j.Name == "news" && j.LastRun == nil {
			t.Fatal("the news step did not run")
		}
		if j.Name == "notes" && j.LastRun != nil {
			t.Fatalf("notes ran without a key: %+v", j.LastRun)
		}
	}
	c.must(http.StatusConflict, "DELETE", "/api/portfolios/"+pid+"/schedules/news", nil, nil)
	c.must(http.StatusNotFound, "POST", "/api/portfolios/"+pid+"/schedules/nope", nil, nil)
}

func TestInvitingSomeoneAddsThemOnceAndMakesThemPickAPassword(t *testing.T) {
	ts := newTestServer(t)
	owner, pid, _ := setUp(t, ts)
	if got := owner.do("POST", "/api/portfolios/"+pid+"/invite", map[string]any{"email": "new@example.com", "name": "New"}, nil); got != http.StatusBadRequest {
		t.Fatalf("new person with no first password and no email: %d", got)
	}
	var made struct {
		User     store.User `json:"user"`
		Existing bool       `json:"existing"`
	}
	owner.must(http.StatusOK, "POST", "/api/portfolios/"+pid+"/invite", map[string]any{"email": "New@Example.com ", "name": "New", "password": "a first long password"}, &made)
	if made.Existing || !made.User.MustChange {
		t.Fatalf("new person = %+v", made)
	}
	var again struct {
		User     store.User `json:"user"`
		Existing bool       `json:"existing"`
	}
	owner.must(http.StatusOK, "POST", "/api/portfolios/"+pid+"/invite", map[string]any{"email": "new@example.com"}, &again)
	if !again.Existing || again.User.ID != made.User.ID {
		t.Fatalf("second invite = %+v", again)
	}

	guest := newClient(t, ts)
	var me store.User
	guest.must(http.StatusOK, "POST", "/api/login", map[string]string{"email": "new@example.com", "password": "a first long password"}, &me)
	if !me.MustChange {
		t.Fatal("first sign-in does not ask for a new password")
	}
	if got := guest.do("GET", "/api/portfolios/"+pid, nil, nil); got != http.StatusForbidden {
		t.Fatalf("first password opens the portfolio: %d", got)
	}
	guest.must(http.StatusOK, "PUT", "/api/me/password", map[string]string{"current": "a first long password", "new": "their own long password"}, nil)
	guest.must(http.StatusOK, "POST", "/api/login", map[string]string{"email": "new@example.com", "password": "their own long password"}, &me)
	if me.MustChange {
		t.Fatal("still asked for a new password after choosing one")
	}
	guest.must(http.StatusOK, "GET", "/api/portfolios/"+pid, nil, nil)
	if got := owner.do("POST", "/api/users/"+me.ID+"/invite", nil, nil); got != http.StatusConflict {
		t.Fatalf("re-invite someone who chose a password: %d", got)
	}
}

func (c *client) firstSignIn(email, password string) {
	c.must(http.StatusOK, "POST", "/api/login", map[string]string{"email": email, "password": password}, nil)
	c.must(http.StatusOK, "PUT", "/api/me/password", map[string]string{"current": password, "new": password}, nil)
}

func TestRemovingAnImportTakesBackOnlyItsUnusedCategories(t *testing.T) {
	ts := newTestServer(t)
	c, pid, _ := setUp(t, ts)
	var first, second struct {
		ID string `json:"id"`
	}
	c.must(http.StatusOK, "POST", "/api/portfolios/"+pid+"/spends/import", map[string]any{"source": "a.csv", "rows": []map[string]string{
		{"date": "2026-09-01", "item": "Zepto", "amount": "400", "category": "Groceries"},
		{"date": "2026-09-02", "item": "Uber", "amount": "200", "category": "Travel"},
	}}, &first)
	c.must(http.StatusOK, "POST", "/api/portfolios/"+pid+"/spends/import", map[string]any{"source": "b.csv", "rows": []map[string]string{
		{"date": "2026-09-03", "item": "Ola", "amount": "150", "category": "Travel"},
	}}, &second)
	c.must(http.StatusOK, "DELETE", "/api/portfolios/"+pid+"/spend-imports/"+first.ID, nil, nil)
	var e struct {
		Categories []struct {
			Name string `json:"name"`
		} `json:"categories"`
	}
	c.must(http.StatusOK, "GET", "/api/portfolios/"+pid+"/expenses", nil, &e)
	if len(e.Categories) != 1 || e.Categories[0].Name != "Travel" {
		t.Fatalf("Groceries should go with its import and Travel stay for the other one, got %+v", e.Categories)
	}
}

func TestCategoriesFollowTheirSpends(t *testing.T) {
	ts := newTestServer(t)
	c, pid, _ := setUp(t, ts)
	type expenses struct {
		Spends []struct {
			ID       string `json:"id"`
			Category string `json:"category"`
		} `json:"spends"`
		Categories []struct {
			Name string `json:"name"`
			Icon string `json:"icon"`
		} `json:"categories"`
	}
	add := func(item, category string) {
		c.must(http.StatusOK, "POST", "/api/portfolios/"+pid+"/spends", map[string]any{"day": "2026-09-01", "item": item, "amount": 100, "category": category}, nil)
	}
	add("iPhone", "Phones")
	add("Laptop", "Electronics")
	add("Rent", "Home")
	var e expenses
	c.must(http.StatusOK, "POST", "/api/portfolios/"+pid+"/categories/edit", map[string]any{"from": "Phones", "to": "Electronics", "icon": "smartphone"}, &e)
	if len(e.Categories) != 2 || e.Spends[0].Category != "Electronics" && e.Spends[1].Category != "Electronics" {
		t.Fatalf("renaming onto Electronics should join them, got %+v", e)
	}
	c.must(http.StatusOK, "POST", "/api/portfolios/"+pid+"/categories/remove", map[string]any{"name": "Home", "into": ""}, &e)
	if len(e.Categories) != 1 || e.Categories[0].Name != "Electronics" || len(e.Spends) != 3 {
		t.Fatalf("removing Home should keep its spend with no category, got %+v", e)
	}
	var ids []string
	for _, s := range e.Spends {
		if s.Category == "Electronics" {
			ids = append(ids, s.ID)
		}
	}
	c.must(http.StatusOK, "POST", "/api/portfolios/"+pid+"/spends/undo", map[string]any{"ids": ids}, &e)
	if len(e.Categories) != 0 {
		t.Fatalf("a category with no spends left should go, got %+v", e.Categories)
	}
}

func TestCardsComeBackFromAnExportRowOnce(t *testing.T) {
	ts := newTestServer(t)
	c, pid, _ := setUp(t, ts)
	row := map[string]string{"bank": "HDFC Bank", "name": "Regalia Gold", "kind": "credit", "network": "visa", "limit": "300000", "statement_day": "17", "statement_balance": "22410"}
	var got map[string]int
	c.must(http.StatusOK, "POST", "/api/portfolios/"+pid+"/cards/import", map[string]any{"rows": []map[string]string{row}}, &got)
	if got["added"] != 1 {
		t.Fatalf("first import = %v", got)
	}
	c.must(http.StatusOK, "POST", "/api/portfolios/"+pid+"/cards/import", map[string]any{"rows": []map[string]string{row}}, &got)
	if got["added"] != 0 || got["skipped"] != 1 {
		t.Fatalf("a card already there should be skipped, got %v", got)
	}
	c.must(http.StatusBadRequest, "POST", "/api/portfolios/"+pid+"/cards/import", map[string]any{"rows": []map[string]string{{"bank": "SBI", "name": "Elite"}}}, nil)
}
