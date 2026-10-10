package app

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/DimwitLabs/ebenezer/internal/openrouter"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

type Model struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	Context    int     `json:"context"`
	Prompt     float64 `json:"prompt"`
	Completion float64 `json:"completion"`
}

const modelsTTL = 6 * time.Hour

// Models lists the models on offer, cached for a few hours as the list is public and changes slowly.
func (a *App) Models(ctx context.Context) ([]Model, error) {
	a.mu.Lock()
	if time.Since(a.modelsAt) < modelsTTL && a.models != nil {
		ms := a.models
		a.mu.Unlock()
		return ms, nil
	}
	a.mu.Unlock()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://openrouter.ai/api/v1/models", nil)
	if err != nil {
		return nil, err
	}
	resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("openrouter: %s", resp.Status)
	}
	var body struct {
		Data []struct {
			ID            string `json:"id"`
			Name          string `json:"name"`
			ContextLength int    `json:"context_length"`
			Pricing       struct {
				Prompt     string `json:"prompt"`
				Completion string `json:"completion"`
			} `json:"pricing"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, err
	}
	perMillion := func(s string) float64 {
		v, _ := strconv.ParseFloat(s, 64)
		return v * 1e6
	}
	ms := make([]Model, 0, len(body.Data))
	for _, m := range body.Data {
		ms = append(ms, Model{ID: m.ID, Name: m.Name, Context: m.ContextLength, Prompt: perMillion(m.Pricing.Prompt), Completion: perMillion(m.Pricing.Completion)})
	}
	sort.Slice(ms, func(i, j int) bool { return ms[i].ID < ms[j].ID })
	a.mu.Lock()
	a.models, a.modelsAt = ms, time.Now()
	a.mu.Unlock()
	return ms, nil
}

// TestAI sends the smallest real request, a JSON reply, so a bad key or a model that cannot keep to JSON fails before the first news run.
func (a *App) TestAI(ctx context.Context, key, model string) (string, error) {
	start := time.Now()
	text, err := a.ai(key).Chat(ctx, openrouter.Request{Model: model, MaxTokens: 400, JSON: true,
		Messages: []openrouter.Message{{Role: "user", Content: `Reply with this JSON object and nothing else: {"ok": true, "echo": "` + echoTest + `"}`}}})
	if err != nil {
		return "", err
	}
	var ok struct {
		OK   bool   `json:"ok"`
		Echo string `json:"echo"`
	}
	if json.Unmarshal([]byte(text), &ok) != nil || !ok.OK {
		return "", fmt.Errorf("%s answered, but not with the JSON asked for", model)
	}
	// Account-level PII redaction turns fund and index names into [ADDRESS], which ruins every answer.
	if Redacted(ok.Echo) || !strings.Contains(ok.Echo, "Nifty 50") {
		return "", fmt.Errorf("%s answered, but words were redacted on the way: %q came back as %q. Turn off PII redaction for this key on OpenRouter", model, echoTest, ok.Echo)
	}
	return fmt.Sprintf("%s answered in %.1fs", model, time.Since(start).Seconds()), nil
}

const echoTest = "Nifty 50 against Parag Parikh Flexi Cap Fund at HDFC Bank"

func Redacted(text string) bool {
	return placeholder.MatchString(text)
}

func (a *App) ai(key string) openrouter.Client {
	return openrouter.Client{HTTP: &http.Client{Timeout: 2 * time.Minute}, Key: key}
}
