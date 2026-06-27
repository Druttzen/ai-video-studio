import { useCallback, useRef, useState } from "react";
import { api, type AudioAnalysis, type ImageAnalysis } from "../api";
import {
  buildBriefFromAnalyses,
  buildCanvasSeedFromSession,
  buildMusicVideoSeedFromSession,
  emptyAnalyzerSession,
  handoffIntentLabel,
  pathEReady,
  sessionFromHandoffBundle,
  type AnalyzerSession,
  type CanvasAnalyzerSeed,
  type MusicVideoAnalyzerSeed,
} from "../lib/analyzer-bridge";
import { parseMusicCreatorBundle, readJsonFile } from "../lib/music-handoff";
import { fileToDataUrl } from "./shared";

interface Props {
  session: AnalyzerSession;
  onSessionChange: (session: AnalyzerSession) => void;
  onSendMusicVideo: (seed: MusicVideoAnalyzerSeed) => void;
  onSendCanvas: (seed: CanvasAnalyzerSeed) => void;
  showError: (e: unknown) => void;
}

function EnergyBar({ energy }: { energy: number[] }) {
  if (!energy.length) return null;
  const max = Math.max(...energy, 0.01);
  return (
    <div className="analyzer-energy">
      {energy.map((e, i) => (
        <span
          key={i}
          style={{ height: `${Math.max(4, (e / max) * 100)}%` }}
          title={`${(i / energy.length).toFixed(2)}`}
        />
      ))}
    </div>
  );
}

function PaletteSwatches({ colors }: { colors: string[] }) {
  if (!colors.length) return null;
  return (
    <div className="analyzer-palette">
      {colors.map((c) => (
        <span key={c} style={{ background: c }} title={c} />
      ))}
    </div>
  );
}

function AudioReport({ a }: { a: AudioAnalysis }) {
  return (
    <div className="analyzer-report">
      <p className="analyzer-summary">
        {a.summary || `${Math.round(a.tempo)} BPM · ${a.duration.toFixed(1)}s`}
      </p>
      <dl className="analyzer-dl">
        <dt>Tempo</dt>
        <dd>{Math.round(a.tempo)} BPM</dd>
        <dt>Beats</dt>
        <dd>{a.num_beats ?? a.beats?.length ?? 0}</dd>
        <dt>Clips</dt>
        <dd>{a.clip_count ?? a.clip_plan?.length ?? "—"}</dd>
        <dt>Highlight</dt>
        <dd>
          {(a.highlight_start ?? 0).toFixed(1)}s – {(a.highlight_end ?? a.duration).toFixed(1)}s
        </dd>
        <dt>Vocals</dt>
        <dd>{a.vocals_likely ? "Likely" : "Instrumental"}</dd>
      </dl>
      <EnergyBar energy={a.energy ?? []} />
    </div>
  );
}

function ImageReport({ img }: { img: ImageAnalysis }) {
  return (
    <div className="analyzer-report">
      <p className="analyzer-summary">{img.summary || img.visual_mood}</p>
      <PaletteSwatches colors={img.palette ?? []} />
      <dl className="analyzer-dl">
        <dt>Size</dt>
        <dd>
          {img.width}×{img.height} ({img.aspect_label || (img.is_portrait ? "portrait" : "landscape")})
        </dd>
        <dt>Mood</dt>
        <dd>{img.visual_mood || "—"}</dd>
        <dt>Hue</dt>
        <dd>{img.hue_label || "—"}</dd>
        <dt>Temperature</dt>
        <dd>{img.color_temperature || "—"}</dd>
        {img.suggested_genres?.length ? (
          <>
            <dt>Genres</dt>
            <dd>{img.suggested_genres.join(", ")}</dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}

export default function AnalyzersPanel({
  session,
  onSessionChange,
  onSendMusicVideo,
  onSendCanvas,
  showError,
}: Props) {
  const [busy, setBusy] = useState<"audio" | "image" | "bundle" | null>(null);
  const [handoffNote, setHandoffNote] = useState<string | null>(null);
  const [pendingSidecar, setPendingSidecar] = useState<string | null>(null);
  const pendingBundle = useRef<File | null>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const bundleInput = useRef<HTMLInputElement>(null);
  const sidecarInput = useRef<HTMLInputElement>(null);

  const briefPreview = buildBriefFromAnalyses(session.audioAnalysis, session.imageAnalysis);

  const analyzeAudioFile = useCallback(
    async (file: File) => {
      setBusy("audio");
      try {
        const b64 = await fileToDataUrl(file);
        const analysis = await api.analyzeAudio(b64);
        onSessionChange({
          ...session,
          audioB64: b64,
          audioName: file.name,
          audioAnalysis: { ...analysis, path: file.name },
        });
      } catch (e) {
        showError(e);
      } finally {
        setBusy(null);
      }
    },
    [onSessionChange, session, showError],
  );

  const analyzeImageFile = useCallback(
    async (file: File) => {
      setBusy("image");
      try {
        const b64 = await fileToDataUrl(file);
        const analysis = await api.analyzeImage(b64);
        onSessionChange({
          ...session,
          imageB64: b64,
          imageName: file.name,
          imageAnalysis: { ...analysis, path: file.name },
        });
      } catch (e) {
        showError(e);
      } finally {
        setBusy(null);
      }
    },
    [onSessionChange, session, showError],
  );

  const importBundle = useCallback(
    async (file: File, audioB64?: string | null) => {
      setBusy("bundle");
      try {
        const raw = await readJsonFile(file);
        const bundle = parseMusicCreatorBundle(raw);
        const { session: partial, apply } = sessionFromHandoffBundle(bundle, audioB64);
        onSessionChange({
          ...emptyAnalyzerSession(),
          ...partial,
          audioB64: audioB64 ?? partial.audioB64 ?? null,
        });
        setHandoffNote(`${apply.note} · ${handoffIntentLabel(apply.intent)}`);
        if (apply.audioSidecarName && !audioB64) {
          pendingBundle.current = file;
          setPendingSidecar(apply.audioSidecarName);
        } else {
          pendingBundle.current = null;
          setPendingSidecar(null);
        }
      } catch (e) {
        showError(e);
      } finally {
        setBusy(null);
      }
    },
    [onSessionChange, showError],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      for (const f of [...e.dataTransfer.files]) {
        const lower = f.name.toLowerCase();
        if (/\.(mp3|wav|flac|m4a|ogg|aac)$/.test(lower)) {
          void analyzeAudioFile(f);
        } else if (/\.(png|jpe?g|webp|bmp|gif)$/.test(lower)) {
          void analyzeImageFile(f);
        } else if (lower.endsWith(".json")) {
          void importBundle(f);
        }
      }
    },
    [analyzeAudioFile, analyzeImageFile, importBundle],
  );

  const loadSidecar = useCallback(
    async (file: File) => {
      const b64 = await fileToDataUrl(file);
      setPendingSidecar(null);
      if (pendingBundle.current) {
        await importBundle(pendingBundle.current, b64);
        pendingBundle.current = null;
      } else {
        onSessionChange({ ...session, audioB64: b64, audioName: file.name });
      }
    },
    [importBundle, onSessionChange, session],
  );

  return (
    <div className="panel analyzers-panel" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <header className="panel-header">
        <div>
          <h2>Analyzers</h2>
          <p className="muted">
            Drop a track and picture — analyze like Music / Video Creator, then send to Music Video or
            Canvas.
          </p>
        </div>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            onSessionChange(emptyAnalyzerSession());
            setHandoffNote(null);
            setPendingSidecar(null);
            pendingBundle.current = null;
          }}
        >
          Clear
        </button>
      </header>

      {handoffNote ? <p className="handoff-note">{handoffNote}</p> : null}
      {pendingSidecar ? (
        <div className="sidecar-prompt card">
          <p>
            Handoff expects audio file <strong>{pendingSidecar}</strong>
          </p>
          <button type="button" className="primary" onClick={() => sidecarInput.current?.click()}>
            Load audio sidecar
          </button>
          <input
            ref={sidecarInput}
            type="file"
            accept="audio/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void loadSidecar(f);
            }}
          />
        </div>
      ) : null}

      <div className="analyzer-grid">
        <section className="analyzer-card card">
          <h3>Track</h3>
          <label className="dropzone">
            {session.audioName || "Drop audio or click to browse"}
            <input
              ref={audioInput}
              type="file"
              accept="audio/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void analyzeAudioFile(f);
              }}
            />
          </label>
          {busy === "audio" ? <p className="muted">Analyzing audio…</p> : null}
          {session.audioAnalysis ? <AudioReport a={session.audioAnalysis} /> : null}
        </section>

        <section className="analyzer-card card">
          <h3>Picture</h3>
          <label className="dropzone">
            {session.imageName || "Drop image or click to browse"}
            <input
              ref={imageInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void analyzeImageFile(f);
              }}
            />
          </label>
          {busy === "image" ? <p className="muted">Analyzing image…</p> : null}
          {session.imageAnalysis ? <ImageReport img={session.imageAnalysis} /> : null}
        </section>
      </div>

      <section className="analyzer-brief card">
        <h3>Combined brief</h3>
        <textarea readOnly value={briefPreview} rows={3} />
        <div className="analyzer-actions">
          <button
            type="button"
            className="primary"
            disabled={!session.audioAnalysis}
            onClick={() => {
              const seed = buildMusicVideoSeedFromSession(session);
              if (seed) onSendMusicVideo(seed);
            }}
          >
            Send to Music Video
          </button>
          <button
            type="button"
            className="ghost"
            disabled={!session.audioAnalysis}
            onClick={() => {
              const seed = buildMusicVideoSeedFromSession(session, { durationMode: "highlight" });
              if (seed) onSendMusicVideo(seed);
            }}
          >
            Highlight clip
          </button>
          <button
            type="button"
            className="primary"
            disabled={!pathEReady(session)}
            onClick={() => {
              const seed = buildMusicVideoSeedFromSession(session);
              if (seed) onSendMusicVideo(seed);
            }}
            title="Track + picture → i2v music video with lip-sync hints"
          >
            Path E — one click
          </button>
          <button
            type="button"
            className="ghost"
            disabled={!session.imageAnalysis}
            onClick={() => {
              const seed = buildCanvasSeedFromSession(session);
              if (seed) onSendCanvas(seed);
            }}
          >
            Send to Canvas
          </button>
          <button type="button" className="ghost" onClick={() => bundleInput.current?.click()}>
            Import handoff JSON
          </button>
          <input
            ref={bundleInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importBundle(f);
            }}
          />
        </div>
        {busy === "bundle" ? <p className="muted">Loading handoff…</p> : null}
      </section>
    </div>
  );
}
