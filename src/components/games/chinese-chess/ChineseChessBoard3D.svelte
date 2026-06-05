<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import * as THREE from 'three';
  import {
    BOARD_HEIGHT,
    BOARD_WIDTH,
    type ChineseChessMove,
    type ChineseChessPiece,
    type ChineseChessState,
    type Coord,
    type PieceType,
  } from '@/lib/games/chinese-chess/state';
  import { coordinateLabel } from '@/lib/games/chinese-chess/move-format';

  export let state: ChineseChessState;
  export let selectedPieceId = '';
  export let selectedMoves: ChineseChessMove[] = [];
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
  let activeState: ChineseChessState | undefined;
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

  function startCoordForPiece(
    piece: ChineseChessPiece,
    previousState: ChineseChessState | undefined,
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

  function targetHasCapture(x: number, y: number): boolean {
    return selectedMoves.some(
      (move) => move.to.x === x && move.to.y === y && move.capturedId != null,
    );
  }

  function material(opts: {
    color: number;
    roughness?: number;
    metalness?: number;
    emissive?: number;
    transparent?: boolean;
    opacity?: number;
  }): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: opts.color,
      roughness: opts.roughness ?? 0.58,
      metalness: opts.metalness ?? 0.12,
      emissive: opts.emissive ?? 0x000000,
      transparent: opts.transparent,
      opacity: opts.opacity,
    });
  }

  function addMesh(
    group: THREE.Group,
    geometry: THREE.BufferGeometry,
    mat: THREE.Material,
    position: [number, number, number],
    rotation: [number, number, number] = [0, 0, 0],
    scale: [number, number, number] = [1, 1, 1],
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.scale.set(...scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  function pieceMaterials(piece: ChineseChessPiece) {
    const isRed = piece.owner === 0;
    return {
      body: material({
        color: isRed ? 0xebd9b4 : 0x3d2b1f,
        roughness: 0.6,
        metalness: 0.05,
      }),
      trim: material({
        color: isRed ? 0xcdb183 : 0x24180f,
        roughness: 0.5,
        metalness: 0.1,
      }),
      dark: material({
        color: isRed ? 0xa88554 : 0x160e09,
        roughness: 0.7,
        metalness: 0.05,
      }),
      accent: material({
        color: isRed ? 0xab2222 : 0x1a1a1a,
        roughness: 0.4,
        metalness: 0.15,
      }),
    };
  }

  function addBase(group: THREE.Group, mats: ReturnType<typeof pieceMaterials>) {
    addMesh(group, new THREE.CylinderGeometry(0.72, 0.82, 0.18, 40), mats.dark, [0, 0.09, 0]);
    addMesh(group, new THREE.CylinderGeometry(0.62, 0.7, 0.16, 40), mats.trim, [0, 0.26, 0]);
    addMesh(group, new THREE.CylinderGeometry(0.46, 0.55, 0.22, 40), mats.body, [0, 0.45, 0]);
  }

  function addSoldier(group: THREE.Group, mats: ReturnType<typeof pieceMaterials>) {
    addMesh(group, new THREE.CylinderGeometry(0.22, 0.3, 0.38, 32), mats.body, [0, 0.75, 0]);
    addMesh(group, new THREE.SphereGeometry(0.34, 32, 20), mats.body, [0, 1.08, 0]);
    addMesh(group, new THREE.ConeGeometry(0.45, 0.25, 32), mats.trim, [0, 1.35, 0]);
  }

  function addHorse(group: THREE.Group, mats: ReturnType<typeof pieceMaterials>) {
    addMesh(group, new THREE.CylinderGeometry(0.24, 0.34, 0.52, 28), mats.body, [0, 0.76, 0]);
    addMesh(group, new THREE.BoxGeometry(0.38, 0.62, 0.32), mats.body, [0.05, 1.18, 0], [0, 0, -0.28]);
    addMesh(group, new THREE.BoxGeometry(0.34, 0.2, 0.28), mats.body, [0.25, 1.34, 0], [0, 0, 0.08]);
    addMesh(group, new THREE.ConeGeometry(0.09, 0.3, 4), mats.trim, [-0.05, 1.58, 0.08], [0.15, 0.35, 0.1]);
    addMesh(group, new THREE.ConeGeometry(0.09, 0.28, 4), mats.trim, [0.08, 1.58, -0.08], [-0.15, -0.35, -0.1]);
  }

  function addChariot(group: THREE.Group, mats: ReturnType<typeof pieceMaterials>) {
    addMesh(group, new THREE.CylinderGeometry(0.4, 0.5, 0.62, 36), mats.body, [0, 0.88, 0]);
    addMesh(group, new THREE.CylinderGeometry(0.52, 0.45, 0.16, 36), mats.trim, [0, 1.26, 0]);
    for (let i = 0; i < 4; i += 1) {
      const angle = (Math.PI / 2) * i + Math.PI / 4;
      addMesh(
        group,
        new THREE.BoxGeometry(0.24, 0.24, 0.22),
        mats.trim,
        [Math.cos(angle) * 0.36, 1.46, Math.sin(angle) * 0.36],
        [0, -angle, 0],
      );
    }
  }

  function addCannon(group: THREE.Group, mats: ReturnType<typeof pieceMaterials>) {
    addMesh(group, new THREE.BoxGeometry(0.5, 0.6, 0.4), mats.body, [0, 0.8, 0]);
    addMesh(group, new THREE.CylinderGeometry(0.18, 0.22, 1.1, 32), mats.dark, [0.1, 1.2, 0], [0, 0, -Math.PI / 2 + 0.2]);
    addMesh(group, new THREE.TorusGeometry(0.2, 0.04, 16, 32), mats.trim, [0.4, 1.26, 0], [0, Math.PI/2, Math.PI / 2 - 0.2]);
    addMesh(group, new THREE.SphereGeometry(0.22, 16, 16), mats.dark, [-0.42, 1.1, 0]);
  }

  function addElephant(group: THREE.Group, mats: ReturnType<typeof pieceMaterials>) {
    addMesh(group, new THREE.CylinderGeometry(0.45, 0.55, 0.6, 32), mats.body, [0, 0.85, 0]);
    addMesh(group, new THREE.SphereGeometry(0.45, 32, 20), mats.body, [0, 1.15, 0]);
    addMesh(group, new THREE.ConeGeometry(0.08, 0.4, 16), mats.trim, [0.35, 1.1, 0.15], [Math.PI/2 - 0.2, 0, -Math.PI/4]);
    addMesh(group, new THREE.ConeGeometry(0.08, 0.4, 16), mats.trim, [0.35, 1.1, -0.15], [-Math.PI/2 + 0.2, 0, -Math.PI/4]);
    addMesh(group, new THREE.CylinderGeometry(0.1, 0.15, 0.5, 16), mats.dark, [0.45, 1.0, 0], [0, 0, -Math.PI/4]);
    addMesh(group, new THREE.CylinderGeometry(0.2, 0.2, 0.06, 16), mats.body, [0.1, 1.2, 0.4], [Math.PI/2, -0.3, 0], [1.2, 1, 1.5]);
    addMesh(group, new THREE.CylinderGeometry(0.2, 0.2, 0.06, 16), mats.body, [0.1, 1.2, -0.4], [Math.PI/2, 0.3, 0], [1.2, 1, 1.5]);
  }

  function addAdvisor(group: THREE.Group, mats: ReturnType<typeof pieceMaterials>) {
    addMesh(group, new THREE.CylinderGeometry(0.25, 0.38, 0.55, 32), mats.body, [0, 0.83, 0]);
    addMesh(group, new THREE.SphereGeometry(0.3, 32, 20), mats.body, [0, 1.2, 0]);
    addMesh(group, new THREE.BoxGeometry(0.5, 0.1, 0.5), mats.dark, [0, 1.45, 0]);
    addMesh(group, new THREE.BoxGeometry(0.1, 0.3, 0.8), mats.dark, [-0.15, 1.35, 0], [0, 0, 0.2]);
  }

  function addGeneral(group: THREE.Group, mats: ReturnType<typeof pieceMaterials>) {
    addMesh(group, new THREE.CylinderGeometry(0.32, 0.48, 0.7, 36), mats.body, [0, 0.9, 0]);
    addMesh(group, new THREE.CylinderGeometry(0.48, 0.4, 0.14, 36), mats.trim, [0, 1.32, 0]);
    addMesh(group, new THREE.SphereGeometry(0.35, 32, 20), mats.dark, [0, 1.5, 0]);
    addMesh(group, new THREE.ConeGeometry(0.15, 0.4, 16), mats.accent, [0, 1.8, 0]);
  }

  function createPieceModel(piece: ChineseChessPiece): THREE.Group {
    const group = new THREE.Group();
    const mats = pieceMaterials(piece);
    addBase(group, mats);

    const builders: Record<PieceType, () => void> = {
      soldier: () => addSoldier(group, mats),
      horse: () => addHorse(group, mats),
      elephant: () => addElephant(group, mats),
      advisor: () => addAdvisor(group, mats),
      chariot: () => addChariot(group, mats),
      cannon: () => addCannon(group, mats),
      general: () => addGeneral(group, mats),
    };
    builders[piece.type]();

    group.scale.setScalar(0.46);
    // Orient the pieces appropriately
    // By default, x-axis is 'forward' for our models (horse facing, cannon facing)
    // We want Red (owner 0) to face Black (negative Z direction)
    // And Black (owner 1) to face Red (positive Z direction)
    // If our forward is +x, we rotate to point to -z
    group.rotation.y = piece.owner === 0 ? Math.PI / 2 : -Math.PI / 2;
    group.userData = {
      pieceId: piece.id,
      x: piece.x,
      y: piece.y,
      selected: piece.id === selectedPieceId,
      baseY: 0.16,
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

  function addBoard() {
    if (!scene || !tableGroup) return;

    const boardMat = material({ color: 0xdca86b, roughness: 0.78, metalness: 0.02 });
    const edgeMat = material({ color: 0x2b2118, roughness: 0.68 });
    const lineMat = material({ color: 0x4a2c14, roughness: 0.9, metalness: 0.0 });

    addMesh(tableGroup, new THREE.BoxGeometry(10.6, 0.28, 11.6), edgeMat, [0, -0.16, 0]);
    addMesh(tableGroup, new THREE.BoxGeometry(10.4, 0.05, 11.4), boardMat, [0, -0.01, 0]);

    // Grid lines
    for (let x = 0; x < BOARD_WIDTH; x++) {
      const px = x - (BOARD_WIDTH - 1) / 2;
      // Lines break at the river for columns 1 to 7
      if (x > 0 && x < BOARD_WIDTH - 1) {
        addMesh(tableGroup, new THREE.BoxGeometry(0.04, 0.01, 4), lineMat, [px, 0.02, -2.5]);
        addMesh(tableGroup, new THREE.BoxGeometry(0.04, 0.01, 4), lineMat, [px, 0.02, 2.5]);
      } else {
        addMesh(tableGroup, new THREE.BoxGeometry(0.04, 0.01, 9), lineMat, [px, 0.02, 0]);
      }
    }

    for (let y = 0; y < BOARD_HEIGHT; y++) {
      const pz = y - (BOARD_HEIGHT - 1) / 2;
      addMesh(tableGroup, new THREE.BoxGeometry(8, 0.01, 0.04), lineMat, [0, 0.02, pz]);
    }

    // Palace diagonals
    addMesh(tableGroup, new THREE.BoxGeometry(0.04, 0.01, 2.828), lineMat, [0, 0.02, -3.5], [0, Math.PI / 4, 0]);
    addMesh(tableGroup, new THREE.BoxGeometry(0.04, 0.01, 2.828), lineMat, [0, 0.02, -3.5], [0, -Math.PI / 4, 0]);
    
    addMesh(tableGroup, new THREE.BoxGeometry(0.04, 0.01, 2.828), lineMat, [0, 0.02, 3.5], [0, Math.PI / 4, 0]);
    addMesh(tableGroup, new THREE.BoxGeometry(0.04, 0.01, 2.828), lineMat, [0, 0.02, 3.5], [0, -Math.PI / 4, 0]);

    // Invisible hitboxes for intersections
    const hitboxMat = material({ color: 0xff0000, transparent: true, opacity: 0 });
    hitboxMat.depthWrite = false;
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        const square = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.9), hitboxMat);
        const position = squarePosition(x, y);
        square.position.set(position.x, 0.05, position.z);
        square.userData = { x, y, square: coordinateLabel(x, y) };
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
      emissive: 0x22c55e,
      transparent: true,
      opacity: 0.5,
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
        addMesh(highlightLayer, new THREE.BoxGeometry(0.9, 0.035, 0.9), lastMoveMat, [pos.x, 0.02, pos.z]);
      }
    }

    const selectedPiece = state.pieces.find((piece) => piece.id === selectedPieceId);
    if (selectedPiece) {
      const pos = squarePosition(selectedPiece.x, selectedPiece.y);
      addMesh(highlightLayer, new THREE.BoxGeometry(0.88, 0.045, 0.88), selectedMat, [pos.x, 0.04, pos.z]);
    }

    const targetSquares = new Map<string, ChineseChessMove>();
    for (const move of selectedMoves) {
      targetSquares.set(squareKey(move.to), move);
    }

    for (const move of targetSquares.values()) {
      const pos = squarePosition(move.to.x, move.to.y);
      addMesh(
        highlightLayer,
        new THREE.BoxGeometry(0.9, 0.035, 0.9),
        targetSquareMat,
        [pos.x, 0.05, pos.z],
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
          [pos.x, 0.1, pos.z],
          [Math.PI / 2, 0, 0],
        );
        ring.userData = { x: move.to.x, y: move.to.y };
        interactiveObjects.push(ring);
      }
    }
  }

  function addPieces(previousState: ChineseChessState | undefined, animateMove: boolean) {
    if (!pieceLayer || !state) return;

    for (const piece of state.pieces) {
      if (piece.captured) continue;
      const model = createPieceModel(piece);
      const targetCoord = { x: piece.x, y: piece.y };
      const startCoord = startCoordForPiece(piece, previousState, animateMove);
      const start = squarePosition(startCoord.x, startCoord.y);
      const target = squarePosition(targetCoord.x, targetCoord.y);
      const isMoving = squareKey(startCoord) !== squareKey(targetCoord);
      model.position.set(start.x, 0.05, start.z);
      model.userData = {
        ...model.userData,
        startX: start.x,
        startZ: start.z,
        targetX: target.x,
        targetZ: target.z,
        moveStartedAt: performance.now(),
        moveDuration: isMoving ? MOVE_ANIMATION_MS : 0,
        moving: isMoving,
        baseY: 0.05,
      };
      model.traverse((object) => {
        object.userData = model.userData;
      });
      pieceLayer.add(model);
      interactiveObjects.push(...model.children);
    }
  }

  function syncDynamicScene(
    nextMovesKey = selectedMovesRenderKey,
    nextSelectedPieceId = selectedPieceId,
  ) {
    if (
      activeState === state &&
      activeSelectedPieceId === nextSelectedPieceId &&
      activeSelectedMovesKey === nextMovesKey
    ) {
      return;
    }

    const previousState = activeState;
    const shouldAnimateMove = Boolean(previousState && previousState !== state);
    activeState = state;
    activeSelectedPieceId = nextSelectedPieceId;
    activeSelectedMovesKey = nextMovesKey;
    interactiveObjects.splice(boardObjects.length);
    clearLayer(pieceLayer);
    clearLayer(highlightLayer);
    addHighlights();
    addPieces(previousState, shouldAnimateMove);
  }

  function updateCamera() {
    if (!camera || !renderer) return;

    const pitchRad = THREE.MathUtils.degToRad(pitch);
    const yawRad = THREE.MathUtils.degToRad(yaw);
    const canvasWidth = renderer.domElement.clientWidth;
    const responsiveDistance =
      canvasWidth < 430
        ? Math.max(distance, 18)
        : camera.aspect < 0.72
          ? Math.max(distance, 15)
          : camera.aspect < 1
            ? Math.max(distance, 13)
            : distance;
    camera.position.set(
      focusX + Math.sin(yawRad) * Math.cos(pitchRad) * responsiveDistance,
      Math.sin(pitchRad) * responsiveDistance,
      focusZ + Math.cos(yawRad) * Math.cos(pitchRad) * responsiveDistance,
    );
    camera.lookAt(focusX, 0, focusZ);
    camera.updateProjectionMatrix();
    renderer.render(scene!, camera);
  }

  function resize() {
    if (!renderer || !camera || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function animate() {
    const now = performance.now();
    const elapsed = (now - startedAt) / 1000;
    if (pieceLayer) {
      for (const child of pieceLayer.children) {
        const selected = Boolean(child.userData.selected);
        const duration = Number(child.userData.moveDuration ?? 0);
        if (duration > 0) {
          const rawProgress = Math.min(
            1,
            (now - Number(child.userData.moveStartedAt ?? now)) / duration,
          );
          const progress = easeOutCubic(rawProgress);
          child.position.x = THREE.MathUtils.lerp(
            Number(child.userData.startX),
            Number(child.userData.targetX),
            progress,
          );
          child.position.z = THREE.MathUtils.lerp(
            Number(child.userData.startZ),
            Number(child.userData.targetZ),
            progress,
          );
          child.userData.moving = rawProgress < 1;
          if (rawProgress >= 1) {
            child.userData.moveDuration = 0;
          }
        }

        const movingLift = child.userData.moving
          ? Math.sin(
              Math.min(
                1,
                (now - Number(child.userData.moveStartedAt ?? now)) /
                  Math.max(1, duration),
              ) * Math.PI,
            ) * 0.24
          : 0;
        child.position.y =
          child.userData.baseY +
          movingLift +
          (selected ? 0.2 : 0) +
          Math.sin(elapsed * 2 + child.position.x) * 0.018;
      }
    }
    updateCamera();
    animationFrame = requestAnimationFrame(animate);
  }

  function verifyCanvasPaint() {
    if (!renderer || renderMode !== 'webgl') {
      return;
    }

    try {
      updateCamera();
      const gl = renderer.getContext();
      const width = renderer.domElement.width;
      const height = renderer.domElement.height;
      if (width <= 1 || height <= 1) {
        renderMode = 'fallback';
        return;
      }

      const pixel = new Uint8Array(4);
      gl.readPixels(
        Math.floor(width / 2),
        Math.floor(height / 2),
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixel,
      );
      if (pixel[3] === 0) {
        renderMode = 'fallback';
      }
    } catch (error) {
      console.warn('Falling back after canvas paint check failed.', error);
      renderMode = 'fallback';
    }
  }

  function initScene() {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    raycaster = new THREE.Raycaster();

    tableGroup = new THREE.Group();
    pieceLayer = new THREE.Group();
    highlightLayer = new THREE.Group();
    scene.add(tableGroup, highlightLayer, pieceLayer);

    const ambient = new THREE.HemisphereLight(0xf8fafc, 0x111827, 2.2);
    scene.add(ambient);
    const keyLight = new THREE.DirectionalLight(0xfff4d2, 2.7);
    keyLight.position.set(4, 7, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x93c5fd, 1.2);
    rimLight.position.set(-5, 4, -4);
    scene.add(rimLight);

    addBoard();
    startedAt = performance.now();
    resize();
    updateCamera();
    syncDynamicScene();
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    animationFrame = requestAnimationFrame(animate);
    globalThis.setTimeout(verifyCanvasPaint, 600);
  }

  function squareFromPointer(event: PointerEvent): { x: number; y: number } | undefined {
    if (!camera || !raycaster || !canvas) return undefined;

    const rect = canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const intersections = raycaster.intersectObjects(interactiveObjects, true);
    for (const hit of intersections) {
      const data = hit.object.userData;
      if (
        Number.isInteger(data.x) &&
        Number.isInteger(data.y) &&
        data.x >= 0 &&
        data.y >= 0
      ) {
        return { x: data.x, y: data.y };
      }
    }

    return undefined;
  }

  function handlePointerDown(event: PointerEvent) {
    isPointerDown = true;
    isPanning = event.button === 2 || event.button === 1 || event.shiftKey;
    didDrag = false;
    pointerStartX = event.clientX;
    pointerStartY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent) {
    if (!isPointerDown) return;
    const dx = event.clientX - pointerStartX;
    const dy = event.clientY - pointerStartY;
    if (Math.abs(dx) + Math.abs(dy) > 5) {
      didDrag = true;
    }
    
    if (isPanning) {
      const yawRad = THREE.MathUtils.degToRad(yaw);
      const rightX = Math.cos(yawRad);
      const rightZ = -Math.sin(yawRad);
      const forwardX = Math.sin(yawRad);
      const forwardZ = Math.cos(yawRad);
      
      const panSpeed = distance * 0.002;
      
      focusX -= (rightX * dx + forwardX * dy) * panSpeed;
      focusZ -= (rightZ * dx + forwardZ * dy) * panSpeed;
    } else {
      yaw += dx * 0.25;
      pitch = Math.max(28, Math.min(72, pitch - dy * 0.18));
    }
    
    pointerStartX = event.clientX;
    pointerStartY = event.clientY;
    updateCamera();
  }

  function handlePointerUp(event: PointerEvent) {
    isPointerDown = false;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }

    if (didDrag) {
      return;
    }

    const square = squareFromPointer(event);
    if (square) {
      onSquare(square.x, square.y);
    }
  }

  function handleWheel(event: WheelEvent) {
    event.preventDefault();
    distance = Math.max(6.4, Math.min(22, distance + (event.deltaY > 0 ? 0.55 : -0.55)));
    updateCamera();
  }

  onMount(() => {
    try {
      initScene();
    } catch (error) {
      console.warn('Falling back to CSS chess board.', error);
      renderMode = 'fallback';
    }
  });

  onDestroy(() => {
    if (animationFrame && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(animationFrame);
    }
    resizeObserver?.disconnect();
    clearLayer(pieceLayer);
    clearLayer(highlightLayer);
    if (tableGroup) {
      disposeObject(tableGroup);
    }
    renderer?.dispose();
  });
</script>

<div class="board-shell" on:wheel={handleWheel}>
  {#if renderMode === 'fallback'}
    <div class="fallback-message">
      WebGL is required for the 3D board. Please select a different piece style or enable WebGL.
    </div>
  {:else}
    <canvas
      bind:this={canvas}
      aria-label="Interactive 3D Chinese chess board"
      on:pointerdown={handlePointerDown}
      on:pointermove={handlePointerMove}
      on:pointerup={handlePointerUp}
      on:pointercancel={handlePointerUp}
      on:contextmenu|preventDefault
    >Interactive 3D Chinese chess board</canvas>
  {/if}
</div>

<style>
  .board-shell {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 360px;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
  }
  
  canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100% !important;
    height: 100% !important;
    outline: none;
  }
  
  .fallback-message {
    display: flex;
    height: 100%;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    text-align: center;
    color: #ef4444;
  }
</style>
