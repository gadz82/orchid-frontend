<p align="center">
  <img src="icon.svg" alt="Orchid" width="80" />
</p>

<h1 align="center">Orchid Frontend</h1>

Next.js 15 multi-chat web UI for the Orchid AI agent framework.

Provides a chat interface with persistent sidebar, file upload (drag-and-drop + paperclip), Markdown rendering, generic OAuth2/OIDC authentication, real-time SSE streaming with mini-agent visualisation, and human-in-the-loop tool approval.

**Runtime dependency:** This project requires [orchid-api](../orchid-api/) as its backend server. All communication happens over HTTP — there is no direct dependency on the `orchid` Python library, only on the REST endpoints that orchid-api exposes. Make sure orchid-api is running and reachable at the URL configured in `NEXT_PUBLIC_API_URL`.

## Features

- **Persistent multi-chat sidebar** — create, rename, share, and delete chats. Title generation is delegated to orchid-api when omitted.
- **Streaming responses (SSE)** — token-by-token assistant streaming, supervisor and synthesizer events, and per-mini-agent lifecycle markers (`mini_agent.{decomposed,started,finished,aggregated}`) rendered inline.
- **File upload** — drag-and-drop or paperclip; files attach to the current chat's RAG scope. Files always accompany a text message — never sent standalone.
- **HITL tool approval** — when an agent calls a `requires_approval: true` tool, the chat pauses on a graph interrupt and surfaces an approval card; approving/denying resumes the supervisor.
- **MCP per-server OAuth panel** — for upstream MCP servers running in `oauth` mode, the user authorises each server in-app via the embedded auth status pane.
- **Generic OAuth2 / OIDC login** — auto-discovery from a single `OAUTH_ISSUER` env var, or explicit endpoints when discovery isn't available. Bearer token never reaches the browser — Server Actions proxy every API call.
- **Markdown rendering** with `react-markdown` + `@tailwindcss/typography`, including code blocks, tables, and inline formatting.
- **Theming** — Tailwind CSS v4 with CSS-based `@theme inline` tokens. Re-skin by editing `globals.css` only.

## Stack

- **Next.js 15** (App Router, standalone output, React Server Components)
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

For a fully wired demo (API + frontend + Qdrant + Postgres) run from the repo root:

```bash
docker compose -f docker-compose.local.yml up --build
# Frontend: http://localhost:3000
# API:      http://localhost:8000
```

## Architecture

```
src/
  app/
    actions/
      chats.ts                 Multi-chat CRUD + messaging (Server Actions)
      mcp-auth.ts              MCP per-server OAuth bookkeeping
      streaming.ts             SSE proxy for /chats/{id}/stream
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
    mini-agent-trace.tsx       Per-mini-agent lifecycle marker rendering
    hitl-approval-card.tsx     Approve / deny prompt for paused tool calls
    loading-indicator.tsx      Typing indicator dots
  lib/auth/
    auth.ts                    NextAuth configuration
    oauth-provider.ts          Generic OAuth2/OIDC provider
  middleware.ts                Auth guard for /chat route
```

The data flow on every message send:

```
User types → ChatInput
   └─ "use server" Action sendChatMessage(chatId, msg, files)
      └─ POST /chats/{id}/messages (multipart) on orchid-api
         └─ orchid-api streams SSE events
            ├─ assistant.delta              → MessageBubble token append
            ├─ supervisor.routing_decision  → status pill
            ├─ mini_agent.decomposed        → trace pane
            ├─ mini_agent.{started,finished} → trace pane progress
            ├─ tool_call.requires_approval  → HITL approval card (pause)
            └─ assistant.complete           → finalise bubble
```

## Authentication

The OAuth access token is stored **only** in the server-side NextAuth JWT. It never reaches the browser. All API calls go through Server Actions that proxy requests with the Bearer token.

### OIDC Auto-Discovery (Recommended)

Set the issuer URL and the rest is fetched from `/.well-known/openid-configuration`:

```env
OAUTH_ISSUER=https://your-idp.example.com/realms/your-realm
OAUTH_CLIENT_ID=your-client-id
OAUTH_CLIENT_SECRET=your-client-secret
```

### Explicit Endpoints

When the upstream IdP doesn't expose OIDC discovery (or you need to override what discovery returns):

```env
OAUTH_CLIENT_ID=your-client-id
OAUTH_CLIENT_SECRET=your-client-secret
OAUTH_AUTHORIZATION_URL=https://idp.example.com/oauth2/authorize
OAUTH_TOKEN_URL=https://idp.example.com/oauth2/token
OAUTH_USERINFO_URL=https://idp.example.com/oauth2/userinfo
OAUTH_SCOPE=openid profile email
```

### Other Environment Variables

```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-random-secret-here     # generate with: openssl rand -base64 32
NEXT_PUBLIC_API_URL=http://localhost:8000   # orchid-api URL
```

For multi-tenant deployments, optionally pass an auth-domain hint via the OAuth `acr_values` parameter; orchid-api maps it onto `OrchidAuthContext.tenant_key`.

## Server Actions

All API communication goes through server-side actions:

**`app/actions/chats.ts`** — Chat CRUD and messaging:

| Function | Method | API Endpoint | Content-Type |
|----------|--------|-------------|-------------|
| `createChat(title?)` | POST | `/chats` | JSON |
| `listChats()` | GET | `/chats` | — |
| `loadMessages(chatId)` | GET | `/chats/{id}/messages` | — |
| `deleteChat(chatId)` | DELETE | `/chats/{id}` | — |
| `sendChatMessage(chatId, msg, files?)` | POST | `/chats/{id}/messages` | **multipart** |
| `streamChatMessage(chatId, msg, files?)` | POST | `/chats/{id}/messages?stream=true` | **multipart**, SSE |
| `shareChat(chatId)` | POST | `/chats/{id}/share` | — |
| `resumeChat(chatId, decision, args?)` | POST | `/chats/{id}/resume` | JSON |

**`app/actions/mcp-auth.ts`** — MCP per-server OAuth:

| Function | Method | API Endpoint |
|----------|--------|-------------|
| `listMCPAuthServers()` | GET | `/mcp/auth/servers` |
| `getMCPAuthorizeUrl(name)` | GET | `/mcp/auth/servers/{name}/authorize` |
| `revokeMCPToken(name)` | DELETE | `/mcp/auth/servers/{name}/token` |

## Streaming + mini-agent visualisation

When the user sends a message, the frontend opens an SSE stream to orchid-api and renders events as they arrive. The streaming router emits:

- `assistant.delta` — assistant token chunk; appended to the current message bubble.
- `supervisor.routing_decision` — which agents got picked, and why; rendered as a status pill above the bubble.
- `mini_agent.decomposed` — parent agent decided to fork into N sub-tasks; renders an expandable trace pane.
- `mini_agent.started` / `mini_agent.finished` — per-mini-agent progress within that pane.
- `mini_agent.aggregated` — aggregator collapsed the per-mini outputs.
- `tool_call.requires_approval` — pauses the chat with an approval card; clicking "Approve" or "Deny" calls `resumeChat(...)`.
- `assistant.complete` — finalises the bubble and re-enables the input.

The trace pane is purely cosmetic — collapsing or hiding it doesn't change the underlying graph behaviour.

## File Upload

1. Drag files onto chat area **or** click the paperclip button.
2. Files staged as chips in the input area.
3. Submitted alongside the message as multipart/form-data.
4. Files always accompany a text message — never sent standalone.
5. orchid-api ingests each file into the chat-scoped RAG namespace before the supervisor turn starts; subsequent messages can retrieve from those uploads.

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

### Re-skinning for your brand

Override the CSS variables (not the Tailwind tokens) in `globals.css`:

```css
:root {
  --orchid-accent: #1d4ed8;        /* primary */
  --orchid-dark: #0f172a;          /* text on light surfaces */
  --orchid-surface: #ffffff;
  --orchid-muted: #64748b;
  --orchid-border: #e2e8f0;
}
```

The `icon.svg` at the project root is used as the favicon; replace it with your own and Next.js's automatic favicon route picks it up on the next build.

## Docker

```bash
docker build -t orchid-frontend .
docker run -p 3000:3000 \
  -e NEXTAUTH_URL=https://chat.example.com \
  -e NEXTAUTH_SECRET="$(openssl rand -base64 32)" \
  -e NEXT_PUBLIC_API_URL=https://api.example.com \
  -e OAUTH_ISSUER=https://idp.example.com/realms/orchid \
  -e OAUTH_CLIENT_ID=… \
  -e OAUTH_CLIENT_SECRET=… \
  orchid-frontend
```

Or via the parent workspace docker-compose files.

## Deployment patterns

- **Single VM behind nginx / Traefik** — terminate TLS in front, proxy `/` to the Next.js standalone output. Set `NEXTAUTH_URL` to the public host.
- **Multi-replica behind a load balancer** — enable sticky sessions on the LB OR put the NextAuth JWT secret in a shared store. The frontend itself is stateless.
- **Vercel / similar PaaS** — works out of the box; set the env vars in the dashboard, including `NEXT_PUBLIC_API_URL` pointing to your orchid-api deployment.

When deploying behind a corporate proxy that rewrites `Host`, set `NEXTAUTH_URL` and `OAUTH_GATEWAY_BASE_URL` (on orchid-mcp, if you're also running it) to the externally-visible URLs.

## Development

```bash
npm install
npm run dev       # development with hot reload
npm run build     # production build
npm run start     # start production server
npm run lint      # ESLint
```

## Common Pitfalls

- **Never nest `<button>` inside `<button>`** — causes React hydration errors.
- **Don't set `Content-Type` for multipart** — let the browser set it (includes boundary).
- **Use `next-auth/jwt`** for Server Actions, not `next-auth/react`.
- **All files in `app/actions/` must start with `"use server"`.**
- **Tailwind v4 syntax** — no `tailwind.config.js`, use `@theme inline` in CSS.
- **SSE streams need `cache: 'no-store'`** — already set in `streaming.ts`; if you write custom Server Actions for streaming, mirror it.
- **`NEXTAUTH_SECRET` must be the same across replicas** — different secrets invalidate each other's JWTs.

## License

MIT — see [LICENSE](LICENSE).
