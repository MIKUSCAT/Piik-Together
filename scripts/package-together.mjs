#!/usr/bin/env node
import { spawn, execFileSync } from "node:child_process";
import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeAppLicenseNotices } from "./package-licenses.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(process.argv[2] ?? join(root, "build", "Piik-Together"));
const upstream = resolve(process.argv[3] ?? join(root, "build", "upstream", "windows"));
const go = process.env.GO_BINARY ?? "go";
const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true }).trim();
const nativeChanges = execFileSync("git", ["diff", "v2.8.0", "HEAD", "--", "native", "internal/app/nativecapture", "internal/app/nativeaudio"],
  { cwd: root, encoding: "utf8", windowsHide: true });
if (nativeChanges.trim()) throw new Error("Native helper changed since v2.8.0; build a matching helper before packaging.");
if (!existsSync(join(upstream, "runtime", "native", "piik-capture.exe"))) throw new Error("Extract the official v2.8.0 Windows App into build/upstream/windows first.");
if (!existsSync(join(root, "internal/server/webassets/dist/index.html"))) throw new Error("Run npm run build:web first.");
if (existsSync(join(out, "Settings.json"))) throw new Error("Choose a new output directory; existing owner settings must be preserved.");

mkdirSync(out, { recursive: true });
cpSync(join(root, "deploy/together"), out, { recursive: true,
  filter: source => !source.endsWith("Settings.json") && !source.endsWith(".env") && !source.endsWith("Dockerfile") });
copyFileSync(join(out, "Settings.example.json"), join(out, "Settings.json"));
const client = join(out, "Client"), server = join(out, "Server");
mkdirSync(client, { recursive: true });
cpSync(join(upstream, "runtime", "native"), join(client, "runtime", "native"), { recursive: true });
copyFileSync(join(root, "LICENSE"), join(server, "LICENSE"));
writeFileSync(join(client, "使用说明.txt"), "解压整个文件夹后，双击 Piik Together.exe。网址和密钥已配置好。\r\n电脑游戏：点「电脑游戏」，选择游戏窗口或屏幕；仅分享游戏画面不需要摄像头。\r\n若选择「浏览器」，再点「选择画面」，选游戏窗口或屏幕，并按需开启共享声音。\r\nXSS：点「XSS 开播」，首次允许访问设备后，选择采集卡的画面和声音；不要选电脑自带摄像头。\r\n直播间点「停止」结束直播；托盘图标右键可以打开直播间或退出。\r\n观看的人使用打包者保留的观看链接，无需点「电脑游戏」开播。\r\n", "utf8");
const ldflags = `-s -w -X github.com/TNTcraftHIM/Piik/internal/app/buildinfo.Release=v2.8.0 -X github.com/TNTcraftHIM/Piik/internal/app/buildinfo.Revision=${revision}-together`;
function build(goos, goarch, command, destination, gui = false) {
  mkdirSync(dirname(destination), { recursive: true });
  return new Promise((done, fail) => {
    const child = spawn(go, ["build", "-trimpath", "-ldflags", ldflags + (gui ? " -H=windowsgui" : ""), "-o", destination, command], {
      cwd: root, env: { ...process.env, GOOS: goos, GOARCH: goarch, CGO_ENABLED: "0" }, windowsHide: true, stdio: "inherit",
    });
    child.once("error", fail);
    child.once("exit", code => code === 0 ? done() : fail(new Error(`Go ${goos}/${goarch} build failed: ${code}`)));
  });
}
await build("windows", "amd64", "./cmd/piik-app", join(client, "Piik Together.exe"), true);
writeAppLicenseNotices(root, client, go, { goos: "windows", goarch: "amd64", captureName: "piik-capture.exe" });
// The reused native runtime carries its own upstream notices (tunnel helper omitted).
copyFileSync(join(upstream, "THIRD-PARTY-NOTICES.txt"), join(client, "UPSTREAM-RUNTIME-NOTICES.txt"));
writeFileSync(join(out, "BUILD.txt"), `Piik Together, based on Piik v2.8.0\nSource base: ${revision}\nNative runtime: ${readFileSync(join(upstream, "REVISION"), "utf8").trim()}\nBuilt: ${new Date().toISOString()}\n`);
console.log(`Owner package ready: ${out}`);
