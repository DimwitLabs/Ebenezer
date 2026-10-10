package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/DimwitLabs/ebenezer/internal/store"
)

type apiError struct {
	status  int
	code    string
	message string
}

func (e *apiError) Error() string { return e.message }

func fail(status int, format string, args ...any) error {
	return &apiError{status: status, message: fmt.Sprintf(format, args...)}
}

type handler func(w http.ResponseWriter, r *http.Request) error

func (s *Server) wrap(h handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		err := h(w, r)
		if err == nil {
			return
		}
		var ae *apiError
		if errors.As(err, &ae) {
			body := map[string]string{"error": ae.message}
			if ae.code != "" {
				body["code"] = ae.code
			}
			writeJSON(w, ae.status, body)
			return
		}
		if errors.Is(err, store.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
			return
		}
		slog.Error("request failed", "method", r.Method, "path", r.URL.Path, "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "something went wrong on the server"})
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

const maxJSONBody = 2 << 20

func readJSON(r *http.Request, v any) error {
	return readJSONUpTo(r, v, maxJSONBody)
}

func readJSONUpTo(r *http.Request, v any, limit int64) error {
	dec := json.NewDecoder(http.MaxBytesReader(nil, r.Body, limit))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			return fail(http.StatusRequestEntityTooLarge, "that's too much for me in one go; split it into smaller imports")
		}
		return fail(http.StatusBadRequest, "I couldn't read that request")
	}
	return nil
}

func ok(w http.ResponseWriter) error {
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	return nil
}
