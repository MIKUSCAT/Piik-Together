import { z } from "zod";
import { nativeCaptureTargetSchema, type NativeCaptureTarget } from "../native/wire";
import type { CaptureDevice } from "./capture-devices";

const deviceSchema = z.object({ id: z.string().min(1), label: z.string() });
const cardSchema = z.object({ video: deviceSchema, audio: deviceSchema.nullable() });
const pcSchema = z.object({ target: nativeCaptureTargetSchema, audio: z.boolean(), showCaptureBorder: z.boolean() });
export type CaptureCardPreset = z.infer<typeof cardSchema>;
export type PCCapturePreset = z.infer<typeof pcSchema>;

function read<T>(key: string, schema: z.ZodType<T>): T | null {
  try { return schema.safeParse(JSON.parse(localStorage.getItem(key) ?? "null")).data ?? null; }
  catch { return null; }
}
function save(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Capture still works without storage. */ }
}
export const readCaptureCard = () => read("piik:capture-card:v1", cardSchema);
export const saveCaptureCard = (value: CaptureCardPreset) => save("piik:capture-card:v1", value);
export const readPCCapture = () => read("piik:pc-capture:v1", pcSchema);
export const savePCCapture = (value: PCCapturePreset) => save("piik:pc-capture:v1", value);

export function resolveCaptureDevice(saved: CaptureDevice, devices: CaptureDevice[]): CaptureDevice | null {
  const exact = devices.find(device => device.id === saved.id);
  if (exact) return exact;
  const named = saved.label ? devices.filter(device => device.label === saved.label) : [];
  return named.length === 1 ? named[0]! : null;
}

export function suggestedCaptureDevice(devices: CaptureDevice[]): string {
  const cards = devices.filter(device => /MS213[01]|UGREEN|绿联|HDMI|capture|USB video|USB digital audio/i.test(device.label));
  return cards.length === 1 ? cards[0]!.id : "";
}

export function resolvePCCapture(saved: NativeCaptureTarget, targets: NativeCaptureTarget[]): NativeCaptureTarget | null {
  if (saved.kind === "picker") return null;
  const exact = targets.find(target => target.kind === saved.kind && target.sourceId === saved.sourceId &&
    (target.kind === "window" && saved.kind === "window"
      ? target.pid === saved.pid && target.creationTime === saved.creationTime
      : target.title === saved.title));
  if (exact) return exact;
  const named = targets.filter(target => target.kind === saved.kind && target.title === saved.title);
  return named.length === 1 ? named[0]! : null;
}
