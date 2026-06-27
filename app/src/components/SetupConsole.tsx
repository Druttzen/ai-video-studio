import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, SetupProgress } from "../api";

interface Props {
  onComplete: () => void;
  onError: (e: unknown) => void;
}

type Phase = "scanning" | "ready" | "running" | "done" | "error";

function formatBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} KB`;
  return `${n} B`;
}

function formatEta(sec: number): string {
  if (!sec || sec < 0 || !Number.isFinite(sec)) return "?";
  const s = Math.ceil(sec);
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${s}s`;
}

export default function SetupConsole({ onComplete, onError }: Props) {
  const [phase, setPhase] = useState<Phase>("scanning");
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState<SetupProgress | null>(null);
  const [displayProgress, setDisplayProgress] = useState<SetupProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logEnd = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const pushLog = useCallback((line: string) => {
    setLogs((prev) => [...prev.slice(-200), line]);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        pushLog("> Analysing hardware and install state…");
        const result = await api.setupScan();
        if (!alive) return;
        pushLog(`> GPU: ${result.hardware.gpu_present ? result.hardware.gpu_name : "none (CPU mode)"}`);
        pushLog(`> VRAM: ${result.hardware.vram_gb > 0 ? `${result.hardware.vram_gb} GB` : "n/a"}`);
        pushLog(`> WebView2: ${result.hardware.webview2 ? "installed" : "will install"}`);
        pushLog(`> Data folder: ${result.hardware.data_dir}`);
        if (result.engine_installed) {
          pushLog("> Engine already installed.");
          setPhase("done");
          window.setTimeout(onComplete, 800);
          return;
        }
        pushLog("");
        pushLog("Components to install:");
        for (const item of result.items) {
          pushLog(
            `  • ${item.label} — ~${formatBytes(item.bytes)} (~${item.eta_minutes} min)`,
          );
        }
        for (const m of result.models.filter((x) => x.auto_download)) {
          pushLog(
            `  • Model: ${m.name} — ~${formatBytes(m.bytes)} (~${m.eta_minutes} min)`,
          );
        }
        pushLog("");
        pushLog(
          `> Estimated total: ~${formatBytes(result.total_bytes)} (~${result.eta_minutes} min)`,
        );
        if (!result.can_run) {
          setError(`Blocked: ${result.blocked.join(", ")}`);
          setPhase("error");
          return;
        }
        pushLog("");
        pushLog("> Press any key to start download and installation…");
        setPhase("ready");
      } catch (e) {
        if (!alive) return;
        onError(e);
        setError(String(e));
        setPhase("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [onComplete, onError, pushLog]);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, displayProgress]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setDisplayProgress((cur) => progress ?? cur);
    }, 1000);
    return () => window.clearInterval(id);
  }, [progress]);

  useEffect(() => {
    const unsubs: Array<() => void> = [];
    (async () => {
      unsubs.push(
        await listen<SetupProgress>("setup-progress", (ev) => {
          const p = ev.payload;
          if (p.phase === "log" && p.message) {
            pushLog(`> ${p.message}`);
          } else if (p.label) {
            setProgress(p);
          }
        }),
      );
      unsubs.push(
        await listen<{ ok: boolean; error?: string }>("setup-complete", (ev) => {
          if (ev.payload.ok) {
            pushLog("> Setup complete.");
            setPhase("done");
            window.setTimeout(onComplete, 600);
          } else {
            setError(ev.payload.error ?? "Setup failed");
            setPhase("error");
          }
        }),
      );
    })();
    return () => unsubs.forEach((u) => u());
  }, [onComplete, pushLog]);

  const startSetup = useCallback(async () => {
    if (started.current) return;
    started.current = true;
    setPhase("running");
    pushLog("> Starting installation…");
    try {
      await api.setupRun();
    } catch (e) {
      onError(e);
      setError(String(e));
      setPhase("error");
    }
  }, [onError, pushLog]);

  useEffect(() => {
    if (phase !== "ready") return;
    const onKey = () => startSetup();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, startSetup]);

  const pct = displayProgress?.percent ?? 0;

  return (
    <div className="setup-console">
      <div className="setup-console-header">
        <img src="/djmad-logo.png" alt="" />
        <div>
          <h1>AI Video Tool — Setup</h1>
          <p>First-run installer console</p>
        </div>
      </div>

      <div className="setup-console-terminal" role="log" aria-live="polite">
        {logs.map((line, i) => (
          <div key={i} className="setup-line">
            {line}
          </div>
        ))}
        {phase === "running" && displayProgress && (
          <div className="setup-progress-block">
            <div className="setup-progress-label">
              {displayProgress.label}: {pct.toFixed(1)}% — ETA {formatEta(displayProgress.eta_seconds)}
            </div>
            <div className="progress setup-progress-bar">
              <div style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
            </div>
            <div className="setup-progress-meta">
              {formatBytes(displayProgress.done_bytes)} / {formatBytes(displayProgress.total_bytes)}
            </div>
          </div>
        )}
        {phase === "ready" && (
          <div className="setup-blink">_ press any key</div>
        )}
        {error && <div className="setup-line setup-error">{error}</div>}
        <div ref={logEnd} />
      </div>

      {phase === "ready" && (
        <div className="setup-actions">
          <button type="button" className="primary" onClick={startSetup}>
            Start installation
          </button>
        </div>
      )}
    </div>
  );
}
