import { useRef, useState } from "react";
import {
  HandoffApplyResult,
  parseMusicCreatorBundle,
  applyHandoff,
  readJsonFile,
} from "../lib/music-handoff";
import { fileToDataUrl } from "./shared";

interface Props {
  onApplied: (result: HandoffApplyResult) => void;
  onAudioSidecar?: (b64: string, name: string) => void;
  onError: (e: unknown) => void;
}

export default function HandoffImport({ onApplied, onAudioSidecar, onError }: Props) {
  const [status, setStatus] = useState<string | null>(null);
  const [pendingSidecar, setPendingSidecar] = useState<string | null>(null);
  const jsonRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const pendingResult = useRef<HandoffApplyResult | null>(null);

  async function onJson(file: File) {
    try {
      const raw = await readJsonFile(file);
      const bundle = parseMusicCreatorBundle(raw);
      const result = applyHandoff(bundle);
      onApplied(result);
      setStatus(result.note);
      if (result.audioSidecarName && onAudioSidecar) {
        pendingResult.current = result;
        setPendingSidecar(result.audioSidecarName);
      } else {
        pendingResult.current = null;
        setPendingSidecar(null);
      }
    } catch (e) {
      onError(e);
      setStatus(null);
      setPendingSidecar(null);
    }
  }

  async function onSidecar(file: File) {
    try {
      const b64 = await fileToDataUrl(file);
      onAudioSidecar?.(b64, file.name);
      setPendingSidecar(null);
      if (pendingResult.current) {
        setStatus(`${pendingResult.current.note} · audio loaded`);
      }
      pendingResult.current = null;
    } catch (e) {
      onError(e);
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
        {pendingSidecar ? (
          <div className="sidecar-prompt" style={{ marginTop: 10 }}>
            <p className="desc">
              Bundle references audio <strong>{pendingSidecar}</strong> — load the matching file.
            </p>
            <button type="button" className="ghost" onClick={() => audioRef.current?.click()}>
              Load audio sidecar
            </button>
            <input
              ref={audioRef}
              type="file"
              accept="audio/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onSidecar(f);
                e.target.value = "";
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
