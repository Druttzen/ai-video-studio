/** Director catalog — scene templates, styles, and random inspiration (from ai-video-tool). */

export interface SceneTemplate {
  topic: string;
  env: string;
  camera: string;
  mood: string;
  length?: string;
  fps?: string;
  ratio?: string;
}

export interface StyleProfile {
  name: string;
  label: string;
  style: string;
}

export interface DirectorCatalog {
  version: string;
  sceneTemplates: Record<string, SceneTemplate>;
  styleProfiles: StyleProfile[];
  randomInspiration: {
    topics: string[];
    envs: string[];
    cameras: string[];
    moods: string[];
    lengths: string[];
    fps: string[];
    ratios: string[];
  };
  examplePrompts?: { text: string }[];
}

let cached: DirectorCatalog | null = null;

export async function loadDirectorCatalog(): Promise<DirectorCatalog> {
  if (cached) return cached;
  const res = await fetch("/director-catalog.json");
  if (!res.ok) throw new Error("Failed to load director catalog");
  cached = (await res.json()) as DirectorCatalog;
  return cached;
}

export function buildPromptFromTemplate(
  template: SceneTemplate,
  styleLine?: string,
): string {
  const parts = [
    styleLine,
    template.topic,
    template.env,
    template.camera,
    template.mood,
  ].filter(Boolean);
  return parts.join(", ");
}

export function buildBriefFromTemplate(template: SceneTemplate): string {
  return [template.topic, template.env, template.mood].filter(Boolean).join(", ");
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randomInspire(catalog: DirectorCatalog): {
  prompt: string;
  brief: string;
  template: SceneTemplate;
  style: StyleProfile;
} {
  const ri = catalog.randomInspiration;
  const style = pick(catalog.styleProfiles);
  const template: SceneTemplate = {
    topic: pick(ri.topics),
    env: pick(ri.envs),
    camera: pick(ri.cameras),
    mood: pick(ri.moods),
    length: pick(ri.lengths),
    fps: pick(ri.fps),
    ratio: pick(ri.ratios),
  };
  return {
    template,
    style,
    prompt: buildPromptFromTemplate(template, style.style),
    brief: buildBriefFromTemplate(template),
  };
}

export function listTemplateNames(catalog: DirectorCatalog): string[] {
  return Object.keys(catalog.sceneTemplates).sort();
}

export const DEFAULT_NEGATIVE =
  "worst quality, blurry, distorted, watermark, text overlay, jitter";
