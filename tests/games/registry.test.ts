import { describe, expect, it } from 'vitest';
import { games } from '@/lib/games/registry';

describe('game registry', () => {
  it('seeds the v1 game list', () => {
    expect(games.map((game) => game.id)).toEqual([
      'splendor',
      'secret-hitler',
      'jungle-chess',
      'exploding-kittens',
    ]);
  });

  it('points every game at a local or external rules reference', () => {
    expect(
      games.every((game) =>
        /^(docs\/games\/.+\.md|https?:\/\/.+)/.test(game.docPath),
      ),
    ).toBe(
      true,
    );
  });
});
