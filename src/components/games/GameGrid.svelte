<script lang="ts">
  import { games } from '@/lib/games/registry';
  import GameCard from './GameCard.svelte';
</script>

<div class="grid gap-4 md:grid-cols-2">
  {#each games as game (game.id)}
    <GameCard {game} />
  {/each}
</div>
