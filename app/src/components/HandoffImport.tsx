import { useRef, useState } from "react";
import {
  HandoffApplyResult,
  parseMusicCreatorBundle,
  applyHandoff,
  readJsonFile,
} from "../lib/music-handoff";

interface Props {
  onApplied: (result: HandoffApplyResult) => void;
  onError: (e: unknown) => void;
}

export default function HandoffImport({ onApplied, onError }: Props) {
  const [status, setStatus] = useState<string | null>(null);
  const jsonRef = useRef<HTMLInputElement>(null);

  async function onJson(file: File) {
    try {
      const raw = await readJsonFile(file);
      const bundle = parseMusicCreatorBundle(raw);
      const result = applyHandoff(bundle);
      onApplied(result);
      setStatus(result.note);
    } catch (e) {
      onError(e);
      setStatus(null);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="field">
        <label>Import from AI Music Creator</label>
        <p className="desc">
          Load a project bundle JSON (with handoff v2) exported from AI Music Creator.
        </p>
        <label className="dropzone" style={{ display: "block" }}>
          {status ?? "Click to choose bundle .json"}
          <input
            ref={jsonRef}
            type="file"
            accept=".json,application/json"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onJson(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
    </div>
  );
}
