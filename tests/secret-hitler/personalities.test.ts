import { describe, expect, it } from 'vitest';
import {
  assignSecretHitlerAIPersonalities,
  assignSecretHitlerAITones,
  getSecretHitlerAIPersonality,
  getSecretHitlerAITone,
  secretHitlerAIPersonalities,
  secretHitlerAITones,
} from '@/lib/games/secret-hitler/personalities';

describe('Secret Hitler AI personalities', () => {
  const players = [
    { id: 0, role: 'liberal' as const },
    { id: 1, role: 'hitler' as const },
    { id: 2, role: 'fascist' as const },
    { id: 3, role: 'liberal' as const },
    { id: 4, role: 'liberal' as const },
    { id: 5, role: 'fascist' as const },
    { id: 6, role: 'liberal' as const },
  ];

  it('assigns no personality to the human seat', () => {
    const assignments = assignSecretHitlerAIPersonalities(players, 'teams', 0);

    expect(assignments[0]).toBeUndefined();
  });

  it('assigns role-compatible personalities by hidden team', () => {
    const assignments = assignSecretHitlerAIPersonalities(players, 'teams', 0);

    expect(getSecretHitlerAIPersonality(assignments[1])?.team).toBe('hitler');
    expect(getSecretHitlerAIPersonality(assignments[2])?.team).toBe('fascist');
    expect(getSecretHitlerAIPersonality(assignments[5])?.team).toBe('fascist');
    expect(getSecretHitlerAIPersonality(assignments[3])?.team).toBe('liberal');
    expect(getSecretHitlerAIPersonality(assignments[4])?.team).toBe('liberal');
    expect(getSecretHitlerAIPersonality(assignments[6])?.team).toBe('liberal');
  });

  it('includes an expanded Liberal personality pool', () => {
    const liberalPersonalityIds = secretHitlerAIPersonalities
      .filter((personality) => personality.team === 'liberal')
      .map((personality) => personality.id);

    expect(liberalPersonalityIds).toEqual(
      expect.arrayContaining([
        'investigator',
        'diplomat',
        'analyst',
        'skeptic',
        'coalition-builder',
        'proceduralist',
        'sentinel',
        'mediator',
      ]),
    );
  });

  it('uses complementary personalities within the same team when possible', () => {
    const assignments = assignSecretHitlerAIPersonalities(players, 'spread', 0);

    expect(new Set([assignments[2], assignments[5]]).size).toBe(2);
    expect(new Set([assignments[3], assignments[4], assignments[6]]).size).toBe(
      3,
    );
  });

  it('is deterministic for a fixed seed', () => {
    expect(assignSecretHitlerAIPersonalities(players, 'fixed', 0)).toEqual(
      assignSecretHitlerAIPersonalities(players, 'fixed', 0),
    );
  });

  it('includes Jester and Sarcasm tones', () => {
    expect(secretHitlerAITones.map((tone) => tone.id)).toEqual(
      expect.arrayContaining(['jester', 'sarcasm']),
    );
    expect(getSecretHitlerAITone('jester')?.name).toBe('Jester');
    expect(getSecretHitlerAITone('sarcasm')?.name).toBe('Sarcasm');
  });

  it('assigns tones independently from hidden team roles', () => {
    const assignments = assignSecretHitlerAITones(players, 'tone-seed', 0);

    expect(assignments[0]).toBeUndefined();
    expect(Object.keys(assignments)).toHaveLength(players.length - 1);
    expect(Object.values(assignments).every((toneId) => getSecretHitlerAITone(toneId))).toBe(
      true,
    );
  });

  it('assigns tones deterministically for a fixed seed', () => {
    expect(assignSecretHitlerAITones(players, 'fixed-tone', 0)).toEqual(
      assignSecretHitlerAITones(players, 'fixed-tone', 0),
    );
  });
});
