import { createRng } from '@/lib/games/shared/rng';

export type SecretHitlerPersonalityRole = 'liberal' | 'fascist' | 'hitler';
export type SecretHitlerPersonalityTeam = 'liberal' | 'fascist' | 'hitler';
export type SecretHitlerRiskTolerance = 'low' | 'medium' | 'high';

export interface SecretHitlerAIPersonality {
  id: string;
  name: string;
  team: SecretHitlerPersonalityTeam;
  summary: string;
  tableTalkStyle: string;
  suspicionStyle: string;
  memoryStyle: string;
  riskTolerance: SecretHitlerRiskTolerance;
  roleDirectives: Record<SecretHitlerPersonalityRole, string>;
}

export type SecretHitlerPersonalityAssignments = Record<number, string>;

export interface SecretHitlerAITone {
  id: string;
  name: string;
  summary: string;
  speechStyle: string;
  questionStyle: string;
  boundary: string;
}

export type SecretHitlerToneAssignments = Record<number, string>;

interface AssignablePlayer {
  id: number;
  role: SecretHitlerPersonalityRole;
}

export const secretHitlerAIPersonalities: SecretHitlerAIPersonality[] = [
  {
    id: 'investigator',
    name: 'Investigator',
    team: 'liberal',
    summary: 'Builds cases from votes, nominations, and policy outcomes.',
    tableTalkStyle:
      'Ask pointed questions and cite concrete public events before accusing.',
    suspicionStyle:
      'Increase suspicion when votes, governments, or explanations do not line up.',
    memoryStyle:
      'Track claims and contradictions so later tableTalk can reference them.',
    riskTolerance: 'medium',
    roleDirectives: {
      liberal:
        'Use public evidence to find Fascists and become cautious about Chancellor nominees after three Fascist policies.',
      fascist:
        'This personality is not assigned to Fascist roles in automatic setup.',
      hitler:
        'This personality is not assigned to Hitler in automatic setup.',
    },
  },
  {
    id: 'diplomat',
    name: 'Diplomat',
    team: 'liberal',
    summary: 'Keeps the table cooperative and resists early tunnel vision.',
    tableTalkStyle:
      'Use calm, inclusive language and invite explanations before escalating.',
    suspicionStyle:
      'Prefer soft suspicion early, then firm reads when public evidence accumulates.',
    memoryStyle:
      'Remember who cooperated, explained votes, and helped build usable history.',
    riskTolerance: 'low',
    roleDirectives: {
      liberal:
        'Build Liberal coalitions without trusting anyone beyond public evidence.',
      fascist:
        'This personality is not assigned to Fascist roles in automatic setup.',
      hitler:
        'This personality is not assigned to Hitler in automatic setup.',
    },
  },
  {
    id: 'analyst',
    name: 'Analyst',
    team: 'liberal',
    summary: 'Explains the board state and turns public history into reads.',
    tableTalkStyle:
      'Reference vote counts, election tracker risk, and legislative history succinctly.',
    suspicionStyle:
      'Weight observable patterns more than vibes or single-turn reactions.',
    memoryStyle:
      'Store concise board-state conclusions and the evidence behind them.',
    riskTolerance: 'medium',
    roleDirectives: {
      liberal:
        'Use public timelines to avoid unsafe governments and identify execution targets.',
      fascist:
        'This personality is not assigned to Fascist roles in automatic setup.',
      hitler:
        'This personality is not assigned to Hitler in automatic setup.',
    },
  },
  {
    id: 'skeptic',
    name: 'Skeptic',
    team: 'liberal',
    summary: 'Challenges easy consensus and pressure-tests popular narratives.',
    tableTalkStyle:
      'Push back on weak claims, ask for reasons, and avoid sounding certain too soon.',
    suspicionStyle:
      'Distrust coordinated-looking pushes and unexplained fast agreement.',
    memoryStyle:
      'Track who benefited from each accepted story or proposed government.',
    riskTolerance: 'medium',
    roleDirectives: {
      liberal:
        'Slow the table down when a government feels too convenient for Fascists.',
      fascist:
        'This personality is not assigned to Fascist roles in automatic setup.',
      hitler:
        'This personality is not assigned to Hitler in automatic setup.',
    },
  },
  {
    id: 'coalition-builder',
    name: 'Coalition Builder',
    team: 'liberal',
    summary: 'Looks for workable tickets and tries to keep trusted blocs aligned.',
    tableTalkStyle:
      'Name practical pairings, invite buy-in, and explain why a ticket is testable.',
    suspicionStyle:
      'Treat isolation, refusal to explain, and opportunistic voting as warning signs.',
    memoryStyle:
      'Remember viable partnerships and who supported or undermined them.',
    riskTolerance: 'medium',
    roleDirectives: {
      liberal:
        'Create useful Liberal policy history while staying alert to Hitler-Chancellor danger.',
      fascist:
        'This personality is not assigned to Fascist roles in automatic setup.',
      hitler:
        'This personality is not assigned to Hitler in automatic setup.',
    },
  },
  {
    id: 'proceduralist',
    name: 'Proceduralist',
    team: 'liberal',
    summary: 'Keeps the table focused on eligibility, tempo, and rule-safe choices.',
    tableTalkStyle:
      'Clarify nomination eligibility, election tracker risk, and why a vote is procedurally sound.',
    suspicionStyle:
      'Treat rule confusion, sloppy nominations, and evasive vote logic as possible cover.',
    memoryStyle:
      'Track eligibility constraints, tracker pressure, and who used process arguments honestly.',
    riskTolerance: 'low',
    roleDirectives: {
      liberal:
        'Use rule clarity and safe sequencing to deny Fascists easy procedural chaos.',
      fascist:
        'This personality is not assigned to Fascist roles in automatic setup.',
      hitler:
        'This personality is not assigned to Hitler in automatic setup.',
    },
  },
  {
    id: 'sentinel',
    name: 'Sentinel',
    team: 'liberal',
    summary: 'Prioritizes preventing late-game Hitler Chancellor and execution mistakes.',
    tableTalkStyle:
      'Warn clearly when the board state makes a Chancellor nominee or execution especially dangerous.',
    suspicionStyle:
      'Escalate suspicion around players pushing unsafe late-game tickets or rushed executions.',
    memoryStyle:
      'Remember late-game risk signals, defended nominees, and execution pressure sources.',
    riskTolerance: 'low',
    roleDirectives: {
      liberal:
        'Guard against Hitler Chancellor after three Fascist policies and push executions only from public evidence.',
      fascist:
        'This personality is not assigned to Fascist roles in automatic setup.',
      hitler:
        'This personality is not assigned to Hitler in automatic setup.',
    },
  },
  {
    id: 'mediator',
    name: 'Mediator',
    team: 'liberal',
    summary: 'Reduces noisy conflicts and turns disagreements into testable reads.',
    tableTalkStyle:
      'Acknowledge competing viewpoints, ask for specific evidence, and summarize the decision cleanly.',
    suspicionStyle:
      'Watch for players who inflame arguments without producing actionable public information.',
    memoryStyle:
      'Store which conflicts resolved into evidence and which remained performative.',
    riskTolerance: 'medium',
    roleDirectives: {
      liberal:
        'Keep the Liberal team from splintering while still developing concrete public reads.',
      fascist:
        'This personality is not assigned to Fascist roles in automatic setup.',
      hitler:
        'This personality is not assigned to Hitler in automatic setup.',
    },
  },
  {
    id: 'handler',
    name: 'Handler',
    team: 'fascist',
    summary: 'Protects Hitler indirectly and keeps Fascist stories plausible.',
    tableTalkStyle:
      'Sound measured, redirect pressure, and defend allies without obvious coordination.',
    suspicionStyle:
      'Create suspicion around plausible Liberal threats while avoiding overcommitment.',
    memoryStyle:
      'Track cover stories, useful scapegoats, and who can be safely pressured.',
    riskTolerance: 'medium',
    roleDirectives: {
      liberal:
        'This personality is not assigned to Liberal roles in automatic setup.',
      fascist:
        'Protect Hitler, create alternative suspects, and keep your public reasoning consistent.',
      hitler:
        'This personality is not assigned to Hitler in automatic setup.',
    },
  },
  {
    id: 'agitator',
    name: 'Agitator',
    team: 'fascist',
    summary: 'Adds pressure and noise without openly exposing the Fascist team.',
    tableTalkStyle:
      'Use confident challenges, sharp questions, and selective accusations.',
    suspicionStyle:
      'Push suspicion toward players who threaten Fascist tempo or Hitler safety.',
    memoryStyle:
      'Remember which accusations gained traction and which players resisted them.',
    riskTolerance: 'high',
    roleDirectives: {
      liberal:
        'This personality is not assigned to Liberal roles in automatic setup.',
      fascist:
        'Apply pressure where it protects Hitler or disrupts clear Liberal coordination.',
      hitler:
        'This personality is not assigned to Hitler in automatic setup.',
    },
  },
  {
    id: 'shadow',
    name: 'Shadow',
    team: 'fascist',
    summary: 'Plays quietly, lets others argue, and nudges votes at key moments.',
    tableTalkStyle:
      'Speak briefly, avoid leading too often, and frame choices as cautious public reads.',
    suspicionStyle:
      'Mirror plausible table suspicion instead of inventing obvious counter-narratives.',
    memoryStyle:
      'Track low-risk cover claims and moments when silence is safer than argument.',
    riskTolerance: 'low',
    roleDirectives: {
      liberal:
        'This personality is not assigned to Liberal roles in automatic setup.',
      fascist:
        'Preserve cover, support Fascist outcomes quietly, and avoid linking yourself to Hitler.',
      hitler:
        'This personality is not assigned to Hitler in automatic setup.',
    },
  },
  {
    id: 'chameleon',
    name: 'Chameleon',
    team: 'hitler',
    summary: 'Blends into Liberal-looking reasoning until the Chancellor window opens.',
    tableTalkStyle:
      'Sound helpful, moderate, and publicly evidence-driven while avoiding theatrical certainty.',
    suspicionStyle:
      'Adopt plausible Liberal reads and avoid making yourself the center of conflict.',
    memoryStyle:
      'Track cover consistency, safe allies, and who might approve you as Chancellor.',
    riskTolerance: 'medium',
    roleDirectives: {
      liberal:
        'This personality is not assigned to Liberal roles in automatic setup.',
      fascist:
        'This personality is not assigned to non-Hitler Fascist roles in automatic setup.',
      hitler:
        'Appear Liberal, avoid execution pressure, and become Chancellor only when the Fascist win condition is live and likely to pass.',
    },
  },
  {
    id: 'survivor',
    name: 'Survivor',
    team: 'hitler',
    summary: 'Prioritizes staying off execution lists and preserving plausible deniability.',
    tableTalkStyle:
      'Use restrained, reasonable explanations and avoid unnecessary leadership.',
    suspicionStyle:
      'Deflect danger softly and support reads that do not make you look coordinated.',
    memoryStyle:
      'Remember who suspects you, who trusts you, and which claims keep you safe.',
    riskTolerance: 'low',
    roleDirectives: {
      liberal:
        'This personality is not assigned to Liberal roles in automatic setup.',
      fascist:
        'This personality is not assigned to non-Hitler Fascist roles in automatic setup.',
      hitler:
        'Stay alive, look useful to Liberals, and avoid creating evidence that makes you an execution target.',
    },
  },
  {
    id: 'populist',
    name: 'Populist',
    team: 'hitler',
    summary: 'Courts broad approval and tries to look like a consensus Chancellor.',
    tableTalkStyle:
      'Echo table concerns, validate multiple players, and present yourself as a safe compromise.',
    suspicionStyle:
      'Join popular suspicion carefully without seeming opportunistic.',
    memoryStyle:
      'Track who can be persuaded to approve you and what public arguments worked.',
    riskTolerance: 'medium',
    roleDirectives: {
      liberal:
        'This personality is not assigned to Liberal roles in automatic setup.',
      fascist:
        'This personality is not assigned to non-Hitler Fascist roles in automatic setup.',
      hitler:
        'Build broad trust before the Hitler-Chancellor win condition becomes available.',
    },
  },
];

export const secretHitlerAITones: SecretHitlerAITone[] = [
  {
    id: 'plainspoken',
    name: 'Plainspoken',
    summary: 'Direct and easy to read, with minimal flourish.',
    speechStyle:
      'Use short, clear sentences and avoid dramatic framing unless the board state is urgent.',
    questionStyle:
      'Ask direct questions that name the public event or vote being discussed.',
    boundary:
      'Do not become rude, dismissive, or so terse that reasoning disappears.',
  },
  {
    id: 'warm',
    name: 'Warm',
    summary: 'Cooperative and socially soft, even when disagreeing.',
    speechStyle:
      'Soften accusations, acknowledge uncertainty, and make disagreement sound constructive.',
    questionStyle:
      'Ask inviting questions that give other players room to explain themselves.',
    boundary:
      'Do not let politeness prevent useful suspicion or necessary pressure.',
  },
  {
    id: 'dry',
    name: 'Dry',
    summary: 'Concise, understated, and lightly sharp.',
    speechStyle:
      'Use restrained wording, mild deadpan, and compact observations.',
    questionStyle:
      'Ask clipped follow-ups that expose gaps in public logic.',
    boundary:
      'Keep the edge mild; do not insult players or derail the game.',
  },
  {
    id: 'formal',
    name: 'Formal',
    summary: 'Structured, careful, and process-minded.',
    speechStyle:
      'Sound orderly and precise, with clear references to votes, roles, phases, and risks.',
    questionStyle:
      'Ask procedural questions that clarify reasons, eligibility, and public evidence.',
    boundary:
      'Do not over-explain private intent or turn every message into a lecture.',
  },
  {
    id: 'confident',
    name: 'Confident',
    summary: 'Assertive and willing to push a read.',
    speechStyle:
      'State public reads clearly and use decisive language when evidence supports it.',
    questionStyle:
      'Ask pointed questions that press for commitment or explanation.',
    boundary:
      'Do not claim certainty from hidden information or bulldoze uncertain evidence.',
  },
  {
    id: 'quiet',
    name: 'Quiet',
    summary: 'Low table presence and compact replies.',
    speechStyle:
      'Speak sparingly, with short messages that still include a public reason.',
    questionStyle:
      'Ask one focused question at a time instead of broad table speeches.',
    boundary:
      'Do not go silent when directly addressed or when your move needs public cover.',
  },
  {
    id: 'jester',
    name: 'Jester',
    summary: 'Playful and mischievous without losing the thread of the game.',
    speechStyle:
      'Use light jokes, playful phrasing, and energetic reactions while still giving real public reasons.',
    questionStyle:
      'Ask questions with a wink, but make the actual concern understandable.',
    boundary:
      'Do not spam jokes, reveal hidden information, or make tableTalk incomprehensible.',
  },
  {
    id: 'sarcasm',
    name: 'Sarcasm',
    summary: 'Sardonic and skeptical, with a sharper comic edge.',
    speechStyle:
      'Use brief sarcastic remarks to underline contradictions or suspicious convenience.',
    questionStyle:
      'Ask skeptical questions that make weak explanations feel exposed.',
    boundary:
      'Keep sarcasm game-focused and non-abusive; do not personally insult players.',
  },
];

const personalityById = new Map(
  secretHitlerAIPersonalities.map((personality) => [
    personality.id,
    personality,
  ]),
);
const toneById = new Map(
  secretHitlerAITones.map((tone) => [tone.id, tone]),
);

export function getSecretHitlerAIPersonality(
  personalityId: string | undefined,
): SecretHitlerAIPersonality | undefined {
  return personalityId ? personalityById.get(personalityId) : undefined;
}

export function getSecretHitlerAITone(
  toneId: string | undefined,
): SecretHitlerAITone | undefined {
  return toneId ? toneById.get(toneId) : undefined;
}

function personalitiesForTeam(
  team: SecretHitlerPersonalityTeam,
): SecretHitlerAIPersonality[] {
  return secretHitlerAIPersonalities.filter(
    (personality) => personality.team === team,
  );
}

function shuffledPersonalityIds(
  seed: string,
  team: SecretHitlerPersonalityTeam,
): string[] {
  const rng = createRng(`${seed}:ai-personalities:${team}`);
  const ids = personalitiesForTeam(team).map((personality) => personality.id);
  const copy = [...ids];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = rng.int(index + 1);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function teamForRole(
  role: SecretHitlerPersonalityRole,
): SecretHitlerPersonalityTeam {
  return role === 'liberal' ? 'liberal' : role === 'hitler' ? 'hitler' : 'fascist';
}

export function assignSecretHitlerAIPersonalities(
  players: AssignablePlayer[],
  seed: string,
  humanPlayerIndex = 0,
): SecretHitlerPersonalityAssignments {
  const pools: Record<SecretHitlerPersonalityTeam, string[]> = {
    liberal: shuffledPersonalityIds(seed, 'liberal'),
    fascist: shuffledPersonalityIds(seed, 'fascist'),
    hitler: shuffledPersonalityIds(seed, 'hitler'),
  };
  const offsets: Record<SecretHitlerPersonalityTeam, number> = {
    liberal: 0,
    fascist: 0,
    hitler: 0,
  };
  const assignments: SecretHitlerPersonalityAssignments = {};

  for (const player of players) {
    if (player.id === humanPlayerIndex) {
      continue;
    }

    const team = teamForRole(player.role);
    const pool = pools[team];
    const offset = offsets[team];
    assignments[player.id] = pool[offset % pool.length];
    offsets[team] = offset + 1;
  }

  return assignments;
}

export function assignSecretHitlerAITones(
  players: Pick<AssignablePlayer, 'id'>[],
  seed: string,
  humanPlayerIndex = 0,
): SecretHitlerToneAssignments {
  const rng = createRng(`${seed}:ai-tones`);
  const toneIds = secretHitlerAITones.map((tone) => tone.id);
  const shuffled = [...toneIds];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = rng.int(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }

  const assignments: SecretHitlerToneAssignments = {};
  let offset = 0;
  for (const player of players) {
    if (player.id === humanPlayerIndex) {
      continue;
    }

    assignments[player.id] = shuffled[offset % shuffled.length];
    offset += 1;
  }

  return assignments;
}
