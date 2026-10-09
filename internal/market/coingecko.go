package market

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"time"
)

const coingecko = "https://api.coingecko.com/api/v3"

type Coin struct {
	ID     string `json:"id"`
	Symbol string `json:"symbol"`
	Name   string `json:"name"`
}

// FindCoin looks a ticker up on CoinGecko; the largest-market coin wins, since many small coins borrow the tickers of large ones.
func (c *Client) FindCoin(ctx context.Context, symbol string) (Coin, error) {
	body, err := c.get(ctx, coingecko+"/search?query="+url.QueryEscape(symbol), "")
	if err != nil {
		return Coin{}, err
	}
	return ParseCoinSearch(symbol, body)
}

func ParseCoinSearch(symbol string, body []byte) (Coin, error) {
	var reply struct {
		Coins []struct {
			Coin
			Rank *int `json:"market_cap_rank"`
		} `json:"coins"`
	}
	if err := json.Unmarshal(body, &reply); err != nil {
		return Coin{}, fmt.Errorf("coingecko search: %w", err)
	}
	best, bestRank := Coin{}, 0
	for _, c := range reply.Coins {
		if !strings.EqualFold(c.Symbol, symbol) {
			continue
		}
		rank := 1 << 30
		if c.Rank != nil {
			rank = *c.Rank
		}
		if best.ID == "" || rank < bestRank {
			best, bestRank = c.Coin, rank
		}
	}
	if best.ID == "" {
		return Coin{}, ErrNoData
	}
	best.Symbol = strings.ToUpper(best.Symbol)
	return best, nil
}

func (c *Client) CoinPrices(ctx context.Context, ids []string) (map[string]float64, error) {
	if len(ids) == 0 {
		return map[string]float64{}, nil
	}
	body, err := c.get(ctx, coingecko+"/simple/price?vs_currencies=inr&ids="+url.QueryEscape(strings.Join(ids, ",")), "")
	if err != nil {
		return nil, err
	}
	var reply map[string]struct {
		INR float64 `json:"inr"`
	}
	if err := json.Unmarshal(body, &reply); err != nil {
		return nil, fmt.Errorf("coingecko prices: %w", err)
	}
	out := map[string]float64{}
	for id, p := range reply {
		if p.INR > 0 {
			out[id] = p.INR
		}
	}
	return out, nil
}

func (c *Client) CoinHistory(ctx context.Context, id string, days int) ([]Quote, error) {
	body, err := c.get(ctx, fmt.Sprintf("%s/coins/%s/market_chart?vs_currency=inr&interval=daily&days=%d", coingecko, url.PathEscape(id), days), "")
	if err != nil {
		return nil, err
	}
	return ParseCoinHistory(body)
}

func ParseCoinHistory(body []byte) ([]Quote, error) {
	var reply struct {
		Prices [][2]float64 `json:"prices"`
	}
	if err := json.Unmarshal(body, &reply); err != nil {
		return nil, fmt.Errorf("coingecko history: %w", err)
	}
	byDay := map[string]Quote{}
	var order []string
	for _, p := range reply.Prices {
		t := time.UnixMilli(int64(p[0])).In(IST)
		day := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
		key := day.Format("2006-01-02")
		if _, seen := byDay[key]; !seen {
			order = append(order, key)
		}
		// the last point of a day is its close
		byDay[key] = Quote{Day: day, Close: p[1]}
	}
	out := make([]Quote, 0, len(order))
	for _, k := range order {
		out = append(out, byDay[k])
	}
	return out, nil
}
