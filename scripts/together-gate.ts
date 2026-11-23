import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CdpConnection, cleanupRun, createPage, evaluate, fetchJsonBefore, launchChrome, reservePort,
  waitForSample, waitForVersion, withDeadline, type PageHandle } from "./browser-gate-harness";

const root = resolve(import.meta.dirname, "..");
const work = await mkdtemp(join(tmpdir(), "piik-client-media-"));
const serverPort = await reservePort(), mediaPort = await reservePort(), browserPort = await reservePort();
const origin = `http://127.0.0.1:${serverPort}`;
const password = randomBytes(24).toString("base64url");
const forceRelay = process.env.PIIK_TOGETHER_RELAY !== "false";
const output = join(root, "build/together-check", forceRelay ? "relay" : "auto");
const mediaIP = process.env.PIIK_TOGETHER_MEDIA_IP || "127.0.0.1";
const report: Record<string, unknown> = { forceRelay, stages: [] };
let server: ChildProcessWithoutNullStreams | null = null, native: ChildProcessWithoutNullStreams | null = null;
let chrome: ChildProcessWithoutNullStreams | null = null, cdp: CdpConnection | null = null;
let host: PageHandle | null = null;
let viewer: PageHandle | null = null;
let screenshotsSafe = true;
let serverError = "", nativePort = 0, nativeOutput = "";

function stage(name: string) { (report.stages as string[]).push(name); console.log(name); }
function child(exe: string, args: string[], env = process.env) {
  return spawn(exe, args, { cwd: work, env, stdio: "pipe", windowsHide: true });
}
async function command(exe: string, args: string[]) {
  const process = child(exe, args);
  let error = "";
  process.stdout.resume(); process.stderr.on("data", data => { error += data.toString(); });
  await withDeadline(() => new Promise<void>((done, fail) => {
    process.once("error", fail);
    process.once("exit", code => code === 0 ? done() : fail(new Error(error || `Command exit ${code}`)));
  }), Date.now() + 90_000);
}
const probe = `(() => {
  window.__together = { peers: [], routes: [], errors: [], gumCalls: 0, ice: [], messages: [] };
  const OriginalPC = window.RTCPeerConnection;
  window.RTCPeerConnection = class extends OriginalPC { constructor(...args) { super(...args); window.__together.peers.push(this);
    setTimeout(async () => { if (this.connectionState === 'closed') return;
      try { window.__together.ice.push(Array.from((await this.getStats()).values()).filter(s=>/candidate/.test(s.type)).map(s=>({type:s.type,state:s.state,address:s.address,port:s.port,requestsSent:s.requestsSent,responsesReceived:s.responsesReceived}))); } catch {}
    }, 8000);
  } };
  const OriginalSocket = window.WebSocket;
  const note = (direction, data) => { try { const message = JSON.parse(data);
    const upstream = message.routeAssignment?.upstream || message.assignment?.upstream;
    if (direction === 'in' && upstream) window.__together.routes.push(upstream.kind);
    window.__together.messages.push({ direction, type: message.type, revision: message.revision || message.routeRevision,
      phase: message.phase, role: message.role, code: message.code,
      upstream: upstream?.kind });
  } catch {} };
  window.WebSocket = class extends OriginalSocket { constructor(...args) { super(...args);
    this.addEventListener('message', event => note('in', event.data));
  } send(data) { note('out', data); return super.send(data); } };
  const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = (...args) => { window.__together.gumCalls++; return gum(...args); };
  window.addEventListener('error', event => window.__together.errors.push(event.message));
  window.addEventListener('unhandledrejection', event => window.__together.errors.push(String(event.reason)));
})();`;
async function js<T>(page: PageHandle, expression: string) {
  return evaluate<T>(cdp!, page, expression, Date.now() + 15_000);
}
async function until(page: PageHandle, expression: string, timeout = 25_000) {
  await waitForSample(deadline => evaluate(cdp!, page, expression, deadline), Boolean, timeout);
}
async function click(page: PageHandle, selector: string) {
  await until(page, `!!document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled`);
  await js(page, `document.querySelector(${JSON.stringify(selector)}).click()`);
}
async function shot(page: PageHandle, name: string) {
  const result = await cdp!.call<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }, page.sessionId, Date.now() + 10_000);
  await writeFile(join(output, name + ".png"), Buffer.from(result.data, "base64"));
}
async function stats(page: PageHandle) {
  return js<{ video: number; audio: number; routes: string[]; errors: string[] }>(page, `(async () => {
    let video = 0, audio = 0;
    for (const peer of window.__together.peers.filter(peer => peer.connectionState !== 'closed')) for (const item of (await peer.getStats()).values()) {
      if (item.type === 'inbound-rtp') { if (item.kind === 'video') video += item.framesDecoded || 0;
        if (item.kind === 'audio') audio += item.packetsReceived || 0; }
    }
    return { video, audio, routes: window.__together.routes, errors: window.__together.errors };
  })()`);
}

try {
  await mkdir(output, { recursive: true });
  stage(forceRelay ? "Start private server with forced relay" : "Start private server with automatic routing");
  server = child(join(root, "build/test/piik-server.exe"), [], { ...process.env,
    PIIK_ENV: "development", LISTEN_HOST: "127.0.0.1", PORT: String(serverPort), PUBLIC_BASE_URL: origin,
    ALLOWED_ORIGINS: origin, SITE_ACCESS_PASSWORD: password, ROOM_DATABASE_PATH: join(work, "rooms.sqlite"),
    STUN_URLS: "stun:127.0.0.1:3478", SFU_LISTEN_HOST: mediaIP, SFU_PUBLIC_IP: mediaIP,
    SFU_UDP_PORT: String(mediaPort), SFU_ONLY: String(forceRelay), PIIK_DEBUG: "route", PIIK_LOG_DIR: join(work, "logs"),
  });
  server.stdout.resume(); server.stderr.on("data", data => { serverError = (serverError + data.toString()).slice(-3000); });
  await waitForSample(deadline => fetchJsonBefore(`${origin}/healthz`, deadline), Boolean, 15_000);

  stage("Provision a friend ZIP using the shipped PowerShell script");
  const owner = join(work, "owner"), clientDir = join(owner, "Client");
  await cp(join(root, "deploy/together"), owner, { recursive: true });
  await mkdir(clientDir, { recursive: true });
  await cp(join(root, "build/test/piik-app.exe"), join(clientDir, "Piik Together.exe"));
  await cp(join(root, "build/upstream/windows/runtime"), join(clientDir, "runtime"), { recursive: true });
  await writeFile(join(owner, "Settings.json"), JSON.stringify({ serverUrl: origin, publicIp: "127.0.0.1", sitePassword: password, quality: "1080p60", relayOnly: forceRelay }));
  const packArgs = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(owner, "Make-FriendPackage.ps1")];
  await command("powershell.exe", packArgs);
  const entries = await readdir(join(owner, "Output"), { withFileTypes: true });
  const recipient = join(owner, "Output", entries.find(item => item.isDirectory() && item.name.startsWith("Piik-Friend-"))!.name);
  const profile = JSON.parse(await readFile(join(recipient, "piik-profile.json"), "utf8"));
  report.zipCreated = entries.some(item => item.name.endsWith(".zip"));

  stage("Start Windows App from its adjacent profile");
  native = child(join(recipient, "Piik Together.exe"), ["--config", join(work, "app/client.json")], { ...process.env, PIIK_CLIENT_GATE_NO_BROWSER: "true" });
  native.stderr.resume();
  native.stdout.on("data", data => {
    nativeOutput += data.toString();
    for (const line of nativeOutput.split(/\r?\n/)) {
      try { const value = JSON.parse(line); if (value.port && value.url) nativePort = value.port; } catch {}
    }
  });
  await waitForSample(async () => nativePort > 0, Boolean, 15_000);
  const appHealth = await fetch(`http://127.0.0.1:${nativePort}/health`).then(response => response.json());
  report.nativeCaptureAvailable = appHealth.nativeMedia?.video;
  const fragment = new URLSearchParams({ "piik-client": "1", "piik-room": JSON.stringify(profile.room),
    "client-access": profile.password, "piik-lang": "zh", "piik-mode": "text", "piik-theme": "light" });
  const hostURL = `${origin}/?debug=1&piik-client-port=${nativePort}#${fragment}`;

  chrome = await launchChrome(process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", browserPort, join(work, "chrome"),
    ["--headless=new", "--no-first-run", "--no-default-browser-check", "--window-size=1440,1000", "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-features=WebRtcHideLocalIpsWithMdns"]);
  chrome.stdout.resume(); chrome.stderr.resume();
  const version = await waitForVersion(browserPort, chrome);
  cdp = await CdpConnection.connect(version.webSocketDebuggerUrl, Date.now() + 10_000);
  host = await createPage(cdp, hostURL, probe);
  await until(host, "!!document.querySelector('#host-start-xss')");
  await cdp.call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, host.sessionId, Date.now() + 5000);
  await shot(host, "host-desktop");
  report.bootstrapConsumed = await js(host, "location.hash === '' && !location.search.includes('piik-client')");
  const context = await cdp.call<{ browserContextId: string }>("Target.createBrowserContext", {}, undefined, Date.now() + 5000);
  const viewerURL = new URL(profile.room.inviteUrl);
  viewerURL.searchParams.set("debug", "1");
  viewer = await createPage(cdp, viewerURL.toString(), probe, true, context.browserContextId);

  stage("Select simulated capture card video and stereo game audio");
  await click(host, "#host-start-xss");
  await until(host, "!!document.querySelector('.quick-card')");
  await js(host, "Array.from(document.querySelectorAll('.quick-card button')).find(button => button.textContent.includes('允许')).click()");
  await until(host, "document.querySelectorAll('.quick-card select')[0]?.options.length > 1 && !document.querySelector('.quick-card select').disabled");
  await js(host, `document.querySelectorAll('.quick-card select').forEach(select => {
    select.value = Array.from(select.options).find(option => option.value && option.value !== 'none').value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })`);
  await shot(host, "capture-card-setup");
  await click(host, ".quick-card button[type=submit]");
  await until(host, "!!document.querySelector('#host-stop-share')", 40_000);
  stage("Receive moving video and game audio in the private viewer");
  await until(viewer, "(() => { const v = document.querySelector('video'); return v && v.videoWidth > 0 && v.currentTime > 1; })()", 40_000);
  await waitForSample(() => stats(viewer!), value => value.video > 15 && value.audio > 15, 20_000);
  report.captureCard = await stats(viewer);
  if (forceRelay && !(report.captureCard as { routes: string[] }).routes.includes("sfu")) throw new Error("Viewer did not use the forced server relay");
  await shot(host, "host-live");
  await cdp.call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, viewer.sessionId, Date.now() + 5000);
  await shot(viewer, "viewer-desktop");
  await cdp.call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, viewer.sessionId, Date.now() + 5000);
  await cdp.call("Emulation.setTouchEmulationEnabled", { enabled: true }, viewer.sessionId, Date.now() + 5000);
  await shot(viewer, "viewer-phone");
  report.phoneFits = await js(viewer, "document.documentElement.scrollWidth <= innerWidth");

  stage("Stop, reload and start with the remembered capture card");
  await click(host, "#host-stop-share");
  await until(host, "!!document.querySelector('#host-start-xss')");
  const oldDocument = await js<number>(host, "performance.timeOrigin");
  await cdp.call("Page.reload", {}, host.sessionId, Date.now() + 5000);
  await until(host, `performance.timeOrigin !== ${oldDocument} && document.readyState === 'complete'`);
  await click(host, "#host-start-xss");
  await until(host, "!!document.querySelector('#host-stop-share')", 40_000);
  await until(viewer, "(() => { const v = document.querySelector('video'); return v && v.readyState >= 2 && !v.paused && v.currentTime > 1; })()", 40_000);
  report.rememberedCard = !await js(host, "!!document.querySelector('.quick-card')");

  stage("Stream a native PC display and reuse its saved selection");
  await click(host, "#host-stop-share");
  await click(host, "#host-start-share");
  screenshotsSafe = false;
  await click(host, 'button[role="tab"][id$="-display"]');
  await click(host, '[data-native-source^="display:"]');
  await click(host, '.lr-source-picker-footer button:not([aria-disabled="true"])');
  await until(host, "!!document.querySelector('#host-stop-share')", 40_000);
  await waitForSample(() => stats(viewer!), value => value.video > 15, 25_000);
  report.pcVideo = await stats(viewer);
  await click(host, "#host-stop-share");
  await click(host, "#host-start-share");
  await until(host, "!!document.querySelector('#host-stop-share')", 40_000);
  await waitForSample(() => stats(viewer!), value => value.video > 15, 25_000);
  report.rememberedPC = !await js(host, "!!document.querySelector('.lr-source-picker')");

  await command("powershell.exe", packArgs);
  const saved = JSON.parse(await readFile(join(owner, "owner-room.local.json"), "utf8"));
  report.repackKeepsRoom = saved.room.hostToken === profile.room.hostToken && saved.room.inviteUrl === profile.room.inviteUrl;

  stage("Check missing-device selection and private viewer access");
  await click(host, "#host-stop-share");
  await until(host, "!!document.querySelector('#host-start-xss')");
  screenshotsSafe = true;
  const before = await js<number>(host, "window.__together.gumCalls");
  await js(host, "window.__enumerateDevices = navigator.mediaDevices.enumerateDevices; navigator.mediaDevices.enumerateDevices = async () => []");
  await click(host, "#host-start-xss");
  await until(host, "!!document.querySelector('.quick-card')");
  report.missingCardDoesNotCapture = await js<number>(host, "window.__together.gumCalls") === before;
  const deniedContext = await cdp.call<{ browserContextId: string }>("Target.createBrowserContext", {}, undefined, Date.now() + 5000);
  const denied = await createPage(cdp, `${origin}/r/${profile.room.roomId}`, undefined, true, deniedContext.browserContextId);
  await until(denied, "!!document.querySelector('input[type=password]')");
  report.privateAccess = true;
  report.hostErrors = await js(host, "window.__together.errors");
  if (!report.bootstrapConsumed || !report.phoneFits || !report.rememberedCard || !report.rememberedPC || !report.repackKeepsRoom || !report.missingCardDoesNotCapture) {
    throw new Error("One of the package or playback checks failed");
  }
  report.passed = true;
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  if (host && cdp && screenshotsSafe) {
    try { await shot(host, "failure"); report.hostText = await js(host, "document.body.innerText.slice(0,1800)"); } catch {}
  }
  if (viewer && cdp) {
    try {
      if (screenshotsSafe) { await shot(viewer, "viewer-failure"); report.viewerText = await js(viewer, "document.body.innerText.slice(0,1800)"); }
      report.viewerProbe = await js(viewer, "({probe:typeof window.__together,peers:window.__together?.peers.map(p=>({state:p.connectionState,ice:p.iceConnectionState}))})");
      report.viewerStats = await stats(viewer);
      report.viewerMedia = await js(viewer, "Array.from(document.querySelectorAll('video,audio')).map(v => ({time:v.currentTime,paused:v.paused,muted:v.muted,readyState:v.readyState,width:v.videoWidth,tracks:v.srcObject?.getTracks().map(t=>({kind:t.kind,state:t.readyState,enabled:t.enabled,muted:t.muted}))}))");
    } catch {}
  }
  report.serverError = serverError;
  if (host && cdp) {
    try {
      report.hostProbe = await js(host, "({probe:typeof window.__together,peers:window.__together?.peers.map(p=>({state:p.connectionState,ice:p.iceConnectionState}))})");
      report.hostIce = await js(host, "window.__together?.ice");
      report.hostMessages = await js(host, "window.__together?.messages.slice(-40)");
      report.hostDebug = await js(host, "window.__PIIK_DEBUG__?.events().filter(e=>/sfu|ice|fail|candidate/.test(e.event + e.scope)).slice(-25)");
    } catch {}
  }
  process.exitCode = 1;
} finally {
  report.cleanup = await cleanupRun({ cdp, native, chrome, server, profile: work,
    ports: [serverPort, browserPort, ...(nativePort ? [nativePort] : [])] });
  await mkdir(output, { recursive: true });
  await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
