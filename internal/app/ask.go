package app

import (
	"context"
	"errors"
	"regexp"
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
Do not tell the person to buy or sell a particular security; explain what their numbers show and what they could look into.
After the answer, write a line saying only FOLLOW-UPS: and under it two or three questions of under 60 characters the person might ask next, one per line. Offer only questions the ledger can answer, and never one asking whether to buy or sell something.`

var (
	followMarker = regexp.MustCompile(`(?im)^[ \t*_#>]*follow[- ]?ups?[ \t*_]*:`)
	followBullet = regexp.MustCompile(`^(?:[-*•>]+|\d+[.)])\s*`)
	callForTrade = regexp.MustCompile(`(?i)\b(should|shall|ought|worth|time to)\b.*\b(buy|sell|exit|hold|keep|add|switch|book|trim|dump|invest|redeem|average)\b|\b(buy|sell)\b.*\b(more|now|next)\b|\b(which|what) (stock|share|fund|scheme)s? (to|should|could|would)\b`)
)

// splitFollowUps takes the follow-up block off the end of an answer, so the marker never reaches the screen or the history.
func splitFollowUps(text string) (string, []string) {
	locs := followMarker.FindAllStringIndex(text, -1)
	if locs == nil {
		return strings.TrimSpace(text), nil
	}
	at := locs[len(locs)-1]
	answer := strings.TrimSpace(text[:at[0]])
	var ups []string
	for _, line := range strings.Split(text[at[1]:], "\n") {
		q := strings.TrimSpace(strings.ReplaceAll(line, "**", ""))
		q = strings.Trim(strings.TrimSpace(followBullet.ReplaceAllString(q, "")), `"'“”`)
		if q == "" || callForTrade.MatchString(q) {
			continue
		}
		ups = append(ups, cutWords(q, 80))
		if len(ups) == 3 {
			break
		}
	}
	if answer == "" {
		return strings.TrimSpace(text[at[1]:]), nil
	}
	return answer, ups
}

func cutWords(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	cut := string(r[:n])
	if i := strings.LastIndex(cut, " "); i > n/2 {
		cut = cut[:i]
	}
	return strings.TrimRight(cut, " ,;:") + "…"
}

// Ask answers a question about the portfolio; history is kept by the browser and only the last few turns are sent.
func (a *App) Ask(ctx context.Context, p *store.Portfolio, question string, history []openrouter.Message) (string, []string, error) {
	key := a.Secret(ctx, OpenRouterKey)
	if key == "" {
		return "", nil, ErrNoAI
	}
	is, err := a.Store.InstanceSettings(ctx)
	if err != nil {
		return "", nil, err
	}
	ledger, err := a.Ledger(ctx, p)
	if err != nil {
		return "", nil, err
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
		content := m.Content
		if m.Role == "assistant" {
			content, _ = splitFollowUps(content)
		}
		if (m.Role == "user" || m.Role == "assistant") && content != "" {
			msgs = append(msgs, openrouter.Message{Role: m.Role, Content: news.Cut(content, 2000)})
		}
	}
	msgs = append(msgs, openrouter.Message{Role: "user", Content: question})
	said, err := a.ai(key).Chat(ctx, openrouter.Request{Model: ModelFor(is, p), Messages: msgs, Temperature: 0.3, MaxTokens: 2500})
	if err != nil {
		return "", nil, err
	}
	answer, ups := splitFollowUps(said)
	return answer, ups, nil
}
