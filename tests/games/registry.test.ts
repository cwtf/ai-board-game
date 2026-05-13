import { describe, expect, it } from 'vitest';
import { games } from '@/lib/games/registry';

describe('game registry', () => {
  it('seeds the v1 game list', () => {
    expect(games.map((game) => game.id)).toEqual([
      'splendor',
      'exploding-kittens',
    ]);
  });

  it('points every game at a markdown rules doc', () => {
    expect(games.every((game) => game.docPath.startsWith('docs/games/'))).toBe(
      true,
    );
    expect(games.every((game) => game.docPath.endsWith('.md'))).toBe(true);
  });
});
