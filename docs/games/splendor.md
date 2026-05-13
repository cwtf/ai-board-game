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

1. **Token limit**: if you hold more than 10 tokens (any type), discard back to the supply until you hold exactly 10. Player chooses which to discard.
2. **Noble visit**: for each unclaimed noble whose gem-bonus requirement is met by your permanent bonuses, you may claim it. **Base rule: 1 noble per turn maximum**, player's choice if multiple eligible.
3. **Refill board**: if you bought or reserved a face-up card, draw a replacement from that tier's deck (if any cards remain).

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

## 7. AI prompt notes

System prompt sketch (refine during implementation):

> You are playing Splendor. Each turn you receive the full game state and a list of legal moves with short IDs. Respond with a single JSON object containing `moveId` and any required sub-decisions. Do not include prose outside the JSON. Prioritise: securing tier-3 cards, racing to nobles whose requirements you already partially meet, and denying high-value cards that opponents are close to affording. Avoid taking tokens when you cannot make progress toward a near-term purchase.

State serialisation should be compact JSON. Helpful fields per opponent: prestige, bonuses by colour, tokens by colour, reserve size (cards hidden if reserved from deck — but in Splendor, reserved cards' identities are public to the reserver only; opponents see the count only). Verify this against the official rules during implementation.

## 8. Known edge cases (write tests for these)

- Taking 3 gems when only 2 distinct colours have tokens: legal to take just those 2 (one of each).
- Taking 2 of the same when exactly 4 are in supply: legal (supply check is "≥4 before take").
- Reserving from an empty deck: illegal; remove that move from the legal set.
- Buying a card using a mix of bonuses, tokens, and gold where the math is non-trivial: validate by reconstructing the cost from scratch in `applyMove`.
- Final round: trigger fires the moment the threshold is reached, but the player who triggered it still finishes their turn; play continues until the player just before the trigger-player has had a turn.
- Two players reach 15 in the same round: standard tie-break applies.
- Token discard when over the limit after reserving (you took a gold): the discard must include enough to land at exactly 10.
- Multiple nobles eligible: only one is claimed per turn (base rules).

## 9. v1 simplifications

None planned. Splendor's rules are tractable and worth implementing in full.

## 10. References

- Official rulebook (Space Cowboys) — primary source for any ambiguity.
- BoardGameGeek wiki — useful for edge cases and FAQ.
