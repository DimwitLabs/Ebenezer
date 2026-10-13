package server

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"io/fs"
	"log/slog"
	"net"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/DimwitLabs/ebenezer/internal/app"
	"github.com/DimwitLabs/ebenezer/internal/store"
)

type Config struct {
	SecureCookies bool
	SessionTTL    time.Duration
}

type Server struct {
	app          *app.App
	store        *store.Store
	cfg          Config
	static       fs.FS
	loginByIP    *limiter
	loginByEmail *limiter
	askByUser    *limiter
	// Manual report runs send mail through the owner's server, so they are capped per portfolio.
	reportByPortfolio *limiter
}

// New makes a Server with login limits by address and by email; behind a reverse proxy every visitor shares one address, so the per-email limit does the real work.
func New(a *app.App, cfg Config, static fs.FS) *Server {
	return &Server{app: a, store: a.Store, cfg: cfg, static: static, loginByIP: newLimiter(100, 15*time.Minute), loginByEmail: newLimiter(10, 15*time.Minute),
		askByUser: newLimiter(60, time.Hour), reportByPortfolio: newLimiter(6, time.Hour)}
}

func (s *Server) Janitor(ctx context.Context) {
	t := time.NewTicker(10 * time.Minute)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if err := s.store.PurgeExpiredSessions(ctx); err != nil {
				slog.Error("purging expired sessions", "err", err)
			}
			s.loginByIP.sweep()
			s.loginByEmail.sweep()
			s.askByUser.sweep()
			s.reportByPortfolio.sweep()
		}
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", s.wrap(s.health))
	mux.HandleFunc("GET /api/status", s.wrap(s.status))
	mux.HandleFunc("POST /api/setup", s.wrap(s.setup))
	mux.HandleFunc("POST /api/login", s.wrap(s.login))
	mux.HandleFunc("POST /api/logout", s.wrap(s.logout))
	mux.HandleFunc("PUT /api/me/password", s.wrap(s.changePassword))
	mux.HandleFunc("GET /api/users", s.wrap(s.listUsers))
	mux.HandleFunc("POST /api/users", s.wrap(s.addUser))
	mux.HandleFunc("DELETE /api/users/{id}", s.wrap(s.deleteUser))
	mux.HandleFunc("POST /api/users/{id}/invite", s.wrap(s.reinvite))

	mux.HandleFunc("GET /api/kinds", s.wrap(s.kinds))
	mux.HandleFunc("GET /api/securities", s.wrap(s.securities))
	mux.HandleFunc("GET /api/settings", s.wrap(s.instanceSettings))
	mux.HandleFunc("PUT /api/settings", s.wrap(s.saveInstanceSettings))
	mux.HandleFunc("PUT /api/settings/secrets/{name}", s.wrap(s.saveSecret))
	mux.HandleFunc("POST /api/settings/ntfy-test", s.wrap(s.ntfyTest))
	mux.HandleFunc("GET /api/settings/models", s.wrap(s.models))
	mux.HandleFunc("POST /api/settings/smtp-test", s.wrap(s.smtpTest))
	mux.HandleFunc("POST /api/settings/ai-test", s.wrap(s.aiTest))
	mux.HandleFunc("GET /api/checks", s.wrap(s.checks))
	mux.HandleFunc("GET /api/judge/default", s.wrap(s.defaultJudge))

	mux.HandleFunc("GET /api/portfolios", s.wrap(s.listPortfolios))
	mux.HandleFunc("POST /api/portfolios", s.wrap(s.createPortfolio))
	mux.HandleFunc("GET /api/portfolios/{pid}", s.wrap(s.getPortfolio))
	mux.HandleFunc("PATCH /api/portfolios/{pid}", s.wrap(s.updatePortfolio))
	mux.HandleFunc("DELETE /api/portfolios/{pid}", s.wrap(s.deletePortfolio))
	mux.HandleFunc("GET /api/portfolios/{pid}/summary", s.wrap(s.summary))
	mux.HandleFunc("GET /api/portfolios/{pid}/snapshots", s.wrap(s.snapshots))
	mux.HandleFunc("GET /api/portfolios/{pid}/positions", s.wrap(s.positions))
	mux.HandleFunc("PUT /api/portfolios/{pid}/moves", s.wrap(s.setMove))
	mux.HandleFunc("GET /api/portfolios/{pid}/report", s.wrap(s.reportPreview))
	mux.HandleFunc("GET /api/portfolios/{pid}/ledger", s.wrap(s.ledger))
	mux.HandleFunc("POST /api/portfolios/{pid}/ask", s.wrap(s.ask))
	mux.HandleFunc("GET /api/portfolios/{pid}/benchmark", s.wrap(s.benchmark))
	mux.HandleFunc("GET /api/portfolios/{pid}/members", s.wrap(s.members))
	mux.HandleFunc("PUT /api/portfolios/{pid}/members/{uid}", s.wrap(s.addMember))
	mux.HandleFunc("POST /api/portfolios/{pid}/invite", s.wrap(s.invite))
	mux.HandleFunc("DELETE /api/portfolios/{pid}/members/{uid}", s.wrap(s.removeMember))
	mux.HandleFunc("GET /api/portfolios/{pid}/sections", s.wrap(s.listSections))
	mux.HandleFunc("POST /api/portfolios/{pid}/sections", s.wrap(s.createSection))
	mux.HandleFunc("GET /api/portfolios/{pid}/imports", s.wrap(s.imports))
	mux.HandleFunc("GET /api/portfolios/{pid}/templates", s.wrap(s.templates))
	mux.HandleFunc("PUT /api/portfolios/{pid}/templates", s.wrap(s.saveTemplate))
	mux.HandleFunc("DELETE /api/portfolios/{pid}/templates/{id}", s.wrap(s.deleteTemplate))
	mux.HandleFunc("GET /api/portfolios/{pid}/news", s.wrap(s.news))
	mux.HandleFunc("GET /api/portfolios/{pid}/news/{id}/pdf", s.wrap(s.filingPDF))
	mux.HandleFunc("POST /api/portfolios/{pid}/news/{id}/judge", s.wrap(s.judgeNews))
	mux.HandleFunc("GET /api/portfolios/{pid}/scrips/{isin}", s.wrap(s.scrip))
	mux.HandleFunc("GET /api/portfolios/{pid}/jobs", s.wrap(s.jobs))
	mux.HandleFunc("POST /api/portfolios/{pid}/jobs/{job}", s.wrap(s.runJob))
	mux.HandleFunc("DELETE /api/portfolios/{pid}/jobs/{job}", s.wrap(s.stopJob))
	mux.HandleFunc("GET /api/portfolios/{pid}/schedules", s.wrap(s.schedules))
	mux.HandleFunc("POST /api/portfolios/{pid}/schedules/{name}", s.wrap(s.runSchedule))
	mux.HandleFunc("DELETE /api/portfolios/{pid}/schedules/{name}", s.wrap(s.stopSchedule))
	mux.HandleFunc("POST /api/portfolios/{pid}/scrips/{isin}/news", s.wrap(s.scripNews))
	mux.HandleFunc("POST /api/portfolios/{pid}/tidy", s.wrap(s.tidy))
	mux.HandleFunc("GET /api/portfolios/{pid}/expenses", s.wrap(s.expenses))
	mux.HandleFunc("POST /api/portfolios/{pid}/expenses/chat", s.wrap(s.spendChat))
	mux.HandleFunc("POST /api/portfolios/{pid}/spends", s.wrap(s.addSpend))
	mux.HandleFunc("PUT /api/portfolios/{pid}/spends/{id}", s.wrap(s.updateSpend))
	mux.HandleFunc("PUT /api/portfolios/{pid}/spends/{id}/paid", s.wrap(s.paidWith))
	mux.HandleFunc("POST /api/portfolios/{pid}/spends/undo", s.wrap(s.undoSpends))
	mux.HandleFunc("POST /api/portfolios/{pid}/spends/import", s.wrap(s.importSpends))
	mux.HandleFunc("DELETE /api/portfolios/{pid}/spend-imports/{id}", s.wrap(s.deleteSpendImport))
	mux.HandleFunc("POST /api/portfolios/{pid}/categories/tidy", s.wrap(s.tidyCategories))
	mux.HandleFunc("POST /api/portfolios/{pid}/categories/apply", s.wrap(s.applyTidy))
	mux.HandleFunc("POST /api/portfolios/{pid}/categories/edit", s.wrap(s.editCategory))
	mux.HandleFunc("POST /api/portfolios/{pid}/categories/remove", s.wrap(s.removeCategory))
	mux.HandleFunc("POST /api/portfolios/{pid}/cards", s.wrap(s.saveCard))
	mux.HandleFunc("POST /api/portfolios/{pid}/cards/import", s.wrap(s.importCards))
	mux.HandleFunc("POST /api/portfolios/{pid}/cards/terms", s.wrap(s.cardTerms))
	mux.HandleFunc("PUT /api/portfolios/{pid}/cards/{id}", s.wrap(s.saveCard))
	mux.HandleFunc("DELETE /api/portfolios/{pid}/cards/{id}", s.wrap(s.deleteCard))
	mux.HandleFunc("POST /api/portfolios/{pid}/cards/{id}/paid", s.wrap(s.cardPaid))
	mux.HandleFunc("GET /api/export", s.wrap(s.exportPreview))
	mux.HandleFunc("GET /api/export/zip", s.wrap(s.exportZip))

	mux.HandleFunc("PATCH /api/sections/{sid}", s.wrap(s.updateSection))
	mux.HandleFunc("DELETE /api/sections/{sid}", s.wrap(s.deleteSection))
	mux.HandleFunc("GET /api/sections/{sid}/rows", s.wrap(s.rows))
	mux.HandleFunc("POST /api/sections/{sid}/rows", s.wrap(s.addRow))
	mux.HandleFunc("PUT /api/sections/{sid}/rows/{rid}", s.wrap(s.updateRow))
	mux.HandleFunc("DELETE /api/sections/{sid}/rows/{rid}", s.wrap(s.deleteRow))
	mux.HandleFunc("GET /api/sections/{sid}/holdings", s.wrap(s.holdings))
	mux.HandleFunc("POST /api/sections/{sid}/import", s.wrap(s.importRows))

	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "no such endpoint"})
	})
	mux.Handle("/", s.spa())
	return securityHeaders(s.cfg.SecureCookies, csrfGuard(mux))
}

// contentSecurityPolicy allows inline styles, as ECharts and React set them, but never inline scripts.
const contentSecurityPolicy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
	"img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; object-src 'none'; " +
	"base-uri 'none'; form-action 'self'; frame-ancestors 'none'"

// sandboxPolicy lets the processing worker evaluate code the person wrote but load nothing: the worker is one self-contained
// file, so without 'self' even a same-origin import() of an API path is refused.
const sandboxPolicy = "default-src 'none'; script-src 'unsafe-eval'; connect-src 'none'; worker-src 'none'"

// securityHeaders sends HSTS only over HTTPS, which SecureCookies stands for; it leaves out includeSubDomains, since a
// self-hosted Ebenezer often shares a domain with other things its owner runs.
func securityHeaders(https bool, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		policy := contentSecurityPolicy
		if isSandbox(r.URL.Path) {
			policy = sandboxPolicy
		}
		h.Set("Content-Security-Policy", policy)
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		h.Set("Cross-Origin-Resource-Policy", "same-origin")
		if https {
			h.Set("Strict-Transport-Security", "max-age=31536000")
		}
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
		if strings.HasPrefix(r.URL.Path, "/api/") {
			h.Set("Cache-Control", "no-store")
		}
		next.ServeHTTP(w, r)
	})
}

func isSandbox(p string) bool {
	return strings.HasPrefix(p, "/assets/sandbox") && strings.HasSuffix(p, ".js")
}

func csrfGuard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") && r.Method != http.MethodGet && r.Method != http.MethodHead &&
			r.Header.Get("X-Ebenezer-Request") != "1" {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "missing X-Ebenezer-Request header"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) spa() http.Handler {
	files := http.FileServerFS(s.static)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if name == "" {
			name = "index.html"
		}
		if info, err := fs.Stat(s.static, name); err != nil || info.IsDir() {
			if strings.HasPrefix(name, "assets/") {
				http.NotFound(w, r)
				return
			}
			name = "index.html"
			r = r.Clone(r.Context())
			r.URL.Path = "/"
		}
		if strings.HasPrefix(name, "assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			w.Header().Set("Cache-Control", "no-cache")
		}
		files.ServeHTTP(w, r)
	})
}

const sessionCookie = "ebenezer_session"

func (s *Server) cookieName() string {
	if s.cfg.SecureCookies {
		return "__Host-" + sessionCookie
	}
	return sessionCookie
}

// setSessionCookie sets a Lax cookie so links from other apps open signed in; writes stay safe as Lax skips cross-site posts and csrfGuard wants a header.
func (s *Server) setSessionCookie(w http.ResponseWriter, value string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name:     s.cookieName(),
		Value:    value,
		Path:     "/",
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   s.cfg.SecureCookies,
		SameSite: http.SameSiteLaxMode,
	})
}

func sha(b []byte) []byte {
	sum := sha256.Sum256(b)
	return sum[:]
}

func (s *Server) startSession(ctx context.Context, w http.ResponseWriter, userID string) error {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return err
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	if err := s.store.CreateSession(ctx, sha([]byte(token)), userID, s.cfg.SessionTTL); err != nil {
		return err
	}
	s.setSessionCookie(w, token, int(s.cfg.SessionTTL.Seconds()))
	return nil
}

func (s *Server) token(r *http.Request) []byte {
	c, err := r.Cookie(s.cookieName())
	if err != nil || c.Value == "" {
		return nil
	}
	return sha([]byte(c.Value))
}

func (s *Server) user(r *http.Request) (*store.User, error) {
	h := s.token(r)
	if h == nil {
		return nil, fail(http.StatusUnauthorized, "sign in first")
	}
	u, err := s.store.SessionUser(r.Context(), h)
	if errors.Is(err, store.ErrNotFound) {
		return nil, fail(http.StatusUnauthorized, "your session has ended; sign in again")
	}
	// A first password came by email, so it opens nothing until its owner swaps it for their own.
	if err == nil && u.MustChange && r.URL.Path != "/api/me/password" && r.URL.Path != "/api/status" {
		return nil, fail(http.StatusForbidden, "choose your own password first")
	}
	return u, err
}

func (s *Server) owner(r *http.Request) (*store.User, error) {
	u, err := s.user(r)
	if err != nil {
		return nil, err
	}
	if !u.IsOwner {
		return nil, fail(http.StatusForbidden, "only the owner of this Ebenezer can do that")
	}
	return u, nil
}

func (s *Server) portfolio(r *http.Request) (*store.User, *store.Portfolio, error) {
	u, err := s.user(r)
	if err != nil {
		return nil, nil, err
	}
	pid := r.PathValue("pid")
	if !uuidPattern.MatchString(pid) {
		return nil, nil, fail(http.StatusNotFound, "no such portfolio")
	}
	p, err := s.store.Portfolio(r.Context(), pid, u.ID)
	if errors.Is(err, store.ErrNotFound) {
		return nil, nil, fail(http.StatusNotFound, "no such portfolio")
	}
	return u, p, err
}

func (s *Server) section(r *http.Request) (*store.User, *store.Section, error) {
	u, err := s.user(r)
	if err != nil {
		return nil, nil, err
	}
	sid := r.PathValue("sid")
	if !uuidPattern.MatchString(sid) {
		return nil, nil, fail(http.StatusNotFound, "no such section")
	}
	sec, err := s.store.SectionForUser(r.Context(), sid, u.ID)
	if errors.Is(err, store.ErrNotFound) {
		return nil, nil, fail(http.StatusNotFound, "no such section")
	}
	return u, sec, err
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
