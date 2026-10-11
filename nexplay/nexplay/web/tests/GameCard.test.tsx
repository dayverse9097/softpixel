import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { GameCard } from '../src/components/GameCard';
import type { GameSummary } from '../src/lib/types';

const hostile: GameSummary = {
  slug: 'hostile',
  title: '<img src=x onerror="window.__xss=1">',
  description: '<script>window.__xss=2</script>',
  category: '<b>Arcade</b>',
  featured: false,
  publishedAt: null,
  coverUrl: 'javascript:alert(1)',
};

const renderCard = (game: GameSummary) =>
  render(
    <MemoryRouter>
      <GameCard game={game} />
    </MemoryRouter>,
  );

describe('GameCard', () => {
  it('shows game text as text and never as HTML', () => {
    const { container } = renderCard(hostile);
    expect(screen.getByText(hostile.title)).toBeTruthy();
    expect(screen.getByText(hostile.description)).toBeTruthy();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });

  it('refuses a cover address that is not on the games origin', () => {
    const { container } = renderCard(hostile);
    expect(container.querySelector('img')).toBeNull(); // the generated picture is used instead
  });

  it('offers named Play, Details and Favorite controls', () => {
    renderCard({ ...hostile, title: 'Neon Pong', coverUrl: null });
    expect(screen.getByRole('link', { name: 'Play Neon Pong' }).getAttribute('href')).toBe('/play/hostile');
    expect(screen.getByRole('link', { name: 'Details for Neon Pong' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add Neon Pong to favorites' }).getAttribute('aria-pressed')).toBe('false');
  });
});
