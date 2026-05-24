import { describe, expect, it } from 'vitest';
import {
  applySecretHitlerMemoryPatch,
  assessSecretHitlerPublicSpeech,
  assessSecretHitlerStrategicMove,
  chooseSecretHitlerStrategicFallback,
  createSecretHitlerAIMemory,
  createSecretHitlerPublicInfluencePatch,
  parseSecretHitlerAIResponse,
  secretHitlerAdapter,
  serializeSecretHitlerForAI,
  type SecretHitlerState,
} from '@/lib/games/secret-hitler/ai-adapter';

describe('Secret Hitler AI adapter', () => {
  it('gives the model a hidden-info JSON-only contract', () => {
    const prompt = secretHitlerAdapter.systemPrompt();

    expect(prompt).toContain('exactly one assigned player');
    expect(prompt).toContain('assignedPlayer with your exact id and name');
    expect(prompt).toContain(
      'only the information your player is allowed to know',
    );
    expect(prompt).toContain('legislative history');
    expect(prompt).toContain('private.objective');
    expect(prompt).toContain('Play to win for that hidden team');
    expect(prompt).toContain('Never claim certainty from hidden information');
    expect(prompt).toContain('Do not make your next move obvious');
    expect(prompt).toContain('Never announce private policy choices');
    expect(prompt).toContain('private policy phases');
    expect(prompt).toContain('Liberals win at 5 Liberal policies');
    expect(prompt).toContain('Fascists win at 6 Fascist policies');
    expect(prompt).toContain(
      'Hitler being elected Chancellor wins for Fascists only if 3 or more Fascist policies',
    );
    expect(prompt).toContain('public reasoning');
    expect(prompt).toContain('tableTalk');
    expect(prompt).toContain('moveId');
    expect(prompt).toContain('privateMemory');
    expect(prompt).toContain('neutralTableSummary');
    expect(prompt).toContain('memoryPatch');
    expect(prompt).toContain('Do not include prose');
    expect(prompt).toContain('Liberals should');
    expect(prompt).toContain('Fascists should');
    expect(prompt).toContain('Hitler should');
  });

  it('serializes the assigned player identity explicitly', () => {
    const state = secretHitlerAdapter.init({
      seed: 'assigned-player',
      playerCount: 5,
      aiPlayerIndices: [],
    });
    state.players[2].name = 'Ada';

    const payload = JSON.parse(
      secretHitlerAdapter.serializeForAI(state, 2, []),
    ) as {
      player: number;
      assignedPlayer: { id: number; name: string } | null;
      state: {
        player: number;
        players: Array<{ id: number; name: string }>;
      };
    };

    expect(payload.player).toBe(2);
    expect(payload.assignedPlayer).toEqual({ id: 2, name: 'Ada' });
    expect(payload.state.player).toBe(2);
    expect(payload.state.players[2]).toMatchObject({ id: 2, name: 'Ada' });
  });

  it('serializes core win-condition rules alongside the board state', () => {
    const state = secretHitlerAdapter.init({
      seed: 'rules',
      playerCount: 5,
      aiPlayerIndices: [],
    });
    state.liberalPolicies = 4;
    state.fascistPolicies = 0;

    const payload = JSON.parse(
      secretHitlerAdapter.serializeForAI(state, 0, []),
    ) as {
      rules: {
        liberalPolicyWinCount: number;
        fascistPolicyWinCount: number;
        hitlerChancellorFascistPolicyThreshold: number;
        importantRules: string[];
      };
      state: { liberalPolicies: number; fascistPolicies: number };
    };

    expect(payload.state).toMatchObject({
      liberalPolicies: 4,
      fascistPolicies: 0,
    });
    expect(payload.rules).toMatchObject({
      liberalPolicyWinCount: 5,
      fascistPolicyWinCount: 6,
      hitlerChancellorFascistPolicyThreshold: 3,
    });
    expect(payload.rules.importantRules.join(' ')).toContain(
      'Hitler becoming Chancellor does not create a Fascist win while there are zero, one, or two Fascist policies enacted.',
    );
  });

  it('briefs fascist policy actors to play for their hidden team', () => {
    const state = secretHitlerAdapter.init({
      seed: 'fascist-chancellor-objective',
      playerCount: 5,
      aiPlayerIndices: [],
    });
    state.players[1] = {
      id: 1,
      name: 'Felix',
      role: 'fascist',
      alive: true,
    };
    state.phase = 'chancellor-discard';
    state.president = 0;
    state.nominee = 1;
    state.liberalPolicies = 4;
    state.chancellorHand = ['liberal', 'fascist'];
    const moves = secretHitlerAdapter.legalMoves(state, 1);

    const payload = JSON.parse(serializeSecretHitlerForAI(state, 1, moves)) as {
      state: {
        private: {
          role: string;
          party: string;
          objective: string;
          actionGuidance: string[];
          chancellorHand: string[];
        };
      };
      legalMoves: Array<{ label: string }>;
    };

    expect(payload.state.private).toMatchObject({
      role: 'fascist',
      party: 'fascist',
      chancellorHand: ['liberal', 'fascist'],
    });
    expect(payload.state.private.objective).toContain('Fascist team');
    expect(payload.state.private.actionGuidance.join(' ')).toContain(
      'do not enact a Liberal policy that gives Liberals their fifth policy',
    );
    expect(payload.legalMoves.map((move) => move.label)).toEqual([
      'Chancellor enacts liberal policy at index 0',
      'Chancellor enacts fascist policy at index 1',
    ]);
  });

  it('flags and reranks obvious hidden-objective policy contradictions', () => {
    const state = secretHitlerAdapter.init({
      seed: 'strategic-rerank',
      playerCount: 5,
      aiPlayerIndices: [],
    });
    state.players[1] = {
      id: 1,
      name: 'Felix',
      role: 'fascist',
      alive: true,
    };
    state.phase = 'chancellor-discard';
    state.president = 0;
    state.nominee = 1;
    state.liberalPolicies = 4;
    state.chancellorHand = ['liberal', 'fascist'];
    const moves = secretHitlerAdapter.legalMoves(state, 1);

    const assessment = assessSecretHitlerStrategicMove(state, 1, {
      id: 'chancellor-enact:0',
      kind: 'chancellor-enact',
      index: 0,
    });

    expect(assessment).toMatchObject({
      ok: false,
      reason:
        'Fascist Chancellor would enact the fifth Liberal policy while a Fascist policy is available.',
    });
    expect(chooseSecretHitlerStrategicFallback(state, 1, moves)).toEqual({
      id: 'chancellor-enact:1',
      kind: 'chancellor-enact',
      index: 1,
    });
  });

  it('flags public table talk that leaks private policy handling', () => {
    const state = secretHitlerAdapter.init({
      seed: 'private-policy-speech',
      playerCount: 5,
      aiPlayerIndices: [],
    });
    state.players[2] = {
      id: 2,
      name: 'Lukas',
      role: 'hitler',
      alive: true,
    };
    state.phase = 'president-discard';
    state.president = 2;
    state.nominee = 3;
    state.presidentHand = ['liberal', 'fascist', 'fascist'];

    expect(
      assessSecretHitlerPublicSpeech(state, 2, {
        id: 'president-discard:0',
        kind: 'president-discard',
        index: 0,
        tableTalk:
          "I received a mixed bag. I'll discard a liberal to push the fascist agenda forward.",
      }),
    ).toMatchObject({
      ok: false,
      reason:
        'Public tableTalk reveals hidden-team identity, hidden-team agenda, or hidden-team intent.',
    });

    expect(
      assessSecretHitlerPublicSpeech(state, 2, {
        id: 'president-discard:0',
        kind: 'president-discard',
        index: 0,
        tableTalk:
          'This ticket passed, so I am sending it forward. We can judge the outcome publicly.',
      }),
    ).toEqual({ ok: true });
  });

  it('briefs early voters not to reflexively reject unknown governments', () => {
    const state = secretHitlerAdapter.init({
      seed: 'early-voting-guidance',
      playerCount: 5,
      aiPlayerIndices: [],
    });
    state.phase = 'voting';
    state.turn = 1;
    state.president = 0;
    state.nominee = 1;
    state.fascistPolicies = 0;
    state.votes = Object.fromEntries(
      state.players.map((player) => [player.id, null]),
    );
    state.votes[0] = 'ja';
    state.votes[1] = 'ja';
    const moves = secretHitlerAdapter.legalMoves(state, 2);

    const payload = JSON.parse(serializeSecretHitlerForAI(state, 2, moves)) as {
      state: {
        private: {
          actionGuidance: string[];
        };
      };
      legalMoves: Array<{ label: string }>;
    };

    expect(payload.state.private.actionGuidance.join(' ')).toContain(
      'do not default to nein just because roles are hidden',
    );
    expect(payload.state.private.actionGuidance.join(' ')).toContain(
      'approving plausible governments creates policy history',
    );
    expect(payload.legalMoves.map((move) => move.label)).toEqual([
      'Vote ja (approve the proposed government)',
      'Vote nein (reject the proposed government)',
    ]);
  });

  it('serializes only the acting player private memory', () => {
    const state = secretHitlerAdapter.init({
      seed: 'memory',
      playerCount: 5,
      aiPlayerIndices: [],
    });
    const memory = {
      publicClaims: ['I said Player 4 was worth testing.'],
      privateNotes: ['Protect Player 2 without sounding coordinated.'],
      playerReads: [
        {
          playerId: 3,
          read: 'trust' as const,
          reason: 'Backed my nomination.',
        },
      ],
    };

    const payload = JSON.parse(
      serializeSecretHitlerForAI(state, 1, [], memory),
    ) as {
      privateMemory: typeof memory;
      responseSchema: { memoryPatch: unknown };
    };

    expect(payload.privateMemory).toEqual(memory);
    expect(payload.responseSchema.memoryPatch).toBeTruthy();
    expect(JSON.stringify(payload)).not.toContain(
      'other players private memory',
    );
  });

  it('serializes neutral public chat summaries as advisory context', () => {
    const state = secretHitlerAdapter.init({
      seed: 'neutral-chat-summary',
      playerCount: 5,
      aiPlayerIndices: [],
    });

    const payload = JSON.parse(
      serializeSecretHitlerForAI(state, 1, [], undefined, [
        {
          turn: 2,
          summary: 'Player 3 pushed Player 4 as a safer Chancellor.',
          claims: ['Player 3 said Player 4 had voted consistently.'],
        },
        {
          turn: 1,
          summary: 'Player 1 asked why Player 2 voted nein.',
          claims: ['Player 2 claimed the ticket felt too quiet.'],
        },
      ]),
    ) as {
      neutralTableSummary: {
        source: string;
        warning: string;
        turnSummaries: Array<{
          turn: number;
          summary: string;
          claims: string[];
        }>;
      };
    };

    expect(payload.neutralTableSummary.source).toBe(
      'neutral public-chat analyst',
    );
    expect(payload.neutralTableSummary.warning).toContain(
      'Advisory summary of public chat only',
    );
    expect(
      payload.neutralTableSummary.turnSummaries.map((summary) => summary.turn),
    ).toEqual([1, 2]);
    expect(payload.neutralTableSummary.turnSummaries[0].claims).toEqual([
      'Player 2 claimed the ticket felt too quiet.',
    ]);
  });

  it('records public legislative history for enacted policies', () => {
    const state = secretHitlerAdapter.init({
      seed: 'legislative-history',
      playerCount: 5,
      aiPlayerIndices: [],
    });
    state.phase = 'chancellor-discard';
    state.turn = 3;
    state.president = 1;
    state.nominee = 4;
    state.previousPresident = 1;
    state.previousChancellor = 4;
    state.chancellorHand = ['liberal', 'fascist'];

    const next = secretHitlerAdapter.applyMove(state, {
      id: 'chancellor-enact:0',
      kind: 'chancellor-enact',
      index: 0,
    }) as SecretHitlerState;

    expect(next.legislativeHistory).toEqual([
      {
        turn: 3,
        policy: 'liberal',
        source: 'government',
        president: { id: 1, name: 'Player 2' },
        chancellor: { id: 4, name: 'Player 5' },
        liberalPoliciesAfter: 1,
        fascistPoliciesAfter: 0,
      },
    ]);

    const payload = JSON.parse(serializeSecretHitlerForAI(next, 2, [])) as {
      state: {
        legislativeHistory: SecretHitlerState['legislativeHistory'];
      };
    };
    expect(payload.state.legislativeHistory).toEqual(next.legislativeHistory);
  });

  it('serializes only legally visible identities for each player', () => {
    const state = secretHitlerAdapter.init({
      seed: 'visibility',
      playerCount: 7,
      aiPlayerIndices: [],
    });
    state.players = [
      { id: 0, name: 'Player 1', role: 'liberal', alive: true },
      { id: 1, name: 'Player 2', role: 'fascist', alive: true },
      { id: 2, name: 'Player 3', role: 'hitler', alive: true },
      { id: 3, name: 'Player 4', role: 'liberal', alive: true },
      { id: 4, name: 'Player 5', role: 'liberal', alive: true },
      { id: 5, name: 'Player 6', role: 'liberal', alive: true },
      { id: 6, name: 'Player 7', role: 'fascist', alive: true },
    ];

    const liberalPayload = JSON.parse(
      secretHitlerAdapter.serializeForAI(state, 0, []),
    ) as {
      state: { players: Array<{ visibleRole: string | null }> };
    };
    expect(
      liberalPayload.state.players.map((player) => player.visibleRole),
    ).toEqual(['liberal', null, null, null, null, null, null]);

    const fascistPayload = JSON.parse(
      secretHitlerAdapter.serializeForAI(state, 1, []),
    ) as {
      state: { players: Array<{ visibleRole: string | null }> };
    };
    expect(
      fascistPayload.state.players.map((player) => player.visibleRole),
    ).toEqual([null, 'fascist', 'hitler', null, null, null, 'fascist']);

    const hitlerPayload = JSON.parse(
      secretHitlerAdapter.serializeForAI(state, 2, []),
    ) as {
      state: { players: Array<{ visibleRole: string | null }> };
    };
    expect(
      hitlerPayload.state.players.map((player) => player.visibleRole),
    ).toEqual([null, null, 'hitler', null, null, null, null]);
  });

  it('shows Hitler the fascist teammate in five and six player games', () => {
    const state = secretHitlerAdapter.init({
      seed: 'small-table',
      playerCount: 5,
      aiPlayerIndices: [],
    });
    state.players = [
      { id: 0, name: 'Player 1', role: 'hitler', alive: true },
      { id: 1, name: 'Player 2', role: 'fascist', alive: true },
      { id: 2, name: 'Player 3', role: 'liberal', alive: true },
      { id: 3, name: 'Player 4', role: 'liberal', alive: true },
      { id: 4, name: 'Player 5', role: 'liberal', alive: true },
    ];

    const payload = JSON.parse(
      secretHitlerAdapter.serializeForAI(state, 0, []),
    ) as {
      state: { players: Array<{ visibleRole: string | null }> };
    };

    expect(payload.state.players.map((player) => player.visibleRole)).toEqual([
      'hitler',
      'fascist',
      null,
      null,
      null,
    ]);
  });

  it('hides policy hands unless the viewer owns the private step', () => {
    const state = secretHitlerAdapter.init({
      seed: 'hands',
      playerCount: 5,
      aiPlayerIndices: [],
    });
    state.phase = 'president-discard';
    state.president = 1;
    state.presidentHand = ['liberal', 'fascist', 'fascist'];

    const presidentPayload = JSON.parse(
      secretHitlerAdapter.serializeForAI(state, 1, []),
    ) as { state: { private: { presidentHand?: string[] } } };
    expect(presidentPayload.state.private.presidentHand).toEqual([
      'liberal',
      'fascist',
      'fascist',
    ]);

    const otherPayload = JSON.parse(
      secretHitlerAdapter.serializeForAI(state, 0, []),
    ) as { state: { private: { presidentHand?: string[] } } };
    expect(otherPayload.state.private.presidentHand).toBeUndefined();
  });

  it('parses legal move IDs and optional table talk', () => {
    const state = secretHitlerAdapter.init({
      seed: 'parse',
      playerCount: 5,
      aiPlayerIndices: [],
    });
    const moves = secretHitlerAdapter.legalMoves(state, 0);
    const parsed = secretHitlerAdapter.parseAIMove(
      JSON.stringify({
        moveId: moves[0].id,
        tableTalk: 'I can take Chancellor if the table trusts this pairing.',
      }),
      moves,
    );

    expect(parsed).toEqual({
      ok: true,
      move: {
        ...moves[0],
        tableTalk: 'I can take Chancellor if the table trusts this pairing.',
      },
    });
  });

  it('parses and applies bounded private memory patches', () => {
    const state = secretHitlerAdapter.init({
      seed: 'memory-patch',
      playerCount: 5,
      aiPlayerIndices: [],
    });
    const moves = secretHitlerAdapter.legalMoves(state, 0);
    const parsed = parseSecretHitlerAIResponse(
      JSON.stringify({
        moveId: moves[0].id,
        memoryPatch: {
          publicClaim: 'I framed this as a cautious test.',
          privateNote: 'Avoid linking myself too closely to Player 2.',
          playerReads: [
            {
              playerId: 1,
              read: 'suspicious',
              reason: 'Pushed back too quickly.',
            },
            {
              playerId: 999,
              read: 'trust',
              reason: 'Invalid player should be ignored.',
            },
          ],
        },
      }),
      moves,
      {
        playerIds: state.players.map((player) => player.id),
        currentTurn: state.turn,
      },
    );

    expect(parsed).toMatchObject({
      ok: true,
      value: {
        move: moves[0],
        memoryPatch: {
          publicClaim: 'I framed this as a cautious test.',
          privateNote: 'Avoid linking myself too closely to Player 2.',
          playerReads: [
            {
              playerId: 1,
              read: 'suspicious',
              reason: 'Pushed back too quickly.',
              updatedAtTurn: 1,
            },
          ],
        },
      },
    });

    if (!parsed.ok) {
      throw new Error(parsed.error);
    }

    const memory = applySecretHitlerMemoryPatch(
      createSecretHitlerAIMemory(),
      parsed.value.memoryPatch,
      {
        playerIds: state.players.map((player) => player.id),
        currentTurn: state.turn,
      },
    );

    expect(memory.publicClaims).toEqual(['I framed this as a cautious test.']);
    expect(memory.privateNotes).toEqual([
      'Avoid linking myself too closely to Player 2.',
    ]);
    expect(memory.playerReads).toEqual([
      {
        playerId: 1,
        read: 'suspicious',
        reason: 'Pushed back too quickly.',
        updatedAtTurn: 1,
      },
    ]);
  });

  it('turns public human persuasion into a cautious memory patch', () => {
    const state = secretHitlerAdapter.init({
      seed: 'public-influence',
      playerCount: 5,
      aiPlayerIndices: [],
    });
    state.players[2].name = 'Marta';

    const patch = createSecretHitlerPublicInfluencePatch({
      speakerName: 'Player 1',
      body: 'I do not trust Marta after that vote.',
      players: state.players,
      currentTurn: 3,
    });

    expect(patch).toEqual({
      publicClaim:
        'Player 1 publicly pushed suspicion: "I do not trust Marta after that vote."',
      playerReads: [
        {
          playerId: 2,
          read: 'suspicious',
          reason:
            'Player 1 publicly pushed suspicion; treat as persuasion, not proof.',
          updatedAtTurn: 3,
        },
      ],
    });
  });

  it('rejects malformed or illegal model responses', () => {
    const state = secretHitlerAdapter.init({
      seed: 'reject',
      playerCount: 5,
      aiPlayerIndices: [],
    });
    const moves = secretHitlerAdapter.legalMoves(state, 0);

    expect(secretHitlerAdapter.parseAIMove('not json', moves)).toMatchObject({
      ok: false,
    });
    expect(
      secretHitlerAdapter.parseAIMove(
        JSON.stringify({ moveId: 'nominate:999' }),
        moves,
      ),
    ).toMatchObject({ ok: false });
    expect(
      secretHitlerAdapter.parseAIMove(
        JSON.stringify({ moveId: moves[0].id, tableTalk: 123 }),
        moves,
      ),
    ).toMatchObject({ ok: false });
  });

  it('applies table talk as the current acting player', () => {
    const state = secretHitlerAdapter.init({
      seed: 'chat',
      playerCount: 5,
      aiPlayerIndices: [],
    });
    const move = secretHitlerAdapter.legalMoves(state, 0)[0];
    const next = secretHitlerAdapter.applyMove(state, {
      ...move,
      tableTalk: 'Let me propose this government.',
    }) as SecretHitlerState;

    expect(next.chatMessages).toEqual([
      {
        playerId: 0,
        playerName: 'Player 1',
        body: 'Let me propose this government.',
        turn: 1,
        phase: 'nomination',
      },
    ]);
  });

  it('unlocks the matching executive power when a fascist policy is enacted', () => {
    const cases = [
      { playerCount: 5, existingFascists: 2, expectedPhase: 'policy-peek' },
      { playerCount: 5, existingFascists: 3, expectedPhase: 'execution' },
      { playerCount: 7, existingFascists: 1, expectedPhase: 'investigate' },
      {
        playerCount: 7,
        existingFascists: 2,
        expectedPhase: 'special-election',
      },
    ] as const;

    for (const item of cases) {
      const state = secretHitlerAdapter.init({
        seed: `power-${item.playerCount}-${item.existingFascists}`,
        playerCount: item.playerCount,
        aiPlayerIndices: [],
      });
      state.phase = 'chancellor-discard';
      state.president = 0;
      state.nominee = 1;
      state.fascistPolicies = item.existingFascists;
      state.chancellorHand = ['fascist', 'liberal'];
      state.drawPile = ['liberal', 'fascist', 'liberal', 'fascist'];

      const next = secretHitlerAdapter.applyMove(state, {
        id: 'chancellor-enact:0',
        kind: 'chancellor-enact',
        index: 0,
      }) as SecretHitlerState;

      expect(next.fascistPolicies).toBe(item.existingFascists + 1);
      expect(next.phase).toBe(item.expectedPhase);
    }
  });

  it('unlocks the second execution after a prior execution has already happened', () => {
    const state = secretHitlerAdapter.init({
      seed: 'second-execution',
      playerCount: 7,
      aiPlayerIndices: [],
    });
    state.phase = 'chancellor-discard';
    state.president = 0;
    state.nominee = 1;
    state.fascistPolicies = 4;
    state.players[6] = { ...state.players[6], alive: false };
    state.chancellorHand = ['fascist', 'liberal'];
    state.drawPile = ['liberal', 'fascist', 'liberal', 'fascist'];

    const next = secretHitlerAdapter.applyMove(state, {
      id: 'chancellor-enact:0',
      kind: 'chancellor-enact',
      index: 0,
    }) as SecretHitlerState;

    expect(next.fascistPolicies).toBe(5);
    expect(next.phase).toBe('execution');
    expect(secretHitlerAdapter.legalMoves(next, next.president)).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'execute' })]),
    );
  });

  it('returns special-election presidency to the stored normal-order player even after they served the special term', () => {
    const state = secretHitlerAdapter.init({
      seed: 'special-return',
      playerCount: 7,
      aiPlayerIndices: [],
    });
    state.phase = 'policy-peek';
    state.president = 2;
    state.previousChancellor = 2;
    state.specialReturnPresident = 2;
    state.peekedPolicies = ['liberal', 'fascist', 'fascist'];

    const next = secretHitlerAdapter.applyMove(state, {
      id: 'complete-policy-peek',
      kind: 'complete-policy-peek',
    }) as SecretHitlerState;

    expect(next.phase).toBe('nomination');
    expect(next.president).toBe(2);
    expect(next.specialReturnPresident).toBeNull();
  });
});
