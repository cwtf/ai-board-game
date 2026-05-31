# Jungle Chess 3D Animal Asset Prompts

Goal: generate eight consistent, stylized, game-ready animal models for 3D Dou Shou Qi / Jungle Chess pieces.

Recommended workflow:

1. Generate a consistent 2D concept sheet for all animals first.
2. Use image-to-3D for each animal, or text-to-3D if the tool handles style consistency well.
3. Export each as `.glb`.
4. Open in Blender, normalize scale and origin, reduce polygons if needed, pack textures, and export final `.glb`.
5. Store final assets under `public/assets/jungle-chess/models/`.

Recommended tools: Meshy, Tripo, Rodin / Hyper3D, Sloyd, or Hunyuan3D for a local/open-source pipeline.

## Shared Style Prompt

Use this as the base style for every animal:

```text
Stylized low-poly 3D board game animal piece, cute but heroic, standing on a simple round base, readable silhouette from an isometric tabletop camera, polished toy-like PBR materials, clean topology, low to medium polygon count, optimized for realtime web rendering, no text, no numbers, no background, no extra props, centered model, neutral pose, consistent scale with other board game pieces, GLB export ready.
```

Negative prompt:

```text
No realistic fur strands, no gore, no open mouth aggression, no scenery, no terrain, no text labels, no numbers, no human accessories, no weapons, no complex background, no ultra-high-poly sculpt, no separate loose parts, no thin fragile geometry.
```

## Concept Sheet Prompt

Use this first if the tool can generate a reference image:

```text
A consistent 3D board game piece concept sheet showing eight stylized low-poly animals for Dou Shou Qi / Jungle Chess: rat, cat, dog, wolf, leopard, tiger, lion, elephant. Each animal stands on the same simple round base, same scale, same toy-like PBR material style, isometric tabletop view, clean readable silhouettes, cute but strategic board game tone, no text, no numbers, plain neutral background.
```

## Individual Model Prompts

### Rat

```text
Stylized low-poly 3D board game piece of a rat, small agile body, rounded ears, long thin tail, alert pose, standing on a simple round base. Cute but clever, readable from isometric tabletop view, polished toy-like PBR materials, clean topology, low to medium polygon count, optimized for realtime web rendering, no text, no numbers, no background, GLB export ready.
```

### Cat

```text
Stylized low-poly 3D board game piece of a cat, sleek body, pointed ears, curved tail, poised stalking pose, standing on a simple round base. Cute but nimble, readable from isometric tabletop view, polished toy-like PBR materials, clean topology, low to medium polygon count, optimized for realtime web rendering, no text, no numbers, no background, GLB export ready.
```

### Dog

```text
Stylized low-poly 3D board game piece of a dog, sturdy friendly body, floppy ears, confident guard pose, standing on a simple round base. Cute but loyal, readable from isometric tabletop view, polished toy-like PBR materials, clean topology, low to medium polygon count, optimized for realtime web rendering, no text, no numbers, no background, GLB export ready.
```

### Wolf

```text
Stylized low-poly 3D board game piece of a wolf, lean angular body, sharp ears, bushy tail, calm hunting stance, standing on a simple round base. Noble and alert, readable from isometric tabletop view, polished toy-like PBR materials, clean topology, low to medium polygon count, optimized for realtime web rendering, no text, no numbers, no background, GLB export ready.
```

### Leopard

```text
Stylized low-poly 3D board game piece of a leopard, athletic spotted body, long tail, crouched ready-to-pounce stance, standing on a simple round base. Elegant and fast, readable from isometric tabletop view, polished toy-like PBR materials, clean topology, low to medium polygon count, optimized for realtime web rendering, no text, no numbers, no background, GLB export ready.
```

### Tiger

```text
Stylized low-poly 3D board game piece of a tiger, strong striped body, broad head, powerful stance, standing on a simple round base. Bold but toy-like, readable from isometric tabletop view, polished PBR materials, clean topology, low to medium polygon count, optimized for realtime web rendering, no text, no numbers, no background, GLB export ready.
```

### Lion

```text
Stylized low-poly 3D board game piece of a lion, rounded mane, proud chest, strong standing pose, standing on a simple round base. Regal but cute, readable from isometric tabletop view, polished toy-like PBR materials, clean topology, low to medium polygon count, optimized for realtime web rendering, no text, no numbers, no background, GLB export ready.
```

### Elephant

```text
Stylized low-poly 3D board game piece of an elephant, large rounded body, big ears, short raised trunk, stable powerful stance, standing on a simple round base. Gentle but imposing, readable from isometric tabletop view, polished toy-like PBR materials, clean topology, low to medium polygon count, optimized for realtime web rendering, no text, no numbers, no background, GLB export ready.
```

## Import Requirements For The App

Final model targets:

- Format: `.glb`
- One model per animal.
- Consistent real-world scale and origin.
- Origin centered at the bottom of the base.
- Reasonable triangle count for browser rendering.
- Packed or externally stable textures.
- File names: `rat.glb`, `cat.glb`, `dog.glb`, `wolf.glb`, `leopard.glb`, `tiger.glb`, `lion.glb`, `elephant.glb`.
