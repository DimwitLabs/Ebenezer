package value

import (
	"strconv"
	"strings"
	"time"
)

func Number(v any) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case int:
		return float64(n), true
	case string:
		s := strings.TrimSpace(n)
		neg := strings.HasPrefix(s, "(") && strings.HasSuffix(s, ")")
		s = strings.Trim(s, "()")
		s = strings.NewReplacer(",", "", "₹", "", "Rs.", "", "Rs", "", "INR", "", "%", "", " ", "").Replace(s)
		if s == "" {
			return 0, false
		}
		f, err := strconv.ParseFloat(s, 64)
		if err != nil {
			return 0, false
		}
		if neg {
			f = -f
		}
		return f, true
	}
	return 0, false
}

var dateLayouts = []string{
	"2006-01-02", "02-Jan-2006", "2-Jan-2006", "02 Jan 2006", "2 Jan 2006", "02-01-2006", "02/01/2006",
	"2/1/2006", "02-Jan-06", "Jan 2, 2006", "2006/01/02", "02.01.2006", "20060102", time.RFC3339,
	"2006-01-02 15:04:05", "2006-01-02T15:04:05", "02-01-2006 15:04:05", "02/01/2006 15:04:05", "02-Jan-2006 15:04:05",
}

func Date(v any) (time.Time, bool) {
	s, ok := v.(string)
	if !ok {
		return time.Time{}, false
	}
	s = strings.TrimSpace(s)
	for _, layout := range dateLayouts {
		if t, err := time.ParseInLocation(layout, s, time.UTC); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

func Text(v any) string {
	switch t := v.(type) {
	case string:
		return strings.TrimSpace(t)
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	}
	return ""
}
