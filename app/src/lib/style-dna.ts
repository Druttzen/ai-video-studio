/**
 * Lightweight Style-DNA brief enrichment (inspired by ai-music-tool).
 * Maps comma-separated style tokens / artist search to visual brief hints.
 */

const ENERGY_WORDS = ["energetic", "hype", "intense", "aggressive", "fast", "driving"];
const DREAMY_WORDS = ["dreamy", "ambient", "ethereal", "calm", "soft", "slow"];
const DARK_WORDS = ["dark", "moody", "noir", "gloomy", "ominous"];
const NEON_WORDS = ["neon", "cyberpunk", "synth", "electronic", "edm", "techno"];

export interface StyleDnaHints {
  mood: string;
  visualStyle: string;
  camera: string;
  lighting: string;
}

function hasAny(text: string, words: string[]): boolean {
  const low = text.toLowerCase();
  return words.some((w) => low.includes(w));
}

export function inferStyleDnaFromText(styleText: string): StyleDnaHints {
  const t = styleText.trim();
  if (!t) {
    return {
      mood: "cinematic",
      visualStyle: "cinematic, film grain, high detail",
      camera: "smooth tracking shot",
      lighting: "soft cinematic lighting",
    };
  }

  let mood = "cinematic";
  if (hasAny(t, ENERGY_WORDS)) mood = "energetic";
  else if (hasAny(t, DREAMY_WORDS)) mood = "dreamy";
  else if (hasAny(t, DARK_WORDS)) mood = "dark";
  else if (hasAny(t, NEON_WORDS)) mood = "vibrant";

  const visualStyle = hasAny(t, NEON_WORDS)
    ? "neon cyberpunk, vivid colors, reflective surfaces"
    : hasAny(t, DARK_WORDS)
      ? "moody noir, deep shadows, high contrast"
      : "cinematic, polished grade, high detail";

  const camera = hasAny(t, ENERGY_WORDS)
    ? "dynamic handheld, fast cuts"
    : hasAny(t, DREAMY_WORDS)
      ? "slow dolly, floating camera"
      : "cinematic tracking shot";

  const lighting = hasAny(t, DARK_WORDS)
    ? "high-contrast noir lighting"
    : hasAny(t, NEON_WORDS)
      ? "neon practicals, colored gels"
      : "soft cinematic lighting";

  return { mood, visualStyle, camera, lighting };
}

export function enrichBriefWithStyleDna(brief: string, styleText: string): string {
  const base = brief.trim();
  const hints = inferStyleDnaFromText(styleText);
  const chunk = `${hints.visualStyle}, ${hints.camera}, ${hints.lighting}, ${hints.mood} mood`;
  if (!base) return chunk;
  if (base.toLowerCase().includes(hints.mood)) return `${base}, ${hints.visualStyle}`;
  return `${base}, ${chunk}`;
}

/** MusicBrainz tag lookup (public API, no key). Best-effort. */
export async function fetchMusicBrainzStyleHints(
  query: string,
): Promise<string | null> {
  const q = query.trim();
  if (q.length < 2) return null;
  const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(q)}&fmt=json&limit=1`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "DjMAD-AI-Video-Tool/0.2.5 (style-dna)" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      recordings?: { tags?: { name: string }[]; title?: string }[];
    };
    const tags = data.recordings?.[0]?.tags?.map((t) => t.name) ?? [];
    if (!tags.length) return null;
    return tags.slice(0, 6).join(", ");
  } catch {
    return null;
  }
}
