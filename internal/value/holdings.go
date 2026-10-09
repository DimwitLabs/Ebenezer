package value

import (
	"math"
	"sort"
	"strings"
	"time"
)

type Derived struct {
	Key       string
	ISIN      string
	Symbol    string
	Name      string
	Quantity  float64
	Cost      float64
	Realised  float64
	FirstDate time.Time
	// every unit still held came from a statement's opening position
	CostUnknown bool
}

const BasisKey = "_basis"

func opening(row map[string]any) bool { return Text(row[BasisKey]) == "opening" }

// IsSale is the one sale rule shared by holdings and cash flows, so a position and its XIRR never disagree.
func IsSale(kind string, row map[string]any) bool {
	action := strings.ToLower(strings.TrimSpace(Text(row["action"])))
	if kind == "funds" {
		units, _ := Number(row["units"])
		return units < 0 || strings.Contains(action, "redemption") || strings.Contains(action, "switch out") || strings.Contains(action, "switch-out")
	}
	qty, _ := Number(row["quantity"])
	switch action {
	case "s", "sell", "sold", "sale":
		return true
	}
	return qty < 0
}

type Trade struct {
	Day     time.Time `json:"-"`
	Date    string    `json:"date"`
	Key     string    `json:"-"`
	ISIN    string    `json:"-"`
	Symbol  string    `json:"-"`
	Action  string    `json:"action"`
	Qty     float64   `json:"quantity"`
	Amount  float64   `json:"amount"`
	Sell    bool      `json:"sell"`
	Opening bool      `json:"opening"`
	payout  bool
}

// CryptoKey stands in for an ISIN so coins share the stock paths without matching a share of the same ticker.
func CryptoKey(symbol string) string {
	return "CRYPTO-" + strings.ToUpper(strings.TrimSpace(symbol))
}

func IsCrypto(key string) bool {
	return strings.HasPrefix(key, "CRYPTO-")
}

func tradeISIN(kind string, row map[string]any) string {
	if kind == "crypto" {
		if s := Text(row["symbol"]); s != "" {
			return CryptoKey(s)
		}
		return ""
	}
	return strings.ToUpper(Text(row["isin"]))
}

// ParseTrade reads a row as a trade; a fund's dividend payout moves no units, so it is not one.
func ParseTrade(kind string, row map[string]any) (Trade, bool) {
	t, ok := parseRow(kind, row)
	if !ok || t.payout {
		return Trade{}, false
	}
	return t, t.Key != "" && t.Qty != 0
}

func parseRow(kind string, row map[string]any) (Trade, bool) {
	d, ok := Date(row["date"])
	if !ok {
		return Trade{}, false
	}
	t := Trade{Day: d, Date: d.Format("2006-01-02"), ISIN: tradeISIN(kind, row), Action: strings.TrimSpace(Text(row["action"])), Opening: opening(row)}
	action := strings.ToLower(t.Action)
	if kind == "funds" {
		t.Symbol = Text(row["scheme"])
		units, _ := Number(row["units"])
		amount, ok := Number(row["amount"])
		if !ok {
			nav, _ := Number(row["nav"])
			amount = math.Abs(units) * nav
		}
		t.Qty, t.Amount = math.Abs(units), math.Abs(amount)
		t.Sell = IsSale(kind, row)
		t.payout = action == "dividend payout"
		if action == "dividend reinvest" || action == "other" {
			t.Amount = 0
		}
	} else {
		t.Symbol = strings.ToUpper(Text(row["symbol"]))
		qty, _ := Number(row["quantity"])
		price, _ := Number(row["price"])
		charges, _ := Number(row["charges"])
		t.Qty = math.Abs(qty)
		t.Sell = IsSale(kind, row)
		t.Amount = t.Qty*price + charges
		if t.Sell {
			t.Amount = t.Qty*price - charges
		}
	}
	t.Key = t.ISIN
	if t.Key == "" {
		t.Key = t.Symbol
	}
	return t, true
}

// Holdings works out positions FIFO, as Indian tax counts it; a broker snapshot imports as one Buy per scrip, so needs no special case.
func Holdings(kind string, rows []map[string]any) []Derived {
	var trades []Trade
	for _, row := range rows {
		if t, ok := ParseTrade(kind, row); ok {
			trades = append(trades, t)
		}
	}
	sort.SliceStable(trades, func(i, j int) bool {
		if !trades[i].Day.Equal(trades[j].Day) {
			return trades[i].Day.Before(trades[j].Day)
		}
		return !trades[i].Sell && trades[j].Sell
	})

	type lot struct {
		qty, unit float64
		opening   bool
	}
	byKey := map[string]*Derived{}
	lots := map[string][]lot{}
	var order []string
	for _, t := range trades {
		h, ok := byKey[t.Key]
		if !ok {
			h = &Derived{Key: t.Key, ISIN: t.ISIN, Symbol: t.Symbol, Name: t.Symbol, FirstDate: t.Day}
			byKey[t.Key] = h
			order = append(order, t.Key)
		}
		if !t.Sell {
			if h.Quantity == 0 {
				h.FirstDate = t.Day
			}
			lots[t.Key] = append(lots[t.Key], lot{t.Qty, t.Amount / t.Qty, t.Opening})
			h.Quantity += t.Qty
			h.Cost += t.Amount
			continue
		}
		left := math.Min(t.Qty, h.Quantity)
		proceeds := t.Amount / t.Qty
		for left > 1e-9 && len(lots[t.Key]) > 0 {
			l := &lots[t.Key][0]
			take := math.Min(left, l.qty)
			h.Realised += (proceeds - l.unit) * take
			h.Cost -= l.unit * take
			h.Quantity -= take
			l.qty -= take
			left -= take
			if l.qty < 1e-9 {
				lots[t.Key] = lots[t.Key][1:]
			}
		}
		if h.Quantity < 1e-9 {
			h.Quantity, h.Cost = 0, 0
		}
	}
	out := make([]Derived, 0, len(order))
	for _, k := range order {
		h := byKey[k]
		h.CostUnknown = h.Quantity > 0
		for _, l := range lots[k] {
			if l.qty > 1e-9 && !l.opening {
				h.CostUnknown = false
			}
		}
		out = append(out, *h)
	}
	return out
}

type Counterfactual struct {
	XIRR     *float64
	Value    float64
	Invested float64
}

// NeverSold works out returns as if nothing had been sold; set against the real XIRR this answers whether selling helped, and unpriced scrips are left out of both sides.
func NeverSold(kind string, rows []map[string]any, prices Prices, today time.Time) Counterfactual {
	var cf Counterfactual
	var flows []Flow
	for _, row := range rows {
		if IsSale(kind, row) {
			continue
		}
		key, f, ok := TradeFlow(kind, row)
		if !ok {
			continue
		}
		price, priced := prices[strings.ToUpper(Text(row["isin"]))]
		if !priced || price <= 0 || key == "" {
			continue
		}
		qty, _ := Number(row["quantity"])
		if kind == "funds" {
			qty, _ = Number(row["units"])
		}
		flows = append(flows, f)
		cf.Invested -= f.Amount
		cf.Value += math.Abs(qty) * price
	}
	if len(flows) > 0 {
		if x, ok := XIRR(append(flows, Flow{Date: today, Amount: cf.Value})); ok {
			cf.XIRR = &x
		}
	}
	return cf
}
