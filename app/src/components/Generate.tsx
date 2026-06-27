import { useEffect, useMemo, useState } from "react";
import { api, GenerationRequest, Health, JobStatus, ModelStatus } from "../api";
import {
  DirectorCraftSettings,
  enrichBriefWithCraft,
  loadDirectorCraft,
} from "../lib/director-craft";
import { DirectorCatalog, loadDirectorCatalog } from "../lib/director-catalog";
import DirectorCraft from "./DirectorCraft";
import InspireBar from "./InspireBar";
import { JobPanel } from "./shared";

interface Props {
  models: ModelStatus[];
  jobs: JobStatus[];
  health: Health | null;
  onError: (e: unknown) => void;
}

type Quality = "fast" | "balanced" | "quality";

function presetFor(quality: Quality, vram: number, backend: string): Partial<GenerationRequest> {
  if (backend !== "cuda") {
    return { width: 512, height: 320, num_frames: 17, num_inference_steps: 8 };
  }
  if (quality === "fast" || vram < 10) {
    return { width: 512, height: 320, num_frames: 17, num_inference_steps: 8 };
  }
  if (quality === "quality" && vram >= 16) {
    return { width: 768, height: 512, num_frames: 49, num_inference_steps: 30 };
  }
  return { width: 512, height: 320, num_frames: 25, num_inference_steps: 20 };
}

export default function Generate({ models, jobs, health, onError }: Props) {
  const ready = useMemo(() => models.filter((m) => m.downloaded), [models]);
  const rec = health?.recommended_defaults;
  const vram = health?.device.total_vram_gb ?? 0;
  const backend = health?.device.backend ?? "cpu";

  const [quality, setQuality] = useState<Quality>(
    (rec?.preset as Quality) || "balanced",
  );
  const [req, setReq] = useState<GenerationRequest>({
    model_id: "",
    task: "text-to-video",
    prompt: "",
    negative_prompt: "worst quality, blurry, distorted, watermark",
    width: rec?.width ?? 512,
    height: rec?.height ?? 320,
    num_frames: rec?.num_frames ?? 25,
    fps: rec?.fps ?? 24,
    num_inference_steps: rec?.num_inference_steps ?? 20,
    guidance_scale: rec?.guidance_scale ?? 3.0,
    seed: null,
    extra: {},
  });
  const [image, setImage] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [craft, setCraft] = useState<DirectorCraftSettings>(loadDirectorCraft);
  const [catalog, setCatalog] = useState<DirectorCatalog | null>(null);

  useEffect(() => {
    loadDirectorCatalog().then(setCatalog).catch(() => {});
  }, []);

  useEffect(() => {
    if (!req.model_id && ready.length) selectModel(ready[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (rec) setQuality(rec.preset as Quality);
  }, [rec?.preset]);

  const selected = ready.find((m) => m.id === req.model_id) || null;

  function applyQuality(q: Quality) {
    setQuality(q);
    const p = presetFor(q, vram, backend);
    setReq((r) => ({ ...r, ...p }));
  }

  function selectModel(m: ModelStatus) {
    const dp = m.default_params || {};
    const task = m.tasks.includes("text-to-video") ? "text-to-video" : m.tasks[0];
    const p = presetFor(quality, vram, backend);
    setReq((r) => ({
      ...r,
      model_id: m.id,
      task,
      width: p.width ?? dp.width ?? r.width,
      height: p.height ?? dp.height ?? r.height,
      num_frames: p.num_frames ?? dp.num_frames ?? r.num_frames,
      fps: dp.fps ?? r.fps,
      num_inference_steps: p.num_inference_steps ?? dp.num_inference_steps ?? r.num_inference_steps,
      guidance_scale: dp.guidance_scale ?? r.guidance_scale,
    }));
  }

  const job = jobId ? jobs.find((j) => j.job_id === jobId) || null : null;
  const busy =
    submitting || (job != null && (job.status === "queued" || job.status === "running"));

  const set = <K extends keyof GenerationRequest>(k: K, v: GenerationRequest[K]) =>
    setReq((r) => ({ ...r, [k]: v }));

  async function onPickImage(file: File) {
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function submit() {
    if (!selected) return;
    if (!req.prompt.trim()) {
      onError("Enter a prompt first.");
      return;
    }
    if (req.task === "image-to-video" && !image) {
      onError("Image-to-video needs an input image.");
      return;
    }
    setSubmitting(true);
    try {
      let prompt = req.prompt;
      if (catalog) {
        prompt = enrichBriefWithCraft(req.prompt, catalog, craft);
      }
      const { job_id } = await api.generate({
        ...req,
        prompt,
        image_b64: req.task === "image-to-video" ? image : null,
      });
      setJobId(job_id);
    } catch (e) {
      onError(e);
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel() {
    if (!job) return;
    try {
      await api.cancelJob(job.job_id);
    } catch (e) {
      onError(e);
    }
  }

  const qualityDisabled = (q: Quality) =>
    q === "quality" && vram > 0 && vram < 16;

  return (
    <>
      <h1>Generate</h1>
      <p className="subtitle">
        Text-to-video and image-to-video on your GPU. Use <b>Fast</b> for quick tests,
        <b> Balanced</b> on 12 GB cards, <b>Quality</b> on 16+ GB.
      </p>

      {ready.length === 0 ? (
        <div className="empty">
          No models downloaded yet. Head to the <b>Models</b> tab (LTX-Video recommended).
        </div>
      ) : (
        <>
          <InspireBar
            mode="generate"
            onPrompt={(prompt, negative) =>
              setReq((r) => ({
                ...r,
                prompt,
                negative_prompt: negative ?? r.negative_prompt,
              }))
            }
          />
          <DirectorCraft onChange={setCraft} />
          <div className="generate-layout">
          <div className="card">
            <div className="field">
              <label>Quality preset</label>
              <div className="seg">
                {(["fast", "balanced", "quality"] as Quality[]).map((q) => (
                  <button
                    key={q}
                    type="button"
                    className={quality === q ? "active" : ""}
                    disabled={qualityDisabled(q)}
                    onClick={() => applyQuality(q)}
                    title={qualityDisabled(q) ? "Needs 16+ GB VRAM" : undefined}
                  >
                    {q.charAt(0).toUpperCase() + q.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Model</label>
              <select
                value={req.model_id}
                onChange={(e) =>
                  selectModel(ready.find((m) => m.id === e.target.value)!)
                }
              >
                {ready.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            {selected && selected.tasks.length > 1 && (
              <div className="field">
                <label>Mode</label>
                <div className="seg">
                  {selected.tasks.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={req.task === t ? "active" : ""}
                      onClick={() => set("task", t)}
                    >
                      {t === "text-to-video" ? "Text → Video" : "Image → Video"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {req.task === "image-to-video" && (
              <div className="field">
                <label>Input image</label>
                <label className="dropzone" style={{ display: "block" }}>
                  {image ? <img src={image} alt="input" /> : "Click to choose an image"}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) =>
                      e.target.files?.[0] && onPickImage(e.target.files[0])
                    }
                  />
                </label>
              </div>
            )}

            <div className="field">
              <label>Prompt</label>
              <textarea
                value={req.prompt}
                placeholder="A cinematic drone shot over a misty forest at sunrise…"
                onChange={(e) => set("prompt", e.target.value)}
              />
            </div>

            <div className="field">
              <label>Negative prompt</label>
              <input
                value={req.negative_prompt}
                onChange={(e) => set("negative_prompt", e.target.value)}
              />
            </div>

            <details className="advanced">
              <summary>Advanced settings</summary>
              <div className="row3" style={{ marginTop: 12 }}>
                <NumField label="Width" v={req.width} on={(v) => set("width", v)} step={16} />
                <NumField label="Height" v={req.height} on={(v) => set("height", v)} step={16} />
                <NumField label="Frames" v={req.num_frames} on={(v) => set("num_frames", v)} />
              </div>
              <div className="row3">
                <NumField label="FPS" v={req.fps} on={(v) => set("fps", v)} />
                <NumField label="Steps" v={req.num_inference_steps} on={(v) => set("num_inference_steps", v)} />
                <NumField label="Guidance" v={req.guidance_scale} on={(v) => set("guidance_scale", v)} step={0.5} />
              </div>
              <NumField
                label="Seed (blank = random)"
                v={req.seed ?? ("" as unknown as number)}
                on={(v) => set("seed", Number.isFinite(v) ? v : null)}
                allowEmpty
              />
            </details>

            <button
              type="button"
              className={busy ? "danger" : "primary"}
              style={{ width: "100%", marginTop: 12 }}
              onClick={busy ? cancel : submit}
              disabled={!busy && !req.prompt.trim()}
            >
              {busy ? "Cancel" : "Generate"}
            </button>
          </div>

          <JobPanel
            job={job}
            placeholder="Your generated video will appear here"
            onCancel={busy ? cancel : undefined}
          />
        </div>
        </>
      )}
      {health && !health.device.torch_available && (
        <p className="subtitle warn-text" style={{ marginTop: 16 }}>
          PyTorch is not installed in the engine environment — see Settings.
        </p>
      )}
    </>
  );
}

function NumField({
  label,
  v,
  on,
  step = 1,
  allowEmpty = false,
}: {
  label: string;
  v: number;
  on: (v: number) => void;
  step?: number;
  allowEmpty?: boolean;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type="number"
        step={step}
        value={Number.isFinite(v) ? v : ""}
        onChange={(e) =>
          e.target.value === "" && allowEmpty
            ? on(NaN)
            : on(parseFloat(e.target.value))
        }
      />
    </div>
  );
}
