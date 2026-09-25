package tokensource

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type fakeEndpoint struct {
	calls    atomic.Int32
	fail     atomic.Bool
	lifetime time.Duration
	now      func() time.Time

	mu       sync.Mutex
	lastAuth string
	lastType string
	lastBody string
}

func (f *fakeEndpoint) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	n := f.calls.Add(1)
	body, _ := io.ReadAll(r.Body)
	f.mu.Lock()
	f.lastAuth = r.Header.Get("Authorization")
	f.lastType = r.Header.Get("Content-Type")
	f.lastBody = string(body)
	f.mu.Unlock()

	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if f.fail.Load() {
		http.Error(w, strings.Repeat("x", 500), http.StatusBadGateway)
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]string{
		"token":     fmt.Sprintf("token-%d", n),
		"expiresAt": f.now().Add(f.lifetime).Format(time.RFC3339),
	})
}

type clock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *clock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *clock) Advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.t = c.t.Add(d)
}

func setup(t *testing.T) (*Source, *fakeEndpoint, *clock) {
	t.Helper()
	clk := &clock{t: time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)}
	endpoint := &fakeEndpoint{lifetime: 10 * time.Minute, now: clk.Now}
	server := httptest.NewServer(endpoint)
	t.Cleanup(server.Close)

	src := New(server.URL, "s3cret", "stack-1", slog.New(slog.NewTextHandler(io.Discard, nil)))
	src.now = clk.Now
	return src, endpoint, clk
}

func mustToken(t *testing.T, src *Source) string {
	t.Helper()
	token, err := src.Token(context.Background())
	if err != nil {
		t.Fatalf("Token: %v", err)
	}
	return token
}

func TestRequestHeadersAndBody(t *testing.T) {
	src, endpoint, _ := setup(t)
	mustToken(t, src)

	endpoint.mu.Lock()
	defer endpoint.mu.Unlock()
	if endpoint.lastAuth != "Bearer s3cret" {
		t.Errorf("Authorization = %q", endpoint.lastAuth)
	}
	if endpoint.lastType != "application/json" {
		t.Errorf("Content-Type = %q", endpoint.lastType)
	}
	if endpoint.lastBody != `{"stackId":"stack-1"}` {
		t.Errorf("body = %q", endpoint.lastBody)
	}
}

func TestCachesToken(t *testing.T) {
	src, endpoint, clk := setup(t)
	first := mustToken(t, src)
	clk.Advance(7 * time.Minute)
	second := mustToken(t, src)

	if first != second {
		t.Errorf("token changed from %q to %q", first, second)
	}
	if got := endpoint.calls.Load(); got != 1 {
		t.Errorf("endpoint called %d times, want 1", got)
	}
}

func TestRefreshesBeforeExpiry(t *testing.T) {
	src, endpoint, clk := setup(t)
	first := mustToken(t, src)
	clk.Advance(8*time.Minute + time.Second)
	second := mustToken(t, src)

	if first == second {
		t.Errorf("token was not refreshed")
	}
	if got := endpoint.calls.Load(); got != 2 {
		t.Errorf("endpoint called %d times, want 2", got)
	}
}

func TestShortLifetimeRefreshesAfterThreeQuarters(t *testing.T) {
	src, endpoint, clk := setup(t)
	endpoint.lifetime = 4 * time.Minute
	mustToken(t, src)
	clk.Advance(2 * time.Minute)
	mustToken(t, src)
	if got := endpoint.calls.Load(); got != 1 {
		t.Fatalf("endpoint called %d times after half the lifetime, want 1", got)
	}
	clk.Advance(time.Minute + time.Second)
	mustToken(t, src)
	if got := endpoint.calls.Load(); got != 2 {
		t.Errorf("endpoint called %d times after three quarters, want 2", got)
	}
}

func TestKeepsValidTokenWhenRefreshFails(t *testing.T) {
	src, endpoint, clk := setup(t)
	first := mustToken(t, src)
	clk.Advance(9 * time.Minute)
	endpoint.fail.Store(true)

	if got := mustToken(t, src); got != first {
		t.Errorf("token = %q, want the old token %q", got, first)
	}
}

func TestFailsWhenTokenExpiredAndRefreshFails(t *testing.T) {
	src, endpoint, clk := setup(t)
	mustToken(t, src)
	clk.Advance(11 * time.Minute)
	endpoint.fail.Store(true)

	_, err := src.Token(context.Background())
	if err == nil {
		t.Fatal("expected an error")
	}
	if !strings.Contains(err.Error(), "502") {
		t.Errorf("error lacks the status code: %v", err)
	}
	if n := strings.Count(err.Error(), "x"); n > maxErrorBody {
		t.Errorf("error contains %d body bytes, want at most %d", n, maxErrorBody)
	}
	if strings.Contains(err.Error(), "s3cret") {
		t.Errorf("error leaks the secret: %v", err)
	}
}

func TestClientOptionSetsHeader(t *testing.T) {
	src, _, _ := setup(t)
	var seen string
	inner := runnerFunc(func(r *http.Request) (*http.Response, error) {
		seen = r.Header.Get("X-Access-Token")
		return &http.Response{StatusCode: http.StatusOK, Body: http.NoBody}, nil
	})
	runner, err := src.ClientOption()(context.Background(), inner)
	if err != nil {
		t.Fatalf("ClientOption: %v", err)
	}
	req := httptest.NewRequest(http.MethodGet, "http://api.example/v2/projects", nil)
	if _, err := runner.Do(req); err != nil {
		t.Fatalf("Do: %v", err)
	}
	if seen != "token-1" {
		t.Errorf("X-Access-Token = %q, want token-1", seen)
	}
}

func TestConcurrentUse(t *testing.T) {
	src, endpoint, clk := setup(t)
	var wg sync.WaitGroup
	for i := range 50 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if i%10 == 0 {
				clk.Advance(time.Minute)
			}
			if _, err := src.Token(context.Background()); err != nil {
				t.Errorf("Token: %v", err)
			}
		}()
	}
	wg.Wait()
	if got := endpoint.calls.Load(); got != 1 {
		t.Errorf("endpoint called %d times, want 1", got)
	}
}

type runnerFunc func(*http.Request) (*http.Response, error)

func (f runnerFunc) Do(r *http.Request) (*http.Response, error) { return f(r) }
