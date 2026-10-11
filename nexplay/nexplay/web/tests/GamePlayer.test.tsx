import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GamePlayer } from '../src/components/GamePlayer';

const GOOD = 'http://localhost:4001/g/11111111-1111-4111-8111-111111111111/index.html';
const realFetch = globalThis.fetch;

function fakeHead(status: number) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${String(input)}`);
    return new Response(null, { status });
  }) as typeof fetch;
  return calls;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('GamePlayer', () => {
  it('never loads an address that is not on the games origin', async () => {
    const calls = fakeHead(200);
    const { container } = render(<GamePlayer url="https://evil.example/g/x/index.html" title="Evil" />);
    expect((await screen.findByRole('alert')).textContent).toContain('didn’t load');
    expect(container.querySelector('iframe')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('runs a reachable game in a locked-down frame and reports the start once', async () => {
    fakeHead(200);
    let started = 0;
    const { container } = render(<GamePlayer url={GOOD} title="Neon Pong" onStart={() => started++} />);
    const frame = await waitFor(() => {
      const el = container.querySelector('iframe');
      if (!el) throw new Error('frame not shown yet');
      return el;
    });
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-pointer-lock');
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(frame.getAttribute('title')).toBe('Neon Pong (game)');
    fireEvent.load(frame);
    fireEvent.load(frame);
    expect(started).toBe(1);
  });

  it('shows a failure with a working retry when the build is missing', async () => {
    const calls = fakeHead(404);
    const { container } = render(<GamePlayer url={GOOD} title="Neon Pong" />);
    expect((await screen.findByRole('alert')).textContent).toContain('didn’t load');
    expect(container.querySelector('iframe')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(calls.length).toBe(2));
  });
});
