package app

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/DimwitLabs/ebenezer/internal/store"
	"github.com/DimwitLabs/ebenezer/internal/value"
)

const Cash = "cash"

type Method struct {
	Key  string `json:"key"`
	Name string `json:"name"`
	Kind string `json:"kind"`
	Also string `json:"also,omitempty"`
}

type Account struct {
	Key     string     `json:"key"`
	Name    string     `json:"name"`
	Set     float64    `json:"set"`
	AsOf    *time.Time `json:"asOf"`
	Spent   float64    `json:"spent"`
	Balance float64    `json:"balance"`
}

type ExpenseOverview struct {
	Month       string     `json:"month"`
	LastMonth   string     `json:"lastMonth"`
	Total       float64    `json:"total"`
	Count       int        `json:"count"`
	Through     *time.Time `json:"through"`
	LastSoFar   float64    `json:"lastSoFar"`
	Usual       float64    `json:"usual"`
	BillsToCome float64    `json:"billsToCome"`
	Bills       []string   `json:"bills"`
	OnCards     float64    `json:"onCards"`
}

type Expenses struct {
	Spends     []store.Spend         `json:"spends"`
	Categories []store.SpendCategory `json:"categories"`
	Methods    []Method              `json:"methods"`
	Cards      []CardState           `json:"cards"`
	Accounts   []Account             `json:"accounts"`
	Overview   ExpenseOverview       `json:"overview"`
	Note       Note                  `json:"note"`
	CardNote   Note                  `json:"cardNote"`
	Imports    []store.SpendImport   `json:"imports"`
	Icons      []string              `json:"icons"`
}

// spentFrom totals spends paid from key after since; a balance is what the person set on its day, so spends paid from it after that day come off it.
func spentFrom(key string, since time.Time, spends []store.Spend) float64 {
	total := 0.0
	for _, sp := range spends {
		if sp.PaidWith == key && sp.Day.After(since) {
			total += sp.Amount
		}
	}
	return total
}

func balanceSince(r store.Row, data map[string]any) time.Time {
	if d, ok := value.Date(data["as_of"]); ok {
		return d
	}
	return time.Date(r.CreatedAt.Year(), r.CreatedAt.Month(), r.CreatedAt.Day(), 0, 0, 0, 0, time.UTC)
}

func (a *App) accounts(ctx context.Context, portfolioID string, spends []store.Spend) ([]Account, error) {
	secs, err := a.Store.Sections(ctx, portfolioID)
	if err != nil {
		return nil, err
	}
	out := []Account{}
	for _, sec := range secs {
		if sec.Kind != "savings" {
			continue
		}
		rows, err := a.Store.Rows(ctx, sec.ID)
		if err != nil {
			return nil, err
		}
		for _, r := range rows {
			var data map[string]any
			if json.Unmarshal(r.Data, &data) != nil {
				continue
			}
			set, _ := value.Number(data["balance"])
			acc := Account{Key: "account:" + r.ID, Name: value.Text(data["account"]), Set: set}
			if d, ok := value.Date(data["as_of"]); ok {
				acc.AsOf = &d
			}
			acc.Spent = spentFrom(acc.Key, balanceSince(r, data), spends)
			acc.Balance = set - acc.Spent
			out = append(out, acc)
		}
	}
	return out, nil
}

func deductSpends(rows []store.Row, spends []store.Spend) []map[string]any {
	out := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		var data map[string]any
		if json.Unmarshal(r.Data, &data) != nil {
			continue
		}
		if spent := spentFrom("account:"+r.ID, balanceSince(r, data), spends); spent != 0 {
			set, _ := value.Number(data["balance"])
			data["balance"] = set - spent
		}
		out = append(out, data)
	}
	return out
}

func methods(cards []store.Card, accounts []Account) []Method {
	out := []Method{}
	for _, c := range cards {
		out = append(out, Method{Key: "card:" + c.ID, Name: c.Name, Kind: "card", Also: c.Nickname})
	}
	for _, acc := range accounts {
		out = append(out, Method{Key: acc.Key, Name: acc.Name, Kind: "account"})
	}
	return append(out, Method{Key: Cash, Name: "Cash", Kind: Cash})
}

func monthStart(d time.Time) time.Time {
	return time.Date(d.Year(), d.Month(), 1, 0, 0, 0, 0, time.UTC)
}

func median(xs []float64) float64 {
	if len(xs) == 0 {
		return 0
	}
	s := append([]float64(nil), xs...)
	sort.Float64s(s)
	n := len(s)
	if n%2 == 1 {
		return s[n/2]
	}
	return (s[n/2-1] + s[n/2]) / 2
}

var notWords = regexp.MustCompile(`[^a-z ]+`)

// billKey keys a bill by its first two words, so "Airtel postpaid Sep" and "Airtel postpaid Oct" are one bill.
func billKey(item string) string {
	words := strings.Fields(notWords.ReplaceAllString(strings.ToLower(item), " "))
	if len(words) > 2 {
		words = words[:2]
	}
	return strings.Join(words, " ")
}

func overview(spends []store.Spend, cards []CardState, today time.Time) ExpenseOverview {
	this := monthStart(today)
	last := this.AddDate(0, -1, 0)
	lastCut := statementOn(last.Year(), last.Month(), today.Day())
	o := ExpenseOverview{Month: this.Format("January"), LastMonth: last.Format("January"), Bills: []string{}}
	months := map[time.Time]float64{}
	seen := map[string]map[time.Time][]float64{}
	now := map[string]bool{}
	for _, sp := range spends {
		m := monthStart(sp.Day)
		switch {
		case !sp.Day.Before(this) && !sp.Day.After(today):
			o.Total += sp.Amount
			o.Count++
			if o.Through == nil || sp.Day.After(*o.Through) {
				d := sp.Day
				o.Through = &d
			}
			now[billKey(sp.Item)] = true
		case !sp.Day.Before(last) && !sp.Day.After(lastCut):
			o.LastSoFar += sp.Amount
		}
		if m.Before(this) && !m.Before(this.AddDate(0, -6, 0)) {
			months[m] += sp.Amount
		}
		if m.Before(this) && !m.Before(this.AddDate(0, -3, 0)) && sp.Amount > 0 {
			k := billKey(sp.Item)
			if seen[k] == nil {
				seen[k] = map[time.Time][]float64{}
			}
			seen[k][m] = append(seen[k][m], sp.Amount)
		}
	}
	var totals []float64
	for _, t := range months {
		totals = append(totals, t)
	}
	o.Usual = median(totals)
	for k, byMonth := range seen {
		if len(byMonth) < 2 || now[k] || k == "" {
			continue
		}
		var amounts []float64
		for _, xs := range byMonth {
			if len(xs) != 1 {
				amounts = nil
				break
			}
			amounts = append(amounts, xs[0])
		}
		if len(amounts) < 2 {
			continue
		}
		o.BillsToCome += median(amounts)
		o.Bills = append(o.Bills, k)
	}
	sort.Strings(o.Bills)
	for _, c := range cards {
		o.OnCards += c.Cycle
	}
	return o
}

func (a *App) Expenses(ctx context.Context, p *store.Portfolio) (*Expenses, error) {
	spends, err := a.Store.Spends(ctx, p.ID)
	if err != nil {
		return nil, err
	}
	cats, err := a.Store.SpendCategories(ctx, p.ID)
	if err != nil {
		return nil, err
	}
	cards, err := a.Store.Cards(ctx, p.ID)
	if err != nil {
		return nil, err
	}
	accounts, err := a.accounts(ctx, p.ID, spends)
	if err != nil {
		return nil, err
	}
	imports, err := a.Store.SpendImports(ctx, p.ID)
	if err != nil {
		return nil, err
	}
	today := Today()
	e := &Expenses{Spends: spends, Categories: cats, Accounts: accounts, Methods: methods(cards, accounts), Imports: imports, Cards: []CardState{}, Icons: CategoryIcons}
	for _, c := range cards {
		e.Cards = append(e.Cards, StateOf(c, spends, today))
	}
	e.Overview = overview(spends, e.Cards, today)
	e.Note = expenseNote(e, today)
	e.CardNote = cardNote(e, today)
	return e, nil
}

func (a *App) cardsOwed(ctx context.Context, portfolioID string, spends []store.Spend) (float64, error) {
	cards, err := a.Store.Cards(ctx, portfolioID)
	if err != nil {
		return 0, err
	}
	owed := 0.0
	for _, c := range cards {
		owed += StateOf(c, spends, Today()).Owed
	}
	return owed, nil
}

func (e *Expenses) MethodName(key string) string {
	for _, m := range e.Methods {
		if m.Key == key {
			return m.Name
		}
	}
	return ""
}

func days(from, to time.Time) int { return int(math.Round(to.Sub(from).Hours() / 24)) }

func expenseNote(e *Expenses, today time.Time) Note {
	n := Note{Lines: []NoteLine{}}
	add := func(icon, text, target string) {
		n.Lines = append(n.Lines, NoteLine{Icon: icon, Text: text, Section: target})
	}
	o := e.Overview
	this, last := monthStart(today), monthStart(today).AddDate(0, -1, 0)
	lastCut := statementOn(last.Year(), last.Month(), today.Day())
	now, before := map[string]float64{}, map[string]float64{}
	items := map[string]map[string]int{}
	for _, sp := range e.Spends {
		switch {
		case !sp.Day.Before(this) && !sp.Day.After(today):
			now[sp.Category] += sp.Amount
			if items[sp.Category] == nil {
				items[sp.Category] = map[string]int{}
			}
			items[sp.Category][billKey(sp.Item)]++
		case !sp.Day.Before(last) && !sp.Day.After(lastCut):
			before[sp.Category] += sp.Amount
		}
	}
	var lead, leadCat string
	best := 0.0
	for c, v := range now {
		if c == "" {
			continue
		}
		if up := v - before[c]; before[c] > 0 && up > best && up > 0.1*before[c] {
			best, leadCat = up, c
			lead = fmt.Sprintf("%s is up %s on %s, and is now %s of everything you spend.", c, Rupees(up), o.LastMonth, PlainPct(v/math.Max(1, o.Total), 0))
		}
	}
	if lead == "" {
		for c, v := range now {
			if c != "" && v > best {
				best, leadCat = v, c
				lead = fmt.Sprintf("%s is your biggest spend this month at %s, %s of everything.", c, Rupees(v), PlainPct(v/math.Max(1, o.Total), 0))
			}
		}
	}
	if lead != "" {
		add("trending_up", lead, "category:"+leadCat)
		top, count := "", 0
		for k, c := range items[leadCat] {
			if c > count || (c == count && k < top) {
				top, count = k, c
			}
		}
		if count >= 3 {
			add("receipt_long", fmt.Sprintf("Most of it is %s, %d times this month.", top, count), "")
		}
	}
	asking := 0
	for _, sp := range e.Spends {
		if sp.Asking {
			asking++
		}
	}
	if asking > 0 {
		verb := "need"
		if asking == 1 {
			verb = "needs"
		}
		add("help", fmt.Sprintf("%s still %s how you paid. Tap the chip in the ledger to say.", plural(asking, "spend", "spends"), verb), "asking")
	}
	if c := soonestClosing(e.Cards, today, 7); c != nil {
		add("credit_card", closingLine(*c, today), "card:"+c.ID)
	}
	for _, acc := range e.Accounts {
		if acc.Spent > 0 {
			add("account_balance", fmt.Sprintf("%s is at %s after the spends since you set it.", acc.Name, Short(acc.Balance)), "")
		}
	}
	switch {
	case len(e.Spends) == 0:
		n.Lead = "Tell me what you spent and the ledger starts."
	case len(n.Lines) == 0:
		n.Lead = "Not much to say yet. Here's what I'll tell you as the ledger grows."
	}
	n.Lines = append(n.Lines, expensesToCome(e, today, 3-len(n.Lines))...)
	n.Sees = expenseFacts(e, today)
	return n
}

// expensesToCome lists lines said only while they are true, so each goes once the ledger has what it needs.
func expensesToCome(e *Expenses, today time.Time, room int) []NoteLine {
	var out []NoteLine
	add := func(icon, text, target string) {
		if len(out) < room {
			out = append(out, NoteLine{Icon: icon, Text: text, Section: target})
		}
	}
	first := today
	unpaid := 0
	for _, sp := range e.Spends {
		if sp.Day.Before(first) {
			first = sp.Day
		}
		if sp.PaidWith == "" && !sp.Asking {
			unpaid++
		}
	}
	if e.Overview.Usual == 0 {
		add("calendar_month", fmt.Sprintf("Once %s is behind you, I'll say how each month compares with your usual one.", e.Overview.Month), "")
	}
	if days(first, today) < 28 {
		add("bubble_chart", "After a few weeks of spends, Trends shows which categories are habits and which are one-offs.", "")
	}
	if len(e.Overview.Bills) == 0 && days(first, today) < 60 {
		add("event_repeat", "Bills that come every month, like rent or electricity, show here once I have seen two months of them.", "")
	}
	if len(e.Cards) == 0 {
		add("credit_card", "Add a card and I'll tell you when its statement closes and what is due.", "cards")
	}
	if len(e.Accounts) == 0 {
		add("account_balance", "Add your bank accounts under Portfolio, and spends paid from them come off the balance.", "portfolio")
	} else if unpaid > 0 {
		add("payments", "Say how you paid, like on a card or from an account, and I'll keep its balance right.", "")
	}
	return out
}

func soonestClosing(cards []CardState, today time.Time, within int) *CardState {
	var best *CardState
	for i := range cards {
		c := &cards[i]
		if d := days(today, c.NextStatement); d <= within && c.Cycle > 0 && (best == nil || c.NextStatement.Before(best.NextStatement)) {
			best = c
		}
	}
	return best
}

func closingLine(c CardState, today time.Time) string {
	s := fmt.Sprintf("%s's statement closes %s at %s", c.Name, inDays(days(today, c.NextStatement)), Rupees(c.Cycle))
	if c.Limit != nil && *c.Limit > 0 {
		return s + fmt.Sprintf(", with %s of its limit used.", PlainPct(c.Owed / *c.Limit, 0))
	}
	return s + "."
}

func cardNote(e *Expenses, today time.Time) Note {
	n := Note{Lines: []NoteLine{}}
	add := func(icon, text, target string) {
		n.Lines = append(n.Lines, NoteLine{Icon: icon, Text: text, Section: target})
	}
	var due *CardState
	dues := 0.0
	for i := range e.Cards {
		c := &e.Cards[i]
		if c.Unpaid <= 0 {
			continue
		}
		if today.After(c.Due) {
			add("schedule", fmt.Sprintf("%s's %s was due on %s. Mark it paid once it is.", c.Name, Rupees(c.Unpaid), c.Due.Format("2 Jan")), "card:"+c.ID)
			continue
		}
		dues += c.Unpaid
		if due == nil || c.Unpaid > due.Unpaid {
			due = c
		}
	}
	if due != nil {
		full := ""
		if due.Kind == "charge" {
			full = " in full"
		}
		n.Lines = append([]NoteLine{{Icon: "event", Text: fmt.Sprintf("%s's %s is due%s on %s, %s.", due.Name, Rupees(due.Unpaid), full, due.Due.Format("2 Jan"), inDays(days(today, due.Due))), Section: "card:" + due.ID}}, n.Lines...)
	}
	if c := soonestClosing(e.Cards, today, 7); c != nil {
		add("event_upcoming", closingLine(*c, today), "card:"+c.ID)
	}
	saved := 0.0
	for _, acc := range e.Accounts {
		saved += acc.Balance
	}
	if dues > 0 && len(e.Accounts) > 0 {
		if saved >= dues {
			add("savings", fmt.Sprintf("Your savings, %s, cover every card bill now due.", Short(saved)), "")
		} else {
			add("savings", fmt.Sprintf("Card bills due come to %s, more than the %s in savings.", Short(dues), Short(saved)), "")
		}
	}
	switch {
	case len(e.Cards) == 0:
		n.Lead = "Add a card and I'll keep its statements and dues."
	case len(n.Lines) == 0:
		n.Lead = "Nothing is due on your cards right now."
	}
	n.Lines = append(n.Lines, cardsToCome(e, 4-len(n.Lines))...)
	n.Sees = expenseFacts(e, today)
	return n
}

func cardsToCome(e *Expenses, room int) []NoteLine {
	var out []NoteLine
	add := func(icon, text, target string) {
		if len(out) < room {
			out = append(out, NoteLine{Icon: icon, Text: text, Section: target})
		}
	}
	if len(e.Cards) == 0 {
		add("event", "Each card's statement day and due date, with a nudge before a bill is due.", "")
		add("data_usage", "How much of each limit you have used this cycle.", "")
		add("chat", "Say what you put on a card in the Expenses chat and it counts towards that card.", "")
		return out
	}
	for _, c := range e.Cards {
		if c.Spends == 0 {
			add("chat", fmt.Sprintf("Tell me what you put on %s in the Expenses chat and its cycle keeps up.", c.Name), "chat")
			break
		}
	}
	if len(e.Accounts) == 0 {
		add("savings", "Add your bank accounts under Portfolio and I'll say whether they cover what is due.", "portfolio")
	}
	add("task_alt", "Mark a bill paid once you have paid it, and the next statement starts clean.", "")
	return out
}

func expenseFacts(e *Expenses, today time.Time) string {
	var b strings.Builder
	o := e.Overview
	fmt.Fprintf(&b, "Today is %s.\n", today.Format("Mon 2 Jan 2006"))
	fmt.Fprintf(&b, "%s so far: %s across %d spends. %s to the same day: %s. A usual month: %s.\n", o.Month, Rupees(o.Total), o.Count, o.LastMonth, Rupees(o.LastSoFar), Rupees(o.Usual))
	byCat := map[string][2]float64{}
	this, last := monthStart(today), monthStart(today).AddDate(0, -1, 0)
	for _, sp := range e.Spends {
		v := byCat[sp.Category]
		switch {
		case !sp.Day.Before(this):
			v[0] += sp.Amount
		case !sp.Day.Before(last):
			v[1] += sp.Amount
		}
		byCat[sp.Category] = v
	}
	names := make([]string, 0, len(byCat))
	for c := range byCat {
		names = append(names, c)
	}
	sort.Slice(names, func(i, j int) bool { return byCat[names[i]][0] > byCat[names[j]][0] })
	b.WriteString("By category, this month and all of last month:\n")
	for _, c := range names {
		if v := byCat[c]; v[0] != 0 || v[1] != 0 {
			name := c
			if name == "" {
				name = "No category"
			}
			fmt.Fprintf(&b, "- %s: %s, last month %s\n", name, Rupees(v[0]), Rupees(v[1]))
		}
	}
	for _, c := range e.Cards {
		limit := "no preset limit"
		if c.Limit != nil {
			limit = "limit " + Rupees(*c.Limit) + ", " + Rupees(*c.Limit-c.Owed) + " left"
		}
		fmt.Fprintf(&b, "Card %s (%s): last statement %s for %s, %s unpaid, due %s; this cycle %s; statement closes %s; %s.\n",
			c.Name, c.Bank, c.LastStatement.Format("2 Jan"), Rupees(c.Billed), Rupees(c.Unpaid), c.Due.Format("2 Jan"), Rupees(c.Cycle), c.NextStatement.Format("2 Jan"), limit)
	}
	for _, acc := range e.Accounts {
		fmt.Fprintf(&b, "Account %s: %s now, after %s spent since it was set.\n", acc.Name, Rupees(acc.Balance), Rupees(acc.Spent))
	}
	return b.String()
}
