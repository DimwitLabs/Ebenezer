package app

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/hex"
	"errors"
	"fmt"
	"mime"
	"mime/quotedprintable"
	"net"
	"net/mail"
	"net/smtp"
	"strconv"
	"strings"
	"time"

	"github.com/DimwitLabs/ebenezer/internal/store"
)

var ErrNoSMTP = errors.New("set up SMTP in Settings first")

// SendMail sends through implicit TLS (465), STARTTLS (587), or none, which is only sensible for a relay on the same machine.
func (a *App) SendMail(ctx context.Context, to []string, subject, html, text string) error {
	is, err := a.Store.InstanceSettings(ctx)
	if err != nil {
		return err
	}
	if is.SMTPHost == "" || is.SMTPFrom == "" {
		return ErrNoSMTP
	}
	from, err := mail.ParseAddress(is.SMTPFrom)
	if err != nil {
		return fmt.Errorf("the From address: %w", err)
	}
	msg, err := message(from, to, subject, html, text)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	addr := net.JoinHostPort(is.SMTPHost, strconv.Itoa(is.SMTPPort))
	dialer := &net.Dialer{}
	var conn net.Conn
	tlsConfig := &tls.Config{ServerName: is.SMTPHost, MinVersion: tls.VersionTLS12}
	if is.SMTPSecurity == "tls" {
		conn, err = (&tls.Dialer{NetDialer: dialer, Config: tlsConfig}).DialContext(ctx, "tcp", addr)
	} else {
		conn, err = dialer.DialContext(ctx, "tcp", addr)
	}
	if err != nil {
		return err
	}
	if deadline, ok := ctx.Deadline(); ok {
		_ = conn.SetDeadline(deadline)
	}
	c, err := smtp.NewClient(conn, is.SMTPHost)
	if err != nil {
		conn.Close()
		return err
	}
	defer c.Close()
	if is.SMTPSecurity == "starttls" {
		if err := c.StartTLS(tlsConfig); err != nil {
			return fmt.Errorf("STARTTLS: %w", err)
		}
	}
	if is.SMTPUser != "" {
		if err := c.Auth(smtp.PlainAuth("", is.SMTPUser, a.Secret(ctx, SMTPPassword), is.SMTPHost)); err != nil {
			return fmt.Errorf("sign-in: %w", err)
		}
	}
	if err := c.Mail(from.Address); err != nil {
		return err
	}
	for _, rcpt := range to {
		if err := c.Rcpt(rcpt); err != nil {
			return fmt.Errorf("%s: %w", rcpt, err)
		}
	}
	w, err := c.Data()
	if err != nil {
		return err
	}
	if _, err := w.Write(msg); err != nil {
		return err
	}
	if err := w.Close(); err != nil {
		return err
	}
	return c.Quit()
}

func message(from *mail.Address, to []string, subject, html, text string) ([]byte, error) {
	b := make([]byte, 12)
	if _, err := rand.Read(b); err != nil {
		return nil, err
	}
	boundary := "ebenezer-" + hex.EncodeToString(b)
	var buf bytes.Buffer
	header := func(k, v string) { fmt.Fprintf(&buf, "%s: %s\r\n", k, v) }
	header("From", from.String())
	header("To", strings.Join(to, ", "))
	header("Subject", mime.QEncoding.Encode("utf-8", subject))
	header("Date", time.Now().Format(time.RFC1123Z))
	header("Message-ID", fmt.Sprintf("<%s@%s>", hex.EncodeToString(b), domain(from.Address)))
	header("MIME-Version", "1.0")
	header("Content-Type", `multipart/alternative; boundary="`+boundary+`"`)
	buf.WriteString("\r\n")
	for _, part := range []struct{ kind, body string }{{"text/plain", text}, {"text/html", html}} {
		fmt.Fprintf(&buf, "--%s\r\nContent-Type: %s; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n", boundary, part.kind)
		qp := quotedprintable.NewWriter(&buf)
		if _, err := qp.Write([]byte(part.body)); err != nil {
			return nil, err
		}
		if err := qp.Close(); err != nil {
			return nil, err
		}
		buf.WriteString("\r\n")
	}
	fmt.Fprintf(&buf, "--%s--\r\n", boundary)
	return buf.Bytes(), nil
}

func domain(addr string) string {
	if i := strings.LastIndex(addr, "@"); i >= 0 {
		return addr[i+1:]
	}
	return "ebenezer"
}

func ValidSMTP(is store.InstanceSettings) error {
	if is.SMTPHost == "" {
		return nil
	}
	if is.SMTPPort < 1 || is.SMTPPort > 65535 {
		return errors.New("the SMTP port should be between 1 and 65535")
	}
	switch is.SMTPSecurity {
	case "tls", "starttls", "none":
	default:
		return errors.New("pick TLS, STARTTLS or none for SMTP")
	}
	if _, err := mail.ParseAddress(is.SMTPFrom); err != nil {
		return errors.New("the From address isn't an email address")
	}
	return nil
}
