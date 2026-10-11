import { render, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { AdminProvider } from '../src/admin/AdminProvider';
import { LoginPage } from '../src/admin/Login';
import { GameGrid } from '../src/components/GameCard';
import { Pagination } from '../src/components/Pagination';
import type { GameSummary } from '../src/lib/types';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

// jsdom cannot compute colours, so contrast is checked in the Playwright run (e2e/site.spec.ts) instead.
const audit = async (element: Element) => (await axe.run(element, { rules: { 'color-contrast': { enabled: false } } })).violations;

const games: GameSummary[] = ['neon-pong', 'star-catcher'].map((slug) => ({
  slug,
  title: slug,
  description: `${slug} description`,
  category: 'Arcade',
  featured: false,
  publishedAt: null,
  coverUrl: null,
}));

describe('accessibility (axe)', () => {
  it('game grid has no violations', async () => {
    const { container } = render(
      <MemoryRouter>
        <GameGrid games={games} />
      </MemoryRouter>,
    );
    expect(await audit(container)).toEqual([]);
  });

  it('pagination has no violations', async () => {
    const { container } = render(<Pagination page={2} pageSize={12} total={50} onChange={() => undefined} />);
    expect(await audit(container)).toEqual([]);
  });

  it('admin sign-in form has no violations', async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'unauthenticated', message: 'Sign in.' }), { status: 401, headers: { 'content-type': 'application/json' } })) as typeof fetch;
    const { container } = render(
      <MemoryRouter initialEntries={['/admin/login']}>
        <AdminProvider>
          <LoginPage />
        </AdminProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(container.querySelector('form')).not.toBeNull());
    expect(await audit(container)).toEqual([]);
  });
});
