# Splendor — Game Design Doc

> Per-game spec for Splendor (Marc André / Space Cowboys, 2014). Refer to [the main design doc](../../DESIGN.md) for architecture, AI plumbing, and shared interfaces.

## 1. Overview

Engine-building card game for 2–4 players. Players collect gem tokens, use them to buy development cards (which provide permanent gem discounts), and accumulate prestige points. First to 15 prestige triggers the final round.

**Information**: perfect (open). Easy for current LLMs to play competently.

**Estimated AI turn cost**: ~1–2 KB serialised state, ~200–400 input tokens, ~50 output tokens.

## 2. Components

### Gems
- 5 standard gem types: **emerald** (green), **sapphire** (blue), **ruby** (red), **diamond** (white), **onyx** (black).
- 1 wild: **gold**.

### Token supply (varies by player count)
| Player count | Each standard gem | Gold |
|---|---|---|
| 2 | 4 | 5 |
| 3 | 5 | 5 |
| 4 | 7 | 5 |

### Cards
- 90 development cards across three tiers:
  - **Tier 1**: 40 cards. Costs 2–8 gems total. Prestige 0–1. Bonus: 1 gem.
  - **Tier 2**: 30 cards. Costs 5–10 gems total. Prestige 1–3. Bonus: 1 gem.
  - **Tier 3**: 20 cards. Costs 7–14 gems total. Prestige 3–5. Bonus: 1 gem.
- Each card has: tier, cost (per gem colour), bonus colour (1 gem), prestige value.
- Display: 4 face-up per tier (a 3×4 grid).

### Nobles
- 10 nobles total. (N + 1) dealt face-up at start, where N = player count.
- Each noble has a gem-bonus requirement (e.g. 3 emerald + 3 ruby) and a prestige value (always 3).

Card and noble definitions go in `src/lib/games/splendor/data/cards.ts` and `data/nobles.ts`. Use the published card list — implementing 90 cards is mechanical but tedious; recommend pulling from a known reference such as the official rulebook or a community-maintained CSV.

## 3. Turn structure

On your turn, take **exactly one** of these actions:

1. **Take 3 different-colour gems** (1 each from the supply, three distinct colours). If a colour's supply is empty, you can take fewer (down to 0 for that colour) but you still pick 3 distinct colours that have at least one token available, taking 1 from each.
2. **Take 2 gems of the same colour** — only if that colour's supply has **at least 4 tokens** before your take.
3. **Reserve a card**: take 1 face-up card from the board, or the top card of a tier deck (sight-unseen). Place it in your reserve. If gold is available in the supply, take 1 gold. **Hand limit: 3 reserved cards.**
4. **Purchase a card**: pay the card's cost using your tokens. Permanent bonuses from cards you already own substitute for tokens (e.g. owning 2 ruby-bonus cards reduces a card's ruby cost by 2). Gold tokens are wild. The card can be from the board or from your reserve.

### End-of-turn cleanup

If a buy or reserve action removes a face-up card from the board, immediately refill that same board slot from the matching tier deck before end-of-turn cleanup. If the deck is empty, the slot becomes `null`.

1. **Token limit**: if you hold more than 10 tokens (any type), discard back to the supply until you hold exactly 10. Player chooses which to discard.
2. **Noble visit**: for each unclaimed noble whose gem-bonus requirement is met by your permanent bonuses, claim exactly one noble. **Base rule: 1 noble per turn maximum**. If exactly one noble is eligible it is auto-claimed; if multiple nobles are eligible, the player chooses one.

## 4. End of game

When any player reaches **15 prestige**, **finish the current round** so all players have had the same number of turns. Then:

- Highest prestige wins.
- Tie-break: fewest development cards purchased.
- Further ties: shared win.

## 5. State shape

```ts
type Gem = 'emerald' | 'sapphire' | 'ruby' | 'diamond' | 'onyx';
type GemOrGold = Gem | 'gold';

interface Card {
  id: string;
  tier: 1 | 2 | 3;
  cost: Partial<Record<Gem, number>>;   // omitted keys = 0
  bonus: Gem;
  prestige: number;
}

interface Noble {
  id: string;
  cost: Partial<Record<Gem, number>>;
  prestige: number;                      // always 3 in standard rules
}

interface PlayerState {
  tokens: Record<GemOrGold, number>;
  bonuses: Record<Gem, number>;          // from purchased cards
  cards: Card[];                         // purchased
  reserved: Card[];                      // max 3
  nobles: Noble[];
  prestige: number;
}

interface SplendorState {
  seed: string;
  players: PlayerState[];
  current: number;                       // index into players
  tokenPool: Record<GemOrGold, number>;
  board: {
    tier1: (Card | null)[];              // length 4; null if deck empty
    tier2: (Card | null)[];
    tier3: (Card | null)[];
  };
  decks: { tier1: Card[]; tier2: Card[]; tier3: Card[] };
  noblesInPlay: Noble[];
  turn: number;
  finalRoundTriggered: boolean;
  finalRoundStartedAt: number | null;    // turn index when 15-prestige was first reached
  log: MoveRecord[];
}
```

## 6. Move encoding

Legal moves are enumerated with deterministic IDs. The AI receives the list and picks one by ID.

| Move kind | ID format | Example |
|---|---|---|
| Take 3 different | `TAKE3:<g1>,<g2>,<g3>` | `TAKE3:emerald,sapphire,ruby` |
| Take 2 same | `TAKE2:<gem>` | `TAKE2:onyx` |
| Take 1 or 2 (when ≥3 colours unavailable) | `TAKEN:<g1>[,<g2>]` | `TAKEN:diamond` |
| Reserve face-up | `RESERVE:<tier>:<cardId>` | `RESERVE:2:t2_17` |
| Reserve from deck | `RESERVE:<tier>:DECK` | `RESERVE:3:DECK` |
| Buy from board | `BUY:BOARD:<cardId>` | `BUY:BOARD:t1_05` |
| Buy from reserve | `BUY:RESERVED:<cardId>` | `BUY:RESERVED:t3_02` |

### Sub-decisions bundled into the move payload

The AI returns:
```json
{
  "moveId": "BUY:BOARD:t2_11",
  "goldUsedFor": { "ruby": 1, "emerald": 0 },
  "discard": { "sapphire": 1, "diamond": 1 },
  "noble": "noble_3",
  "reasoning": "optional"
}
```

- `goldUsedFor`: required when paying a card whose remaining cost (after permanent bonuses) exceeds your non-gold tokens of that colour. Adapter validates totals.
- `discard`: required only if the resulting token count would exceed 10. Sum must reduce to exactly 10.
- `noble`: required only if multiple nobles are eligible; otherwise the single eligible noble (if any) is auto-claimed.
- `reasoning`: discarded by the adapter; useful when debugging.

`parseAIMove` validates that `moveId` is in the legal-move list and that all sub-decisions are well-formed. On failure, returns the specific reason to be echoed back in the retry prompt.

## 7. Implementation contracts

### Initialization

- Validate `playerCount` is 2-4.
- If no seed is provided, create a fresh random seed. If a seed is provided, all randomness must be reproducible from that seed for testing and replay.
- Shuffle tier 1, tier 2, tier 3, and nobles independently. Each shuffle should be an unbiased random permutation of that list; no tier or noble order should be preserved from source data except by chance.
- Deal the first 4 cards of each shuffled tier to face-up board slots 0-3. The remaining cards stay in that tier deck in shuffled order, with future draws taken from the front.
- Deal `playerCount + 1` nobles from the shuffled noble list to `noblesInPlay`.
- Initialize current player to player 0, turn to 0, final-round fields to false/null, each player with no tokens/cards/reserves/nobles, and token pools from the player-count table.

### Legal Move Coverage

`legalMoves()` must include every currently legal move and no illegal moves:

- Take all combinations of up to 3 distinct available standard gems. If only 1 or 2 standard gem colours are available, generate reduced `TAKEN` moves for those colours.
- Take 2 matching standard gems only when that gem has at least 4 tokens in the supply before the take.
- Reserve every face-up card and every non-empty tier deck when the player has fewer than 3 reserved cards.
- Buy every affordable face-up board card and every affordable reserved card.
- Do not include reserve-from-deck moves for empty decks or reserve moves for players already at 3 reserved cards.

### Action Resolution

- `applyMove()` clones the state and never mutates the input state.
- Buying or reserving a face-up card immediately refills the same board slot from that tier deck, or writes `null` if the deck is empty.
- Reserving from a deck draws the front card from the selected shuffled tier deck.
- Reserving grants 1 gold only if gold remains in the token pool.
- After the action resolves, enforce token discard down to exactly 10, then resolve noble claiming, then advance the turn.
- If a player reaches 15 prestige after the action and noble step, set `finalRoundTriggered` and remember the triggering turn before advancing to the next player.

### Payment Validation

- Permanent bonuses reduce each gem cost before tokens are spent.
- Standard gem tokens pay their matching remaining cost.
- Gold is wild and may cover any remaining gem cost after bonuses and matching tokens.
- `goldUsedFor` must not overpay a gem, cannot allocate more gold than the player has, and must reconstruct to a valid exact payment.
- Paid standard and gold tokens return to the token pool.

### Visibility And UI

- The engine state may store all reserved cards, including cards reserved from decks. AI serialization should hide deck-reserved card identities from opponents and expose them only to the reserving player.
- The UI should derive and display effective costs after bonuses, token totals, reserve counts, prestige, final-round status, legal affordance markers, and winner/tie state.
- Missing card or noble art must fall back to a rules-readable layout rather than blocking play.

## 8. AI prompt notes

System prompt sketch (refine during implementation):

> You are playing Splendor. Each turn you receive the full game state and a list of legal moves with short IDs. Respond with a single JSON object containing `moveId` and any required sub-decisions. Do not include prose outside the JSON. Prioritise: securing tier-3 cards, racing to nobles whose requirements you already partially meet, and denying high-value cards that opponents are close to affording. Avoid taking tokens when you cannot make progress toward a near-term purchase.

State serialisation should be compact JSON. Helpful fields per opponent: prestige, bonuses by colour, tokens by colour, and reserve size. Reserved deck-card identities are shown to the reserving player and hidden from opponents.

## 9. Known edge cases (write tests for these)

- Taking 3 gems when only 2 distinct colours have tokens: legal to take just those 2 (one of each).
- Taking 2 of the same when exactly 4 are in supply: legal (supply check is "≥4 before take").
- Reserving from an empty deck: illegal; remove that move from the legal set.
- Buying a card using a mix of bonuses, tokens, and gold where the math is non-trivial: validate by reconstructing the cost from scratch in `applyMove`.
- Final round: trigger fires the moment the threshold is reached, but the player who triggered it still finishes their turn; play continues until the player just before the trigger-player has had a turn.
- Two players reach 15 in the same round: standard tie-break applies.
- Token discard when over the limit after reserving (you took a gold): the discard must include enough to land at exactly 10.
- Multiple nobles eligible: only one is claimed per turn (base rules).

## 10. v1 simplifications

None planned. Splendor's rules are tractable and worth implementing in full.

## 11. References

- Official rulebook (Space Cowboys) — primary source for any ambiguity.
- BoardGameGeek wiki — useful for edge cases and FAQ.
