const seedParam = 'seed';

function normalizeHash(hash: string): string {
  return hash.startsWith('#') ? hash.slice(1) : hash;
}

export function seedFromHash(hash: string): string | undefined {
  const params = new URLSearchParams(normalizeHash(hash));
  const seed = params.get(seedParam)?.trim();
  return seed || undefined;
}

export function hashWithSeed(hash: string, seed: string): string {
  const params = new URLSearchParams(normalizeHash(hash));
  const normalizedSeed = seed.trim();

  if (normalizedSeed) {
    params.set(seedParam, normalizedSeed);
  } else {
    params.delete(seedParam);
  }

  const next = params.toString();
  return next ? `#${next}` : '';
}
