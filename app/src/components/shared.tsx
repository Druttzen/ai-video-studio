import { convertFileSrc } from "@tauri-apps/api/core";
import { useState } from "react";
import { api, copyText, JobStatus, KIND_LABELS } from "../api";

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function kindLabel(kind: string) {
  return KIND_LABELS[kind] ?? kind;
}

/** Open outputs folder / reveal file / copy path. */
export function OutputActions({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await copyText(path);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="output-actions">
      <button type="button" className="ghost" onClick={() => api.revealInExplorer(path)}>
        Show in Explorer
      </button>
      <button type="button" className="ghost" onClick={() => api.openFolder(path)}>
        Open folder
      </button>
      <button type="button" className="ghost" onClick={copy}>
        {copied ? "Copied!" : "Copy path"}
      </button>
    </div>
  );
}

/** Shared progress/preview panel used by Generate, Music Video and Canvas. */
export function JobPanel({
  job,
  placeholder,
  portrait,
  onCancel,
}: {
  job: JobStatus | null;
  placeholder: string;
  portrait?: boolean;
  onCancel?: () => void;
}) {
  const running = job && (job.status === "queued" || job.status === "running");
  const pct = job ? Math.round(job.progress * 100) : 0;
  const stepLine =
    job && job.total_steps > 0 && job.step > 0
      ? `Step ${job.step} / ${job.total_steps}`
      : null;

  return (
    <div className="preview">
      {!job && <div className="placeholder">{placeholder}</div>}

      {running && (
        <div className="progress-panel">
          <div className="progress-header">
            <span className="badge">{kindLabel(job!.kind)}</span>
            <span className="progress-pct">{pct}%</span>
          </div>
          <div className="progress">
            <div style={{ width: `${pct}%` }} />
          </div>
          <div className="progress-msg">{job!.message || "Working…"}</div>
          {stepLine && <div className="progress-step">{stepLine}</div>}
          {onCancel && (
            <button type="button" className="danger" onClick={onCancel} style={{ marginTop: 12 }}>
              Cancel
            </button>
          )}
        </div>
      )}

      {job && job.status === "error" && (
        <div className="placeholder error-text">{job.error || "Generation failed"}</div>
      )}

      {job && job.status === "cancelled" && (
        <div className="placeholder">Cancelled</div>
      )}

      {job && job.status === "done" && job.output_path && (
        <>
          <video
            src={convertFileSrc(job.output_path)}
            controls
            autoPlay
            loop
            className={portrait ? "video-portrait" : "video-landscape"}
          />
          <OutputActions path={job.output_path} />
        </>
      )}
    </div>
  );
}

/** Compact job strip for the sidebar when something is running. */
export function ActiveJobStrip({ job }: { job: JobStatus | null }) {
  if (!job || (job.status !== "queued" && job.status !== "running")) return null;
  const pct = Math.round(job.progress * 100);
  return (
    <div className="active-job">
      <div className="row">
        <span className="label">{kindLabel(job.kind)}</span>
        <span>{pct}%</span>
      </div>
      <div className="progress" style={{ marginTop: 6 }}>
        <div style={{ width: `${pct}%` }} />
      </div>
      <div className="active-job-msg">{job.message}</div>
    </div>
  );
}
