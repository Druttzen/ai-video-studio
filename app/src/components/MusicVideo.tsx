import { useEffect, useMemo, useState } from "react";
import { AudioAnalysis, JobStatus, ModelStatus, api } from "../api";
import InspireBar from "./InspireBar";
import { JobPanel, fileToDataUrl } from "./shared";

interface Props {
  models: ModelStatus[];
  jobs: JobStatus[];
  onError: (e: unknown) => void;
}

export default function MusicVideo({ models, jobs, onError }: Props) {
  const ready = useMemo(() => models.filter((m) => m.downloaded), [models]);

  const [modelId, setModelId] = useState("");
  const [brief, setBrief] = useState("");
  const [audio, setAudio] = useState<string | null>(null);
  const [audioName, setAudioName] = useState("");
  const [analysis, setAnalysis] = useState<AudioAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [image, setImage] = useState<string | null>(null);

  const [task, setTask] = useState("text-to-video");
  const [nScenes, setNScenes] = useState(4);
  const [beatsPerCut, setBeatsPerCut] = useState(4);
  const [lengthSync, setLengthSync] = useState(true);
  const [useClipPlan, setUseClipPlan] = useState(true);
  const [lipSync, setLipSync] = useState(false);
  const [face, setFace] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!modelId && ready.length) setModelId(ready[0].id);
  }, [ready, modelId]);

  const selected = ready.find((m) => m.id === modelId) || null;
  const job = jobId ? jobs.find((j) => j.job_id === jobId) || null : null;
  const busy =
    submitting || (job != null && (job.status === "queued" || job.status === "running"));

  async function onAudio(file: File) {
    const url = await fileToDataUrl(file);
    setAudio(url);
    setAudioName(file.name);
    setAnalysis(null);
    setAnalyzing(true);
    try {
      const result = await api.analyzeAudio(url);
      setAnalysis(result);
      if (result.clip_count && result.clip_count > 0) {
        setNScenes(Math.min(12, Math.max(2, Math.ceil(result.clip_count / 2))));
      }
      if (result.vocals_likely) setLipSync(true);
    } catch (e) {
      onError(e);
    } finally {
      setAnalyzing(false);
    }
  }

  async function submit() {
    if (!selected) return;
    if (!audio) return onError("Add a music file first.");
    if (task === "image-to-video" && !image)
      return onError("Image-to-video mode needs a base picture.");
    setSubmitting(true);
    try {
      const dp = selected.default_params || {};
      const { job_id } = await api.createMusicVideo({
        model_id: selected.id,
        task,
        brief,
        audio_b64: audio,
        image_b64: task === "image-to-video" ? image : null,
        face_b64: lipSync ? face : null,
        width: dp.width ?? 768,
        height: dp.height ?? 512,
        fps: dp.fps ?? 24,
        clip_frames: dp.num_frames ?? 49,
        num_inference_steps: dp.num_inference_steps ?? 40,
        guidance_scale: dp.guidance_scale ?? 3.0,
        seed: null,
        n_scenes: nScenes,
        beats_per_cut: beatsPerCut,
        length_sync: lengthSync,
        lip_sync: lipSync,
        use_clip_plan: useClipPlan,
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
      <h1>Music Video</h1>
      <p className="subtitle">
        Drop in a track, describe the visuals, and get a beat-synced video cut to
        the music — smart clip plan segments when enabled.
      </p>

      {ready.length === 0 ? (
        <div className="empty">
          Download a model in the <b>Models</b> tab first.
        </div>
      ) : (
        <>
          <InspireBar mode="music-video" onBrief={setBrief} />
          <div className="generate-layout">
          <div className="card">
            <div className="field">
              <label>Music file</label>
              <label className="dropzone" style={{ display: "block" }}>
                {audioName || "Click to choose an audio file (mp3, wav, flac…)"}
                <input
                  type="file"
                  accept="audio/*"
                  style={{ display: "none" }}
                  onChange={(e) => e.target.files?.[0] && onAudio(e.target.files[0])}
                />
              </label>
              {analyzing && <div className="desc">analyzing…</div>}
              {analysis && (
                <div className="meta">
                  <span className="badge good">{analysis.tempo.toFixed(0)} BPM</span>
                  <span className="badge">{analysis.duration.toFixed(1)}s</span>
                  <span className="badge">{analysis.num_beats} beats</span>
                  {analysis.clip_count != null && analysis.clip_count > 0 && (
                    <span className="badge good">{analysis.clip_count} clip segments</span>
                  )}
                  {analysis.vocals_likely && (
                    <span className="badge warn">vocals likely</span>
                  )}
                  <span className="badge">{analysis.sections.length} sections</span>
                </div>
              )}
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
                    <button
                      key={t}
                      className={task === t ? "active" : ""}
                      onClick={() => setTask(t)}
                    >
                      {t === "text-to-video" ? "Text scenes" : "Animate picture"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {task === "image-to-video" && (
              <div className="field">
                <label>Base picture</label>
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
              <label>Visual brief</label>
              <textarea
                placeholder="neon cyberpunk city at night, rain, reflections, fast motion"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
              />
            </div>

            <div className="row3">
              <Num label="Scenes" v={nScenes} on={setNScenes} />
              <Num label="Beats / cut" v={beatsPerCut} on={setBeatsPerCut} />
              <div className="field">
                <label>Smart clip plan</label>
                <button
                  type="button"
                  className={useClipPlan ? "primary" : "ghost"}
                  onClick={() => setUseClipPlan(!useClipPlan)}
                  style={{ width: "100%" }}
                  title="Variable-length segments aligned to beats (4–8s)"
                >
                  {useClipPlan ? "On" : "Off"}
                </button>
              </div>
            </div>

            <div className="row3">
              <div className="field">
                <label>Length sync</label>
                <button
                  type="button"
                  className={lengthSync ? "primary" : "ghost"}
                  onClick={() => setLengthSync(!lengthSync)}
                  style={{ width: "100%" }}
                >
                  {lengthSync ? "Match track" : "Off"}
                </button>
              </div>
            </div>

            <div className="field">
              <label>Lip sync (optional, needs Wav2Lip setup)</label>
              <button
                type="button"
                className={lipSync ? "primary" : "ghost"}
                onClick={() => setLipSync(!lipSync)}
                style={{ width: "100%" }}
              >
                {lipSync ? "Enabled" : "Disabled"}
              </button>
            </div>
            {lipSync && (
              <div className="field">
                <label>Face image</label>
                <label className="dropzone" style={{ display: "block" }}>
                  {face ? <img src={face} alt="" /> : "Click to choose a face"}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={async (e) =>
                      e.target.files?.[0] && setFace(await fileToDataUrl(e.target.files[0]))
                    }
                  />
                </label>
              </div>
            )}

            <button
              className={busy ? "danger" : "primary"}
              style={{ width: "100%", marginTop: 6 }}
              onClick={busy ? () => job && api.cancelJob(job.job_id) : submit}
              disabled={!audio}
            >
              {busy ? "Cancel" : "Create music video"}
            </button>
          </div>

          <JobPanel
            job={job}
            placeholder="Your beat-synced music video will appear here"
            onCancel={busy ? () => job && api.cancelJob(job.job_id) : undefined}
          />
        </div>
        </>
      )}
    </>
  );
}

function Num({ label, v, on }: { label: string; v: number; on: (v: number) => void }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input type="number" value={v} onChange={(e) => on(parseInt(e.target.value) || 0)} />
    </div>
  );
}
