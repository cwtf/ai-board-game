<script lang="ts">
  import type { JunglePlayer, PieceType } from '@/lib/games/jungle-chess/state';

  export let type: PieceType;
  export let owner: JunglePlayer;
  export let selected = false;
  export let label = '';

  $: sideClass = owner === 0 ? 'red-side' : 'blue-side';
</script>

<span
  class={`animal-model ${type} ${sideClass} ${selected ? 'selected' : ''}`}
  role="img"
  aria-label={label}
  title={label}
>
  <span class="animal-base"></span>
  <span class="animal-shadow"></span>
  <span class="animal-body"></span>
  <span class="animal-neck"></span>
  <span class="animal-head">
    <span class="ear ear-left"></span>
    <span class="ear ear-right"></span>
    <span class="mane"></span>
    <span class="face-mark face-mark-a"></span>
    <span class="face-mark face-mark-b"></span>
    <span class="eye eye-left"></span>
    <span class="eye eye-right"></span>
    <span class="muzzle"></span>
    <span class="trunk"></span>
  </span>
  <span class="tail"></span>
  <span class="leg leg-front-left"></span>
  <span class="leg leg-front-right"></span>
  <span class="leg leg-back-left"></span>
  <span class="leg leg-back-right"></span>
  <span class="body-mark mark-a"></span>
  <span class="body-mark mark-b"></span>
  <span class="body-mark mark-c"></span>
</span>

<style>
  .animal-model {
    --fur: #c78b54;
    --fur-dark: #7c4a25;
    --fur-light: #f5d49a;
    --mark: #24180f;
    --base: #7f1d1d;
    --base-edge: #fecaca;
    --scale: 1;
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    min-width: 54px;
    min-height: 54px;
    transform: translateZ(30px) rotateZ(4deg) rotateX(-56deg) scale(var(--scale));
    transform-style: preserve-3d;
    filter: drop-shadow(0 16px 12px rgba(0, 0, 0, 0.34));
    transition:
      filter 180ms ease;
    animation: idleFloat 4s ease-in-out infinite;
  }

  @keyframes idleFloat {
    0%, 100% { transform: translateZ(30px) rotateZ(4deg) rotateX(-56deg) scale(var(--scale)); }
    50% { transform: translateZ(34px) rotateZ(4deg) rotateX(-56deg) scale(var(--scale)); }
  }

  .animal-model.blue-side {
    --base: #075985;
    --base-edge: #bae6fd;
  }

  .animal-model.selected {
    --scale: 1.12;
    animation: selectedFloat 2.5s ease-in-out infinite;
    filter: drop-shadow(0 0 14px rgba(255, 255, 255, 0.65))
      drop-shadow(0 18px 14px rgba(0, 0, 0, 0.42));
  }

  @keyframes selectedFloat {
    0%, 100% { transform: translateZ(48px) rotateZ(4deg) rotateX(-56deg) scale(var(--scale)); }
    50% { transform: translateZ(55px) rotateZ(4deg) rotateX(-56deg) scale(var(--scale)); }
  }

  .animal-base {
    position: absolute;
    left: 9%;
    right: 9%;
    bottom: 7%;
    height: 30%;
    border: 2px solid var(--base-edge);
    border-radius: 50%;
    background:
      radial-gradient(circle at 50% 22%, rgba(255, 255, 255, 0.32), transparent 36%),
      linear-gradient(145deg, color-mix(in srgb, var(--base), white 20%), var(--base));
    box-shadow:
      inset 0 -8px 10px rgba(0, 0, 0, 0.28),
      0 8px 0 color-mix(in srgb, var(--base), black 38%);
    transform: rotateX(58deg) translateZ(-7px);
  }

  .animal-shadow {
    position: absolute;
    left: 20%;
    right: 16%;
    bottom: 12%;
    height: 20%;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.24);
    filter: blur(7px);
    transform: rotateX(64deg) translateZ(-4px);
  }

  .animal-body,
  .animal-head,
  .animal-neck,
  .leg,
  .tail,
  .ear,
  .muzzle,
  .trunk,
  .mane,
  .body-mark,
  .face-mark,
  .eye {
    position: absolute;
    display: block;
  }

  .animal-body {
    left: 24%;
    top: 38%;
    width: 48%;
    height: 30%;
    border-radius: 50% 46% 44% 52%;
    background:
      radial-gradient(circle at 34% 26%, rgba(255, 255, 255, 0.46), transparent 22%),
      linear-gradient(135deg, var(--fur-light), var(--fur) 48%, var(--fur-dark));
    box-shadow:
      inset -9px -11px 12px rgba(0, 0, 0, 0.22),
      inset 7px 6px 10px rgba(255, 255, 255, 0.18);
    transform: translateZ(18px);
  }

  .animal-neck {
    left: 54%;
    top: 31%;
    width: 16%;
    height: 22%;
    border-radius: 45%;
    background: linear-gradient(135deg, var(--fur-light), var(--fur-dark));
    transform: rotate(-24deg) translateZ(19px);
  }

  .animal-head {
    left: 57%;
    top: 21%;
    width: 30%;
    height: 28%;
    border-radius: 48% 52% 44% 48%;
    background:
      radial-gradient(circle at 34% 22%, rgba(255, 255, 255, 0.52), transparent 22%),
      linear-gradient(135deg, var(--fur-light), var(--fur) 52%, var(--fur-dark));
    box-shadow:
      inset -7px -7px 9px rgba(0, 0, 0, 0.2),
      0 7px 8px rgba(0, 0, 0, 0.16);
    transform: translateZ(31px);
  }

  .ear {
    top: -12%;
    width: 28%;
    height: 28%;
    border-radius: 50% 50% 38% 38%;
    background: linear-gradient(135deg, var(--fur-light), var(--fur-dark));
    box-shadow: inset -2px -3px 4px rgba(0, 0, 0, 0.2);
  }

  .ear-left {
    left: 8%;
    transform: rotate(-24deg);
  }

  .ear-right {
    right: 6%;
    transform: rotate(24deg);
  }

  .eye {
    top: 40%;
    width: 7%;
    height: 7%;
    border-radius: 999px;
    background: #111827;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.28);
  }

  .eye-left {
    left: 35%;
  }

  .eye-right {
    right: 24%;
  }

  .muzzle {
    right: 4%;
    bottom: 20%;
    width: 36%;
    height: 30%;
    border-radius: 45%;
    background: color-mix(in srgb, var(--fur-light), white 20%);
    box-shadow: inset -3px -4px 4px rgba(0, 0, 0, 0.12);
  }

  .leg {
    top: 61%;
    width: 10%;
    height: 24%;
    border-radius: 999px 999px 42% 42%;
    background: linear-gradient(180deg, var(--fur), var(--fur-dark));
    transform: translateZ(13px);
  }

  .leg-front-left {
    left: 58%;
  }

  .leg-front-right {
    left: 67%;
    top: 58%;
  }

  .leg-back-left {
    left: 29%;
  }

  .leg-back-right {
    left: 39%;
    top: 59%;
  }

  .tail {
    left: 12%;
    top: 42%;
    width: 30%;
    height: 8%;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--fur-dark), var(--fur));
    transform: rotate(-28deg) translateZ(20px);
    transform-origin: right center;
  }

  .body-mark,
  .face-mark {
    background: var(--mark);
    opacity: 0;
  }

  .mark-a {
    left: 35%;
    top: 43%;
    width: 8%;
    height: 24%;
    border-radius: 999px;
    transform: rotate(18deg) translateZ(22px);
  }

  .mark-b {
    left: 48%;
    top: 41%;
    width: 7%;
    height: 25%;
    border-radius: 999px;
    transform: rotate(14deg) translateZ(22px);
  }

  .mark-c {
    left: 61%;
    top: 43%;
    width: 7%;
    height: 22%;
    border-radius: 999px;
    transform: rotate(16deg) translateZ(22px);
  }

  .face-mark-a {
    left: 46%;
    top: 12%;
    width: 7%;
    height: 30%;
    border-radius: 999px;
    transform: rotate(18deg);
  }

  .face-mark-b {
    right: 29%;
    top: 12%;
    width: 7%;
    height: 30%;
    border-radius: 999px;
    transform: rotate(-18deg);
  }

  .trunk,
  .mane {
    opacity: 0;
  }

  .rat {
    --fur: #8b8580;
    --fur-dark: #504b49;
    --fur-light: #d8d0c7;
  }

  .rat .animal-body {
    left: 27%;
    top: 47%;
    width: 42%;
    height: 22%;
  }

  .rat .animal-head {
    left: 59%;
    top: 36%;
    width: 25%;
    height: 20%;
  }

  .rat .ear {
    width: 32%;
    height: 34%;
    border-radius: 999px;
  }

  .rat .tail {
    left: 2%;
    top: 53%;
    width: 38%;
    height: 5%;
    background: linear-gradient(90deg, #c7a5a1, var(--fur-dark));
  }

  .rat .leg {
    height: 14%;
    top: 65%;
  }

  .cat {
    --fur: #d6a37d;
    --fur-dark: #7c4d35;
    --fur-light: #f5d8bc;
  }

  .cat .ear {
    border-radius: 20% 70% 30% 70%;
  }

  .dog {
    --fur: #b87943;
    --fur-dark: #5d341b;
    --fur-light: #f0c58e;
  }

  .dog .ear {
    top: 2%;
    height: 38%;
    border-radius: 65% 65% 80% 80%;
  }

  .dog .ear-left {
    left: 2%;
    transform: rotate(-48deg);
  }

  .dog .ear-right {
    right: 0;
    transform: rotate(42deg);
  }

  .wolf {
    --fur: #8f9aa6;
    --fur-dark: #39424e;
    --fur-light: #e1e7ec;
  }

  .wolf .animal-head {
    border-radius: 42% 58% 38% 46%;
  }

  .wolf .ear {
    border-radius: 14% 70% 20% 76%;
  }

  .leopard {
    --fur: #d6a044;
    --fur-dark: #7b4614;
    --fur-light: #f8d88c;
    --mark: #2f1a0b;
  }

  .leopard .body-mark,
  .leopard .face-mark {
    opacity: 1;
    border-radius: 999px;
    width: 9%;
    height: 9%;
  }

  .leopard .mark-a {
    left: 35%;
    top: 45%;
  }

  .leopard .mark-b {
    left: 49%;
    top: 52%;
  }

  .leopard .mark-c {
    left: 61%;
    top: 43%;
  }

  .tiger {
    --fur: #f59e0b;
    --fur-dark: #7c2d12;
    --fur-light: #fde68a;
    --mark: #1f1309;
  }

  .tiger .body-mark,
  .tiger .face-mark {
    opacity: 1;
  }

  .lion {
    --fur: #d39a42;
    --fur-dark: #704214;
    --fur-light: #f7d58a;
    --mark: #8b3f16;
  }

  .lion .mane {
    opacity: 1;
    left: -14%;
    top: -16%;
    width: 62%;
    height: 68%;
    border-radius: 52% 40% 54% 42%;
    background:
      radial-gradient(circle at 44% 38%, transparent 30%, var(--mark) 31% 61%, transparent 62%),
      linear-gradient(135deg, #a14a18, #5c2f12);
    transform: translateZ(-1px);
  }

  .lion .animal-head {
    width: 32%;
    height: 31%;
  }

  .lion .tail::after {
    content: '';
    position: absolute;
    left: -12%;
    top: -70%;
    width: 24%;
    height: 190%;
    border-radius: 999px;
    background: var(--mark);
  }

  .elephant {
    --fur: #95a3ad;
    --fur-dark: #475569;
    --fur-light: #d7e0e6;
  }

  .elephant .animal-body {
    left: 19%;
    top: 38%;
    width: 54%;
    height: 34%;
  }

  .elephant .animal-head {
    left: 58%;
    top: 25%;
    width: 33%;
    height: 31%;
    border-radius: 45% 48% 52% 46%;
  }

  .elephant .ear {
    top: 18%;
    width: 36%;
    height: 54%;
    border-radius: 62% 38% 64% 46%;
    background: linear-gradient(135deg, var(--fur-light), var(--fur));
  }

  .elephant .ear-left {
    left: -10%;
    transform: rotate(-22deg);
  }

  .elephant .ear-right {
    right: -10%;
    transform: rotate(24deg);
  }

  .elephant .muzzle {
    display: none;
  }

  .elephant .trunk {
    opacity: 1;
    right: -5%;
    bottom: -34%;
    width: 22%;
    height: 58%;
    border-radius: 999px;
    background: linear-gradient(180deg, var(--fur), var(--fur-dark));
    transform: rotate(-10deg);
    box-shadow: inset -3px -4px 4px rgba(0, 0, 0, 0.18);
  }
</style>
