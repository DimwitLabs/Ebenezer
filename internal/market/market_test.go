package market

import (
	"context"
	"os"
	"testing"
	"time"
)

const bhav = "TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,XpryDt,FininstrmActlXpryDt,StrkPric,OptnTp,FinInstrmNm,OpnPric,HghPric,LwPric,ClsPric\n" +
	"2026-10-03,2026-10-03,CM,BSE,STK,500875,INE154A01025,ITC,A,,,,,ITC LTD.,401.00,405.00,399.10,402.35\n" +
	"2026-10-03,2026-10-03,CM,BSE,STK,999999,,BAD,A,,,,,NO ISIN,1,1,1,1\n"

func TestParseBhavcopy(t *testing.T) {
	q, err := ParseBhavcopy([]byte(bhav), "bse")
	if err != nil {
		t.Fatal(err)
	}
	if len(q) != 1 || q[0].ISIN != "INE154A01025" || q[0].BSECode != "500875" || q[0].Close != 402.35 || q[0].Kind != "stock" {
		t.Fatalf("got %+v", q)
	}
}

func TestBhavcopyHolidayIsNoData(t *testing.T) {
	if _, err := ParseBhavcopy([]byte("<html><body>Not found</body></html>"), "bse"); err != ErrBlocked {
		t.Fatalf("got %v", err)
	}
}

func TestParseAMFI(t *testing.T) {
	body := "Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date\n \nOpen Ended Schemes(Equity Scheme - Flexi Cap Fund)\n \nPPFAS Mutual Fund\n" +
		"122639;INF879O01027;-;Parag Parikh Flexi Cap Fund;Direct Plan;Growth;88.7620;05-Oct-2026\n" +
		"999;INF000000001;INF000000002;Old Fund - Dividend;;;N.A.;05-Oct-2026\n"
	q, err := ParseAMFI([]byte(body))
	if err != nil {
		t.Fatal(err)
	}
	if len(q) != 1 || q[0].Name != "Parag Parikh Flexi Cap Fund - Direct Plan - Growth" || q[0].Close != 88.762 || q[0].Category != "Flexi Cap" {
		t.Fatalf("got %+v", q)
	}
}

func TestParseAMFIHistory(t *testing.T) {
	body, err := os.ReadFile("testdata/amfi_history.txt")
	if err != nil {
		t.Fatal(err)
	}
	q, err := ParseAMFIHistory(body)
	if err != nil {
		t.Fatal(err)
	}
	if len(q) != 5 {
		t.Fatalf("want 5 quotes, got %d: %+v", len(q), q)
	}
	if q[1].ISIN != "INF109KC13K9" || q[2].ISIN != "INF109KC14K7" || q[2].Close != 18.81 || q[2].Symbol != "150687" {
		t.Fatalf("both ISINs of a row should carry its NAV, got %+v %+v", q[1], q[2])
	}
	last := q[4]
	if last.ISIN != "INF879O01027" || last.Name != "Parag Parikh Flexi Cap Fund - Direct Plan - Growth" || last.Kind != "fund" ||
		last.Close != 88.762 || !last.Day.Equal(time.Date(2026, 10, 5, 0, 0, 0, 0, time.UTC)) {
		t.Fatalf("got %+v", last)
	}
	if _, err := ParseAMFIHistory([]byte("<html><body>Error</body></html>")); err != ErrBlocked {
		t.Fatalf("got %v", err)
	}
}

func TestParseIndices(t *testing.T) {
	body := "Index Name,Index Date,Open Index Value,High Index Value,Low Index Value,Closing Index Value,Points Change,Change(%),Volume,Turnover (Rs. Cr.),P/E,P/B,Div Yield\n" +
		"Nifty 50,03-10-2026,25000.1,25100,24900,25050.55,50,0.2,1,1,22.1,3.5,1.2\n" +
		"S&P CNX Nifty,03-10-2026,1,1,1,5000,0,0,1,1,-,-,-\n" +
		"CNX Nifty Junior,03-10-2026,1,1,1,9000,0,0,1,1,-,-,-\n"
	day := time.Date(2026, 3, 10, 0, 0, 0, 0, time.UTC)
	c, err := ParseIndices([]byte(body), day)
	if err != nil {
		t.Fatal(err)
	}
	if len(c) != 3 || c[0].Name != "Nifty 50" || c[0].Close != 25050.55 || c[0].PE == nil || *c[0].PE != 22.1 || !c[0].Day.Equal(day) {
		t.Fatalf("got %+v", c)
	}
	if c[1].Name != "Nifty 50" || c[2].Name != "Nifty Next 50" || c[1].PE != nil {
		t.Fatalf("old names kept: %+v", c[1:])
	}
}

// TestLiveFeeds checks the real feeds still answer; run it with EBENEZER_LIVE=1 go test ./internal/market -run Live.
func TestLiveFeeds(t *testing.T) {
	if os.Getenv("EBENEZER_LIVE") == "" {
		t.Skip("set EBENEZER_LIVE=1")
	}
	c := New()
	ctx := context.Background()
	day := time.Now().AddDate(0, 0, -1)
	for day.Weekday() == time.Saturday || day.Weekday() == time.Sunday {
		day = day.AddDate(0, 0, -1)
	}
	if m, err := c.Metals(ctx); err != nil {
		t.Errorf("metals: %v", err)
	} else {
		t.Logf("metals %+v", m)
	}
	if q, err := c.BSE(ctx, day); err != nil {
		t.Errorf("bse: %v", err)
	} else {
		t.Logf("bse %d", len(q))
	}
	if q, err := c.NSE(ctx, day); err != nil {
		t.Errorf("nse: %v", err)
	} else {
		t.Logf("nse %d", len(q))
	}
	if q, err := c.AMFI(ctx); err != nil {
		t.Errorf("amfi: %v", err)
	} else {
		t.Logf("amfi %d", len(q))
	}
	if q, err := c.Indices(ctx, day); err != nil {
		t.Errorf("indices: %v", err)
	} else {
		t.Logf("indices %d", len(q))
	}
}

func TestParseBullions(t *testing.T) {
	page := `<div class="data-box-half"> <div class="data-box-half-title">GOLD</div>
<div class="data-box-half-value up"><i class="fa fa-arrow-up" aria-hidden="false"></i> 150,130.00</div>
<div class="data-box-half-meta up"><span class="data-box-half-value">+680.00</span></div></div>
<div class="data-box-half"> <div class="data-box-half-title">SILVER</div>
<div class="data-box-half-value up"><i class="fa fa-arrow-up" aria-hidden="false"></i> 227,080.00</div></div>`
	m, err := ParseBullions([]byte(page))
	if err != nil {
		t.Fatal(err)
	}
	if m.GoldPerGram != 15013 || m.SilverPerGram != 227.08 {
		t.Fatalf("got %+v", m)
	}
	if _, err := ParseBullions([]byte("<html>changed</html>")); err == nil {
		t.Fatal("want an error for a changed page")
	}
}

func TestParseIndustries(t *testing.T) {
	body := "Company Name,Industry,Symbol,Series,ISIN Code\nABB India Ltd.,Capital Goods,ABB,EQ,INE117A01022\n"
	m, err := ParseIndustries([]byte(body))
	if err != nil || m["INE117A01022"] != "Capital Goods" {
		t.Fatalf("got %v %v", m, err)
	}
}

func TestParseYahoo(t *testing.T) {
	body := []byte(`{"chart":{"result":[{"timestamp":[1285905600,1286164800,1286251200],"indicators":{"quote":[{"close":[6143.39990234375,null,6145.7998046875]}]}}],"error":null}}`)
	got, err := ParseYahoo("Nifty 50", body)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0].Day.Format("2006-01-02") != "2010-10-01" || got[1].Day.Format("2006-01-02") != "2010-10-05" || got[1].Close != 6145.7998046875 {
		t.Fatalf("closes = %+v", got)
	}
}

func TestParseCoinSearch(t *testing.T) {
	body := []byte(`{"coins":[{"id":"bitcoin-pro","symbol":"BTC","name":"Bitcoin Pro","market_cap_rank":864},{"id":"bitcoin","symbol":"BTC","name":"Bitcoin","market_cap_rank":1},{"id":"bgbtc","symbol":"BGBTC","name":"Wrapped","market_cap_rank":296}]}`)
	c, err := ParseCoinSearch("btc", body)
	if err != nil || c.ID != "bitcoin" || c.Symbol != "BTC" {
		t.Fatalf("coin = %+v, %v", c, err)
	}
	if _, err := ParseCoinSearch("zzz", body); err != ErrNoData {
		t.Fatalf("unknown ticker: %v", err)
	}
}

func TestParseCoinHistory(t *testing.T) {
	body := []byte(`{"prices":[[1791244800000,100],[1791331200000,110],[1791370000000,112]]}`)
	got, err := ParseCoinHistory(body)
	if err != nil || len(got) != 2 || got[1].Close != 112 {
		t.Fatalf("history = %+v, %v", got, err)
	}
}
