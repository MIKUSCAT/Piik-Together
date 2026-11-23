import { afterEach, expect, it, vi } from "vitest";
import { readCaptureCard, resolveCaptureDevice, resolvePCCapture, saveCaptureCard, suggestedCaptureDevice } from "../src/client/media/capture-preset";
import { captureBrowserSource, QUALITY_PROFILES } from "../src/client/media/quality";

afterEach(() => vi.unstubAllGlobals());

it("remembers both capture-card devices and captures game audio without microphone processing", async () => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => store.get(key), setItem: (key: string, value: string) => store.set(key, value) });
  const preset = { video: { id: "card-video", label: "USB Video" }, audio: { id: "card-audio", label: "USB Digital Audio" } };
  saveCaptureCard(preset);
  expect(readCaptureCard()).toEqual(preset);
  const video = { readyState: "live", contentHint: "" }, audio = { readyState: "live", contentHint: "" };
  const stream = { getTracks: () => [video, audio], getVideoTracks: () => [video], getAudioTracks: () => [audio] };
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  expect(await captureBrowserSource(QUALITY_PROFILES["1080p60"], "camera", preset.video.id, preset.audio.id)).toBe(stream);
  expect(getUserMedia).toHaveBeenCalledWith({
    video: expect.objectContaining({ deviceId: { exact: "card-video" } }),
    audio: { deviceId: { exact: "card-audio" }, channelCount: { ideal: 2 }, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  expect(audio.contentHint).toBe("music");
});

it("requires a new choice when the saved card is missing or a label is ambiguous", () => {
  const card = { id: "old-id", label: "USB Video" };
  const webcam = { id: "webcam", label: "Integrated Camera" };
  expect(resolveCaptureDevice(card, [webcam])).toBeNull();
  const replacement = { id: "new-id", label: card.label };
  expect(resolveCaptureDevice(card, [webcam, replacement])).toEqual(replacement);
  expect(resolveCaptureDevice(card, [replacement, { ...replacement, id: "another" }])).toBeNull();
  expect(suggestedCaptureDevice([webcam])).toBe("");
});

it("surfaces missing-device capture failures without retrying a default camera or microphone", async () => {
  const getUserMedia = vi.fn().mockRejectedValue(new DOMException("Disconnected", "NotFoundError"));
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  await expect(captureBrowserSource(QUALITY_PROFILES["1080p60"], "camera", "missing", "missing-audio")).rejects.toThrow("Disconnected");
  expect(getUserMedia).toHaveBeenCalledTimes(1);
});

it("reuses a game window by identity or unique title without taking a reused handle", () => {
  const saved = { kind: "window" as const, sourceId: "123", pid: 50, creationTime: "100", title: "My game" };
  const other = { ...saved, pid: 51, creationTime: "200", title: "Private chat" };
  expect(resolvePCCapture(saved, [other])).toBeNull();
  const restarted = { ...saved, sourceId: "456", pid: 52, creationTime: "300" };
  expect(resolvePCCapture(saved, [other, restarted])).toEqual(restarted);
});
