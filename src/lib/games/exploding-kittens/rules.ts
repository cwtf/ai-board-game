import { createRng } from '@/lib/games/shared/rng';
import { shuffle } from '@/lib/games/shared/shuffle';
import {
  ALL_CAT_KINDS,
  ALL_NAMED_KINDS,
  type CardKind,
  type EKMove,
  type EKState,
} from './state';

function cloneState(state: EKState): EKState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, hand: [...p.hand] })),
    deck: [...state.deck],
    discard: [...state.discard],
    knownTopN: Object.fromEntries(
      Object.entries(state.knownTopN).map(([k, v]) => [k, [...v]]),
    ),
    log: [...state.log],
  };
}

function nextAlivePlayer(players: EKState['players'], current: number): number {
  const n = players.length;
  let next = (current + 1) % n;
  for (let attempt = 0; attempt < n; attempt++) {
    if (players[next]!.alive) return next;
    next = (next + 1) % n;
  }
  return current;
}

function removeOne(hand: CardKind[], kind: CardKind): CardKind[] {
  const idx = hand.indexOf(kind);
  if (idx === -1) throw new Error(`Card "${kind}" not in hand.`);
  return [...hand.slice(0, idx), ...hand.slice(idx + 1)];
}

function removeN(hand: CardKind[], kind: CardKind, n: number): CardKind[] {
  let result = [...hand];
  for (let i = 0; i < n; i++) {
    const idx = result.indexOf(kind);
    if (idx === -1) throw new Error(`Not enough "${kind}" in hand.`);
    result.splice(idx, 1);
  }
  return result;
}

function countKind(hand: CardKind[], kind: CardKind): number {
  return hand.filter((c) => c === kind).length;
}

function advanceAfterEndOfTurn(s: EKState): void {
  if (s.pendingTurns > 1) {
    s.pendingTurns -= 1;
  } else {
    s.current = nextAlivePlayer(s.players, s.current);
    s.pendingTurns = 1;
  }
}

export function currentPlayer(state: EKState): number {
  if (state.pendingFavor !== null) return state.pendingFavor.to;
  return state.current;
}

export function isTerminal(state: EKState): boolean {
  return state.players.filter((p) => p.alive).length <= 1;
}

export function winner(state: EKState): number | null {
  if (!isTerminal(state)) return null;
  const idx = state.players.findIndex((p) => p.alive);
  return idx === -1 ? null : idx;
}

export function legalMoves(state: EKState, player: number): EKMove[] {
  const moves: EKMove[] = [];

  // Defuse sub-decision: player drew an exploding kitten and holds a defuse
  if (state.pendingDefuse && state.current === player) {
    for (let pos = 0; pos <= state.deck.length; pos++) {
      moves.push({ id: `DEFUSE:${pos}`, kind: 'defuse', insertAt: pos });
    }
    return moves;
  }

  // Favor give sub-decision: this player must hand over a card
  if (state.pendingFavor !== null && state.pendingFavor.to === player) {
    const hand = state.players[player]!.hand;
    for (const kind of new Set(hand)) {
      moves.push({ id: `GIVE:${kind}`, kind: 'give_favor', card: kind });
    }
    return moves;
  }

  if (state.current !== player) return [];

  const hand = state.players[player]!.hand;
  const alivePlayers = state.players
    .map((p, i) => ({ p, i }))
    .filter(({ p, i }) => p.alive && i !== player);

  // Single-card plays: skip, attack, shuffle, see_future
  for (const card of ['skip', 'attack', 'shuffle', 'see_future'] as CardKind[]) {
    if (hand.includes(card)) {
      moves.push({ id: `PLAY:${card}`, kind: 'play_single', card });
    }
  }

  // Favor: targets must have cards
  if (hand.includes('favor')) {
    for (const { p, i } of alivePlayers) {
      if (p.hand.length > 0) {
        moves.push({ id: `PLAY:favor:${i}`, kind: 'play_favor', targetIndex: i });
      }
    }
  }

  // Cat pair: 2 of the same cat kind → steal random from target
  for (const catKind of ALL_CAT_KINDS) {
    if (countKind(hand, catKind) >= 2) {
      for (const { p, i } of alivePlayers) {
        if (p.hand.length > 0) {
          moves.push({
            id: `PLAY:cat_pair:${catKind}:${i}`,
            kind: 'play_cat_pair',
            cardKind: catKind,
            targetIndex: i,
          });
        }
      }
    }
  }

  // Three of a kind: 3 copies of any card → name a card from target
  for (const cardKind of new Set(hand)) {
    if (countKind(hand, cardKind) >= 3) {
      for (const { p, i } of alivePlayers) {
        if (p.hand.length > 0) {
          for (const namedCard of ALL_NAMED_KINDS) {
            moves.push({
              id: `PLAY:three_kind:${cardKind}:${i}:${namedCard}`,
              kind: 'play_three_kind',
              cardKind,
              targetIndex: i,
              namedCard,
            });
          }
        }
      }
    }
  }

  // Five different cards: pick any card from discard
  if (state.discard.length > 0 && new Set(hand).size >= 5) {
    // Use the first 5 unique kinds (deterministic) as the played cards
    const uniqueKinds = [...new Set(hand)].slice(0, 5) as CardKind[];
    for (const discardPick of new Set(state.discard)) {
      moves.push({
        id: `PLAY:five_diff:${discardPick}`,
        kind: 'play_five_diff',
        cards: uniqueKinds,
        discardPick,
      });
    }
  }

  // Draw: always available as the turn-ending action
  moves.push({ id: 'DRAW', kind: 'draw' });

  return moves;
}

export function applyMove(state: EKState, move: EKMove): EKState {
  const s = cloneState(state);
  s.turn += 1;

  if (move.kind === 'defuse') {
    if (!s.pendingDefuse) throw new Error('No pending defuse.');
    s.players[s.current]!.hand = removeOne(s.players[s.current]!.hand, 'defuse');
    s.discard = ['defuse', ...s.discard];
    const pos = Math.min(Math.max(0, move.insertAt), s.deck.length);
    s.deck.splice(pos, 0, 'exploding');
    s.pendingDefuse = false;
    s.knownTopN = {};
    advanceAfterEndOfTurn(s);
    return s;
  }

  if (move.kind === 'give_favor') {
    if (!s.pendingFavor) throw new Error('No pending favor.');
    const { from, to } = s.pendingFavor;
    s.players[to]!.hand = removeOne(s.players[to]!.hand, move.card);
    s.players[from]!.hand.push(move.card);
    s.pendingFavor = null;
    return s;
  }

  if (move.kind === 'draw') {
    if (s.deck.length === 0) {
      advanceAfterEndOfTurn(s);
      return s;
    }

    const drawn = s.deck.shift()!;
    // Shift all players' known top-N since the top card is now gone
    for (const pIdx of Object.keys(s.knownTopN).map(Number)) {
      s.knownTopN[pIdx] = s.knownTopN[pIdx]!.slice(1);
      if (s.knownTopN[pIdx]!.length === 0) delete s.knownTopN[pIdx];
    }

    if (drawn === 'exploding') {
      if (s.players[s.current]!.hand.includes('defuse')) {
        s.pendingDefuse = true;
      } else {
        // Eliminated: discard their hand and the exploding kitten
        s.players[s.current]!.alive = false;
        s.discard = [drawn, ...s.players[s.current]!.hand, ...s.discard];
        s.players[s.current]!.hand = [];
        const next = nextAlivePlayer(s.players, s.current);
        s.current = next;
        s.pendingTurns = 1;
      }
    } else {
      s.players[s.current]!.hand.push(drawn);
      advanceAfterEndOfTurn(s);
    }
    return s;
  }

  if (move.kind === 'play_single') {
    const player = s.current;
    s.players[player]!.hand = removeOne(s.players[player]!.hand, move.card);
    s.discard = [move.card, ...s.discard];

    if (move.card === 'skip') {
      advanceAfterEndOfTurn(s);
    } else if (move.card === 'attack') {
      const nextPl = nextAlivePlayer(s.players, player);
      const nextTurns = s.pendingTurns - 1 + 2;
      s.current = nextPl;
      s.pendingTurns = nextTurns;
    } else if (move.card === 'shuffle') {
      s.deck = shuffle(s.deck, createRng(`${s.seed}:shuffle:${s.turn}`));
      s.knownTopN = {};
    } else if (move.card === 'see_future') {
      s.knownTopN[player] = s.deck.slice(0, Math.min(3, s.deck.length));
    }
    return s;
  }

  if (move.kind === 'play_favor') {
    const player = s.current;
    s.players[player]!.hand = removeOne(s.players[player]!.hand, 'favor');
    s.discard = ['favor', ...s.discard];
    s.pendingFavor = { from: player, to: move.targetIndex };
    return s;
  }

  if (move.kind === 'play_cat_pair') {
    const player = s.current;
    s.players[player]!.hand = removeN(s.players[player]!.hand, move.cardKind, 2);
    s.discard = [move.cardKind, move.cardKind, ...s.discard];
    const target = s.players[move.targetIndex]!;
    if (target.hand.length > 0) {
      const rng = createRng(`${s.seed}:catpair:${s.turn}`);
      const idx = rng.int(target.hand.length);
      const stolen = target.hand.splice(idx, 1)[0]!;
      s.players[player]!.hand.push(stolen);
    }
    return s;
  }

  if (move.kind === 'play_three_kind') {
    const player = s.current;
    s.players[player]!.hand = removeN(s.players[player]!.hand, move.cardKind, 3);
    s.discard = [
      move.cardKind,
      move.cardKind,
      move.cardKind,
      ...s.discard,
    ];
    const target = s.players[move.targetIndex]!;
    const cardIdx = target.hand.indexOf(move.namedCard);
    if (cardIdx !== -1) {
      target.hand.splice(cardIdx, 1);
      s.players[player]!.hand.push(move.namedCard);
    }
    return s;
  }

  if (move.kind === 'play_five_diff') {
    const player = s.current;
    let hand = [...s.players[player]!.hand];
    for (const card of move.cards) {
      hand = removeOne(hand, card);
    }
    s.players[player]!.hand = hand;
    s.discard = [...move.cards, ...s.discard];
    const discardIdx = s.discard.indexOf(move.discardPick);
    if (discardIdx !== -1) {
      s.discard.splice(discardIdx, 1);
      s.players[player]!.hand.push(move.discardPick);
    }
    return s;
  }

  throw new Error(`Unknown move kind: ${(move as { kind: string }).kind}`);
}
