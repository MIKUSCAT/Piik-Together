Piik Together

你来配置
1. 编辑 Settings.json：服务器网址、公网 IPv4、站点密码。默认 1080p30。
2. 双击 1-Prepare-Server.cmd，把 Output 中生成的 Piik-Server ZIP 发给朋友部署。
3. 朋友按服务器环境二选一部署：
   - 宿主机 Nginx：在解压目录执行 docker compose pull && docker compose up -d，并按 nginx.conf.example 配好 HTTPS 反代。
   - Coolify 面板：新建 Docker Compose Empty，直接粘贴 Server/compose.coolify.yaml，域名填 https://你的域名:8787 并填入环境变量后 Deploy（无需配置 Nginx）。
4. 网址能正常打开后，双击 2-Make-FriendPackage.cmd。
5. 把 Output 中的 Piik-Friend ZIP 发给她；Watch.url / Watch.txt 留给自己。

她来开播
解压整个 ZIP，双击 Piik Together.exe。
XSS：第一次点「XSS 开播」，按提示点「允许访问设备」，选择采集卡的画面和声音；以后会记住。
电脑游戏：第一次选游戏窗口或屏幕；同一来源仍存在时直接开播。
直播间点「停止」结束直播；托盘图标右键「退出」关闭程序。

你来观看
电脑打开 Watch.url，手机打开 Watch.txt 中的完整链接。
第一次访问（或服务端重启后）需输入你在 Settings.json 里设置的站点密码。
手机如没有自动播放，点一下播放；游戏声音和麦克风是两个独立开关。
不要删掉链接中 #v= 后面的内容，也不要把观看链接发给其他人。
新生成的 Watch 链接带有房间拥有者的调参权限。开播后可在观看页打开「直播参数」，选择预设或细调后点「应用到直播」。
普通邀请没有调参权限。直播参数会影响对方发送的画面及编码、上传负担；音量、缩放和缓冲只影响自己的观看。

服务器要求
Linux amd64 或 arm64，Docker Engine 和 Docker Compose v2，以及已配置 HTTPS 证书的 Nginx。
域名 A 记录直接指向公网 IPv4，不要套 HTTP CDN 代理（例如 Cloudflare 小黄云）。
放行 TCP 80/443（Nginx）以及 UDP 3478（STUN）和 UDP 7882（SFU）。
compose.yaml 直接拉取 ghcr.io/mikuscat/piik-together:latest 镜像，仅把网页端绑定在 127.0.0.1:8787（给宿主机 Nginx 反代）；若使用 Coolify 请改用 compose.coolify.yaml，由 Coolify 代理转发到容器 8787 端口。
若私有仓库的 GHCR 包未设为公开，需在 GitHub Packages 设为 Public 或先用带 read:packages 的 token 登录 ghcr.io；国内服务器若拉取 ghcr.io 较慢，可改用镜像加速地址。
若 Nginx 本身也在 Docker 容器内（如 1Panel OpenResty / NPM），请通过容器网络或宿主机网关连接 8787。
务必保留 Permissions-Policy "camera=(self), microphone=(self), geolocation=()"，否则浏览器会拦截采集卡。
房间保存在 Docker volume；升级不要执行 docker compose down -v。
默认优先直连，失败后走服务器；若希望始终中转，把 relayOnly 改为 true 后重新生成服务器配置。

采集卡与画质
XSS → HDMI → 采集卡 → USB → 她的电脑。HDMI 环出可以继续接显示器。
MS2131 / 绿联「4K 环出」不等于 4K 采集；实际帧率和分辨率取决于硬件及 USB 连接。
Settings.json 可选 720p30、1080p30、1080p60、2160p30。2160p30 为 4K30 / 40 Mbps / 优先分辨率，实际效果取决于采集、编码和网络。
日常无需重新打包：开播网页「分享设置 → 画面 → 画面细调」可直接调整分辨率、帧率、码率和取舍；拥有者也可在专用观看链接中调整。
参数会保存在开播电脑，重启后沿用最后一次应用的选择。包内画质用于首次启动；已有选择可点「4K 超清」恢复到 4K30。
浏览器首次设备授权不可省略；受 HDCP 保护的视频不能正常采集。
Windows 10/11 64 位，使用当前版本 Edge 或 Chrome。

后续打包
修改 Settings.json 后重新运行打包脚本即可；不需要 Node、Go、OBS 或编译工具。
owner-room.local.json 保存固定房间；重复打包沿用原观看链接。
服务器清空房间数据或要换房间时，用 PowerShell 运行 .\Make-FriendPackage.ps1 -NewRoom，重新发包并使用新的 Watch.txt。
如果她在直播间主动换房间或撤销邀请，旧的观看链接会失效；日常只用开播/停止即可。
配置及打包工具、owner-room.local.json、Server/.env 和 Watch.txt 由你保管，只发 Piik-Friend ZIP。
收件包包含站点与房间访问凭据，不包含服务器 SSH、Docker 或管理账号。

隐私
默认不录制，只有拿到完整邀请的人能观看。传输加密；走服务器中转时，服务器处理媒体。
此版本没有内置录制、上传游戏存档或自动打开麦克风。
