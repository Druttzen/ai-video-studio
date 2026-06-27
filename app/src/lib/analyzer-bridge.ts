/** Bridge analyzer results → Music Video / Canvas presets (Path E). */

import type { AudioAnalysis, ImageAnalysis } from "../api";
import {
  HANDOFF_INTENTS,
  MV_DURATION_MODES,
  type MusicCreatorBundle,
  type MvDurationMode,
  applyHandoff,
} from "./music-handoff";

export interface AnalyzerSession {
  audioB64: string | null;
  audioName: string;
  audioAnalysis: AudioAnalysis | null;
  imageB64: string | null;
  imageName: string;
  imageAnalysis: ImageAnalysis | null;
}

export const emptyAnalyzerSession = (): AnalyzerSession => ({
  audioB64: null,
  audioName: "",
  audioAnalysis: null,
  imageB64: null,
  imageName: "",
  imageAnalysis: null,
});

export interface MusicVideoAnalyzerSeed {
  brief: string;
  audioB64: string;
  audioName: string;
  audioAnalysis: AudioAnalysis;
  imageB64: string | null;
  imageName: string;
  imageAnalysis: ImageAnalysis | null;
  durationMode: MvDurationMode;
  rangeStart: number;
  rangeEnd: number;
  lipSync: boolean;
  preferImageToVideo: boolean;
  note: string;
}

export interface CanvasAnalyzerSeed {
  brief: string;
  audioB64: string | null;
  audioName: string;
  imageB64: string;
  imageName: string;
  imageAnalysis: ImageAnalysis;
  note: string;
}

export function pathEReady(session: AnalyzerSession): boolean {
  return Boolean(session.audioB64 && session.audioAnalysis && session.imageB64 && session.imageAnalysis);
}

export function buildBriefFromAnalyses(
  audio: AudioAnalysis | null,
  image: ImageAnalysis | null,
  extra?: string,
): string {
  const parts = [
    extra?.trim(),
    image?.summary,
    image?.visual_mood ? `Visual: ${image.visual_mood}` : "",
    audio?.summary,
    audio?.tempo ? `${Math.round(audio.tempo)} BPM cinematic music video` : "",
  ].filter(Boolean);
  return parts.join(". ").slice(0, 2000) || "cinematic music video";
}

export function buildMusicVideoSeedFromSession(
  session: AnalyzerSession,
  opts?: { durationMode?: MvDurationMode; extraBrief?: string },
): MusicVideoAnalyzerSeed | null {
  if (!session.audioB64 || !session.audioAnalysis) return null;
  const audio = session.audioAnalysis;
  const durationMode = opts?.durationMode ?? MV_DURATION_MODES.FULL;
  const fullEnd = audio.duration;
  const hiStart = audio.highlight_start ?? 0;
  const hiEnd = audio.highlight_end ?? fullEnd;
  const rangeStart = durationMode === MV_DURATION_MODES.HIGHLIGHT ? hiStart : 0;
  const rangeEnd = durationMode === MV_DURATION_MODES.HIGHLIGHT ? hiEnd : fullEnd;
  const pathE = pathEReady(session);

  return {
    brief: buildBriefFromAnalyses(audio, session.imageAnalysis, opts?.extraBrief),
    audioB64: session.audioB64,
    audioName: session.audioName,
    audioAnalysis: audio,
    imageB64: session.imageB64,
    imageName: session.imageName,
    imageAnalysis: session.imageAnalysis,
    durationMode,
    rangeStart,
    rangeEnd,
    lipSync: Boolean(audio.vocals_likely),
    preferImageToVideo: pathE,
    note: pathE ? "Path E — track + picture analyzed" : "Track analyzed",
  };
}

export function buildCanvasSeedFromSession(session: AnalyzerSession): CanvasAnalyzerSeed | null {
  if (!session.imageB64 || !session.imageAnalysis) return null;
  return {
    brief: buildBriefFromAnalyses(session.audioAnalysis, session.imageAnalysis),
    audioB64: session.audioB64,
    audioName: session.audioName,
    imageB64: session.imageB64,
    imageName: session.imageName,
    imageAnalysis: session.imageAnalysis,
    note: session.audioAnalysis ? "Picture + track for canvas loop" : "Picture analyzed for canvas",
  };
}

export function sessionFromHandoffBundle(
  bundle: MusicCreatorBundle,
  audioB64?: string | null,
): { session: Partial<AnalyzerSession>; apply: ReturnType<typeof applyHandoff> } {
  const apply = applyHandoff(bundle);
  return {
    apply,
    session: {
      audioB64: audioB64 ?? null,
      audioName: apply.audioSidecarName ?? "",
      audioAnalysis: apply.audioAnalysis as AudioAnalysis | null,
      imageAnalysis: apply.imageAnalysis as ImageAnalysis | null,
    },
  };
}

export function handoffIntentLabel(intent: string): string {
  if (intent === HANDOFF_INTENTS.MUSIC_VIDEO_PATH_E) return "Path E";
  if (intent === HANDOFF_INTENTS.MUSIC_VIDEO_TRACK) return "Track MV";
  return "Project";
}
