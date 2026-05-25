import type { ChatMessage, CompleteResult, TokenUsage } from '@/lib/ai';
import { addUsage } from '@/lib/games/shared/types';
import {
  assessSecretHitlerPublicSpeech,
  assessSecretHitlerStrategicMove,
  chooseSecretHitlerStrategicFallback,
  parseSecretHitlerAIResponse,
  secretHitlerAdapter,
  serializeSecretHitlerForAI,
  type SecretHitlerAIMemory,
  type SecretHitlerMemoryPatch,
  type SecretHitlerMove,
  type SecretHitlerNeutralTurnSummary,
  type SecretHitlerState,
} from './ai-adapter';

export interface SecretHitlerAIPipelineResult {
  move: SecretHitlerMove;
  memoryPatch?: SecretHitlerMemoryPatch;
  warning?: string;
  usage: TokenUsage;
  lastUsage?: TokenUsage;
}

export interface SecretHitlerAIPipelineOptions {
  state: SecretHitlerState;
  player: number;
  legalMoves: SecretHitlerMove[];
  memory?: SecretHitlerAIMemory;
  tableReadTurnSummaries?: SecretHitlerNeutralTurnSummary[];
  maxAttempts?: number;
  signal?: AbortSignal;
  complete(params: {
    system: string;
    messages: ChatMessage[];
    signal?: AbortSignal;
  }): Promise<CompleteResult>;
}

export async function requestSecretHitlerAIMove({
  state,
  player,
  legalMoves,
  memory,
  tableReadTurnSummaries = [],
  maxAttempts = 3,
  signal,
  complete,
}: SecretHitlerAIPipelineOptions): Promise<SecretHitlerAIPipelineResult> {
  const messages: ChatMessage[] = [
    {
      role: 'user',
      content: serializeSecretHitlerForAI(
        state,
        player,
        legalMoves,
        memory,
        tableReadTurnSummaries,
      ),
    },
  ];
  let lastError = '';
  let strategicFallback: SecretHitlerMove | undefined;
  let strategicFallbackReason = '';
  let quietSpeechFallback:
    | {
        move: SecretHitlerMove;
        memoryPatch?: SecretHitlerMemoryPatch;
      }
    | undefined;
  let quietSpeechFallbackReason = '';
  let usage: TokenUsage = { input: 0, output: 0 };
  let lastUsage: TokenUsage | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await complete({
      system: secretHitlerAdapter.systemPrompt(),
      messages,
      signal,
    });

    usage = addUsage(usage, result.usage);
    lastUsage = result.usage;
    const parsed = parseSecretHitlerAIResponse(result.text, legalMoves, {
      playerIds: state.players.map((item) => item.id),
      currentTurn: state.turn,
    });
    if (parsed.ok) {
      const assessment = assessSecretHitlerStrategicMove(
        state,
        player,
        parsed.value.move,
      );
      if (!assessment.ok) {
        lastError = assessment.reason ?? 'Strategic contradiction.';
        strategicFallback ??= chooseSecretHitlerStrategicFallback(
          state,
          player,
          legalMoves,
        );
        strategicFallbackReason = lastError;
        if (attempt < maxAttempts) {
          messages.push(
            { role: 'assistant', content: result.text },
            {
              role: 'user',
              content: `Strategic contradiction: ${lastError} Reconsider your move using private.role, private.party, private.objective, and private.actionGuidance. Return exactly one JSON object with a legal moveId and optional tableTalk.`,
            },
          );
          continue;
        }
        break;
      }

      const speechAssessment = assessSecretHitlerPublicSpeech(
        state,
        player,
        parsed.value.move,
      );
      if (!speechAssessment.ok) {
        lastError = speechAssessment.reason ?? 'Unsafe public tableTalk.';
        quietSpeechFallback = {
          move: {
            ...parsed.value.move,
            tableTalk: undefined,
          } as SecretHitlerMove,
          memoryPatch: parsed.value.memoryPatch,
        };
        quietSpeechFallbackReason = lastError;
        if (attempt < maxAttempts) {
          messages.push(
            { role: 'assistant', content: result.text },
            {
              role: 'user',
              content: `Unsafe public tableTalk: ${lastError} Keep the same strategic objective, but do not reveal private hand contents, policy colors received, discard/enact choices, hidden role, or hidden-team intent. Return exactly one JSON object with a legal moveId and safe optional tableTalk.`,
            },
          );
          continue;
        }
        break;
      }

      return { ...parsed.value, usage, lastUsage };
    }

    lastError = parsed.error;
    messages.push(
      { role: 'assistant', content: result.text },
      {
        role: 'user',
        content: `Invalid response: ${parsed.error}. Return exactly one JSON object with a legal moveId from the legalMoves list and optional tableTalk.`,
      },
    );
  }

  if (strategicFallback) {
    return {
      move: strategicFallback,
      warning: `${
        state.players[player]?.name ?? 'AI player'
      } repeatedly chose a move that conflicted with their hidden objective, so a safer legal move was used. ${strategicFallbackReason}`,
      usage,
      lastUsage,
    };
  }

  if (quietSpeechFallback) {
    return {
      ...quietSpeechFallback,
      warning: `${
        state.players[player]?.name ?? 'AI player'
      } repeatedly wrote unsafe public table talk, so the move was kept but the public message was suppressed. ${quietSpeechFallbackReason}`,
      usage,
      lastUsage,
    };
  }

  throw new Error(lastError || 'AI did not return a valid move.');
}
