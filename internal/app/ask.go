package app

import (
	"context"
	"errors"
	"strings"

	"github.com/DimwitLabs/ebenezer/internal/news"
	"github.com/DimwitLabs/ebenezer/internal/openrouter"
	"github.com/DimwitLabs/ebenezer/internal/store"
)

const DefaultInstructions = `Look at the whole picture across sections, not just shares. Compare against the benchmark and inflation when it helps. Point out idle cash, money concentrated in one holding or section, and what frequent trading has cost. Be honest when results are poor, and say plainly when they are good.`

var ErrNoAI = errors.New("no AI model is connected")

const rules = `Answer only from the ledger below; if it cannot answer the question, say what is missing.
Write money the Indian way (lakh and crore) and losses in brackets, as the ledger does.
Keep answers under 180 words unless asked for more. Plain sentences, no tables, no headings.
Do not tell the person to buy or sell a particular security; explain what their numbers show and what they could look into.`

// Ask answers a question about the portfolio; history is kept by the browser and only the last few turns are sent.
func (a *App) Ask(ctx context.Context, p *store.Portfolio, question string, history []openrouter.Message) (string, error) {
	key := a.Secret(ctx, OpenRouterKey)
	if key == "" {
		return "", ErrNoAI
	}
	is, err := a.Store.InstanceSettings(ctx)
	if err != nil {
		return "", err
	}
	ledger, err := a.Ledger(ctx, p)
	if err != nil {
		return "", err
	}
	instructions := strings.TrimSpace(p.Settings.Voice.Instructions)
	if instructions == "" {
		instructions = DefaultInstructions
	}
	system := Persona(p.Settings.Voice) + "\n" + instructions + "\n" + rules + "\n\nThe ledger:\n" + ledger
	msgs := []openrouter.Message{{Role: "system", Content: system}}
	if len(history) > 8 {
		history = history[len(history)-8:]
	}
	for _, m := range history {
		if (m.Role == "user" || m.Role == "assistant") && m.Content != "" {
			msgs = append(msgs, openrouter.Message{Role: m.Role, Content: news.Cut(m.Content, 2000)})
		}
	}
	msgs = append(msgs, openrouter.Message{Role: "user", Content: question})
	return a.ai(key).Chat(ctx, openrouter.Request{Model: ModelFor(is, p), Messages: msgs, Temperature: 0.3, MaxTokens: 2500})
}
