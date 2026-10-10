package news

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/DimwitLabs/ebenezer/internal/openrouter"
)

func TestQueryUsesFullName(t *testing.T) {
	cases := map[string]string{
		"HINDUSTAN AERONAUTICS LTD.": "Hindustan Aeronautics",
		"Sula Vineyards Limited":     "Sula Vineyards",
		"ITC LTD":                    "Itc",
	}
	for in, want := range cases {
		if got := Query(in); got != want {
			t.Errorf("%q: got %q", in, got)
		}
	}
}

func TestMergeFoldsNearDuplicates(t *testing.T) {
	items := Merge([]Item{
		{Scrips: []string{"ITC"}, Title: "ITC declares interim dividend of Rs 6.5 per share", Source: "Mint"},
		{Scrips: []string{"ITCHOTELS"}, Title: "ITC declares interim dividend of Rs 6.5 per share today", Source: "ET"},
		{Scrips: []string{"ITC"}, Title: "ITC declares interim dividend of Rs 6.5 per share", Source: "BSE filing"},
	})
	if len(items) != 2 || items[0].Also != 1 || len(items[0].Scrips) != 2 {
		t.Fatalf("got %+v", items)
	}
}

func TestPartialJudgeOverride(t *testing.T) {
	j, err := LoadJudge(json.RawMessage(`{"persona":"Be brief."}`))
	if err != nil {
		t.Fatal(err)
	}
	if j.Persona != "Be brief." || len(j.Categories) == 0 {
		t.Fatalf("got %+v", j)
	}
	for _, title := range []string{"Closure of Trading Window", "Compliance under Regulation 74 (5)", "Half-Yearly Report", "Appointment of Scrutinizer"} {
		if !j.Routine(title) {
			t.Fatalf("routine filing not matched: %s", title)
		}
	}
	if j.Routine("Board approves dividend of Rs 5") {
		t.Fatal("dividend counted as routine")
	}
}

func TestJudgeAppliesVerdictsAndDuplicates(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		content := `{"items":[{"id":1,"verdict":"signal","about":["ITC"],"category":"dividend","reason":"Pays 6.5 a share.","dup_of":null},
			{"id":2,"verdict":"signal","about":["ITC"],"category":"dividend","reason":"Same.","dup_of":1}]}`
		json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"message": map[string]string{"content": content}}}})
	}))
	defer srv.Close()
	j, _ := LoadJudge(nil)
	ai := AI{Client: openrouter.Client{HTTP: srv.Client(), Key: "k", URL: srv.URL}, Model: "m"}
	items := []Item{
		{Scrips: []string{"ITC"}, Title: "ITC dividend", Source: "Mint"},
		{Scrips: []string{"ITC"}, Title: "Dividend from ITC", Source: "ET"},
		{Scrips: []string{"ITC"}, Title: "Trading window closure", Source: "BSE filing", Routine: true},
	}
	out, err := ai.Judge(context.Background(), j, items, []Scrip{{Code: "ITC", Name: "ITC LTD", Quantity: 10}}, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 2 || out[0].Verdict != "signal" || out[0].Also != 1 || out[1].Verdict != "routine" {
		t.Fatalf("got %+v", out)
	}
}

func TestLiveCollect(t *testing.T) {
	if os.Getenv("EBENEZER_LIVE") == "" {
		t.Skip("set EBENEZER_LIVE=1")
	}
	j, _ := LoadJudge(nil)
	f := NewFetcher()
	rep, err := f.Collect(context.Background(), []Scrip{{Code: "ITC", Name: "ITC LTD.", BSECode: "500875", Quantity: 1}}, Options{WindowDays: 7, PerScrip: 6, Judge: j}, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("fetched %d, kept %d, failed %v", rep.Fetched, len(rep.Items), rep.Failed)
	for _, it := range rep.Items {
		t.Logf("%s | %s | routine=%v", it.Source, it.Title, it.Routine)
	}
	if rep.Fetched == 0 {
		t.Fatal("nothing fetched")
	}
}

func TestFilingOnlyAllowsExchangePDFs(t *testing.T) {
	for link, want := range map[string]bool{
		"https://www.bseindia.com/xml-data/corpfiling/AttachLive/x.pdf": true,
		"https://nsearchives.nseindia.com/corporate/x.PDF":              true,
		"http://www.bseindia.com/x.pdf":                                 false,
		"https://www.bseindia.com/x.html":                               false,
		"https://evil.example/x.pdf":                                    false,
		"https://www.bseindia.com.evil.example/x.pdf":                   false,
	} {
		if Filing(link) != want {
			t.Errorf("Filing(%q) = %v", link, !want)
		}
	}
}

type countingTransport struct{ hits atomic.Int32 }

func (c *countingTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	c.hits.Add(1)
	time.Sleep(50 * time.Millisecond)
	return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`<rss><channel></channel></rss>`)), Header: http.Header{}, Request: r}, nil
}

func TestPortfoliosReadingOneScripAtOnceFetchItOnce(t *testing.T) {
	tr := &countingTransport{}
	f := &Fetcher{HTTP: &http.Client{Transport: tr}}
	sc := Scrip{Code: "TCS", Name: "Tata Consultancy Services"}
	var wg sync.WaitGroup
	for range 3 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := f.Google(context.Background(), sc, 3, 6, time.Now()); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if _, err := f.Google(context.Background(), sc, 3, 2, time.Now()); err != nil {
		t.Fatal(err)
	}
	if got := tr.hits.Load(); got != 1 {
		t.Fatalf("fetched %d times, want once", got)
	}
}
