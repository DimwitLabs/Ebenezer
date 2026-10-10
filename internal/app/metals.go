package app

import (
	"context"
	"time"

	"github.com/DimwitLabs/ebenezer/internal/market"
)

const metalsSetting = "metals"

type MetalPrices struct {
	market.Metals
	At time.Time `json:"at"`
}

func (a *App) fetchMetals(ctx context.Context) error {
	m, err := a.Market.Metals(ctx)
	if err != nil {
		return err
	}
	if err := a.Store.SetSetting(ctx, metalsSetting, MetalPrices{Metals: m, At: time.Now()}); err != nil {
		return err
	}
	fact(ctx, "Gold", Rupees(m.GoldPerGram)+"/g")
	if m.SilverPerGram > 0 {
		fact(ctx, "Silver", Rupees(m.SilverPerGram)+"/g")
	}
	fact(ctx, "Bullion from", m.Source)
	return nil
}

func (a *App) LastMetals(ctx context.Context) (MetalPrices, error) {
	var m MetalPrices
	_, err := a.Store.Setting(ctx, metalsSetting, &m)
	return m, err
}

// metalRates returns gold and silver rates per gram; a rate typed in Settings wins over the fetched one, for anyone who values gold their own way.
func (a *App) metalRates(ctx context.Context, goldOverride, silverOverride float64) (gold, silver float64, err error) {
	m, err := a.LastMetals(ctx)
	if err != nil {
		return 0, 0, err
	}
	gold, silver = m.GoldPerGram, m.SilverPerGram
	if goldOverride > 0 {
		gold = goldOverride
	}
	if silverOverride > 0 {
		silver = silverOverride
	}
	return gold, silver, nil
}
