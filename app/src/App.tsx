import { useCallback, useEffect, useMemo, useState } from "react";
import { api, Health, JobStatus, ModelStatus } from "./api";
import Generate from "./components/Generate";
import MusicVideo from "./components/MusicVideo";
import Canvas from "./components/Canvas";
import Models from "./components/Models";
import Library from "./components/Library";
import Settings from "./components/Settings";
import { ActiveJobStrip } from "./components/shared";

type Tab = "generate" | "musicvideo" | "canvas" | "models" | "library" | "settings";

export default function App() {
  const [tab, setTab] = useState<Tab>("generate");
  const [health, setHealth] = useState<Health | null>(null);
  const [models, setModels] = useState<ModelStatus[]>([]);
  const [jobs, setJobs] = useState<JobStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);

  const showError = useCallback((e: unknown) => {
    setError(String(e));
    window.setTimeout(() => setError(null), 6000);
  }, []);

  useEffect(() => {
    let alive = true;
    const tryHealth = async () => {
      try {
        const h = await api.health();
        if (!alive) return;
        setHealth(h);
        setBooting(false);
      } catch {
        if (alive) window.setTimeout(tryHealth, 1000);
      }
    };
    tryHealth();
    return () => {
      alive = false;
    };
  }, []);

  const hasActiveJob = useMemo(
    () => jobs.some((j) => j.status === "queued" || j.status === "running"),
    [jobs],
  );

  useEffect(() => {
    if (booting) return;
    let alive = true;
    const interval = hasActiveJob ? 600 : 1500;

    const poll = async () => {
      try {
        const [m, j] = await Promise.all([api.listModels(), api.listJobs()]);
        if (!alive) return;
        setModels(m);
        setJobs(j);
      } catch {
        /* transient */
      }
      if (alive) window.setTimeout(poll, interval);
    };
    poll();
    return () => {
      alive = false;
    };
  }, [booting, hasActiveJob]);

  const activeJob = useMemo(
    () =>
      jobs.find((j) => j.status === "running") ??
      jobs.find((j) => j.status === "queued") ??
      null,
    [jobs],
  );

  const dev = health?.device;
  const backendBadge = dev?.backend === "cuda" ? "good" : "warn";

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <img src="/djmad-logo.png" alt="Dj MAD" className="brand-logo" />
          <span className="brand-sub">AI Video Tool</span>
          <span className="brand-mark">☣</span>
        </div>
        <nav className="nav">
          {(
            [
              ["generate", "Generate"],
              ["musicvideo", "Music Video"],
              ["canvas", "Spotify Canvas"],
              ["models", "Models"],
              ["library", "Library"],
              ["settings", "Settings"],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
            >
              {label}
              {hasActiveJob && id === "library" && <span className="nav-dot" />}
            </button>
          ))}
        </nav>

        <ActiveJobStrip job={activeJob} />

        <div className="device-card">
          <div className="row">
            <span className="label">Engine</span>
            <span className={`badge ${health ? "good" : "warn"}`}>
              {booting ? "starting…" : "ready"}
            </span>
          </div>
          <div className="row">
            <span className="label">Backend</span>
            <span className={`badge ${backendBadge}`}>
              {dev ? dev.backend.toUpperCase() : "…"}
            </span>
          </div>
          <div className="row">
            <span className="label">Device</span>
            <span>{dev ? dev.name.slice(0, 22) : "…"}</span>
          </div>
          {dev && dev.total_vram_gb > 0 && (
            <div className="row">
              <span className="label">VRAM</span>
              <span>{dev.total_vram_gb} GB</span>
            </div>
          )}
          {health?.recommended_defaults && (
            <div className="row">
              <span className="label">Preset</span>
              <span className="badge">{health.recommended_defaults.preset}</span>
            </div>
          )}
        </div>
      </aside>

      <main className="main">
        {booting ? (
          <div className="boot-screen">
            <img src="/djmad-logo.png" alt="" aria-hidden />
            <p>Starting engine…</p>
          </div>
        ) : tab === "generate" ? (
          <Generate models={models} jobs={jobs} health={health} onError={showError} />
        ) : tab === "musicvideo" ? (
          <MusicVideo models={models} jobs={jobs} onError={showError} />
        ) : tab === "canvas" ? (
          <Canvas models={models} jobs={jobs} onError={showError} />
        ) : tab === "models" ? (
          <Models models={models} health={health} onError={showError} />
        ) : tab === "library" ? (
          <Library jobs={jobs} outputsDir={health?.settings.outputs_dir} />
        ) : (
          <Settings health={health} />
        )}
      </main>

      {error && <div className="toast">{error}</div>}
    </div>
  );
}
