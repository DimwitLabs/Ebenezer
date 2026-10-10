package app

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/DimwitLabs/ebenezer/internal/news"
)

type Check struct {
	Name     string    `json:"name"`
	OK       bool      `json:"ok"`
	Detail   string    `json:"detail"`
	Failures int       `json:"failures"`
	At       time.Time `json:"at"`
}

type Health struct {
	Checks []Check   `json:"checks"`
	At     time.Time `json:"at"`
}

const healthSetting = "health"

// health checks the sources; they are unofficial, so checks assert the parsed shape, not just a 200, and one miss is usually a blip, two alert.
func (a *App) health(ctx context.Context) (string, error) {
	var prev Health
	if _, err := a.Store.Setting(ctx, healthSetting, &prev); err != nil {
		return "", err
	}
	failures := map[string]int{}
	for _, c := range prev.Checks {
		failures[c.Name] = c.Failures
	}
	day, nse, err := a.lastTradingDay(ctx)
	checks := []Check{result("NSE bhavcopy", err, len(nse) > 1000, fmt.Sprintf("%d quotes", len(nse)))}
	if err == nil {
		bse, err := a.Market.BSE(ctx, day)
		checks = append(checks, result("BSE bhavcopy", err, len(bse) > 1000, fmt.Sprintf("%d quotes", len(bse))))
		idx, err := a.Market.Indices(ctx, day)
		nifty := false
		for _, c := range idx {
			nifty = nifty || c.Name == "Nifty 50"
		}
		checks = append(checks, result("NSE indices", err, nifty, fmt.Sprintf("%d indices, Nifty 50 present: %v", len(idx), nifty)))
	}
	navs, err := a.Market.AMFI(ctx)
	checks = append(checks, result("AMFI NAVs", err, len(navs) > 5000, fmt.Sprintf("%d NAVs", len(navs))))
	coins, err := a.Market.CoinPrices(ctx, []string{"bitcoin"})
	checks = append(checks, result("CoinGecko", err, coins["bitcoin"] > 0, fmt.Sprintf("bitcoin ₹%.0f", coins["bitcoin"])))
	metals, err := a.Market.Metals(ctx)
	checks = append(checks, result("Bullion rates", err, metals.GoldPerGram > 0, fmt.Sprintf("gold ₹%.0f/g, silver ₹%.0f/g from %s", metals.GoldPerGram, metals.SilverPerGram, metals.Source)))

	probe := news.Scrip{Code: "ITC", Name: "ITC Ltd", BSECode: "500875"}
	g, err := a.News.Google(ctx, probe, 7, 3, time.Now())
	checks = append(checks, result("Google News", err, len(g) > 0, fmt.Sprintf("%d stories for ITC", len(g))))
	f, err := a.News.Filings(ctx, probe, 30, 3, time.Now(), nil)
	checks = append(checks, result("BSE announcements", err, len(f) > 0, fmt.Sprintf("%d filings for ITC", len(f))))
	if key := a.Secret(ctx, OpenRouterKey); key != "" {
		checks = append(checks, a.openRouterCheck(ctx, key))
	}

	now := time.Now()
	var bad, alerts []string
	for i := range checks {
		c := &checks[i]
		c.At = now
		if c.OK {
			continue
		}
		c.Failures = failures[c.Name] + 1
		bad = append(bad, c.Name)
		if c.Failures == 2 {
			alerts = append(alerts, c.Name+": "+c.Detail)
		}
	}
	if err := a.Store.SetSetting(ctx, healthSetting, Health{Checks: checks, At: now}); err != nil {
		return "", err
	}
	if len(alerts) > 0 {
		if err := a.notify(ctx, "Ebenezer: a source stopped working", strings.Join(alerts, "\n")); err != nil {
			slog.Error("ntfy", "err", err)
		}
	}
	for _, c := range checks {
		v := "answering"
		if !c.OK {
			v = "failing"
		}
		fact(ctx, c.Name, v)
	}
	if len(bad) > 0 {
		return fmt.Sprintf("%d of %d checks failing", len(bad), len(checks)), fmt.Errorf("failing: %s", strings.Join(bad, ", "))
	}
	return fmt.Sprintf("All %d checks pass", len(checks)), nil
}

func result(name string, err error, shapeOK bool, detail string) Check {
	if err != nil {
		return Check{Name: name, Detail: err.Error()}
	}
	if !shapeOK {
		return Check{Name: name, Detail: "unexpected shape: " + detail}
	}
	return Check{Name: name, OK: true, Detail: detail}
}

var healthHTTP = &http.Client{Timeout: 15 * time.Second}

func (a *App) openRouterCheck(ctx context.Context, key string) Check {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, "https://openrouter.ai/api/v1/key", nil)
	req.Header.Set("Authorization", "Bearer "+key)
	resp, err := healthHTTP.Do(req)
	if err != nil {
		return Check{Name: "OpenRouter key", Detail: err.Error()}
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return Check{Name: "OpenRouter key", Detail: resp.Status}
	}
	return Check{Name: "OpenRouter key", OK: true, Detail: "key accepted"}
}

func (a *App) LastHealth(ctx context.Context) (Health, error) {
	var h Health
	_, err := a.Store.Setting(ctx, healthSetting, &h)
	return h, err
}

func (a *App) notify(ctx context.Context, title, body string) error {
	u := a.NtfyURL(ctx)
	if u == "" {
		return nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, strings.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Title", title)
	if token := a.Secret(ctx, NtfyToken); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	} else if is, err := a.Store.InstanceSettings(ctx); err == nil && is.NtfyUser != "" {
		req.SetBasicAuth(is.NtfyUser, a.Secret(ctx, NtfyPassword))
	}
	req.Header.Set("Tags", "warning")
	resp, err := healthHTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	if resp.StatusCode >= 300 {
		return fmt.Errorf("ntfy returned %s", resp.Status)
	}
	return nil
}

func (a *App) TestNotify(ctx context.Context) error {
	return a.notify(ctx, "Ebenezer", "Test alert. If you can read this, health alerts will reach you.")
}
