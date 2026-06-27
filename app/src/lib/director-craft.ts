/** Director visual craft — shot/camera/lighting/color enrichment (from ai-video-tool). */

import { DirectorCatalog } from "./director-catalog";

export interface DirectorCraftSettings {
  styleProfile: string;
  shotType: string;
  cameraPreset: string;
  lensKit: string;
  filmFormat: string;
  colorGrade: string;
  lightingSetup: string;
}

export const DEFAULT_DIRECTOR_CRAFT: DirectorCraftSettings = {
  styleProfile: "cinematic",
  shotType: "",
  cameraPreset: "",
  lensKit: "",
  filmFormat: "",
  colorGrade: "",
  lightingSetup: "",
};

const STORAGE_KEY = "ave_director_craft_v1";

export function loadDirectorCraft(): DirectorCraftSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DIRECTOR_CRAFT };
    return { ...DEFAULT_DIRECTOR_CRAFT, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_DIRECTOR_CRAFT };
  }
}

export function saveDirectorCraft(settings: DirectorCraftSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function phrase(map: Record<string, string> | undefined, key: string, label: string): string {
  if (!key || !map?.[key]) return "";
  return `${label}: ${map[key]}`;
}

export function buildCraftSuffix(
  catalog: DirectorCatalog,
  craft: DirectorCraftSettings,
): string {
  const parts: string[] = [];
  const style = catalog.styleProfiles.find((s) => s.name === craft.styleProfile);
  if (style?.style) parts.push(style.style);
  parts.push(phrase(catalog.shotTypes, craft.shotType, "Shot type"));
  if (craft.cameraPreset || craft.lensKit) {
    parts.push(
      `Camera: ${craft.cameraPreset || "cinema body"}, Lens: ${craft.lensKit || "35mm prime"}, stabilized cinematic motion`,
    );
  }
  if (craft.filmFormat) parts.push(`Film format: ${craft.filmFormat}`);
  parts.push(phrase(catalog.lightingSetups, craft.lightingSetup, "Lighting setup"));
  parts.push(phrase(catalog.colorPipelines, craft.colorGrade, "Color pipeline"));
  return parts.filter(Boolean).join(", ");
}

export function enrichBriefWithCraft(
  brief: string,
  catalog: DirectorCatalog,
  craft: DirectorCraftSettings,
): string {
  const base = brief.trim();
  const suffix = buildCraftSuffix(catalog, craft);
  if (!suffix) return base;
  return base ? `${base}, ${suffix}` : suffix;
}

export function craftToPayload(
  catalog: DirectorCatalog,
  craft: DirectorCraftSettings,
): Record<string, string> {
  const style = catalog.styleProfiles.find((s) => s.name === craft.styleProfile);
  return {
    style_line: style?.style ?? "",
    shot_type: catalog.shotTypes?.[craft.shotType] ?? craft.shotType,
    camera: craft.cameraPreset,
    lens: craft.lensKit,
    film_format: craft.filmFormat,
    lighting: catalog.lightingSetups?.[craft.lightingSetup] ?? craft.lightingSetup,
    color_grade: catalog.colorPipelines?.[craft.colorGrade] ?? craft.colorGrade,
  };
}

export function catalogCraftOptions(catalog: DirectorCatalog) {
  return {
    shotTypes: Object.keys(catalog.shotTypes ?? {}),
    lightingSetups: Object.keys(catalog.lightingSetups ?? {}),
    colorGrades: Object.keys(catalog.colorPipelines ?? {}),
    cameraPresets: catalog.cameraPresets ?? [],
    lensKits: catalog.lensKits ?? [],
    filmFormats: catalog.filmFormats ?? [],
    styleProfiles: catalog.styleProfiles ?? [],
  };
}
