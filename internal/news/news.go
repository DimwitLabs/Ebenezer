package news

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/DimwitLabs/ebenezer/internal/market"
	"github.com/DimwitLabs/ebenezer/internal/openrouter"
)

//go:embed judge.json
var defaultJudge []byte

type Judge struct {
	Persona        string            `json:"persona"`
	StaleAfterDays int               `json:"staleAfterDays"`
	ReasonMaxWords int               `json:"reasonMaxWords"`
	Categories     []string          `json:"categories"`
	Verdicts       map[string]string `json:"verdicts"`
	ExtraRules     []string          `json:"extraRules"`
	RoutineFilings []string          `json:"routineFilings"`
}

func DefaultJudge() json.RawMessage { return append(json.RawMessage(nil), defaultJudge...) }

// LoadJudge lays overrides over the defaults so a partial override still works.
func LoadJudge(override json.RawMessage) (Judge, error) {
	var j Judge
	if err := json.Unmarshal(defaultJudge, &j); err != nil {
		return j, err
	}
	if len(override) > 0 && string(override) != "null" {
		if err := json.Unmarshal(override, &j); err != nil {
			return j, fmt.Errorf("judge criteria: %w", err)
		}
	}
	return j, nil
}

type Scrip struct {
	Code     string
	Name     string
	ISIN     string
	BSECode  string
	Quantity float64
}

type Item struct {
	Scrips    []string
	Title     string
	Source    string
	Link      string
	Snippet   string
	Published time.Time
	Routine   bool
	Also      int
	Verdict   string
	About     []string
	Category  string
	Reason    string
}

type Fetcher struct {
	HTTP  *http.Client
	Pause time.Duration

	mu    sync.Mutex
	feeds map[string]*feed
}

// feedFresh is how long a read feed is reused, so portfolios holding the same scrip on the same schedule read it once between them.
const feedFresh = 30 * time.Minute

type feed struct {
	done chan struct{}
	at   time.Time
	body []byte
	err  error
}

// shared reads a feed once for every caller: a second caller for a feed being read waits for that read instead of starting its own.
func (f *Fetcher) shared(ctx context.Context, u string, bse bool) ([]byte, error) {
	f.mu.Lock()
	if f.feeds == nil {
		f.feeds = map[string]*feed{}
	}
	for k, c := range f.feeds {
		if c.at.IsZero() {
			continue
		}
		if time.Since(c.at) > feedFresh {
			delete(f.feeds, k)
		}
	}
	c, ok := f.feeds[u]
	if !ok {
		c = &feed{done: make(chan struct{})}
		f.feeds[u] = c
	}
	f.mu.Unlock()
	if !ok {
		c.body, c.err = f.get(ctx, u, bse)
		f.mu.Lock()
		c.at = time.Now()
		if c.err != nil {
			delete(f.feeds, u)
		}
		f.mu.Unlock()
		close(c.done)
		return c.body, c.err
	}
	select {
	case <-c.done:
		return c.body, c.err
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func NewFetcher() *Fetcher {
	return &Fetcher{HTTP: &http.Client{Timeout: 30 * time.Second}, Pause: 300 * time.Millisecond}
}

func (f *Fetcher) get(ctx context.Context, u string, bse bool) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", market.UserAgent)
	if bse {
		req.Header.Set("Referer", "https://www.bseindia.com/")
		req.Header.Set("Origin", "https://www.bseindia.com")
		req.Header.Set("Accept", "application/json, text/plain, */*")
	}
	resp, err := f.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s returned %s", req.URL.Host, resp.Status)
	}
	return io.ReadAll(io.LimitReader(resp.Body, 8<<20))
}

// Filing reports whether a link is an exchange filing PDF, the only links proxied, since the exchanges refuse a browser coming from another site.
func Filing(link string) bool {
	u, err := url.Parse(link)
	if err != nil || u.Scheme != "https" || !strings.HasSuffix(strings.ToLower(u.Path), ".pdf") {
		return false
	}
	h := strings.ToLower(u.Hostname())
	return h == "www.bseindia.com" || h == "bseindia.com" || h == "nsearchives.nseindia.com" || h == "archives.nseindia.com" || h == "www.nseindia.com"
}

func (f *Fetcher) PDF(ctx context.Context, link string) ([]byte, error) {
	if !Filing(link) {
		return nil, fmt.Errorf("not an exchange filing")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, link, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", market.UserAgent)
	if strings.Contains(req.URL.Host, "bseindia") {
		req.Header.Set("Referer", "https://www.bseindia.com/")
	} else {
		req.Header.Set("Referer", "https://www.nseindia.com/")
	}
	resp, err := f.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s returned %s", req.URL.Host, resp.Status)
	}
	// filings run to a few MB; anything past 40 MB is not one
	b, err := io.ReadAll(io.LimitReader(resp.Body, 40<<20))
	if err != nil {
		return nil, err
	}
	if !bytes.HasPrefix(b, []byte("%PDF")) {
		return nil, fmt.Errorf("%s did not send a PDF", req.URL.Host)
	}
	return b, nil
}

var legalSuffix = regexp.MustCompile(`(?i)\s*\b(ltd|limited)\.?$`)

// Query searches by full name, not ticker: NSE and BSE tickers differ, and short ones like HAL or SULA match noise.
func Query(name string) string {
	n := strings.TrimSpace(legalSuffix.ReplaceAllString(strings.TrimSpace(name), ""))
	words := strings.Fields(strings.ToLower(n))
	for i, w := range words {
		r := []rune(w)
		r[0] = unicode.ToUpper(r[0])
		words[i] = string(r)
	}
	return strings.Join(words, " ")
}

type rss struct {
	Items []struct {
		Title       string `xml:"title"`
		Link        string `xml:"link"`
		PubDate     string `xml:"pubDate"`
		Description string `xml:"description"`
		Source      string `xml:"source"`
	} `xml:"channel>item"`
}

var tags = regexp.MustCompile(`<[^>]+>`)

func clean(s string) string {
	return strings.Join(strings.Fields(html.UnescapeString(tags.ReplaceAllString(html.UnescapeString(s), " "))), " ")
}

func latin(s string) bool {
	letters, ascii := 0, 0
	for _, r := range s {
		if unicode.IsLetter(r) {
			letters++
			if r < 128 {
				ascii++
			}
		}
	}
	return letters == 0 || float64(ascii)/float64(letters) > 0.8
}

func (f *Fetcher) Google(ctx context.Context, sc Scrip, windowDays, perScrip int, now time.Time) ([]Item, error) {
	q := url.QueryEscape(fmt.Sprintf(`"%s" share when:%dd`, Query(sc.Name), windowDays))
	body, err := f.shared(ctx, "https://news.google.com/rss/search?q="+q+"&hl=en-IN&gl=IN&ceid=IN:en", false)
	if err != nil {
		return nil, err
	}
	var feed rss
	if err := xml.Unmarshal(body, &feed); err != nil {
		return nil, err
	}
	cutoff := now.AddDate(0, 0, -windowDays)
	out := []Item{}
	for _, it := range feed.Items {
		pub, _ := time.Parse(time.RFC1123, it.PubDate)
		if !pub.IsZero() && pub.Before(cutoff) {
			continue
		}
		title, source := clean(it.Title), clean(it.Source)
		title = strings.TrimSuffix(title, " - "+source)
		if !latin(title) {
			continue
		}
		// Google's description is usually the headline and outlet again, which says nothing new.
		snippet := clean(it.Description)
		if strings.HasPrefix(snippet, title) {
			snippet = ""
		}
		out = append(out, Item{Scrips: []string{sc.Code}, Title: title, Source: source, Link: it.Link, Snippet: Cut(snippet, 220), Published: pub})
		if len(out) == perScrip {
			break
		}
	}
	return out, nil
}

func Cut(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}

func (f *Fetcher) Filings(ctx context.Context, sc Scrip, windowDays, perScrip int, now time.Time, routine func(string) bool) ([]Item, error) {
	if sc.BSECode == "" {
		return nil, nil
	}
	// BSE dates its filings in Indian time, so the window must end on today's Indian date.
	now = now.In(market.IST)
	from := now.AddDate(0, 0, -windowDays)
	u := "https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w?pageno=1&strCat=-1&subcategory=-1&strPrevDate=" +
		from.Format("20060102") + "&strToDate=" + now.Format("20060102") + "&strSearch=P&strscrip=" + sc.BSECode + "&strType=C"
	body, err := f.shared(ctx, u, true)
	if err != nil {
		return nil, err
	}
	var data struct {
		Table []struct {
			NewsSub    string `json:"NEWSSUB"`
			Headline   string `json:"HEADLINE"`
			NewsDate   string `json:"NEWS_DT"`
			Attachment string `json:"ATTACHMENTNAME"`
			SubCat     string `json:"SUBCATNAME"`
			NewsID     string `json:"NEWSID"`
		} `json:"Table"`
	}
	if err := json.Unmarshal(body, &data); err != nil {
		return nil, fmt.Errorf("bse filings: %w", err)
	}
	out := []Item{}
	for _, r := range data.Table {
		title := clean(r.NewsSub)
		if title == "" {
			title = clean(r.Headline)
		}
		link := "https://www.bseindia.com/corporates/ann.html#" + r.NewsID
		if r.Attachment != "" {
			link = "https://www.bseindia.com/xml-data/corpfiling/AttachLive/" + r.Attachment
		}
		pub, _ := time.ParseInLocation("2006-01-02T15:04:05.999", r.NewsDate, market.IST)
		out = append(out, Item{Scrips: []string{sc.Code}, Title: title, Source: "BSE filing", Link: link, Snippet: Cut(clean(r.Headline), 220),
			Published: pub, Routine: routine != nil && routine(title+" "+r.SubCat)})
		if len(out) == perScrip {
			break
		}
	}
	return out, nil
}

func tokens(s string) map[string]bool {
	out := map[string]bool{}
	for _, w := range strings.FieldsFunc(strings.ToLower(s), func(r rune) bool { return !unicode.IsLetter(r) && !unicode.IsDigit(r) }) {
		if len(w) > 2 {
			out[w] = true
		}
	}
	return out
}

func jaccard(a, b map[string]bool) float64 {
	shared := 0
	for w := range a {
		if b[w] {
			shared++
		}
	}
	union := len(a) + len(b) - shared
	if union == 0 {
		return 0
	}
	return float64(shared) / float64(union)
}

func Merge(all []Item) []Item {
	kept := []Item{}
	keptToks := []map[string]bool{}
	for _, it := range all {
		t := tokens(it.Title)
		if it.Source != "BSE filing" {
			twin := -1
			for i, k := range kept {
				if k.Source != "BSE filing" && jaccard(keptToks[i], t) >= 0.7 {
					twin = i
					break
				}
			}
			if twin >= 0 {
				kept[twin].Also++
				if !contains(kept[twin].Scrips, it.Scrips[0]) {
					kept[twin].Scrips = append(kept[twin].Scrips, it.Scrips[0])
				}
				continue
			}
		}
		kept = append(kept, it)
		keptToks = append(keptToks, t)
	}
	return kept
}

func contains(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}

type AI struct {
	Client openrouter.Client
	Model  string
}

func (j Judge) rules(today string) string {
	v := j.Verdicts
	var b strings.Builder
	fmt.Fprintf(&b, "%s Today is %s.\n%s\n", j.Persona, today, strings.Join(j.ExtraRules, "\n"))
	b.WriteString("Each story is listed with the codes it was fetched for, in brackets. A legend maps every code to its company name.\n")
	b.WriteString("For each numbered story return: verdict, about, category, reason, dup_of.\nverdict is one of:\n")
	for _, k := range []string{"signal", "humbug", "stale", "unclear", "offtopic"} {
		fmt.Fprintf(&b, "- %q: %s\n", k, strings.ReplaceAll(v[k], "{days}", fmt.Sprint(j.StaleAfterDays)))
	}
	b.WriteString("about: the codes from the bracket that the story is actually about. Empty if offtopic or stale.\n")
	fmt.Fprintf(&b, "category: one of %s.\n", strings.Join(j.Categories, ", "))
	fmt.Fprintf(&b, "reason: at most %d words, in the voice above. Say what changed, or why it can be ignored. Do not repeat the headline.\n", j.ReasonMaxWords)
	b.WriteString("dup_of: the id of an earlier story covering the same event for the same company, otherwise null.\n")
	b.WriteString(`Return only JSON: {"items":[{"id":number,"verdict":"signal"|"humbug"|"stale"|"unclear"|"offtopic","about":["CODE"],"category":"...","reason":"...","dup_of":number|null}]}.`)
	return b.String()
}

type verdict struct {
	ID       int      `json:"id"`
	Verdict  string   `json:"verdict"`
	About    []string `json:"about"`
	Category string   `json:"category"`
	Reason   string   `json:"reason"`
	DupOf    *int     `json:"dup_of"`
}

func age(now, t time.Time) string {
	if t.IsZero() {
		return "?"
	}
	d := now.Sub(t).Hours() / 24
	if d < 1 {
		return fmt.Sprintf("%dh", max(1, int(d*24+0.5)))
	}
	return fmt.Sprintf("%.1fd", d)
}

func (ai AI) batch(ctx context.Context, j Judge, items []Item, ids []int, scrips []Scrip, now time.Time) ([]verdict, error) {
	codes := map[string]bool{}
	for _, it := range items {
		for _, c := range it.Scrips {
			codes[c] = true
		}
	}
	var legend, held, watch []string
	for _, s := range scrips {
		if codes[s.Code] {
			legend = append(legend, s.Code+" = "+Query(s.Name))
		}
		if s.Quantity > 0 {
			held = append(held, fmt.Sprintf("%s (%g shares)", s.Code, s.Quantity))
		} else {
			watch = append(watch, s.Code)
		}
	}
	var list strings.Builder
	for i, it := range items {
		snippet := it.Snippet
		if snippet == "" {
			snippet = "no snippet"
		}
		fmt.Fprintf(&list, "%d. [%s] (%s) %s | %s | %s\n", ids[i], strings.Join(it.Scrips, ","), age(now, it.Published), it.Title, it.Source, snippet)
	}
	user := fmt.Sprintf("Legend: %s\nHeld: %s\nWatchlist: %s\n\nStories:\n%s", strings.Join(legend, "; "), orNone(held), orNone(watch), list.String())
	req := openrouter.Request{Model: ai.Model, Temperature: 0.2, MaxTokens: 6000, JSON: true, Messages: []openrouter.Message{
		{Role: "system", Content: j.rules(now.Format("2006-01-02"))}, {Role: "user", Content: user}}}
	var last error
	for attempt := 0; attempt < 2; attempt++ {
		text, err := ai.Client.Chat(ctx, req)
		if err != nil {
			last = err
			continue
		}
		var parsed struct {
			Items []verdict `json:"items"`
		}
		if err := json.Unmarshal([]byte(text), &parsed); err != nil {
			last = fmt.Errorf("openrouter: %w", err)
			continue
		}
		return parsed.Items, nil
	}
	return nil, last
}

func orNone(xs []string) string {
	if len(xs) == 0 {
		return "none"
	}
	return strings.Join(xs, ", ")
}

// Judge judges stories in batches of forty, which keeps each answer well under the model's output limit.
func (ai AI) Judge(ctx context.Context, j Judge, items []Item, scrips []Scrip, now time.Time) ([]Item, error) {
	const size = 40
	type pending struct {
		idx int
		id  int
	}
	var queue []pending
	for i := range items {
		if items[i].Routine {
			items[i].Verdict, items[i].Category, items[i].About = "routine", "filing", items[i].Scrips
			continue
		}
		queue = append(queue, pending{i, i + 1})
	}
	var firstErr error
	for start := 0; start < len(queue); start += size {
		chunk := queue[start:min(start+size, len(queue))]
		batch := make([]Item, len(chunk))
		ids := make([]int, len(chunk))
		for k, p := range chunk {
			batch[k], ids[k] = items[p.idx], p.id
		}
		vs, err := ai.batch(ctx, j, batch, ids, scrips, now)
		if err != nil {
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		for _, v := range vs {
			i := v.ID - 1
			if i < 0 || i >= len(items) || items[i].Routine {
				continue
			}
			items[i].Verdict, items[i].About, items[i].Category, items[i].Reason = v.Verdict, v.About, v.Category, v.Reason
			if v.DupOf != nil && *v.DupOf < v.ID && *v.DupOf >= 1 && !items[*v.DupOf-1].Routine {
				items[i].Verdict = "dup"
				parent := &items[*v.DupOf-1]
				parent.Also += 1 + items[i].Also
				for _, sc := range items[i].Scrips {
					if !contains(parent.Scrips, sc) {
						parent.Scrips = append(parent.Scrips, sc)
					}
				}
			}
		}
	}
	out := items[:0]
	for _, it := range items {
		if it.Verdict != "dup" {
			out = append(out, it)
		}
	}
	return out, firstErr
}

// Routine reports whether a title is a routine filing; both sides are squashed to letters and digits so "Reg 74(5)" matches "Regulation 74 (5)".
func (j Judge) Routine(title string) bool {
	t := squash(title)
	for _, phrase := range j.RoutineFilings {
		if p := squash(phrase); p != "" && strings.Contains(t, p) {
			return true
		}
	}
	return false
}

func squash(s string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(s) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

type Options struct {
	WindowDays int
	PerScrip   int
	Judge      Judge
	AI         *AI
	// called per finished group so stories show while the rest are read; done counts scrips read so far
	Each func(items []Item, done int) error
}

type Report struct {
	Items        []Item
	Fetched      int
	Failed       []string
	GoogleFailed int
}

func (f *Fetcher) Collect(ctx context.Context, scrips []Scrip, opt Options, now time.Time) (Report, error) {
	var rep Report
	var firstErr error
	for start := 0; start < len(scrips); start += groupSize {
		group := scrips[start:min(start+groupSize, len(scrips))]
		items, err := f.collect(ctx, group, scrips, opt, now, &rep)
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return rep, err
		}
		if err != nil && firstErr == nil {
			firstErr = err
		}
		rep.Items = append(rep.Items, items...)
		if opt.Each != nil {
			if err := opt.Each(items, start+len(group)); err != nil {
				return rep, err
			}
		}
	}
	return rep, firstErr
}

// groupSize is eight scrips, about a minute of reading and one judge call, so first stories appear soon.
const groupSize = 8

func (f *Fetcher) collect(ctx context.Context, group, scrips []Scrip, opt Options, now time.Time, rep *Report) ([]Item, error) {
	var all []Item
	routine := opt.Judge.Routine
	for _, sc := range group {
		items, err := f.Google(ctx, sc, opt.WindowDays, opt.PerScrip, now)
		if err != nil {
			rep.Failed = append(rep.Failed, sc.Code+" news: "+err.Error())
			rep.GoogleFailed++
		}
		all = append(all, items...)
		filings, err := f.Filings(ctx, sc, opt.WindowDays, opt.PerScrip, now, routine)
		if err != nil {
			rep.Failed = append(rep.Failed, sc.Code+" filings: "+err.Error())
		}
		all = append(all, filings...)
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(f.Pause):
		}
	}
	rep.Fetched += len(all)
	items := Merge(all)
	if opt.AI != nil && opt.AI.Client.Key != "" {
		return opt.AI.Judge(ctx, opt.Judge, items, scrips, now)
	}
	return items, nil
}
