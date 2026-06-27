/** Beat-sync clip helpers (from ai-video-tool production-clip-plan.js). */

import type { ClipPlanEntry } from "../api";

export const DEFAULT_PRODUCTION_MAX_CLIPS = 8;

export function resolveProductionClipPlan(
  clipPlan: ClipPlanEntry[] | undefined,
  maxClips = DEFAULT_PRODUCTION_MAX_CLIPS,
): ClipPlanEntry[] {
  if (!clipPlan?.length || clipPlan.length < 2) return [];
  const cap = Math.max(2, Math.min(maxClips, 24));
  return clipPlan.slice(0, cap);
}

export function suggestedSceneCount(clipPlan: ClipPlanEntry[] | undefined): number {
  const plan = resolveProductionClipPlan(clipPlan);
  if (plan.length >= 2) return Math.min(12, Math.max(2, plan.length));
  return 4;
}

export function buildClipSegmentPrompt(
  basePrompt: string,
  clip: ClipPlanEntry,
  index: number,
  total: number,
): string {
  const header = `[MV segment ${index + 1}/${total} · ${clip.start.toFixed(1)}s–${clip.end.toFixed(1)}s${clip.label ? ` ${clip.label}` : ""} · cut on beat]`;
  const body = basePrompt.trim();
  return body ? `${header}\n${body}` : header;
}
