package app

import (
	"reflect"
	"strings"
	"testing"
)

func TestSplitFollowUps(t *testing.T) {
	for _, c := range []struct {
		name, said, answer string
		ups                []string
	}{
		{"none", "Your stocks trail the index.\n\nThat is all.", "Your stocks trail the index.\n\nThat is all.", nil},
		{"plain", "Your stocks trail the index.\nFOLLOW-UPS:\nWhich section did worst?\nHow much is idle?", "Your stocks trail the index.", []string{"Which section did worst?", "How much is idle?"}},
		{"dressed", "Fine.\n\n**Follow-ups:**\n- \"What has trading cost me?\"\n2. How long have I held my stocks?\n* Is my cover enough?", "Fine.", []string{"What has trading cost me?", "How long have I held my stocks?", "Is my cover enough?"}},
		{"same line", "Fine.\nFOLLOW-UPS: What do I owe?", "Fine.", []string{"What do I owe?"}},
		{"capped", "Fine.\nFOLLOW-UPS:\nA?\nB?\nC?\nD?", "Fine.", []string{"A?", "B?", "C?"}},
		{"no calls", "Fine.\nFOLLOW-UPS:\nShould I sell ITC?\nWhich fund should I buy?\nIs now a good time to buy more Reliance?\nWhat has selling cost me?\nHow much of what I hold is in one holding?", "Fine.", []string{"What has selling cost me?", "How much of what I hold is in one holding?"}},
		{"empty block", "Fine.\nFOLLOW-UPS:\n\n", "Fine.", nil},
		{"only block", "FOLLOW-UPS:\nWhat do I owe?", "What do I owe?", nil},
	} {
		answer, ups := splitFollowUps(c.said)
		if answer != c.answer || !reflect.DeepEqual(ups, c.ups) {
			t.Errorf("%s: got %q %q, want %q %q", c.name, answer, ups, c.answer, c.ups)
		}
		if strings.Contains(strings.ToUpper(answer), "FOLLOW-UPS") {
			t.Errorf("%s: the marker leaked into %q", c.name, answer)
		}
	}
	_, ups := splitFollowUps("Fine.\nFOLLOW-UPS:\n" + strings.Repeat("How much did I spend on food and fuel last month ", 3) + "?")
	if len(ups) != 1 || len([]rune(ups[0])) > 81 || !strings.HasSuffix(ups[0], "…") {
		t.Errorf("long follow-up not cut: %q", ups)
	}
}
