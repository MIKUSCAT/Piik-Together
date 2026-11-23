import { afterEach, expect, it, vi } from "vitest";
import { clearHostRoom, isPackagedHost, readHostRoom, readViewerGrant, takeClientLaunchBootstrap } from "../src/client/lib/session";

afterEach(() => { clearHostRoom(); vi.unstubAllGlobals(); });

function launch(lockAvailable = true) {
  const local = new Map<string, string>(), session = new Map<string, string>();
  const storage = (values: Map<string, string>) => ({
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key),
  });
  const room = { roomId: "1234", hostToken: "a".repeat(32), inviteUrl: `https://share.test/r/1234#v=${"b".repeat(21)}A` };
  const location = new URL(`https://share.test/#${new URLSearchParams({ "piik-client": "1", "piik-room": JSON.stringify(room), "client-access": "my private password" })}`);
  const replaceState = vi.fn();
  vi.stubGlobal("window", {
    location, localStorage: storage(local), sessionStorage: storage(session),
    history: { state: null, replaceState }, dispatchEvent: vi.fn(),
    navigator: { locks: { request: (_name: string, _options: unknown, callback: (lock: unknown) => Promise<void>) => callback(lockAvailable ? {} : null) } },
  });
  return { room, local, session, replaceState };
}

it("consumes packaged credentials and resumes the provisioned private room and viewer invitation", async () => {
  const { room, local, replaceState } = launch();
  expect(takeClientLaunchBootstrap().accessToken).toBe("my private password");
  expect(replaceState).toHaveBeenCalledWith(null, "", "/");
  expect(isPackagedHost()).toBe(true);
  expect(await readHostRoom()).toEqual({ roomId: room.roomId, hostToken: room.hostToken, canonicalUrl: "https://share.test/r/1234" });
  expect(readViewerGrant(room.roomId)).toBe("b".repeat(21) + "A");
  expect(local.get("piik:host-room:v1")).toContain(room.hostToken);
});

it("does not take a packaged room already owned by another tab", async () => {
  launch(false);
  takeClientLaunchBootstrap();
  expect(await readHostRoom()).toBeNull();
  expect(isPackagedHost()).toBe(true);
});
