import { invoke } from "@tauri-apps/api/core";

export interface RecommendedDefaults {
  preset: string;
  width: number;
  height: number;
  num_frames: number;
  fps: number;
  num_inference_steps: number;
  guidance_scale: number;
  clip_frames: number;
  n_scenes: number;
}

export interface DeviceInfo {
  backend: string;
  device: string;
  name: string;
  total_vram_gb: number;
  torch_available: boolean;
  torch_version: string | null;
  cuda_version: string | null;
}

export interface Health {
  status: string;
  version: string;
  device: DeviceInfo;
  policy: Record<string, unknown>;
  recommended_defaults: RecommendedDefaults;
  settings: { data_dir: string; models_dir: string; outputs_dir: string };
  onboarding?: {
    complete: boolean;
    has_model: boolean;
    default_model_id: string;
  };
}

export interface ModelStatus {
  id: string;
  name: string;
  repo_id: string;
  tasks: string[];
  license: string;
  commercial_use: boolean;
  min_vram_gb: number;
  approx_size_gb: number;
  description: string;
  default_params: Record<string, number>;
  downloaded: boolean;
  disk_size_gb: number;
  status: "idle" | "downloading" | "ready" | "error";
  progress: number;
  message: string;
  error: string | null;
}

export interface GenerationRequest {
  model_id: string;
  task: string;
  prompt: string;
  negative_prompt?: string;
  image_b64?: string | null;
  width: number;
  height: number;
  num_frames: number;
  fps: number;
  num_inference_steps: number;
  guidance_scale: number;
  seed?: number | null;
  extra?: Record<string, number>;
}

export interface JobStatus {
  job_id: string;
  kind: string;
  label: string;
  status: "queued" | "running" | "done" | "error" | "cancelled";
  progress: number;
  step: number;
  total_steps: number;
  message: string;
  output_path: string | null;
  error: string | null;
  request: Record<string, unknown> | null;
}

export interface ClipPlanEntry {
  start: number;
  end: number;
  duration: number;
  label: string;
}

export interface AudioAnalysis {
  path: string;
  duration: number;
  tempo: number;
  beats: number[];
  downbeats: number[];
  sections: number[];
  energy: number[];
  beats_per_bar: number;
  num_beats: number;
  onsets?: number[];
  vocals_likely?: boolean;
  clip_plan?: ClipPlanEntry[];
  clip_count?: number;
  clip_duration_sec?: number;
  range_start?: number;
  range_end?: number;
}

export interface MusicVideoRequest {
  model_id: string;
  task: string;
  brief: string;
  audio_b64?: string | null;
  image_b64?: string | null;
  face_b64?: string | null;
  width: number;
  height: number;
  fps: number;
  clip_frames: number;
  num_inference_steps: number;
  guidance_scale: number;
  seed?: number | null;
  n_scenes: number;
  beats_per_cut: number;
  length_sync: boolean;
  lip_sync: boolean;
  use_clip_plan?: boolean;
  min_clip_sec?: number;
  max_clip_sec?: number;
}

export interface CanvasRequest {
  model_id: string;
  task: string;
  brief: string;
  audio_b64?: string | null;
  image_b64?: string | null;
  target_seconds: number;
  width: number;
  height: number;
  fps: number;
  clip_frames: number;
  num_inference_steps: number;
  guidance_scale: number;
  seed?: number | null;
  loop_method: "pingpong" | "crossfade";
  crossfade: number;
  with_audio: boolean;
}

export const KIND_LABELS: Record<string, string> = {
  generate: "Generate",
  "music-video": "Music Video",
  canvas: "Spotify Canvas",
};

export const api = {
  health: () => invoke<Health>("engine_health"),
  completeOnboarding: () => invoke<{ complete: boolean }>("complete_onboarding"),
  listModels: () => invoke<ModelStatus[]>("list_models"),
  downloadModel: (model_id: string) =>
    invoke<ModelStatus>("download_model", { modelId: model_id }),
  deleteModel: (model_id: string) =>
    invoke<ModelStatus>("delete_model", { modelId: model_id }),
  generate: (request: GenerationRequest) =>
    invoke<{ job_id: string }>("generate", { request }),
  analyzeAudio: (audio_b64: string, opts?: { min_clip_sec?: number; max_clip_sec?: number }) =>
    invoke<AudioAnalysis>("analyze_audio", {
      request: {
        audio_b64,
        min_clip_sec: opts?.min_clip_sec ?? 4,
        max_clip_sec: opts?.max_clip_sec ?? 8,
      },
    }),
  createMusicVideo: (request: MusicVideoRequest) =>
    invoke<{ job_id: string }>("create_music_video", { request }),
  createCanvas: (request: CanvasRequest) =>
    invoke<{ job_id: string }>("create_canvas", { request }),
  listJobs: () => invoke<JobStatus[]>("list_jobs"),
  jobStatus: (job_id: string) =>
    invoke<JobStatus>("job_status", { jobId: job_id }),
  cancelJob: (job_id: string) =>
    invoke<{ cancelled: boolean }>("cancel_job", { jobId: job_id }),
  openFolder: (path: string) => invoke<void>("open_folder", { path }),
  revealInExplorer: (path: string) =>
    invoke<void>("reveal_in_explorer", { path }),
};

export async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}
