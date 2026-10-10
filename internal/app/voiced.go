package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/DimwitLabs/ebenezer/internal/kinds"
	"github.com/DimwitLabs/ebenezer/internal/openrouter"
	"github.com/DimwitLabs/ebenezer/internal/store"
)

// Notes are keyed on their slice, so one is rewritten only when what it reads changes; the phrasebook speaks until then and whenever the model is unavailable.

// voicedRetry keeps a bad key or provider outage from being retried on every page load.
const voicedRetry = 10 * time.Minute

// notesVersion is bumped when the faithfulness rules tighten, so every note is written again.
const notesVersion = "11"

var retryAfter = 15 * time.Second

// written holds a note's written lines; the first line is the lead.
type written struct {
	Key   string        `json:"key"`
	Lines []writtenLine `json:"lines"`
	// The phrasebook speaks until the slice changes.
	Failed bool `json:"failed,omitempty"`
}

type writtenLine struct {
	Text  string `json:"text"`
	About string `json:"about,omitempty"`
}

type slice struct {
	id, ledger, focus string
}

const notesAtOnce = 4

func (a *App) NoteNews(ctx context.Context, p *store.Portfolio) ([]store.NewsItem, error) {
	return a.Store.News(ctx, p.ID, time.Now().AddDate(0, 0, -max(1, p.Settings.News.WindowDays)), 300)
}

func (a *App) slices(ctx context.Context, p *store.Portfolio, sum *PortfolioSummary, items []store.NewsItem) ([]slice, error) {
	today, err := a.TodayLedger(ctx, p, sum, items)
	if err != nil {
		return nil, err
	}
	overview, err := a.OverviewLedger(ctx, p, sum)
	if err != nil {
		return nil, err
	}
	out := []slice{
		{"today", today, "This note is for the Today screen: what changed on the last trading day, what falls due soon, and what the news means for these holdings. Leave long-run returns to the Overview unless today moved them."},
		{"overview", overview, "This note is for the Overview screen: the whole picture across sections, through time. How money went in, how net worth has moved, which sections carried it and which held it back, against the benchmark and after inflation. Point out idle cash, money concentrated in one section or holding, and any section that has not earned its place."},
	}
	for i, sec := range sum.Sections {
		l, err := a.SectionLedger(ctx, p, sum, i)
		if err != nil {
			return nil, err
		}
		out = append(out, slice{sec.ID, l, fmt.Sprintf("This note is for the %s screen: this section only. Its holdings and how concentrated they are, its gains and losses, its return against the benchmark and after inflation, what trading has cost where there was trading, and anything falling due. The portfolio line is there for scale only.", sec.Name)})
	}
	return out, nil
}

// instructions returns the voice's own instructions; Ask's default ones are left out, as they are about the whole picture and most notes are about one part.
func instructions(v store.Voice) string {
	return strings.TrimSpace(v.Instructions)
}

func (s slice) key(v store.Voice, model string) string {
	h := sha256.Sum256([]byte(strings.Join([]string{notesVersion, model, v.Personality, v.Tone, v.Custom, instructions(v), s.focus, s.ledger}, "\x00")))
	return hex.EncodeToString(h[:12])
}

func (a *App) savedNotes(ctx context.Context, portfolioID string) (map[string]written, error) {
	saved, err := a.Store.VoicedNotes(ctx, portfolioID)
	if err != nil {
		return nil, err
	}
	notes := map[string]written{}
	if saved.Voice == notesVersion && len(saved.Notes) > 0 {
		if err := json.Unmarshal(saved.Notes, &notes); err != nil {
			slog.Warn("voiced notes unreadable, writing them again", "portfolio", portfolioID, "err", err)
			return map[string]written{}, nil
		}
	}
	return notes, nil
}

// VoicedNotes returns the notes in the portfolio's voice; pending means the model is still writing changed notes, and the page looks again shortly.
func (a *App) VoicedNotes(ctx context.Context, p *store.Portfolio, sum *PortfolioSummary, items []store.NewsItem) (note Note, tabs TabNotes, pending bool) {
	v := p.Settings.Voice
	note, tabs = a.Note(sum, items, v), a.TabNotes(sum, v.Tone)
	sl, err := a.slices(ctx, p, sum, items)
	if err != nil {
		slog.Error("building note ledgers", "portfolio", p.ID, "err", err)
		return note, tabs, false
	}
	saved, err := a.savedNotes(ctx, p.ID)
	if err != nil {
		slog.Error("reading voiced notes", "portfolio", p.ID, "err", err)
		return note, tabs, false
	}
	is, err := a.Store.InstanceSettings(ctx)
	if err != nil {
		slog.Error("reading settings", "err", err)
		return note, tabs, false
	}
	stale := false
	for _, s := range sl {
		w, ok := saved[s.id]
		fresh := ok && w.Key == s.key(v, ModelFor(is, p))
		if !fresh {
			stale = true
		}
		if s.id == "today" {
			note.Sees = s.ledger
			if fresh && !w.Failed && len(w.Lines) > 0 {
				lines := noteLines(sum, w.Lines)
				note.Lead, note.Lines = lines[0].Text, lines[1:]
			}
			continue
		}
		t := tabs[s.id]
		t.Sees = s.ledger
		if fresh && !w.Failed {
			if len(w.Lines) > 0 {
				t.Lines, t.Quiet = noteLines(sum, w.Lines), ""
			} else if t.Quiet == "" {
				t.Lines, t.Quiet = []NoteLine{}, tabbook[toneOr(v.Tone)].quiet
			}
		}
		tabs[s.id] = t
	}
	if stale && a.mayVoice(ctx, p.ID) {
		a.startQuietly("notes", p.ID)
		pending = true
	}
	return note, tabs, pending || a.Running("notes", p.ID)
}

func toneOr(tone string) string {
	if _, ok := tabbook[tone]; ok {
		return tone
	}
	return "dry"
}

func noteLines(sum *PortfolioSummary, ws []writtenLine) []NoteLine {
	out := make([]NoteLine, len(ws))
	for i, w := range ws {
		out[i] = NoteLine{Icon: "insights", Text: w.Text}
		if strings.EqualFold(w.About, "news") {
			out[i].Icon = "newspaper"
			continue
		}
		for _, sec := range sum.Sections {
			if w.About != "" && strings.EqualFold(sec.Name, w.About) {
				out[i].Section, out[i].Icon = sec.ID, sec.Icon
				if out[i].Icon == "" {
					if k, ok := kinds.Get(sec.Kind); ok {
						out[i].Icon = k.Icon
					}
				}
				break
			}
		}
	}
	return out
}

func (a *App) mayVoice(ctx context.Context, portfolioID string) bool {
	a.mu.Lock()
	failed := a.voicedFailed[portfolioID]
	a.mu.Unlock()
	return time.Since(failed) > voicedRetry && a.Secret(ctx, OpenRouterKey) != ""
}

// writeNotes saves each note as it lands so the page fills in while the rest are written.
func (a *App) writeNotes(ctx context.Context, portfolioID string) (msg string, err error) {
	defer func() {
		if err != nil {
			a.mu.Lock()
			a.voicedFailed[portfolioID] = time.Now()
			a.mu.Unlock()
		}
	}()
	p, err := a.portfolio(ctx, portfolioID)
	if err != nil {
		return "", err
	}
	key := a.Secret(ctx, OpenRouterKey)
	if key == "" {
		return "no OpenRouter key, so the phrasebook speaks", nil
	}
	sum, err := a.Summary(ctx, p)
	if err != nil {
		return "", err
	}
	items, err := a.NoteNews(ctx, p)
	if err != nil {
		return "", err
	}
	sl, err := a.slices(ctx, p, sum, items)
	if err != nil {
		return "", err
	}
	saved, err := a.savedNotes(ctx, p.ID)
	if err != nil {
		return "", err
	}
	is, err := a.Store.InstanceSettings(ctx)
	if err != nil {
		return "", err
	}
	v := p.Settings.Voice
	notes := map[string]written{}
	for _, s := range sl {
		if w, ok := saved[s.id]; ok {
			notes[s.id] = w
		}
	}
	save := func() error {
		raw, err := json.Marshal(notes)
		if err != nil {
			return err
		}
		return a.Store.SaveVoicedNotes(ctx, p.ID, store.VoicedNotes{Voice: notesVersion, Notes: raw})
	}
	var (
		mu            sync.Mutex
		wg            sync.WaitGroup
		wrote, failed int
		lastErr       error
		slots         = make(chan struct{}, notesAtOnce)
	)
	model := ModelFor(is, p)
	for _, s := range sl {
		k := s.key(v, model)
		if notes[s.id].Key == k {
			continue
		}
		wg.Add(1)
		go func() {
			defer wg.Done()
			slots <- struct{}{}
			defer func() { <-slots }()
			w, err := writeNote(ctx, a.ai(key), model, Persona(v), instructions(v), s)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				// A provider error is not the slice's fault, so nothing is saved and it is tried again.
				lastErr = err
				return
			}
			w.Key = k
			notes[s.id] = w
			if w.Failed {
				failed++
			} else {
				wrote++
			}
			if err := save(); err != nil {
				lastErr = err
			}
		}()
	}
	wg.Wait()
	if err := save(); err != nil {
		return "", err
	}
	if lastErr != nil && wrote+failed == 0 {
		return "", lastErr
	}
	switch wrote {
	case 0:
		msg = "No note needed rewriting"
	case 1:
		msg = "1 note written"
	default:
		msg = fmt.Sprintf("%d notes written", wrote)
	}
	fact(ctx, "Written", Count(wrote))
	fact(ctx, "Unchanged", Count(len(sl)-wrote-failed))
	if failed > 0 {
		fact(ctx, "Phrasebook", Count(failed))
	}
	fact(ctx, "Model", model)
	if lastErr != nil {
		fact(ctx, "Not reached", lastErr.Error())
	}
	return msg, nil
}

const noteRules = `You are writing the note Ebenezer shows on one screen of a personal finance app for one person in India, from the ledger the user sends.
%s
Write a lead of one sentence giving your verdict with its key figure, then up to four points of one sentence each, under 30 words, the most telling first. Write only as many points as there are distinct things to say; one point, or none, is fine. Never say a thing twice in other words, in a point or in the lead: each line adds a fact or an action the others do not. Never open with "This section" or "This screen". At least one point says what you would do or look into, as a sceptical accountant advising a client: check a figure, put idle cash to work, add missing cover, spread out a concentration, question a section that lags. Never name a security to buy or sell, and never promise a return.
Anything under "Entries that look wrong" comes first, said in your own words; then draw nothing from a figure built on it, neither praise nor blame. Never repeat a heading or label from the ledger, never guess at a cause it does not show, and give the period of any change exactly as the ledger does.
Each point must say something the screen does not already show plainly: a comparison, a concentration, a gap to the benchmark or after inflation, a change, a risk, or something falling due. Never read a ledger line back, never say that something is unchanged, and never describe how the app or the section works.
Compare only like with like: a rupee change with a rupee change, a yearly rate with a yearly rate, a day's move with a day's move. Money not invested in the market, such as deposits or savings, is measured against inflation, not the index.
Use only figures that appear in the ledger, written as they appear there. Never work out, round or add a number.
Write money as the ledger does, and say losses in words, never in brackets. Plain words, no markdown, no emoji.
If the section holds nothing, return no lines.
Return only JSON: {"lines":[{"text":"...","about":"..."}]}, the lead first, where about is the name of the section a line is about as the ledger names it, "news" for a line about the news, or "".`

func writeNote(ctx context.Context, c openrouter.Client, model, persona, instructions string, s slice) (written, error) {
	system := persona + "\n"
	if instructions != "" {
		system += "The owner's own instructions, to follow within this screen's scope:\n" + instructions + "\n"
	}
	system += fmt.Sprintf(noteRules, s.focus)
	var out struct {
		Lines []writtenLine `json:"lines"`
	}
	// Providers now and then rate-limit or return an empty or cut-off reply; one later retry usually lands.
	for try := 0; ; try++ {
		if try > 0 {
			select {
			case <-ctx.Done():
				return written{}, ctx.Err()
			case <-time.After(retryAfter):
			}
		}
		reply, err := c.Chat(ctx, openrouter.Request{
			Model:       model,
			Messages:    []openrouter.Message{{Role: "system", Content: system}, {Role: "user", Content: s.ledger}},
			Temperature: 0.4,
			MaxTokens:   4000,
			JSON:        true,
		})
		if err != nil && try == 0 {
			continue
		}
		if err != nil {
			return written{}, err
		}
		if err = json.Unmarshal([]byte(reply), &out); err == nil {
			break
		} else if try == 1 {
			return written{}, fmt.Errorf("the model's reply was not the JSON asked for: %w", err)
		}
	}
	source := s.ledger + "\n" + persona + "\n" + instructions
	w := written{Lines: []writtenLine{}}
	for _, l := range out.Lines {
		l.Text = strings.TrimSpace(l.Text)
		if l.Text != "" && faithful(l.Text, source) && len(w.Lines) < 6 {
			w.Lines = append(w.Lines, l)
		}
	}
	// Today with nothing to say, or a note that kept none of the model's lines, falls back to the phrasebook.
	w.Failed = len(w.Lines) == 0 && (len(out.Lines) > 0 || s.id == "today")
	return w, nil
}

var (
	figures     = regexp.MustCompile(`(₹[\s\x{202f}]?)?(\d(?:[\d,]*\d)?(?:\.\d+)?)(?:[\s\x{202f}]?(k|L|lakh|Cr|crore)\b|(%))?`)
	placeholder = regexp.MustCompile(`\[[A-Z_]+\]`)
	capital     = regexp.MustCompile(`[A-Z][A-Za-z&]+`)
	opener      = regexp.MustCompile(`(^|[.:!?;]\s+|["“])[A-Z][A-Za-z&]*`)
)

// amounts finds the figures in text, keeping units so "₹10.9k" is not taken for "10.9%".
func amounts(text string) []string {
	var out []string
	for _, m := range figures.FindAllStringSubmatch(text, -1) {
		unit := map[string]string{"lakh": "L", "crore": "Cr"}[m[3]]
		if unit == "" {
			unit = m[3]
		}
		cur := ""
		if m[1] != "" || unit != "" {
			cur = "₹"
		}
		out = append(out, cur+m[2]+unit+m[4])
	}
	return out
}

// faithful reports whether every figure said is in the ledger, so the model can choose and say but never compute or invent a number.
func faithful(said, source string) bool {
	if placeholder.MatchString(said) {
		return false
	}
	have := map[string]bool{}
	for _, f := range amounts(source) {
		have[f] = true
	}
	for _, f := range amounts(said) {
		if !have[f] {
			return false
		}
	}
	starts := map[int]bool{}
	for _, m := range opener.FindAllStringIndex(said, -1) {
		starts[m[1]] = true
	}
	for _, m := range capital.FindAllStringIndex(said, -1) {
		if !starts[m[1]] && !strings.Contains(source, said[m[0]:m[1]]) {
			return false
		}
	}
	return true
}
