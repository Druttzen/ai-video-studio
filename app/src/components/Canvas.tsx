import { useEffect, useMemo, useState } from "react";
import { JobStatus, ModelStatus, api } from "../api";
import { JobPanel, fileToDataUrl } from "./shared";

interface Props {
  models: ModelStatus[];
  jobs: JobStatus[];
  onError: (e: unknown) => void;
}

export default function Canvas({ models, jobs, onError }: Props) {
  const ready = useMemo(() => models.filter((m) => m.downloaded), [models]);

  const [modelId, setModelId] = useState("");
  const [brief, setBrief] = useState("");
  const [duration, setDuration] = useState(20);
  const [method, setMethod] = useState<"pingpong" | "crossfade">("pingpong");
  const [task, setTask] = useState("text-to-video");
  const [image, setImage] = useState<string | null>(null);
  const [audio, setAudio] = useState<string | null>(null);
  const [audioName, setAudioName] = useState("");
  const [withAudio, setWithAudio] = useState(true);
  const [jobId, setJobId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!modelId && ready.length) setModelId(ready[0].id);
  }, [ready, modelId]);

  const selected = ready.find((m) => m.id === modelId) || null;
  const job = jobId ? jobs.find((j) => j.job_id === jobId) || null : null;
  const busy =
    submitting || (job != null && (job.status === "queued" || job.status === "running"));

  async function submit() {
    if (!selected) return;
    if (task === "image-to-video" && !image)
      return onError("Image-to-video mode needs a picture.");
    setSubmitting(true);
    try {
      const dp = selected.default_params || {};
      const { job_id } = await api.createCanvas({
        model_id: selected.id,
        task,
        brief: brief || "looping abstract motion",
        audio_b64: audio,
        image_b64: task === "image-to-video" ? image : null,
        target_seconds: duration,
        width: 720,
        height: 1280,
        fps: dp.fps ?? 24,
        clip_frames: dp.num_frames ?? 49,
        num_inference_steps: dp.num_inference_steps ?? 40,
        guidance_scale: dp.guidance_scale ?? 3.0,
        seed: null,
        loop_method: method,
        crossfade: 0.5,
        with_audio: withAudio && !!audio,
      });
      setJobId(job_id);
    } catch (e) {
      onError(e);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1>Spotify Canvas</h1>
      <p className="subtitle">
        Vertical 9:16 perfect-looping clips (10 / 20 / 30s) — seamless boomerang
        or crossfade loop, optionally synced to a snippet of a track.
      </p>

      {ready.length === 0 ? (
        <div className="empty">
          Download a model in the <b>Models</b> tab first.
        </div>
      ) : (
        <div className="generate-layout">
          <div className="card">
            <div className="field">
              <label>Loop length</label>
              <div className="seg">
                {[10, 20, 30].map((d) => (
                  <button key={d} className={duration === d ? "active" : ""} onClick={() => setDuration(d)}>
                    {d}s
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Loop method</label>
              <div className="seg">
                <button className={method === "pingpong" ? "active" : ""} onClick={() => setMethod("pingpong")}>
                  Boomerang (perfect)
                </button>
                <button className={method === "crossfade" ? "active" : ""} onClick={() => setMethod("crossfade")}>
                  Crossfade
                </button>
              </div>
            </div>

            <div className="field">
              <label>Model</label>
              <select value={modelId} onChange={(e) => setModelId(e.target.value)}>
                {ready.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            {selected && selected.tasks.length > 1 && (
              <div className="field">
                <label>Source</label>
                <div className="seg">
                  {selected.tasks.map((t) => (
                    <button key={t} className={task === t ? "active" : ""} onClick={() => setTask(t)}>
                      {t === "text-to-video" ? "Text prompt" : "Animate picture"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {task === "image-to-video" && (
              <div className="field">
                <label>Picture</label>
                <label className="dropzone" style={{ display: "block" }}>
                  {image ? <img src={image} alt="" /> : "Click to choose a picture"}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={async (e) =>
                      e.target.files?.[0] && setImage(await fileToDataUrl(e.target.files[0]))
                    }
                  />
                </label>
              </div>
            )}

            <div className="field">
              <label>Prompt</label>
              <textarea
                placeholder="slow drifting nebula, glowing particles, deep blues and purples"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
              />
            </div>

            <div className="field">
              <label>Music (optional — analyzed to start on a downbeat)</label>
              <label className="dropzone" style={{ display: "block" }}>
                {audioName || "Click to choose a track"}
                <input
                  type="file"
                  accept="audio/*"
                  style={{ display: "none" }}
                  onChange={async (e) => {
                    if (e.target.files?.[0]) {
                      setAudio(await fileToDataUrl(e.target.files[0]));
                      setAudioName(e.target.files[0].name);
                    }
                  }}
                />
              </label>
              {audio && (
                <button className={withAudio ? "primary" : "ghost"} onClick={() => setWithAudio(!withAudio)} style={{ width: "100%", marginTop: 8 }}>
                  {withAudio ? "Mux audio into loop" : "Muted loop"}
                </button>
              )}
            </div>

            <button
              className={busy ? "danger" : "primary"}
              style={{ width: "100%" }}
              onClick={busy ? () => job && api.cancelJob(job.job_id) : submit}
            >
              {busy ? "Cancel" : `Create ${duration}s canvas`}
            </button>
          </div>

          <JobPanel
            job={job}
            placeholder="Your looping canvas will appear here"
            portrait
            onCancel={busy ? () => job && api.cancelJob(job.job_id) : undefined}
          />
        </div>
      )}
    </>
  );
}
