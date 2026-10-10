package app

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

// Rupees formats an amount with Indian grouping (1,23,456) and losses in brackets, matching the web app.
func Rupees(n float64) string {
	r := math.Round(n)
	return bracket(r < 0, "₹"+group(int64(math.Abs(r))))
}

func Short(n float64) string {
	a := math.Abs(n)
	switch {
	case a >= 1e7:
		digits := 2
		if a >= 1e9 {
			digits = 0
		}
		return bracket(n < 0, fmt.Sprintf("₹%.*f\u202fCr", digits, a/1e7))
	case a >= 1e5:
		return bracket(n < 0, fmt.Sprintf("₹%.2f\u202fL", a/1e5))
	}
	return Rupees(n)
}

// Compact shows thousands as k, then lakh and crore, so a note says "₹2k" rather than "₹2,046".
func Compact(n float64) string {
	a := math.Abs(n)
	switch {
	case a >= 1e5:
		return Short(n)
	case a >= 1e3:
		return bracket(n < 0, "₹"+strings.TrimSuffix(strconv.FormatFloat(a/1e3, 'f', 1, 64), ".0")+"k")
	}
	return Rupees(n)
}

func CompactSigned(n float64) string {
	if n > 0 {
		return "+" + Compact(n)
	}
	return Compact(n)
}

func Signed(n float64) string {
	if n > 0 {
		return "+" + Short(n)
	}
	return Short(n)
}

func Pct(x float64) string {
	s := strconv.FormatFloat(math.Abs(x*100), 'f', 1, 64) + "%"
	switch {
	case s == "0.0%":
		return s
	case x > 0:
		return "+" + s
	}
	return "(" + s + ")"
}

func PlainPct(x float64, digits int) string {
	return strconv.FormatFloat(x*100, 'f', digits, 64) + "%"
}

func bracket(negative bool, s string) string {
	if negative {
		return "(" + s + ")"
	}
	return s
}

func group(n int64) string {
	s := strconv.FormatInt(n, 10)
	if len(s) <= 3 {
		return s
	}
	head, tail := s[:len(s)-3], s[len(s)-3:]
	var parts []string
	for len(head) > 2 {
		parts = append([]string{head[len(head)-2:]}, parts...)
		head = head[:len(head)-2]
	}
	if head != "" {
		parts = append([]string{head}, parts...)
	}
	return strings.Join(parts, ",") + "," + tail
}

func Count(n int) string { return group(int64(n)) }
