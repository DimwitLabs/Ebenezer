package app

import (
	"context"
	"strings"
	"testing"

	"github.com/DimwitLabs/ebenezer/internal/seal"
)

func TestSecretsAreSealedInTheDatabase(t *testing.T) {
	ctx := context.Background()
	box, _ := seal.New(strings.Repeat("k", seal.MinKey))
	a := New(testStore(t), Config{Seal: box})
	stored := func() string {
		var v string
		_, _ = a.Store.Setting(ctx, OpenRouterKey, &v)
		return v
	}

	_ = a.Store.SetSetting(ctx, OpenRouterKey, "sk-or-from-before")
	if err := a.SealStoredSecrets(ctx); err != nil {
		t.Fatal(err)
	}
	if !seal.Sealed(stored()) || a.Secret(ctx, OpenRouterKey) != "sk-or-from-before" {
		t.Fatalf("a plain secret from before should be sealed at startup, got %q", stored())
	}

	if err := a.SetSecret(ctx, OpenRouterKey, " sk-or-new "); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(stored(), "sk-or-new") || a.Secret(ctx, OpenRouterKey) != "sk-or-new" {
		t.Fatalf("stored %q", stored())
	}

	other, _ := seal.New(strings.Repeat("o", seal.MinKey))
	if v := New(a.Store, Config{Seal: other}).Secret(ctx, OpenRouterKey); v != "" {
		t.Fatalf("another key read %q", v)
	}

	_ = a.SetSecret(ctx, OpenRouterKey, "")
	if stored() != "" {
		t.Fatal("removing a secret should clear it")
	}
}
