package app

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/DimwitLabs/ebenezer/internal/market"
	"github.com/DimwitLabs/ebenezer/internal/store"
	"github.com/DimwitLabs/ebenezer/internal/value"
)

// coinsSetting names the setting that caches each ticker's CoinGecko match, so a coin is looked up once.
const coinsSetting = "crypto_coins"

func (a *App) cryptoTickers(ctx context.Context) ([]string, error) {
	ps, err := a.Store.AllPortfolios(ctx)
	if err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	var out []string
	for _, p := range ps {
		secs, err := a.Store.Sections(ctx, p.ID)
		if err != nil {
			return nil, err
		}
		for _, sec := range secs {
			if sec.Kind != "crypto" {
				continue
			}
			hs, err := a.Store.Holdings(ctx, sec.ID)
			if err != nil {
				return nil, err
			}
			for _, h := range hs {
				if t := strings.TrimPrefix(h.ISIN, "CRYPTO-"); value.IsCrypto(h.ISIN) && !seen[t] {
					seen[t] = true
					out = append(out, t)
				}
			}
		}
	}
	sort.Strings(out)
	return out, nil
}

func (a *App) coins(ctx context.Context, tickers []string) (map[string]market.Coin, []string, error) {
	known := map[string]market.Coin{}
	if _, err := a.Store.Setting(ctx, coinsSetting, &known); err != nil {
		return nil, nil, err
	}
	var unknown []string
	added := false
	for _, t := range tickers {
		if _, ok := known[t]; ok {
			continue
		}
		c, err := a.Market.FindCoin(ctx, t)
		if errors.Is(err, market.ErrNoData) {
			unknown = append(unknown, t)
			continue
		}
		if err != nil {
			return nil, nil, err
		}
		known[t], added = c, true
		// CoinGecko's free tier allows a few requests a second at most.
		select {
		case <-ctx.Done():
			return nil, nil, ctx.Err()
		case <-time.After(1500 * time.Millisecond):
		}
	}
	if added {
		if err := a.Store.SetSetting(ctx, coinsSetting, known); err != nil {
			return nil, nil, err
		}
	}
	return known, unknown, nil
}

func coinSecurity(t string, c market.Coin) store.Security {
	return store.Security{ISIN: value.CryptoKey(t), Name: c.Name, Kind: "crypto", Category: "Crypto"}
}

func (a *App) cryptoPrices(ctx context.Context) (string, error) {
	tickers, err := a.cryptoTickers(ctx)
	if err != nil || len(tickers) == 0 {
		return "", err
	}
	known, unknown, err := a.coins(ctx, tickers)
	if err != nil {
		return "", err
	}
	byID := map[string]string{}
	var ids []string
	for _, t := range tickers {
		if c, ok := known[t]; ok {
			byID[c.ID] = t
			ids = append(ids, c.ID)
		}
	}
	quotes, err := a.Market.CoinPrices(ctx, ids)
	if err != nil {
		return "", err
	}
	day := Today()
	var secs []store.Security
	var prices []store.Price
	for id, inr := range quotes {
		tk := byID[id]
		secs = append(secs, coinSecurity(tk, known[tk]))
		prices = append(prices, store.Price{ISIN: value.CryptoKey(tk), Day: day, Close: inr})
	}
	if err := a.Store.SavePrices(ctx, "coingecko", secs, prices); err != nil {
		return "", err
	}
	// Shows the coin names just matched now rather than tickers until evening.
	if err := a.rebuildKind(ctx, "crypto"); err != nil {
		return "", err
	}
	for _, p := range prices {
		fact(ctx, strings.TrimPrefix(p.ISIN, value.CryptoKey("")), Rupees(p.Close))
	}
	msg := plural(len(prices), "coin", "coins") + " from CoinGecko"
	if len(unknown) > 0 {
		return msg, fmt.Errorf("no coin found on CoinGecko for %s", strings.Join(unknown, ", "))
	}
	return msg, nil
}

func (a *App) recentCoins(ctx context.Context, since time.Time) (string, error) {
	tickers, err := a.cryptoTickers(ctx)
	if err != nil || len(tickers) == 0 {
		return "", err
	}
	known, _, err := a.coins(ctx, tickers)
	if err != nil {
		return "", err
	}
	keys := make([]string, 0, len(tickers))
	for _, t := range tickers {
		keys = append(keys, value.CryptoKey(t))
	}
	have, err := a.Store.PriceHistories(ctx, keys, since)
	if err != nil {
		return "", err
	}
	added := 0
	for _, t := range tickers {
		c, ok := known[t]
		if !ok {
			continue
		}
		if len(have[value.CryptoKey(t)]) >= recentDays-3 {
			continue
		}
		qs, err := a.Market.CoinHistory(ctx, c.ID, recentDays)
		if err != nil {
			return fmt.Sprintf("%d coins' history added", added), err
		}
		prices := make([]store.Price, 0, len(qs))
		for _, q := range qs {
			prices = append(prices, store.Price{ISIN: value.CryptoKey(t), Day: q.Day, Close: q.Close})
		}
		if err := a.Store.SavePrices(ctx, "coingecko", []store.Security{coinSecurity(t, c)}, prices); err != nil {
			return "", err
		}
		added++
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-time.After(1500 * time.Millisecond):
		}
	}
	if added == 0 {
		return "", nil
	}
	return fmt.Sprintf("%d coins' history added", added), a.rebuildKind(ctx, "crypto")
}
