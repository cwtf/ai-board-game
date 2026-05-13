<script lang="ts">
  import type { TokenUsage } from '@/lib/ai';

  export let lastUsage: TokenUsage | undefined = undefined;
  export let totalUsage: TokenUsage = { input: 0, output: 0 };

  $: lastTotal = (lastUsage?.input ?? 0) + (lastUsage?.output ?? 0);
  $: sessionTotal = totalUsage.input + totalUsage.output;
</script>

<div
  class="flex flex-wrap items-center gap-2 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs text-neutral-300"
>
  <span class="font-medium text-neutral-100">Tokens</span>
  <span class="text-neutral-500">Last</span>
  <span>{lastTotal}</span>
  <span class="text-neutral-500">Session</span>
  <span>{sessionTotal}</span>
</div>
