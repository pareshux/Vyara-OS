/**
 * AI Platform — public API
 *
 * All modules call AI through this interface.
 * No module may import an AI SDK directly.
 * Each skill MUST have a non-AI fallback.
 */

export type AISkill =
  | 'classify_document'
  | 'extract_boq'
  | 'transcribe_voice_note'
  | 'structure_activity'
  | 'draft_quote_email'
  | 'summarise_project'
  | 'score_lead'
  | 'generate_collection_script';

export type AIMode = 'draft_only' | 'autonomous';

export type AISkillInput = {
  skill: AISkill;
  mode: AIMode;
  entity_type: string;
  entity_id: string;
  actor_id: string;
  payload: Record<string, unknown>;
};

export type AISkillResult<T = unknown> =
  | { ok: true; data: T; model: string; latency_ms: number; fallback_used: false }
  | { ok: true; data: T; fallback_used: true }
  | { ok: false; error: string };

// Placeholder — implementation in Phase 1 (voice note skill) / Phase 2 (rest)
export async function runSkill<T = unknown>(
  _input: AISkillInput
): Promise<AISkillResult<T>> {
  throw new Error('AI skill not yet implemented. Add implementation in modules/shared/ai/skills/');
}
