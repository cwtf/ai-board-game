<script lang="ts">
  import type { ChineseChessPlayer, PieceType } from '@/lib/games/chinese-chess/state';

  export let type: PieceType;
  export let owner: ChineseChessPlayer;
  export let selected = false;
  export let label = '';

  const pieceChars: Record<PieceType, { red: string; black: string }> = {
    general: { red: '帥', black: '將' },
    advisor: { red: '仕', black: '士' },
    elephant: { red: '相', black: '象' },
    horse: { red: '傌', black: '馬' },
    chariot: { red: '俥', black: '車' },
    cannon: { red: '炮', black: '砲' },
    soldier: { red: '兵', black: '卒' },
  };

  $: char = owner === 0 ? pieceChars[type].red : pieceChars[type].black;
  $: sideClass = owner === 0 ? 'red-side' : 'black-side';
</script>

<span
  class={`piece-token ${sideClass} ${selected ? 'selected' : ''}`}
  role="img"
  aria-label={label}
  title={label}
>
  <span class="piece-shadow"></span>
  <span class="piece-wall"></span>
  <span class="piece-body">
    <span class="piece-char">{char}</span>
  </span>
</span>

<style>
  .piece-token {
    --base: #991b1b;
    --base-dark: #681010;
    --base-edge: #b91c1c;
    --face-ring: #fecaca;
    --body: #fff7f0;
    --text: #7f1d1d;
    --scale: 1;
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    min-width: 44px;
    min-height: 44px;
    transform: translateZ(6px) scale(var(--scale));
    filter: drop-shadow(0 10px 7px rgba(0, 0, 0, 0.32));
    transition:
      filter 180ms ease;
    animation: idleFloat 4s ease-in-out infinite;
  }

  @keyframes idleFloat {
    0%, 100% { transform: translateZ(6px) scale(var(--scale)); }
    50% { transform: translateZ(9px) scale(var(--scale)); }
  }

  .piece-token.black-side {
    --base: #1f2937;
    --base-dark: #111827;
    --base-edge: #374151;
    --face-ring: #d1d5db;
    --body: #f8fafc;
    --text: #111827;
  }

  .piece-token.selected {
    --scale: 1.08;
    animation: selectedFloat 2.5s ease-in-out infinite;
    filter: drop-shadow(0 0 14px rgba(255, 255, 255, 0.65))
      drop-shadow(0 20px 14px rgba(0, 0, 0, 0.42));
  }

  @keyframes selectedFloat {
    0%, 100% { transform: translateZ(20px) scale(var(--scale)); }
    50% { transform: translateZ(26px) scale(var(--scale)); }
  }

  .piece-shadow {
    position: absolute;
    inset: 22% 9% 8%;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.28);
    filter: blur(9px);
    transform: translateY(10%);
  }

  .piece-wall {
    position: absolute;
    inset: 12% 6% 4%;
    border-radius: 50%;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--base), white 12%) 0%,
      var(--base) 42%,
      var(--base-dark) 100%
    );
    box-shadow:
      inset 0 3px 5px rgba(255, 255, 255, 0.18),
      inset 0 -8px 10px rgba(0, 0, 0, 0.26),
      0 8px 10px rgba(0, 0, 0, 0.28);
  }

  .piece-body {
    position: absolute;
    inset: 5% 7% 19%;
    border-radius: 50%;
    background:
      radial-gradient(ellipse at 36% 25%, rgba(255, 255, 255, 0.72), transparent 34%),
      radial-gradient(ellipse at 50% 86%, color-mix(in srgb, var(--body), black 10%), transparent 60%),
      var(--body);
    box-shadow:
      inset 0 -4px 8px rgba(0, 0, 0, 0.14),
      inset 0 4px 7px rgba(255, 255, 255, 0.3),
      0 2px 0 color-mix(in srgb, var(--base), black 10%);
    border: 4px solid var(--face-ring);
    display: grid;
    place-items: center;
  }

  .piece-body::after {
    content: '';
    position: absolute;
    inset: 10%;
    border-radius: 50%;
    border: 2px solid color-mix(in srgb, var(--text), transparent 66%);
    pointer-events: none;
  }

  .piece-char {
    position: relative;
    z-index: 1;
    font-size: 1.5rem;
    font-weight: 900;
    line-height: 1;
    color: var(--text);
    font-family:
      "Noto Serif SC",
      "Songti SC",
      "STSong",
      "SimSun",
      serif;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
    user-select: none;
  }
</style>
