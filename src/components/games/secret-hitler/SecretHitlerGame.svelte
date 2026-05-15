<script lang="ts">
  import { createRng } from '@/lib/games/shared/rng';

  type Party = 'liberal' | 'fascist';
  type Role = 'liberal' | 'fascist' | 'hitler';
  type Policy = Party;

  interface Player {
    id: number;
    name: string;
    role: Role;
  }

  const roleCounts: Record<number, { liberals: number; fascists: number }> = {
    5: { liberals: 3, fascists: 1 },
    6: { liberals: 4, fascists: 1 },
    7: { liberals: 4, fascists: 2 },
    8: { liberals: 5, fascists: 2 },
    9: { liberals: 5, fascists: 3 },
    10: { liberals: 6, fascists: 3 },
  };
  const liberalPowers = ['No power', 'No power', 'No power', 'No power', 'Win'];
  const fascistPowers = [
    'No power',
    'No power',
    'Policy peek',
    'Execution',
    'Execution',
    'Win',
  ];

  let playerCount = 5;
  let seed = 'secret-table';
  let players: Player[] = [];
  let president = 0;
  let chancellor: number | null = null;
  let electionTracker = 0;
  let liberalPolicies = 0;
  let fascistPolicies = 0;
  let drawPile: Policy[] = [];
  let discardPile: Policy[] = [];
  let hand: Policy[] = [];
  let revealRoles = false;
  let message = '';

  $: presidentName = players[president]?.name ?? 'Player 1';
  $: chancellorName =
    chancellor === null ? 'Not nominated' : (players[chancellor]?.name ?? '');
  $: terminal =
    liberalPolicies >= 5 ||
    fascistPolicies >= 6 ||
    (fascistPolicies >= 3 && players[chancellor ?? -1]?.role === 'hitler');
  $: winner =
    liberalPolicies >= 5
      ? 'Liberals win by passing five policies.'
      : fascistPolicies >= 6
        ? 'Fascists win by passing six policies.'
        : fascistPolicies >= 3 && players[chancellor ?? -1]?.role === 'hitler'
          ? 'Fascists win by electing Hitler Chancellor.'
          : '';

  function shuffle<T>(items: T[], salt: string): T[] {
    const rng = createRng(`${seed}:${salt}`);
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = rng.int(index + 1);
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  function rolesFor(count: number): Role[] {
    const counts = roleCounts[count];
    return shuffle(
      [
        ...Array.from({ length: counts.liberals }, () => 'liberal' as const),
        ...Array.from({ length: counts.fascists }, () => 'fascist' as const),
        'hitler' as const,
      ],
      'roles',
    );
  }

  function policiesForDeck(): Policy[] {
    return shuffle(
      [
        ...Array.from({ length: 6 }, () => 'liberal' as const),
        ...Array.from({ length: 11 }, () => 'fascist' as const),
      ],
      `policies:${liberalPolicies}:${fascistPolicies}:${discardPile.length}`,
    );
  }

  function startGame() {
    const roles = rolesFor(playerCount);
    players = roles.map((role, index) => ({
      id: index,
      name: `Player ${index + 1}`,
      role,
    }));
    president = 0;
    chancellor = null;
    electionTracker = 0;
    liberalPolicies = 0;
    fascistPolicies = 0;
    drawPile = policiesForDeck();
    discardPile = [];
    hand = [];
    revealRoles = false;
    message = 'New government awaits nomination.';
  }

  function reshuffleIfNeeded() {
    if (drawPile.length >= 3 || discardPile.length === 0) {
      return;
    }

    drawPile = shuffle([...drawPile, ...discardPile], `reshuffle:${Date.now()}`);
    discardPile = [];
  }

  function drawPolicies() {
    if (terminal) {
      return;
    }

    reshuffleIfNeeded();
    if (drawPile.length < 3) {
      message = 'Not enough policies to draw.';
      return;
    }

    hand = drawPile.slice(0, 3);
    drawPile = drawPile.slice(3);
    message = `${presidentName} drew three policies. Choose one to enact after table discussion.`;
  }

  function enactPolicy(policy: Policy, index: number) {
    if (!hand[index] || terminal) {
      return;
    }

    if (policy === 'liberal') {
      liberalPolicies += 1;
    } else {
      fascistPolicies += 1;
    }

    discardPile = [...discardPile, ...hand.filter((_, item) => item !== index)];
    hand = [];
    electionTracker = 0;
    message = `${policy === 'liberal' ? 'Liberal' : 'Fascist'} policy enacted.`;
    advancePresident();
  }

  function failElection() {
    if (terminal) {
      return;
    }

    electionTracker += 1;
    chancellor = null;
    if (electionTracker >= 3) {
      const [topPolicy, ...rest] = drawPile;
      drawPile = rest;
      if (topPolicy === 'liberal') {
        liberalPolicies += 1;
      } else if (topPolicy === 'fascist') {
        fascistPolicies += 1;
      }
      electionTracker = 0;
      message = 'Election tracker filled. Top policy enacted.';
    } else {
      message = 'Government rejected. Election tracker advanced.';
    }
    advancePresident();
  }

  function advancePresident() {
    president = (president + 1) % players.length;
    chancellor = null;
  }

  function roleLabel(role: Role): string {
    if (role === 'hitler') {
      return 'Hitler';
    }
    return role === 'liberal' ? 'Liberal' : 'Fascist';
  }

  startGame();
</script>

<section class="h-full overflow-auto bg-neutral-950 px-6 py-6 text-neutral-100">
  <div class="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[1fr_360px]">
    <section class="rounded-md border border-neutral-800 bg-neutral-900 p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-2xl font-semibold tracking-normal">Secret Hitler</h1>
          <p class="mt-1 text-sm text-neutral-400">
            President: {presidentName} · Chancellor: {chancellorName}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <label class="text-xs text-neutral-400">
            Players
            <select
              class="ml-2 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-neutral-100"
              bind:value={playerCount}
              on:change={startGame}
            >
              {#each [5, 6, 7, 8, 9, 10] as count}
                <option value={count}>{count}</option>
              {/each}
            </select>
          </label>
          <label class="text-xs text-neutral-400">
            Seed
            <input
              class="ml-2 w-32 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-neutral-100"
              bind:value={seed}
            />
          </label>
          <button
            class="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-100 hover:border-neutral-500"
            type="button"
            on:click={startGame}
          >
            New game
          </button>
        </div>
      </div>

      {#if winner}
        <div
          class="mt-4 rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100"
        >
          {winner}
        </div>
      {:else if message}
        <div
          class="mt-4 rounded-md border border-sky-400/40 bg-sky-400/10 px-3 py-2 text-sm text-sky-100"
        >
          {message}
        </div>
      {/if}

      <div class="mt-5 grid gap-4 xl:grid-cols-2">
        <section class="rounded-md border border-blue-400/30 bg-blue-400/5 p-3">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-semibold text-blue-100">Liberal Track</h2>
            <span class="text-xs text-blue-200">{liberalPolicies}/5</span>
          </div>
          <div class="mt-3 grid grid-cols-5 gap-2">
            {#each liberalPowers as power, index}
              <div
                class={`flex aspect-[4/3] items-center justify-center rounded-md border text-center text-xs ${
                  index < liberalPolicies
                    ? 'border-blue-300 bg-blue-400/30 text-white'
                    : 'border-blue-400/30 bg-neutral-950 text-blue-100'
                }`}
              >
                {power}
              </div>
            {/each}
          </div>
        </section>

        <section class="rounded-md border border-red-400/30 bg-red-400/5 p-3">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-semibold text-red-100">Fascist Track</h2>
            <span class="text-xs text-red-200">{fascistPolicies}/6</span>
          </div>
          <div class="mt-3 grid grid-cols-6 gap-2">
            {#each fascistPowers as power, index}
              <div
                class={`flex aspect-[4/3] items-center justify-center rounded-md border px-1 text-center text-xs ${
                  index < fascistPolicies
                    ? 'border-red-300 bg-red-500/30 text-white'
                    : 'border-red-400/30 bg-neutral-950 text-red-100'
                }`}
              >
                {power}
              </div>
            {/each}
          </div>
        </section>
      </div>

      <div class="mt-4 grid gap-4 md:grid-cols-3">
        <section class="rounded-md border border-neutral-800 bg-neutral-950 p-3">
          <h2 class="text-sm font-semibold">Election Tracker</h2>
          <div class="mt-3 grid grid-cols-3 gap-2">
            {#each [0, 1, 2] as step}
              <div
                class={`h-10 rounded-md border ${
                  step < electionTracker
                    ? 'border-amber-300 bg-amber-300/30'
                    : 'border-neutral-700 bg-neutral-900'
                }`}
              ></div>
            {/each}
          </div>
          <button
            class="mt-3 w-full rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            disabled={terminal}
            on:click={failElection}
          >
            Government Failed
          </button>
        </section>

        <section class="rounded-md border border-neutral-800 bg-neutral-950 p-3">
          <h2 class="text-sm font-semibold">Policy Deck</h2>
          <div class="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div class="rounded-md border border-neutral-800 bg-neutral-900 p-3">
              <div class="text-xs uppercase text-neutral-500">Draw</div>
              <div class="mt-1 text-2xl font-semibold">{drawPile.length}</div>
            </div>
            <div class="rounded-md border border-neutral-800 bg-neutral-900 p-3">
              <div class="text-xs uppercase text-neutral-500">Discard</div>
              <div class="mt-1 text-2xl font-semibold">{discardPile.length}</div>
            </div>
          </div>
          <button
            class="mt-3 w-full rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-600"
            type="button"
            disabled={terminal || hand.length > 0}
            on:click={drawPolicies}
          >
            Draw Policies
          </button>
        </section>

        <section class="rounded-md border border-neutral-800 bg-neutral-950 p-3">
          <h2 class="text-sm font-semibold">Legislative Session</h2>
          {#if hand.length}
            <div class="mt-3 grid grid-cols-3 gap-2">
              {#each hand as policy, index}
                <button
                  class={`aspect-[3/4] rounded-md border px-2 text-sm font-semibold ${
                    policy === 'liberal'
                      ? 'border-blue-300 bg-blue-500/20 text-blue-100'
                      : 'border-red-300 bg-red-500/20 text-red-100'
                  }`}
                  type="button"
                  on:click={() => enactPolicy(policy, index)}
                >
                  {policy === 'liberal' ? 'Liberal' : 'Fascist'}
                </button>
              {/each}
            </div>
          {:else}
            <div
              class="mt-3 rounded-md border border-dashed border-neutral-800 px-3 py-6 text-center text-sm text-neutral-500"
            >
              Draw policies to begin legislation.
            </div>
          {/if}
        </section>
      </div>
    </section>

    <aside class="rounded-md border border-neutral-800 bg-neutral-900 p-4">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-sm font-semibold">Players</h2>
        <label class="flex items-center gap-2 text-xs text-neutral-400">
          <input type="checkbox" bind:checked={revealRoles} />
          Reveal roles
        </label>
      </div>

      <div class="mt-3 space-y-2">
        {#each players as player}
          <div
            class={`rounded-md border p-3 ${
              player.id === president
                ? 'border-emerald-400/60 bg-emerald-400/10'
                : player.id === chancellor
                  ? 'border-amber-300/60 bg-amber-300/10'
                  : 'border-neutral-800 bg-neutral-950'
            }`}
          >
            <div class="flex items-center justify-between gap-2">
              <div>
                <div class="text-sm font-medium">{player.name}</div>
                <div class="text-xs text-neutral-500">
                  {player.id === president
                    ? 'President'
                    : player.id === chancellor
                      ? 'Chancellor'
                      : 'Eligible'}
                </div>
              </div>
              <div
                class={`rounded-full border px-2 py-1 text-xs ${
                  revealRoles
                    ? player.role === 'liberal'
                      ? 'border-blue-300/60 bg-blue-400/10 text-blue-100'
                      : 'border-red-300/60 bg-red-400/10 text-red-100'
                    : 'border-neutral-700 bg-neutral-900 text-neutral-300'
                }`}
              >
                {revealRoles ? roleLabel(player.role) : 'Hidden'}
              </div>
            </div>
            <button
              class="mt-3 w-full rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-40"
              type="button"
              disabled={player.id === president || terminal}
              on:click={() => {
                chancellor = player.id;
                message = `${presidentName} nominated ${player.name}.`;
              }}
            >
              Nominate Chancellor
            </button>
          </div>
        {/each}
      </div>
    </aside>
  </div>
</section>
