import { useEffect, useState } from "react";
import type { QualitySettings, ServerMessage } from "../../../shared/protocol";
import {
  QUALITY_PROFILES, VIDEO_CAPTURE_LIMITS, MAX_AUDIO_SEND_BITRATE,
  captureFramerateCeiling, matchingQualityProfileId, qualitySettingsEqual, screenAudioBitrate,
} from "../../media/quality";
import { createOpaqueId } from "../../lib/opaque-id";
import { useCopy, type CopyKey } from "../../ui/copy";
import { Btn } from "./primitives";
import { SharingSettings } from "./SharingSettings";
import {
  AudioBitrateControl, PicturePreferenceControl, PictureSettingsSummary,
  QualityPresets, ResolutionControl, VideoRateControls,
} from "./QualityPresets";

export type QualityControlResult = Extract<ServerMessage, { type: "quality-control-result" }>;
const RESULT_KEYS: Record<QualityControlResult["status"], CopyKey> = {
  applied: "viewer.quality.applied", busy: "viewer.quality.busy", failed: "viewer.quality.failed",
  unavailable: "viewer.quality.unavailable", forbidden: "viewer.quality.forbidden", timeout: "viewer.quality.timeout",
};

// Drafts belong to this viewer; capture and persistence stay with the Host.
export function RemoteQualitySettings({ value, generation, available, supported, result, onApply }: {
  value: QualitySettings;
  generation: string | null;
  available: boolean;
  supported: boolean | null;
  result: QualityControlResult | null;
  onApply: (requestId: string, quality: QualitySettings) => boolean;
}) {
  const { t } = useCopy();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<QualitySettings | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<CopyKey | null>(null);
  const edited = draft ?? value;
  const dirty = !qualitySettingsEqual(edited, value);
  const disabled = !available || supported !== true || pending !== null;

  useEffect(() => {
    setDraft(current => current && qualitySettingsEqual(current, value) ? null : current);
  }, [value]);
  useEffect(() => { setDraft(null); setPending(null); setNotice(null); }, [generation]);
  useEffect(() => {
    if (!available && pending !== null) {
      setPending(null);
      setNotice("viewer.quality.unavailable");
    }
  }, [available, pending]);
  useEffect(() => {
    if (!result || result.requestId !== pending) return;
    setPending(null);
    setNotice(RESULT_KEYS[result.status]);
    if (result.status === "applied") setDraft(null);
  }, [result, pending]);

  function edit(patch: Partial<QualitySettings>): void {
    const next = { ...edited, ...patch };
    setDraft(qualitySettingsEqual(next, value) ? null : next);
    setNotice(null);
  }

  const status = pending ? "viewer.quality.applying"
    : supported === null ? "viewer.quality.loading"
    : !supported ? "viewer.quality.updateRequired"
    : notice ?? (!available ? "viewer.quality.unavailable" : null);

  return <div className="lr-remote-quality">
    <div className="lr-remote-quality-heading">
      <Btn id="viewer-quality-toggle" icon="sliders" title="viewer.quality.title" cap="viewer.quality.title"
        expanded={open} controls="viewer-quality-settings" onClick={() => setOpen(!open)} />
      <PictureSettingsSummary value={value} />
    </div>
    {open && <p className="lr-remote-quality-note">{t("viewer.quality.scope")}</p>}
    <SharingSettings id="viewer-quality-settings" open={open} busy={pending !== null}
      presets={<QualityPresets selected={matchingQualityProfileId(edited)} disabled={disabled}
        onSelect={id => edit(QUALITY_PROFILES[id])} />}
      pictureSummary={<PictureSettingsSummary value={edited} />}
      picture={<>
        <ResolutionControl value={edited.resolution} limits={VIDEO_CAPTURE_LIMITS} disabled={disabled}
          onChange={resolution => edit({ resolution,
            maxFramerate: Math.min(edited.maxFramerate, captureFramerateCeiling(resolution)) })} />
        <VideoRateControls value={edited} limits={VIDEO_CAPTURE_LIMITS} disabled={disabled} onChange={edit} />
        <PicturePreferenceControl value={edited.degradationPreference} disabled={disabled}
          onChange={degradationPreference => edit({ degradationPreference })} />
      </>}
      audio={<AudioBitrateControl value={screenAudioBitrate(edited.maxAudioBitrate)} max={MAX_AUDIO_SEND_BITRATE}
        disabled={disabled} onChange={maxAudioBitrate => edit({ maxAudioBitrate })} />} />
    {open && <div className="lr-remote-quality-actions">
      <Btn id="viewer-quality-apply" icon="check" title="viewer.quality.apply" cap="viewer.quality.apply"
        tone="primary" disabled={disabled || !dirty} onClick={() => {
          const requestId = createOpaqueId();
          if (onApply(requestId, edited)) { setPending(requestId); setNotice(null); }
          else setNotice("viewer.quality.unavailable");
        }} />
      <Btn icon="x" title="viewer.quality.discard" cap="viewer.quality.discard"
        disabled={!dirty || pending !== null} onClick={() => { setDraft(null); setNotice(null); }} />
      <span className="lr-remote-quality-result" role="status" aria-live="polite">{status ? t(status) : ""}</span>
    </div>}
  </div>;
}
