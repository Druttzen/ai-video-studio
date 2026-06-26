import { api, Health, ModelStatus } from "../api";

interface Props {
  models: ModelStatus[];
  health: Health | null;
  onError: (e: unknown) => void;
}

export default function Models({ models, health, onError }: Props) {
  const vram = health?.device.total_vram_gb ?? 0;
  const isCuda = health?.device.backend === "cuda";

  async function download(id: string) {
    try {
      await api.downloadModel(id);
    } catch (e) {
      onError(e);
    }
  }
  async function remove(id: string) {
    try {
      await api.deleteModel(id);
    } catch (e) {
      onError(e);
    }
  }

  return (
    <>
      <h1>Models</h1>
      <p className="subtitle">
        Open-source video models. Weights download from Hugging Face on demand
        and are cached locally — nothing is bundled into the app.
      </p>

      <div className="grid cards">
        {models.map((m) => {
          const vramTight = isCuda && vram > 0 && vram < m.min_vram_gb;
          return (
            <div className="card" key={m.id}>
              <h3>{m.name}</h3>
              <div className="meta">
                <span className={`badge ${m.commercial_use ? "good" : "bad"}`}>
                  {m.commercial_use ? "Commercial OK" : "Non-commercial"}
                </span>
                <span className="badge">{m.license}</span>
                <span className="badge">~{m.approx_size_gb} GB</span>
                <span className={`badge ${vramTight ? "warn" : ""}`}>
                  min {m.min_vram_gb} GB VRAM
                </span>
                {m.tasks.map((t) => (
                  <span className="badge" key={t}>
                    {t}
                  </span>
                ))}
              </div>
              <div className="desc">{m.description}</div>

              {m.status === "downloading" && (
                <>
                  <div className="progress">
                    <div style={{ width: `${Math.round(m.progress * 100)}%` }} />
                  </div>
                  <div className="desc">{m.message || "downloading…"}</div>
                </>
              )}
              {m.status === "error" && (
                <div className="desc" style={{ color: "#ffb4ab" }}>
                  {m.error}
                </div>
              )}
              {vramTight && m.status !== "downloading" && (
                <div className="desc" style={{ color: "var(--warn)" }}>
                  Your GPU has {vram} GB; this model recommends{" "}
                  {m.min_vram_gb} GB. It may run slowly via CPU offload.
                </div>
              )}

              <div className="actions">
                {m.downloaded ? (
                  <>
                    <span className="badge good">Downloaded ({m.disk_size_gb} GB)</span>
                    <button className="danger" onClick={() => remove(m.id)}>
                      Delete
                    </button>
                  </>
                ) : (
                  <button
                    className="primary"
                    disabled={m.status === "downloading"}
                    onClick={() => download(m.id)}
                  >
                    {m.status === "downloading" ? "Downloading…" : "Download"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
