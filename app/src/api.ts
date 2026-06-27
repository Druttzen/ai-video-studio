import { invoke } from "@tauri-apps/api/core";

export interface UpdateInfo {
  available: boolean;
  current_version: string;
  latest_version: string;
  release_url: string;
  download_url: string | null;
}

export interface AppBootstrap {
  app_version: string;
  engine_installed: boolean;
  update: UpdateInfo;
}

export interface SetupScanItem {
  id: string;
  action: string;
  label: string;
  bytes: number;
  eta_minutes: number;
}

export interface SetupScanModel {
  id: string;
  name: string;
  bytes: number;
  eta_minutes: number;
  eligible: boolean;
  auto_download: boolean;
}

export interface SetupScanAddon {
  id: string;
  name: string;
  bytes: number;
  eta_minutes: number;
  auto_install: boolean;
}

export interface SetupScanPhase {
  id: string;
  title: string;
  description?: string;
  index: number;
  total: number;
}

export interface SetupScan {
  hardware: {
    gpu_present: boolean;
    gpu_name: string;
    vram_gb: number;
    webview2: boolean;
    data_dir: string;
    disks: { root: string; free_gb: number }[];
  };
  engine_installed: boolean;
  items: SetupScanItem[];
  models: SetupScanModel[];
  addons?: SetupScanAddon[];
  phases?: SetupScanPhase[];
  total_bytes: number;
  eta_minutes: number;
  can_run: boolean;
  blocked: string[];
}

export interface SetupProgress {
  phase: string;
  label: string;
  percent: number;
  done_bytes: number;
  total_bytes: number;
  eta_seconds: number;
  message: string;
}

export interface SetupStep {
  id: string;
  title: string;
  state: string;
  index: number;
  total: number;
}

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
  highlight_start?: number;
  highlight_end?: number;
  summary?: string;
}

export interface ImageAnalysis {
  path: string;
  width: number;
  height: number;
  aspect: number;
  brightness: number;
  palette: string[];
  is_portrait: boolean;
  avg_color?: string;
  dominant_hue?: number;
  hue_label?: string;
  color_temperature?: string;
  aspect_label?: string;
  saturation?: number;
  contrast?: number;
  visual_mood?: string;
  suggested_genres?: string[];
  suggested_sounds?: string[];
  suggested_rhythms?: string[];
  summary?: string;
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
  max_clips?: number;
  range_start?: number;
  range_end?: number;
  duration_mode?: "full" | "highlight";
  separate_vocals?: boolean;
  director_craft?: Record<string, string>;
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
  bootstrap: () => invoke<AppBootstrap>("app_bootstrap"),
  setupScan: () => invoke<SetupScan>("setup_scan"),
  setupRun: () => invoke<void>("setup_run"),
  openAppUpdate: (url: string) => invoke<void>("open_app_update", { url }),
  restartEngine: () => invoke<void>("restart_engine"),
  health: () => invoke<Health>("engine_health"),
  completeOnboarding: () => invoke<{ complete: boolean }>("complete_onboarding"),
  listModels: () => invoke<ModelStatus[]>("list_models"),
  downloadModel: (model_id: string) =>
    invoke<ModelStatus>("download_model", { modelId: model_id }),
  deleteModel: (model_id: string) =>
    invoke<ModelStatus>("delete_model", { modelId: model_id }),
  generate: (request: GenerationRequest) =>
    invoke<{ job_id: string }>("generate", { request }),
  analyzeAudio: (
    audio_b64: string,
    opts?: {
      min_clip_sec?: number;
      max_clip_sec?: number;
      range_start?: number;
      range_end?: number;
      max_clips?: number;
    },
  ) =>
    invoke<AudioAnalysis>("analyze_audio", {
      request: {
        audio_b64,
        min_clip_sec: opts?.min_clip_sec ?? 4,
        max_clip_sec: opts?.max_clip_sec ?? 8,
        range_start: opts?.range_start ?? 0,
        range_end: opts?.range_end ?? -1,
        max_clips: opts?.max_clips ?? 8,
      },
    }),
  analyzeImage: (image_b64: string) =>
    invoke<ImageAnalysis>("analyze_image", {
      request: { image_b64 },
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
