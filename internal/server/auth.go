package server

import (
	"context"
	"errors"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/DimwitLabs/ebenezer/internal/app"
	"github.com/DimwitLabs/ebenezer/internal/store"
)

func (s *Server) health(w http.ResponseWriter, r *http.Request) error {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	if err := s.store.Ping(ctx); err != nil {
		return fail(http.StatusServiceUnavailable, "I can't reach my database right now")
	}
	return ok(w)
}

func (s *Server) status(w http.ResponseWriter, r *http.Request) error {
	n, err := s.store.CountUsers(r.Context())
	if err != nil {
		return err
	}
	out := map[string]any{"needsSetup": n == 0, "user": nil, "timeZone": app.Zone.String()}
	if s.token(r) != nil {
		if u, err := s.user(r); err == nil {
			out["user"] = u
		}
	}
	writeJSON(w, http.StatusOK, out)
	return nil
}

type credentials struct {
	Email    string `json:"email"`
	Name     string `json:"name"`
	Password string `json:"password"`
}

func (c *credentials) clean(needName bool) error {
	c.Email = strings.ToLower(strings.TrimSpace(c.Email))
	c.Name = strings.TrimSpace(c.Name)
	if _, err := mail.ParseAddress(c.Email); err != nil {
		return fail(http.StatusBadRequest, "that email address doesn't look right")
	}
	if needName && c.Name == "" {
		return fail(http.StatusBadRequest, "add a name")
	}
	if len(c.Password) < 10 || len(c.Password) > 72 {
		return fail(http.StatusBadRequest, "use a password of 10 to 72 characters")
	}
	return nil
}

func hash(password string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	return string(b), err
}

func (s *Server) setup(w http.ResponseWriter, r *http.Request) error {
	var c credentials
	if err := readJSON(r, &c); err != nil {
		return err
	}
	if err := c.clean(true); err != nil {
		return err
	}
	h, err := hash(c.Password)
	if err != nil {
		return err
	}
	u, err := s.store.CreateOwner(r.Context(), c.Email, c.Name, h)
	if errors.Is(err, store.ErrConflict) {
		return fail(http.StatusConflict, "this Ebenezer is already set up; sign in instead")
	}
	if err != nil {
		return err
	}
	if err := s.startSession(r.Context(), w, u.ID); err != nil {
		return err
	}
	writeJSON(w, http.StatusCreated, u)
	return nil
}

// decoyHash is a fixed hash that keeps a wrong email as slow as a wrong password, so timing does not reveal accounts.
var decoyHash, _ = bcrypt.GenerateFromPassword([]byte("ebenezer-decoy-password"), 12)

func (s *Server) login(w http.ResponseWriter, r *http.Request) error {
	var c credentials
	if err := readJSON(r, &c); err != nil {
		return err
	}
	email := strings.ToLower(strings.TrimSpace(c.Email))
	if !s.loginByIP.allow(clientIP(r)) || !s.loginByEmail.allow(email) {
		return fail(http.StatusTooManyRequests, "too many attempts; wait a few minutes")
	}
	u, err := s.store.UserByEmail(r.Context(), email)
	if errors.Is(err, store.ErrNotFound) {
		_ = bcrypt.CompareHashAndPassword(decoyHash, []byte(c.Password))
		return fail(http.StatusUnauthorized, "that email and password don't match")
	}
	if err != nil {
		return err
	}
	if bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(c.Password)) != nil {
		return fail(http.StatusUnauthorized, "that email and password don't match")
	}
	if err := s.startSession(r.Context(), w, u.ID); err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, u)
	return nil
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) error {
	if h := s.token(r); h != nil {
		if err := s.store.DeleteSession(r.Context(), h); err != nil {
			return err
		}
	}
	s.setSessionCookie(w, "", -1)
	return ok(w)
}

func (s *Server) changePassword(w http.ResponseWriter, r *http.Request) error {
	u, err := s.user(r)
	if err != nil {
		return err
	}
	var body struct {
		Current string `json:"current"`
		New     string `json:"new"`
	}
	if err := readJSON(r, &body); err != nil {
		return err
	}
	// Someone on a first password signed in with it moments ago, and that session opens nothing else.
	if !u.MustChange && bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(body.Current)) != nil {
		return fail(http.StatusForbidden, "your current password isn't right")
	}
	if len(body.New) < 10 || len(body.New) > 72 {
		return fail(http.StatusBadRequest, "use a password of 10 to 72 characters")
	}
	h, err := hash(body.New)
	if err != nil {
		return err
	}
	if err := s.store.SetPassword(r.Context(), u.ID, h, s.token(r)); err != nil {
		return err
	}
	return ok(w)
}

func (s *Server) listUsers(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.user(r); err != nil {
		return err
	}
	us, err := s.store.ListUsers(r.Context())
	if err != nil {
		return err
	}
	if us == nil {
		us = []store.User{}
	}
	writeJSON(w, http.StatusOK, us)
	return nil
}

type invite struct {
	credentials
	Send bool `json:"send"`
}

// newPerson adds an invited person; a first password made up here and emailed means nobody else ever has to know it.
func (s *Server) newPerson(r *http.Request, in *invite) (*store.User, error) {
	if in.Password == "" && in.Send {
		in.Password = app.FirstPassword()
	}
	if in.Password == "" {
		return nil, fail(http.StatusBadRequest, "add a first password, or email them one")
	}
	if err := in.clean(true); err != nil {
		return nil, err
	}
	h, err := hash(in.Password)
	if err != nil {
		return nil, err
	}
	u, err := s.store.CreateUser(r.Context(), in.Email, in.Name, h)
	if errors.Is(err, store.ErrConflict) {
		return nil, fail(http.StatusConflict, "someone already uses that email")
	}
	return u, err
}

func (s *Server) sendInvite(r *http.Request, from, to *store.User, password string, p *store.Portfolio) error {
	if err := s.app.SendInvite(r.Context(), from, to, password, p); err != nil {
		return fail(http.StatusBadGateway, "%s is set up, but I couldn't send the email: %s", to.Name, err.Error())
	}
	return nil
}

func (s *Server) addUser(w http.ResponseWriter, r *http.Request) error {
	owner, err := s.owner(r)
	if err != nil {
		return err
	}
	var in invite
	if err := readJSON(r, &in); err != nil {
		return err
	}
	u, err := s.newPerson(r, &in)
	if err != nil {
		return err
	}
	if in.Send {
		if err := s.sendInvite(r, owner, u, in.Password, nil); err != nil {
			return err
		}
	}
	writeJSON(w, http.StatusCreated, u)
	return nil
}

// reinvite sends a new first password, as the old one cannot be read back.
func (s *Server) reinvite(w http.ResponseWriter, r *http.Request) error {
	owner, err := s.owner(r)
	if err != nil {
		return err
	}
	id := r.PathValue("id")
	if !uuidPattern.MatchString(id) {
		return fail(http.StatusNotFound, "no such person")
	}
	u, err := s.store.UserByID(r.Context(), id)
	if errors.Is(err, store.ErrNotFound) {
		return fail(http.StatusNotFound, "no such person")
	}
	if err != nil {
		return err
	}
	if !u.MustChange {
		return fail(http.StatusConflict, "%s has already chosen their own password", u.Name)
	}
	password := app.FirstPassword()
	h, err := hash(password)
	if err != nil {
		return err
	}
	if err := s.store.ResetFirstPassword(r.Context(), u.ID, h); err != nil {
		return err
	}
	if err := s.sendInvite(r, owner, u, password, nil); err != nil {
		return err
	}
	return ok(w)
}

func (s *Server) deleteUser(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.owner(r); err != nil {
		return err
	}
	id := r.PathValue("id")
	if !uuidPattern.MatchString(id) {
		return fail(http.StatusNotFound, "no such person")
	}
	stranded, err := s.store.SoleMemberOf(r.Context(), id)
	if err != nil {
		return err
	}
	if len(stranded) > 0 {
		return fail(http.StatusConflict, "share or delete their portfolios first: %s", strings.Join(stranded, ", "))
	}
	if err := s.store.DeleteUser(r.Context(), id); err != nil {
		return err
	}
	return ok(w)
}
