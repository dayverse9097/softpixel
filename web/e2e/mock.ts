import type { Page, Route } from '@playwright/test';

export const GAMES_ORIGIN = 'http://localhost:4001';
const id = (n: number) => `${n.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`;

const game = (slug: string, title: string, category: string, n: number, extra: Record<string, unknown> = {}) => ({
  slug,
  title,
  description: `${title} is a demo game.`,
  category,
  featured: n === 1,
  publishedAt: '2026-10-01T10:00:00.000Z',
  coverUrl: null,
  instructions: 'Use the mouse.',
  controls: [{ input: 'Mouse', action: 'Move the paddle' }],
  version: '1.0.0',
  playUrl: `${GAMES_ORIGIN}/g/${id(n)}/index.html`,
  ...extra,
});

export const GAMES = [
  game('neon-pong', 'Neon Pong', 'Arcade', 1),
  game('star-catcher', 'Star Catcher', 'Casual', 2),
  game('hostile', '<img src=x onerror=window.__xss=1>', 'Puzzle', 3, { description: '<script>window.__xss=2</script>' }),
  game('missing', 'Missing Build', 'Arcade', 4, { playUrl: `${GAMES_ORIGIN}/g/${id(99)}/index.html` }),
  game('evil', 'Evil URL', 'Casual', 5, { playUrl: 'https://evil.example/g/x/index.html' }),
];

const GAME_PAGE = '<!doctype html><html><body style="margin:0"><canvas id="c" width="300" height="150"></canvas></body></html>';
const reply = (route: Route, status: number, body: unknown, headers: Record<string, string> = {}) =>
  route.fulfill({ status, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

/** Stand-ins for the API and the games host, so these tests need no running server. */
export async function mockBackend(page: Page): Promise<void> {
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (method === 'GET' && url.pathname === '/api/games') {
      const q = url.searchParams.get('q')?.toLowerCase();
      let items = GAMES.filter((g) => !q || `${g.title} ${g.description} ${g.category}`.toLowerCase().includes(q));
      if (url.searchParams.get('featured') === 'true') items = items.filter((g) => g.featured);
      return reply(route, 200, { items, page: 1, pageSize: 12, total: items.length });
    }
    if (method === 'GET' && url.pathname === '/api/categories') return reply(route, 200, { items: [{ name: 'Arcade', count: 2 }, { name: 'Casual', count: 2 }, { name: 'Puzzle', count: 1 }] });
    const detail = /^\/api\/games\/([^/]+)$/.exec(url.pathname);
    if (method === 'GET' && detail) {
      const found = GAMES.find((g) => g.slug === detail[1]);
      return found ? reply(route, 200, { game: found }) : reply(route, 404, { error: 'not_found', message: 'Game not found.' });
    }
    if (method === 'POST' && /\/launch$/.test(url.pathname)) return route.fulfill({ status: 204 });
    return reply(route, 401, { error: 'unauthenticated', message: 'Sign in to continue.' });
  });

  await page.route(`${GAMES_ORIGIN}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    const cors = { 'access-control-allow-origin': '*' };
    if (path.startsWith(`/g/${id(99)}`)) return route.fulfill({ status: 404, headers: cors, body: 'Not found' });
    return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/html; charset=utf-8' }, body: route.request().method() === 'HEAD' ? '' : GAME_PAGE });
  });
}
