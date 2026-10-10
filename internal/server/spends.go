package server

import (
	"errors"
	"fmt"
	"math"
	"net/http"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/DimwitLabs/ebenezer/internal/app"
	"github.com/DimwitLabs/ebenezer/internal/store"
	"github.com/DimwitLabs/ebenezer/internal/value"
)

func (s *Server) expenses(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	e, err := s.app.Expenses(r.Context(), p)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, e)
	return nil
}

// aiFailure explains a failed AI request; the owner can connect a model, and anyone else can only ask the owner, who is the one who invited them.
func (s *Server) aiFailure(r *http.Request, u *store.User, err error, to, meanwhile string) error {
	if !errors.Is(err, app.ErrNoAI) {
		return fail(http.StatusBadGateway, "I couldn't get an answer just now: %v", err)
	}
	if u.IsOwner {
		return &apiError{status: http.StatusConflict, code: "no_ai", message: strings.TrimSpace(fmt.Sprintf("Connect an AI model in Admin and I can %s. %s", to, meanwhile))}
	}
	who := "the person who invited you"
	if o, oerr := s.store.Owner(r.Context()); oerr == nil {
		who = o.Name + ", who invited you"
	}
	return &apiError{status: http.StatusConflict, code: "no_ai", message: strings.TrimSpace(fmt.Sprintf("Talk to %s. I need an AI model to %s, and only they can connect one. %s", who, to, meanwhile))}
}

func (s *Server) spendChat(w http.ResponseWriter, r *http.Request) error {
	u, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	if !s.askByUser.allow(u.ID) {
		return fail(http.StatusTooManyRequests, "that's a lot of messages for one hour; give me a little while")
	}
	var body struct {
		Message string         `json:"message"`
		History []app.ChatTurn `json:"history"`
	}
	if err := readJSON(r, &body); err != nil {
		return err
	}
	msg := strings.TrimSpace(body.Message)
	if msg == "" || len(msg) > 1000 {
		return fail(http.StatusBadRequest, "say it in up to 1000 characters")
	}
	res, err := s.app.SpendChat(r.Context(), p, msg, body.History)
	if err != nil {
		return s.aiFailure(r, u, err, "sort your spends", "Until then, add them by hand with the + on the ledger.")
	}
	writeJSON(w, http.StatusOK, res)
	return nil
}

func validMethod(e *app.Expenses, key string) bool {
	return key == "" || slices.ContainsFunc(e.Methods, func(m app.Method) bool { return m.Key == key })
}

type spendBody struct {
	Day      string  `json:"day"`
	Item     string  `json:"item"`
	Amount   float64 `json:"amount"`
	Category string  `json:"category"`
	PaidWith string  `json:"paidWith"`
	Note     string  `json:"note"`
}

func (b spendBody) spend(e *app.Expenses) (store.Spend, error) {
	d, err := time.Parse(time.DateOnly, b.Day)
	if err != nil || d.After(app.Today()) {
		return store.Spend{}, fail(http.StatusBadRequest, "give a date up to today")
	}
	item, cat, note := strings.TrimSpace(b.Item), strings.TrimSpace(b.Category), strings.TrimSpace(b.Note)
	if item == "" || utf8.RuneCountInString(item) > 120 || utf8.RuneCountInString(cat) > 40 || utf8.RuneCountInString(note) > 500 {
		return store.Spend{}, fail(http.StatusBadRequest, "say what it was in up to 120 characters, and a category of up to 40")
	}
	if b.Amount == 0 || math.Abs(b.Amount) >= 1e8 {
		return store.Spend{}, fail(http.StatusBadRequest, "give an amount; a refund is negative")
	}
	if !validMethod(e, b.PaidWith) {
		return store.Spend{}, fail(http.StatusBadRequest, "that card or account isn't in this portfolio")
	}
	return store.Spend{Day: d, Item: item, Amount: b.Amount, Category: cat, PaidWith: b.PaidWith, Note: note}, nil
}

func (s *Server) newCategory(r *http.Request, pid string, e *app.Expenses, name string) error {
	if name == "" || slices.ContainsFunc(e.Categories, func(c store.SpendCategory) bool { return c.Name == name }) {
		return nil
	}
	return s.store.AddSpendCategories(r.Context(), pid, []store.SpendCategory{{Name: name, Icon: app.IconFor(name)}})
}

func (s *Server) addSpend(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	var body spendBody
	if err := readJSON(r, &body); err != nil {
		return err
	}
	e, err := s.app.Expenses(r.Context(), p)
	if err != nil {
		return err
	}
	sp, err := body.spend(e)
	if err != nil {
		return err
	}
	if err := s.newCategory(r, p.ID, e, sp.Category); err != nil {
		return err
	}
	if err := s.store.AddSpends(r.Context(), p.ID, []store.Spend{sp}); err != nil {
		return err
	}
	return s.expenses(w, r)
}

func (s *Server) updateSpend(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	var body spendBody
	if err := readJSON(r, &body); err != nil {
		return err
	}
	e, err := s.app.Expenses(r.Context(), p)
	if err != nil {
		return err
	}
	sp, err := body.spend(e)
	if err != nil {
		return err
	}
	sp.ID = r.PathValue("id")
	if err := s.newCategory(r, p.ID, e, sp.Category); err != nil {
		return err
	}
	if err := s.store.UpdateSpend(r.Context(), p.ID, sp); errors.Is(err, store.ErrNotFound) {
		return fail(http.StatusNotFound, "no such spend")
	} else if err != nil {
		return err
	}
	return s.expenses(w, r)
}

func (s *Server) paidWith(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	var body struct {
		PaidWith string `json:"paidWith"`
	}
	if err := readJSON(r, &body); err != nil {
		return err
	}
	e, err := s.app.Expenses(r.Context(), p)
	if err != nil {
		return err
	}
	if body.PaidWith == "" || !validMethod(e, body.PaidWith) {
		return fail(http.StatusBadRequest, "choose one of your cards or accounts, or cash")
	}
	i := slices.IndexFunc(e.Spends, func(sp store.Spend) bool { return sp.ID == r.PathValue("id") })
	if i < 0 {
		return fail(http.StatusNotFound, "no such spend")
	}
	sp := e.Spends[i]
	sp.PaidWith, sp.Asking = body.PaidWith, false
	if err := s.store.UpdateSpend(r.Context(), p.ID, sp); err != nil {
		return err
	}
	after, err := s.app.Expenses(r.Context(), p)
	if err != nil {
		return err
	}
	said := fmt.Sprintf("%s, %s on %s", sp.Item, app.Rupees(sp.Amount), after.MethodName(sp.PaidWith))
	writeJSON(w, http.StatusOK, map[string]any{"saved": said, "effects": app.Effects(after, []store.Spend{sp}), "expenses": after})
	return nil
}

func (s *Server) undoSpends(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	var body struct {
		IDs []string `json:"ids"`
	}
	if err := readJSON(r, &body); err != nil {
		return err
	}
	if len(body.IDs) == 0 || len(body.IDs) > 500 || slices.ContainsFunc(body.IDs, func(id string) bool { return !uuidPattern.MatchString(id) }) {
		return fail(http.StatusBadRequest, "say which spends to remove")
	}
	if _, err := s.store.DeleteSpends(r.Context(), p.ID, body.IDs); err != nil {
		return err
	}
	return s.expenses(w, r)
}

func (s *Server) importSpends(w http.ResponseWriter, r *http.Request) error {
	u, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	var body struct {
		Source string              `json:"source"`
		Rows   []map[string]string `json:"rows"`
	}
	if err := readJSONUpTo(r, &body, 16<<20); err != nil {
		return err
	}
	if len(body.Rows) == 0 || len(body.Rows) > 50000 {
		return fail(http.StatusBadRequest, "bring in between 1 and 50,000 spends at a time")
	}
	e, err := s.app.Expenses(r.Context(), p)
	if err != nil {
		return err
	}
	spends := make([]store.Spend, 0, len(body.Rows))
	var cats []store.SpendCategory
	fresh := map[string]bool{}
	for i, row := range body.Rows {
		d, ok := value.Date(row["date"])
		amount, isNum := value.Number(row["amount"])
		b := spendBody{Day: d.Format(time.DateOnly), Item: row["item"], Amount: amount, Category: row["category"], PaidWith: row["paid_with"], Note: row["note"]}
		if !ok || !isNum {
			return fail(http.StatusBadRequest, "row %d needs a date and an amount", i+1)
		}
		sp, err := b.spend(e)
		if err != nil {
			return fail(http.StatusBadRequest, "row %d: %v", i+1, err)
		}
		if sp.Category != "" && !fresh[sp.Category] && !slices.ContainsFunc(e.Categories, func(c store.SpendCategory) bool { return c.Name == sp.Category }) {
			fresh[sp.Category] = true
			cats = append(cats, store.SpendCategory{Name: sp.Category, Icon: app.IconFor(sp.Category)})
		}
		spends = append(spends, sp)
	}
	source := strings.TrimSpace(body.Source)
	if source == "" || len(source) > 120 {
		source = "Imported spends"
	}
	imp, err := s.store.ImportSpends(r.Context(), p.ID, u.ID, source, spends, cats)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, imp)
	return nil
}

func (s *Server) deleteSpendImport(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	id := r.PathValue("id")
	if !uuidPattern.MatchString(id) {
		return fail(http.StatusNotFound, "no such import")
	}
	if err := s.store.DeleteSpendImport(r.Context(), p.ID, id); errors.Is(err, store.ErrNotFound) {
		return fail(http.StatusNotFound, "no such import")
	} else if err != nil {
		return err
	}
	return s.expenses(w, r)
}

func (s *Server) tidyCategories(w http.ResponseWriter, r *http.Request) error {
	u, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	if !s.askByUser.allow(u.ID) {
		return fail(http.StatusTooManyRequests, "that's a lot of requests for one hour; give me a little while")
	}
	var body struct {
		Feedback string           `json:"feedback"`
		Previous []app.TidyChange `json:"previous"`
	}
	if err := readJSON(r, &body); err != nil {
		return err
	}
	if len(body.Feedback) > 500 {
		return fail(http.StatusBadRequest, "say it in up to 500 characters")
	}
	t, err := s.app.TidyCategories(r.Context(), p, body.Feedback, body.Previous)
	if err != nil {
		return s.aiFailure(r, u, err, "tidy your categories", "")
	}
	writeJSON(w, http.StatusOK, t)
	return nil
}

func (s *Server) applyTidy(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	var body struct {
		Changes []app.TidyChange `json:"changes"`
	}
	if err := readJSON(r, &body); err != nil {
		return err
	}
	if _, err := s.app.ApplyTidy(r.Context(), p, body.Changes); err != nil {
		return err
	}
	return s.expenses(w, r)
}

type cardBody struct {
	Kind             string   `json:"kind"`
	Bank             string   `json:"bank"`
	Name             string   `json:"name"`
	Nickname         string   `json:"nickname"`
	Network          string   `json:"network"`
	Color            string   `json:"color"`
	Limit            *float64 `json:"limit"`
	StatementDay     int      `json:"statementDay"`
	DueDays          int      `json:"dueDays"`
	Interest         *float64 `json:"interest"`
	AnnualFee        *float64 `json:"annualFee"`
	StatementOn      string   `json:"statementOn"`
	StatementBalance float64  `json:"statementBalance"`
	Paid             float64  `json:"paid"`
	SpentBefore      float64  `json:"spentBefore"`
}

func (b cardBody) card() (store.Card, error) {
	c := store.Card{Kind: b.Kind, Bank: strings.TrimSpace(b.Bank), Name: strings.TrimSpace(b.Name), Nickname: strings.TrimSpace(b.Nickname),
		Network: app.NetworkOf(b.Network), Color: b.Color, Limit: b.Limit, StatementDay: b.StatementDay, DueDays: b.DueDays, Interest: b.Interest, AnnualFee: b.AnnualFee,
		StatementBalance: b.StatementBalance, Paid: b.Paid, SpentBefore: b.SpentBefore}
	switch {
	case c.Kind != "credit" && c.Kind != "charge":
		return c, fail(http.StatusBadRequest, "a card is a credit card or a charge card")
	case c.Bank == "" || c.Name == "" || len(c.Bank) > 60 || len(c.Name) > 60 || len(c.Nickname) > 40:
		return c, fail(http.StatusBadRequest, "give the bank and the card's name")
	case !colorPattern.MatchString(c.Color) && c.Color != "metal":
		return c, fail(http.StatusBadRequest, "choose one of the colours")
	case c.StatementDay < 1 || c.StatementDay > 31:
		return c, fail(http.StatusBadRequest, "the statement day is a day of the month, 1 to 31")
	case c.DueDays < 1 || c.DueDays > 60:
		return c, fail(http.StatusBadRequest, "payment falls due 1 to 60 days after the statement")
	case c.Interest != nil && (*c.Interest < 0 || *c.Interest > 10):
		return c, fail(http.StatusBadRequest, "interest is a percent a month, like 3.75")
	case c.AnnualFee != nil && (*c.AnnualFee < 0 || *c.AnnualFee > 1e6):
		return c, fail(http.StatusBadRequest, "check the annual fee")
	case c.StatementBalance < 0 || c.Paid < 0 || c.Paid > c.StatementBalance || c.SpentBefore < 0:
		return c, fail(http.StatusBadRequest, "what you paid can be at most the statement balance, and nothing is negative")
	}
	if c.Kind == "charge" {
		c.Limit = nil
	} else if c.Limit == nil || *c.Limit <= 0 || *c.Limit > 1e8 {
		return c, fail(http.StatusBadRequest, "give the credit limit")
	}
	d, err := time.Parse(time.DateOnly, b.StatementOn)
	if err != nil || d.After(app.Today()) || d.Before(app.Today().AddDate(-1, 0, 0)) {
		return c, fail(http.StatusBadRequest, "the last statement date is within the past year")
	}
	c.StatementOn = d
	return c, nil
}

func (s *Server) saveCard(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	var body cardBody
	if err := readJSON(r, &body); err != nil {
		return err
	}
	c, err := body.card()
	if err != nil {
		return err
	}
	if id := r.PathValue("id"); id != "" {
		if !uuidPattern.MatchString(id) {
			return fail(http.StatusNotFound, "no such card")
		}
		c.ID = id
	}
	if err := s.store.SaveCard(r.Context(), p.ID, &c); errors.Is(err, store.ErrNotFound) {
		return fail(http.StatusNotFound, "no such card")
	} else if err != nil {
		return err
	}
	return s.expenses(w, r)
}

func (s *Server) deleteCard(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	if id := r.PathValue("id"); uuidPattern.MatchString(id) {
		if err := s.store.DeleteCard(r.Context(), p.ID, id); err != nil {
			return err
		}
	}
	return s.expenses(w, r)
}

func (s *Server) cardPaid(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	e, err := s.app.Expenses(r.Context(), p)
	if err != nil {
		return err
	}
	i := slices.IndexFunc(e.Cards, func(c app.CardState) bool { return c.ID == r.PathValue("id") })
	if i < 0 {
		return fail(http.StatusNotFound, "no such card")
	}
	c := app.MarkPaid(e.Cards[i])
	if err := s.store.SaveCard(r.Context(), p.ID, &c); err != nil {
		return err
	}
	return s.expenses(w, r)
}

func (s *Server) cardTerms(w http.ResponseWriter, r *http.Request) error {
	u, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	if !s.askByUser.allow(u.ID) {
		return fail(http.StatusTooManyRequests, "that's a lot of requests for one hour; give me a little while")
	}
	var body struct {
		Bank string `json:"bank"`
		Name string `json:"name"`
	}
	if err := readJSON(r, &body); err != nil {
		return err
	}
	bank, name := strings.TrimSpace(body.Bank), strings.TrimSpace(body.Name)
	if bank == "" || name == "" || len(bank) > 60 || len(name) > 60 {
		return fail(http.StatusBadRequest, "give the bank and the card's name first")
	}
	t, err := s.app.LookUpTerms(r.Context(), p, bank, name)
	if err != nil {
		return s.aiFailure(r, u, err, "look up a card's terms", "Until then, fill them in yourself.")
	}
	writeJSON(w, http.StatusOK, t)
	return nil
}

type exportPortfolio struct {
	ID    string           `json:"id"`
	Name  string           `json:"name"`
	Icon  string           `json:"icon"`
	Color string           `json:"color"`
	Slug  string           `json:"slug"`
	Files []app.ExportFile `json:"files"`
}

func (s *Server) exportParts(r *http.Request, only []string) ([]exportPortfolio, []app.ExportPart, error) {
	u, err := s.user(r)
	if err != nil {
		return nil, nil, err
	}
	ps, err := s.store.ListPortfolios(r.Context(), u.ID)
	if err != nil {
		return nil, nil, err
	}
	var list []exportPortfolio
	var parts []app.ExportPart
	for i := range ps {
		p := &ps[i]
		if only != nil && !slices.Contains(only, p.ID) {
			continue
		}
		files, err := s.app.ExportFiles(r.Context(), p)
		if err != nil {
			return nil, nil, err
		}
		list = append(list, exportPortfolio{ID: p.ID, Name: p.Name, Icon: p.Icon, Color: p.Color, Slug: p.Slug, Files: files})
		parts = append(parts, app.ExportPart{Folder: p.Slug, Files: files})
	}
	return list, parts, nil
}

func (s *Server) exportPreview(w http.ResponseWriter, r *http.Request) error {
	list, _, err := s.exportParts(r, nil)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, list)
	return nil
}

func (s *Server) exportZip(w http.ResponseWriter, r *http.Request) error {
	only := r.URL.Query()["p"]
	if len(only) == 0 {
		return fail(http.StatusBadRequest, "choose at least one portfolio")
	}
	_, parts, err := s.exportParts(r, only)
	if err != nil {
		return err
	}
	if len(parts) == 0 {
		return fail(http.StatusNotFound, "none of those portfolios are yours")
	}
	name := "ebenezer-" + app.Today().Format(time.DateOnly) + ".zip"
	if len(parts) == 1 {
		name = "ebenezer-" + parts[0].Folder + "-" + app.Today().Format(time.DateOnly) + ".zip"
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="`+name+`"`)
	return app.WriteZip(w, parts)
}

func (s *Server) editCategory(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	var body struct {
		From string `json:"from"`
		To   string `json:"to"`
		Icon string `json:"icon"`
	}
	if err := readJSON(r, &body); err != nil {
		return err
	}
	to := strings.TrimSpace(body.To)
	if to == "" || utf8.RuneCountInString(to) > 40 {
		return fail(http.StatusBadRequest, "give the category a name of up to 40 characters")
	}
	if !slices.Contains(app.CategoryIcons, body.Icon) {
		return fail(http.StatusBadRequest, "choose one of the icons")
	}
	if to != body.From {
		if err := s.store.RenameSpendCategory(r.Context(), p.ID, body.From, to); err != nil {
			return err
		}
	}
	if err := s.store.SetCategoryIcon(r.Context(), p.ID, to, body.Icon); errors.Is(err, store.ErrNotFound) {
		return fail(http.StatusNotFound, "no such category")
	} else if err != nil {
		return err
	}
	return s.expenses(w, r)
}

func (s *Server) removeCategory(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	var body struct {
		Name string `json:"name"`
		Into string `json:"into"`
	}
	if err := readJSON(r, &body); err != nil {
		return err
	}
	if body.Into == "" {
		err = s.store.EmptyCategory(r.Context(), p.ID, body.Name)
	} else {
		var cats []store.SpendCategory
		if cats, err = s.store.SpendCategories(r.Context(), p.ID); err != nil {
			return err
		}
		if !slices.ContainsFunc(cats, func(c store.SpendCategory) bool { return c.Name == body.Into }) {
			return fail(http.StatusBadRequest, "move them to one of your categories, or to none")
		}
		err = s.store.RenameSpendCategory(r.Context(), p.ID, body.Name, body.Into)
	}
	if err != nil {
		return err
	}
	return s.expenses(w, r)
}

func (s *Server) importCards(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	var body struct {
		Rows []map[string]string `json:"rows"`
	}
	if err := readJSONUpTo(r, &body, 1<<20); err != nil {
		return err
	}
	if len(body.Rows) == 0 || len(body.Rows) > 100 {
		return fail(http.StatusBadRequest, "bring in between 1 and 100 cards at a time")
	}
	have, err := s.store.Cards(r.Context(), p.ID)
	if err != nil {
		return err
	}
	seen := map[string]bool{}
	cardKey := func(c store.Card) string { return strings.ToLower(c.Bank + "\x00" + c.Name) }
	for _, c := range have {
		seen[cardKey(c)] = true
	}
	var cards []store.Card
	skipped := 0
	for i, row := range body.Rows {
		c, err := cardRow(row).card()
		if err != nil {
			var e *apiError
			if errors.As(err, &e) {
				return fail(http.StatusBadRequest, "row %d: %s", i+1, e.message)
			}
			return err
		}
		if seen[cardKey(c)] {
			skipped++
			continue
		}
		seen[cardKey(c)] = true
		cards = append(cards, c)
	}
	for i := range cards {
		if err := s.store.SaveCard(r.Context(), p.ID, &cards[i]); err != nil {
			return err
		}
	}
	writeJSON(w, http.StatusOK, map[string]int{"added": len(cards), "skipped": skipped})
	return nil
}

// cardRow reads an imported row as a card, with blank cells taking what the Add a card form would start with.
func cardRow(row map[string]string) cardBody {
	num := func(k string) *float64 {
		if v, ok := value.Number(row[k]); ok {
			return &v
		}
		return nil
	}
	or := func(v *float64, d float64) float64 {
		if v == nil {
			return d
		}
		return *v
	}
	b := cardBody{Kind: strings.ToLower(strings.TrimSpace(row["kind"])), Bank: row["bank"], Name: row["name"], Nickname: row["nickname"], Network: row["network"],
		Color: strings.TrimSpace(row["color"]), Limit: num("limit"), Interest: num("interest"), AnnualFee: num("annual_fee"),
		StatementBalance: or(num("statement_balance"), 0), Paid: or(num("paid"), 0), SpentBefore: or(num("spent_before"), 0)}
	if b.Kind == "" {
		b.Kind = "credit"
	}
	if !colorPattern.MatchString(b.Color) && b.Color != "metal" {
		b.Color = "#1d2b4f"
	}
	b.StatementDay = int(or(num("statement_day"), 0))
	b.DueDays = int(or(num("due_days"), 20))
	if d, ok := value.Date(row["statement_on"]); ok {
		b.StatementOn = d.Format(time.DateOnly)
	} else if b.StatementDay >= 1 && b.StatementDay <= 31 {
		b.StatementOn = app.LastStatementOn(b.StatementDay, app.Today()).Format(time.DateOnly)
	}
	return b
}
