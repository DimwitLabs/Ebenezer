package app

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"slices"
	"strings"
	"time"

	"github.com/DimwitLabs/ebenezer/internal/news"
	"github.com/DimwitLabs/ebenezer/internal/openrouter"
	"github.com/DimwitLabs/ebenezer/internal/store"
)

var CategoryIcons = []string{
	"restaurant", "local_cafe", "fastfood", "shopping_cart", "local_taxi", "directions_car", "local_gas_station", "flight", "train",
	"hotel", "bolt", "water_drop", "wifi", "smartphone", "home", "chair", "cleaning_services", "shopping_bag", "checkroom",
	"medical_services", "local_pharmacy", "fitness_center", "spa", "school", "menu_book", "movie", "sports_esports", "music_note",
	"pets", "child_care", "redeem", "volunteer_activism", "receipt_long", "subscriptions", "build", "local_laundry_service",
	"content_cut", "celebration", "account_balance", "category",
}

type ChatTurn struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatResult struct {
	Reply     string        `json:"reply"`
	Saved     []store.Spend `json:"saved"`
	Effects   []string      `json:"effects"`
	Asking    []string      `json:"asking"`
	NewNames  []string      `json:"newCategories"`
	OfferTidy bool          `json:"offerTidy"`
	Expenses  *Expenses     `json:"expenses"`
}

const spendRules = `You keep the expense ledger in Ebenezer, a personal finance app in India. The person tells you what they
spent in plain words, or asks about their spending. Reply with JSON only:
{"spends": [{"day": "YYYY-MM-DD", "item": "...", "amount": 0, "category": "...", "icon": "...", "paid_with": "..."}], "reply": "..."}

spends: one entry per spend the message states with an amount. Leave it empty for questions and anything unclear.
- day: the date it happened. "last night" and "yesterday" are the day before today; no date means today. Never a future day.
- item: the merchant or what it was, short and in title case, like "Swiggy" or "Uber, to office".
- amount: rupees as a plain number. A refund or cashback is negative.
- category: a broad bucket a person budgets by, like Food, Groceries, Transport, Bills, Rent, Shopping, Electronics,
  Health or Travel. Use one of the person's categories whenever the spend fits it even loosely: a phone goes in Electronics,
  electricity or internet in Bills. Make a new one only when none fits, in one or two plain words, and never one named after
  the item or that is a kind of a category they already have.
- icon: for a new category, one of the icon names given; for an existing one, its icon.
- paid_with: exactly one of the payment names given, or a nickname of one, when the person said how they paid; otherwise "".
  Never guess it from habit, and when they name a card or account that is not in the list, use "" rather than another
  one, even one from the same bank.
reply: for a question, the answer from the facts below, in under 80 words, money written the Indian way. For spends, "".
If an amount is missing or a message is unclear, put nothing in spends and ask one short question in reply.
Never give investment advice.`

type chatSpend struct {
	Day      string  `json:"day"`
	Item     string  `json:"item"`
	Amount   float64 `json:"amount"`
	Category string  `json:"category"`
	Icon     string  `json:"icon"`
	PaidWith string  `json:"paid_with"`
}

func methodKey(ms []Method, name string) string {
	n := strings.ToLower(strings.TrimSpace(name))
	if n == "" {
		return ""
	}
	for _, m := range ms {
		if strings.ToLower(m.Name) == n || (m.Also != "" && strings.ToLower(m.Also) == n) {
			return m.Key
		}
	}
	return ""
}

// cleanSpends turns the model's spends into ones to save; the model only reads the words, so amounts, days and payment names are checked again here before anything is saved.
func cleanSpends(raw []chatSpend, e *Expenses, today time.Time) ([]store.Spend, []store.SpendCategory) {
	known := map[string]store.SpendCategory{}
	for _, c := range e.Categories {
		known[strings.ToLower(c.Name)] = c
	}
	var out []store.Spend
	var fresh []store.SpendCategory
	asks := len(e.Methods) > 1
	for _, r := range raw {
		item := strings.TrimSpace(r.Item)
		if item == "" || r.Amount == 0 || math.Abs(r.Amount) >= 1e8 || len(item) > 120 {
			continue
		}
		d, err := time.Parse(time.DateOnly, r.Day)
		if err != nil || d.After(today) || d.Year() < 2000 {
			d = today
		}
		cat := news.Cut(strings.TrimSpace(r.Category), 40)
		if c, ok := known[strings.ToLower(cat)]; ok {
			cat = c.Name
		} else if cat != "" {
			icon := r.Icon
			if !slices.Contains(CategoryIcons, icon) {
				icon = "category"
			}
			c := store.SpendCategory{Name: cat, Icon: icon}
			known[strings.ToLower(cat)] = c
			fresh = append(fresh, c)
		}
		key := methodKey(e.Methods, r.PaidWith)
		out = append(out, store.Spend{Day: d, Item: item, Amount: math.Round(r.Amount*100) / 100, Category: cat, PaidWith: key, Asking: key == "" && asks})
	}
	return out, fresh
}

func (a *App) SpendChat(ctx context.Context, p *store.Portfolio, message string, history []ChatTurn) (*ChatResult, error) {
	key := a.Secret(ctx, OpenRouterKey)
	if key == "" {
		return nil, ErrNoAI
	}
	is, err := a.Store.InstanceSettings(ctx)
	if err != nil {
		return nil, err
	}
	e, err := a.Expenses(ctx, p)
	if err != nil {
		return nil, err
	}
	today := Today()
	var ctxText strings.Builder
	ctxText.WriteString("Payment names: ")
	for i, m := range e.Methods {
		if i > 0 {
			ctxText.WriteString(", ")
		}
		ctxText.WriteString(m.Name)
		if m.Also != "" {
			ctxText.WriteString(" (also called " + m.Also + ")")
		}
	}
	ctxText.WriteString("\nTheir categories, with icons: ")
	for i, c := range e.Categories {
		if i > 0 {
			ctxText.WriteString(", ")
		}
		ctxText.WriteString(c.Name + " (" + c.Icon + ")")
	}
	ctxText.WriteString("\nIcon names for a new category: " + strings.Join(CategoryIcons, ", "))
	ctxText.WriteString("\n\nThe facts:\n" + expenseFacts(e, today))
	recent := e.Spends
	if len(recent) > 40 {
		recent = recent[:40]
	}
	ctxText.WriteString("Latest spends:\n")
	for _, sp := range recent {
		fmt.Fprintf(&ctxText, "- %s %s %s %s %s\n", sp.Day.Format("2 Jan"), sp.Item, Rupees(sp.Amount), sp.Category, e.MethodName(sp.PaidWith))
	}
	msgs := []openrouter.Message{{Role: "system", Content: Persona(p.Settings.Voice) + "\n" + spendRules + "\n\n" + ctxText.String()}}
	if len(history) > 8 {
		history = history[len(history)-8:]
	}
	for _, h := range history {
		if (h.Role == "user" || h.Role == "assistant") && h.Content != "" {
			msgs = append(msgs, openrouter.Message{Role: h.Role, Content: news.Cut(h.Content, 1000)})
		}
	}
	msgs = append(msgs, openrouter.Message{Role: "user", Content: message})
	text, err := a.ai(key).Chat(ctx, openrouter.Request{Model: ModelFor(is, p), Messages: msgs, Temperature: 0.1, MaxTokens: 2000, JSON: true})
	if err != nil {
		return nil, err
	}
	var got struct {
		Spends []chatSpend `json:"spends"`
		Reply  string      `json:"reply"`
	}
	if err := json.Unmarshal([]byte(text), &got); err != nil {
		return nil, fmt.Errorf("I couldn't read the model's answer; try saying it again")
	}
	spends, fresh := cleanSpends(got.Spends, e, today)
	res := &ChatResult{Reply: strings.TrimSpace(got.Reply), Saved: []store.Spend{}, Effects: []string{}, Asking: []string{}, NewNames: []string{}}
	if len(spends) > 0 {
		if err := a.Store.AddSpendCategories(ctx, p.ID, fresh); err != nil {
			return nil, err
		}
		if err := a.Store.AddSpends(ctx, p.ID, spends); err != nil {
			return nil, err
		}
		res.Saved = spends
		for _, c := range fresh {
			res.NewNames = append(res.NewNames, c.Name)
		}
		for _, sp := range spends {
			if sp.Asking {
				res.Asking = append(res.Asking, sp.ID)
			}
		}
		res.OfferTidy = len(fresh) > 0 && len(e.Categories)+len(fresh) >= 6
	}
	after, err := a.Expenses(ctx, p)
	if err != nil {
		return nil, err
	}
	res.Effects = Effects(after, spends)
	res.Expenses = after
	return res, nil
}

func Effects(e *Expenses, spends []store.Spend) []string {
	out := []string{}
	done := map[string]bool{}
	for _, sp := range spends {
		if sp.PaidWith == "" || done[sp.PaidWith] {
			continue
		}
		done[sp.PaidWith] = true
		for _, c := range e.Cards {
			if "card:"+c.ID == sp.PaidWith {
				out = append(out, fmt.Sprintf("%s's statement closes %s at %s so far", c.Name, inDays(days(Today(), c.NextStatement)), Rupees(c.Cycle)))
			}
		}
		for _, acc := range e.Accounts {
			if acc.Key == sp.PaidWith {
				out = append(out, fmt.Sprintf("%s is now %s", acc.Name, Rupees(acc.Balance)))
			}
		}
	}
	return out
}

type TidyChange struct {
	Kind  string   `json:"kind"`
	From  string   `json:"from"`
	To    string   `json:"to"`
	Item  string   `json:"item,omitempty"`
	Count int      `json:"count"`
	IDs   []string `json:"ids,omitempty"`
}

type TidyProposal struct {
	Summary string       `json:"summary"`
	Changes []TidyChange `json:"changes"`
}

const categoryTidyPrompt = `You tidy one person's expense categories in Ebenezer, a personal finance app. They grew one chat at a
time, so they can hold near-duplicates ("Uber" and "Cabs"), categories too narrow to budget by ("Phones" beside "Electronics",
"Electricity" for one bill), vague names ("Misc", "Stuff"), and spends filed in the wrong place. Good categories are broad buckets
a person budgets by, like Food, Transport, Bills, Shopping or Electronics. Suggest the changes that get them there; when they
already are, an empty list is right.

Reply with JSON only:
{"summary": "...", "joins": [{"from": "...", "into": "..."}], "renames": [{"from": "...", "to": "..."}], "moves": [{"item": "...", "from": "...", "to": "..."}]}
- summary: one or two plain sentences saying what the changes would do if accepted, written before anything has changed, or that nothing needs changing.
- joins: two existing categories that mean the same thing, or a narrower one into a broader one it is a kind of ("Phones" into
  "Electronics"); "into" is the one to keep.
- renames: an existing category whose name is vague or too narrow, with a broader name of one or two words ("Electricity" to "Bills").
- moves: an item, written exactly as listed, that sits in the wrong category, and the existing category it belongs in.
Use category names and items exactly as written. Each category may appear in at most one join or rename.`

func (a *App) TidyCategories(ctx context.Context, p *store.Portfolio, feedback string, previous []TidyChange) (TidyProposal, error) {
	key := a.Secret(ctx, OpenRouterKey)
	if key == "" {
		return TidyProposal{}, ErrNoAI
	}
	is, err := a.Store.InstanceSettings(ctx)
	if err != nil {
		return TidyProposal{}, err
	}
	spends, err := a.Store.Spends(ctx, p.ID)
	if err != nil {
		return TidyProposal{}, err
	}
	type group struct {
		count int
		items map[string][]string
	}
	cats := map[string]*group{}
	var names []string
	for _, sp := range spends {
		g := cats[sp.Category]
		if g == nil {
			g = &group{items: map[string][]string{}}
			cats[sp.Category] = g
			names = append(names, sp.Category)
		}
		g.count++
		g.items[sp.Item] = append(g.items[sp.Item], sp.ID)
	}
	if len(names) == 0 {
		return TidyProposal{Summary: "There are no spends to tidy yet.", Changes: []TidyChange{}}, nil
	}
	slices.Sort(names)
	var b strings.Builder
	for _, n := range names {
		g := cats[n]
		items := make([]string, 0, len(g.items))
		for it := range g.items {
			items = append(items, it)
		}
		slices.SortFunc(items, func(x, y string) int { return len(g.items[y]) - len(g.items[x]) })
		if len(items) > 12 {
			items = items[:12]
		}
		label := n
		if label == "" {
			label = "(no category)"
		}
		fmt.Fprintf(&b, "%s, %d spends: %s\n", label, g.count, strings.Join(items, "; "))
	}
	user := "The categories, with their most common items:\n" + b.String()
	if len(previous) > 0 {
		raw, _ := json.Marshal(previous)
		user += "\nYou suggested before: " + string(raw)
	}
	if feedback = strings.TrimSpace(feedback); feedback != "" {
		user += "\nThe person replied: " + feedback + "\nSuggest again with that in mind."
	}
	text, err := a.ai(key).Chat(ctx, openrouter.Request{Model: ModelFor(is, p), Temperature: 0.2, MaxTokens: 2500, JSON: true,
		Messages: []openrouter.Message{{Role: "system", Content: categoryTidyPrompt}, {Role: "user", Content: user}}})
	if err != nil {
		return TidyProposal{}, err
	}
	var got struct {
		Summary string `json:"summary"`
		Joins   []struct {
			From string `json:"from"`
			Into string `json:"into"`
		} `json:"joins"`
		Renames []struct {
			From string `json:"from"`
			To   string `json:"to"`
		} `json:"renames"`
		Moves []struct {
			Item string `json:"item"`
			From string `json:"from"`
			To   string `json:"to"`
		} `json:"moves"`
	}
	if err := json.Unmarshal([]byte(text), &got); err != nil {
		return TidyProposal{}, fmt.Errorf("I couldn't read the model's answer; try again")
	}
	out := TidyProposal{Summary: strings.TrimSpace(got.Summary), Changes: []TidyChange{}}
	used := map[string]bool{}
	for _, j := range got.Joins {
		if cats[j.From] == nil || cats[j.Into] == nil || j.From == j.Into || j.From == "" || used[j.From] || used[j.Into] {
			continue
		}
		used[j.From], used[j.Into] = true, true
		out.Changes = append(out.Changes, TidyChange{Kind: "join", From: j.From, To: j.Into, Count: cats[j.From].count})
	}
	for _, r := range got.Renames {
		to := strings.TrimSpace(r.To)
		if cats[r.From] == nil || r.From == "" || to == "" || len(to) > 40 || to == r.From || used[r.From] {
			continue
		}
		used[r.From] = true
		out.Changes = append(out.Changes, TidyChange{Kind: "rename", From: r.From, To: to, Count: cats[r.From].count})
	}
	for _, m := range got.Moves {
		g := cats[m.From]
		if g == nil || cats[m.To] == nil || m.From == m.To || len(g.items[m.Item]) == 0 {
			continue
		}
		out.Changes = append(out.Changes, TidyChange{Kind: "move", From: m.From, To: m.To, Item: m.Item, Count: len(g.items[m.Item]), IDs: g.items[m.Item]})
	}
	if out.Summary == "" {
		out.Summary = "Nothing needs changing."
	}
	return out, nil
}

// ApplyTidy checks each change against the ledger as it is now and skips one that no longer fits.
func (a *App) ApplyTidy(ctx context.Context, p *store.Portfolio, changes []TidyChange) (int, error) {
	done := 0
	for _, c := range changes {
		to := strings.TrimSpace(c.To)
		if to == "" || len(to) > 40 {
			continue
		}
		switch c.Kind {
		case "join", "rename":
			if c.From == "" || c.From == to {
				continue
			}
			if err := a.Store.RenameSpendCategory(ctx, p.ID, c.From, to); err != nil {
				return done, err
			}
			done++
		case "move":
			if len(c.IDs) == 0 {
				continue
			}
			if _, err := a.Store.MoveSpends(ctx, p.ID, c.IDs, to); err != nil {
				return done, err
			}
			done++
		}
	}
	return done, nil
}

type CardTerms struct {
	Found     bool     `json:"found"`
	Interest  *float64 `json:"interest"`
	AnnualFee *float64 `json:"annualFee"`
	DueDays   *int     `json:"dueDays"`
	LateFee   string   `json:"lateFee"`
	Source    string   `json:"source"`
}

const termsPrompt = `Find the standard published terms of one Indian credit or charge card on the issuer's own website.
Reply with JSON only: {"found": true, "interest": 3.75, "annual_fee": 2500, "due_days": 20, "late_fee": "up to ₹1,300", "source": "hdfcbank.com"}
interest is the finance charge in percent a month, annual_fee in rupees before GST, due_days the days from statement to
payment due. Use null for anything you cannot find, and "found": false if you do not know the card. source is the website
the terms came from, as a bare domain. Never guess.`

// LookUpTerms asks the model for a card's terms; ":online" lets it read the issuer's site, and models without web search answer from what they know.
func (a *App) LookUpTerms(ctx context.Context, p *store.Portfolio, bank, card string) (CardTerms, error) {
	key := a.Secret(ctx, OpenRouterKey)
	if key == "" {
		return CardTerms{}, ErrNoAI
	}
	is, err := a.Store.InstanceSettings(ctx)
	if err != nil {
		return CardTerms{}, err
	}
	model := ModelFor(is, p)
	req := openrouter.Request{Temperature: 0, MaxTokens: 600, JSON: true,
		Messages: []openrouter.Message{{Role: "system", Content: termsPrompt}, {Role: "user", Content: bank + " " + card}}}
	req.Model = model + ":online"
	text, err := a.ai(key).Chat(ctx, req)
	if err != nil {
		req.Model = model
		if text, err = a.ai(key).Chat(ctx, req); err != nil {
			return CardTerms{}, err
		}
	}
	var got struct {
		Found     bool     `json:"found"`
		Interest  *float64 `json:"interest"`
		AnnualFee *float64 `json:"annual_fee"`
		DueDays   *int     `json:"due_days"`
		LateFee   string   `json:"late_fee"`
		Source    string   `json:"source"`
	}
	if err := json.Unmarshal([]byte(text), &got); err != nil {
		return CardTerms{}, fmt.Errorf("I couldn't read the model's answer; try again")
	}
	t := CardTerms{Found: got.Found, LateFee: strings.TrimSpace(got.LateFee), Source: strings.TrimSpace(got.Source)}
	if got.Interest != nil && *got.Interest > 0 && *got.Interest < 10 {
		t.Interest = got.Interest
	}
	if got.AnnualFee != nil && *got.AnnualFee >= 0 && *got.AnnualFee < 1e6 {
		t.AnnualFee = got.AnnualFee
	}
	if got.DueDays != nil && *got.DueDays >= 1 && *got.DueDays <= 60 {
		t.DueDays = got.DueDays
	}
	t.Found = t.Found && (t.Interest != nil || t.AnnualFee != nil || t.DueDays != nil)
	return t, nil
}

var iconWords = []struct {
	icon  string
	words []string
}{
	{"restaurant", []string{"food", "restaurant", "dining", "eating", "meal", "swiggy", "zomato", "delivery"}},
	{"local_cafe", []string{"coffee", "cafe", "tea", "chai"}},
	{"shopping_cart", []string{"grocer", "supermarket", "kirana", "vegetable"}},
	{"local_taxi", []string{"cab", "taxi", "uber", "ola", "auto", "ride"}},
	{"local_gas_station", []string{"fuel", "petrol", "diesel", "gas"}},
	{"directions_car", []string{"car", "parking", "toll", "vehicle"}},
	{"flight", []string{"travel", "flight", "trip", "holiday", "vacation"}},
	{"train", []string{"train", "metro", "bus", "commute", "transport"}},
	{"hotel", []string{"hotel", "stay"}},
	{"bolt", []string{"bill", "utilit", "electric", "power"}},
	{"wifi", []string{"internet", "broadband", "wifi"}},
	{"smartphone", []string{"phone", "mobile", "recharge"}},
	{"home", []string{"rent", "home", "house", "maintenance"}},
	{"cleaning_services", []string{"household", "cleaning", "help", "maid"}},
	{"shopping_bag", []string{"shop", "amazon", "flipkart"}},
	{"checkroom", []string{"cloth", "apparel", "fashion"}},
	{"medical_services", []string{"health", "medical", "doctor", "hospital"}},
	{"local_pharmacy", []string{"pharma", "medicine"}},
	{"fitness_center", []string{"gym", "fitness", "sport"}},
	{"school", []string{"education", "school", "course", "tuition", "fees"}},
	{"movie", []string{"movie", "entertain", "cinema", "fun"}},
	{"subscriptions", []string{"subscri", "netflix", "spotify", "ott"}},
	{"pets", []string{"pet", "dog", "cat"}},
	{"child_care", []string{"kid", "child", "baby"}},
	{"redeem", []string{"gift"}},
	{"volunteer_activism", []string{"donat", "charity"}},
	{"content_cut", []string{"salon", "haircut", "grooming", "beauty"}},
	{"account_balance", []string{"emi", "loan", "insurance", "tax", "invest"}},
}

func IconFor(category string) string {
	c := strings.ToLower(category)
	for _, iw := range iconWords {
		for _, w := range iw.words {
			if strings.Contains(c, w) {
				return iw.icon
			}
		}
	}
	return "category"
}
