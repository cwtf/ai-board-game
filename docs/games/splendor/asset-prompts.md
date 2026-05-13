# Splendor AI Asset Prompts

Use these prompts to generate original, unlicensed alternatives for the Splendor UI assets. They intentionally avoid the official Splendor visual identity, logos, character designs, and card layouts.

Expected output paths match the UI:

- Cards: `public/assets/splendor/cards/<card-id>.webp`
- Nobles: `public/assets/splendor/nobles/<noble-id>.webp`

## Shared Card Prompt

Use this base prompt for every development card, then append the per-card subject line from the table.

```text
Original modern trading-card illustration for a board game about merchants, commodities, and prestige. Vertical 5:7 card art, modern trading and merchant theme, cinematic editorial illustration, premium board-game asset, crisp details, realistic materials, rich but restrained color, no fantasy crowns, no medieval costumes, no official Splendor references, no logos, no readable text, no numerals, no watermark. Leave the lower 18 percent visually quiet for UI overlays. Use the subject line exactly as art direction, not as visible text.
```

Negative prompt:

```text
official Splendor art, Space Cowboys branding, copyrighted board-game layout, readable text, numbers, letters, logo, watermark, blurry, low resolution, distorted hands, extra fingers, cluttered UI, photorealistic celebrity likeness
```

## Shared Noble Prompt

Use this base prompt for every noble tile, then append the per-noble subject line from the table.

```text
Original square-ish 5:4 portrait tile for a modern board game about merchants, finance, and prestige. Contemporary trade patron, investor, diplomat, or market-maker, cinematic editorial illustration, premium board-game asset, crisp face and clothing detail, tasteful wealth, no monarchy costume, no official Splendor references, no logos, no readable text, no numerals, no watermark. Use the subject line exactly as art direction, not as visible text.
```

Negative prompt:

```text
official Splendor noble art, Space Cowboys branding, copyrighted board-game layout, readable text, numbers, letters, logo, watermark, blurry, low resolution, distorted face, distorted hands, photorealistic celebrity likeness
```

## Development Cards

| Asset | Prompt Add-On |
|---|---|
| `cards/t1_01.webp` | Subject: entry-level diamond-credit courier at a bright urban commodity kiosk, white ceramic counters, small emerald sapphire ruby and black-stone samples, modest street-market energy. |
| `cards/t1_02.webp` | Subject: compact diamond brokerage booth trading black onyx and ruby parcels, glass cases, handheld scanner, night market lighting. |
| `cards/t1_03.webp` | Subject: junior diamond logistics trader arranging emerald and onyx shipments on a tablet, clean warehouse office, early-career merchant mood. |
| `cards/t1_04.webp` | Subject: neighborhood diamond exchange desk with emerald, onyx, and ruby order tickets represented as colored commodity crates. |
| `cards/t1_05.webp` | Subject: small diamond dealer negotiating for emerald and onyx inventory, minimalist showroom, crisp white accent lighting. |
| `cards/t1_06.webp` | Subject: local diamond import counter with sapphire and onyx sample trays, practical merchant tools, compact urban bazaar. |
| `cards/t1_07.webp` | Subject: apprentice diamond trader balancing five commodity samples, white ledger tablet, busy but orderly trading arcade. |
| `cards/t1_08.webp` | Subject: diamond stall at closing hour, onyx cases and ruby invoice slips, sleek modern night-market atmosphere. |
| `cards/t1_11.webp` | Subject: entry-level sapphire shipping broker at a blue-lit port terminal, small mixed commodity parcels, practical merchant work. |
| `cards/t1_12.webp` | Subject: sapphire desk agent matching emerald and diamond orders on a tablet, compact trade office, morning market light. |
| `cards/t1_13.webp` | Subject: sapphire merchant appraising ruby and diamond cargo samples, glass table, clean blue commercial styling. |
| `cards/t1_14.webp` | Subject: junior sapphire trader with diamond emerald and ruby crates, efficient regional exchange booth. |
| `cards/t1_15.webp` | Subject: small sapphire auction stand with emerald and diamond lots, bright blue signage shapes without readable text. |
| `cards/t1_16.webp` | Subject: sapphire importer managing onyx and diamond shipments, compact freight counter, polished modern market. |
| `cards/t1_17.webp` | Subject: sapphire card focused on ruby and diamond trading samples, blue courier bag, city exchange corridor. |
| `cards/t1_18.webp` | Subject: sapphire analyst at a tiny booth, onyx diamond and emerald sample cubes, practical trading-terminal glow. |
| `cards/t1_21.webp` | Subject: entry-level emerald produce-and-gem trader in a vertical-farm market, mixed sample trays, fresh green commercial mood. |
| `cards/t1_22.webp` | Subject: emerald commodity clerk arranging sapphire and diamond contracts, small sustainable trading office. |
| `cards/t1_23.webp` | Subject: emerald exchange stall with onyx and sapphire crates, modern botanical market, glass roof. |
| `cards/t1_24.webp` | Subject: junior emerald merchant checking sapphire diamond and onyx inventory with a handheld scanner. |
| `cards/t1_25.webp` | Subject: emerald supplier negotiating sapphire-heavy contracts, green data wall, compact merchant desk. |
| `cards/t1_26.webp` | Subject: emerald trading booth with ruby and sapphire parcels, clean market shelves, practical early-game scale. |
| `cards/t1_27.webp` | Subject: emerald courier preparing onyx and sapphire lots, neon green warehouse aisle, modest stakes. |
| `cards/t1_28.webp` | Subject: emerald analyst balancing ruby sapphire and diamond orders, transparent ledger display with no readable text. |
| `cards/t1_31.webp` | Subject: entry-level ruby energy trader in a compact exchange booth, mixed commodity samples, warm red industrial lighting. |
| `cards/t1_32.webp` | Subject: ruby merchant counter with onyx and emerald lots, polished red glass, street-level trade hall. |
| `cards/t1_33.webp` | Subject: ruby procurement clerk inspecting diamond and emerald shipments, modern warehouse with red accent lights. |
| `cards/t1_34.webp` | Subject: ruby broker managing emerald sapphire and diamond crates, small trading terminal, focused negotiation mood. |
| `cards/t1_35.webp` | Subject: ruby supplier securing onyx and emerald inventory, compact industrial market booth. |
| `cards/t1_36.webp` | Subject: ruby card showing diamond and emerald commodity bundles, red metal counter, efficient junior merchant. |
| `cards/t1_37.webp` | Subject: ruby courier with sapphire and emerald contracts, warm red city market corridor, practical commerce. |
| `cards/t1_38.webp` | Subject: ruby analyst checking onyx emerald and sapphire orders, sleek tablet interface with abstract non-text symbols. |
| `cards/t1_41.webp` | Subject: entry-level onyx security-vault trader handling mixed commodity samples, black glass desk, discreet merchant mood. |
| `cards/t1_42.webp` | Subject: onyx broker matching ruby and sapphire lots in a private booth, dark premium materials, small-scale deal. |
| `cards/t1_43.webp` | Subject: onyx exchange counter with sapphire and diamond parcels, black-and-blue lighting, compact urban market. |
| `cards/t1_44.webp` | Subject: junior onyx merchant tracking ruby emerald and sapphire cargo, secure trading kiosk, restrained dark palette. |
| `cards/t1_45.webp` | Subject: onyx supplier negotiating ruby-heavy contracts, black stone samples, red digital glow without text. |
| `cards/t1_46.webp` | Subject: onyx trader with emerald and ruby commodity bins, private warehouse counter, practical merchant detail. |
| `cards/t1_47.webp` | Subject: onyx courier preparing diamond and ruby parcels, dark logistics hub, early-career trade atmosphere. |
| `cards/t1_48.webp` | Subject: onyx analyst balancing diamond ruby and emerald orders, secure desktop terminal, quiet high-trust commerce. |
| `cards/t2_01.webp` | Subject: regional diamond trade house coordinating sapphire emerald and onyx shipments, polished white boardroom, rising prestige. |
| `cards/t2_02.webp` | Subject: diamond merchant syndicate arranging sapphire emerald and ruby futures, modern deal room, mid-level wealth. |
| `cards/t2_03.webp` | Subject: diamond card focused on a large sapphire contract, blue shipping containers reflected in a white-glass office. |
| `cards/t2_04.webp` | Subject: diamond card focused on a large onyx contract, black vault pallets under white gallery lighting. |
| `cards/t2_05.webp` | Subject: diamond logistics director closing sapphire emerald and ruby supply chains, clean premium trade floor. |
| `cards/t2_06.webp` | Subject: high-value diamond office winning a major onyx deal, white marble, dark secure vault doors, confident merchant. |
| `cards/t2_07.webp` | Subject: regional sapphire exchange firm coordinating diamond emerald and ruby cargo, blue boardroom screens with abstract charts. |
| `cards/t2_08.webp` | Subject: sapphire broker syndicate arranging diamond ruby and onyx shipments, modern port finance office. |
| `cards/t2_09.webp` | Subject: sapphire card focused on a large emerald contract, blue-green cargo stacks, sustainable trade aesthetic. |
| `cards/t2_10.webp` | Subject: sapphire card focused on a large ruby contract, red energy cargo in a blue-lit harbor exchange. |
| `cards/t2_11.webp` | Subject: sapphire logistics director closing diamond ruby and onyx supply deals, sophisticated blue trade floor. |
| `cards/t2_12.webp` | Subject: high-value sapphire office winning a major emerald deal, glass towers, green freight corridors, confident merchant. |
| `cards/t2_13.webp` | Subject: regional emerald trade house coordinating diamond sapphire and onyx shipments, green atrium boardroom. |
| `cards/t2_14.webp` | Subject: emerald broker syndicate arranging sapphire ruby and onyx futures, vertical garden exchange office. |
| `cards/t2_15.webp` | Subject: emerald card focused on a large ruby contract, red industrial cargo crossing a green finance district. |
| `cards/t2_16.webp` | Subject: emerald card focused on a large diamond contract, white ceramic crates in a sustainable market hub. |
| `cards/t2_17.webp` | Subject: emerald logistics director closing sapphire ruby and onyx supply deals, refined green commodity floor. |
| `cards/t2_18.webp` | Subject: high-value emerald office winning a major ruby deal, red energy terminals outside glass greenhouse towers. |
| `cards/t2_19.webp` | Subject: regional ruby trade house coordinating diamond emerald and onyx shipments, warm steel-and-glass boardroom. |
| `cards/t2_20.webp` | Subject: ruby broker syndicate arranging diamond sapphire and onyx contracts, red-lit futures exchange room. |
| `cards/t2_21.webp` | Subject: ruby card focused on a large onyx contract, secure black cargo vault in a red industrial district. |
| `cards/t2_22.webp` | Subject: ruby card focused on a large sapphire contract, blue shipping lanes and red energy markets converging. |
| `cards/t2_23.webp` | Subject: ruby logistics director closing diamond emerald and onyx supply deals, polished red commodity desk. |
| `cards/t2_24.webp` | Subject: high-value ruby office winning a major diamond deal, red glass tower, white luxury cargo display. |
| `cards/t2_25.webp` | Subject: regional onyx trade house coordinating diamond sapphire and ruby shipments, black private-banking boardroom. |
| `cards/t2_26.webp` | Subject: onyx broker syndicate arranging sapphire emerald and ruby futures, dark secure exchange room. |
| `cards/t2_27.webp` | Subject: onyx card focused on a large diamond contract, white cargo crates behind black security glass. |
| `cards/t2_28.webp` | Subject: onyx card focused on a large emerald contract, green trade district viewed from a dark private office. |
| `cards/t2_29.webp` | Subject: onyx logistics director closing diamond sapphire and ruby supply deals, discreet black commodity floor. |
| `cards/t2_30.webp` | Subject: high-value onyx office winning a major sapphire deal, blue maritime markets behind black vault architecture. |
| `cards/t3_01.webp` | Subject: elite diamond magnate controlling sapphire emerald and ruby markets from a white-glass global exchange tower. |
| `cards/t3_02.webp` | Subject: diamond global trade empire built on sapphire and ruby routes, luxury white command room above a megacity port. |
| `cards/t3_03.webp` | Subject: diamond multinational consortium linking sapphire emerald and onyx markets, grand white atrium with world-scale logistics. |
| `cards/t3_04.webp` | Subject: diamond prestige card, emerald and onyx mega-contracts, white luxury trading floor with monumental cargo sculpture. |
| `cards/t3_05.webp` | Subject: elite sapphire magnate controlling diamond emerald and onyx markets from a blue-lit maritime exchange tower. |
| `cards/t3_06.webp` | Subject: sapphire global trade empire built on onyx and diamond routes, night harbor command room, immense wealth. |
| `cards/t3_07.webp` | Subject: sapphire multinational consortium linking emerald ruby and diamond markets, blue boardroom above automated ports. |
| `cards/t3_08.webp` | Subject: sapphire prestige card, ruby and onyx mega-contracts, sweeping ocean trade network seen through glass. |
| `cards/t3_09.webp` | Subject: elite emerald magnate controlling diamond sapphire and ruby markets from a green finance tower. |
| `cards/t3_10.webp` | Subject: emerald global trade empire built on ruby and sapphire routes, vertical-farm megacity exchange. |
| `cards/t3_11.webp` | Subject: emerald multinational consortium linking diamond ruby and onyx markets, grand botanical trading atrium. |
| `cards/t3_12.webp` | Subject: emerald prestige card, diamond and sapphire mega-contracts, sustainable luxury commodity headquarters. |
| `cards/t3_13.webp` | Subject: elite ruby magnate controlling emerald onyx and sapphire markets from a red industrial exchange tower. |
| `cards/t3_14.webp` | Subject: ruby global trade empire built on diamond and onyx routes, red energy market command room, immense wealth. |
| `cards/t3_15.webp` | Subject: ruby multinational consortium linking sapphire emerald and onyx markets, grand red-lit trading hall. |
| `cards/t3_16.webp` | Subject: ruby prestige card, sapphire and diamond mega-contracts, panoramic red finance district and port. |
| `cards/t3_17.webp` | Subject: elite onyx magnate controlling sapphire ruby and diamond markets from a black private exchange tower. |
| `cards/t3_18.webp` | Subject: onyx global trade empire built on emerald and sapphire routes, dark secure command room, immense wealth. |
| `cards/t3_19.webp` | Subject: onyx multinational consortium linking ruby diamond and sapphire markets, grand black-glass trading hall. |
| `cards/t3_20.webp` | Subject: onyx prestige card, emerald and diamond mega-contracts, private vault skyline and global cargo routes. |

## Noble Tiles

| Asset | Prompt Add-On |
|---|---|
| `nobles/noble_01.webp` | Subject: senior diamond-and-sapphire trade patron, elegant white suit with blue accents, calm authority in a private commodity lounge. |
| `nobles/noble_02.webp` | Subject: senior sapphire-and-emerald market diplomat, blue-green tailored clothing, glass garden exchange behind them. |
| `nobles/noble_03.webp` | Subject: senior emerald-and-ruby investment patron, green and red accents, sustainable energy trade gala. |
| `nobles/noble_04.webp` | Subject: senior ruby-and-onyx industrial financier, red and black tailoring, secure high-rise exchange setting. |
| `nobles/noble_05.webp` | Subject: senior onyx-and-diamond private banker, black and white luxury materials, quiet vault-like meeting room. |
| `nobles/noble_06.webp` | Subject: diplomatic patron of diamond sapphire and emerald markets, bright tri-color lapel accents, refined global trade summit. |
| `nobles/noble_07.webp` | Subject: market-maker patron of sapphire emerald and ruby routes, contemporary formalwear, port city skyline. |
| `nobles/noble_08.webp` | Subject: influential patron of emerald ruby and onyx industries, green red and black styling, exclusive investor salon. |
| `nobles/noble_09.webp` | Subject: industrial patron of ruby onyx and diamond markets, red black and white accents, luxury logistics boardroom. |
| `nobles/noble_10.webp` | Subject: private trade patron of onyx diamond and sapphire markets, black white and blue palette, secure maritime finance office. |
