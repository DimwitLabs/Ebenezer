package seal

import (
	"strings"
	"testing"
)

const key = "0123456789abcdef0123456789abcdef"

func TestRoundTrip(t *testing.T) {
	b, err := New(key)
	if err != nil {
		t.Fatal(err)
	}
	s := b.Seal("sk-or-secret")
	if !Sealed(s) || strings.Contains(s, "sk-or") {
		t.Fatalf("not sealed: %s", s)
	}
	if s == b.Seal("sk-or-secret") {
		t.Fatal("same plaintext sealed twice gave the same text")
	}
	got, err := b.Open(s)
	if err != nil || got != "sk-or-secret" {
		t.Fatalf("got %q, %v", got, err)
	}
}

func TestWrongKey(t *testing.T) {
	a, _ := New(key)
	b, _ := New(key + "x")
	if _, err := b.Open(a.Seal("x")); err != ErrKey {
		t.Fatalf("wrong key: %v", err)
	}
}

func TestShortKey(t *testing.T) {
	if _, err := New("short"); err == nil {
		t.Fatal("short key accepted")
	}
}
