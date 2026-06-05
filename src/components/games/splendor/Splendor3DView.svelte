<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
  import {
    GEMS,
    type Card,
    type Gem,
    type GemOrGold,
    type Noble,
    type SplendorMove,
    type SplendorState,
    type Tier,
  } from '@/lib/games/splendor/state';

  export let state: SplendorState;
  export let legalMoves: SplendorMove[];
  export let humanCanAct: boolean;
  export let selectedGems: Gem[];
  export let onSelectGem: (gem: Gem) => void;
  export let onBeginMove: (move: SplendorMove) => void;

  let containerEl: HTMLElement;
  let canvasEl: HTMLCanvasElement;

  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let renderer: THREE.WebGLRenderer;
  let controls: OrbitControls;
  let raycaster: THREE.Raycaster;
  let mouse = new THREE.Vector2();

  let interactiveGroup: THREE.Group;
  let animationFrameId: number;
  let resizeObserver: ResizeObserver;

  // Cache for loaded image textures
  const textureCache = new Map<string, THREE.Texture>();
  const textureLoader = new THREE.TextureLoader();

  // Highlight and menu state
  let hoveredObject: THREE.Object3D | null = null;
  let activeCardMenu: {
    card?: Card;
    deckTier?: Tier;
    x: number;
    y: number;
    buyMove?: SplendorMove;
    reserveMove?: SplendorMove;
  } | null = null;

  // Keep track of dimensions
  let width = 800;
  let height = 600;

  // Mapping from mesh IDs to actual Three.js meshes for animation updates
  let meshMap = new Map<string, THREE.Mesh>();

  $: if (state && scene) {
    updateScene();
  }

  $: if (selectedGems && meshMap.size > 0) {
    updateCoinAnimations();
  }

  function getCachedTexture(url: string): THREE.Texture {
    if (textureCache.has(url)) {
      return textureCache.get(url)!;
    }
    const texture = textureLoader.load(url);
    textureCache.set(url, texture);
    return texture;
  }

  // Helper to check legal moves
  function findBuyMove(cardId: string, source: 'board' | 'reserved'): SplendorMove | undefined {
    return legalMoves.find(
      (m) => m.kind === 'buy' && m.source === source && m.cardId === cardId
    );
  }

  function findReserveMove(cardId: string): SplendorMove | undefined {
    return legalMoves.find(
      (m) => m.kind === 'reserve' && m.source === 'board' && m.cardId === cardId
    );
  }

  function findReserveDeckMove(tier: Tier): SplendorMove | undefined {
    return legalMoves.find(
      (m) => m.kind === 'reserve' && m.source === 'deck' && m.tier === tier
    );
  }

  // Canvas textures generator for Gem Coins (Top and Edge)
  function createCoinTopTexture(gem: GemOrGold): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();

    // Draw background gradient
    const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
    const colors: Record<GemOrGold, [string, string]> = {
      emerald: ['#10b981', '#064e3b'],
      sapphire: ['#3b82f6', '#1e3a8a'],
      ruby: ['#ef4444', '#7f1d1d'],
      diamond: ['#ffffff', '#4b5563'],
      onyx: ['#374151', '#030712'],
      gold: ['#fbbf24', '#78350f'],
    };
    const [c1, c2] = colors[gem];
    grad.addColorStop(0, c1);
    grad.addColorStop(1, c2);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(128, 128, 128, 0, Math.PI * 2);
    ctx.fill();

    // Draw poker chip border ring
    ctx.strokeStyle = gem === 'gold' ? '#ffffff' : '#fbbf24';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(128, 128, 105, 0, Math.PI * 2);
    ctx.stroke();

    // Draw inner design dashes
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.setLineDash([16, 24]);
    ctx.beginPath();
    ctx.arc(128, 128, 105, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Create CanvasTexture
    const texture = new THREE.CanvasTexture(canvas);

    // Load SVG icon and draw in center
    const img = new Image();
    img.src = `/assets/splendor/gems/${gem}.svg`;
    img.onload = () => {
      ctx.drawImage(img, 128 - 48, 128 - 48, 96, 96);
      texture.needsUpdate = true;
    };

    return texture;
  }

  function createCoinEdgeTexture(gem: GemOrGold): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();

    const colors: Record<GemOrGold, string> = {
      emerald: '#047857',
      sapphire: '#1d4ed8',
      ruby: '#b91c1c',
      diamond: '#9ca3af',
      onyx: '#111827',
      gold: '#fbbf24',
    };

    // Fill with gem color
    ctx.fillStyle = colors[gem];
    ctx.fillRect(0, 0, 128, 16);

    // Draw white stripes (ridges)
    ctx.fillStyle = '#ffffff';
    const stripes = 8;
    const stripeWidth = 128 / stripes;
    for (let i = 0; i < stripes; i++) {
      if (i % 2 === 0) {
        ctx.fillRect(i * stripeWidth, 0, stripeWidth / 3, 16);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    return texture;
  }

  // Canvas textures generator for Card Backs (Top) and Edges
  function createCardBackTexture(tier: Tier): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 358;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();

    const colors = {
      1: { bg: '#064e3b', gold: '#fbbf24', text: 'I' },
      2: { bg: '#1e3a8a', gold: '#fbbf24', text: 'II' },
      3: { bg: '#581c87', gold: '#fbbf24', text: 'III' },
    };
    const c = colors[tier];

    // Background
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, 256, 358);

    // Gold borders
    ctx.strokeStyle = c.gold;
    ctx.lineWidth = 10;
    ctx.strokeRect(10, 10, 236, 338);

    ctx.lineWidth = 2;
    ctx.strokeRect(18, 18, 220, 322);

    // Concentric gold rings in center
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(128, 179, 64, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(128, 179, 56, 0, Math.PI * 2);
    ctx.stroke();

    // Text in center
    ctx.fillStyle = c.gold;
    ctx.font = 'bold 44px "Times New Roman", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.text, 128, 179);

    // Corner decorations
    const corners = [
      [28, 28],
      [228, 28],
      [28, 330],
      [228, 330],
    ];
    ctx.fillStyle = c.gold;
    for (const [x, y] of corners) {
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  function createCardEdgeTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();

    // Light paper-colored edge
    ctx.fillStyle = '#f4f4f5';
    ctx.fillRect(0, 0, 16, 128);

    // Horizontal dark lines representing paper stack layers
    ctx.fillStyle = '#d4d4d8';
    for (let y = 0; y < 128; y += 4) {
      ctx.fillRect(0, y, 16, 1.5);
    }

    return new THREE.CanvasTexture(canvas);
  }

  // Pre-generate static materials to avoid memory leaks
  let coinMaterials = new Map<GemOrGold, THREE.Material[]>();
  let cardBackMaterials = new Map<Tier, THREE.Material>();
  let cardEdgeMaterial: THREE.Material;

  function initStaticMaterials() {
    cardEdgeMaterial = new THREE.MeshStandardMaterial({
      map: createCardEdgeTexture(),
      roughness: 0.8,
    });

    const gemList: GemOrGold[] = ['emerald', 'sapphire', 'ruby', 'diamond', 'onyx', 'gold'];
    for (const gem of gemList) {
      const topTex = createCoinTopTexture(gem);
      const edgeTex = createCoinEdgeTexture(gem);

      const topMat = new THREE.MeshStandardMaterial({
        map: topTex,
        roughness: 0.3,
        metalness: gem === 'gold' ? 0.6 : 0.1,
      });

      const edgeMat = new THREE.MeshStandardMaterial({
        map: edgeTex,
        roughness: 0.5,
        metalness: gem === 'gold' ? 0.6 : 0.1,
      });

      // Materials order for Cylinder: [Side, Top, Bottom]
      coinMaterials.set(gem, [edgeMat, topMat, topMat]);
    }

    for (const tier of [1, 2, 3] as const) {
      cardBackMaterials.set(
        tier,
        new THREE.MeshStandardMaterial({
          map: createCardBackTexture(tier),
          roughness: 0.4,
        })
      );
    }
  }

  // 3D Layout Coordinates
  const DECK_X = -6.0;
  const CARD_START_X = -3.8;
  const CARD_SPACING_X = 2.2;
  const COIN_X = 5.6;

  const NOBLE_Z = -3.8;
  const TIER3_Z = -1.8;
  const TIER2_Z = 0.5;
  const TIER1_Z = 2.8;

  const TIER_Z_MAP = {
    1: TIER1_Z,
    2: TIER2_Z,
    3: TIER3_Z,
  };

  // Dimensions
  const CARD_W = 1.6;
  const CARD_D = 2.24;
  const NOBLE_W = 1.6;
  const NOBLE_D = 1.6;

  function updateScene() {
    if (!scene || !state) return;

    // Clear old elements from interactive group
    while (interactiveGroup.children.length > 0) {
      const obj = interactiveGroup.children[0];
      interactiveGroup.remove(obj);
    }

    meshMap.clear();

    // 1. Render Decks with Thickness Reflecting Remaining Cards
    const deckTiers: Tier[] = [3, 2, 1];
    for (const tier of deckTiers) {
      const deckKeyStr = `tier${tier}` as const;
      const count = state.decks[deckKeyStr].length;

      if (count > 0) {
        // Calculate dynamic height based on cards remaining (max 36 for tier 1)
        const maxCards = tier === 1 ? 36 : tier === 2 ? 26 : 16;
        const deckHeight = 0.04 + (count / maxCards) * 0.46; // min 0.04, max 0.50

        const geometry = new THREE.BoxGeometry(CARD_W, deckHeight, CARD_D);

        // Materials: [Right, Left, Top, Bottom, Front, Back]
        const sideMat = cardEdgeMaterial;
        const topMat = cardBackMaterials.get(tier)!;
        const bottomMat = new THREE.MeshStandardMaterial({ color: 0x222222 });

        const materials = [sideMat, sideMat, topMat, bottomMat, sideMat, sideMat];
        const mesh = new THREE.Mesh(geometry, materials);

        // Position on table
        mesh.position.set(DECK_X, deckHeight / 2, TIER_Z_MAP[tier]);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        mesh.userData = {
          type: 'deck',
          tier: tier,
          reserveMove: findReserveDeckMove(tier),
        };

        interactiveGroup.add(mesh);
      }
    }

    // 2. Render Face-Up Board Cards
    for (const tier of [3, 2, 1] as const) {
      const boardKeyStr = `tier${tier}` as const;
      const row = state.board[boardKeyStr];
      const zPos = TIER_Z_MAP[tier];

      row.forEach((card, index) => {
        if (card) {
          const cardX = CARD_START_X + index * CARD_SPACING_X;

          // Thin card box
          const height = 0.01;
          const geometry = new THREE.BoxGeometry(CARD_W, height, CARD_D);

          const cardTexture = getCachedTexture(`/assets/splendor/cards/${card.id}.png`);
          const frontMat = new THREE.MeshStandardMaterial({
            map: cardTexture,
            roughness: 0.3,
          });
          const backMat = cardBackMaterials.get(tier)!;
          const sideMat = cardEdgeMaterial;

          // Box face order: [Right, Left, Top, Bottom, Front, Back]
          // In Three.js, top face is +Y (front of our card), bottom face is -Y (back of card)
          const materials = [sideMat, sideMat, frontMat, backMat, sideMat, sideMat];
          const mesh = new THREE.Mesh(geometry, materials);

          mesh.position.set(cardX, height / 2, zPos);
          mesh.castShadow = true;
          mesh.receiveShadow = true;

          mesh.userData = {
            type: 'card',
            card: card,
            source: 'board',
            buyMove: findBuyMove(card.id, 'board'),
            reserveMove: findReserveMove(card.id),
          };

          interactiveGroup.add(mesh);
        }
      });
    }

    // 3. Render Nobles at the top of the board
    const nobleCount = state.noblesInPlay.length;
    // Calculate starting X to center the nobles dynamically
    const nobleStartX = -((nobleCount - 1) * CARD_SPACING_X) / 2;

    state.noblesInPlay.forEach((noble, index) => {
      const nobleX = nobleStartX + index * CARD_SPACING_X;
      const height = 0.02;
      const geometry = new THREE.BoxGeometry(NOBLE_W, height, NOBLE_D);

      const nobleTex = getCachedTexture(`/assets/splendor/nobles/${noble.id}.png`);
      const topMat = new THREE.MeshStandardMaterial({
        map: nobleTex,
        roughness: 0.3,
      });
      const sideMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.7 });

      // Box face order: [Right, Left, Top, Bottom, Front, Back]
      const materials = [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];
      const mesh = new THREE.Mesh(geometry, materials);

      mesh.position.set(nobleX, height / 2, NOBLE_Z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      mesh.userData = {
        type: 'noble',
        noble: noble,
      };

      interactiveGroup.add(mesh);
    });

    // 4. Render Gem Coins (Stacked Cylinder poker chips)
    const gemTypes: GemOrGold[] = ['emerald', 'sapphire', 'ruby', 'diamond', 'onyx', 'gold'];
    const coinZPositions = [-3.2, -2.0, -0.8, 0.4, 1.6, 2.8];

    gemTypes.forEach((gem, idx) => {
      const count = state.tokenPool[gem];
      const zPos = coinZPositions[idx];
      const cylinderHeight = 0.08;
      const radius = 0.45;

      const materials = coinMaterials.get(gem)!;

      for (let i = 0; i < count; i++) {
        const geometry = new THREE.CylinderGeometry(radius, radius, cylinderHeight, 32);
        const mesh = new THREE.Mesh(geometry, materials);

        // Hand-stacked organic look (subtle rotation & displacement jitter)
        const angleJitter = Math.sin(i * 123.45 + idx * 67.89) * 0.08;
        const xOffset = Math.cos(i * 98.76 + idx * 54.32) * 0.015;
        const zOffset = Math.sin(i * 87.65 + idx * 43.21) * 0.015;

        const baseHeight = i * cylinderHeight + cylinderHeight / 2;
        mesh.position.set(COIN_X + xOffset, baseHeight, zPos + zOffset);
        mesh.rotation.y = angleJitter;

        mesh.castShadow = true;
        mesh.receiveShadow = true;

        const coinId = `coin-${gem}-${i}`;
        mesh.userData = {
          type: 'gem',
          gem: gem,
          stackIdx: i,
          coinId: coinId,
          baseY: baseHeight,
        };

        meshMap.set(coinId, mesh);
        interactiveGroup.add(mesh);
      }
    });

    // Apply animation states right after update
    updateCoinAnimations();
  }

  // Raises and spins selected coins in their stacks
  function updateCoinAnimations() {
    if (meshMap.size === 0) return;

    // Reset all coin selections first
    meshMap.forEach((mesh) => {
      mesh.userData.isSelected = false;
    });

    // Determine how many of each gem are currently selected
    const counts = { emerald: 0, sapphire: 0, ruby: 0, diamond: 0, onyx: 0, gold: 0 };
    selectedGems.forEach((g) => {
      if (g in counts) {
        counts[g]++;
      }
    });

    // For each stack, raise the top N coins
    const gemTypes: GemOrGold[] = ['emerald', 'sapphire', 'ruby', 'diamond', 'onyx', 'gold'];
    gemTypes.forEach((gem) => {
      const totalInPool = state.tokenPool[gem];
      const selectedCount = counts[gem as Gem] || 0;

      for (let i = 0; i < totalInPool; i++) {
        const coinId = `coin-${gem}-${i}`;
        const mesh = meshMap.get(coinId);
        if (mesh) {
          // If this coin is one of the top selected coins, lift it!
          const isTopSelected = i >= totalInPool - selectedCount;
          mesh.userData.isSelected = isTopSelected;
        }
      }
    });
  }

  // Animation ticks
  function tickAnimation() {
    animationFrameId = requestAnimationFrame(tickAnimation);

    // 1. Smoothly rotate/animate selected floating coins
    meshMap.forEach((mesh) => {
      const targetY = mesh.userData.baseY + (mesh.userData.isSelected ? 0.35 : 0.0);
      // Lerp Y position for a smooth floating lift
      mesh.position.y += (targetY - mesh.position.y) * 0.15;

      if (mesh.userData.isSelected) {
        mesh.rotation.y += 0.035; // Spin floating coin
      }
    });

    // 2. Smoothly animate card hover scale effects
    interactiveGroup.children.forEach((obj) => {
      if (obj.userData.type === 'card' || obj.userData.type === 'deck' || obj.userData.type === 'noble') {
        const isHovered = hoveredObject === obj;
        const targetScale = isHovered ? 1.06 : 1.0;
        obj.scale.x += (targetScale - obj.scale.x) * 0.2;
        obj.scale.y += (targetScale - obj.scale.y) * 0.2;
        obj.scale.z += (targetScale - obj.scale.z) * 0.2;
      }
    });

    // 3. Keep active card popup position synced with screen space if camera rotates
    if (activeCardMenu) {
      updateMenuPosition();
    }

    controls.update();
    renderer.render(scene, camera);
  }

  function updateMenuPosition() {
    if (!activeCardMenu || !camera || !canvasEl) return;

    let targetPos = new THREE.Vector3();
    let found = false;

    if (activeCardMenu.card) {
      const searchCard = activeCardMenu.card;
      const mesh = interactiveGroup.children.find(
        (child) => child.userData.type === 'card' && child.userData.card.id === searchCard.id
      );
      if (mesh) {
        mesh.getWorldPosition(targetPos);
        found = true;
      }
    } else if (activeCardMenu.deckTier) {
      const searchTier = activeCardMenu.deckTier;
      const mesh = interactiveGroup.children.find(
        (child) => child.userData.type === 'deck' && child.userData.tier === searchTier
      );
      if (mesh) {
        mesh.getWorldPosition(targetPos);
        found = true;
      }
    }

    if (found) {
      // Project 3D coordinate to 2D screen coordinate
      targetPos.project(camera);
      const x = (targetPos.x * 0.5 + 0.5) * width;
      const y = (-(targetPos.y * 0.5) + 0.5) * height;
      activeCardMenu = { ...activeCardMenu, x, y };
    }
  }

  // Pointer Interaction Handlers
  function onPointerMove(event: MouseEvent) {
    const rect = canvasEl.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactiveGroup.children, true);

    if (intersects.length > 0) {
      // Find top-level parent inside interactiveGroup
      let rootObj = intersects[0].object;
      while (rootObj.parent && rootObj.parent !== interactiveGroup) {
        rootObj = rootObj.parent;
      }

      if (
        rootObj.userData.type === 'card' ||
        rootObj.userData.type === 'deck' ||
        rootObj.userData.type === 'noble'
      ) {
        hoveredObject = rootObj;
        canvasEl.style.cursor = 'pointer';
        return;
      } else if (rootObj.userData.type === 'gem') {
        hoveredObject = null;
        canvasEl.style.cursor = 'pointer';
        return;
      }
    }

    hoveredObject = null;
    canvasEl.style.cursor = 'default';
  }

  function onPointerDown(event: MouseEvent) {
    // Left click only
    if (event.button !== 0) return;

    const rect = canvasEl.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactiveGroup.children, true);

    if (intersects.length > 0) {
      let rootObj = intersects[0].object;
      while (rootObj.parent && rootObj.parent !== interactiveGroup) {
        rootObj = rootObj.parent;
      }

      const ud = rootObj.userData;

      if (ud.type === 'card') {
        if (!humanCanAct) return;
        const buyMove = ud.buyMove;
        const reserveMove = ud.reserveMove;

        if (buyMove || reserveMove) {
          // Calculate screen position
          const targetPos = new THREE.Vector3();
          rootObj.getWorldPosition(targetPos);
          targetPos.project(camera);
          const x = (targetPos.x * 0.5 + 0.5) * width;
          const y = (-(targetPos.y * 0.5) + 0.5) * height;

          activeCardMenu = {
            card: ud.card,
            x,
            y,
            buyMove,
            reserveMove,
          };
        }
        return;
      } else if (ud.type === 'deck') {
        if (!humanCanAct) return;
        const reserveMove = ud.reserveMove;

        if (reserveMove) {
          const targetPos = new THREE.Vector3();
          rootObj.getWorldPosition(targetPos);
          targetPos.project(camera);
          const x = (targetPos.x * 0.5 + 0.5) * width;
          const y = (-(targetPos.y * 0.5) + 0.5) * height;

          activeCardMenu = {
            deckTier: ud.tier,
            x,
            y,
            reserveMove,
          };
        }
        return;
      } else if (ud.type === 'gem') {
        if (!humanCanAct) return;
        if (ud.gem !== 'gold') {
          onSelectGem(ud.gem as Gem);
        }
        activeCardMenu = null;
        return;
      }
    }

    // Clicked empty space
    activeCardMenu = null;
  }

  onMount(() => {
    // 1. Initialize Scene, Camera & WebGLRenderer
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);
    scene.fog = new THREE.FogExp2(0x0a0a0a, 0.04);

    const aspect = containerEl.clientWidth / containerEl.clientHeight;
    camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 100);
    // Position camera looking down-forward at the table
    camera.position.set(0, 9.0, 7.8);

    renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
    renderer.setSize(containerEl.clientWidth, containerEl.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 2. Add OrbitControls (constrain to avoid flipping the table)
    controls = new OrbitControls(camera, canvasEl);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // don't go below table
    controls.minDistance = 3;
    controls.maxDistance = 20;
    controls.target.set(0, -0.4, 0.2);

    raycaster = new THREE.Raycaster();

    // 3. Add Ambient & Spotlights for shadows and specular highlights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfffaed, 0.7);
    dirLight.position.set(2, 10, 3);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 25;
    dirLight.shadow.camera.left = -8;
    dirLight.shadow.camera.right = 8;
    dirLight.shadow.camera.top = 8;
    dirLight.shadow.camera.bottom = -8;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);

    // Warm accent light
    const pointLight = new THREE.PointLight(0xffaa44, 0.5, 30);
    pointLight.position.set(-6, 4, -4);
    scene.add(pointLight);

    // 4. Render Table Plane (Beautiful dark green felt felt or mahogany wood)
    const tableGeom = new THREE.PlaneGeometry(22, 14);
    const tableMat = new THREE.MeshStandardMaterial({
      color: 0x073b1a, // Dark green casino-style felt
      roughness: 0.85,
      metalness: 0.05,
    });
    const table = new THREE.Mesh(tableGeom, tableMat);
    table.rotation.x = -Math.PI / 2;
    table.receiveShadow = true;
    scene.add(table);

    // Subtle table border/rim
    const borderGeom = new THREE.BoxGeometry(22.6, 0.15, 14.6);
    const borderMat = new THREE.MeshStandardMaterial({
      color: 0x241407, // Mahogany wood finish border
      roughness: 0.4,
    });
    const border = new THREE.Mesh(borderGeom, borderMat);
    border.position.y = -0.08;
    border.receiveShadow = true;
    scene.add(border);

    // 5. Setup Interactive Objects Group
    interactiveGroup = new THREE.Group();
    scene.add(interactiveGroup);

    // 6. Pre-generate textures & static materials
    initStaticMaterials();

    // 7. Initial draw & animation loop start
    updateScene();
    tickAnimation();

    // 8. Setup ResizeObserver for responsive resizing
    resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const entry = entries[0];
      width = entry.contentRect.width || containerEl.clientWidth;
      height = entry.contentRect.height || containerEl.clientHeight;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      if (activeCardMenu) {
        updateMenuPosition();
      }
    });
    resizeObserver.observe(containerEl);

    // Set initial size
    width = containerEl.clientWidth;
    height = containerEl.clientHeight;
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }

      if (resizeObserver) {
        resizeObserver.disconnect();
      }

      // Clean up Three.js resources to prevent memory leaks
      if (renderer) {
        renderer.dispose();
      }

      if (scene) {
        scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            if (obj.geometry) obj.geometry.dispose();
            if (Array.isArray(obj.material)) {
              obj.material.forEach((mat) => mat.dispose());
            } else if (obj.material) {
              obj.material.dispose();
            }
          }
        });
      }

      // Clean up preloaded textures in cache
      textureCache.forEach((tex) => tex.dispose());
      textureCache.clear();
    }
  });
</script>

<div class="relative h-full w-full overflow-hidden" bind:this={containerEl}>
  <!-- Canvas for WebGL -->
  <canvas
    bind:this={canvasEl}
    class="block h-full w-full"
    on:mousemove={onPointerMove}
    on:click={onPointerDown}
  ></canvas>

  <!-- Interactive Camera Overlay Instructions -->
  <div class="pointer-events-none absolute bottom-3 left-3 select-none rounded-md bg-neutral-950/85 px-3 py-1.5 text-[10px] text-neutral-400 border border-neutral-800/80 ring-1 ring-white/5">
    <span class="font-medium text-neutral-200">Controls:</span> Left-Click + Drag to rotate • Right-Click + Drag to pan • Scroll to zoom
  </div>

  <!-- Floating Context Menu Overlay for Board Actions -->
  {#if activeCardMenu && humanCanAct}
    <div
      class="absolute z-50 flex min-w-36 flex-col gap-1 rounded-md border border-neutral-800 bg-neutral-950/95 p-2 shadow-2xl backdrop-blur-sm ring-1 ring-white/10"
      style={`left: ${activeCardMenu.x}px; top: ${activeCardMenu.y}px; transform: translate(-50%, -100%) translateY(-18px);`}
    >
      {#if activeCardMenu.card}
        <div class="mb-1.5 border-b border-neutral-800 pb-1 text-center text-[10px] font-semibold text-neutral-400">
          Card {activeCardMenu.card.id}
        </div>
        {#if activeCardMenu.buyMove}
          <button
            class="w-full cursor-pointer rounded bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-neutral-950 transition hover:bg-emerald-400 active:scale-[0.98]"
            type="button"
            on:click={() => {
              if (activeCardMenu?.buyMove) onBeginMove(activeCardMenu.buyMove);
              activeCardMenu = null;
            }}
          >
            Buy Card
          </button>
        {/if}
        {#if activeCardMenu.reserveMove}
          <button
            class="w-full cursor-pointer rounded border border-amber-300/80 bg-neutral-900/60 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-300/10 active:scale-[0.98]"
            type="button"
            on:click={() => {
              if (activeCardMenu?.reserveMove) onBeginMove(activeCardMenu.reserveMove);
              activeCardMenu = null;
            }}
          >
            Reserve Card
          </button>
        {/if}
      {:else if activeCardMenu.deckTier}
        <div class="mb-1.5 border-b border-neutral-800 pb-1 text-center text-[10px] font-semibold text-neutral-400">
          Tier {activeCardMenu.deckTier} Deck
        </div>
        {#if activeCardMenu.reserveMove}
          <button
            class="w-full cursor-pointer rounded border border-amber-300/80 bg-neutral-900/60 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-300/10 active:scale-[0.98]"
            type="button"
            on:click={() => {
              if (activeCardMenu?.reserveMove) onBeginMove(activeCardMenu.reserveMove);
              activeCardMenu = null;
            }}
          >
            Reserve Face-down
          </button>
        {/if}
      {/if}
      <button
        class="w-full cursor-pointer rounded border border-neutral-800 bg-neutral-900/40 px-3 py-1 text-xs text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-200"
        type="button"
        on:click={() => (activeCardMenu = null)}
      >
        Cancel
      </button>
    </div>
  {/if}
</div>
