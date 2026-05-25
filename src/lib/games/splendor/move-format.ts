import type { GemOrGold, SplendorMove } from './state';

export const splendorGemLabels: Record<GemOrGold, string> = {
  emerald: 'Emerald',
  sapphire: 'Sapphire',
  ruby: 'Ruby',
  diamond: 'Diamond',
  onyx: 'Onyx',
  gold: 'Gold',
};

function formatGemList(gems: GemOrGold[]): string {
  return gems.map((gem) => splendorGemLabels[gem]).join(', ');
}

function formatTokenMap(tokens: Partial<Record<GemOrGold, number>>): string {
  return Object.entries(tokens)
    .filter(([, amount]) => (amount ?? 0) > 0)
    .map(
      ([gem, amount]) =>
        `${amount} ${splendorGemLabels[gem as GemOrGold] ?? gem}`,
    )
    .join(', ');
}

export function formatSplendorMove(move: SplendorMove): string {
  const details: string[] = [];

  if (move.kind === 'take') {
    details.push(`Take ${formatGemList(move.gems)}`);
  } else if (move.kind === 'reserve') {
    details.push(
      move.source === 'deck'
        ? `Reserve face-down tier ${move.tier}`
        : `Reserve ${move.cardId}`,
    );
  } else {
    details.push(
      move.source === 'reserved'
        ? `Buy reserved ${move.cardId}`
        : `Buy ${move.cardId}`,
    );
  }

  if (move.discard && formatTokenMap(move.discard)) {
    details.push(`discard ${formatTokenMap(move.discard)}`);
  }

  if (move.noble) {
    details.push(`claim ${move.noble}`);
  }

  return details.join('; ');
}
