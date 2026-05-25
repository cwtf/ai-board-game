import { describe, expect, it } from 'vitest';
import { hashWithSeed, seedFromHash } from '@/lib/games/shared/seed-url';

describe('seed URL hash helpers', () => {
  it('reads a seed from a URL hash', () => {
    expect(seedFromHash('#seed=abc123')).toBe('abc123');
    expect(seedFromHash('seed=splendor-table')).toBe('splendor-table');
  });

  it('preserves other hash params while setting the seed', () => {
    expect(hashWithSeed('#view=table', 'shared seed')).toBe(
      '#view=table&seed=shared+seed',
    );
  });

  it('removes seed when the value is blank', () => {
    expect(hashWithSeed('#seed=abc123&view=table', ' ')).toBe('#view=table');
  });
});
