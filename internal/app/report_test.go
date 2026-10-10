package app

import (
	"strings"
	"testing"
)

func TestReportLinksToThePortfoliosNews(t *testing.T) {
	d := reportData{C: palette(nil), Portfolio: "Mum & Dad", Show: map[string]bool{"news": true}, NewsURL: "https://money.example/p/mum-dad/news",
		News: []story{{Title: "Results", Link: "https://example.com/a"}}}
	var hb, tb strings.Builder
	if err := htmlReport.Execute(&hb, d); err != nil {
		t.Fatal(err)
	}
	if err := textReport.Execute(&tb, d); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(hb.String(), `href="https://money.example/p/mum-dad/news"`) || !strings.Contains(hb.String(), "View all news") {
		t.Error("the HTML report has no View all news link")
	}
	if !strings.Contains(tb.String(), "View all news: https://money.example/p/mum-dad/news") {
		t.Error("the text report has no View all news link")
	}
}

func TestReportWearsThePortfoliosColour(t *testing.T) {
	d := reportData{C: palette(map[string]string{"primary": "#6750a4", "stray": "#000000"}), Portfolio: "Mum & Dad", Show: map[string]bool{}}
	var hb strings.Builder
	if err := htmlReport.Execute(&hb, d); err != nil {
		t.Fatal(err)
	}
	h := hb.String()
	if !strings.Contains(h, ".up { color: #6750a4; }") || strings.Contains(h, ReportPalette["primary"]) || !strings.Contains(h, "color:"+ReportPalette["ink"]) || strings.Contains(h, "ZgotmplZ") {
		t.Error("the report does not wear the portfolio's own colours over the defaults")
	}
}
