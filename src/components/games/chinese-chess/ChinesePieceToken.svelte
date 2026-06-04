<script lang="ts">
  import { pieceLabels, type ChineseChessPlayer, type PieceType } from '@/lib/games/chinese-chess/state';

  export let type: PieceType;
  export let owner: ChineseChessPlayer;
  export let selected = false;
  export let label = '';
  export let pieceStyle: 'zh' | 'emoji' = 'zh';

  $: char = pieceStyle === 'emoji' 
    ? pieceLabels[type].emoji 
    : (owner === 0 ? pieceLabels[type].zhRed : pieceLabels[type].zhBlack);
  $: sideClass = owner === 0 ? 'red-side' : 'black-side';
</script>

<span
  class={`piece-token ${sideClass} ${selected ? 'selected' : ''}`}
  role="img"
  aria-label={label}
  title={label}
>
  <span class="piece-shadow"></span>
  {#each Array(8) as _, i}
    <span class="piece-layer" style="transform: translateZ({i * 1.5}px);"></span>
  {/each}
  <span class="piece-top" style="transform: translateZ(12px);">
    <span class="piece-char">{char}</span>
  </span>
</span>

<style>
  .piece-token {
    --base: #991b1b;
    --base-dark: #681010;
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
    transform-style: preserve-3d;
    transform: translateZ(2px) scale(var(--scale));
    animation: idleFloat 4s ease-in-out infinite;
  }

  @keyframes idleFloat {
    0%, 100% { transform: translateZ(2px) scale(var(--scale)); }
    50% { transform: translateZ(6px) scale(var(--scale)); }
  }

  .piece-token.black-side {
    --base: #1f2937;
    --base-dark: #111827;
    --face-ring: #d1d5db;
    --body: #f8fafc;
    --text: #111827;
  }

  .piece-token.selected {
    --scale: 1.1;
    animation: selectedFloat 2.5s ease-in-out infinite;
  }

  @keyframes selectedFloat {
    0%, 100% { transform: translateZ(18px) scale(var(--scale)); }
    50% { transform: translateZ(24px) scale(var(--scale)); }
  }

  .piece-shadow, .piece-layer, .piece-top {
    position: absolute;
    inset: 0;
    border-radius: 50%;
  }

  .piece-shadow {
    background: rgba(0, 0, 0, 0.5);
    filter: blur(8px);
    transform: translateZ(-4px);
    transition: filter 0.3s, transform 0.3s;
  }

  .piece-token.selected .piece-shadow {
    filter: blur(14px);
    transform: translateZ(-16px);
    background: rgba(0, 0, 0, 0.4);
  }

  .piece-layer {
    background: var(--base-dark);
    box-shadow: inset 0 0 10px rgba(0,0,0,0.6);
  }

  .piece-top {
    background:
      radial-gradient(ellipse at 30% 30%, rgba(255, 255, 255, 0.3), transparent 60%),
      var(--body);
    box-shadow: inset 0 -3px 8px rgba(0, 0, 0, 0.15), inset 0 3px 8px rgba(255, 255, 255, 0.5);
    border: 3px solid var(--face-ring);
    display: grid;
    place-items: center;
  }

  .piece-top::after {
    content: '';
    position: absolute;
    inset: 4px;
    border-radius: 50%;
    border: 1px solid color-mix(in srgb, var(--text), transparent 60%);
    pointer-events: none;
  }

  .piece-char {
    position: relative;
    z-index: 1;
    font-size: 1.6rem;
    font-weight: 900;
    line-height: 1;
    color: var(--text);
    font-family:
      "Noto Serif SC",
      "Songti SC",
      "STSong",
      "SimSun",
      serif;
    text-shadow: 0 1px 1px rgba(255, 255, 255, 0.4);
    user-select: none;
    /* Optional: rotate character so it always faces upward regardless of the board's Z rotation */
    transform: rotateZ(4deg);
  }
</style>
