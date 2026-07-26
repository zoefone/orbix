# ◍ Orbix

**用手机和浏览器远程控制 Codex · Claude Code · Cursor Agent。**

[English →](README.md)

Orbix 在装有 AI CLI 的机器上运行一个小型服务端，并提供 Android 应用和 Web 应用：随时随地新建会话、实时查看 Agent 工作过程、审批其操作、上传文件/截图 —— 并且可以**导入你已有的 CLI 历史会话（含完整消息记录）继续对话**。

```
┌──────────────┐         ┌──────────────┐
│ Android 应用 │         │   Web 应用   │
└──────┬───────┘         └──────┬───────┘
       │  WS + HTTPS            │
       ▼                        ▼
┌──────────────────────────────────────┐
│    Orbix 服务端（运行在你的机器上）    │
│    认证 · 会话 · 上传 · 中转          │
└───┬──────────────┬──────────────┬────┘
 codex          claude         cursor
app-server    agent-sdk         acp
```

## 功能

- **一个平台，三个 CLI** —— 统一管理 `codex`、`claude`、`cursor-agent` 会话，全部通过各 CLI 的原生机器协议驱动（绝不做 PTY 抓屏）：
  - **Claude Code** → `@anthropic-ai/claude-agent-sdk`（stream-json 控制协议、`canUseTool` 权限回调、会话恢复）
  - **Codex** → `codex app-server`（stdio 上的 JSON-RPC：thread/turn 管理、审批请求、增量流式输出）
  - **Cursor Agent** → `agent acp`（Agent Client Protocol，带权限询问；自动回退到 `agent -p --output-format stream-json`）
- **同步并恢复已有会话** —— 自动发现 `~/.claude/projects`、`~/.codex/sessions`、`~/.cursor/chats` 中的历史会话，导入时**从原生记录回填完整消息历史**（用户消息、回复、推理、工具调用），并可继续对话。
- **实时时间线** —— 流式文本、工具调用（shell/读/写/编辑/搜索）及其输出与 diff、推理块、计划/待办卡片、上下文用量显示、权限请求。
- **远程审批** —— 在应用、网页、甚至 Android 通知栏中直接 批准 / 总是允许 / 拒绝。
- **能力驱动的控制项** —— 模型列表、思考强度、速度、交互模式、权限模式全部实时从各 CLI 获取；支持斜杠命令（`/plan`、`/compact`、`/summarize` 等），带可搜索的命令面板。
- **Android 通知** —— Agent 工作时的常驻状态通知；完成 / 需审批时高优先级弹窗，锁屏也能直接 批准 / 拒绝。
- **文件与图片上传** —— 在输入框中附加照片/文件，自动上传到服务端并注入提示词（支持的 CLI 会以原生图片输入传递）。
- **深色 / 浅色 / 跟随系统 · 中英文切换** —— 黑白灰单色设计，圆角，无毛玻璃。
- **多种连接方式** ——
  - 同一局域网 → 直连 + 6 位配对码（或扫码）
  - 有公网 IP → IP + 密码
  - 其他情况 → 内置**中转服务**（可自建）或 **cloudflared** 快速隧道。

## 仓库结构

```
packages/
  shared/    协议与领域类型（zod），服务端/Web 共用
  server/    核心服务端：Fastify + WS、Agent 适配器、持久化、上传、隧道客户端
  relay/     可自建的 NAT 穿透中转（部署在任意 VPS）
  web/       React + Vite + Tailwind Web 客户端（由服务端托管）
  app/       Expo / React Native Android 应用
mockups/     HTML 设计稿（及渲染截图），UI 以此为准
```

## 快速开始（服务端）

要求：Node ≥ 20，以及想要控制的 CLI（`codex`、`claude`、`agent`/cursor-agent）已安装并登录。

```bash
git clone https://github.com/zoefone/orbix.git
cd orbix
npm install
npm run build
npm start          # 等价于 node packages/server/dist/index.js
```

首次运行时 Orbix 会打印：

- **服务端密码**（只生成一次，scrypt 哈希后存于 `~/.orbix/config.json`；可用 `ORBIX_PASSWORD` 覆盖）
- 局域网配对用的**配对码 + 二维码**
- 检测到的各 CLI 版本

Web UI：`http://<机器IP>:8760` —— 用密码登录。

常用环境变量：`ORBIX_PORT`、`ORBIX_HOST`、`ORBIX_PASSWORD`、`ORBIX_HOME`、`ORBIX_CLAUDE_PATH`、`ORBIX_CODEX_PATH`、`ORBIX_CURSOR_PATH`。

## 从应用 / Web 连接

| 场景 | 操作 |
|---|---|
| 手机与电脑同一局域网 | 服务端启动时打印配对码/二维码（或运行 `orbix pair`）。应用 → **配对** 标签 → 输入机器 IP + 6 位码。 |
| 服务器有公网 IP | 应用 → **直连** 标签 → `http://IP:8760` + 密码。（如需 HTTPS 请在前面加 nginx/Caddy TLS。） |
| 其他情况（NAT 内网） | 方案 A：`orbix tunnel --cloudflared` → 使用打印出的 `https://*.trycloudflare.com` 地址。方案 B：在 VPS 上运行中转：`node packages/relay/dist/index.js`（设置 `ORBIX_RELAY_KEY`），然后 `orbix tunnel --relay wss://你的VPS:8770 --key <key>` → 使用打印出的 `/t/<slug>` 地址。 |

## Android 应用

预编译 APK：见 [Releases](https://github.com/zoefone/orbix/releases) 页面。

```bash
cd packages/app
npm install
npx expo prebuild -p android   # 生成 android/ 工程
# 调试构建（需要 JDK17 + Android SDK）：
cd android && ./gradlew assembleDebug
# 独立发布构建（JS 已打包，debug 签名）：
./gradlew assembleRelease   # APK 在 app/build/outputs/apk/release/app-release.apk
```

应用通过前台服务保持 WebSocket 连接，并推送：

- Agent 工作时的**常驻状态通知**
- **完成**提醒
- **审批**提醒，带 批准/拒绝 按钮，锁屏可用。

## 会话与恢复原理

- 新会话通过各 CLI 的原生协议启动，并记录其原生会话 id。
- **导入的会话**（从磁盘发现）会从 CLI 自身的记录文件回填时间线，并通过同样的原生机制恢复：Claude `--resume <session-id>`、Codex `thread/resume`、Cursor `session/load`（ACP）或 `--resume <chatId>` 回退。
- 时间线事件以追加方式写入 `~/.orbix/data/timelines/*.jsonl`；流式增量会合并为单条记录。

## 权限模式

| 模式 | Claude | Codex | Cursor |
|---|---|---|---|
| 询问（默认） | `canUseTool` 回调 → 应用内审批 | `requestApproval` → 应用内审批 | ACP `request_permission` → 应用内审批 |
| 自动编辑 | `acceptEdits` | — | `--force` |
| 完全放行 | `bypassPermissions`¹ | `yolo`（danger-full-access） | `run-everything` |

¹ Claude 以 root 身份运行时拒绝 `--dangerously-skip-permissions`；Orbix 会自动降级为 `acceptEdits` 并在时间线中提示。

## 安全说明

- 密码经 scrypt 哈希存储；令牌为 HMAC 签名（180 天有效期），通过 WS `?token=` / HTTP `Authorization: Bearer` 传递。
- 配对码为 6 位数字、一次性、10 分钟有效。
- 中转服务只能看到你的 TLS/明文流量本身 —— 敏感场景请在中转前加 TLS（如 Caddy），或使用 cloudflared（始终 HTTPS）。

## 许可证

AGPL-3.0
