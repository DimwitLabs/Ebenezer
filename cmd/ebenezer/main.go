package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"
	_ "time/tzdata"

	"github.com/DimwitLabs/ebenezer/internal/app"
	"github.com/DimwitLabs/ebenezer/internal/seal"
	"github.com/DimwitLabs/ebenezer/internal/server"
	"github.com/DimwitLabs/ebenezer/internal/store"
	"github.com/DimwitLabs/ebenezer/web"
)

var version = "dev"

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envBool(key string, fallback bool) (bool, error) {
	v := os.Getenv(key)
	if v == "" {
		return fallback, nil
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return false, fmt.Errorf("%s must be true or false, not %q", key, v)
	}
	return b, nil
}

func envInt(key string, fallback int) (int, error) {
	v := os.Getenv(key)
	if v == "" {
		return fallback, nil
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return 0, fmt.Errorf("%s must be a positive whole number, not %q", key, v)
	}
	return n, nil
}

func run() error {
	databaseURL := os.Getenv("EBENEZER_DATABASE_URL")
	if databaseURL == "" {
		return errors.New("EBENEZER_DATABASE_URL is required, e.g. postgres://ebenezer:secret@db:5432/ebenezer")
	}
	secureCookies, err := envBool("EBENEZER_SECURE_COOKIES", true)
	if err != nil {
		return err
	}
	sessionHours, err := envInt("EBENEZER_SESSION_HOURS", 24*14)
	if err != nil {
		return err
	}
	scheduler, err := envBool("EBENEZER_SCHEDULER", true)
	if err != nil {
		return err
	}
	if !secureCookies {
		slog.Warn("EBENEZER_SECURE_COOKIES=false: cookies work over plain http; use this for local testing only")
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	publicURL := strings.TrimRight(strings.TrimSpace(os.Getenv("EBENEZER_PUBLIC_URL")), "/")
	if u, err := url.Parse(publicURL); publicURL != "" && (err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "") {
		return errors.New("EBENEZER_PUBLIC_URL should look like https://ebenezer.example.com")
	}
	box, err := seal.New(os.Getenv("EBENEZER_ENCRYPTION_KEY"))
	if err != nil {
		return err
	}
	schema := env("EBENEZER_DB_SCHEMA", "ebenezer")
	st, err := store.Open(ctx, databaseURL, schema)
	if err != nil {
		return err
	}
	defer st.Close()
	if err := st.CloseInterruptedJobs(ctx); err != nil {
		return err
	}

	a := app.New(st, app.Config{
		Seal:      box,
		NtfyURL:   os.Getenv("EBENEZER_NTFY_URL"),
		PublicURL: publicURL,
	})
	if err := a.SealStoredSecrets(ctx); err != nil {
		return err
	}
	go func() {
		if err := a.RebuildAll(ctx); err != nil {
			slog.Error("rebuilding holdings at startup", "err", err)
		}
	}()
	srv := server.New(a, server.Config{SecureCookies: secureCookies, SessionTTL: time.Duration(sessionHours) * time.Hour}, web.Dist())
	go srv.Janitor(ctx)
	if scheduler {
		go a.Schedule(ctx)
	}

	addr := env("EBENEZER_ADDR", ":8080")
	httpServer := &http.Server{
		Addr:              addr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       2 * time.Minute,
		WriteTimeout:      2 * time.Minute,
		IdleTimeout:       2 * time.Minute,
	}
	errs := make(chan error, 1)
	go func() {
		slog.Info("ebenezer listening", "addr", addr, "schema", schema, "scheduler", scheduler, "version", version)
		errs <- httpServer.ListenAndServe()
	}()

	select {
	case err := <-errs:
		return err
	case <-ctx.Done():
	}
	shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return httpServer.Shutdown(shutdown)
}

func healthcheck() int {
	addr := env("EBENEZER_ADDR", ":8080")
	if strings.HasPrefix(addr, ":") {
		addr = "localhost" + addr
	}
	client := &http.Client{Timeout: 3 * time.Second}
	res, err := client.Get("http://" + addr + "/api/health")
	if err != nil {
		return 1
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		os.Exit(healthcheck())
	}
	if err := run(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("ebenezer stopped", "err", err)
		os.Exit(1)
	}
}
