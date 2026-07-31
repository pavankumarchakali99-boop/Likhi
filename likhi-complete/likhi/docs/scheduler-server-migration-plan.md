# Server-Side Scheduler Migration Plan

**Status: documented, not implemented.** Per the frozen Milestone 8 scope, this
is a plan to follow later, not code to ship now. Nothing in this document
changes the current client-only application.

## Why this is needed

`engines/scheduler/scheduler.js` currently drives autonomous behavior with a
browser `setInterval`. This works only while the tab is open — closing the
tab, backgrounding it for long enough, or the device sleeping all stop
autonomy. A true "living world" that keeps running when nobody is watching
needs a tick source that isn't tied to a browser tab.

This was flagged as a known, intentional limitation as early as Milestone 6
and is not a bug — it's the boundary of what a client-only build can do.

## What does NOT need to change

Scheduler Engine was deliberately built with this migration in mind:

- `tick(now)` is the actual trigger-evaluation logic, and it is already fully
  decoupled from `start()`'s `setInterval` — it's a plain async function that
  takes a timestamp and returns results. Nothing about the trigger
  registration model (`registerTrigger`, `registerTimeTrigger`, conditions),
  Governance's cooldown/budget checks, or the Orchestrator/Memory Engine
  integration needs to change at all.
- Triggers, Governance, the Orchestrator, and every domain engine are already
  environment-agnostic — none of them know or care whether `tick()` was
  called by a browser interval or something else.

## What WOULD need to change

1. **A server process that calls `tick()` on its own schedule** instead of (or
   in addition to) the browser's `start()`. This requires the engines
   currently running only in the browser (Character, Memory, Conversation,
   World, Relationship, Provider adapters, Governance) to also run in that
   server environment — either by running the same JS files under Node (they
   were already written in a plain, browser-API-light style specifically to
   make this plausible — see how every engine's test harness in this project
   already runs them under Node), or by reimplementing the same interfaces
   server-side.
2. **Durable, shared persistence**, replacing `localStorage`. Every engine
   that persists today (Memory, Character, World, Store) does so through one
   seam — `core/persistence/persistence.js` — specifically so that this swap
   is a matter of replacing ONE module's `get`/`set`/`remove`/`getJSON`/
   `setJSON` implementation (e.g. backed by a real database) rather than
   touching every engine that currently calls it.
3. **Multi-session/multi-user considerations** the current single-browser-tab
   model never had to address: which user's Store state applies (`apiKey`,
   `provider`, character trait sliders are currently per-browser, not
   per-account), and how autonomous ticks for one world avoid colliding with
   another user's session touching the same world concurrently.
4. **A way to relay autonomous activity back to any open browser tabs**
   watching a world live (e.g. via WebSocket or polling an endpoint backed by
   the same Event Bus events Scheduler and Memory Engine already publish
   today) — the UI's existing `memory:recorded` subscription (Milestone 7)
   would not need to change at all; only what feeds it would.

## Suggested sequencing (not scheduled against any milestone)

1. Stand up the same engine files under a Node server process, driven by a
   real timer instead of a browser interval, against a shared database-backed
   Persistence implementation.
2. Prove a single world/thread ticking server-side produces identical
   behavior to today's client-only version (the existing Node test harnesses
   for every engine are the starting point for this — they already prove the
   engines run headless).
3. Add the relay mechanism so a connected browser tab can observe (not
   drive) autonomous activity happening server-side.
4. Only then consider multi-user/multi-session concerns, which today's
   single-browser-tab model has never needed to solve.

## Explicitly out of scope for this document

Authentication, multi-tenancy, cost accounting across users, and any
UI for configuring or viewing autonomous worlds remotely. These are real
product decisions for whoever picks this plan up, not architecture this
document is trying to pre-decide.
