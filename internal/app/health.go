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
	// FailingSince is when the current run of failures began, and Alerted when it was last sent out.
	FailingSince *time.Time `json:"failingSince,omitempty"`
	Alerted      *time.Time `json:"alerted,omitempty"`
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
	alerts, back := review(prev.Checks, checks, now)
	if err := a.Store.SetSetting(ctx, healthSetting, Health{Checks: checks, At: now}); err != nil {
		return "", err
	}
	if len(alerts) > 0 {
		if err := a.notify(ctx, "Ebenezer: a source is failing", strings.Join(alerts, "\n"), "warning"); err != nil {
			slog.Error("ntfy", "err", err)
		}
	}
	if len(back) > 0 {
		if err := a.notify(ctx, "Ebenezer: a source is back", strings.Join(back, "\n"), "white_check_mark"); err != nil {
			slog.Error("ntfy", "err", err)
		}
	}
	var bad []string
	for _, c := range checks {
		v := "answering"
		if !c.OK {
			v = "failing"
			bad = append(bad, c.Name)
		}
		fact(ctx, c.Name, v)
	}
	if len(bad) > 0 {
		return fmt.Sprintf("%d of %d checks failing", len(bad), len(checks)), fmt.Errorf("failing: %s", strings.Join(bad, ", "))
	}
	return fmt.Sprintf("All %d checks pass", len(checks)), nil
}

// review carries each check's failing streak forward and says what to send: an alert a day from the second failure, and word when an alerted source is back.
func review(prev, checks []Check, now time.Time) (alerts, back []string) {
	before := map[string]Check{}
	for _, c := range prev {
		before[c.Name] = c
	}
	for i := range checks {
		c, was := &checks[i], before[checks[i].Name]
		c.At = now
		if c.OK {
			if was.Alerted != nil && was.FailingSince != nil {
				back = append(back, fmt.Sprintf("%s answers again, after failing for %s.", c.Name, failingFor(*was.FailingSince, was.At)))
			}
			continue
		}
		c.Failures = was.Failures + 1
		c.FailingSince, c.Alerted = was.FailingSince, was.Alerted
		if c.FailingSince == nil {
			c.FailingSince = &now
		}
		if c.Failures >= 2 && (c.Alerted == nil || !sameDay(*c.Alerted, now)) {
			alerts = append(alerts, fmt.Sprintf("%s has failed for %s: %s", c.Name, failingFor(*c.FailingSince, now), c.Detail))
			c.Alerted = &now
		}
	}
	return alerts, back
}

func failingFor(since, now time.Time) string {
	days := int(midnight(now).Sub(midnight(since))/(24*time.Hour)) + 1
	return plural(days, "day", "days")
}

// midnight is the day in Zone as a UTC date, so days count the same either side of a clock change.
func midnight(t time.Time) time.Time {
	y, m, d := t.In(Zone).Date()
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
}

func sameDay(a, b time.Time) bool { return midnight(a).Equal(midnight(b)) }

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

func (a *App) notify(ctx context.Context, title, body, tag string) error {
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
	req.Header.Set("Tags", tag)
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
	return a.notify(ctx, "Ebenezer", "Test alert. If you can read this, health alerts will reach you.", "warning")
}
