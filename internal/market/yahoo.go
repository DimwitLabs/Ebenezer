package market

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"time"
)

var YahooSymbols = map[string]string{
	"Nifty 50":   "^NSEI",
	"Nifty Bank": "^NSEBANK",
	"Nifty IT":   "^CNXIT",
}

const YahooSource = "Yahoo Finance"

// YahooIndex fetches index closes from Yahoo, which is unofficial, so callers ask it only for days NSE has no file for.
func (c *Client) YahooIndex(ctx context.Context, name string, from, to time.Time) ([]IndexClose, error) {
	symbol, ok := YahooSymbols[name]
	if !ok {
		return nil, ErrNoData
	}
	u := fmt.Sprintf("https://query1.finance.yahoo.com/v8/finance/chart/%s?period1=%d&period2=%d&interval=1d",
		url.PathEscape(symbol), from.Unix(), to.AddDate(0, 0, 1).Unix())
	body, err := c.get(ctx, u, "")
	if err != nil {
		return nil, err
	}
	return ParseYahoo(name, body)
}

func ParseYahoo(name string, body []byte) ([]IndexClose, error) {
	var reply struct {
		Chart struct {
			Result []struct {
				Timestamp  []int64 `json:"timestamp"`
				Indicators struct {
					Quote []struct {
						Close []*float64 `json:"close"`
					} `json:"quote"`
				} `json:"indicators"`
			} `json:"result"`
			Error *struct {
				Description string `json:"description"`
			} `json:"error"`
		} `json:"chart"`
	}
	if err := json.Unmarshal(body, &reply); err != nil {
		return nil, fmt.Errorf("yahoo finance: %w", err)
	}
	if e := reply.Chart.Error; e != nil {
		return nil, fmt.Errorf("yahoo finance: %s", e.Description)
	}
	if len(reply.Chart.Result) == 0 || len(reply.Chart.Result[0].Indicators.Quote) == 0 {
		return nil, ErrNoData
	}
	r := reply.Chart.Result[0]
	closes := r.Indicators.Quote[0].Close
	var out []IndexClose
	for i, ts := range r.Timestamp {
		if i >= len(closes) || closes[i] == nil || *closes[i] <= 0 {
			continue
		}
		d := time.Unix(ts, 0).In(IST)
		out = append(out, IndexClose{Name: name, Day: time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, time.UTC), Close: *closes[i]})
	}
	if len(out) == 0 {
		return nil, ErrNoData
	}
	return out, nil
}
