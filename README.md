<p align="center">
  <img src="icon.svg" alt="Orchid" width="80" />
</p>

<h1 align="center">Orchid Frontend</h1>

Multi-chat web UI for the Orchid AI agent framework, built with Next.js 15 and NextAuth v5.

Provides a chat interface with persistent sidebar, file upload (drag-and-drop + paperclip), Markdown rendering, and a fully-centralised OAuth flow that delegates every secret-bearing call to `orchid-api`.

This is the **canonical and only** frontend in the monorepo. After the auth-centralisation roadmap shipped (Phases 1–5), every platform-specific concern moved to consumer-pluggable ABCs on `orchid-api`, and this generic frontend serves any consumer's OAuth flow natively via `/auth-info` discovery — no per-consumer fork required. See [.knowledge/auth-centralisation.md](../.knowledge/auth-centralisation.md) for the architectural narrative.

**Runtime dependency:** This project requires [orchid-api](https://github.com/gadz82/orchid-api) as its backend server. All communication happens over HTTP — there is no direct dependency on the `orchid` Python library, only on the REST endpoints that orchid-api exposes. Make sure orchid-api is running and reachable at the URL configured in `AGENTS_API_URL`.

## Stack

- **Next.js 15** (App Router, standalone output)
- **React 19** with Server Components + Server Actions
- **NextAuth v5** (beta) with generic OAuth2/OIDC provider
- **Tailwind CSS v4** (CSS-based config, `@theme inline`)
- **react-markdown** + `@tailwindcss/typography` for Markdown rendering
- **Lucide React** for icons
- **TypeScript** in strict mode

## Quick Start

```bash
npm install
cp .env.local.example .env.local   # configure OAuth + API URL
npm run dev                         # http://localhost:3000
```

## Architecture

```
src/
  app/
    actions/
      chats.ts                Multi-chat CRUD + messaging (Server Actions)
    chat/page.tsx              Protected chat page
    login/page.tsx             OAuth login page
    layout.tsx                 Root layout
    api/auth/[...nextauth]/    NextAuth route handler
  components/chat/
    chat-container.tsx         Main layout: sidebar + chat + drag-drop + MCP auth
    mcp-auth-status.tsx        MCP OAuth server authorization status panel
    chat-sidebar.tsx           Chat list with new/delete/share actions
    chat-input.tsx             Message input with file attachment
    message-bubble.tsx         User/assistant bubbles with Markdown rendering
    message-list.tsx           Scrollable message list
    loading-indicator.tsx      Typing indicator dots
  lib/auth/
    auth.ts                    NextAuth configuration (centralised on orchid-api)
    oauth-provider.ts          Auth.js provider with token + userinfo callbacks
                               that POST to orchid-api's /auth/* endpoints
    discovery.ts               Phase 1 — fetches /auth-info on first request
    centralised-exchange.ts    Phases 2 + 4A + 4B — POSTs to /auth/exchange-code,
                               /auth/refresh-token, /auth/resolve-identity
  middleware.ts                Auth guard for /chat route
```

## Authentication

The frontend holds **no upstream OAuth secrets** and **no upstream-specific config**.
Every secret-bearing call (initial code exchange, identity resolution, refresh) is
delegated to orchid-api — see the consolidated walkthrough in
[.knowledge/auth-centralisation.md](../.knowledge/auth-centralisation.md).

The OAuth access token is stored **only** in the server-side NextAuth JWT — the
browser session never receives the raw token. All API calls go through Server
Actions that proxy requests with the Bearer token.

### Required environment variables

```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-random-secret-here
AGENTS_API_URL=http://localhost:8000        # where orchid-api lives — drives discovery
```

### Optional environment variables

```env
DEV_AUTH_BYPASS=true                        # bypass OAuth entirely (dev only)
OAUTH_SCOPE=openid profile email             # override the discovered scope
```

### Removed in Phase 5 (no longer accepted)

The following used to live on the frontend; they all moved to `orchid-api`'s
`OrchidAuthConfigProvider` + `OrchidAuthExchangeClient` + `OrchidIdentityResolver`:

```text
OAUTH_ISSUER             OAUTH_TOKEN_URL
OAUTH_CLIENT_ID          OAUTH_USERINFO_URL
OAUTH_CLIENT_SECRET      OAUTH_AUTHORIZATION_URL
```

If `/auth-info` is unreachable at startup or its `oauth` block doesn't have
`exchange_via_api` + `resolve_via_api` + `refresh_via_api` all set to `true`, the
frontend fails the request with a clear server-side error rather than silently
falling back to a half-broken login.

## Server Actions

All API communication goes through server-side actions:

**`app/actions/chats.ts`** -- Chat CRUD and messaging:

| Function | Method | API Endpoint | Content-Type |
|----------|--------|-------------|-------------|
| `createChat(title?)` | POST | `/chats` | JSON |
| `listChats()` | GET | `/chats` | -- |
| `loadMessages(chatId)` | GET | `/chats/{id}/messages` | -- |
| `deleteChat(chatId)` | DELETE | `/chats/{id}` | -- |
| `sendChatMessage(chatId, msg, files?)` | POST | `/chats/{id}/messages` | **multipart** |
| `shareChat(chatId)` | POST | `/chats/{id}/share` | -- |

**`app/actions/mcp-auth.ts`** -- MCP per-server OAuth:

| Function | Method | API Endpoint |
|----------|--------|-------------|
| `listMCPAuthServers()` | GET | `/mcp/auth/servers` |
| `getMCPAuthorizeUrl(name)` | GET | `/mcp/auth/servers/{name}/authorize` |
| `revokeMCPToken(name)` | DELETE | `/mcp/auth/servers/{name}/token` |

## File Upload

1. Drag files onto chat area **or** click the paperclip button
2. Files staged as chips in the input area
3. Submitted alongside the message as multipart/form-data
4. Files always accompany a text message -- never sent standalone

## Tailwind v4

This project uses Tailwind CSS v4 with CSS-based configuration. There is no `tailwind.config.js`. Theme tokens are defined in `globals.css`:

```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";

@theme inline {
  --color-orchid-accent: var(--orchid-accent);
  --color-orchid-dark: var(--orchid-dark);
  --color-orchid-surface: var(--orchid-surface);
  --color-orchid-muted: var(--orchid-muted);
  --color-orchid-border: var(--orchid-border);
}
```

Use `bg-orchid-accent`, `text-orchid-dark`, etc. in components.

## Docker

```bash
docker build -t orchid-frontend .
docker run -p 3000:3000 orchid-frontend
```

Or via the parent workspace docker-compose files.

## Development

```bash
npm install
npm run dev       # development with hot reload
npm run build     # production build
npm run start     # start production server
npm run lint      # ESLint
```

## Common Pitfalls

- **Never nest `<button>` inside `<button>`** -- causes React hydration errors
- **Don't set Content-Type for multipart** -- let the browser set it (includes boundary)
- **Use `next-auth/jwt`** for Server Actions, not `next-auth/react`
- **All files in `app/actions/` must start with `"use server"`**
- **Tailwind v4 syntax** -- no `tailwind.config.js`, use `@theme inline` in CSS
- **Adding `OAUTH_*` env vars back to the frontend.** The frontend is a public
  PKCE client — `client_secret` lives only on `orchid-api`. The discovered
  `auth-info` block carries everything else. Stale env vars are silently
  ignored; setting them won't restore a "direct upstream" path because the
  code that consumed them was deleted in Phase 5.
- **`/auth-info` is unreachable at frontend startup** -- the NextAuth handler
  errors with a clear message. Check that `AGENTS_API_URL` is reachable from
  inside the frontend container (Docker DNS) and that `orchid-api` has
  `auth.auth_config_provider_class` wired in `orchid.yml`.

## License

MIT -- see [LICENSE](LICENSE).
