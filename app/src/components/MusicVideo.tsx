import { useCallback, useEffect, useMemo, useState } from "react";
import { AudioAnalysis, JobStatus, ModelStatus, api } from "../api";
import {
  DirectorCraftSettings,
  craftToPayload,
  enrichBriefWithCraft,
  loadDirectorCraft,
} from "../lib/director-craft";
import { DirectorCatalog, loadDirectorCatalog } from "../lib/director-catalog";
import type { HandoffApplyResult } from "../lib/music-handoff";
import { MV_DURATION_MODES } from "../lib/music-handoff";
import type { MusicVideoAnalyzerSeed } from "../lib/analyzer-bridge";
import { DEFAULT_PRODUCTION_MAX_CLIPS, suggestedSceneCount } from "../lib/production-clip-plan";
import {
  enrichBriefWithStyleDna,
  fetchMusicBrainzStyleHints,
  inferStyleDnaFromText,
} from "../lib/style-dna";
import DirectorCraft from "./DirectorCraft";
import HandoffImport from "./HandoffImport";
import InspireBar from "./InspireBar";
import { JobPanel, fileToDataUrl } from "./shared";

interface Props {
  models: ModelStatus[];
  jobs: JobStatus[];
  onError: (e: unknown) => void;
  seed?: MusicVideoAnalyzerSeed | null;
  onSeedConsumed?: () => void;
}

export default function MusicVideo({ models, jobs, onError, seed, onSeedConsumed }: Props) {
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
  const [separateVocals, setSeparateVocals] = useState(false);
  const [face, setFace] = useState<string | null>(null);
  const [durationMode, setDurationMode] = useState<"full" | "highlight">("full");
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(-1);
  const [styleDnaQuery, setStyleDnaQuery] = useState("");
  const [styleDnaText, setStyleDnaText] = useState("");
  const [craft, setCraft] = useState<DirectorCraftSettings>(loadDirectorCraft);
  const [catalog, setCatalog] = useState<DirectorCatalog | null>(null);
  const [handoffNote, setHandoffNote] = useState<string | null>(null);

  const [jobId, setJobId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadDirectorCatalog().then(setCatalog).catch(() => {});
  }, []);

  useEffect(() => {
    if (!modelId && ready.length) setModelId(ready[0].id);
  }, [ready, modelId]);

  useEffect(() => {
    if (!seed) return;
    setBrief(seed.brief);
    setAudio(seed.audioB64);
    setAudioName(seed.audioName);
    setAnalysis(seed.audioAnalysis);
    if (seed.imageB64) setImage(seed.imageB64);
    setDurationMode(seed.durationMode);
    setRangeStart(seed.rangeStart);
    setRangeEnd(seed.rangeEnd);
    if (seed.preferImageToVideo) setTask("image-to-video");
    if (seed.lipSync) setLipSync(true);
    if (seed.audioAnalysis.clip_plan?.length) {
      setNScenes(suggestedSceneCount(seed.audioAnalysis.clip_plan));
    }
    setHandoffNote(seed.note);
    onSeedConsumed?.();
  }, [seed, onSeedConsumed]);

  const selected = ready.find((m) => m.id === modelId) || null;
  const job = jobId ? jobs.find((j) => j.job_id === jobId) || null : null;
  const busy =
    submitting || (job != null && (job.status === "queued" || job.status === "running"));

  const analyzeOpts = useMemo(
    () => ({
      range_start: durationMode === "highlight" ? rangeStart : 0,
      range_end:
        durationMode === "highlight" && rangeEnd > rangeStart ? rangeEnd : -1,
      max_clips: DEFAULT_PRODUCTION_MAX_CLIPS,
    }),
    [durationMode, rangeStart, rangeEnd],
  );

  async function onAudio(file: File) {
    const url = await fileToDataUrl(file);
    setAudio(url);
    setAudioName(file.name);
    setAnalysis(null);
    setAnalyzing(true);
    try {
      const result = await api.analyzeAudio(url, analyzeOpts);
      setAnalysis(result);
      if (result.clip_plan?.length) {
        setNScenes(suggestedSceneCount(result.clip_plan));
      }
      if (result.vocals_likely) setLipSync(true);
    } catch (e) {
      onError(e);
    } finally {
      setAnalyzing(false);
    }
  }

  const onHandoff = useCallback(
    (result: HandoffApplyResult) => {
      setBrief(result.brief);
      setDurationMode(result.durationMode);
      setRangeStart(result.rangeStart);
      setRangeEnd(result.rangeEnd);
      if (result.preferImageToVideo) setTask("image-to-video");
      if (result.lipSyncHint) setLipSync(true);
      if (result.styleTokens) setStyleDnaText(result.styleTokens);
      if (result.audioAnalysis) {
        setAnalysis(result.audioAnalysis as AudioAnalysis);
        if (result.audioAnalysis.clip_plan?.length) {
          setNScenes(suggestedSceneCount(result.audioAnalysis.clip_plan));
        }
      }
      setHandoffNote(result.note);
    },
    [],
  );

  async function applyStyleDna() {
    let tokens = styleDnaText.trim();
    if (styleDnaQuery.trim()) {
      const mb = await fetchMusicBrainzStyleHints(styleDnaQuery.trim());
      if (mb) tokens = tokens ? `${tokens}, ${mb}` : mb;
    }
    if (!tokens) return;
    setBrief((b) => enrichBriefWithStyleDna(b, tokens));
    setStyleDnaText(tokens);
  }

  async function submit() {
    if (!selected) return;
    if (!audio) return onError("Add a music file first.");
    if (task === "image-to-video" && !image)
      return onError("Image-to-video mode needs a base picture.");
    setSubmitting(true);
    try {
      const dp = selected.default_params || {};
      let finalBrief = brief;
      if (catalog) {
        finalBrief = enrichBriefWithCraft(brief, catalog, craft);
      }
      if (styleDnaText.trim()) {
        finalBrief = enrichBriefWithStyleDna(finalBrief, styleDnaText);
      }
      const { job_id } = await api.createMusicVideo({
        model_id: selected.id,
        task,
        brief: finalBrief,
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
        max_clips: DEFAULT_PRODUCTION_MAX_CLIPS,
        duration_mode: durationMode,
        range_start: durationMode === "highlight" ? rangeStart : 0,
        range_end: durationMode === "highlight" ? rangeEnd : -1,
        separate_vocals: separateVocals,
        director_craft: catalog ? craftToPayload(catalog, craft) : undefined,
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
          <HandoffImport
            onApplied={onHandoff}
            onError={onError}
            onAudioSidecar={(b64, name) => {
              setAudio(b64);
              setAudioName(name);
            }}
          />
          {handoffNote && <p className="desc good-text">{handoffNote}</p>}

          <InspireBar mode="music-video" onBrief={setBrief} />
          <DirectorCraft onChange={setCraft} />

          <div className="card" style={{ marginBottom: 12 }}>
            <div className="field">
              <label>Style DNA (optional)</label>
              <p className="desc">
                Paste Suno style tokens or search artist/title for visual mood hints.
              </p>
              <input
                placeholder="Artist or track title (MusicBrainz)"
                value={styleDnaQuery}
                onChange={(e) => setStyleDnaQuery(e.target.value)}
              />
              <textarea
                placeholder="Style tokens, e.g. dark synthwave, driving 128 BPM"
                value={styleDnaText}
                onChange={(e) => setStyleDnaText(e.target.value)}
                rows={2}
                style={{ marginTop: 6 }}
              />
              <button type="button" className="ghost" onClick={() => void applyStyleDna()}>
                Apply to brief
              </button>
              {styleDnaText && (
                <p className="desc">
                  Mood hint: {inferStyleDnaFromText(styleDnaText).mood}
                </p>
              )}
            </div>
          </div>

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
                    onChange={(e) => e.target.files?.[0] && void onAudio(e.target.files[0])}
                  />
                </label>
                {analyzing && <div className="desc">analyzing…</div>}
                {analysis && (
                  <div className="meta">
                    <span className="badge good">{analysis.tempo.toFixed(0)} BPM</span>
                    <span className="badge">{analysis.duration.toFixed(1)}s</span>
                    <span className="badge">{analysis.num_beats} beats</span>
                    {analysis.clip_count != null && analysis.clip_count > 0 && (
                      <span className="badge good">
                        {Math.min(analysis.clip_count, DEFAULT_PRODUCTION_MAX_CLIPS)} clip cap
                      </span>
                    )}
                    {analysis.vocals_likely && (
                      <span className="badge warn">vocals likely</span>
                    )}
                  </div>
                )}
              </div>

              <div className="field">
                <label>Duration mode</label>
                <div className="seg">
                  <button
                    className={durationMode === MV_DURATION_MODES.FULL ? "active" : ""}
                    onClick={() => setDurationMode("full")}
                  >
                    Full track
                  </button>
                  <button
                    className={durationMode === MV_DURATION_MODES.HIGHLIGHT ? "active" : ""}
                    onClick={() => setDurationMode("highlight")}
                  >
                    Highlight section
                  </button>
                </div>
                {durationMode === "highlight" && (
                  <div className="row3" style={{ marginTop: 6 }}>
                    <Num label="Start (s)" v={rangeStart} on={setRangeStart} />
                    <Num label="End (s)" v={rangeEnd} on={setRangeEnd} />
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
                        e.target.files?.[0] &&
                        setImage(await fileToDataUrl(e.target.files[0]))
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
                <label>Lip sync (optional, needs Wav2Lip)</label>
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
                <>
                  <div className="field">
                    <label>Isolate vocals (Demucs, optional)</label>
                    <button
                      type="button"
                      className={separateVocals ? "primary" : "ghost"}
                      onClick={() => setSeparateVocals(!separateVocals)}
                      style={{ width: "100%" }}
                    >
                      {separateVocals ? "On" : "Off"}
                    </button>
                  </div>
                  <div className="field">
                    <label>Face image</label>
                    <label className="dropzone" style={{ display: "block" }}>
                      {face ? <img src={face} alt="" /> : "Click to choose a face"}
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={async (e) =>
                          e.target.files?.[0] &&
                          setFace(await fileToDataUrl(e.target.files[0]))
                        }
                      />
                    </label>
                  </div>
                </>
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
      <input type="number" value={v} onChange={(e) => on(parseFloat(e.target.value) || 0)} />
    </div>
  );
}
