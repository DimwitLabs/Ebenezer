package app

import (
	"context"
	"log/slog"
	"slices"
	"strings"

	"github.com/DimwitLabs/ebenezer/internal/seal"
)

const (
	OpenRouterKey = "openrouter_key"
	NtfyToken     = "ntfy_token"
	NtfyPassword  = "ntfy_password"
	SMTPPassword  = "smtp_password"
)

var SecretNames = []string{OpenRouterKey, NtfyToken, NtfyPassword, SMTPPassword}

func IsSecret(name string) bool { return slices.Contains(SecretNames, name) }

// Secret returns a secret saved in Settings; one sealed under another key reads as unset, so Settings asks for it again.
func (a *App) Secret(ctx context.Context, name string) string {
	stored := a.storedSecret(ctx, name)
	if stored == "" {
		return ""
	}
	v, err := a.cfg.Seal.Open(stored)
	if err != nil {
		if _, said := a.unopened.LoadOrStore(name, true); !said {
			slog.Error("opening secret", "name", name, "err", err)
		}
	}
	return v
}

func (a *App) storedSecret(ctx context.Context, name string) string {
	var v string
	if _, err := a.Store.Setting(ctx, name, &v); err != nil {
		slog.Error("reading secret", "name", name, "err", err)
	}
	return v
}

func (a *App) SetSecret(ctx context.Context, name, value string) error {
	v := strings.TrimSpace(value)
	if v != "" {
		v = a.cfg.Seal.Seal(v)
	}
	return a.Store.SetSetting(ctx, name, v)
}

// SealStoredSecrets seals any secret saved before encryption was switched on.
func (a *App) SealStoredSecrets(ctx context.Context) error {
	for _, name := range SecretNames {
		if v := a.storedSecret(ctx, name); v != "" && !seal.Sealed(v) {
			if err := a.SetSecret(ctx, name, v); err != nil {
				return err
			}
		}
	}
	return nil
}
