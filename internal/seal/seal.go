// Package seal encrypts secrets at rest so a database dump or backup does not hand over keys and passwords.
package seal

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strings"
)

const prefix = "v1:"

const MinKey = 32

var ErrKey = errors.New("this secret was sealed with a different EBENEZER_ENCRYPTION_KEY")

type Box struct{ aead cipher.AEAD }

// New makes a Box from key, hashed to the 32 bytes AES-256 needs, so people need not produce exact binary.
func New(key string) (*Box, error) {
	if len(key) < MinKey {
		return nil, errors.New("EBENEZER_ENCRYPTION_KEY must be at least 32 characters; make one with: openssl rand -base64 32")
	}
	sum := sha256.Sum256([]byte(key))
	block, err := aes.NewCipher(sum[:])
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Box{aead}, nil
}

func (b *Box) Seal(plain string) string {
	nonce := make([]byte, b.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		panic(err)
	}
	return prefix + base64.StdEncoding.EncodeToString(b.aead.Seal(nonce, nonce, []byte(plain), nil))
}

func (b *Box) Open(sealed string) (string, error) {
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(sealed, prefix))
	n := b.aead.NonceSize()
	if err != nil || len(raw) < n {
		return "", ErrKey
	}
	plain, err := b.aead.Open(nil, raw[:n], raw[n:], nil)
	if err != nil {
		return "", ErrKey
	}
	return string(plain), nil
}

func Sealed(s string) bool { return strings.HasPrefix(s, prefix) }
