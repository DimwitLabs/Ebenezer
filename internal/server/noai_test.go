package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

// refusal sends a request that should be refused and keeps the body, which do drops.
func (c *client) refusal(want int, method, path string, body any) (out struct{ Code, Error string }) {
	c.t.Helper()
	b, _ := json.Marshal(body)
	req, _ := http.NewRequest(method, c.base+path, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Ebenezer-Request", "1")
	res, err := c.http.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != want {
		c.t.Fatalf("%s %s: status %d, want %d", method, path, res.StatusCode, want)
	}
	_ = json.NewDecoder(res.Body).Decode(&out)
	return out
}

func TestWithoutAModelEachPersonIsToldWhoCanConnectOne(t *testing.T) {
	ts := newTestServer(t)
	owner, pid, _ := setUp(t, ts)
	owner.must(http.StatusOK, "POST", "/api/portfolios/"+pid+"/invite", map[string]any{"email": "asha@example.com", "name": "Asha", "password": "a first long password"}, nil)
	guest := newClient(t, ts)
	guest.firstSignIn("asha@example.com", "a first long password")

	said := owner.refusal(http.StatusConflict, "POST", "/api/portfolios/"+pid+"/expenses/chat", map[string]any{"message": "swiggy 450"})
	if said.Code != "no_ai" || !strings.Contains(said.Error, "Connect an AI model in Admin") {
		t.Fatalf("owner told %+v", said)
	}
	said = guest.refusal(http.StatusConflict, "POST", "/api/portfolios/"+pid+"/ask", map[string]any{"question": "how am I doing"})
	if said.Code != "no_ai" || !strings.HasPrefix(said.Error, "Talk to Owner, who invited you.") {
		t.Fatalf("guest told %+v", said)
	}
}
