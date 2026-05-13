# Exploding Kittens — Game Design Doc

> Per-game spec for Exploding Kittens (Elan Lee / Matthew Inman / Shane Small, 2015, original deck). Refer to [the main design doc](../../DESIGN.md) for architecture, AI plumbing, and shared interfaces.

## 1. Overview

Last-player-standing card game for 2–5 players. Players draw cards from a shared deck. Drawing an Exploding Kitten eliminates you unless you can play a Defuse to put it back. Action cards manipulate the deck, your hand, and the turn order.

**Information**: hidden. Opponents' hands and the order of the deck are unknown (with limited exceptions via See the Future).

**Estimated AI turn cost**: ~600 input tokens, ~50–80 output tokens. Turns are short but there are many of them per game.

## 2. Components (original deck, 56 cards)

| Card | Count | Effect |
|---|---|---|
| Exploding Kitten | 4 | If drawn, you're eliminated unless you play a Defuse. |
| Defuse | 6 | Played when you draw an Exploding Kitten: place the Exploding Kitten anywhere in the deck (face-down, position of your choice). |
| Attack | 4 | End your turn immediately without drawing. Next player takes 2 turns. Attacks stack. |
| Skip | 4 | End your turn immediately without drawing. (One turn skipped — relevant during stacked Attacks.) |
| Favor | 4 | Choose a player; they give you one card of their choice from their hand. |
| Shuffle | 4 | Shuffle the draw deck. |
| See the Future | 5 | Privately view the top 3 cards of the deck without changing order. |
| Nope | 5 | Stop the action of another player. Can be played at any time, including stacking on another Nope. **Deferred to v1.1 — see §9.** |
| Tacocat | 4 | Cat card. No solo effect. |
| Hairy Potato Cat | 4 | Cat card. No solo effect. |
| Cattermelon | 4 | Cat card. No solo effect. |
| Beard Cat | 4 | Cat card. No solo effect. |
| Rainbow-Ralphing Cat | 4 | Cat card. No solo effect. |

**Cat card combos** (these are matched-set plays, not solo effects):

- **Pair (2 same cat)**: name a player; take a random card from their hand.
- **Three of a kind**: name a player and name a card; if they have it, they must give it to you.
- **Five different cards** (any types, from your hand or the discard pile): take any card from the discard pile.

The 3-of-a-kind and 5-different combos use any cards, not only cat cards. Verify against the official rulebook during implementation.

## 3. Setup

1. Remove all Exploding Kittens and all Defuses from the deck.
2. Shuffle remaining cards. Deal 7 cards to each player.
3. Give each player 1 Defuse. Each player now has 8 cards (7 + 1 Defuse).
4. Put the remaining Defuses (6 − N, where N is player count, for 2–5 players) back in the deck.
5. Insert (N − 1) Exploding Kittens into the deck.
6. Shuffle the deck thoroughly.

For 5 players, Defuses (6 − 5 = 1) go back in the deck. For 2 players, 4 Defuses go back. Verify exact counts against the rulebook for edge player counts; some editions adjust.

## 4. Turn structure

1. **Play any number of cards** (subject to per-card rules and the legal-move list).
2. **Draw one card** from the top of the deck.
   - If it's an Exploding Kitten: either play a Defuse from hand (then secretly choose a position in the deck and reinsert the Exploding Kitten there), or be eliminated (your hand goes to discard).
   - Otherwise: add it to your hand.
3. **Pass turn** to the next living player (clockwise), unless the turn ended early via Attack/Skip or `pendingTurns > 1`.

### Turn modifiers

- **Skip**: ends your current turn without drawing. If you have `pendingTurns > 1`, decrements by 1 instead of ending.
- **Attack**: ends your current turn without drawing AND sets the next player's `pendingTurns` to 2. If the next player already has `pendingTurns`, **stacks** (so chained Attacks accumulate).
- **Favor**: target chooses which card to give. If the target is an AI, randomise (or use a sub-decision query).
- **See the Future**: top 3 cards revealed to the current player only. Store in `knownTopN[playerIndex]` and clear when those cards are drawn or the deck is shuffled.
- **Shuffle**: shuffle deck; clear all `knownTopN` entries (everyone's foresight is invalidated).
- **Nope**: see §9.

## 5. End of game

The last player not eliminated wins. With N players, (N − 1) Exploding Kittens are in the deck, so all but one will be eliminated.

## 6. State shape

```ts
type CardKind =
  | 'defuse' | 'exploding' | 'attack' | 'skip' | 'favor'
  | 'shuffle' | 'see_future' | 'nope'
  | 'cat_tacocat' | 'cat_potato' | 'cat_cattermelon' | 'cat_beard' | 'cat_rainbow';

interface Player {
  hand: CardKind[];
  alive: boolean;
}

interface EKState {
  seed: string;
  players: Player[];
  deck: CardKind[];                        // index 0 = top
  discard: CardKind[];                     // index 0 = top (most recent)
  current: number;
  pendingTurns: number;                    // turns the current player still owes (default 1)
  knownTopN: Record<number, CardKind[]>;   // playerIndex → top-N cards they've peeked at
  pendingFavor: { from: number; to: number } | null;  // mid-Favor resolution
  turn: number;
  log: MoveRecord[];
}
```

### Per-player view (what `serializeForAI` exposes)

For player P, the adapter exposes:
- P's own hand (full).
- Discard pile (public).
- For each other player: hand size, alive/eliminated.
- Deck size.
- P's `knownTopN` entry (their See-the-Future memory), if any.
- `pendingTurns`, current player index, turn number.
- Card composition statistics: how many of each `CardKind` remain unseen by P (i.e. in deck + in other players' hands combined). This gives the AI a basis for belief reasoning without leaking specific opponent hands.

Critically: do **not** include other players' hand contents in the serialisation. Add a test that asserts this.

## 7. Move encoding

| Move kind | ID format | Example | Notes |
|---|---|---|---|
| Play single action | `PLAY:<card>` | `PLAY:skip` | Single-card actions. |
| Play Favor | `PLAY:favor:<targetIndex>` | `PLAY:favor:2` | Target is a player index. |
| Play See the Future | `PLAY:see_future` | | Result goes to private `knownTopN`. |
| Play Shuffle | `PLAY:shuffle` | | |
| Play Attack | `PLAY:attack` | | |
| Play cat pair (steal random) | `PLAY:cat_pair:<cardKind>:<targetIndex>` | `PLAY:cat_pair:cat_beard:1` | Requires 2 of that cat. |
| Play 3-of-a-kind (steal named) | `PLAY:three_kind:<cardKind>:<targetIndex>:<namedCard>` | `PLAY:three_kind:cat_beard:1:nope` | Requires 3 of that card. |
| Play 5-different (take from discard) | `PLAY:five_diff:<c1,c2,c3,c4,c5>:<discardCard>` | `PLAY:five_diff:cat_a,cat_b,cat_c,attack,shuffle:see_future` | Five distinct kinds from hand. |
| Draw (end turn) | `DRAW` | | After playing actions (or none). |

### Defuse sub-decision

When an Exploding Kitten is drawn, the loop pauses and asks the current player (separately) for a defuse decision:

```json
{
  "defuse": true,
  "insertAt": 7
}
```

- `insertAt`: integer in `[0, deckSize]` where 0 = top.
- If the player has no Defuse, this move is not offered; they are eliminated automatically.
- For AI: position is part of strategy (top = pass it to the next player immediately; bottom = delay).

### Favor target sub-decision

When the target of Favor is asked which card to give:

```json
{
  "give": "skip"
}
```

Must be a `CardKind` present in the target's hand.

## 8. AI prompt notes

System prompt sketch:

> You are playing Exploding Kittens. Hidden information: you do not know other players' hands or the order of the deck. You know your hand, the discard pile, every player's hand size, the deck size, and any cards you've previously seen via See the Future. Respond with a single JSON object containing `moveId` and any required sub-decisions. Key strategic priorities: hoard Defuses, time your Skip/Attack to dodge Exploding Kittens when the deck thins, use See the Future before risky draws, and play cat-pair steals against players holding many cards.

For Defuse reinsertion: the AI should place Exploding Kittens to maximise the chance the next player draws them. This often means top of deck if the next opponent is vulnerable, or bottom if you want to bury it.

## 9. Nope handling — deferred to v1.1

Nope is genuinely hard to model because it's an asynchronous interrupt that any player can play, can be chained (Nope a Nope), and has a short real-world window.

**v1 simplification**: Nope cards are in the deck but **cannot be played**. They count as filler — useful only as fodder for 5-different combos. The legal-move list never offers `PLAY:nope`.

**v1.1 plan**: synchronous Nope sub-phase.

1. When a player plays a "nopable" action (most non-cat plays except Defuse and the draw itself), open a Nope window.
2. Poll every other living player in turn order: "Do you want to Nope this?"
   - AI players: dedicated short prompt with just the pending action and their hand.
   - Human players: modal with a configurable timeout (default 5s) that auto-passes.
3. If any player Nopes, open a nested window (anyone else can Nope the Nope).
4. Resolve: if the final Nope count is odd, the original action is cancelled (cards still discarded). If even (or zero), the action proceeds.

This is intricate and not necessary for a playable v1.

## 10. v1 simplifications (summary)

- **No Nope.** Cards remain in deck as fodder only.
- **Favor on AI targets**: AI gives a random card from its hand rather than a strategic choice. Upgrade later.
- **No "Imploding Kitten" or expansion content.**

## 11. Known edge cases (write tests for these)

- Attack stacks: A attacks B (B has 2 turns). B attacks C on their first turn (C has 3 turns: B's remaining 1 + 2 new). Verify the accumulation rule against the rulebook — original editions vary on whether Attack sets or adds.
- Drawing the last card: if the deck empties without an Exploding Kitten coming out, that's a design impossibility given setup (Exploding Kittens are in the deck). But: if all (N − 1) Exploding Kittens have been drawn and defused, the deck can in principle thin to zero — handle this gracefully (no-op draw? game-end tie?). Confirm against rulebook.
- See the Future when the deck has fewer than 3 cards: reveal as many as exist.
- Shuffle invalidates everyone's See-the-Future memory.
- Reinserting an Exploding Kitten at a position beyond current deck size: clamp to `deckSize` (bottom).
- Cat-pair steal from a player with an empty hand: not allowed; remove from legal moves.
- 5-different combo using cards from discard: original rules let you "take any card from the discard pile" after playing 5 different from hand. Verify whether the 5 cards themselves come from hand only or can include discard.
- Player count = 2: the "next player" is always the same person. Attack still works (they take 2 turns); Skip + Skip ends your turn without drawing.

## 12. References

- Original rulebook (Exploding Kittens, Inc.) — primary source.
- Note that several rules have community-disputed interpretations (Attack stacking, 5-different mechanics); the rulebook is the tiebreaker.
