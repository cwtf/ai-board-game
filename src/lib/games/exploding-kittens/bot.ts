import type { CardKind, EKMove, EKState } from './state';

const GIVE_PRIORITY: CardKind[] = [
  'nope',
  'cat_tacocat',
  'cat_potato',
  'cat_cattermelon',
  'cat_beard',
  'cat_rainbow',
  'shuffle',
  'see_future',
  'skip',
  'attack',
  'favor',
  'defuse',
];

export function chooseEKBotMove(
  state: EKState,
  player: number,
  moves: EKMove[],
): EKMove {
  // Nope window: decide whether to cancel the pending action
  if (moves.some((m) => m.kind === 'nope' || m.kind === 'pass_nope')) {
    const nopeMove = moves.find((m) => m.kind === 'nope');
    const passMove = moves.find((m) => m.kind === 'pass_nope')!;
    if (!nopeMove) return passMove;
    const action = state.pendingNope!.action;
    const targetsMe =
      ('targetIndex' in action && action.targetIndex === player) ||
      (action.kind === 'play_favor' && action.targetIndex === player);
    const isAttack = action.kind === 'play_single' && action.card === 'attack';
    return isAttack || targetsMe ? nopeMove : passMove;
  }

  // Sub-decision: defuse — bury at bottom 70% of deck
  const defuseMoves = moves.filter((m): m is Extract<EKMove, { kind: 'defuse' }> => m.kind === 'defuse');
  if (defuseMoves.length > 0) {
    const pos = Math.min(
      Math.floor(state.deck.length * 0.7),
      state.deck.length,
    );
    return defuseMoves.find((m) => m.insertAt === pos) ?? defuseMoves[defuseMoves.length - 1]!;
  }

  // Sub-decision: give_favor — give least-useful card
  const giveMoves = moves.filter((m): m is Extract<EKMove, { kind: 'give_favor' }> => m.kind === 'give_favor');
  if (giveMoves.length > 0) {
    for (const kind of GIVE_PRIORITY) {
      const m = giveMoves.find((gm) => gm.card === kind);
      if (m) return m;
    }
    return giveMoves[0]!;
  }

  const knownTop = state.knownTopN[player] ?? [];
  const topIsExploding = knownTop[0] === 'exploding';

  // If top card is known to be exploding, dodge it
  if (topIsExploding) {
    const skip = moves.find((m): m is Extract<EKMove, { kind: 'play_single' }> =>
      m.kind === 'play_single' && m.card === 'skip');
    if (skip) return skip;

    const attack = moves.find((m): m is Extract<EKMove, { kind: 'play_single' }> =>
      m.kind === 'play_single' && m.card === 'attack');
    if (attack) return attack;

    const shuf = moves.find((m): m is Extract<EKMove, { kind: 'play_single' }> =>
      m.kind === 'play_single' && m.card === 'shuffle');
    if (shuf) return shuf;
  }

  // Peek the deck if it's getting thin and we don't already know the top
  if (state.deck.length <= 10 && knownTop.length === 0) {
    const sf = moves.find((m): m is Extract<EKMove, { kind: 'play_single' }> =>
      m.kind === 'play_single' && m.card === 'see_future');
    if (sf) return sf;
  }

  // Otherwise just draw
  return moves.find((m) => m.kind === 'draw') ?? moves[0]!;
}
