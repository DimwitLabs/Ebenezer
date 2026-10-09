package openrouter

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

const URL = "https://openrouter.ai/api/v1/chat/completions"

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type Client struct {
	HTTP *http.Client
	URL  string
	Key  string
}

type Request struct {
	Model       string
	Messages    []Message
	Temperature float64
	MaxTokens   int
	JSON        bool
}

// Chat sends a request and returns the reply, stripping the code fences some models wrap a JSON reply in even when asked for a JSON object.
func (c Client) Chat(ctx context.Context, r Request) (string, error) {
	body := map[string]any{"model": r.Model, "messages": r.Messages, "temperature": r.Temperature, "max_tokens": r.MaxTokens}
	if r.JSON {
		body["response_format"] = map[string]string{"type": "json_object"}
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return "", err
	}
	url := c.URL
	if url == "" {
		url = URL
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+c.Key)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	return parse(resp, raw, r.JSON)
}

func parse(resp *http.Response, raw []byte, asJSON bool) (string, error) {
	var out struct {
		Error *struct {
			Message  string `json:"message"`
			Metadata struct {
				Raw          string `json:"raw"`
				ProviderName string `json:"provider_name"`
			} `json:"metadata"`
		} `json:"error"`
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	_ = json.Unmarshal(raw, &out)
	if out.Error != nil && out.Error.Message != "" {
		// "Provider returned error" alone says nothing; the provider's own words are in metadata.
		if m := out.Error.Metadata; m.Raw != "" {
			raw := m.Raw
			if len(raw) > 300 {
				raw = raw[:300] + "…"
			}
			return "", fmt.Errorf("openrouter: %s (%s): %s", out.Error.Message, m.ProviderName, raw)
		}
		return "", fmt.Errorf("openrouter: %s", out.Error.Message)
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("openrouter returned %s", resp.Status)
	}
	if len(out.Choices) == 0 {
		return "", fmt.Errorf("openrouter: no reply")
	}
	text := strings.TrimSpace(out.Choices[0].Message.Content)
	if asJSON {
		text = strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(strings.TrimPrefix(text, "```json"), "```"), "```"))
	}
	return text, nil
}
