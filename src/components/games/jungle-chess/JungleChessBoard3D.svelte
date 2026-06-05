<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import * as THREE from 'three';
  import {
    BOARD_HEIGHT,
    BOARD_WIDTH,
    coordKey,
    type JungleMove,
    type JunglePiece,
    type JungleState,
    type Coord,
    type PieceType,
  } from '@/lib/games/jungle-chess/state';
  import { terrainAt } from '@/lib/games/jungle-chess/rules';
  import { coordinateLabel } from '@/lib/games/jungle-chess/move-format';

  export let state: JungleState;
  export let selectedPieceId = '';
  export let selectedMoves: JungleMove[] = [];
  export let onSquare: (x: number, y: number) => void = () => {};

  let canvas: HTMLCanvasElement;
  let renderer: THREE.WebGLRenderer | undefined;
  let scene: THREE.Scene | undefined;
  let camera: THREE.PerspectiveCamera | undefined;
  let tableGroup: THREE.Group | undefined;
  let pieceLayer: THREE.Group | undefined;
  let highlightLayer: THREE.Group | undefined;
  let raycaster: THREE.Raycaster | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let animationFrame = 0;
  let isPointerDown = false;
  let isPanning = false;
  let didDrag = false;
  let pointerStartX = 0;
  let pointerStartY = 0;
  let yaw = -32;
  let pitch = 54;
  let distance = 14.8;
  let focusX = 0;
  let focusZ = 0;
  let activeState: JungleState | undefined;
  let activeSelectedPieceId = '';
  let activeSelectedMovesKey = '';
  let selectedMovesRenderKey = '';
  let startedAt = 0;
  let renderMode: 'webgl' | 'fallback' = 'webgl';

  const boardObjects: THREE.Object3D[] = [];
  const interactiveObjects: THREE.Object3D[] = [];
  const MOVE_ANIMATION_MS = 420;

  $: selectedMovesRenderKey = selectedMoves
    .map((move) => `${move.to.x},${move.to.y}`)
    .sort()
    .join('|');

  $: if (scene && state) {
    syncDynamicScene(selectedMovesRenderKey, selectedPieceId);
  }

  function squarePosition(x: number, y: number): THREE.Vector3 {
    return new THREE.Vector3(x - (BOARD_WIDTH - 1) / 2, 0, y - (BOARD_HEIGHT - 1) / 2);
  }

  function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  function squareKey(coord: Coord): string {
    return `${coord.x},${coord.y}`;
  }

  function targetHasCapture(x: number, y: number): boolean {
    return selectedMoves.some((m) => m.to.x === x && m.to.y === y && m.capturedId);
  }

  function startCoordForPiece(
    piece: JunglePiece,
    previousState: JungleState | undefined,
    animateMove: boolean,
  ): Coord {
    const current = { x: piece.x, y: piece.y };
    if (!animateMove || !previousState || !state.lastMove) {
      return current;
    }

    if (
      piece.id === state.lastMove.pieceId &&
      squareKey(current) === squareKey(state.lastMove.to)
    ) {
      return state.lastMove.from;
    }

    return current;
  }

  function material(opts: THREE.MeshStandardMaterialParameters) {
    return new THREE.MeshStandardMaterial(opts);
  }

  function addMesh(
    group: THREE.Group,
    geometry: THREE.BufferGeometry,
    mat: THREE.Material,
    position: [number, number, number] = [0, 0, 0],
    rotation: [number, number, number] = [0, 0, 0],
    scale: [number, number, number] = [1, 1, 1],
  ) {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.scale.set(...scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  function pieceMaterials(piece: JunglePiece) {
    const isRed = piece.owner === 0;
    // Red: 0xef4444 base, Blue: 0x3b82f6 base
    const baseColor = isRed ? 0xcc2222 : 0x2255cc;
    return {
      body: material({
        color: baseColor,
        roughness: 0.6,
        metalness: 0.1,
      }),
      trim: material({
        color: isRed ? 0xffaaaa : 0xaaaaff,
        roughness: 0.4,
        metalness: 0.2,
      }),
      dark: material({
        color: isRed ? 0x660000 : 0x001166,
        roughness: 0.8,
        metalness: 0.1,
      }),
      accent: material({
        color: 0xffffff,
        roughness: 0.3,
        metalness: 0.1,
      }),
    };
  }

  function addRat(group: THREE.Group, mats: ReturnType<typeof pieceMaterials>) {
    addMesh(group, new THREE.SphereGeometry(0.3, 32, 32), mats.body, [0, 0.3, 0]);
    addMesh(group, new THREE.SphereGeometry(0.15, 16, 16), mats.body, [0, 0.45, 0.25]);
    addMesh(group, new THREE.CylinderGeometry(0.02, 0.08, 0.2), mats.trim, [0.12, 0.55, 0.25], [0, 0, -0.3]);
    addMesh(group, new THREE.CylinderGeometry(0.02, 0.08, 0.2), mats.trim, [-0.12, 0.55, 0.25], [0, 0, 0.3]);
    addMesh(group, new THREE.CylinderGeometry(0.02, 0.04, 0.5), mats.dark, [0, 0.2, -0.4], [1.2, 0, 0]);
  }

  function addCat(group: THREE.Group, mats: ReturnType<typeof pieceMaterials>) {
    addMesh(group, new THREE.ConeGeometry(0.25, 0.4, 16), mats.body, [0, 0.3, 0]);
    addMesh(group, new THREE.SphereGeometry(0.18, 16, 16), mats.body, [0, 0.55, 0.1]);
    addMesh(group, new THREE.ConeGeometry(0.06, 0.15, 16), mats.trim, [0.1, 0.7, 0.05], [-0.2, 0, -0.2]);
    addMesh(group, new THREE.ConeGeometry(0.06, 0.15, 16), mats.trim, [-0.1, 0.7, 0.05], [-0.2, 0, 0.2]);
    addMesh(group, new THREE.SphereGeometry(0.02, 8, 8), mats.accent, [0.06, 0.58, 0.26]);
    addMesh(group, new THREE.SphereGeometry(0.02, 8, 8), mats.accent, [-0.06, 0.58, 0.26]);
    addMesh(group, new THREE.SphereGeometry(0.015, 8, 8), mats.dark, [0, 0.53, 0.28]);
    addMesh(group, new THREE.TorusGeometry(0.15, 0.03, 8, 16, Math.PI), mats.dark, [0, 0.15, -0.15], [Math.PI/2, 0, 0]);
  }

  function addDog(group: THREE.Group, mats: ReturnType<typeof pieceMaterials>) {
    addMesh(group, new THREE.CylinderGeometry(0.2, 0.3, 0.4, 16), mats.body, [0, 0.3, 0]);
    addMesh(group, new THREE.SphereGeometry(0.22, 16, 16), mats.body, [0, 0.6, 0.15]);
    addMesh(group, new THREE.CylinderGeometry(0.08, 0.12, 0.2, 16), mats.trim, [0, 0.55, 0.3], [Math.PI/2, 0, 0]);
    addMesh(group, new THREE.SphereGeometry(0.04, 8, 8), mats.dark, [0, 0.55, 0.4]);
    addMesh(group, new THREE.CapsuleGeometry(0.05, 0.15, 8, 8), mats.dark, [0.18, 0.55, 0.15], [0, 0, -0.5]);
    addMesh(group, new THREE.CapsuleGeometry(0.05, 0.15, 8, 8), mats.dark, [-0.18, 0.55, 0.15], [0, 0, 0.5]);
    addMesh(group, new THREE.CylinderGeometry(0.03, 0.05, 0.25, 8), mats.body, [0, 0.2, -0.25], [-0.5, 0, 0]);
  }

  function addWolf(group: THREE.Group, mats: ReturnType<typeof pieceMaterials>) {
    addMesh(group, new THREE.CapsuleGeometry(0.2, 0.4, 16, 16), mats.body, [0, 0.35, 0], [Math.PI/2, 0, 0]);
    addMesh(group, new THREE.SphereGeometry(0.18, 16, 16), mats.body, [0, 0.55, 0.25]);
    addMesh(group, new THREE.ConeGeometry(0.08, 0.25, 16), mats.trim, [0, 0.55, 0.4], [Math.PI/2, 0, 0]);
    addMesh(group, new THREE.SphereGeometry(0.025, 8, 8), mats.dark, [0, 0.55, 0.53]);
    addMesh(group, new THREE.ConeGeometry(0.05, 0.15, 16), mats.dark, [0.1, 0.65, 0.2], [-0.2, 0, -0.2]);
    addMesh(group, new THREE.ConeGeometry(0.05, 0.15, 16), mats.dark, [-0.1, 0.65, 0.2], [-0.2, 0, 0.2]);
    addMesh(group, new THREE.CapsuleGeometry(0.08, 0.25, 8, 8), mats.dark, [0, 0.35, -0.35], [-0.4, 0, 0]);
    addMesh(group, new THREE.CylinderGeometry(0.04, 0.03, 0.25), mats.body, [0.1, 0.15, 0.15]);
    addMesh(group, new THREE.CylinderGeometry(0.04, 0.03, 0.25), mats.body, [-0.1, 0.15, 0.15]);
    addMesh(group, new THREE.CylinderGeometry(0.04, 0.03, 0.25), mats.body, [0.1, 0.15, -0.15]);
    addMesh(group, new THREE.CylinderGeometry(0.04, 0.03, 0.25), mats.body, [-0.1, 0.15, -0.15]);
  }

  function addLeopard(group: THREE.Group, mats: ReturnType<typeof pieceMaterials>) {
    addMesh(group, new THREE.CapsuleGeometry(0.18, 0.5, 16, 16), mats.trim, [0, 0.35, 0], [Math.PI/2, 0, 0]);
    addMesh(group, new THREE.SphereGeometry(0.16, 16, 16), mats.trim, [0, 0.5, 0.3]);
    addMesh(group, new THREE.SphereGeometry(0.1, 16, 16), mats.accent, [0, 0.45, 0.4]);
    addMesh(group, new THREE.SphereGeometry(0.05, 16, 16), mats.dark, [0.12, 0.6, 0.25]);
    addMesh(group, new THREE.SphereGeometry(0.05, 16, 16), mats.dark, [-0.12, 0.6, 0.25]);
    addMesh(group, new THREE.CylinderGeometry(0.025, 0.02, 0.4), mats.trim, [0, 0.3, -0.45], [-1.0, 0, 0]);
    const spots = [[0.1, 0.48, 0.1], [-0.1, 0.45, 0], [0, 0.52, -0.1], [0.12, 0.42, -0.2], [-0.1, 0.48, -0.15]];
    for (const [x, y, z] of spots) {
      addMesh(group, new THREE.SphereGeometry(0.03, 8, 8), mats.dark, [x, y, z]);
    }
    addMesh(group, new THREE.CylinderGeometry(0.04, 0.03, 0.25), mats.trim, [0.1, 0.15, 0.2]);
    addMesh(group, new THREE.CylinderGeometry(0.04, 0.03, 0.25), mats.trim, [-0.1, 0.15, 0.2]);
    addMesh(group, new THREE.CylinderGeometry(0.04, 0.03, 0.25), mats.trim, [0.1, 0.15, -0.2]);
    addMesh(group, new THREE.CylinderGeometry(0.04, 0.03, 0.25), mats.trim, [-0.1, 0.15, -0.2]);
  }

  function addTiger(group: THREE.Group, mats: ReturnType<typeof pieceMaterials>) {
    addMesh(group, new THREE.CapsuleGeometry(0.24, 0.5, 16, 16), mats.body, [0, 0.38, 0], [Math.PI/2, 0, 0]);
    addMesh(group, new THREE.SphereGeometry(0.22, 16, 16), mats.body, [0, 0.55, 0.3]);
    addMesh(group, new THREE.SphereGeometry(0.12, 16, 16), mats.accent, [0.08, 0.5, 0.45]);
    addMesh(group, new THREE.SphereGeometry(0.12, 16, 16), mats.accent, [-0.08, 0.5, 0.45]);
    addMesh(group, new THREE.SphereGeometry(0.04, 8, 8), mats.dark, [0, 0.55, 0.5]);
    addMesh(group, new THREE.SphereGeometry(0.06, 16, 16), mats.dark, [0.15, 0.7, 0.25]);
    addMesh(group, new THREE.SphereGeometry(0.06, 16, 16), mats.dark, [-0.15, 0.7, 0.25]);
    addMesh(group, new THREE.CylinderGeometry(0.04, 0.03, 0.4), mats.body, [0, 0.3, -0.45], [-0.8, 0, 0]);
    addMesh(group, new THREE.TorusGeometry(0.24, 0.02, 8, 16), mats.dark, [0, 0.38, 0.15]);
    addMesh(group, new THREE.TorusGeometry(0.24, 0.02, 8, 16), mats.dark, [0, 0.38, 0]);
    addMesh(group, new THREE.TorusGeometry(0.24, 0.02, 8, 16), mats.dark, [0, 0.38, -0.15]);
    addMesh(group, new THREE.CylinderGeometry(0.06, 0.04, 0.25), mats.body, [0.12, 0.15, 0.2]);
    addMesh(group, new THREE.CylinderGeometry(0.06, 0.04, 0.25), mats.body, [-0.12, 0.15, 0.2]);
    addMesh(group, new THREE.CylinderGeometry(0.06, 0.04, 0.25), mats.body, [0.12, 0.15, -0.2]);
    addMesh(group, new THREE.CylinderGeometry(0.06, 0.04, 0.25), mats.body, [-0.12, 0.15, -0.2]);
  }

  function addLion(group: THREE.Group, mats: ReturnType<typeof pieceMaterials>) {
    addMesh(group, new THREE.CylinderGeometry(0.28, 0.35, 0.45, 16), mats.body, [0, 0.32, 0]);
    addMesh(group, new THREE.IcosahedronGeometry(0.35, 1), mats.trim, [0, 0.65, 0.1]);
    addMesh(group, new THREE.SphereGeometry(0.22, 16, 16), mats.body, [0, 0.65, 0.25]);
    addMesh(group, new THREE.BoxGeometry(0.16, 0.12, 0.15), mats.accent, [0, 0.6, 0.4]);
    addMesh(group, new THREE.SphereGeometry(0.04, 8, 8), mats.dark, [0, 0.65, 0.48]);
    addMesh(group, new THREE.CylinderGeometry(0.03, 0.03, 0.35), mats.body, [0, 0.25, -0.3], [-0.5, 0, 0]);
    addMesh(group, new THREE.SphereGeometry(0.06, 8, 8), mats.trim, [0, 0.4, -0.45]);
  }

  function addElephant(group: THREE.Group, mats: ReturnType<typeof pieceMaterials>) {
    addMesh(group, new THREE.CapsuleGeometry(0.5, 0.6, 32, 32), mats.body, [0, 0.6, 0], [Math.PI/2, 0, 0]);
    addMesh(group, new THREE.SphereGeometry(0.4, 32, 32), mats.body, [0, 0.9, 0.55]);
    addMesh(group, new THREE.CapsuleGeometry(0.1, 0.5, 16, 16), mats.body, [0, 0.6, 0.9], [0.4, 0, 0]);
    addMesh(group, new THREE.ConeGeometry(0.06, 0.4, 16), mats.accent, [0.2, 0.7, 0.8], [0.6, 0, -0.2]);
    addMesh(group, new THREE.ConeGeometry(0.06, 0.4, 16), mats.accent, [-0.2, 0.7, 0.8], [0.6, 0, 0.2]);
    addMesh(group, new THREE.CylinderGeometry(0.2, 0.2, 0.05, 16), mats.dark, [0.45, 1.0, 0.5], [0, 0, -Math.PI/2]);
    addMesh(group, new THREE.CylinderGeometry(0.2, 0.2, 0.05, 16), mats.dark, [-0.45, 1.0, 0.5], [0, 0, Math.PI/2]);
  }

  function createRankSprite(rank: number, isRed: boolean): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fillStyle = isRed ? '#7f1d1d' : '#1e3a8a';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = isRed ? '#fca5a5' : '#93c5fd';
    ctx.stroke();

    ctx.fillStyle = 'white';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(rank.toString(), 32, 34);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.6, 0.6, 1);
    
    // We position it so it appears to float near the top right of the piece
    sprite.position.set(0.6, 1.2, -0.6);
    sprite.renderOrder = 10;
    return sprite;
  }

  function createPieceModel(piece: JunglePiece): THREE.Group {
    const group = new THREE.Group();
    const mats = pieceMaterials(piece);
    
    addMesh(group, new THREE.CylinderGeometry(0.65, 0.7, 0.12, 32), mats.dark, [0, 0.06, 0]);
    addMesh(group, new THREE.CylinderGeometry(0.58, 0.6, 0.06, 32), mats.trim, [0, 0.15, 0]);

    const builders: Record<PieceType, () => void> = {
      rat: () => addRat(group, mats),
      cat: () => addCat(group, mats),
      dog: () => addDog(group, mats),
      wolf: () => addWolf(group, mats),
      leopard: () => addLeopard(group, mats),
      tiger: () => addTiger(group, mats),
      lion: () => addLion(group, mats),
      elephant: () => addElephant(group, mats),
    };
    builders[piece.type]();

    group.scale.setScalar(0.55);
    
    group.rotation.y = piece.owner === 0 ? Math.PI : 0;
    
    // Sprite attached after rotation so we can adjust it if needed,
    // actually sprite position will rotate with the group.
    const sprite = createRankSprite(piece.rank, piece.owner === 0);
    // Counter-rotate the sprite's position so it always appears on the top-right
    // relative to the board, not the piece's facing direction.
    if (piece.owner === 0) {
      sprite.position.set(-0.6, 1.2, 0.6);
    }
    group.add(sprite);

    group.userData = {
      pieceId: piece.id,
      x: piece.x,
      y: piece.y,
      selected: piece.id === selectedPieceId,
      baseY: 0.12,
    };
    group.traverse((object) => {
      object.userData = group?.userData ?? object.userData;
    });
    return group;
  }

  function disposeObject(object: THREE.Object3D) {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];
        for (const item of materials) {
          item.dispose();
        }
      }
    });
  }

  function createBoardTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    const size = 128;
    canvas.width = BOARD_WIDTH * size;
    canvas.height = BOARD_HEIGHT * size;
    const ctx = canvas.getContext('2d')!;

    // Base board background (gap lines)
    ctx.fillStyle = '#111713';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        const t = terrainAt({ x, y });
        let bgColor = '#233816'; // Dark grass
        let borderColor = 'rgba(6, 78, 59, 0.4)';
        
        if (t === 'water') {
          bgColor = '#143836';
          borderColor = 'rgba(14, 165, 233, 0.4)';
        } else if (t === 'trap') {
          bgColor = '#40451f';
          borderColor = 'rgba(252, 211, 77, 0.4)';
        } else if (t === 'den') {
          bgColor = '#4b2a26';
          borderColor = 'rgba(253, 164, 175, 0.4)';
        }

        const px = x * size;
        const py = y * size; 

        const gap = 3;
        ctx.fillStyle = bgColor;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 4;
        
        ctx.beginPath();
        ctx.roundRect(px + gap, py + gap, size - gap * 2, size - gap * 2, 10);
        ctx.fill();
        ctx.stroke();

        if (t === 'water') {
          const cx = px + size / 2;
          const cy = py + size / 2;
          const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.4);
          grad.addColorStop(0, 'rgba(56, 189, 248, 0.25)');
          grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
          ctx.fillStyle = grad;
          ctx.fill();
        }

        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(coordinateLabel(x, y), px + gap + 10, py + gap + 10);

        if (t === 'trap' || t === 'den') {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
          ctx.font = 'bold 50px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(t === 'trap' ? '陷' : '穴', px + size / 2, py + size / 2);
        }
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer?.capabilities.getMaxAnisotropy() || 1;
    return texture;
  }

  function addBoard() {
    if (!scene || !tableGroup) return;

    const texture = createBoardTexture();
    const boardMat = material({ map: texture, roughness: 0.9, metalness: 0.05 });
    const edgeMat = material({ color: 0x111713, roughness: 0.8 });

    // Base block
    addMesh(tableGroup, new THREE.BoxGeometry(7.4, 0.28, 9.4), edgeMat, [0, -0.16, 0]);
    
    // Top surface with texture
    const topGeom = new THREE.PlaneGeometry(7.4, 9.4);
    const topMesh = new THREE.Mesh(topGeom, boardMat);
    topMesh.rotation.x = -Math.PI / 2;
    topMesh.position.y = -0.01;
    topMesh.receiveShadow = true;
    tableGroup.add(topMesh);

    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        const pos = squarePosition(x, y);
        const coord = { x, y };
        
        const hitboxMat = material({ color: 0xff0000, transparent: true, opacity: 0 });
        hitboxMat.depthWrite = false;
        const square = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 1.0), hitboxMat);
        square.position.set(pos.x, 0.04, pos.z);
        square.userData = { x, y, square: coordKey(coord) };
        tableGroup.add(square);
        boardObjects.push(square);
        interactiveObjects.push(square);
      }
    }
  }

  function clearLayer(layer: THREE.Group | undefined) {
    if (!layer) return;
    for (const child of [...layer.children]) {
      layer.remove(child);
      disposeObject(child);
    }
  }

  function addHighlights() {
    if (!highlightLayer || !state) return;

    const targetMat = material({
      color: 0x22c55e,
      emissive: 0x1a7f45,
      transparent: true,
      opacity: 0.9,
    });
    const targetSquareMat = material({
      color: 0x34d399,
      emissive: 0x0d3b2a,
      transparent: true,
      opacity: 0.4,
    });
    const targetHaloMat = material({
      color: 0xbbf7d0,
      emissive: 0x4a8f62,
      transparent: true,
      opacity: 0.7,
    });
    const captureMat = material({
      color: 0xf97316,
      emissive: 0x6b2508,
      transparent: true,
      opacity: 0.92,
    });
    const selectedMat = material({
      color: 0xf8d77e,
      emissive: 0x6a4b10,
      transparent: true,
      opacity: 0.84,
    });
    const lastMoveMat = material({
      color: 0xeab308,
      emissive: 0x4a3402,
      transparent: true,
      opacity: 0.6,
    });
    for (const mat of [
      targetMat,
      targetSquareMat,
      targetHaloMat,
      captureMat,
      selectedMat,
      lastMoveMat,
    ]) {
      mat.depthWrite = false;
    }

    if (state.lastMove) {
      for (const coord of [state.lastMove.from, state.lastMove.to]) {
        const pos = squarePosition(coord.x, coord.y);
        addMesh(highlightLayer, new THREE.BoxGeometry(0.95, 0.035, 0.95), lastMoveMat, [pos.x, 0.06, pos.z]);
      }
    }

    const selectedPiece = state.pieces.find((piece) => piece.id === selectedPieceId && !piece.captured);
    if (selectedPiece) {
      const pos = squarePosition(selectedPiece.x, selectedPiece.y);
      addMesh(highlightLayer, new THREE.BoxGeometry(0.95, 0.045, 0.95), selectedMat, [pos.x, 0.08, pos.z]);
    }

    const targetSquares = new Map<string, JungleMove>();
    for (const move of selectedMoves) {
      targetSquares.set(squareKey(move.to), move);
    }

    for (const move of targetSquares.values()) {
      const pos = squarePosition(move.to.x, move.to.y);
      addMesh(
        highlightLayer,
        new THREE.BoxGeometry(0.95, 0.035, 0.95),
        targetSquareMat,
        [pos.x, 0.09, pos.z],
      );
      const halo = addMesh(
        highlightLayer,
        new THREE.TorusGeometry(0.37, 0.045, 12, 44),
        targetHaloMat,
        [pos.x, 0.15, pos.z],
        [Math.PI / 2, 0, 0],
      );
      halo.userData = { x: move.to.x, y: move.to.y };
      interactiveObjects.push(halo);

      const target = addMesh(
        highlightLayer,
        new THREE.CylinderGeometry(0.18, 0.24, 0.34, 32),
        targetMat,
        [pos.x, 0.26, pos.z],
      );
      target.userData = { x: move.to.x, y: move.to.y };
      interactiveObjects.push(target);

      if (targetHasCapture(move.to.x, move.to.y)) {
        const ring = addMesh(
          highlightLayer,
          new THREE.TorusGeometry(0.43, 0.045, 12, 42),
          captureMat,
          [pos.x, 0.20, pos.z],
          [Math.PI / 2, 0, 0],
        );
        ring.userData = { x: move.to.x, y: move.to.y };
        interactiveObjects.push(ring);
      }
    }
  }

  function addPieces(previousState: JungleState | undefined, animateMove: boolean) {
    if (!pieceLayer || !state) return;

    for (const piece of state.pieces) {
      if (piece.captured) continue;
      
      const model = createPieceModel(piece);
      const targetCoord = { x: piece.x, y: piece.y };
      const startCoord = startCoordForPiece(piece, previousState, animateMove);
      const start = squarePosition(startCoord.x, startCoord.y);
      const target = squarePosition(targetCoord.x, targetCoord.y);

      const isMoving = animateMove && (start.x !== target.x || start.z !== target.z);

      model.position.set(start.x, 0.12, start.z);
      model.userData = {
        ...model.userData,
        startX: start.x,
        startZ: start.z,
        targetX: target.x,
        targetZ: target.z,
        moveStartedAt: performance.now(),
        moveDuration: isMoving ? MOVE_ANIMATION_MS : 0,
        moving: isMoving,
        baseY: 0.12,
      };

      pieceLayer.add(model);
      interactiveObjects.push(model);
    }
  }

  function syncDynamicScene(movesKey: string, pieceId: string) {
    if (!scene || !activeState) return;
    if (activeSelectedMovesKey !== movesKey || activeSelectedPieceId !== pieceId) {
      activeSelectedMovesKey = movesKey;
      activeSelectedPieceId = pieceId;
      interactiveObjects.length = boardObjects.length;
      clearLayer(highlightLayer);
      addHighlights();
    }
  }

  $: if (state && scene) {
    const isNewTurn = !activeState || activeState.turn !== state.turn;
    const previousState = activeState;
    activeState = state;

    if (isNewTurn) {
      interactiveObjects.length = boardObjects.length;
      clearLayer(pieceLayer);
      clearLayer(highlightLayer);

      const animateMove = !!previousState && previousState.seed === state.seed;
      addPieces(previousState, animateMove);
      
      activeSelectedMovesKey = selectedMovesRenderKey;
      activeSelectedPieceId = selectedPieceId;
      addHighlights();
    } else {
      syncDynamicScene(selectedMovesRenderKey, selectedPieceId);
    }
  }

  onMount(() => {
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      scene = new THREE.Scene();
      scene.background = new THREE.Color('#0a0a0a');
      scene.fog = new THREE.FogExp2('#0a0a0a', 0.015);

      camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

      const ambientLight = new THREE.AmbientLight(0xffffff, 1.6);
      scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffeedd, 2.5);
      directionalLight.position.set(5, 12, 6);
      directionalLight.castShadow = true;
      directionalLight.shadow.camera.left = -8;
      directionalLight.shadow.camera.right = 8;
      directionalLight.shadow.camera.top = 8;
      directionalLight.shadow.camera.bottom = -8;
      directionalLight.shadow.mapSize.width = 2048;
      directionalLight.shadow.mapSize.height = 2048;
      directionalLight.shadow.bias = -0.0005;
      scene.add(directionalLight);

      const fillLight = new THREE.DirectionalLight(0xddddff, 1.0);
      fillLight.position.set(-6, 8, -6);
      scene.add(fillLight);

      tableGroup = new THREE.Group();
      scene.add(tableGroup);

      pieceLayer = new THREE.Group();
      tableGroup.add(pieceLayer);

      highlightLayer = new THREE.Group();
      tableGroup.add(highlightLayer);

      addBoard();
      activeState = state;
      addPieces(undefined, false);
      addHighlights();

      raycaster = new THREE.Raycaster();

      resizeObserver = new ResizeObserver((entries) => {
        if (!entries.length || !camera || !renderer) return;
        const { width, height } = entries[0].contentRect;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
      });
      resizeObserver.observe(canvas.parentElement!);

      startedAt = performance.now();
      animate();
    } catch (e) {
      console.warn('WebGL initialization failed, using fallback UI', e);
      renderMode = 'fallback';
    }
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
    if (animationFrame) cancelAnimationFrame(animationFrame);
    if (renderer) renderer.dispose();
    if (scene) {
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          for (const item of materials) {
            item.dispose();
          }
        }
      });
    }
  });

  function updateCamera() {
    if (!camera) return;
    const yawRad = THREE.MathUtils.degToRad(yaw);
    const pitchRad = THREE.MathUtils.degToRad(pitch);
    const cx = focusX + distance * Math.sin(yawRad) * Math.cos(pitchRad);
    const cy = distance * Math.sin(pitchRad);
    const cz = focusZ + distance * Math.cos(yawRad) * Math.cos(pitchRad);
    camera.position.set(cx, cy, cz);
    camera.lookAt(focusX, 0, focusZ);
  }

  function animate() {
    if (!renderer || !scene || !camera) return;

    const now = performance.now();
    const elapsed = now - startedAt;

    if (pieceLayer) {
      for (const model of pieceLayer.children) {
        const { startX, startZ, targetX, targetZ, moveStartedAt, moveDuration, baseY, moving } = model.userData;

        const isSelected = model.userData.selected;
        const targetY = isSelected ? baseY + 0.35 : baseY;
        model.position.y = THREE.MathUtils.lerp(model.position.y, targetY, 0.15);

        if (moving) {
          const t = Math.min((now - moveStartedAt) / moveDuration, 1);
          if (t < 1) {
            const eased = easeOutCubic(t);
            model.position.x = THREE.MathUtils.lerp(startX, targetX, eased);
            model.position.z = THREE.MathUtils.lerp(startZ, targetZ, eased);
            
            const jumpHeight = Math.sin(eased * Math.PI) * 1.5;
            model.position.y += jumpHeight;
          } else {
            model.position.x = targetX;
            model.position.z = targetZ;
            model.userData.moving = false;
          }
        }

        if (isSelected) {
          const bounce = Math.sin(elapsed * 0.006) * 0.08;
          model.position.y += bounce;
        }
      }
    }

    if (highlightLayer) {
      for (const mesh of highlightLayer.children) {
        if (mesh.geometry.type === 'TorusGeometry') {
          mesh.rotation.z += 0.02;
        }
      }
    }

    updateCamera();
    renderer.render(scene, camera);
    animationFrame = requestAnimationFrame(animate);
  }

  function handlePointerDown(e: PointerEvent) {
    if (e.button === 0 && !e.shiftKey) {
      const isPick = pickObject(e.clientX, e.clientY);
      if (isPick) return;
    }
    isPointerDown = true;
    didDrag = false;
    pointerStartX = e.clientX;
    pointerStartY = e.clientY;
    
    if (e.button === 2 || e.button === 1 || e.shiftKey) {
      isPanning = true;
    } else {
      isPanning = false;
    }
    
    if (e.target instanceof Element) {
      e.target.setPointerCapture(e.pointerId);
    }
  }

  function handlePointerMove(e: PointerEvent) {
    if (!isPointerDown) return;
    
    const dx = e.clientX - pointerStartX;
    const dy = e.clientY - pointerStartY;
    
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      didDrag = true;
    }

    if (isPanning) {
      const yawRad = THREE.MathUtils.degToRad(yaw);
      const panSpeed = distance * 0.0012;
      const rightX = Math.cos(yawRad);
      const rightZ = -Math.sin(yawRad);
      const forwardX = Math.sin(yawRad);
      const forwardZ = Math.cos(yawRad);
      
      focusX -= (dx * rightX + dy * forwardX) * panSpeed;
      focusZ -= (dx * rightZ + dy * forwardZ) * panSpeed;
    } else {
      yaw -= dx * 0.6;
      pitch = THREE.MathUtils.clamp(pitch - dy * 0.6, 10, 85);
    }

    pointerStartX = e.clientX;
    pointerStartY = e.clientY;
  }

  function handlePointerUp(e: PointerEvent) {
    isPointerDown = false;
    isPanning = false;
    if (e.target instanceof Element) {
      e.target.releasePointerCapture(e.pointerId);
    }
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    distance = THREE.MathUtils.clamp(distance + e.deltaY * 0.02, 6, 25);
  }

  function pickObject(clientX: number, clientY: number): boolean {
    if (!canvas || !camera || !raycaster) return false;
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    const intersects = raycaster.intersectObjects(interactiveObjects, true);

    if (intersects.length > 0) {
      let object: THREE.Object3D | null = intersects[0].object;
      while (object && object.userData.x === undefined) {
        object = object.parent;
      }
      if (object && object.userData.x !== undefined) {
        onSquare(object.userData.x, object.userData.y);
        return true;
      }
    }
    return false;
  }
</script>

{#if renderMode === 'webgl'}
  <canvas
    bind:this={canvas}
    class="block h-full w-full touch-none"
    on:pointerdown={handlePointerDown}
    on:pointermove={handlePointerMove}
    on:pointerup={handlePointerUp}
    on:pointercancel={handlePointerUp}
    on:wheel={handleWheel}
    on:contextmenu|preventDefault
    style="cursor: grab;"
  ></canvas>
{:else}
  <div class="flex h-full w-full items-center justify-center text-sm text-neutral-400">
    3D visualization unavailable
  </div>
{/if}
