package engine

import (
	"context"
	"strconv"
	"sync"
	"time"

	"github.com/moby/moby/api/types/events"

	"github.com/hermsi1337/mstudio-ci-runner-extension/docker/docker-api/internal/state"
)

// Docker Compose follows containers through /events: `up` in the foreground
// learns there when a container ends. Create, start, stop and remove happen
// in the engine; that a process ended is noticed by watching the state files.

type eventBus struct {
	mu      sync.Mutex
	subs    map[chan events.Message]struct{}
	history []events.Message
}

const eventHistory = 256

func newEventBus() *eventBus {
	return &eventBus{subs: map[chan events.Message]struct{}{}}
}

func (b *eventBus) publish(m events.Message) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.history = append(b.history, m)
	if len(b.history) > eventHistory {
		b.history = b.history[len(b.history)-eventHistory:]
	}
	for ch := range b.subs {
		select {
		case ch <- m:
		default:
		}
	}
}

func (b *eventBus) subscribe(since time.Time) (chan events.Message, []events.Message) {
	b.mu.Lock()
	defer b.mu.Unlock()
	ch := make(chan events.Message, 256)
	b.subs[ch] = struct{}{}
	var past []events.Message
	if !since.IsZero() {
		for _, m := range b.history {
			if m.TimeNano >= since.UnixNano() {
				past = append(past, m)
			}
		}
	}
	return ch, past
}

func (b *eventBus) unsubscribe(ch chan events.Message) {
	b.mu.Lock()
	defer b.mu.Unlock()
	delete(b.subs, ch)
}

func (e *Engine) emit(c *state.Container, action events.Action, extra map[string]string) {
	attrs := map[string]string{"name": c.Name, "image": c.Image}
	for k, v := range c.Labels {
		attrs[k] = v
	}
	for k, v := range extra {
		attrs[k] = v
	}
	now := time.Now()
	e.events.publish(events.Message{
		Type:     events.ContainerEventType,
		Action:   action,
		Actor:    events.Actor{ID: c.ID, Attributes: attrs},
		Scope:    "local",
		Time:     now.Unix(),
		TimeNano: now.UnixNano(),
	})
}

// watchExits emits die for every run that ended since the last look.
func (e *Engine) watchExits(ctx context.Context) {
	seen := map[string]int{}
	for {
		for _, c := range e.containers() {
			if c.Virtual != "" {
				continue
			}
			ex, err := e.dir(c.ID).Exit()
			if err != nil {
				continue
			}
			if last, ok := seen[c.ID]; ok && last >= ex.Generation {
				continue
			}
			if _, known := seen[c.ID]; known || time.Since(ex.FinishedAt) < 5*time.Second {
				e.emit(c, events.ActionDie, map[string]string{"exitCode": strconv.Itoa(ex.Code)})
			}
			seen[c.ID] = ex.Generation
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(300 * time.Millisecond):
		}
	}
}

// EventFilter matches the filters of GET /events that clients use.
func (f Filters) matchEvent(m events.Message) bool {
	for key, values := range f {
		ok := false
		for _, v := range values {
			switch key {
			case "type":
				ok = string(m.Type) == v
			case "event":
				ok = string(m.Action) == v
			case "container":
				ok = m.Actor.ID == v || m.Actor.Attributes["name"] == v || (len(v) >= 12 && len(m.Actor.ID) >= len(v) && m.Actor.ID[:len(v)] == v)
			case "image":
				ok = m.Actor.Attributes["image"] == v
			case "label":
				ok = matchLabels(m.Actor.Attributes, []string{v})
			default:
				ok = true
			}
			if ok {
				break
			}
		}
		if !ok {
			return false
		}
	}
	return true
}

// Events streams matching events until ctx ends or until passes.
func (e *Engine) Events(ctx context.Context, since, until time.Time, filters Filters, send func(events.Message) error) error {
	ch, past := e.events.subscribe(since)
	defer e.events.unsubscribe(ch)
	for _, m := range past {
		if filters.matchEvent(m) {
			if err := send(m); err != nil {
				return err
			}
		}
	}
	var deadline <-chan time.Time
	if !until.IsZero() {
		deadline = time.After(time.Until(until))
	}
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-deadline:
			return nil
		case m := <-ch:
			if filters.matchEvent(m) {
				if err := send(m); err != nil {
					return err
				}
			}
		}
	}
}
