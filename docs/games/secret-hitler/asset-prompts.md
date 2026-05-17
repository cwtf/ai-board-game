# Secret Hitler AI Asset Prompts

Use these prompts to generate original UI assets for the Secret Hitler game implementation. They are designed for a clean-room visual direction: tense political deduction, 1930s-inspired bureaucratic drama, art deco geometry, paper dossiers, stamps, ballots, and stark civic symbolism. Do not copy official card layouts, logos, symbols, typography, portraits, or board artwork.

Expected output paths:

- Ballots: `public/assets/secret-hitler/ballots/ja.png`, `public/assets/secret-hitler/ballots/nein.png`
- Secret roles: `public/assets/secret-hitler/roles/liberal.png`, `public/assets/secret-hitler/roles/fascist.png`, `public/assets/secret-hitler/roles/hitler.png`
- Party membership: `public/assets/secret-hitler/party/liberal.png`, `public/assets/secret-hitler/party/fascist.png`
- Policies: `public/assets/secret-hitler/policies/liberal.png`, `public/assets/secret-hitler/policies/fascist.png`
- Boards: `public/assets/secret-hitler/boards/liberal-board.png`, `public/assets/secret-hitler/boards/fascist-board.png`
- Election tracker token: `public/assets/secret-hitler/tokens/election-tracker.png`

## Global Style Direction

Use this visual language across every asset so the set feels cohesive.

```text
Original board-game UI asset, tense fictional parliamentary mystery atmosphere, clean-room civic setting, art deco geometry, aged paper, ink stamps, brass, dark walnut, smoky charcoal, muted cream, deep crimson, navy blue, desaturated gold, crisp vector-like illustration with subtle print texture, premium tabletop component, high contrast, readable silhouette, fictional serpent-and-lizard faction symbolism, no official board-game layout, no real political logos, no real-world insignia, no celebrity likeness, no readable text unless explicitly requested, no watermark.
```

Shared negative prompt:

```text
official board-game art, official logo, official role-card layout, copied board layout, copied iconography, real-world political insignia, real-world campaign poster, photorealistic public figure portrait, modern politician likeness, readable random text, watermark, blurry, low resolution, distorted hands, decorative border copied from an existing game card
```

## Ballot Cards

Use a vertical 2:3 card ratio. The card should work as a face-up ballot in a compact UI, with a strong single-word decision mark.

### `ballots/ja.png`

```text
Vertical 2:3 ballot card for a social deduction board game, full card face visible. A cream civic voting card with art deco border geometry, navy-blue approval seal, brass stamp texture, and the large centered word "JA" in clean block lettering. Tense parliamentary atmosphere, aged paper grain, subtle ink bleed, premium tabletop component, original design, no official game layout, no real political insignia.
```

Negative prompt:

```text
official ballot art, copied JA card, real political symbols, campaign poster, extra words, random letters, watermark, blurry
```

### `ballots/nein.png`

```text
Vertical 2:3 ballot card for a social deduction board game, full card face visible. A cream civic voting card with art deco border geometry, deep-crimson rejection seal, black ink stamp texture, and the large centered word "NEIN" in clean block lettering. Tense parliamentary atmosphere, aged paper grain, subtle ink bleed, premium tabletop component, original design, no official game layout, no real political insignia.
```

Negative prompt:

```text
official ballot art, copied NEIN card, real political symbols, campaign poster, extra words, random letters, watermark, blurry
```

## Secret Role Cards

Use a vertical 2:3 card ratio. These cards are private identity components, so they should feel like sealed dossier cards. Include the role name only if the generator can produce clean text; otherwise create text-free versions and let the UI overlay labels.

### `roles/liberal.png`

```text
Vertical 2:3 secret role card, sealed civic dossier for a fictional liberal reformer. Navy-blue and cream palette, art deco city hall window, fountain pen, folded parliamentary notes, restrained hopeful lighting, official-looking but fictional identity card, premium board-game illustration, original design. Optional clean title text: "LIBERAL". No official game art, no real politician, no real-world insignia.
```

### `roles/fascist.png`

```text
Vertical 2:3 secret role card, sealed conspirator dossier for a fictional serpent faction operative. Deep crimson, charcoal, brass, sharp art deco shadows, gloved hand near a sealed envelope, coded paper slips without readable text, coiled snake emblem, lizard-scale embossing, tense clandestine mood, premium board-game illustration, original design. Optional clean title text: "SERPENT". No official game art, no real-world insignia.
```

### `roles/hitler.png`

```text
Vertical 2:3 secret role card, sealed central-villain dossier for a fictional serpent faction leader in a social deduction game. Avoid likeness to any real person; show only an ominous empty podium, backlit silhouette from behind, heavy curtains, crimson and black art deco composition, confidential folder, coiled serpent motif, premium board-game illustration, original design. Optional clean title text: "VIPER". No photorealistic portrait, no real public figure likeness, no real-world insignia.
```

## Party Membership Cards

Use a vertical 2:3 card ratio. These are simpler than secret roles: they reveal party only, not exact role.

### `party/liberal.png`

```text
Vertical 2:3 party membership card, fictional democratic civic membership document. Navy-blue ribbon, cream paper, subtle city skyline emboss, ballot box icon, art deco linework, formal but clean, premium tabletop component. Optional clean title text: "LIBERAL". Original design, no official game layout, no real political logos.
```

### `party/fascist.png`

```text
Vertical 2:3 party membership card, fictional serpent faction membership document. Deep crimson ribbon, charcoal paper, angular art deco linework, sealed black envelope icon, coiled snake seal, subtle lizard-scale paper texture, tense bureaucratic styling, premium tabletop component. Optional clean title text: "SERPENT". Original design, no official game layout, no real-world insignia.
```

## Policy Cards

Use a vertical 2:3 card ratio. Policy cards should be simple, iconic, and readable at small size. Avoid detailed text; the UI can label them.

### `policies/liberal.png`

```text
Vertical 2:3 policy card, fictional liberal policy document, navy-blue and cream palette, civic reform imagery, open parliament doors, balanced scales, clean ballot stamp, aged paper texture, art deco geometry, premium tabletop asset. Optional clean title text: "LIBERAL POLICY". No official policy card, no copied layout, no real logos.
```

### `policies/fascist.png`

```text
Vertical 2:3 policy card, fictional serpent faction policy document, deep crimson and charcoal palette, locked gates, angular shadows, heavy stamp mark, coiled snake watermark, lizard-scale guilloche pattern, bureaucratic menace, aged paper texture, art deco geometry, premium tabletop asset. Optional clean title text: "SERPENT POLICY". No official policy card, no copied layout, no real-world insignia.
```

## Board Decks

Use a wide horizontal 16:9 or 3:2 ratio. These are track/board backgrounds, not individual cards. Leave open space for the UI to place policy slots, labels, and counters.

### `boards/liberal-board.png`

```text
Wide horizontal board background for a social deduction board game, fictional liberal policy track. Navy-blue civic chamber, cream marble, brass trim, art deco arches, five subtle empty rectangular policy spaces integrated into the architecture, hopeful but tense lighting, clean original board-game UI background, no readable text, no official board layout, no logos.
```

Negative prompt:

```text
official liberal board, copied policy track, readable text, real political symbols, cluttered UI, watermark, blurry
```

### `boards/fascist-board.png`

```text
Wide horizontal board background for a social deduction board game, fictional serpent faction policy track. Dark charcoal assembly hall, deep crimson banners with abstract snake-scale geometry only, brass trim, art deco severity, six subtle empty rectangular policy spaces integrated into the architecture, ominous but fictional mystery mood, clean original board-game UI background, no readable text, no official board layout, no real-world insignia.
```

Negative prompt:

```text
official crimson board, copied policy track, real-world political insignia, readable text, cluttered UI, watermark, blurry
```

## Election Tracker Token

Use a square 1:1 ratio with transparent or simple dark background. The token should remain readable at 32-48 px.

### `tokens/election-tracker.png`

```text
Square tabletop token for an election tracker, circular brass-and-enamel marker, small ballot box symbol in the center, navy and crimson enamel accents, art deco rim, premium board-game punchboard component, high contrast, readable at small size, transparent background or simple dark neutral background, original design, no official icon, no real political insignia.
```

Negative prompt:

```text
official token, copied icon, real political logos, readable tiny text, watermark, blurry, low contrast
```

## Optional Card Back

If the UI needs face-down policy or role decks, use this prompt.

### `backs/dossier-back.png`

```text
Vertical 2:3 card back for a fictional political-dossier social deduction board game. Charcoal linen paper, brass art deco border, sealed envelope emblem, subtle navy and crimson corner accents, aged print texture, premium tabletop component, no readable text, no official layout, no real political symbols.
```

## Generation Notes

- Prefer text-free assets where the UI can render labels itself. Generated text can be inconsistent.
- Keep all assets original. Do not prompt for official art, official layouts, official icons, or exact component copies.
- For board backgrounds, ask for open negative space so UI overlays remain legible.
- For role and party cards, generate separate text-free variants if the model struggles with clean lettering.
- Avoid real-world political imagery entirely. Use fictional serpent, lizard, and snake visual language through color, geometry, shadows, and bureaucracy instead.
