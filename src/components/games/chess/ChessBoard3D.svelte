<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import * as THREE from 'three';
  import {
    BOARD_SIZE,
    coordinateLabel,
    pieceGlyph,
    type ChessMove,
    type ChessPiece,
    type ChessState,
    type Coord,
    type PieceType,
  } from '@/lib/games/chess/state';

  export let state: ChessState;
  export let selectedPieceId = '';
  export let selectedMoves: ChessMove[] = [];
  export let cameraView: 'default' | 'top' | 'isometric' | 'front' = 'default';
  export let cameraZoom: number = 1;
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
  let distance = 13.8;
  let focusX = 0;
  let focusZ = 0;
  let activeState: ChessState | undefined;
  let activeSelectedPieceId = '';
  let activeSelectedMovesKey = '';
  let selectedMovesRenderKey = '';
  let startedAt = 0;
  let renderMode: 'webgl' | 'fallback' = 'webgl';

  const boardObjects: THREE.Object3D[] = [];
  const interactiveObjects: THREE.Object3D[] = [];
  const boardIndexes = [...Array(BOARD_SIZE).keys()];
  const MOVE_ANIMATION_MS = 420;

  $: selectedMovesRenderKey = selectedMoves
    .map((move) => `${move.to.x},${move.to.y},${move.promotion ?? ''}`)
    .sort()
    .join('|');

  $: if (scene && state) {
    syncDynamicScene(selectedMovesRenderKey, selectedPieceId);
  }

  function squarePosition(x: number, y: number): THREE.Vector3 {
    return new THREE.Vector3(x - (BOARD_SIZE - 1) / 2, 0, y - (BOARD_SIZE - 1) / 2);
  }

  function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  function squareKey(coord: Coord): string {
    return `${coord.x},${coord.y}`;
  }

  function targetPieceTypeForMove(move: ChessMove): PieceType {
    return move.promotion ?? move.piece;
  }

  function castlingRookMotion(
    piece: ChessPiece,
    move: ChessMove | undefined,
  ): { from: Coord; to: Coord } | undefined {
    if (!move?.isCastle || piece.type !== 'rook' || piece.owner !== move.owner) {
      return undefined;
    }

    const y = move.from.y;
    const kingside = move.to.x > move.from.x;
    const from = { x: kingside ? 7 : 0, y };
    const to = { x: kingside ? 5 : 3, y };
    return piece.x === to.x && piece.y === to.y ? { from, to } : undefined;
  }

  function startCoordForPiece(
    piece: ChessPiece,
    previousState: ChessState | undefined,
    animateMove: boolean,
  ): Coord {
    const current = { x: piece.x, y: piece.y };
    if (!animateMove || !previousState || !state.lastMove) {
      return current;
    }

    const movedType = targetPieceTypeForMove(state.lastMove);
    if (
      piece.owner === state.lastMove.owner &&
      piece.type === movedType &&
      squareKey(current) === squareKey(state.lastMove.to)
    ) {
      return state.lastMove.from;
    }

    const rookMotion = castlingRookMotion(piece, state.lastMove);
    if (rookMotion) {
      return rookMotion.from;
    }

    return current;
  }

  function targetHasCapture(x: number, y: number): boolean {
    return selectedMoves.some(
      (move) => move.to.x === x && move.to.y === y && move.isCapture,
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

  function pieceMaterials(piece: ChessPiece) {
    const white = piece.owner === 0;
    return {
      body: material({
        color: white ? 0xf6ead3 : 0x2b3141,
        roughness: 0.42,
        metalness: 0.08,
      }),
      trim: material({
        color: white ? 0xc9a15e : 0x94a3b8,
        roughness: 0.34,
        metalness: 0.38,
      }),
      dark: material({
        color: white ? 0x9b6a31 : 0x111827,
        roughness: 0.62,
        metalness: 0.1,
      }),
      accent: material({
        color: white ? 0xffffff : 0x64748b,
        roughness: 0.35,
        metalness: 0.2,
      }),
    };
  }

  function addBase(group: THREE.Group, mats: ReturnType<typeof pieceMaterials>) {
    addMesh(group, new THREE.CylinderGeometry(0.72, 0.82, 0.18, 40), mats.dark, [0, 0.09, 0]);
    addMesh(group, new THREE.CylinderGeometry(0.62, 0.7, 0.16, 40), mats.trim, [0, 0.26, 0]);
    addMesh(group, new THREE.CylinderGeometry(0.46, 0.55, 0.22, 40), mats.body, [0, 0.45, 0]);
  }

  function addPawn(group: THREE.Group, mats: ReturnType<typeof pieceMaterials>) {
    addMesh(group, new THREE.CylinderGeometry(0.22, 0.3, 0.38, 32), mats.body, [0, 0.75, 0]);
    addMesh(group, new THREE.SphereGeometry(0.34, 32, 20), mats.body, [0, 1.08, 0]);
    addMesh(group, new THREE.TorusGeometry(0.25, 0.045, 12, 32), mats.trim, [0, 0.86, 0], [Math.PI / 2, 0, 0]);
  }

  function addRook(group: THREE.Group, mats: ReturnType<typeof pieceMaterials>) {
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

  function addKnight(group: THREE.Group, mats: ReturnType<typeof pieceMaterials>) {
    addMesh(group, new THREE.CylinderGeometry(0.24, 0.34, 0.52, 28), mats.body, [0, 0.76, 0]);
    addMesh(group, new THREE.BoxGeometry(0.38, 0.62, 0.32), mats.body, [0.05, 1.18, 0], [0, 0, -0.28]);
    addMesh(group, new THREE.BoxGeometry(0.34, 0.2, 0.28), mats.body, [0.25, 1.34, 0], [0, 0, 0.08]);
    addMesh(group, new THREE.ConeGeometry(0.09, 0.3, 4), mats.trim, [-0.05, 1.58, 0.08], [0.15, 0.35, 0.1]);
    addMesh(group, new THREE.ConeGeometry(0.09, 0.28, 4), mats.trim, [0.08, 1.58, -0.08], [-0.15, -0.35, -0.1]);
  }

  function addBishop(group: THREE.Group, mats: ReturnType<typeof pieceMaterials>) {
    addMesh(group, new THREE.CylinderGeometry(0.22, 0.34, 0.32, 32), mats.body, [0, 0.72, 0]);
    addMesh(group, new THREE.SphereGeometry(0.36, 32, 20), mats.body, [0, 1.08, 0], [0, 0, 0], [0.88, 1.22, 0.88]);
    addMesh(group, new THREE.BoxGeometry(0.08, 0.58, 0.06), mats.dark, [0.12, 1.16, 0.34], [0, 0, -0.62]);
    addMesh(group, new THREE.SphereGeometry(0.11, 20, 12), mats.trim, [0, 1.56, 0]);
  }

  function addQueen(group: THREE.Group, mats: ReturnType<typeof pieceMaterials>) {
    addMesh(group, new THREE.CylinderGeometry(0.28, 0.42, 0.54, 36), mats.body, [0, 0.88, 0]);
    addMesh(group, new THREE.CylinderGeometry(0.48, 0.38, 0.14, 36), mats.trim, [0, 1.2, 0]);
    for (let i = 0; i < 6; i += 1) {
      const angle = (Math.PI * 2 * i) / 6;
      addMesh(
        group,
        new THREE.SphereGeometry(0.105, 16, 10),
        mats.trim,
        [Math.cos(angle) * 0.36, 1.48, Math.sin(angle) * 0.36],
      );
    }
    addMesh(group, new THREE.SphereGeometry(0.14, 18, 12), mats.accent, [0, 1.58, 0]);
  }

  function addKing(group: THREE.Group, mats: ReturnType<typeof pieceMaterials>) {
    addMesh(group, new THREE.CylinderGeometry(0.3, 0.44, 0.64, 36), mats.body, [0, 0.92, 0]);
    addMesh(group, new THREE.CylinderGeometry(0.44, 0.36, 0.12, 36), mats.trim, [0, 1.3, 0]);
    addMesh(group, new THREE.BoxGeometry(0.14, 0.48, 0.12), mats.trim, [0, 1.58, 0]);
    addMesh(group, new THREE.BoxGeometry(0.42, 0.12, 0.12), mats.trim, [0, 1.66, 0]);
  }

  function createPieceModel(piece: ChessPiece): THREE.Group {
    const group = new THREE.Group();
    const mats = pieceMaterials(piece);
    addBase(group, mats);

    const builders: Record<PieceType, () => void> = {
      pawn: () => addPawn(group, mats),
      knight: () => addKnight(group, mats),
      bishop: () => addBishop(group, mats),
      rook: () => addRook(group, mats),
      queen: () => addQueen(group, mats),
      king: () => addKing(group, mats),
    };
    builders[piece.type]();

    group.scale.setScalar(0.46);
    group.rotation.y = piece.owner === 0 ? Math.PI : 0;
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

    const lightSquare = material({ color: 0xd8b46f, roughness: 0.72 });
    const darkSquare = material({ color: 0x6d765f, roughness: 0.75 });
    const edge = material({ color: 0x2b2118, roughness: 0.68 });

    addMesh(tableGroup, new THREE.BoxGeometry(8.65, 0.28, 8.65), edge, [0, -0.16, 0]);

    for (let y = 0; y < BOARD_SIZE; y += 1) {
      for (let x = 0; x < BOARD_SIZE; x += 1) {
        const square = new THREE.Mesh(
          new THREE.BoxGeometry(0.98, 0.11, 0.98),
          (x + y) % 2 === 0 ? lightSquare : darkSquare,
        );
        const position = squarePosition(x, y);
        square.position.set(position.x, 0, position.z);
        square.userData = { x, y, square: coordinateLabel(x, y) };
        square.receiveShadow = true;
        tableGroup.add(square);
        boardObjects.push(square);
        interactiveObjects.push(square);
      }
    }

    const frameMat = material({ color: 0x17120d, roughness: 0.48, metalness: 0.16 });
    addMesh(tableGroup, new THREE.BoxGeometry(8.9, 0.32, 0.16), frameMat, [0, 0.03, -4.46]);
    addMesh(tableGroup, new THREE.BoxGeometry(8.9, 0.32, 0.16), frameMat, [0, 0.03, 4.46]);
    addMesh(tableGroup, new THREE.BoxGeometry(0.16, 0.32, 8.9), frameMat, [-4.46, 0.03, 0]);
    addMesh(tableGroup, new THREE.BoxGeometry(0.16, 0.32, 8.9), frameMat, [4.46, 0.03, 0]);
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
      color: 0x60a5fa,
      emissive: 0x173d72,
      transparent: true,
      opacity: 0.42,
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
        addMesh(highlightLayer, new THREE.BoxGeometry(0.9, 0.035, 0.9), lastMoveMat, [pos.x, 0.09, pos.z]);
      }
    }

    const selectedPiece = state.pieces.find((piece) => piece.id === selectedPieceId);
    if (selectedPiece) {
      const pos = squarePosition(selectedPiece.x, selectedPiece.y);
      addMesh(highlightLayer, new THREE.BoxGeometry(0.88, 0.045, 0.88), selectedMat, [pos.x, 0.12, pos.z]);
    }

    const targetSquares = new Map<string, ChessMove>();
    for (const move of selectedMoves) {
      targetSquares.set(squareKey(move.to), move);
    }

    for (const move of targetSquares.values()) {
      const pos = squarePosition(move.to.x, move.to.y);
      addMesh(
        highlightLayer,
        new THREE.BoxGeometry(0.9, 0.035, 0.9),
        targetSquareMat,
        [pos.x, 0.18, pos.z],
      );
      const halo = addMesh(
        highlightLayer,
        new THREE.TorusGeometry(0.37, 0.045, 12, 44),
        targetHaloMat,
        [pos.x, 0.28, pos.z],
        [Math.PI / 2, 0, 0],
      );
      halo.userData = { x: move.to.x, y: move.to.y };
      interactiveObjects.push(halo);

      const target = addMesh(
        highlightLayer,
        new THREE.CylinderGeometry(0.18, 0.24, 0.34, 32),
        targetMat,
        [pos.x, 0.39, pos.z],
      );
      target.userData = { x: move.to.x, y: move.to.y };
      interactiveObjects.push(target);

      if (targetHasCapture(move.to.x, move.to.y)) {
        const ring = addMesh(
          highlightLayer,
          new THREE.TorusGeometry(0.43, 0.045, 12, 42),
          captureMat,
          [pos.x, 0.22, pos.z],
          [Math.PI / 2, 0, 0],
        );
        ring.userData = { x: move.to.x, y: move.to.y };
        interactiveObjects.push(ring);
      }
    }
  }

  function addPieces(previousState: ChessState | undefined, animateMove: boolean) {
    if (!pieceLayer || !state) return;

    for (const piece of state.pieces) {
      const model = createPieceModel(piece);
      const targetCoord = { x: piece.x, y: piece.y };
      const startCoord = startCoordForPiece(piece, previousState, animateMove);
      const start = squarePosition(startCoord.x, startCoord.y);
      const target = squarePosition(targetCoord.x, targetCoord.y);
      const isMoving = squareKey(startCoord) !== squareKey(targetCoord);
      model.position.set(start.x, 0.16, start.z);
      model.userData = {
        ...model.userData,
        startX: start.x,
        startZ: start.z,
        targetX: target.x,
        targetZ: target.z,
        moveStartedAt: performance.now(),
        moveDuration: isMoving ? MOVE_ANIMATION_MS : 0,
        moving: isMoving,
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
        ? Math.max(distance, 16)
        : camera.aspect < 0.72
          ? Math.max(distance, 13)
          : camera.aspect < 1
            ? Math.max(distance, 11.2)
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
    camera.zoom = cameraZoom;
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

  $: if (camera) {
    camera.zoom = cameraZoom;
    camera.updateProjectionMatrix();
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
    scene.background = new THREE.Color(0x050505);

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
    if (renderMode === 'fallback') return;
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.25 : 0.25;
    cameraZoom = Math.max(0.25, Math.min(2, cameraZoom + delta));
  }

  onMount(() => {
    if (canvas.getBoundingClientRect().width < 430) {
      renderMode = 'fallback';
      return;
    }

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

  $: setCameraPreset(cameraView);

  function setCameraPreset(preset: 'default' | 'top' | 'isometric' | 'front') {
    if (preset === 'top') {
      yaw = 0;
      pitch = 85;
      distance = 12;
    } else if (preset === 'isometric') {
      yaw = 45;
      pitch = 45;
      distance = 14;
    } else if (preset === 'front') {
      yaw = 0;
      pitch = 30;
      distance = 15;
    } else {
      yaw = -32;
      pitch = 54;
      distance = 13.8;
    }
    focusX = 0;
    focusZ = 0;
    updateCamera();
  }
</script>

<div class="board-shell" on:wheel={handleWheel}>
  {#if renderMode === 'fallback'}
    <div class="fallback-board" aria-label="Interactive chess board">
      {#each boardIndexes as y (y)}
        {#each boardIndexes as x (x)}
          {@const piece = state?.pieces.find((item) => item.x === x && item.y === y)}
          {@const target = selectedMoves.some((move) => move.to.x === x && move.to.y === y)}
          {@const captureTarget = targetHasCapture(x, y)}
          {@const selected = piece?.id === selectedPieceId}
          <button
            class={`fallback-square ${(x + y) % 2 === 0 ? 'light' : 'dark'} ${target ? 'target' : ''} ${captureTarget ? 'capture-target' : ''} ${selected ? 'selected-square' : ''}`}
            type="button"
            aria-label={coordinateLabel(x, y)}
            on:click={() => onSquare(x, y)}
          >
            {#if target}
              <span class="fallback-target"></span>
            {/if}
            {#if piece}
              <span
                class={`fallback-piece ${piece.owner === 0 ? 'white' : 'black'} ${selected ? 'selected' : ''}`}
              >
                {pieceGlyph(piece)}
              </span>
            {/if}
          </button>
        {/each}
      {/each}
    </div>
  {:else}
    <canvas
      bind:this={canvas}
      aria-label="Interactive 3D chess board"
      on:pointerdown={handlePointerDown}
      on:pointermove={handlePointerMove}
      on:pointerup={handlePointerUp}
      on:pointercancel={handlePointerUp}
      on:contextmenu|preventDefault
    >Interactive 3D chess board</canvas>
  {/if}
</div>

<style>
  .board-shell {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 360px;
    min-width: 0;
    overflow: hidden;
    border-radius: 8px;
    background:
      radial-gradient(circle at 50% 18%, rgba(52, 211, 153, 0.12), transparent 30%),
      linear-gradient(180deg, #0f172a, #050505 76%);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 34px 70px rgba(0, 0, 0, 0.55);
    cursor: grab;
  }

  .board-shell:active {
    cursor: grabbing;
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
  }

  .fallback-board {
    position: absolute;
    left: 50%;
    top: 50%;
    display: grid;
    width: min(78%, 620px);
    aspect-ratio: 1;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    border: 8px solid #17120d;
    border-radius: 8px;
    box-shadow:
      0 26px 52px rgba(0, 0, 0, 0.55),
      inset 0 0 0 1px rgba(255, 255, 255, 0.06);
    transform: translate(-50%, -50%) rotateX(58deg) rotateZ(-5deg);
    transform-style: preserve-3d;
  }

  .fallback-square {
    position: relative;
    min-width: 0;
    border: 0;
    padding: 0;
    transform-style: preserve-3d;
  }

  .fallback-square.light {
    background: #d8b46f;
  }

  .fallback-square.dark {
    background: #6d765f;
  }

  .fallback-square.target {
    box-shadow: inset 0 0 0 4px rgba(52, 211, 153, 0.72);
  }

  .fallback-square.selected-square {
    box-shadow: inset 0 0 0 4px rgba(248, 215, 126, 0.78);
  }

  .fallback-square.capture-target {
    box-shadow: inset 0 0 0 4px rgba(249, 115, 22, 0.76);
  }

  .fallback-target {
    position: absolute;
    inset: 32%;
    border-radius: 999px;
    background: rgba(52, 211, 153, 0.72);
    transform: translateZ(18px);
  }

  .fallback-square.capture-target .fallback-target {
    inset: 20%;
    border: 3px solid rgba(249, 115, 22, 0.82);
    background: transparent;
  }

  .fallback-piece {
    position: absolute;
    left: 50%;
    top: 50%;
    display: grid;
    width: 74%;
    aspect-ratio: 1;
    place-items: center;
    border-radius: 999px;
    border: 3px solid var(--piece-ring);
    background:
      radial-gradient(circle at 35% 26%, rgba(255, 255, 255, 0.46), transparent 35%),
      var(--piece-body);
    box-shadow:
      0 10px 0 var(--piece-side),
      0 18px 18px rgba(0, 0, 0, 0.32),
      inset 0 -5px 10px rgba(0, 0, 0, 0.18);
    color: var(--piece-text);
    font-size: clamp(1.4rem, 4.6vw, 2.5rem);
    font-weight: 900;
    line-height: 1;
    transform: translate(-50%, -50%) translateZ(36px) rotateZ(5deg);
    transition:
      box-shadow 160ms ease,
      transform 160ms ease;
  }

  .fallback-piece.white {
    --piece-body: #f6ead3;
    --piece-ring: #c9a15e;
    --piece-side: #9b6a31;
    --piece-text: #4a3217;
  }

  .fallback-piece.black {
    --piece-body: #2b3141;
    --piece-ring: #94a3b8;
    --piece-side: #111827;
    --piece-text: #f8fafc;
  }

  .fallback-piece.selected {
    transform: translate(-50%, -58%) translateZ(58px) rotateZ(5deg);
    box-shadow:
      0 14px 0 var(--piece-side),
      0 0 26px rgba(251, 191, 36, 0.52),
      0 24px 22px rgba(0, 0, 0, 0.38),
      inset 0 -5px 10px rgba(0, 0, 0, 0.18);
  }

  @media (max-width: 900px) {
    .board-shell {
      min-height: 340px;
    }
  }
</style>
