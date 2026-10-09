package market

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

type Metals struct {
	GoldPerGram   float64 `json:"goldPerGram"`
	SilverPerGram float64 `json:"silverPerGram"`
	Source        string  `json:"source"`
}

// Metals fetches rates from Bullions India, which quotes both metals at market rate; MMTC-PAMP's retail gold price is the fallback.
func (c *Client) Metals(ctx context.Context) (Metals, error) {
	body, err := c.get(ctx, "https://bullions.co.in/", "")
	if err == nil {
		m, perr := ParseBullions(body)
		if perr == nil {
			return m, nil
		}
		err = perr
	}
	gold, merr := c.mmtcGold(ctx)
	if merr != nil {
		return Metals{}, fmt.Errorf("bullions.co.in: %v; MMTC-PAMP: %v", err, merr)
	}
	return Metals{GoldPerGram: gold, Source: "MMTC-PAMP"}, nil
}

var bullionBox = regexp.MustCompile(`(?s)data-box-half-title">\s*(GOLD|SILVER)\s*<.*?data-box-half-value[^>]*>(?:\s*<i[^>]*></i>)?\s*([\d,]+(?:\.\d+)?)`)

// ParseBullions reads Bullions India's rates, where gold is quoted per 10 g and silver per kg.
func ParseBullions(body []byte) (Metals, error) {
	m := Metals{Source: "bullions.co.in"}
	for _, match := range bullionBox.FindAllSubmatch(body, -1) {
		v, err := strconv.ParseFloat(strings.ReplaceAll(string(match[2]), ",", ""), 64)
		if err != nil || v <= 0 {
			continue
		}
		switch string(match[1]) {
		case "GOLD":
			if m.GoldPerGram == 0 {
				m.GoldPerGram = v / 10
			}
		case "SILVER":
			if m.SilverPerGram == 0 {
				m.SilverPerGram = v / 1000
			}
		}
	}
	// A gram of gold has cost well over ₹1,000 for years; anything less means the page changed.
	if m.GoldPerGram < 1000 {
		return Metals{}, errors.New("no gold price on the page")
	}
	return m, nil
}

func (c *Client) mmtcGold(ctx context.Context) (float64, error) {
	body, err := c.get(ctx, "https://cem.mmtcpamp.com/cms/getTodaysPagePrice", "https://www.mmtcpamp.com/")
	if err != nil {
		return 0, err
	}
	var data struct {
		Data struct {
			Attributes struct {
				TodaysPrice []struct {
					LivePrices struct {
						Data []struct {
							Attributes struct {
								Price float64 `json:"price"`
							} `json:"attributes"`
						} `json:"data"`
					} `json:"live_prices"`
				} `json:"TodaysPrice"`
			} `json:"attributes"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &data); err != nil {
		return 0, err
	}
	tp := data.Data.Attributes.TodaysPrice
	if len(tp) == 0 || len(tp[0].LivePrices.Data) == 0 || tp[0].LivePrices.Data[0].Attributes.Price < 1000 {
		return 0, errors.New("no gold price in the reply")
	}
	return tp[0].LivePrices.Data[0].Attributes.Price, nil
}
