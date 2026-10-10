package app

import (
	"bytes"
	"context"
	"crypto/rand"
	_ "embed"
	htmltemplate "html/template"
	"strings"

	"github.com/DimwitLabs/ebenezer/internal/store"
)

//go:embed invite.html
var inviteHTML string

var inviteMail = htmltemplate.Must(htmltemplate.New("invite").Parse(inviteHTML))

type inviteData struct {
	C                                                        map[string]string
	Subject, Name, Lead, Email, Password, Link, Action, From string
}

// FirstPassword makes a random first password with no 0/O or 1/l, so it reads aloud and types easily.
func FirstPassword() string {
	const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	b := make([]byte, 14)
	rand.Read(b)
	for i := range b {
		b[i] = letters[int(b[i])%len(letters)]
	}
	return string(b[:4]) + "-" + string(b[4:9]) + "-" + string(b[9:])
}

func (a *App) SendInvite(ctx context.Context, from, to *store.User, password string, p *store.Portfolio) error {
	d := inviteData{C: palette(nil), Name: firstName(to.Name), Email: to.Email, Password: password, From: from.Name, Link: a.PublicURL()}
	if p != nil {
		d.C = palette(p.Settings.Palette)
	}
	switch {
	case password != "" && p != nil:
		d.Subject = from.Name + " shared " + p.Name + " with you"
		d.Lead = from.Name + " made you an account on Ebenezer and shared " + p.Name + " with you."
		d.Action = "Sign in"
	case password != "":
		d.Subject = from.Name + " made you an Ebenezer account"
		d.Lead = from.Name + " made you an account on Ebenezer, where you can keep track of what you own."
		d.Action = "Sign in"
	default:
		d.Subject = from.Name + " shared " + p.Name + " with you"
		d.Lead = p.Name + " is now in your portfolio switcher on Ebenezer, next to your own."
		d.Action = "Open " + p.Name
		if d.Link != "" {
			d.Link += "/p/" + p.Slug
		}
	}
	var html bytes.Buffer
	if err := inviteMail.Execute(&html, d); err != nil {
		return err
	}
	text := "Hi " + d.Name + ", " + d.Lead + "\n\n"
	if password != "" {
		text += "Email: " + d.Email + "\nFirst password: " + password + "\n\nYou choose your own password the first time you sign in, and this one stops working.\n\n"
	}
	if d.Link != "" {
		text += d.Action + ": " + d.Link + "\n"
	}
	return a.SendMail(ctx, []string{to.Email}, d.Subject, html.String(), text)
}

func firstName(name string) string {
	if f := strings.Fields(name); len(f) > 0 {
		return f[0]
	}
	return name
}
