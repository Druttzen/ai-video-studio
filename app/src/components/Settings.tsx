import { api, Health } from "../api";

export default function Settings({ health }: { health: Health | null }) {
  if (!health) return <div className="empty">Loading…</div>;
  const d = health.device;
  const p = health.policy as Record<string, unknown>;
  const rec = health.recommended_defaults;
  const s = health.settings;

  return (
    <>
      <h1>Settings</h1>
      <p className="subtitle">Engine status, hardware tuning, and storage.</p>

      <div className="grid cards">
        <div className="card">
          <h3>Hardware</h3>
          <Row label="Backend" value={d.backend.toUpperCase()} />
          <Row label="Device" value={d.name} />
          {d.total_vram_gb > 0 && <Row label="VRAM" value={`${d.total_vram_gb} GB`} />}
          <Row label="PyTorch" value={d.torch_available ? d.torch_version ?? "yes" : "not installed"} />
          {d.cuda_version && <Row label="CUDA" value={d.cuda_version} />}
          <Row label="Recommended preset" value={rec.preset} />
        </div>

        <div className="card">
          <h3>Auto-tuned policy</h3>
          {Object.entries(p).map(([k, v]) => (
            <Row key={k} label={k} value={String(v)} />
          ))}
        </div>

        <div className="card">
          <h3>Storage</h3>
          <Row label="Data" value={s.data_dir} mono />
          <Row label="Models" value={s.models_dir} mono />
          <Row label="Outputs" value={s.outputs_dir} mono />
          <div className="output-actions" style={{ marginTop: 12 }}>
            <button type="button" className="ghost" onClick={() => api.openFolder(s.outputs_dir)}>
              Open outputs
            </button>
            <button type="button" className="ghost" onClick={() => api.openFolder(s.models_dir)}>
              Open models
            </button>
            <button type="button" className="ghost" onClick={() => api.openFolder(s.data_dir)}>
              Open data root
            </button>
          </div>
        </div>

        <div className="card">
          <h3>Tips</h3>
          <div className="desc">
            <p>Models download to the folder above (~28 GB for LTX). Everything lives under{" "}
              <code className="mono">F:\ai-video-studio\data</code> — override with{" "}
              <code className="mono">AVE_DATA_DIR</code> only if needed.</p>
            <p style={{ marginTop: 8 }}>
              On 12 GB GPUs, use <b>Balanced</b> or <b>Fast</b> presets. Quality needs 16+ GB VRAM.
            </p>
          </div>
        </div>

        {!d.torch_available && (
          <div className="card">
            <h3>Install PyTorch</h3>
            <div className="desc">
              Generation needs PyTorch in the engine environment:
            </div>
            <div className="mono" style={{ marginTop: 8 }}>
              pip install torch --index-url https://download.pytorch.org/whl/cu124
            </div>
            <div className="mono" style={{ marginTop: 6 }}>
              pip install -r engine/requirements.txt
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div
      className="device-card-row"
      style={{ display: "flex", justifyContent: "space-between", gap: 16, margin: "5px 0" }}
    >
      <span style={{ color: "var(--text-dim)", fontSize: 12 }}>{label}</span>
      <span className={mono ? "mono" : ""} style={{ textAlign: "right" }}>
        {value}
      </span>
    </div>
  );
}
