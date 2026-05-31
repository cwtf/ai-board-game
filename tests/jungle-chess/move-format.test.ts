import { describe, expect, it } from 'vitest';
import {
  formatJungleMove,
  pieceEmoji,
} from '@/lib/games/jungle-chess/move-format';
import { init } from '@/lib/games/jungle-chess/state';

describe('Jungle Chess move formatting', () => {
  it('uses animal emoji in move log labels', () => {
    const state = init({ seed: 'move-format', playerCount: 2 });

    expect(
      formatJungleMove(
        {
          id: 'MOVE:r-leopard:4,6->4,5',
          pieceId: 'r-leopard',
          from: { x: 4, y: 6 },
          to: { x: 4, y: 5 },
        },
        state,
      ),
    ).toBe('Red 🐆 E7 to E6');
  });

  it('exposes emoji for captured piece summaries', () => {
    const state = init({ seed: 'move-format-captured', playerCount: 2 });
    const lion = state.pieces.find((piece) => piece.type === 'lion');

    expect(lion ? pieceEmoji(lion) : '').toBe('🦁');
  });
});
