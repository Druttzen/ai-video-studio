import { useEffect, useState } from "react";
import { Health, ModelStatus, api } from "../api";

interface Props {
  health: Health;
  models: ModelStatus[];
  onDone: () => void;
  onGoModels: () => void;
  onError: (e: unknown) => void;
}

type Step = "welcome" | "hardware" | "model" | "ready";

export default function OnboardingWizard({
  health,
  models,
  onDone,
  onGoModels,
  onError,
}: Props) {
  const [step, setStep] = useState<Step>("welcome");
  const [downloading, setDownloading] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const ltx = models.find((m) => m.id === "ltx-video") ?? models[0];
  const hasModel = health.onboarding?.has_model || models.some((m) => m.downloaded);
  const dev = health.device;

  useEffect(() => {
    if (ltx?.status === "downloading") setDownloading(true);
    if (ltx?.downloaded) setDownloading(false);
  }, [ltx?.status, ltx?.downloaded]);

  async function downloadLtx() {
    if (!ltx) return;
    setDownloading(true);
    try {
      await api.downloadModel(ltx.id);
    } catch (e) {
      onError(e);
      setDownloading(false);
    }
  }

  async function finish() {
    if (finishing) return;
    setFinishing(true);
    try {
      await api.completeOnboarding();
      onDone();
    } catch (e) {
      onError(e);
      setFinishing(false);
    }
  }

  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true">
      <div className="onboarding-panel card">
        <div className="onboarding-header">
          <img src="/djmad-logo.png" alt="" className="onboarding-logo" />
          <div>
            <h2>Welcome to Dj MAD AI Video Tool</h2>
            <p className="desc">Standalone local video generator — no cloud required.</p>
          </div>
        </div>

        <div className="onboarding-steps">
          {step === "welcome" && (
            <>
              <p>
                This app runs <b>on your GPU</b>. Models, videos, and cache are stored in{" "}
                <code className="mono">{health.settings.data_dir}</code> — inside your install
                folder, not AppData.
              </p>
              <ul className="onboarding-list">
                <li>Generate text→video and image→video clips</li>
                <li>Beat-synced music videos with smart clip plans</li>
                <li>Spotify Canvas loops (10 / 20 / 30 s)</li>
              </ul>
              <div className="onboarding-actions">
                <button type="button" className="primary" onClick={() => setStep("hardware")}>
                  Continue
                </button>
              </div>
            </>
          )}

          {step === "hardware" && (
            <>
              <h3>Your hardware</h3>
              <div className="device-card" style={{ marginTop: 12 }}>
                <div className="row">
                  <span className="label">Backend</span>
                  <span className={`badge ${dev.backend === "cuda" ? "good" : "warn"}`}>
                    {dev.backend.toUpperCase()}
                  </span>
                </div>
                <div className="row">
                  <span className="label">Device</span>
                  <span>{dev.name}</span>
                </div>
                {dev.total_vram_gb > 0 && (
                  <div className="row">
                    <span className="label">VRAM</span>
                    <span>{dev.total_vram_gb} GB</span>
                  </div>
                )}
                {!dev.torch_available && (
                  <p className="desc warn-text" style={{ marginTop: 10 }}>
                    PyTorch is not installed in the engine — generation will not work until the
                    engine bundle is set up (run setup.cmd after install).
                  </p>
                )}
              </div>
              <div className="onboarding-actions">
                <button type="button" className="ghost" onClick={() => setStep("welcome")}>
                  Back
                </button>
                <button type="button" className="primary" onClick={() => setStep("model")}>
                  Next
                </button>
              </div>
            </>
          )}

          {step === "model" && (
            <>
              <h3>Download a model</h3>
              <p className="desc">
                LTX-Video is the recommended default (~28 GB). Weights are stored once under your
                data folder and reused across sessions.
              </p>
              {ltx && (
                <div className="card" style={{ marginTop: 12, padding: 14 }}>
                  <h3 style={{ marginTop: 0 }}>{ltx.name}</h3>
                  <div className="meta">
                    <span className="badge">~{ltx.approx_size_gb} GB</span>
                    <span className="badge">min {ltx.min_vram_gb} GB VRAM</span>
                    {ltx.downloaded && <span className="badge good">Ready</span>}
                  </div>
                  {ltx.status === "downloading" && (
                    <>
                      <div className="progress" style={{ marginTop: 10 }}>
                        <div style={{ width: `${Math.round(ltx.progress * 100)}%` }} />
                      </div>
                      <p className="desc">{ltx.message || "Downloading…"}</p>
                    </>
                  )}
                  {!ltx.downloaded && ltx.status !== "downloading" && (
                    <button
                      type="button"
                      className="primary"
                      style={{ marginTop: 12, width: "100%" }}
                      onClick={downloadLtx}
                      disabled={downloading}
                    >
                      Download LTX-Video
                    </button>
                  )}
                </div>
              )}
              <div className="onboarding-actions">
                <button type="button" className="ghost" onClick={() => setStep("hardware")}>
                  Back
                </button>
                <button type="button" className="ghost" onClick={onGoModels}>
                  Models tab
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => setStep("ready")}
                  disabled={downloading}
                >
                  {hasModel ? "Next" : "Skip for now"}
                </button>
              </div>
            </>
          )}

          {step === "ready" && (
            <>
              <h3>You&apos;re set</h3>
              <p>
                {hasModel
                  ? "Your model is ready. Try a short Fast preset clip on the Generate tab."
                  : "Download a model from the Models tab before generating. You can explore the UI now."}
              </p>
              <p className="desc">
                Finished videos appear in <b>Library</b> and stay there after you restart the app.
              </p>
              <div className="onboarding-actions">
                <button type="button" className="primary" onClick={finish} disabled={finishing}>
                  {finishing ? "Finishing…" : "Get started"}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="onboarding-dots">
          {(["welcome", "hardware", "model", "ready"] as Step[]).map((s) => (
            <span key={s} className={step === s ? "active" : ""} />
          ))}
        </div>
      </div>
    </div>
  );
}
