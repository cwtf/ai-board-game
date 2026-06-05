<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
  import {
    CARD_COLORS,
    CARD_LABELS,
    type CardKind,
    type EKMove,
    type EKState,
  } from '@/lib/games/exploding-kittens/state';

  export let state: EKState;
  export let legalMoves: EKMove[];
  export let humanCanAct: boolean;
  export let humanPlayerIndex: number;
  export let onDeckClick: () => void;

  let containerEl: HTMLElement;
  let canvasEl: HTMLCanvasElement;

  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let renderer: THREE.WebGLRenderer;
  let controls: OrbitControls;
  let raycaster: THREE.Raycaster;
  let mouse = new THREE.Vector2();

  let animationFrameId: number;
  let resizeObserver: ResizeObserver;
  let width = 800;
  let height = 600;

  // Texture caches
  const cardTextureCache = new Map<string, THREE.CanvasTexture>();

  let tableGroup: THREE.Group;

  // Active animation state
  interface CardAnim {
    mesh: THREE.Mesh;
    fromPos: THREE.Vector3;
    toPos: THREE.Vector3;
    startTime: number;
    duration: number;
  }
  let activeAnimations: CardAnim[] = [];

  function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  const CARD_W = 1.2;
  const CARD_H = 1.68;
  const CARD_DEPTH = 0.012;
  const TEX_W = 256;
  const TEX_H = 358;

  function cardLabel(kind: CardKind): string {
    return CARD_LABELS[kind] ?? kind;
  }

  function getCardTexture(kind: CardKind, faceUp: boolean): THREE.CanvasTexture {
    const key = faceUp ? kind : '__back__';
    const cached = cardTextureCache.get(key);
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    canvas.width = TEX_W;
    canvas.height = TEX_H;
    const ctx = canvas.getContext('2d')!;

    if (!faceUp) {
      drawCardBack(ctx);
    } else {
      drawCardFront(ctx, kind);
    }

    const tex = new THREE.CanvasTexture(canvas);
    cardTextureCache.set(key, tex);
    return tex;
  }

  function drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  function drawCardBack(ctx: CanvasRenderingContext2D) {
    // Dark card back with repeating pattern
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, TEX_W, TEX_H);

    drawRoundedRect(ctx, 6, 6, TEX_W - 12, TEX_H - 12, 14);
    ctx.fillStyle = '#16213e';
    ctx.fill();
    ctx.strokeStyle = '#e11d48';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Pattern of small dots
    ctx.fillStyle = '#e11d48';
    for (let x = 24; x < TEX_W - 18; x += 20) {
      for (let y = 24; y < TEX_H - 18; y += 20) {
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Center bomb emoji
    ctx.font = 'bold 64px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('💣', TEX_W / 2, TEX_H / 2);
  }

  function drawCardFront(ctx: CanvasRenderingContext2D, kind: CardKind) {
    const bg = CARD_COLORS[kind] ?? '#374151';

    // Background
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, TEX_W, TEX_H);

    // Colored rounded card body
    drawRoundedRect(ctx, 6, 6, TEX_W - 12, TEX_H - 12, 14);
    const grad = ctx.createLinearGradient(0, 0, 0, TEX_H);
    grad.addColorStop(0, adjustAlpha(bg, 0.95));
    grad.addColorStop(1, darken(bg, 0.4));
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = lighten(bg, 0.5);
    ctx.lineWidth = 2;
    ctx.stroke();

    // Icon / symbol
    ctx.font = 'bold 72px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.9;
    ctx.fillText(cardEmoji(kind), TEX_W / 2, TEX_H * 0.42);
    ctx.globalAlpha = 1;

    // Card name at bottom
    const label = cardLabel(kind);
    const fontSize = label.length > 12 ? 15 : label.length > 8 ? 17 : 20;
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.95;

    // Wrap text if needed
    const lines = wrapText(ctx, label, TEX_W - 20);
    const lineH = fontSize + 3;
    const yStart = TEX_H - 14 - lineH * (lines.length - 1);
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i]!, TEX_W / 2, yStart + i * lineH);
    }
    ctx.globalAlpha = 1;

    // Top-left small label
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.75;
    ctx.fillText(shortLabel(kind), 12, 12);
    ctx.globalAlpha = 1;
  }

  function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  function cardEmoji(kind: CardKind): string {
    const map: Record<CardKind, string> = {
      defuse: '🔒',
      exploding: '💥',
      attack: '⚡',
      skip: '⏭',
      favor: '⭐',
      shuffle: '🔀',
      see_future: '👁',
      nope: '🚫',
      cat_tacocat: '🌮',
      cat_potato: '🥔',
      cat_cattermelon: '🍉',
      cat_beard: '🧔',
      cat_rainbow: '🌈',
    };
    return map[kind] ?? '?';
  }

  function shortLabel(kind: CardKind): string {
    const map: Record<CardKind, string> = {
      defuse: 'DEF',
      exploding: 'EK',
      attack: 'ATK',
      skip: 'SKP',
      favor: 'FAV',
      shuffle: 'SHF',
      see_future: 'STF',
      nope: 'NOP',
      cat_tacocat: 'CAT',
      cat_potato: 'CAT',
      cat_cattermelon: 'CAT',
      cat_beard: 'CAT',
      cat_rainbow: 'CAT',
    };
    return map[kind] ?? '?';
  }

  function lighten(hex: string, amount: number): string {
    return adjustColor(hex, amount);
  }

  function darken(hex: string, amount: number): string {
    return adjustColor(hex, -amount);
  }

  function adjustColor(hex: string, amount: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const clamp = (v: number) => Math.max(0, Math.min(255, v));
    const nr = clamp(r + amount * 255);
    const ng = clamp(g + amount * 255);
    const nb = clamp(b + amount * 255);
    return `rgb(${nr},${ng},${nb})`;
  }

  function adjustAlpha(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function buildCardMesh(
    texture: THREE.CanvasTexture,
    w = CARD_W,
    h = CARD_H,
    d = CARD_DEPTH,
  ): THREE.Mesh {
    const geo = new THREE.BoxGeometry(w, d, h);
    const faceMat = new THREE.MeshLambertMaterial({ map: texture });
    const backMat = new THREE.MeshLambertMaterial({ map: getCardTexture('defuse', false) });
    const edgeMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    // Box face order: +X, -X, +Y, -Y, +Z, -Z
    // +Y is the top face (what we see looking down) → face texture
    // -Y is the bottom → back texture
    const mat = [edgeMat, edgeMat, faceMat, backMat, edgeMat, edgeMat];
    return new THREE.Mesh(geo, mat);
  }

  function buildFaceDownCardMesh(): THREE.Mesh {
    const backTex = getCardTexture('defuse', false); // use back texture, not defuse front
    const geo = new THREE.BoxGeometry(CARD_W, CARD_DEPTH, CARD_H);
    const faceMat = new THREE.MeshLambertMaterial({ map: backTex });
    const edgeMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const mat = [edgeMat, edgeMat, faceMat, faceMat, edgeMat, edgeMat];
    return new THREE.Mesh(geo, mat);
  }

  // AI player layout positions (relative to center, excluding human at bottom)
  function aiPositions(playerCount: number): Array<{ x: number; z: number }> {
    if (playerCount === 2) return [{ x: 0, z: -4.2 }];
    if (playerCount === 3) return [{ x: -2.8, z: -4.0 }, { x: 2.8, z: -4.0 }];
    if (playerCount === 4) return [{ x: 0, z: -4.2 }, { x: -4.2, z: -0.5 }, { x: 4.2, z: -0.5 }];
    // 5 players
    return [
      { x: -2.2, z: -4.2 },
      { x: 2.2, z: -4.2 },
      { x: -4.2, z: -0.8 },
      { x: 4.2, z: -0.8 },
    ];
  }

  function buildScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1117);
    scene.fog = new THREE.Fog(0x0d1117, 18, 30);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(3, 10, 5);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 2048;
    dir.shadow.mapSize.height = 2048;
    scene.add(dir);
    const fill = new THREE.PointLight(0x8888ff, 0.25, 20);
    fill.position.set(-4, 5, 0);
    scene.add(fill);

    // Table felt
    const feltGeo = new THREE.CircleGeometry(6.5, 64);
    const feltMat = new THREE.MeshLambertMaterial({ color: 0x0a3020 });
    const felt = new THREE.Mesh(feltGeo, feltMat);
    felt.rotation.x = -Math.PI / 2;
    felt.position.y = -0.01;
    felt.receiveShadow = true;
    scene.add(felt);

    // Table border ring
    const ringGeo = new THREE.RingGeometry(6.5, 7.2, 64);
    const ringMat = new THREE.MeshLambertMaterial({
      color: 0x3d1a00,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.005;
    scene.add(ring);

    tableGroup = new THREE.Group();
    scene.add(tableGroup);

  }

  function buildDeckObject(): THREE.Group {
    const group = new THREE.Group();
    const deckSize = state.deck.length;
    const stackH = Math.max(0.05, Math.min(0.8, deckSize * 0.018));

    // Stack of cards visual
    const stackGeo = new THREE.BoxGeometry(CARD_W, stackH, CARD_H);
    const stackMat = new THREE.MeshLambertMaterial({ color: 0x1a1a2e });
    const stack = new THREE.Mesh(stackGeo, stackMat);
    stack.position.y = stackH / 2;
    group.add(stack);

    // Top face with card back texture
    const topTex = getCardTexture('defuse', false);
    const topGeo = new THREE.PlaneGeometry(CARD_W, CARD_H);
    const topMat = new THREE.MeshLambertMaterial({ map: topTex });
    const top = new THREE.Mesh(topGeo, topMat);
    top.rotation.x = -Math.PI / 2;
    top.position.y = stackH + 0.002;
    group.add(top);

    // Make deck clickable for draw
    const hitGeo = new THREE.BoxGeometry(CARD_W + 0.3, 0.2, CARD_H + 0.3);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const hit = new THREE.Mesh(hitGeo, hitMat);
    hit.position.y = stackH / 2;
    hit.userData.isDeck = true;
    group.add(hit);

    return group;
  }

  function buildDiscardObject(): THREE.Group {
    const group = new THREE.Group();
    if (state.discard.length === 0) {
      // Empty discard zone outline
      const outlineGeo = new THREE.EdgesGeometry(
        new THREE.BoxGeometry(CARD_W, 0.01, CARD_H),
      );
      const lineMat = new THREE.LineBasicMaterial({ color: 0x444444 });
      group.add(new THREE.LineSegments(outlineGeo, lineMat));
      return group;
    }

    const topKind = state.discard[0]!;
    const tex = getCardTexture(topKind, true);
    const cardGeo = new THREE.BoxGeometry(CARD_W, CARD_DEPTH, CARD_H);
    const faceMat = new THREE.MeshLambertMaterial({ map: tex });
    const edgeMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const mat = [edgeMat, edgeMat, faceMat, faceMat, edgeMat, edgeMat];
    const card = new THREE.Mesh(cardGeo, mat);
    card.position.y = CARD_DEPTH / 2;
    group.add(card);

    return group;
  }

  function buildAIPlayerZone(
    playerIndex: number,
    pos: { x: number; z: number },
  ): THREE.Group {
    const group = new THREE.Group();
    const player = state.players[playerIndex]!;

    if (!player.alive) {
      // Faded X mark for eliminated players
      const xGeo = new THREE.PlaneGeometry(0.8, 0.8);
      const xMat = new THREE.MeshBasicMaterial({
        color: 0xff2222,
        transparent: true,
        opacity: 0.4,
      });
      const x = new THREE.Mesh(xGeo, xMat);
      x.rotation.x = -Math.PI / 2;
      x.position.y = 0.01;
      group.add(x);
      return group;
    }

    const handSize = player.hand.length;
    // Show up to 5 face-down cards fanned slightly
    const visible = Math.min(handSize, 7);
    const spread = Math.min(visible * 0.22, 1.0);
    for (let i = 0; i < visible; i++) {
      const card = buildFaceDownCardMesh();
      const t = visible <= 1 ? 0 : i / (visible - 1) - 0.5;
      card.position.set(t * spread, i * 0.008, 0);
      card.rotation.y = t * 0.12;
      group.add(card);
    }

    return group;
  }

  function rebuildTableGroup() {
    while (tableGroup.children.length > 0) {
      tableGroup.remove(tableGroup.children[0]!);
    }

    if (!state) return;

    // Deck at center-left
    const deck = buildDeckObject();
    deck.position.set(-1.6, 0, -0.8);
    tableGroup.add(deck);

    // Register deck click on hit mesh
    deck.traverse((obj) => {
      if ((obj as THREE.Mesh).userData?.isDeck) {
        obj.userData.onDeckClick = true;
      }
    });

    // Discard at center-right
    const discard = buildDiscardObject();
    discard.position.set(1.6, 0, -0.8);
    tableGroup.add(discard);

    // AI player zones
    const playerCount = state.players.length;
    const positions = aiPositions(playerCount);
    let aiSlot = 0;
    for (let pi = 0; pi < playerCount; pi++) {
      if (pi === humanPlayerIndex) continue;
      const pos = positions[aiSlot++];
      if (!pos) continue;
      const zone = buildAIPlayerZone(pi, pos);
      zone.position.set(pos.x, 0, pos.z);
      tableGroup.add(zone);
    }
  }

  function getDeckHits() {
    const allObjs: THREE.Object3D[] = [];
    tableGroup.traverse((obj) => allObjs.push(obj));
    return raycaster.intersectObjects(allObjs, true).filter(
      (h) => h.object.userData?.isDeck || h.object.userData?.onDeckClick,
    );
  }

  function handleMouseMove(event: MouseEvent) {
    if (!canvasEl || !renderer) return;
    const rect = canvasEl.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    canvasEl.style.cursor =
      getDeckHits().length > 0 && humanCanAct ? 'pointer' : 'default';
  }

  function handleClick(_event: MouseEvent) {
    if (!humanCanAct) return;
    raycaster.setFromCamera(mouse, camera);
    if (getDeckHits().length > 0 && legalMoves.some((m) => m.kind === 'draw')) {
      onDeckClick();
    }
  }

  function animate(now: number) {
    animationFrameId = requestAnimationFrame(animate);

    // Process card animations
    activeAnimations = activeAnimations.filter((anim) => {
      const t = Math.min(1, (now - anim.startTime) / anim.duration);
      const et = easeOutCubic(t);
      anim.mesh.position.lerpVectors(anim.fromPos, anim.toPos, et);
      if (t >= 1) {
        anim.mesh.position.copy(anim.toPos);
        return false;
      }
      return true;
    });

    controls.update();
    renderer.render(scene, camera);
  }

  function onResize() {
    if (!containerEl || !renderer || !camera) return;
    width = containerEl.clientWidth;
    height = containerEl.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  $: if (state && scene) {
    rebuildTableGroup();
  }

  onMount(() => {
    width = containerEl.clientWidth;
    height = containerEl.clientHeight;

    renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;

    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 60);
    camera.position.set(0, 13, 9);
    camera.lookAt(0, 0, 0);

    raycaster = new THREE.Raycaster();

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 5;
    controls.maxDistance = 22;
    controls.maxPolarAngle = Math.PI / 2.2;
    controls.target.set(0, 0, 0);

    buildScene();

    if (state) {
      rebuildTableGroup();
    }

    canvasEl.addEventListener('mousemove', handleMouseMove);
    canvasEl.addEventListener('click', handleClick);

    resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(containerEl);

    animate(0);
  });

  onDestroy(() => {
    if (typeof window === 'undefined') return;
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    resizeObserver?.disconnect();
    renderer?.dispose();
    cardTextureCache.forEach((tex) => tex.dispose());
    cardTextureCache.clear();
    canvasEl?.removeEventListener('mousemove', handleMouseMove);
    canvasEl?.removeEventListener('click', handleClick);
  });
</script>

<div bind:this={containerEl} class="relative h-full w-full overflow-hidden">
  <canvas bind:this={canvasEl} class="h-full w-full" />

  <!-- HUD overlays (deck count, discard top, AI hand sizes) -->
  {#if state}
    <!-- Deck size pill -->
    <div
      class="pointer-events-none absolute left-1/2 top-[38%] -translate-x-[70px] -translate-y-1/2 rounded-full bg-black/60 px-2 py-0.5 text-center text-xs font-bold text-white"
    >
      {state.deck.length} cards
    </div>

    <!-- Discard label -->
    {#if state.discard.length > 0}
      <div
        class="pointer-events-none absolute left-1/2 top-[38%] translate-x-[10px] -translate-y-1/2 rounded bg-black/60 px-1.5 py-0.5 text-center text-xs text-neutral-300"
      >
        {CARD_LABELS[state.discard[0]!] ?? state.discard[0]}
      </div>
    {/if}

    <!-- Player labels around the table -->
    {#each state.players as player, pi}
      {#if pi !== humanPlayerIndex}
        <div
          class="pointer-events-none absolute rounded bg-black/70 px-2 py-1 text-xs font-medium"
          class:text-neutral-400={!player.alive}
          class:text-white={player.alive}
          style={aiPlayerHudStyle(pi, state.players.length, humanPlayerIndex)}
        >
          <span class="mr-1">{player.alive ? '🃏' : '💀'}</span>
          P{pi + 1}
          {#if player.alive}
            <span class="ml-1 text-neutral-400">{player.hand.length}</span>
          {/if}
        </div>
      {/if}
    {/each}

    <!-- Human player label -->
    <div class="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded bg-black/70 px-3 py-1 text-sm font-semibold text-emerald-400">
      You · {state.players[humanPlayerIndex]?.hand.length ?? 0} cards
      {#if state.pendingTurns > 1}
        <span class="ml-2 text-orange-400">×{state.pendingTurns} turns</span>
      {/if}
    </div>

  {/if}
</div>

<script module lang="ts">
  // Determines CSS position of AI player HUD labels based on seat
  function aiPlayerHudStyle(
    playerIndex: number,
    totalPlayers: number,
    humanIndex: number,
  ): string {
    // Build the AI seat layout: same logic as aiPositions()
    const positions2: Record<number, { left: string; top: string }> = {
      1: { left: '50%', top: '8%' },
    };
    const positions3: Record<number, { left: string; top: string }> = {
      1: { left: '28%', top: '10%' },
      2: { left: '68%', top: '10%' },
    };
    const positions4: Record<number, { left: string; top: string }> = {
      1: { left: '50%', top: '6%' },
      2: { left: '8%', top: '38%' },
      3: { left: '88%', top: '38%' },
    };
    const positions5: Record<number, { left: string; top: string }> = {
      1: { left: '30%', top: '8%' },
      2: { left: '65%', top: '8%' },
      3: { left: '8%', top: '38%' },
      4: { left: '88%', top: '38%' },
    };

    // Find which AI slot this player occupies
    let aiSlot = 0;
    for (let pi = 0; pi < totalPlayers; pi++) {
      if (pi === humanIndex) continue;
      aiSlot++;
      if (pi === playerIndex) break;
    }

    const map =
      totalPlayers === 2
        ? positions2
        : totalPlayers === 3
          ? positions3
          : totalPlayers === 4
            ? positions4
            : positions5;

    const pos = map[aiSlot] ?? { left: '50%', top: '10%' };
    return `left: ${pos.left}; top: ${pos.top}; transform: translate(-50%, -50%);`;
  }

  function cardEmoji(kind: CardKind): string {
    const map: Record<CardKind, string> = {
      defuse: '🔒',
      exploding: '💥',
      attack: '⚡',
      skip: '⏭',
      favor: '⭐',
      shuffle: '🔀',
      see_future: '👁',
      nope: '🚫',
      cat_tacocat: '🌮',
      cat_potato: '🥔',
      cat_cattermelon: '🍉',
      cat_beard: '🧔',
      cat_rainbow: '🌈',
    };
    return map[kind] ?? '?';
  }
</script>
