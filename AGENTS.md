# orchid-frontend/ — Next.js 15 Multi-Chat UI

## Overview

Next.js 15 (App Router) with NextAuth v5 for generic OAuth2/OIDC. Provides a multi-chat interface with persistent sidebar, file
upload (drag-and-drop + paperclip), and Markdown rendering for assistant responses.

**This project depends on orchid-api (HTTP), not on the orchid Python library directly.** All backend communication goes through Server Actions that call orchid-api endpoints.

## Stack

- **Next.js 16** (App Router, standalone output)
- **React 19** with Server Components + Server Actions
- **NextAuth v5** (beta) with generic OAuth2/OIDC provider
- **Tailwind CSS v4** (CSS-based config, `@theme inline`)
- **react-markdown** + `@tailwindcss/typography` for Markdown rendering
- **Lucide React** for icons

## Directory Structure

```
src/
├── app/
│   ├── actions/
│   │   ├── chats.ts            # Multi-chat CRUD + messaging (PRIMARY)
│   │   ├── mcp-auth.ts         # MCP per-server OAuth: list, authorize, revoke
│   │   ├── chat.ts             # Legacy single-shot (DEPRECATED)
│   │   ├── upload.ts           # Standalone upload (DEPRECATED)
│   │   ├── bloom-runs.ts       # Pollen + Bloom run inspection
│   │   ├── bloom-signals.ts    # Pollen + Bloom signal log + replay
│   │   ├── bloom-schedules.ts  # Pollen + Bloom schedule list + toggle
│   │   └── bloom-triggers.ts   # Pollen + Bloom trigger registry (read-only)
│   ├── chat/page.tsx           # Protected chat page
│   ├── bloom/                  # Pollen + Bloom panel
│   │   ├── layout.tsx          # Shell + nav rail
│   │   ├── page.tsx            # Runs list (default landing)
│   │   ├── runs/[runId]/       # Run detail (poll + SSE stream)
│   │   ├── signals/            # Signal log + detail (admin-only list)
│   │   ├── triggers/           # Trigger list + detail
│   │   └── schedules/          # Schedule list + toggle
│   ├── login/page.tsx          # OAuth login button
│   ├── layout.tsx              # Root layout
│   ├── api/auth/[...nextauth]/route.ts
│   ├── api/bloom/stream/[runId]/route.ts   # SSE proxy for live run events
│   └── api/chat-events/[chatId]/route.ts   # SSE proxy for in-chat bloom progress
├── components/chat/
│   ├── chat-container.tsx      # Main layout: sidebar + chat + drag-drop + MCP auth
│   ├── mcp-auth-status.tsx     # MCP OAuth server authorization status panel
│   ├── chat-sidebar.tsx        # Chat list, new/delete/share
│   ├── chat-input.tsx          # Message input + file attachment
│   ├── message-bubble.tsx      # User/assistant bubbles + Markdown + bloom-origin badge
│   ├── message-list.tsx        # Scrollable list + inline bloom progress + bottom dock
│   ├── inline-bloom-progress.tsx  # In-chat live progress card
│   ├── bloom-activity-pill.tsx    # Collapse view when >2 active blooms
│   └── loading-indicator.tsx   # Typing dots
├── components/bloom/           # Pollen + Bloom UI primitives
│   ├── status-pill.tsx         # Coloured run-status badge
│   ├── relative-time.tsx       # "12 min ago" + ISO tooltip
│   ├── run-list.tsx            # Compact run table
│   ├── run-detail.tsx          # Run header + identity + result + cancel/retry
│   ├── run-stream-pane.tsx     # Live SSE event log for one run
│   ├── signal-list.tsx         # Signal log table
│   ├── schedule-list.tsx       # Schedule list with optimistic toggle
│   └── trigger-list.tsx        # Trigger registry table
├── hooks/
│   ├── use-chat-list.tsx
│   ├── use-chat-stream.ts      # Per-message SSE stream
│   ├── use-chat-events.ts      # Per-chat-session SSE — in-chat bloom progress
│   ├── use-drag-drop.ts
│   ├── use-bloom.ts            # useBloomRuns / useBloomRun / useSignals /
│   │                           # useSchedules / useTriggers — polling-based
│   └── use-bloom-run-stream.ts # Live SSE subscription for one run
├── lib/auth/
│   ├── auth.ts                 # NextAuth config
│   └── oauth-provider.ts       # Generic OAuth2/OIDC provider
└── middleware.ts                # Auth guard for /chat
```

## /bloom — Pollen + Bloom panel

The panel is a **sibling route** to /chat, not a sub-route. Five
top-level sections served from `src/app/bloom/`:

- `/bloom` (default) — runs list with status filter; polls every 10s
  unless a terminal-status filter is active.
- `/bloom/runs/[runId]` — run detail with cancel + retry actions;
  polls every 3s while non-terminal, stops on terminal.
- `/bloom/signals` — admin-only signal log; non-admin callers see
  empty list (404 from API → empty array).
- `/bloom/signals/[signalId]` — signal detail + replay (admin only).
- `/bloom/triggers` and `/bloom/triggers/[triggerId]` — read-only
  trigger registry from `agents.yaml`.
- `/bloom/schedules` — admin-only schedule list with inline
  enable/disable toggle (optimistic update + rollback on error).

Live SSE for the run detail: `/api/bloom/stream/[runId]/route.ts`
is a Next.js route handler that resolves the NextAuth bearer
server-side and pipes the response body of orchid-api's
`/runs/{runId}/stream` straight to the browser. The browser opens
an `EventSource` against the proxy via `useBloomRunStream`, and
`<RunStreamPane>` renders the live event log inside `RunDetail`.
The polled `useBloomRun` hook still drives the header / result
fields; the two run side-by-side and reconcile on the next poll
when the stream's terminal event lands first.

Chat-side touchpoint: `MessageBubble` detects
`metadata.origin === "bloom"` and decorates the row with a
sparkles badge + tooltip + `view run` link to
`/bloom/runs/{bloom_run_id}`. The `readBloomMetadata` extractor is
exported from `message-bubble.tsx` and unit-tested.

Accessibility:

- Status pills meet WCAG AA 4.5:1 contrast on the small-text
  body.
- Every Bloom table carries an `aria-label` and `scope="col"` on
  its column headers.
- The left rail nav marks the active page with `aria-current="page"`
  and renders a `focus-visible:` ring for keyboard users.
- A "Skip to main content" link is the first focusable element
  on every Bloom page.
- Run-detail cancel/retry buttons carry per-run `aria-label`s and
  `aria-busy` while the server action is in flight.
- The live event log is a `role="log"` region with
  `aria-live="polite"` so screen readers announce new events
  without interrupting reading.

The operator runbook lives at
`.knowledge/documentation/guides/observing-blooms.md` (sibling to
the visibility operations playbook).

## In-chat live progress

Chat-bound Blooms (those with `respect_chat_binding: true` on the
trigger) surface live progress **inside the originating chat
thread**, not just in `/bloom`. The mechanism:

- **SSE proxy** at `src/app/api/chat-events/[chatId]/route.ts`
  resolves the NextAuth bearer server-side and pipes
  `${AGENTS_API_URL}/chats/{chatId}/events/stream` to the browser.
  The 404-never-403 visibility contract from upstream is
  re-emitted verbatim.
- **`useChatEvents(chatId)`** hook opens an `EventSource` against
  the proxy and accumulates a `Map<run_id, BloomProgressState>`
  via a pure reducer (`chatEventsReducer`). The three event types
  — `chat.bloom.attached`, `chat.bloom.tick`, `chat.bloom.finished`
  — are handled with idempotent semantics so the upstream's
  queued+started collapse and reconnect-discovery passes don't
  produce duplicates. Tick buffer FIFO-capped at 50.
- **`<InlineBloomProgress>`** renders one card with elapsed
  timer, last-5 ticks (expandable), `open in /bloom` link, and a
  Cancel button gated by `identity_mode === "act_as_user"`. Uses
  standard `transition-*` utilities so `prefers-reduced-motion`
  is respected automatically.
- **`<BloomActivityPill>`** collapses the bottom-dock fallback
  into a single pill when more than 2 unanchored cards are
  active; click expands.
- **`<MessageList>`** renders cards anchored under their
  `source_message_id` (per-bubble), or in a bottom dock when
  the binding lacks one.
- **`<ChatContainer>`** mounts `useChatEvents(activeChatId)`
  alongside the existing `useChatStream` — the two are
  independent: `useChatStream` is per-message turn,
  `useChatEvents` is per-chat-session.

The cancel ACL is purely a frontend gating decision. The backend
already enforces visibility-as-actor on every
`POST /runs/{run_id}/cancel`; the in-chat button is hidden for
`addressed_to_user` runs because the chat owner is the addressed
user, not the operator. Admins who need to cancel
`addressed_to_user` runs go through `/bloom/runs/{id}`.

Tests:

- `src/hooks/use-chat-events.test.ts` — 15 reducer tests
  covering the lifecycle, idempotent attached, FIFO tick cap,
  failed-vs-succeeded routing, drop semantics.
- `src/components/chat/inline-bloom-progress.test.tsx` — 17
  component tests covering the Cancel ACL matrix, tick
  truncation, elapsed timer, link target, failure-state copy,
  and the `formatElapsed` / `describeTick` helpers.
- `src/app/api/chat-events/[chatId]/route.test.ts` — 6 proxy
  tests covering 401 on missing bearer, bearer + Accept
  forwarding, URL encoding, 404/503 propagation, AbortSignal
  forwarding.

Operator-facing docs land in
`.knowledge/documentation/guides/observing-blooms.md` §7; the
deeper concept lives in
`.knowledge/documentation/concepts/chat-binding.md`
§"Live progress".

## Key Patterns

### Token Proxy (Security-Critical)

The OAuth `access_token` is stored ONLY in the server-side NextAuth JWT. It NEVER reaches the browser. All API calls go
through Server Actions that read the JWT and proxy requests with the Bearer token.

```typescript
// In any Server Action:
const session = await auth();
const token = session?.accessToken;  // only available server-side

await fetch(`${API_BASE}/chats/${chatId}/messages`, {
    headers: {
        Authorization: `Bearer ${token}`,
    },
    body: formData,
});
```

### OAuth Provider Configuration

The generic provider supports two modes:

**OIDC auto-discovery (recommended):**
```env
OAUTH_ISSUER=https://your-idp.example.com/realms/your-realm
OAUTH_CLIENT_ID=your-client-id
OAUTH_CLIENT_SECRET=your-client-secret
```

**Explicit endpoints (for non-OIDC providers):**
```env
OAUTH_CLIENT_ID=your-client-id
OAUTH_CLIENT_SECRET=your-client-secret
OAUTH_AUTHORIZATION_URL=https://idp.example.com/oauth2/authorize
OAUTH_TOKEN_URL=https://idp.example.com/oauth2/token
OAUTH_USERINFO_URL=https://idp.example.com/oauth2/userinfo
OAUTH_SCOPE=openid profile email
```

### File Upload Flow

1. User drags file onto chat area OR clicks paperclip button
2. Files staged as "pending" chips in `ChatInput`
3. User types a message and submits
4. `ChatContainer.handleSend()` builds `FormData` with `message` + `files`
5. `sendChatMessage(chatId, message, fileData)` sends multipart to API
6. API endpoint parses files, augments prompt, runs agent graph
7. Response displayed with Markdown rendering

**Files are never sent standalone.** They always accompany a text message.

### Drag-and-Drop

`ChatContainer` manages drag state with `dragCounterRef` (ref, not state) to handle nested `dragenter`/`dragleave`
events correctly. A drop overlay appears when files are dragged over.

### Markdown Rendering

Assistant messages are rendered with `<ReactMarkdown>` inside a `prose prose-sm` container. Custom overrides via
Tailwind bracket syntax for compact spacing:

```
[&_p]:my-1.5  [&_h1]:text-base  [&_code]:bg-gray-200  [&_a]:text-orchid-accent
```

## Tailwind v4 Configuration

```css
/* globals.css */
@import "tailwindcss";
@plugin "@tailwindcss/typography";

@theme inline {
  --color-orchid-accent: var(--orchid-accent);    /* #FF5C35 */
  --color-orchid-dark: var(--orchid-dark);        /* #2E2F31 */
  --color-orchid-surface: var(--orchid-surface);  /* #F7F8FA */
  --color-orchid-muted: var(--orchid-muted);      /* #8B8D97 */
  --color-orchid-border: var(--orchid-border);    /* #E5E7EB */
}
```

Use `bg-orchid-accent`, `text-orchid-dark`, etc. in components.

## Server Actions (`app/actions/chats.ts`)

| Function                               | Method | Endpoint               | Content-Type  |
|----------------------------------------|--------|------------------------|---------------|
| `createChat(title?)`                   | POST   | `/chats`               | JSON          |
| `listChats()`                          | GET    | `/chats`               | —             |
| `loadMessages(chatId)`                 | GET    | `/chats/{id}/messages` | —             |
| `deleteChat(chatId)`                   | DELETE | `/chats/{id}`          | —             |
| `sendChatMessage(chatId, msg, files?)` | POST   | `/chats/{id}/messages` | **multipart** |
| `shareChat(chatId)`                    | POST   | `/chats/{id}/share`    | —             |

**`sendChatMessage` is multipart** — builds FormData, does NOT set Content-Type header (browser sets boundary
automatically). Returns `authRequired?: string[]` when MCP servers need OAuth authorization.

## Server Actions (`app/actions/mcp-auth.ts`)

| Function                          | Method | Endpoint                              |
|-----------------------------------|--------|---------------------------------------|
| `listMCPAuthServers()`            | GET    | `/mcp/auth/servers`                   |
| `getMCPAuthorizeUrl(serverName)`  | GET    | `/mcp/auth/servers/{name}/authorize`  |
| `revokeMCPToken(serverName)`      | DELETE | `/mcp/auth/servers/{name}/token`      |

The `MCPAuthStatus` component (in chat header) calls these to show connection status and trigger popup-based OAuth flows.

## Common Mistakes

- **Nesting `<button>` inside `<button>`.** Causes React hydration errors. Use `<div role="button" tabIndex={0}>` for
  outer interactive containers.
- **Setting Content-Type for multipart.** Let the browser set it — it includes the boundary. Manually setting
  `Content-Type: multipart/form-data` breaks the request.
- **Importing `getToken` from wrong path.** Use `next-auth/jwt` for Server Actions, NOT `next-auth/react`.
- **Forgetting `"use server"` directive.** All files in `app/actions/` must start with `"use server"`.
- **Using Tailwind v3 syntax.** This project uses Tailwind v4 — no `tailwind.config.js`, use `@theme inline` in CSS.

## Running

```bash
cd orchid-frontend
npm install
npm run dev         # http://localhost:3000

# For local dev (no OAuth provider):
# Copy .env.local.demo to .env.local
# Frontend still needs NextAuth but can be configured for dev bypass
```
