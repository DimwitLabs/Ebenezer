package market

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// UserAgent looks like a browser, as BSE sits behind Akamai and turns away anything that does not.
const UserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"

// IST is India Standard Time, which trading days and closing files follow whatever the server's zone.
var IST = time.FixedZone("IST", 5*3600+1800)

var ErrNoData = errors.New("no data for that day")

// ErrBlocked means a web page came where a file should be, which is usually a bot wall, not a holiday, so it must not be read as one.
var ErrBlocked = errors.New("got a web page instead of the file")

type Client struct {
	HTTP *http.Client
}

func New() *Client {
	return &Client{HTTP: &http.Client{Timeout: 60 * time.Second}}
}

func (c *Client) get(ctx context.Context, url, referer string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", UserAgent)
	req.Header.Set("Accept", "*/*")
	req.Header.Set("Accept-Language", "en-GB,en;q=0.9")
	if referer != "" {
		req.Header.Set("Referer", referer)
		req.Header.Set("Origin", strings.TrimSuffix(referer, "/"))
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 64<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode == http.StatusNotFound {
		return nil, ErrNoData
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s: %s", url, resp.Status)
	}
	return body, nil
}

type Quote struct {
	ISIN     string
	Symbol   string
	BSECode  string
	Name     string
	Kind     string
	Day      time.Time
	Close    float64
	Category string
}

type IndexClose struct {
	Name  string
	Day   time.Time
	Close float64
	PE    *float64
	PB    *float64
	DY    *float64
}

func (c *Client) BSE(ctx context.Context, day time.Time) ([]Quote, error) {
	body, err := c.get(ctx, "https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_"+day.Format("20060102")+"_F_0000.CSV", "https://www.bseindia.com/")
	if err != nil {
		return nil, err
	}
	return ParseBhavcopy(body, "bse")
}

func (c *Client) NSE(ctx context.Context, day time.Time) ([]Quote, error) {
	body, err := c.get(ctx, "https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_"+day.Format("20060102")+"_F_0000.csv.zip", "https://www.nseindia.com/")
	if err != nil {
		return nil, err
	}
	zr, err := zip.NewReader(bytes.NewReader(body), int64(len(body)))
	if err != nil {
		if looksLikeHTML(body) {
			return nil, ErrBlocked
		}
		return nil, err
	}
	for _, f := range zr.File {
		rc, err := f.Open()
		if err != nil {
			return nil, err
		}
		data, err := io.ReadAll(rc)
		rc.Close()
		if err != nil {
			return nil, err
		}
		return ParseBhavcopy(data, "nse")
	}
	return nil, ErrNoData
}

func (c *Client) AMFI(ctx context.Context) ([]Quote, error) {
	body, err := c.get(ctx, "https://portal.amfiindia.com/spages/NAVAll.txt", "")
	if err != nil {
		return nil, err
	}
	return ParseAMFI(body)
}

func (c *Client) AMFIHistory(ctx context.Context, from, to time.Time) ([]Quote, error) {
	body, err := c.get(ctx, "https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx?frmdt="+from.Format("02-Jan-2006")+"&todt="+to.Format("02-Jan-2006"), "")
	if err != nil {
		return nil, err
	}
	return ParseAMFIHistory(body)
}

func (c *Client) Indices(ctx context.Context, day time.Time) ([]IndexClose, error) {
	body, err := c.get(ctx, "https://nsearchives.nseindia.com/content/indices/ind_close_all_"+day.Format("02012006")+".csv", "https://www.nseindia.com/")
	if err != nil {
		return nil, err
	}
	return ParseIndices(body, day)
}

func looksLikeHTML(b []byte) bool {
	head := strings.ToLower(strings.TrimSpace(string(b[:min(len(b), 200)])))
	return strings.HasPrefix(head, "<") || strings.Contains(head, "<html")
}

func readCSV(body []byte) ([]map[string]string, error) {
	if looksLikeHTML(body) {
		return nil, ErrBlocked
	}
	r := csv.NewReader(bytes.NewReader(bytes.TrimPrefix(body, []byte("\xef\xbb\xbf"))))
	r.FieldsPerRecord = -1
	r.TrimLeadingSpace = true
	records, err := r.ReadAll()
	if err != nil {
		return nil, err
	}
	if len(records) < 2 {
		return nil, ErrNoData
	}
	header := records[0]
	out := make([]map[string]string, 0, len(records)-1)
	for _, rec := range records[1:] {
		m := make(map[string]string, len(header))
		for i, h := range header {
			if i < len(rec) {
				m[strings.TrimSpace(h)] = strings.TrimSpace(rec[i])
			}
		}
		out = append(out, m)
	}
	return out, nil
}

// ParseBhavcopy parses either exchange's closing file, as both publish the same UDiFF layout.
func ParseBhavcopy(body []byte, exchange string) ([]Quote, error) {
	rows, err := readCSV(body)
	if err != nil {
		return nil, err
	}
	out := []Quote{}
	for _, r := range rows {
		isin := strings.ToUpper(r["ISIN"])
		if len(isin) != 12 {
			continue
		}
		close, err := strconv.ParseFloat(r["ClsPric"], 64)
		if err != nil || close <= 0 {
			continue
		}
		day, err := time.Parse("2006-01-02", r["TradDt"])
		if err != nil {
			continue
		}
		q := Quote{ISIN: isin, Name: r["FinInstrmNm"], Day: day, Close: close, Kind: kindOf(isin, r["SctySrs"])}
		if exchange == "bse" {
			q.BSECode = r["FinInstrmId"]
			q.Symbol = r["TckrSymb"]
		} else {
			if s := r["SctySrs"]; s != "" && s != "EQ" && s != "BE" && s != "BZ" && s != "SM" && s != "ST" && q.Kind == "stock" {
				continue
			}
			q.Symbol = r["TckrSymb"]
		}
		out = append(out, q)
	}
	if len(out) == 0 {
		return nil, ErrNoData
	}
	return out, nil
}

func kindOf(isin, series string) string {
	switch {
	case strings.HasPrefix(isin, "INF"):
		return "fund"
	case strings.HasPrefix(isin, "IN0"), series == "GB", series == "GS", series == "N1":
		return "bond"
	}
	return "stock"
}

func ParseAMFI(body []byte) ([]Quote, error) {
	out := []Quote{}
	category := ""
	for _, line := range strings.Split(string(body), "\n") {
		parts := strings.Split(strings.TrimSpace(line), ";")
		if len(parts) == 1 {
			if c, ok := amfiCategory(parts[0]); ok {
				category = c
			}
			continue
		}
		if len(parts) < 6 {
			continue
		}
		nav, err := strconv.ParseFloat(strings.TrimSpace(parts[len(parts)-2]), 64)
		if err != nil || nav <= 0 {
			continue
		}
		day, err := time.Parse("02-Jan-2006", strings.TrimSpace(parts[len(parts)-1]))
		if err != nil {
			continue
		}
		name := strings.TrimSpace(parts[3])
		if len(parts) >= 8 {
			name = strings.Join(nonEmpty(name, parts[4], parts[5]), " - ")
		}
		for _, isin := range parts[1:3] {
			isin = strings.ToUpper(strings.TrimSpace(isin))
			if len(isin) == 12 {
				out = append(out, Quote{ISIN: isin, Symbol: strings.TrimSpace(parts[0]), Name: name, Kind: "fund", Day: day, Close: nav, Category: category})
			}
		}
	}
	if len(out) == 0 {
		return nil, ErrNoData
	}
	return out, nil
}

var amfiHeading = regexp.MustCompile(`^[A-Za-z ]+Schemes\s*\((.+)\)$`)

// amfiCategory reads a category heading; AMFI lists schemes under them, and each belongs to the heading above it.
func amfiCategory(line string) (string, bool) {
	m := amfiHeading.FindStringSubmatch(strings.TrimSpace(line))
	if m == nil {
		return "", false
	}
	c := m[1]
	if i := strings.LastIndex(c, " - "); i >= 0 {
		c = c[i+3:]
	}
	c = strings.TrimSpace(strings.TrimSuffix(strings.TrimSuffix(strings.TrimSpace(c), " Fund"), " Funds"))
	if strings.HasPrefix(c, "ELSS") {
		c = "ELSS"
	}
	return c, c != ""
}

// Industries fetches each company's industry from Nifty Total Market, which covers about 750 companies, nearly all of what people hold.
func (c *Client) Industries(ctx context.Context) (map[string]string, error) {
	body, err := c.get(ctx, "https://nsearchives.nseindia.com/content/indices/ind_niftytotalmarket_list.csv", "https://www.nseindia.com/")
	if err != nil {
		return nil, err
	}
	return ParseIndustries(body)
}

func ParseIndustries(body []byte) (map[string]string, error) {
	rows, err := readCSV(body)
	if err != nil {
		return nil, err
	}
	out := map[string]string{}
	for _, r := range rows {
		isin, ind := strings.ToUpper(r["ISIN Code"]), r["Industry"]
		if len(isin) == 12 && ind != "" {
			out[isin] = ind
		}
	}
	if len(out) == 0 {
		return nil, ErrNoData
	}
	return out, nil
}

// ParseAMFIHistory parses the history report, which orders its columns differently from NAVAll.txt and whose name already carries the plan and option.
func ParseAMFIHistory(body []byte) ([]Quote, error) {
	if looksLikeHTML(body) {
		return nil, ErrBlocked
	}
	out := []Quote{}
	for _, line := range strings.Split(string(body), "\n") {
		parts := strings.Split(strings.TrimSpace(line), ";")
		if len(parts) < 8 {
			continue
		}
		nav, err := strconv.ParseFloat(strings.TrimSpace(parts[6]), 64)
		if err != nil || nav <= 0 {
			continue
		}
		day, err := time.Parse("02-Jan-2006", strings.TrimSpace(parts[7]))
		if err != nil {
			continue
		}
		for _, isin := range parts[4:6] {
			isin = strings.ToUpper(strings.TrimSpace(isin))
			if len(isin) == 12 {
				out = append(out, Quote{ISIN: isin, Symbol: strings.TrimSpace(parts[0]), Name: strings.TrimSpace(parts[1]), Kind: "fund", Day: day, Close: nav})
			}
		}
	}
	if len(out) == 0 {
		return nil, ErrNoData
	}
	return out, nil
}

func nonEmpty(parts ...string) []string {
	out := []string{}
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" && p != "-" {
			out = append(out, p)
		}
	}
	return out
}

// ParseIndices parses NSE index closes for day, taken from the file's name: some NSE files carry it with month and date swapped inside.
func ParseIndices(body []byte, day time.Time) ([]IndexClose, error) {
	rows, err := readCSV(body)
	if err != nil {
		return nil, err
	}
	out := []IndexClose{}
	for _, r := range rows {
		close, err := strconv.ParseFloat(r["Closing Index Value"], 64)
		if err != nil {
			continue
		}
		out = append(out, IndexClose{Name: currentName(r["Index Name"]), Day: day, Close: close, PE: optional(r["P/E"]), PB: optional(r["P/B"]), DY: optional(r["Div Yield"])})
	}
	if len(out) == 0 {
		return nil, ErrNoData
	}
	return out, nil
}

// renamed reads older files under today's names, as NSE dropped "S&P CNX" and "CNX" for "Nifty" in late 2015.
var renamed = map[string]string{
	"CNX Nifty": "Nifty 50", "CNX Nifty Junior": "Nifty Next 50", "CNX 100": "Nifty 100", "CNX 200": "Nifty 200", "CNX 500": "Nifty 500",
	"CNX Midcap": "NIFTY Midcap 100", "CNX Smallcap": "NIFTY Smallcap 100", "CNX Bank": "Nifty Bank", "CNX IT": "Nifty IT", "CNX Auto": "Nifty Auto",
	"CNX Energy": "Nifty Energy", "CNX FMCG": "Nifty FMCG", "CNX Finance": "Nifty Financial Services", "CNX Infrastructure": "Nifty Infrastructure",
	"CNX MNC": "Nifty MNC", "CNX Media": "Nifty Media", "CNX Metal": "Nifty Metal", "CNX Pharma": "Nifty Pharma", "CNX PSE": "Nifty PSE",
	"CNX PSU Bank": "Nifty PSU Bank", "CNX Realty": "Nifty Realty", "CNX Commodities": "Nifty Commodities", "CNX Consumption": "Nifty India Consumption",
	"CNX Service Sector": "Nifty Services Sector", "CNX Dividend Opportunities": "Nifty Dividend Opportunities 50", "CNX Alpha Index": "Nifty Alpha 50",
	"CNX High Beta": "Nifty High Beta 50", "CNX Low Volatility": "Nifty Low Volatility 50", "CNX Nifty Shariah": "Nifty50 Shariah",
	"CNX 500 Shariah": "Nifty500 Shariah", "CNX Shariah25": "Nifty Shariah 25", "CNX 100 Equal Weight": "Nifty100 Equal Weight",
	"CNX Nifty Dividend": "Nifty50 Dividend Points",
}

func currentName(name string) string {
	name = strings.TrimSpace(name)
	if now, ok := renamed[strings.TrimPrefix(name, "S&P ")]; ok {
		return now
	}
	return name
}

func optional(s string) *float64 {
	f, err := strconv.ParseFloat(strings.TrimSpace(s), 64)
	if err != nil {
		return nil
	}
	return &f
}
