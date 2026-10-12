package server

import (
	"net/http"
	"strings"

	"github.com/DimwitLabs/ebenezer/internal/app"
)

func (s *Server) instanceSettings(w http.ResponseWriter, r *http.Request) error {
	u, err := s.user(r)
	if err != nil {
		return err
	}
	is, err := s.store.InstanceSettings(r.Context())
	if err != nil {
		return err
	}
	metals, err := s.app.LastMetals(r.Context())
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"settings": is,
		"metals":   metals,
		"secrets":  s.secrets(r),
		"canEdit":  u.IsOwner,
	})
	return nil
}

func (s *Server) saveInstanceSettings(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.owner(r); err != nil {
		return err
	}
	// Fields the request leaves out keep their saved value, so two forms saving at once don't undo each other.
	is, err := s.store.InstanceSettings(r.Context())
	if err != nil {
		return err
	}
	if err := readJSON(r, &is); err != nil {
		return err
	}
	if !clockPattern.MatchString(is.PricesTime) || !clockPattern.MatchString(is.HealthTime) {
		return fail(http.StatusBadRequest, "times look like 18:45")
	}
	is.SMTPHost = strings.TrimSpace(is.SMTPHost)
	if err := app.ValidSMTP(is); err != nil {
		return fail(http.StatusBadRequest, "%s", err.Error())
	}
	if is.GoldPerGram < 0 || is.SilverPerGram < 0 {
		return fail(http.StatusBadRequest, "a metal rate can't be negative")
	}
	is.OpenRouterModel = strings.TrimSpace(is.OpenRouterModel)
	is.NtfyURL = strings.TrimSpace(is.NtfyURL)
	if is.NtfyURL != "" && !strings.HasPrefix(is.NtfyURL, "https://") && !strings.HasPrefix(is.NtfyURL, "http://") {
		return fail(http.StatusBadRequest, "the ntfy address should start with https://")
	}
	if err := s.store.SaveInstanceSettings(r.Context(), is); err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, is)
	return nil
}

func (s *Server) saveSecret(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.owner(r); err != nil {
		return err
	}
	name := r.PathValue("name")
	if !app.IsSecret(name) {
		return fail(http.StatusNotFound, "no such secret")
	}
	var body struct {
		Value string `json:"value"`
	}
	if err := readJSON(r, &body); err != nil {
		return err
	}
	if len(body.Value) > 500 {
		return fail(http.StatusBadRequest, "that's too long to be a key")
	}
	if err := s.app.SetSecret(r.Context(), name, body.Value); err != nil {
		return err
	}
	return ok(w)
}

type secretState struct {
	Set bool `json:"set"`
}

// secrets reports only whether each secret is set, never its value.
func (s *Server) secrets(r *http.Request) map[string]secretState {
	out := map[string]secretState{}
	for _, name := range app.SecretNames {
		out[name] = secretState{Set: s.app.Secret(r.Context(), name) != ""}
	}
	return out
}

func (s *Server) ntfyTest(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.owner(r); err != nil {
		return err
	}
	if s.app.NtfyURL(r.Context()) == "" {
		return fail(http.StatusBadRequest, "add an ntfy address first")
	}
	if err := s.app.TestNotify(r.Context()); err != nil {
		return fail(http.StatusBadGateway, "ntfy didn't take it: %v", err)
	}
	return ok(w)
}

func (s *Server) checks(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.owner(r); err != nil {
		return err
	}
	h, err := s.app.LastHealth(r.Context())
	if err != nil {
		return err
	}
	if h.Checks == nil {
		h.Checks = []app.Check{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"health": h, "running": s.app.Running("health", "")})
	return nil
}

func (s *Server) models(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.user(r); err != nil {
		return err
	}
	ms, err := s.app.Models(r.Context())
	if err != nil {
		return fail(http.StatusBadGateway, "I couldn't list OpenRouter's models: %v", err)
	}
	writeJSON(w, http.StatusOK, ms)
	return nil
}

func (s *Server) aiTest(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.owner(r); err != nil {
		return err
	}
	var body struct {
		Key   string `json:"key"`
		Model string `json:"model"`
	}
	if err := readJSON(r, &body); err != nil {
		return err
	}
	key := strings.TrimSpace(body.Key)
	if key == "" {
		key = s.app.Secret(r.Context(), app.OpenRouterKey)
	}
	if key == "" {
		return fail(http.StatusBadRequest, "add an OpenRouter key first")
	}
	model := strings.TrimSpace(body.Model)
	if model == "" {
		is, err := s.store.InstanceSettings(r.Context())
		if err != nil {
			return err
		}
		model = is.OpenRouterModel
	}
	detail, err := s.app.TestAI(r.Context(), key, model)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "detail": err.Error()})
		return nil
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "detail": detail})
	return nil
}

// A move counts one holding in another section, such as a gold ETF under gold.
