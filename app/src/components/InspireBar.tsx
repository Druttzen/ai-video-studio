import { useEffect, useState } from "react";
import {
  DEFAULT_NEGATIVE,
  DirectorCatalog,
  StyleProfile,
  buildBriefFromTemplate,
  buildPromptFromTemplate,
  listTemplateNames,
  loadDirectorCatalog,
  randomInspire,
} from "../lib/director-catalog";

type Mode = "generate" | "music-video";

interface Props {
  mode: Mode;
  onPrompt?: (prompt: string, negative?: string) => void;
  onBrief?: (brief: string) => void;
}

export default function InspireBar({ mode, onPrompt, onBrief }: Props) {
  const [catalog, setCatalog] = useState<DirectorCatalog | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [styleName, setStyleName] = useState("cinematic");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDirectorCatalog()
      .then(setCatalog)
      .catch((e) => setError(String(e)));
  }, []);

  if (error) {
    return <p className="desc warn-text">Inspire catalog unavailable: {error}</p>;
  }
  if (!catalog) {
    return <p className="desc">Loading inspire catalog…</p>;
  }

  const templates = listTemplateNames(catalog);
  const styles = catalog.styleProfiles;

  function selectedStyle(): StyleProfile | undefined {
    return styles.find((s) => s.name === styleName) ?? styles[0];
  }

  function applyTemplate(name: string) {
    const t = catalog!.sceneTemplates[name];
    if (!t) return;
    const style = selectedStyle();
    const prompt = buildPromptFromTemplate(t, style?.style);
    const brief = buildBriefFromTemplate(t);
    if (mode === "generate" && onPrompt) {
      onPrompt(prompt, DEFAULT_NEGATIVE);
    } else if (onBrief) {
      onBrief(brief);
    }
    setTemplateName(name);
  }

  function inspireRandom() {
    const { prompt, brief, style } = randomInspire(catalog!);
    setStyleName(style.name);
    if (mode === "generate" && onPrompt) {
      onPrompt(prompt, DEFAULT_NEGATIVE);
    } else if (onBrief) {
      onBrief(brief);
    }
  }

  return (
    <div className="inspire-bar card" style={{ marginBottom: 16, padding: 14 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>Director inspire</h3>
        <button type="button" className="ghost" onClick={inspireRandom}>
          Inspire me
        </button>
      </div>

      <div className="field" style={{ marginBottom: 8 }}>
        <label>Scene template</label>
        <select
          value={templateName}
          onChange={(e) => {
            const v = e.target.value;
            setTemplateName(v);
            if (v) applyTemplate(v);
          }}
        >
          <option value="">— pick a template —</option>
          {templates.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Style profile</label>
        <div className="seg" style={{ flexWrap: "wrap" }}>
          {styles.map((s) => (
            <button
              key={s.name}
              type="button"
              className={styleName === s.name ? "active" : ""}
              onClick={() => {
                setStyleName(s.name);
                if (templateName) applyTemplate(templateName);
              }}
              title={s.style}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
