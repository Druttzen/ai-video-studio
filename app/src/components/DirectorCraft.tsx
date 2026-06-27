import { useEffect, useState } from "react";
import {
  DirectorCraftSettings,
  DEFAULT_DIRECTOR_CRAFT,
  catalogCraftOptions,
  loadDirectorCraft,
  saveDirectorCraft,
} from "../lib/director-craft";
import { DirectorCatalog, loadDirectorCatalog } from "../lib/director-catalog";

interface Props {
  onChange: (craft: DirectorCraftSettings) => void;
}

export default function DirectorCraft({ onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [craft, setCraft] = useState<DirectorCraftSettings>(loadDirectorCraft);
  const [catalog, setCatalog] = useState<DirectorCatalog | null>(null);

  useEffect(() => {
    loadDirectorCatalog().then(setCatalog).catch(() => {});
  }, []);

  useEffect(() => {
    onChange(craft);
  }, [craft, onChange]);

  function update<K extends keyof DirectorCraftSettings>(key: K, value: DirectorCraftSettings[K]) {
    setCraft((c) => {
      const next = { ...c, [key]: value };
      saveDirectorCraft(next);
      return next;
    });
  }

  if (!catalog) return null;
  const opts = catalogCraftOptions(catalog);

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <button
        type="button"
        className="ghost"
        style={{ width: "100%", textAlign: "left" }}
        onClick={() => setOpen(!open)}
      >
        {open ? "▾" : "▸"} Director craft (shot, camera, lighting)
      </button>
      {open && (
        <div className="row3" style={{ marginTop: 8 }}>
          <Sel
            label="Style profile"
            value={craft.styleProfile}
            options={opts.styleProfiles.map((s) => s.name)}
            on={(v) => update("styleProfile", v)}
          />
          <Sel
            label="Shot type"
            value={craft.shotType}
            options={["", ...opts.shotTypes]}
            on={(v) => update("shotType", v)}
          />
          <Sel
            label="Lighting"
            value={craft.lightingSetup}
            options={["", ...opts.lightingSetups]}
            on={(v) => update("lightingSetup", v)}
          />
          <Sel
            label="Color grade"
            value={craft.colorGrade}
            options={["", ...opts.colorGrades]}
            on={(v) => update("colorGrade", v)}
          />
          <Sel
            label="Camera body"
            value={craft.cameraPreset}
            options={["", ...opts.cameraPresets]}
            on={(v) => update("cameraPreset", v)}
          />
          <Sel
            label="Lens kit"
            value={craft.lensKit}
            options={["", ...opts.lensKits]}
            on={(v) => update("lensKit", v)}
          />
          <Sel
            label="Film format"
            value={craft.filmFormat}
            options={["", ...opts.filmFormats]}
            on={(v) => update("filmFormat", v)}
          />
        </div>
      )}
    </div>
  );
}

function Sel({
  label,
  value,
  options,
  on,
}: {
  label: string;
  value: string;
  options: string[];
  on: (v: string) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value} onChange={(e) => on(e.target.value)}>
        {options.map((o) => (
          <option key={o || "_"} value={o}>
            {o || "—"}
          </option>
        ))}
      </select>
    </div>
  );
}

export { DEFAULT_DIRECTOR_CRAFT };
