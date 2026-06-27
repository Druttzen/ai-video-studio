import { convertFileSrc } from "@tauri-apps/api/core";
import { api, JobStatus, KIND_LABELS } from "../api";
import { OutputActions } from "./shared";

export default function Library({
  jobs,
  outputsDir,
}: {
  jobs: JobStatus[];
  outputsDir?: string;
}) {
  const done = jobs.filter((j) => j.status === "done" && j.output_path);
  const running = jobs.filter((j) => j.status === "queued" || j.status === "running");

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Library</h1>
          <p className="subtitle">All finished videos — persisted across restarts.</p>
        </div>
        {outputsDir && (
          <button type="button" className="ghost" onClick={() => api.openFolder(outputsDir)}>
            Open outputs folder
          </button>
        )}
      </div>

      {running.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>In progress</h3>
          {running.map((j) => (
            <div key={j.job_id} className="library-running">
              <span className="badge">{KIND_LABELS[j.kind] ?? j.kind}</span>
              <div className="progress" style={{ flex: 1 }}>
                <div style={{ width: `${Math.round(j.progress * 100)}%` }} />
              </div>
              <span className="mono">{Math.round(j.progress * 100)}%</span>
            </div>
          ))}
        </div>
      )}

      {done.length === 0 ? (
        <div className="empty">No finished videos yet. Generate something first!</div>
      ) : (
        <div className="grid cards">
          {done.map((j) => (
            <div className="card" key={j.job_id}>
              <video
                src={convertFileSrc(j.output_path!)}
                controls
                loop
                style={{ width: "100%", borderRadius: 8, background: "#000" }}
              />
              <div className="desc" style={{ marginTop: 10 }}>
                {j.label || (j.request?.prompt as string) || j.kind}
              </div>
              <div className="meta">
                <span className="badge">{KIND_LABELS[j.kind] ?? j.kind}</span>
                {Boolean(j.request?.model_id) && (
                  <span className="badge">{String(j.request!.model_id)}</span>
                )}
                {Boolean(j.request?.width) && (
                  <span className="badge">
                    {String(j.request!.width)}×{String(j.request!.height)}
                  </span>
                )}
                {Boolean(j.request?.target_seconds) && (
                  <span className="badge">{String(j.request!.target_seconds)}s loop</span>
                )}
              </div>
              {j.output_path && <OutputActions path={j.output_path} />}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
