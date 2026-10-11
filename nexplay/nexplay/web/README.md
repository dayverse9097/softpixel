# NEXPLAY web app

The public site and the admin dashboard. React 19, TypeScript, Vite, Tailwind CSS 3 and Framer Motion, with a 2D "liquid glass" design (translucent panels, backdrop blur, luminous edges) on a dark navy background.

It talks to the API in `../server`. It has no back end of its own and stores nothing about visitors except two lists in their own browser (favorites and recently played).

## Run it

```bash
cd web
cp .env.example .env        # leave VITE_API_URL empty in development
npm install
npm run dev                 # http://localhost:5173, proxies /api to http://localhost:4000
```

Start the server (`../server`, `npm run dev`) first. In development the dev server proxies `/api`, so the strict session cookie works without extra setup, and the server's `APP_ORIGIN` should be `http://localhost:5173`.

## Build and deploy

```bash
VITE_API_URL=https://api.example.com VITE_GAMES_ORIGIN=https://games.example npm run build
```

The build type-checks, bundles (no source maps), and writes `dist/_headers` and `dist/_redirects`. `_headers` carries the Content Security Policy, HSTS and the other headers for Netlify or Cloudflare Pages. On another host, copy those values into its settings. `_redirects` makes deep links such as `/game/neon-pong` work.

`VITE_` values are public. Never put a secret in them.

## Checks

```bash
npm run typecheck
npm run lint                # includes accessibility rules and a ban on dangerouslySetInnerHTML
npm test                    # unit and component tests (Vitest, jsdom, axe)
npm run e2e                 # Playwright, desktop and phone sized, no server needed (API is mocked)
npm run audit
```

## Where things are

| Path | What |
| --- | --- |
| `src/lib/api.ts` | Typed API client. Public calls send no cookies. Admin calls send the session cookie and a CSRF token that lives only in memory. |
| `src/lib/urls.ts` | Allowlist for game and cover addresses. Anything not on `VITE_GAMES_ORIGIN` is refused. |
| `src/lib/storage.ts` | Favorites and recently played. Slugs only, validated when read. |
| `src/lib/site.ts` | Editable site text: tagline, About, Privacy, Terms, contact email. |
| `src/components/GamePlayer.tsx` | Sandboxed player: checks the game is reachable, shows loading, failure and retry, fullscreen. |
| `src/admin/` | Sign-in with two-factor, game list, editor, cover and build upload with progress, preview, publish, archive, delete with typed confirmation, security settings, activity log. Loaded only when an admin opens it. |
| `tests/`, `e2e/` | Unit, component, accessibility and browser tests. |

## Design and accessibility

* Glass is used on the navigation, search, filters, dialogs and a few panels. Game cards use translucency without blur, and blur is reduced on small screens, to keep scrolling smooth on phones.
* Motion is gentle: one page fade, spring hover on cards, drifting gradients, a few particles. Everything is turned off for visitors who ask their device for less motion (`MotionConfig reducedMotion="user"` plus a CSS rule). Particles stop while a game is playing.
* Skip link, landmarks, visible focus rings, 44 px touch targets, focus moves to the page heading after each navigation, dialogs trap focus, form errors sit next to their fields, loading placeholders keep the layout steady.

## Security notes

* All game text is rendered as text. There is no raw HTML anywhere, and lint forbids it.
* Games run in an iframe with `sandbox="allow-scripts allow-pointer-lock"`, no referrer, from a different origin. The address is checked against `VITE_GAMES_ORIGIN` first.
* The CSP in `_headers` allows scripts and styles only from this site, with no inline code and no `eval`.
* Fonts are bundled, so visitors' browsers never contact a third-party font service.
* QR codes are not drawn for two-factor setup (that would need another dependency). The setup key is shown for manual entry, and an `otpauth://` link is offered for authenticator apps on the same device.
