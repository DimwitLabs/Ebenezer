package server

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/mail"
	"net/url"
	"regexp"
	"slices"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/DimwitLabs/ebenezer/internal/openrouter"

	"github.com/DimwitLabs/ebenezer/internal/app"
	"github.com/DimwitLabs/ebenezer/internal/kinds"
	"github.com/DimwitLabs/ebenezer/internal/news"
	"github.com/DimwitLabs/ebenezer/internal/store"
	"github.com/DimwitLabs/ebenezer/internal/value"
)

var (
	uuidPattern  = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
	clockPattern = regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d$`)
)

func (s *Server) kinds(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.user(r); err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, map[string]any{"kinds": kinds.All, "fieldTypes": kinds.FieldTypes, "customValuations": kinds.CustomValuations, "expenseFields": kinds.ExpenseFields, "cardFields": kinds.CardFields})
	return nil
}

func (s *Server) listPortfolios(w http.ResponseWriter, r *http.Request) error {
	u, err := s.user(r)
	if err != nil {
		return err
	}
	ps, err := s.store.ListPortfolios(r.Context(), u.ID)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, ps)
	return nil
}

type newPortfolio struct {
	Name     string   `json:"name"`
	Currency string   `json:"currency"`
	FYStart  int      `json:"fyStart"`
	Kinds    []string `json:"kinds"`
}

func (s *Server) createPortfolio(w http.ResponseWriter, r *http.Request) error {
	u, err := s.user(r)
	if err != nil {
		return err
	}
	var body newPortfolio
	if err := readJSON(r, &body); err != nil {
		return err
	}
	body.Name = strings.TrimSpace(body.Name)
	if err := validName(body.Name); err != nil {
		return err
	}
	if body.Currency == "" {
		body.Currency = "INR"
	}
	if body.FYStart < 1 || body.FYStart > 12 {
		body.FYStart = 4
	}
	p, err := s.store.CreatePortfolio(r.Context(), u, body.Name, body.Currency, body.FYStart)
	if errors.Is(err, store.ErrConflict) {
		return nameTaken(body.Name)
	}
	if err != nil {
		return err
	}
	made := map[string]bool{}
	for _, key := range body.Kinds {
		k, ok := kinds.Get(key)
		if !ok || key == "custom" || made[key] {
			continue
		}
		made[key] = true
		sec := sectionFromKind(p.ID, k)
		if err := s.store.CreateSection(r.Context(), &sec); err != nil {
			return err
		}
	}
	writeJSON(w, http.StatusCreated, p)
	return nil
}

func sectionFromKind(pid string, k kinds.Kind) store.Section {
	return store.Section{PortfolioID: pid, Kind: k.Key, Name: k.Name, Icon: k.Icon, Valuation: k.Valuation,
		ValueField: k.ValueField, CostField: k.CostField, DateField: k.DateField, Fields: k.Fields, Counts: k.Valuation != kinds.Cover}
}

func (s *Server) getPortfolio(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, p)
	return nil
}

type portfolioPatch struct {
	Name     *string                  `json:"name"`
	Icon     *string                  `json:"icon"`
	Color    *string                  `json:"color"`
	Currency *string                  `json:"currency"`
	FYStart  *int                     `json:"fyStart"`
	Settings *store.PortfolioSettings `json:"settings"`
	Palette  map[string]string        `json:"palette"`
}

func (s *Server) updatePortfolio(w http.ResponseWriter, r *http.Request) error {
	u, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	var body portfolioPatch
	if err := readJSON(r, &body); err != nil {
		return err
	}
	if body.Name != nil {
		n := strings.TrimSpace(*body.Name)
		if err := validName(n); err != nil {
			return err
		}
		p.Name = n
	}
	if body.Icon != nil {
		if !iconPattern.MatchString(*body.Icon) {
			return fail(http.StatusBadRequest, "pick an icon from the list")
		}
		p.Icon = *body.Icon
	}
	if body.Color != nil {
		if !colorPattern.MatchString(*body.Color) {
			return fail(http.StatusBadRequest, "a colour is a # and six hex digits")
		}
		p.Color = strings.ToLower(*body.Color)
	}
	if body.Currency != nil {
		p.Currency = *body.Currency
	}
	if body.FYStart != nil {
		if *body.FYStart < 1 || *body.FYStart > 12 {
			return fail(http.StatusBadRequest, "the financial year starts in a month from 1 to 12")
		}
		p.FYStart = *body.FYStart
	}
	if body.Settings != nil {
		if err := validSettings(body.Settings); err != nil {
			return err
		}
		// The report goes out through the owner's mail server, so only the owner picks who gets it.
		if !u.IsOwner && !slices.Equal(body.Settings.Report.To, p.Settings.Report.To) {
			return fail(http.StatusForbidden, "only the owner can choose who gets emailed")
		}
		body.Settings.Moves = p.Settings.Moves
		body.Settings.Palette = p.Settings.Palette
		p.Settings = *body.Settings
	}
	if body.Palette != nil {
		for k, v := range body.Palette {
			if _, ok := app.ReportPalette[k]; !ok || !colorPattern.MatchString(v) {
				return fail(http.StatusBadRequest, "the report colours are known roles, each a # and six hex digits")
			}
		}
		p.Settings.Palette = body.Palette
	}
	if err := s.store.UpdatePortfolio(r.Context(), p); errors.Is(err, store.ErrConflict) {
		return nameTaken(p.Name)
	} else if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, p)
	return nil
}

func validName(n string) error {
	if n == "" || len(n) > 80 {
		return fail(http.StatusBadRequest, "give the portfolio a name of up to 80 characters")
	}
	if store.Slug(n) == "" {
		return fail(http.StatusBadRequest, "the name needs at least one letter or number, as it's also the portfolio's link")
	}
	return nil
}

// nameTaken reports a name clash; names are instance-wide, so it may be with a portfolio the person cannot see, and only their words are echoed.
func nameTaken(n string) error {
	return fail(http.StatusConflict, "a portfolio called %q, or one that makes the same link, already exists", n)
}

func validSettings(ps *store.PortfolioSettings) error {
	if ps.Inflation < 0 || ps.Inflation > 50 {
		return fail(http.StatusBadRequest, "inflation should be between 0 and 50 percent")
	}
	if ps.XIRRMinDays < 0 || ps.XIRRMinDays > 3650 {
		return fail(http.StatusBadRequest, "the XIRR wait should be between 0 and 3650 days")
	}
	if ps.MorningCount != "" && !clockPattern.MatchString(ps.MorningCount) {
		return fail(http.StatusBadRequest, "times look like 07:30")
	}
	n := &ps.News
	if len(n.Times) > 12 {
		return fail(http.StatusBadRequest, "news can run at most 12 times a day")
	}
	for _, t := range n.Times {
		if !clockPattern.MatchString(t) {
			return fail(http.StatusBadRequest, "news times look like 07:00, not %q", t)
		}
	}
	slices.Sort(n.Times)
	n.Times = slices.Compact(n.Times)
	if n.WindowDays < 1 || n.WindowDays > 30 {
		return fail(http.StatusBadRequest, "look back between 1 and 30 days for news")
	}
	if n.PerScrip < 1 || n.PerScrip > 20 {
		return fail(http.StatusBadRequest, "fetch between 1 and 20 stories per scrip")
	}
	v := &ps.Voice
	if _, ok := app.Personalities[v.Personality]; !ok && v.Personality != "custom" {
		return fail(http.StatusBadRequest, "pick one of the personalities")
	}
	if _, ok := app.Tones[v.Tone]; !ok {
		return fail(http.StatusBadRequest, "pick one of the tones")
	}
	v.Custom = strings.TrimSpace(v.Custom)
	v.Instructions = strings.TrimSpace(v.Instructions)
	if len(v.Instructions) > 4000 {
		return fail(http.StatusBadRequest, "keep your instructions for me under 4000 characters")
	}
	if len(v.Custom) > 600 {
		return fail(http.StatusBadRequest, "describe the personality in under 600 characters")
	}
	if v.Personality == "custom" && v.Custom == "" {
		return fail(http.StatusBadRequest, "describe the personality you want")
	}
	rep := &ps.Report
	if !clockPattern.MatchString(rep.Time) {
		return fail(http.StatusBadRequest, "the report time looks like 08:00")
	}
	for _, d := range rep.Days {
		if !slices.Contains(app.Weekdays, d) {
			return fail(http.StatusBadRequest, "days are Mon to Sun, not %q", d)
		}
	}
	for _, sec := range rep.Sections {
		if !slices.Contains(app.ReportSections, sec) {
			return fail(http.StatusBadRequest, "the report has no part called %q", sec)
		}
	}
	if len(rep.To) > 10 {
		return fail(http.StatusBadRequest, "send the report to at most 10 addresses")
	}
	for i, to := range rep.To {
		addr, err := mail.ParseAddress(strings.TrimSpace(to))
		if err != nil {
			return fail(http.StatusBadRequest, "%q isn't an email address", to)
		}
		rep.To[i] = addr.Address
	}
	if rep.Enabled && len(rep.To) == 0 {
		return fail(http.StatusBadRequest, "add at least one address to send the report to")
	}
	if len(n.Judge) > 0 && string(n.Judge) != "null" {
		if len(n.Judge) > 20000 {
			return fail(http.StatusBadRequest, "the judge criteria are too long")
		}
		if _, err := news.LoadJudge(n.Judge); err != nil {
			return fail(http.StatusBadRequest, "the judge criteria aren't valid JSON: %v", err)
		}
	}
	return nil
}

func (s *Server) defaultJudge(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.user(r); err != nil {
		return err
	}
	w.Header().Set("Content-Type", "application/json")
	_, err := w.Write(news.DefaultJudge())
	return err
}

func (s *Server) deletePortfolio(w http.ResponseWriter, r *http.Request) error {
	u, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	if p.OwnerID == nil || *p.OwnerID != u.ID {
		return fail(http.StatusForbidden, "only the portfolio's owner can delete it")
	}
	if err := s.store.DeletePortfolio(r.Context(), p.ID); err != nil {
		return err
	}
	return ok(w)
}

func (s *Server) summary(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	sum, err := s.app.Summary(r.Context(), p)
	if err != nil {
		return err
	}
	items, err := s.app.NoteNews(r.Context(), p)
	if err != nil {
		return err
	}
	note, tabs, pending := s.app.VoicedNotes(r.Context(), p, sum, items)
	writeJSON(w, http.StatusOK, struct {
		*app.PortfolioSummary
		Note         app.Note     `json:"note"`
		TabNotes     app.TabNotes `json:"tabNotes"`
		NotesPending bool         `json:"notesPending"`
	}{sum, note, tabs, pending})
	return nil
}

func (s *Server) positions(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	day, ok := value.Date(r.URL.Query().Get("on"))
	if !ok {
		return fail(http.StatusBadRequest, "say which day, as on=YYYY-MM-DD")
	}
	ps, err := s.app.PositionsOn(r.Context(), p.ID, day)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, ps)
	return nil
}

func (s *Server) snapshots(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	sn, err := s.store.Snapshots(r.Context(), p.ID)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, sn)
	return nil
}

func (s *Server) benchmark(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	from := time.Now().AddDate(-1, 0, 0)
	if d, err := time.Parse("2006-01-02", r.URL.Query().Get("from")); err == nil {
		from = d
	}
	closes, err := s.store.IndexSeries(r.Context(), p.Settings.Benchmark, from)
	if err != nil {
		return err
	}
	type point struct {
		Day   string   `json:"day"`
		Close float64  `json:"close"`
		PE    *float64 `json:"pe"`
	}
	out := make([]point, 0, len(closes))
	for _, c := range closes {
		out = append(out, point{Day: c.Day.Format("2006-01-02"), Close: c.Close, PE: c.PE})
	}
	writeJSON(w, http.StatusOK, out)
	return nil
}

func (s *Server) members(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	ms, err := s.store.Members(r.Context(), p.ID)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, ms)
	return nil
}

func (s *Server) setMember(w http.ResponseWriter, r *http.Request, member bool) error {
	u, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	if !u.IsOwner {
		return fail(http.StatusForbidden, "only the owner of this Ebenezer can share a portfolio")
	}
	uid := r.PathValue("uid")
	if !uuidPattern.MatchString(uid) {
		return fail(http.StatusNotFound, "no such person")
	}
	if !member && uid == u.ID {
		return fail(http.StatusBadRequest, "the owner always sees every portfolio they are on")
	}
	if err := s.store.SetMember(r.Context(), p.ID, uid, member); err != nil {
		return err
	}
	return ok(w)
}

func (s *Server) invite(w http.ResponseWriter, r *http.Request) error {
	u, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	if !u.IsOwner {
		return fail(http.StatusForbidden, "only the owner of this Ebenezer can share a portfolio")
	}
	var in invite
	if err := readJSON(r, &in); err != nil {
		return err
	}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	who, err := s.store.UserByEmail(r.Context(), in.Email)
	existing := err == nil
	if errors.Is(err, store.ErrNotFound) {
		who, err = s.newPerson(r, &in)
	}
	if err != nil {
		return err
	}
	if err := s.store.SetMember(r.Context(), p.ID, who.ID, true); err != nil {
		return err
	}
	if in.Send {
		password := in.Password
		if existing {
			password = ""
		}
		if err := s.sendInvite(r, u, who, password, p); err != nil {
			return err
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": who, "existing": existing})
	return nil
}

func (s *Server) addMember(w http.ResponseWriter, r *http.Request) error {
	return s.setMember(w, r, true)
}

func (s *Server) removeMember(w http.ResponseWriter, r *http.Request) error {
	return s.setMember(w, r, false)
}

func (s *Server) news(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	items, err := s.store.News(r.Context(), p.ID, time.Now().AddDate(0, 0, -max(p.Settings.News.WindowDays, 7)), 300)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, items)
	return nil
}

type jobView struct {
	app.Job
	Running  bool          `json:"running"`
	Progress *app.Progress `json:"progress,omitempty"`
	LastRun  *store.JobRun `json:"lastRun"`
	Next     string        `json:"next"`
}

func (s *Server) jobs(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	runs, err := s.store.LastRuns(r.Context(), p.ID)
	if err != nil {
		return err
	}
	is, err := s.store.InstanceSettings(r.Context())
	if err != nil {
		return err
	}
	out := make([]jobView, 0, len(app.Jobs))
	for _, j := range app.Jobs {
		pid := ""
		if j.Portfolio {
			pid = p.ID
		}
		v := jobView{Job: j, Running: s.app.Running(j.Name, pid), Progress: s.app.Progress(j.Name, pid)}
		for i := range runs {
			own := runs[i].PortfolioID != nil && *runs[i].PortfolioID == p.ID
			if runs[i].Job == j.Name && own == j.Portfolio {
				v.LastRun = &runs[i]
			}
		}
		v.Next = app.JobWhen(j.Name, is, p)
		out = append(out, v)
	}
	writeJSON(w, http.StatusOK, out)
	return nil
}

type scheduleView struct {
	app.Chain
	Running bool       `json:"running"`
	Next    string     `json:"next"`
	NextAt  *time.Time `json:"nextAt"`
}

func (s *Server) schedules(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	is, err := s.store.InstanceSettings(r.Context())
	if err != nil {
		return err
	}
	out := make([]scheduleView, 0, len(app.Chains))
	now := time.Now().In(app.Zone)
	for _, c := range app.Chains {
		when := app.ChainWhen(c.Name, is, p)
		v := scheduleView{Chain: c, Running: s.app.ChainRunning(c.Name, p.ID), Next: when.Text, NextAt: when.Next(now)}
		out = append(out, v)
	}
	writeJSON(w, http.StatusOK, out)
	return nil
}

func (s *Server) runSchedule(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	c, found := app.ChainByName(r.PathValue("name"))
	if !found {
		return fail(http.StatusNotFound, "no such schedule")
	}
	if c.Name == "report" && !s.reportByPortfolio.allow(p.ID) {
		return fail(http.StatusTooManyRequests, "that's a lot of reports for one hour; give me a little while")
	}
	if err := s.app.StartChain(c.Name, p.ID); err != nil {
		return fail(http.StatusConflict, "%s is already running", strings.ToLower(c.Label))
	}
	writeJSON(w, http.StatusAccepted, map[string]bool{"started": true})
	return nil
}

func (s *Server) stopSchedule(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	c, found := app.ChainByName(r.PathValue("name"))
	if !found {
		return fail(http.StatusNotFound, "no such schedule")
	}
	if err := s.app.StopChain(c.Name, p.ID); err != nil {
		return fail(http.StatusConflict, "%s isn't running", strings.ToLower(c.Label))
	}
	writeJSON(w, http.StatusOK, map[string]bool{"stopped": true})
	return nil
}

func (s *Server) runJob(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	j, found := app.JobByName(r.PathValue("job"))
	if !found {
		return fail(http.StatusNotFound, "no such job")
	}
	pid := ""
	if j.Portfolio {
		pid = p.ID
	}
	if j.Name == "report" && !s.reportByPortfolio.allow(p.ID) {
		return fail(http.StatusTooManyRequests, "that's a lot of reports for one hour; give me a little while")
	}
	if err := s.app.Start(j.Name, pid); err != nil {
		return fail(http.StatusConflict, "%s is already running", strings.ToLower(j.Label))
	}
	writeJSON(w, http.StatusAccepted, map[string]bool{"started": true})
	return nil
}

func (s *Server) judgeNews(w http.ResponseWriter, r *http.Request) error {
	u, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		return fail(http.StatusNotFound, "no such story")
	}
	it, err := s.app.JudgeOne(r.Context(), p, id)
	switch {
	case errors.Is(err, store.ErrNotFound):
		return fail(http.StatusNotFound, "no such story")
	case errors.Is(err, app.ErrNoAI):
		return s.aiFailure(r, u, err, "read the news for you", "")
	case err != nil:
		return fail(http.StatusBadGateway, "I couldn't judge this story: %v", err)
	}
	writeJSON(w, http.StatusOK, it)
	return nil
}

// filingPDF serves only exchange PDFs saved for this portfolio, so it cannot be pointed at an arbitrary URL.
func (s *Server) filingPDF(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		return fail(http.StatusNotFound, "no such story")
	}
	link, title, err := s.store.NewsLink(r.Context(), p.ID, id)
	if errors.Is(err, store.ErrNotFound) || (err == nil && !news.Filing(link)) {
		return fail(http.StatusNotFound, "no filing to download")
	}
	if err != nil {
		return err
	}
	b, err := s.app.News.PDF(r.Context(), link)
	if err != nil {
		return fail(http.StatusBadGateway, "I couldn't fetch the filing: %v", err)
	}
	name := store.Slug(title)
	if name == "" {
		name = "filing"
	}
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.pdf"`, name[:min(len(name), 80)]))
	w.Header().Set("Content-Length", strconv.Itoa(len(b)))
	_, err = w.Write(b)
	return err
}

func (s *Server) scripNews(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	isin := r.PathValue("isin")
	if !isinPattern.MatchString(isin) {
		return fail(http.StatusNotFound, "no such scrip")
	}
	added, err := s.app.ScripNews(r.Context(), p, isin)
	if errors.Is(err, app.ErrTooSoon) {
		writeJSON(w, http.StatusOK, map[string]any{"added": 0, "checked": false})
		return nil
	}
	if err != nil && added == 0 {
		return fail(http.StatusBadGateway, "I couldn't read news for this scrip: %v", err)
	}
	writeJSON(w, http.StatusOK, map[string]any{"added": added, "checked": true})
	return nil
}

func (s *Server) stopJob(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	j, found := app.JobByName(r.PathValue("job"))
	if !found {
		return fail(http.StatusNotFound, "no such job")
	}
	pid := ""
	if j.Portfolio {
		pid = p.ID
	}
	if err := s.app.Stop(j.Name, pid); err != nil {
		return fail(http.StatusConflict, "%s isn't running", strings.ToLower(j.Label))
	}
	writeJSON(w, http.StatusOK, map[string]bool{"stopped": true})
	return nil
}

func (s *Server) securities(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.user(r); err != nil {
		return err
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(q) < 2 {
		writeJSON(w, http.StatusOK, []any{})
		return nil
	}
	secs, err := s.store.SearchSecurities(r.Context(), q, 20)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, secs)
	return nil
}

func (s *Server) setMove(w http.ResponseWriter, r *http.Request) error {
	u, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	var body struct {
		ISIN string `json:"isin"`
		To   string `json:"to"`
	}
	if err := readJSON(r, &body); err != nil {
		return err
	}
	isin := strings.ToUpper(strings.TrimSpace(body.ISIN))
	if len(isin) != 12 {
		return fail(http.StatusBadRequest, "only a holding with an ISIN can be moved")
	}
	target := ""
	if body.To != "" {
		secs, err := s.store.Sections(r.Context(), p.ID)
		if err != nil {
			return err
		}
		for _, sec := range secs {
			if sec.ID == body.To || (sec.Kind == body.To && sec.Kind != "custom") {
				target = sec.ID
				if sec.Valuation == kinds.Liability {
					return fail(http.StatusBadRequest, "a holding can't be counted as a loan")
				}
			}
		}
		if target == "" {
			k, ok := kinds.Get(body.To)
			if !ok || k.Key == "custom" || k.Valuation == kinds.Liability {
				return fail(http.StatusBadRequest, "no such section")
			}
			sec := sectionFromKind(p.ID, k)
			if err := s.store.CreateSection(r.Context(), &sec); err != nil {
				return err
			}
			target = sec.ID
		}
	}
	if err := s.store.SetMove(r.Context(), p.ID, isin, target); err != nil {
		return err
	}
	p, err = s.store.Portfolio(r.Context(), p.ID, u.ID)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, p)
	return nil
}

func (s *Server) reportPreview(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	subject, html, _, err := s.app.Report(r.Context(), p)
	if err != nil {
		return err
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("X-Report-Subject", url.QueryEscape(subject))
	_, err = io.WriteString(w, html)
	return err
}

func (s *Server) smtpTest(w http.ResponseWriter, r *http.Request) error {
	u, err := s.owner(r)
	if err != nil {
		return err
	}
	err = s.app.SendMail(r.Context(), []string{u.Email}, "Ebenezer can send email",
		"<p>This is a test from Ebenezer. Reports will arrive the same way.</p>", "This is a test from Ebenezer. Reports will arrive the same way.")
	if errors.Is(err, app.ErrNoSMTP) {
		return fail(http.StatusBadRequest, "%s", err.Error())
	}
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "detail": err.Error()})
		return nil
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "detail": "Sent to " + u.Email})
	return nil
}

func (s *Server) ledger(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	text, err := s.app.Ledger(r.Context(), p)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, map[string]string{"ledger": text, "defaultInstructions": app.DefaultInstructions})
	return nil
}

func (s *Server) ask(w http.ResponseWriter, r *http.Request) error {
	u, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	if !s.askByUser.allow(u.ID) {
		return fail(http.StatusTooManyRequests, "that's a lot of questions for one hour; give me a little while")
	}
	var body struct {
		Question string               `json:"question"`
		History  []openrouter.Message `json:"history"`
	}
	if err := readJSON(r, &body); err != nil {
		return err
	}
	q := strings.TrimSpace(body.Question)
	if q == "" || len(q) > 1000 {
		return fail(http.StatusBadRequest, "ask a question of up to 1000 characters")
	}
	answer, err := s.app.Ask(r.Context(), p, q, body.History)
	if err != nil {
		return s.aiFailure(r, u, err, "answer questions", "")
	}
	writeJSON(w, http.StatusOK, map[string]any{"answer": answer, "redacted": app.Redacted(answer)})
	return nil
}

func (s *Server) tidy(w http.ResponseWriter, r *http.Request) error {
	u, _, err := s.portfolio(r)
	if err != nil {
		return err
	}
	if !s.askByUser.allow(u.ID) {
		return fail(http.StatusTooManyRequests, "that's a lot of requests for one hour; give me a little while")
	}
	var ask app.TidyAsk
	if err := readJSONUpTo(r, &ask, 128<<10); err != nil {
		return err
	}
	ask.Change = strings.TrimSpace(ask.Change)
	if len(ask.Change) > 500 || (ask.Previous != "" && ask.Change == "") {
		return fail(http.StatusBadRequest, "say what to change in up to 500 characters")
	}
	t, err := s.app.TidyScript(r.Context(), ask)
	if errors.Is(err, app.ErrNoAI) {
		writeJSON(w, http.StatusOK, map[string]bool{"ai": false})
		return nil
	}
	if err != nil {
		return fail(http.StatusBadGateway, "%v", err)
	}
	writeJSON(w, http.StatusOK, map[string]any{"ai": true, "summary": t.Summary, "code": t.Code})
	return nil
}

var isinPattern = regexp.MustCompile(`^[A-Z]{2}[A-Z0-9]{9}[0-9]$`)

var holdingKey = regexp.MustCompile(`^([A-Z]{2}[A-Z0-9]{9}[0-9]|CRYPTO-[A-Z0-9]{1,15})$`)

type scripView struct {
	Security *store.Security  `json:"security"`
	History  []store.Close    `json:"history"`
	Holding  *store.Holding   `json:"holding"`
	News     []store.NewsItem `json:"news"`
	Trades   []value.Trade    `json:"trades"`
}

// scrip answers not found for a scrip outside the portfolio, so it cannot read another portfolio's news.
func (s *Server) scrip(w http.ResponseWriter, r *http.Request) error {
	_, p, err := s.portfolio(r)
	if err != nil {
		return err
	}
	isin := r.PathValue("isin")
	if !holdingKey.MatchString(isin) {
		return fail(http.StatusNotFound, "no such scrip")
	}
	ctx := r.Context()
	secs, err := s.store.Sections(ctx, p.ID)
	if err != nil {
		return err
	}
	out := scripView{History: []store.Close{}, News: []store.NewsItem{}, Trades: []value.Trade{}}
	for _, sec := range secs {
		hs, err := s.store.Holdings(ctx, sec.ID)
		if err != nil {
			return err
		}
		for i := range hs {
			if hs[i].ISIN != isin {
				continue
			}
			if out.Holding == nil || hs[i].Quantity > out.Holding.Quantity {
				out.Holding = &hs[i]
			}
			ts, err := s.app.Trades(ctx, sec, hs[i].Key)
			if err != nil {
				return err
			}
			out.Trades = append(out.Trades, ts...)
		}
	}
	sort.SliceStable(out.Trades, func(i, j int) bool { return out.Trades[i].Day.After(out.Trades[j].Day) })
	if out.Holding == nil {
		return fail(http.StatusNotFound, "no such scrip")
	}
	known, err := s.store.SecuritiesByISIN(ctx, []string{isin})
	if err != nil {
		return err
	}
	if sec, ok := known[isin]; ok {
		out.Security = &sec
	}
	if out.History, err = s.store.PriceHistory(ctx, isin, time.Now().AddDate(-1, 0, 0)); err != nil {
		return err
	}
	codes := map[string]bool{strings.ToUpper(out.Holding.Symbol): out.Holding.Symbol != ""}
	if out.Security != nil {
		codes[strings.ToUpper(out.Security.Symbol)] = out.Security.Symbol != ""
		codes[out.Security.BSECode] = out.Security.BSECode != ""
	}
	items, err := s.store.News(ctx, p.ID, time.Now().AddDate(0, 0, -30), 500)
	if err != nil {
		return err
	}
	for _, it := range items {
		for _, c := range append(it.About, it.Scrips...) {
			if codes[strings.ToUpper(c)] {
				out.News = append(out.News, it)
				break
			}
		}
	}
	writeJSON(w, http.StatusOK, out)
	return nil
}
