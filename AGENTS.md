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
│   │   ├── chats.ts          # Multi-chat CRUD + messaging (PRIMARY)
│   │   ├── mcp-auth.ts       # MCP per-server OAuth: list, authorize, revoke
│   │   ├── chat.ts           # Legacy single-shot (DEPRECATED)
│   │   └── upload.ts         # Standalone upload (DEPRECATED)
│   ├── chat/page.tsx         # Protected chat page
│   ├── login/page.tsx        # OAuth login button
│   ├── layout.tsx            # Root layout
│   └── api/auth/[...nextauth]/route.ts
├── components/chat/
│   ├── chat-container.tsx    # Main layout: sidebar + chat + drag-drop + MCP auth
│   ├── mcp-auth-status.tsx   # MCP OAuth server authorization status panel
│   ├── chat-sidebar.tsx      # Chat list, new/delete/share
│   ├── chat-input.tsx        # Message input + file attachment
│   ├── message-bubble.tsx    # User/assistant bubbles + Markdown
│   ├── message-list.tsx      # Scrollable message list
│   └── loading-indicator.tsx # Typing dots
├── lib/auth/
│   ├── auth.ts               # NextAuth config
│   └── oauth-provider.ts     # Generic OAuth2/OIDC provider
└── middleware.ts              # Auth guard for /chat
```

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
