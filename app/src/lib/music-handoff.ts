/** Import AI Music Creator → Video Tool handoff bundles (v2). */

import type { AudioAnalysis, ImageAnalysis } from "../api";

export const HANDOFF_SOURCE_MUSIC = "ai-music-creator";
export const PROJECT_BUNDLE_FORMAT = "ai-music-creator-bundle";

export const HANDOFF_INTENTS = {
  MUSIC_VIDEO_PATH_E: "music-video-path-e",
  MUSIC_VIDEO_TRACK: "music-video-track",
  PROJECT_ONLY: "project-only",
} as const;

export const MV_DURATION_MODES = {
  FULL: "full",
  HIGHLIGHT: "highlight",
} as const;

export type MvDurationMode = (typeof MV_DURATION_MODES)[keyof typeof MV_DURATION_MODES];

export interface MusicCreatorHandoff {
  source?: string;
  intent?: string;
  exportedAt?: string;
  musicAppVersion?: string;
  audioAnalysis?: Record<string, unknown> | null;
  imageAnalysis?: Record<string, unknown> | null;
  audioSidecarName?: string | null;
  sunoPasteStyle?: string;
  sunoPasteLyrics?: string;
  durationMode?: MvDurationMode;
}

export interface MusicCreatorBundle {
  bundleFormat?: string;
  bundleVersion?: number;
  exportedAt?: string;
  appVersion?: string;
  project?: Record<string, unknown>;
  handoff?: MusicCreatorHandoff;
  directorSettings?: Record<string, unknown>;
}

export interface HandoffApplyResult {
  brief: string;
  intent: string;
  durationMode: MvDurationMode;
  rangeStart: number;
  rangeEnd: number;
  preferImageToVideo: boolean;
  lipSyncHint: boolean;
  audioSidecarName: string | null;
  note: string;
  styleTokens: string;
  audioAnalysis: Partial<AudioAnalysis> | null;
  imageAnalysis: Partial<ImageAnalysis> | null;
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function parseMusicCreatorBundle(raw: unknown): MusicCreatorBundle {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid project file — expected JSON object");
  }
  const obj = raw as Record<string, unknown>;
  if (obj.bundleFormat === PROJECT_BUNDLE_FORMAT) {
    return {
      bundleFormat: PROJECT_BUNDLE_FORMAT,
      bundleVersion: num(obj.bundleVersion, 2),
      exportedAt: str(obj.exportedAt) || undefined,
      appVersion: str(obj.appVersion) || undefined,
      project:
        obj.project && typeof obj.project === "object"
          ? (obj.project as Record<string, unknown>)
          : {},
      handoff:
        obj.handoff && typeof obj.handoff === "object"
          ? (obj.handoff as MusicCreatorHandoff)
          : undefined,
      directorSettings:
        obj.directorSettings && typeof obj.directorSettings === "object"
          ? (obj.directorSettings as Record<string, unknown>)
          : undefined,
    };
  }
  return { project: { ...obj } };
}

export function resolveHandoffIntent(handoff: MusicCreatorHandoff | undefined): string {
  if (handoff?.intent) return handoff.intent;
  if (handoff?.audioAnalysis && handoff?.imageAnalysis) {
    return HANDOFF_INTENTS.MUSIC_VIDEO_PATH_E;
  }
  if (handoff?.audioAnalysis) return HANDOFF_INTENTS.MUSIC_VIDEO_TRACK;
  return HANDOFF_INTENTS.PROJECT_ONLY;
}

export function songDurationSec(audio: Record<string, unknown> | null | undefined): number {
  if (!audio) return 180;
  const d = num(audio.durationSec ?? audio.duration, 180);
  return Math.min(480, Math.max(1, d));
}

export function highlightRange(audio: Record<string, unknown> | null | undefined): {
  start: number;
  end: number;
} {
  const raw = songDurationSec(audio);
  const start = Math.max(0, num(audio?.highlightStart ?? audio?.highlight_start, 0));
  const end = Math.min(raw, num(audio?.highlightEnd ?? audio?.highlight_end, raw));
  if (end - start >= 6) return { start, end };
  const mid = raw / 2;
  return { start: Math.max(0, mid - 15), end: Math.min(raw, mid + 15) };
}

export function mapHandoffAudio(
  raw: Record<string, unknown> | null | undefined,
): Partial<AudioAnalysis> | null {
  if (!raw) return null;
  const dur = songDurationSec(raw);
  const hi = highlightRange(raw);
  const beatSync = raw.beatSync as Record<string, unknown> | undefined;
  const tempo = Number(raw.tempo ?? beatSync?.tempo ?? 120);
  return {
    duration: dur,
    tempo: Number.isFinite(tempo) ? tempo : 120,
    beats: Array.isArray(raw.beats) ? (raw.beats as number[]) : [],
    vocals_likely: Boolean(beatSync?.vocalsLikely ?? raw.vocalsLikely),
    highlight_start: hi.start,
    highlight_end: hi.end,
    summary: typeof raw.summary === "string" ? raw.summary : undefined,
    path: "",
    downbeats: [],
    sections: [],
    energy: [],
    beats_per_bar: 4,
    num_beats: Array.isArray(raw.beats) ? raw.beats.length : 0,
  };
}

export function mapHandoffImage(
  raw: Record<string, unknown> | null | undefined,
): Partial<ImageAnalysis> | null {
  if (!raw) return null;
  const w = Number(raw.width ?? 0);
  const h = Number(raw.height ?? 0);
  return {
    width: w,
    height: h,
    aspect: w && h ? w / h : 1,
    brightness: Number(raw.brightness ?? 0.5),
    palette: Array.isArray(raw.palette) ? (raw.palette as string[]) : [],
    is_portrait: Boolean(raw.is_portrait ?? h > w),
    avg_color: typeof raw.avgColor === "string" ? raw.avgColor : "",
    dominant_hue: Number(raw.dominantHue ?? 0),
    hue_label: typeof raw.hueLabel === "string" ? raw.hueLabel : "",
    color_temperature: typeof raw.colorTemperature === "string" ? raw.colorTemperature : "neutral",
    aspect_label: typeof raw.aspectLabel === "string" ? raw.aspectLabel : "",
    saturation: Number(raw.saturation ?? 0),
    contrast: Number(raw.contrast ?? 0),
    visual_mood: typeof raw.visualMood === "string" ? raw.visualMood : "",
    suggested_genres: Array.isArray(raw.suggestedGenres) ? (raw.suggestedGenres as string[]) : [],
    suggested_sounds: Array.isArray(raw.suggestedSounds) ? (raw.suggestedSounds as string[]) : [],
    suggested_rhythms: Array.isArray(raw.suggestedRhythms) ? (raw.suggestedRhythms as string[]) : [],
    summary: typeof raw.summary === "string" ? raw.summary : "",
    path: "",
  };
}

export function buildBriefFromHandoff(bundle: MusicCreatorBundle): string {
  const project = bundle.project ?? {};
  const handoff = bundle.handoff;
  const parts = [
    str(project.idea),
    str(handoff?.sunoPasteStyle),
    str(project.lyricTheme),
    str((handoff?.imageAnalysis as Record<string, unknown> | undefined)?.summary),
    str((handoff?.audioAnalysis as Record<string, unknown> | undefined)?.summary),
  ].filter(Boolean);
  return parts.join(", ").slice(0, 2000);
}

export function applyHandoff(bundle: MusicCreatorBundle): HandoffApplyResult {
  const handoff = bundle.handoff ?? {};
  const audio = (handoff.audioAnalysis as Record<string, unknown> | undefined) ?? null;
  const intent = resolveHandoffIntent(handoff);
  const durationMode =
    handoff.durationMode === MV_DURATION_MODES.HIGHLIGHT
      ? MV_DURATION_MODES.HIGHLIGHT
      : MV_DURATION_MODES.FULL;
  const fullDur = songDurationSec(audio);
  const hi = highlightRange(audio);
  const rangeStart = durationMode === MV_DURATION_MODES.HIGHLIGHT ? hi.start : 0;
  const rangeEnd = durationMode === MV_DURATION_MODES.HIGHLIGHT ? hi.end : fullDur;
  const beatSync = audio?.beatSync as Record<string, unknown> | undefined;
  const lipSyncHint = Boolean(beatSync?.vocalsLikely ?? audio?.vocalsLikely);
  const brief = buildBriefFromHandoff(bundle);
  const intentLabel =
    intent === HANDOFF_INTENTS.MUSIC_VIDEO_PATH_E
      ? "Path E (track + image)"
      : intent === HANDOFF_INTENTS.MUSIC_VIDEO_TRACK
        ? "Track-only MV"
        : "Project brief";

  return {
    brief: brief || "cinematic music video",
    intent,
    durationMode,
    rangeStart,
    rangeEnd,
    preferImageToVideo: intent === HANDOFF_INTENTS.MUSIC_VIDEO_PATH_E,
    lipSyncHint,
    audioSidecarName: str(handoff.audioSidecarName) || null,
    note: `Imported ${intentLabel}${handoff.musicAppVersion ? ` from v${handoff.musicAppVersion}` : ""}`,
    styleTokens: str(handoff.sunoPasteStyle),
    audioAnalysis: mapHandoffAudio(audio),
    imageAnalysis: mapHandoffImage(handoff.imageAnalysis as Record<string, unknown> | undefined),
  };
}

export async function readJsonFile(file: File): Promise<unknown> {
  const text = await file.text();
  return JSON.parse(text) as unknown;
}
