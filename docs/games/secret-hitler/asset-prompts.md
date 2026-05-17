# Secret Hitler AI Asset Prompts

Use these prompts to generate original UI assets for the Secret Hitler game implementation. They are designed for a clean-room visual direction: tense political deduction, 1930s-inspired bureaucratic drama, art deco geometry, paper dossiers, stamps, ballots, and stark civic symbolism. Do not copy the official Secret Hitler card layouts, logos, symbols, typography, portraits, or board artwork.

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
Original board-game UI asset, tense 1930s-inspired political thriller atmosphere, clean-room fictional civic setting, art deco geometry, aged paper, ink stamps, brass, dark walnut, smoky charcoal, muted cream, deep crimson, navy blue, desaturated gold, crisp vector-like illustration with subtle print texture, premium tabletop component, high contrast, readable silhouette, no official Secret Hitler references, no official board-game layout, no real political logos, no swastikas, no Nazi insignia, no extremist symbols, no real-world propaganda, no celebrity likeness, no readable text unless explicitly requested, no watermark.
```

Shared negative prompt:

```text
official Secret Hitler art, official logo, official role-card layout, copied board layout, copied iconography, swastika, Nazi eagle, SS rune, real extremist insignia, real propaganda poster, photorealistic dictator portrait, modern politician likeness, readable random text, watermark, blurry, low resolution, distorted hands, decorative border copied from an existing game card
```

## Ballot Cards

Use a vertical 2:3 card ratio. The card should work as a face-up ballot in a compact UI, with a strong single-word decision mark.

### `ballots/ja.png`

```text
Vertical 2:3 ballot card for a social deduction board game, full card face visible. A cream civic voting card with art deco border geometry, navy-blue approval seal, brass stamp texture, and the large centered word "JA" in clean block lettering. Tense parliamentary atmosphere, aged paper grain, subtle ink bleed, premium tabletop component, original design, no official Secret Hitler layout, no real political insignia.
```

Negative prompt:

```text
official Secret Hitler ballot, copied JA card, swastika, Nazi symbols, real-world propaganda, extra words, random letters, watermark, blurry
```

### `ballots/nein.png`

```text
Vertical 2:3 ballot card for a social deduction board game, full card face visible. A cream civic voting card with art deco border geometry, deep-crimson rejection seal, black ink stamp texture, and the large centered word "NEIN" in clean block lettering. Tense parliamentary atmosphere, aged paper grain, subtle ink bleed, premium tabletop component, original design, no official Secret Hitler layout, no real political insignia.
```

Negative prompt:

```text
official Secret Hitler ballot, copied NEIN card, swastika, Nazi symbols, real-world propaganda, extra words, random letters, watermark, blurry
```

## Secret Role Cards

Use a vertical 2:3 card ratio. These cards are private identity components, so they should feel like sealed dossier cards. Include the role name only if the generator can produce clean text; otherwise create text-free versions and let the UI overlay labels.

### `roles/liberal.png`

```text
Vertical 2:3 secret role card, sealed civic dossier for a fictional liberal reformer. Navy-blue and cream palette, art deco city hall window, fountain pen, folded parliamentary notes, restrained hopeful lighting, official-looking but fictional identity card, premium board-game illustration, original design. Optional clean title text: "LIBERAL". No official Secret Hitler art, no real politician, no extremist symbols.
```

### `roles/fascist.png`

```text
Vertical 2:3 secret role card, sealed conspirator dossier for a fictional authoritarian operative. Deep crimson, charcoal, brass, sharp art deco shadows, gloved hand near a sealed envelope, coded paper slips without readable text, tense clandestine mood, premium board-game illustration, original design. Optional clean title text: "FASCIST". No official Secret Hitler art, no real-world insignia, no swastikas.
```

### `roles/hitler.png`

```text
Vertical 2:3 secret role card, sealed central-villain dossier for a fictional authoritarian leader in a social deduction game. Avoid likeness to any real person; show only an ominous empty podium, backlit silhouette from behind, heavy curtains, crimson and black art deco composition, confidential folder, premium board-game illustration, original design. Optional clean title text: "HITLER". No photorealistic portrait, no real dictator likeness, no Nazi insignia, no swastikas.
```

## Party Membership Cards

Use a vertical 2:3 card ratio. These are simpler than secret roles: they reveal party only, not exact role.

### `party/liberal.png`

```text
Vertical 2:3 party membership card, fictional democratic civic membership document. Navy-blue ribbon, cream paper, subtle city skyline emboss, ballot box icon, art deco linework, formal but clean, premium tabletop component. Optional clean title text: "LIBERAL". Original design, no official Secret Hitler layout, no real political logos.
```

### `party/fascist.png`

```text
Vertical 2:3 party membership card, fictional authoritarian party membership document. Deep crimson ribbon, charcoal paper, angular art deco linework, sealed black envelope icon, tense bureaucratic styling, premium tabletop component. Optional clean title text: "FASCIST". Original design, no official Secret Hitler layout, no real extremist symbols.
```

## Policy Cards

Use a vertical 2:3 card ratio. Policy cards should be simple, iconic, and readable at small size. Avoid detailed text; the UI can label them.

### `policies/liberal.png`

```text
Vertical 2:3 policy card, fictional liberal policy document, navy-blue and cream palette, civic reform imagery, open parliament doors, balanced scales, clean ballot stamp, aged paper texture, art deco geometry, premium tabletop asset. Optional clean title text: "LIBERAL POLICY". No official Secret Hitler policy card, no copied layout, no real logos.
```

### `policies/fascist.png`

```text
Vertical 2:3 policy card, fictional authoritarian policy document, deep crimson and charcoal palette, locked gates, angular shadows, heavy stamp mark, bureaucratic menace, aged paper texture, art deco geometry, premium tabletop asset. Optional clean title text: "FASCIST POLICY". No official Secret Hitler policy card, no copied layout, no Nazi symbols, no swastikas.
```

## Board Decks

Use a wide horizontal 16:9 or 3:2 ratio. These are track/board backgrounds, not individual cards. Leave open space for the UI to place policy slots, labels, and counters.

### `boards/liberal-board.png`

```text
Wide horizontal board background for a social deduction board game, fictional liberal policy track. Navy-blue civic chamber, cream marble, brass trim, art deco arches, five subtle empty rectangular policy spaces integrated into the architecture, hopeful but tense lighting, clean original board-game UI background, no readable text, no official Secret Hitler board layout, no logos.
```

Negative prompt:

```text
official Secret Hitler liberal board, copied policy track, readable text, real political symbols, cluttered UI, watermark, blurry
```

### `boards/fascist-board.png`

```text
Wide horizontal board background for a social deduction board game, fictional authoritarian policy track. Dark charcoal assembly hall, deep crimson banners with abstract geometric shapes only, brass trim, art deco severity, six subtle empty rectangular policy spaces integrated into the architecture, ominous but fictional political mood, clean original board-game UI background, no readable text, no official Secret Hitler board layout, no extremist symbols.
```

Negative prompt:

```text
official Secret Hitler fascist board, copied policy track, swastika, Nazi eagle, SS rune, real extremist insignia, readable text, cluttered UI, watermark, blurry
```

## Election Tracker Token

Use a square 1:1 ratio with transparent or simple dark background. The token should remain readable at 32-48 px.

### `tokens/election-tracker.png`

```text
Square tabletop token for an election tracker, circular brass-and-enamel marker, small ballot box symbol in the center, navy and crimson enamel accents, art deco rim, premium board-game punchboard component, high contrast, readable at small size, transparent background or simple dark neutral background, original design, no official Secret Hitler icon, no real political insignia.
```

Negative prompt:

```text
official Secret Hitler token, copied icon, swastika, Nazi symbols, real political logos, readable tiny text, watermark, blurry, low contrast
```

## Optional Card Back

If the UI needs face-down policy or role decks, use this prompt.

### `backs/dossier-back.png`

```text
Vertical 2:3 card back for a fictional political-dossier social deduction board game. Charcoal linen paper, brass art deco border, sealed envelope emblem, subtle navy and crimson corner accents, aged print texture, premium tabletop component, no readable text, no official Secret Hitler layout, no real political symbols, no extremist insignia.
```

## Generation Notes

- Prefer text-free assets where the UI can render labels itself. Generated text can be inconsistent.
- Keep all assets original. Do not prompt for official Secret Hitler art, official layouts, official icons, or exact component copies.
- For board backgrounds, ask for open negative space so UI overlays remain legible.
- For role and party cards, generate separate text-free variants if the model struggles with clean lettering.
- Avoid real-world extremist imagery entirely. Use fictional authoritarian visual language through color, geometry, shadows, and bureaucracy instead.
