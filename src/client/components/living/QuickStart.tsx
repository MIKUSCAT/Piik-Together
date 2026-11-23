import { useEffect, useRef, useState } from "react";
import { browserCaptureDevices, type CaptureDevice } from "../../media/capture-devices";
import { readCaptureCard, readPCCapture, resolveCaptureDevice, saveCaptureCard, suggestedCaptureDevice } from "../../media/capture-preset";
import { useCopy } from "../../ui/copy";
import { Glyph } from "../../ui/icons";

export function QuickStart({ disabled, onPC, onChoosePC, onCard }: {
  disabled: boolean;
  onPC: () => void;
  onChoosePC: () => void;
  onCard: (videoId: string, audioId: string) => void;
}) {
  const { t } = useCopy();
  const [setup, setSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [videos, setVideos] = useState<CaptureDevice[]>([]);
  const [audios, setAudios] = useState<CaptureDevice[]>([]);
  const [videoId, setVideoId] = useState("");
  const [audioId, setAudioId] = useState("");
  const [saved, setSaved] = useState(readCaptureCard);
  const [savedPC] = useState(readPCCapture);
  const operation = useRef(0);
  useEffect(() => () => { operation.current++; }, []);

  async function requestDevicePermission() {
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      probe.getTracks().forEach(track => track.stop());
      return;
    } catch {
      let granted = false;
      for (const constraints of [{ video: true }, { audio: true }] as const) {
        try {
          const probe = await navigator.mediaDevices.getUserMedia(constraints);
          probe.getTracks().forEach(track => track.stop());
          granted = true;
        } catch { /* Try each media kind independently when one is unavailable. */ }
      }
      if (!granted) throw new Error("Device permission unavailable");
    }
  }

  async function chooseCard(edit = false, permission = false) {
    const request = ++operation.current;
    setBusy(true); setError("");
    try {
      if (permission) await requestDevicePermission();
      if (operation.current !== request) return;
      const [videoDevices, audioDevices] = await Promise.all([
        browserCaptureDevices("videoinput"), browserCaptureDevices("audioinput"),
      ]);
      if (operation.current !== request) return;
      const video = saved && resolveCaptureDevice(saved.video, videoDevices);
      const audio = saved?.audio && resolveCaptureDevice(saved.audio, audioDevices);
      if (!edit && saved && video && (!saved.audio || audio)) {
        saveCaptureCard({ video, audio: audio || null });
        onCard(video.id, audio?.id ?? ""); return;
      }
      setVideos(videoDevices); setAudios(audioDevices);
      setVideoId(video?.id ?? suggestedCaptureDevice(videoDevices));
      setAudioId(saved && !saved.audio ? "none" : audio?.id ?? suggestedCaptureDevice(audioDevices));
      setSetup(true);
      if (saved && !edit) setError(t("quick.cardMissing"));
    } catch {
      setSetup(true); setError(t("quick.deviceError"));
    } finally {
      if (operation.current === request) setBusy(false);
    }
  }

  if (setup) return <form className="quick-card" onSubmit={event => {
    event.preventDefault();
    const video = videos.find(device => device.id === videoId);
    const audio = audioId === "none" ? null : audios.find(device => device.id === audioId);
    if (!video || audio === undefined) return;
    const preset = { video, audio };
    saveCaptureCard(preset); setSaved(preset); setSetup(false);
    onCard(video.id, audio?.id ?? "");
  }}>
    <h2>{t("quick.cardTitle")}</h2>
    <label>{t("quick.video")}<select value={videoId} onChange={event => setVideoId(event.target.value)} disabled={busy}>
      <option value="">{t("quick.chooseDevice")}</option>
      {videos.map((device, index) => <option key={device.id} value={device.id}>{device.label || `${t("quick.video")} ${index + 1}`}</option>)}
    </select></label>
    <label>{t("quick.audio")}<select value={audioId} onChange={event => setAudioId(event.target.value)} disabled={busy}>
      <option value="">{t("quick.chooseDevice")}</option>
      {audios.map((device, index) => <option key={device.id} value={device.id}>{device.label || `${t("quick.audio")} ${index + 1}`}</option>)}
      <option value="none">{t("quick.noAudio")}</option>
    </select></label>
    {error ? <p className="quick-error" role="alert">{error}</p>
      : videos.length === 0 ? <p className="quick-hint">{t("quick.allowHint")}</p> : null}
    <div className="quick-card-actions">
      <button type="button" className="quick-link" disabled={busy} onClick={() => void chooseCard(true, true)}>{t("quick.allowDevices")}</button>
      <button type="button" className="quick-button" onClick={() => { operation.current++; setBusy(false); setSetup(false); }}>{t("common.cancel")}</button>
      <button type="submit" className="quick-button is-primary" disabled={disabled || busy || !videoId || !audioId}>{t("quick.start")}</button>
    </div>
  </form>;

  return <div className="quick-start">
    <h2>{t("quick.title")}</h2>
    <div className="quick-actions">
      <button id="host-start-xss" type="button" className="quick-button is-primary" disabled={disabled || busy}
        onClick={() => void chooseCard()}><Glyph name="gamepad" size={22} />{t(busy ? "quick.connecting" : "quick.xss")}</button>
      <button id="host-start-share" type="button" className="quick-button" disabled={disabled || busy}
        onClick={onPC}><Glyph name="display" size={22} />{t("quick.pc")}</button>
    </div>
    {(saved || savedPC) && <div className="quick-actions">
      {saved && <button className="quick-link" type="button" disabled={disabled || busy} onClick={() => void chooseCard(true)}>{t("quick.changeCard")}</button>}
      {savedPC && <button className="quick-link" type="button" disabled={disabled || busy} onClick={onChoosePC}>{t("quick.changePC")}</button>}
    </div>}
  </div>;
}
