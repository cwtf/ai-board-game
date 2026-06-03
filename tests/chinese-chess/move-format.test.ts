import { describe, expect, it } from 'vitest';
import {
  formatChineseChessMove,
  pieceChar,
} from '@/lib/games/chinese-chess/move-format';
import { init } from '@/lib/games/chinese-chess/state';

describe('Chinese Chess move formatting', () => {
  it('formats a simple move with Chinese notation', () => {
    const state = init({ seed: 'move-format', playerCount: 2 });

    expect(
      formatChineseChessMove(
        {
          id: 'MOVE:r-cannon-l:1,7->4,7',
          pieceId: 'r-cannon-l',
          from: { x: 1, y: 7 },
          to: { x: 4, y: 7 },
        },
        state,
      ),
    ).toBe('炮八平五');
  });

  it('formats a forward move with Chinese notation', () => {
    const state = init({ seed: 'move-format', playerCount: 2 });

    expect(
      formatChineseChessMove(
        {
          id: 'MOVE:r-soldier-3:4,6->4,5',
          pieceId: 'r-soldier-3',
          from: { x: 4, y: 6 },
          to: { x: 4, y: 5 },
        },
        state,
      ),
    ).toBe('兵五進1');
  });

  it('exposes character for captured piece summaries', () => {
    const state = init({ seed: 'move-format-captured', playerCount: 2 });
    const redGeneral = state.pieces.find(
      (piece) => piece.type === 'general' && piece.owner === 0,
    );

    expect(redGeneral ? pieceChar(redGeneral) : '').toBe('帥');
  });

  it('formats a capture', () => {
    const state = init({ seed: 'move-format-capture', playerCount: 2 });

    const label = formatChineseChessMove(
      {
        id: 'MOVE:r-chariot-l:0,9->0,3',
        pieceId: 'r-chariot-l',
        from: { x: 0, y: 9 },
        to: { x: 0, y: 3 },
        capturedId: 'b-soldier-1',
      },
      state,
    );

    expect(label).toContain('俥九進6');
    expect(label).toContain('captures');
  });
});
