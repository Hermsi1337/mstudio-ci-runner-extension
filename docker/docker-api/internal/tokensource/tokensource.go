// Package tokensource fetches short-lived mittwald API tokens from the
// extension instead of reading a static token from the environment.
package tokensource

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/mittwald/api-client-go/mittwaldv2"
	"github.com/mittwald/api-client-go/pkg/httpclient"
)

const (
	accessTokenHeader = "X-Access-Token"
	refreshMargin     = 2 * time.Minute
	requestTimeout    = 15 * time.Second
	maxErrorBody      = 200
)

type Source struct {
	url     string
	secret  string
	stackID string
	client  *http.Client
	logger  *slog.Logger
	now     func() time.Time

	mu        sync.Mutex
	token     string
	expiresAt time.Time
	refreshAt time.Time
}

func New(url, secret, stackID string, logger *slog.Logger) *Source {
	return &Source{
		url:     url,
		secret:  secret,
		stackID: stackID,
		client:  &http.Client{Timeout: requestTimeout},
		logger:  logger,
		now:     time.Now,
	}
}

// Token returns the cached token and fetches a new one once it is within
// refreshMargin of its expiry, or within a quarter of its lifetime when that
// is shorter. A token that is still valid outlives a failed
// refresh, so a short outage of the extension does not stop the adapter.
func (s *Source) Token(ctx context.Context) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := s.now()
	if s.token != "" && now.Before(s.refreshAt) {
		return s.token, nil
	}

	token, expiresAt, err := s.fetch(ctx)
	if err != nil {
		if s.token != "" && now.Before(s.expiresAt) {
			s.logger.Warn("Failed to refresh the API token, using the current one until it expires",
				"error", err, "expiresAt", s.expiresAt)
			return s.token, nil
		}
		return "", err
	}

	s.token = token
	s.expiresAt = expiresAt
	// The lifetime of an instance token is not documented. A short one is
	// refreshed after three quarters of it instead of on every request.
	margin := min(refreshMargin, expiresAt.Sub(now)/4)
	s.refreshAt = expiresAt.Add(-margin)
	s.logger.Debug("Fetched a new API token", "expiresAt", expiresAt)
	return token, nil
}

func (s *Source) ClientOption() mittwaldv2.ClientOption {
	return func(_ context.Context, inner httpclient.RequestRunner) (httpclient.RequestRunner, error) {
		return &authenticatedRunner{source: s, inner: inner}, nil
	}
}

type tokenRequest struct {
	StackID string `json:"stackId"`
}

type tokenResponse struct {
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expiresAt"`
}

func (s *Source) fetch(ctx context.Context) (string, time.Time, error) {
	body, err := json.Marshal(tokenRequest{StackID: s.stackID})
	if err != nil {
		return "", time.Time{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.url, bytes.NewReader(body))
	if err != nil {
		return "", time.Time{}, fmt.Errorf("building the token request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+s.secret)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("requesting an API token: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, maxErrorBody))
		return "", time.Time{}, fmt.Errorf("token endpoint answered with status %d: %s", resp.StatusCode, snippet)
	}

	var parsed tokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return "", time.Time{}, fmt.Errorf("decoding the token response: %w", err)
	}
	if parsed.Token == "" || parsed.ExpiresAt.IsZero() {
		return "", time.Time{}, errors.New("token response lacks token or expiresAt")
	}
	return parsed.Token, parsed.ExpiresAt, nil
}

type authenticatedRunner struct {
	source *Source
	inner  httpclient.RequestRunner
}

func (r *authenticatedRunner) Do(req *http.Request) (*http.Response, error) {
	token, err := r.source.Token(req.Context())
	if err != nil {
		return nil, fmt.Errorf("fetching an API token: %w", err)
	}
	req.Header.Set(accessTokenHeader, token)
	return r.inner.Do(req)
}
