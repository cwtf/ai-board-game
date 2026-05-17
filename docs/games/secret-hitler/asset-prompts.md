# Secret Hitler AI Asset Prompts

Use these prompts to generate original UI assets for the Secret Hitler game implementation. They are designed for a clean-room visual direction: tense political deduction, 1930s-inspired bureaucratic drama, art deco geometry, paper dossiers, stamps, ballots, and stark civic symbolism. Do not copy official card layouts, logos, symbols, typography, portraits, or board artwork.

Expected output paths:

- Ballots: `public/assets/secret-hitler/ballots/ja.png`, `public/assets/secret-hitler/ballots/nein.png`
- Secret roles: `public/assets/secret-hitler/roles/liberal-panda.png`, `public/assets/secret-hitler/roles/liberal-cat.png`, `public/assets/secret-hitler/roles/liberal-dog.png`, `public/assets/secret-hitler/roles/liberal-parrot.png`, `public/assets/secret-hitler/roles/liberal-chicken.png`, `public/assets/secret-hitler/roles/liberal-racoon.png`, `public/assets/secret-hitler/roles/liberal-rat.png`, `public/assets/secret-hitler/roles/fascist-snake.png`, `public/assets/secret-hitler/roles/fascist-lizard.png`, `public/assets/secret-hitler/roles/hitler-velociraptor.png`
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

Use a vertical 2:3 card ratio. These cards are private identity components, so they should feel like formal 1930s-era political portrait dossiers. Frame each animal character in portrait style, wearing a smart politician outfit from the 1930s. Keep the visual mood close to a tense social-deduction role card without copying official role-card layout, typography, symbols, or portraits. Prefer text-free cards and let the UI overlay labels.

Shared role-card consistency direction:

```text
Original portrait role card illustration for a web-based social deduction board game, vertical 2:3 ratio, centered anthropomorphic animal politician, formal 1930s studio portrait pose, tailored suit or statesperson outfit, art deco rectangular portrait frame, aged dossier paper, theatrical civic lighting, clean readable silhouette, premium tabletop role-card asset, no readable text, no numbers, no watermark, no logos, no copied official game layout, no real-world political insignia, no real dictator likeness.
```

### `roles/liberal-panda.png`

```text
Vertical 2:3 secret role portrait card for a fictional liberal panda politician. A dignified anthropomorphic panda wearing a cream 1930s linen suit, navy tie, brass cufflinks, and round spectacles, posed calmly with one paw resting on a closed civic folder. Gentle but serious expression, idealistic reformer energy, trustworthy and composed. Navy-blue, cream, brass, and warm paper tones, restrained hopeful lighting, art deco civic office background, original design. No official game art, no real politician, no real-world insignia.
```

### `roles/liberal-cat.png`

```text
Vertical 2:3 secret role portrait card for a fictional liberal cat politician. A sharp anthropomorphic cat wearing a tailored 1930s charcoal suit, ivory shirt, silk tie, and neat pocket square, seated in a formal portrait pose with alert eyes and refined confidence. Elegant, diplomatic, slightly suspicious but civic-minded. Navy-blue, cream, charcoal, and brass palette, art deco city hall background, original design. No official game art, no real politician, no real-world insignia.
```

### `roles/liberal-dog.png`

```text
Vertical 2:3 secret role portrait card for a fictional liberal dog politician. A loyal anthropomorphic dog wearing a 1930s brown tweed suit, waistcoat, dark tie, and polished lapel pin with a fictional abstract civic emblem. Upright posture, warm serious eyes, dependable public servant mood, one paw near a sealed document folder. Navy-blue, cream, brass, and walnut palette, formal civic portrait lighting, original design. No official game art, no real politician, no real-world insignia.
```

### `roles/liberal-parrot.png`

```text
Vertical 2:3 secret role portrait card for a fictional liberal parrot politician. A colorful anthropomorphic parrot wearing a refined 1930s navy suit, gold-trimmed waistcoat, and formal tie, posed like a persuasive parliamentary speaker. Bright feathers, intelligent expression, confident reformist energy, one wing slightly raised as if mid-speech. Cream dossier paper, brass art deco frame, navy civic chamber background, original design. No official game art, no real politician, no real-world insignia.
```

### `roles/liberal-chicken.png`

```text
Vertical 2:3 secret role portrait card for a fictional liberal chicken politician. A proud anthropomorphic chicken wearing a smart 1930s burgundy-brown suit, cream shirt, and neat tie, standing in a formal civic portrait pose. Slightly pompous but sincere expression, polished statesperson energy, feather details crisp and dignified rather than silly. Navy-blue, cream, brass, and warm paper tones, art deco municipal background, original design. No official game art, no real politician, no real-world insignia.
```

### `roles/liberal-racoon.png`

```text
Vertical 2:3 secret role portrait card for a fictional liberal racoon politician. A clever anthropomorphic racoon wearing a 1930s dark navy suit, waistcoat, slim tie, and brass tie clip, posed with folded hands and a calculating but principled expression. Smart civic strategist mood, subtle dossier documents in the background, cream paper, brass art deco frame, original design. No official game art, no real politician, no real-world insignia.
```

### `roles/liberal-rat.png`

```text
Vertical 2:3 secret role portrait card for a fictional liberal rat politician. A serious anthropomorphic rat wearing a modest 1930s grey suit, dark waistcoat, narrow tie, and small round spectacles, posed as a principled underdog reformer. Intelligent eyes, reserved dignity, cautious but honest civic mood, no villainous styling. Navy-blue, cream, charcoal, and brass palette, formal dossier portrait, original design. No official game art, no real politician, no real-world insignia.
```

### `roles/fascist-snake.png`

```text
Vertical 2:3 secret role portrait card for a fictional authoritarian snake politician. A sinister anthropomorphic snake wearing a sharp 1930s black suit, crimson tie, brass cufflinks, and formal gloves, posed in a controlled official portrait. Cold intelligent eyes, coiled posture, elegant menace, fictional serpent faction mood, abstract serpent lapel emblem only. Deep crimson, charcoal, brass, smoky black, and muted cream palette, art deco shadowed chamber background, original design. No official game art, no real-world insignia, no swastikas, no Nazi symbols, no SS symbols, no real fascist emblems, no real politician likeness.
```

### `roles/fascist-lizard.png`

```text
Vertical 2:3 secret role portrait card for a fictional authoritarian lizard politician. A severe anthropomorphic lizard wearing a tailored 1930s charcoal military-inspired formal suit, crimson pocket square, brass buttons with fictional geometric markings, and black gloves. Upright posture, cold expression, authoritarian cabinet minister mood, reptile scales subtly highlighted. Deep crimson, charcoal, brass, smoky black, and muted cream palette, art deco severe government interior, original design. No official game art, no real-world insignia, no swastikas, no Nazi symbols, no SS symbols, no real fascist emblems, no real politician likeness.
```

### `roles/hitler-velociraptor.png`

```text
Vertical 2:3 secret role portrait card for a fictional hidden-dictator velociraptor leader in a social deduction game. A commanding anthropomorphic velociraptor wearing a dramatic 1930s-inspired black formal suit, high-collared overcoat, crimson tie, brass accents, and polished gloves. Formal authoritarian portrait pose, intense stare, theatrical menace, charismatic danger, sharp silhouette, narrow snout, alert predatory eyes, subtle feathers or scales, clawed hands resting near a sealed dossier. Deep crimson, charcoal, brass, smoky black, and muted cream palette, art deco curtains and fictional government chamber background, original design. No official game art, no real-world insignia, no swastikas, no Nazi symbols, no SS symbols, no real fascist emblems, no real politician likeness, do not depict or resemble any real historical dictator.
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
