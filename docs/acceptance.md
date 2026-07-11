# Orbix 重构验收矩阵

> 验收基线：`rebuild/orbix-next` 分支。Orbix 是在全新目录中重构的独立工程；旧的本机 Orbix 实现未被读取或复用。项目保留了所采用 AGPL 上游的许可证、NOTICE 与来源审计记录，详见 `LICENSE`、`NOTICE` 和 `docs/upstream-references.md`。

## 1. 产品需求验收

| 原始需求 | 状态 | 实现证据 | 验证证据 |
| --- | --- | --- | --- |
| 手机端和 Web 端远程控制 | 通过 | `web/` 响应式 PWA；Hub 同时提供 Web、REST、Socket/SSE；Runner 可连接自托管 Hub | 手机与桌面视口均完成 Playwright 视觉巡检；生产 manifest 为 `standalone`；局域网部署返回 HTTP 200 |
| 一个界面控制 Codex、Claude Code、Cursor CLI | 通过 | `cli/src/codex/`、`cli/src/claude/`、`cli/src/cursor/`；`web/src/components/NewSession/AgentSelector.tsx` | Codex 和 Cursor 完成真实端到端消息回传；Claude 会话创建、队列、SDK 流与错误回传链路完成实测 |
| 自定义连接用户电脑或服务器 | 通过 | Hub/Runner 分离架构、自定义 Hub URL/token、Runner workspace roots；安装说明见 `docs/guide/installation.md` | 当前 Hub 与 Runner 以两个独立 systemd 服务运行，Runner 注册为在线机器 |
| 实时同步正在进行的任务 | 通过 | `hub/src/sync/`、Socket handlers、Web 会话查询与状态组件 | 实测 reasoning、assistant message、工具事件和会话状态实时抵达 Web API/UI |
| 像本地 CLI 一样继续、停止和控制任务 | 通过 | 会话恢复/接管、消息队列、模型与权限模式、kill handlers、`web/src/components/SessionActionMenu.tsx` | Provider/transport 自动化测试全通过；Cursor 整棵进程树停止实测约 2.5 秒且无残留 |
| CLI 工具调用、diff、reasoning、命令和终端 | 通过 | Provider event converters、ToolCard、SessionFiles、TerminalManager、TerminalView | CLI provider suite、Web 工具卡/终端测试及真实 Codex/Cursor 会话验证通过 |
| 审批和需要用户选择的方案 | 通过 | permission adapters/handlers；`PermissionFooter.tsx`、`AskUserQuestionFooter.tsx` | Codex、Claude、Cursor 权限与 AskQuestion 自动化测试通过；当前本机 Codex 全局 YOLO 配置会自动批准，因此未改动用户全局设置来强制制造审批 |
| 上传图片和文件 | 通过 | `cli/src/modules/common/handlers/uploads.ts`、`web/src/lib/fileAttachments.ts`、消息附件组件、PWA Share Target | 真实上传、内容一致性检查及删除验证通过；manifest 提供 `/share` Share Target |
| 文件树和文件查看 | 通过 | `web/src/components/SessionFiles/`、files handler、文件搜索 hooks | Web 自动化测试通过 |
| 工作时显示通知栏状态 | 通过 | `hub/src/notifications/notificationHub.ts`、`hub/src/push/`、`web/src/sw.ts` | 会话开始发送同 tag 的持续、静默状态通知；公网 HTTPS 实测 secure context、Service Worker、PushManager、Notification API 均可用 |
| 完成、失败、审批和选择时弹出通知 | 通过 | 完成通知使用相同 tag 替换工作通知；审批、Ready、失败事件独立通知 | NotificationHub、Push channel、Service Worker 测试通过 |
| 设备通知自检 | 通过 | `/api/push/test`、Settings 的“发送测试”、投递报告与 10 秒限流 | 路由成功/无订阅/限流测试通过；无设备订阅时真实 HTTPS API 正确返回 409 而不是虚报成功 |
| 黑白灰、圆角、美观的图形界面 | 通过 | Orbix 设计 token、全新单色图标、登录页、桌面空状态、会话页和设置页 | 手机 light/dark、桌面 light、登录/sessions/settings 视觉巡检无页面错误；设计基线见 `design-system/orbix-next/MASTER.md` |
| 深色、浅色和跟随系统 | 通过 | `web/src/hooks/useTheme.ts`；Settings 的 appearance 配置（另含 OLED） | theme 与 theme colors 测试通过，手机 light/dark 实际截图通过 |
| 移动端可访问性 | 通过 | 44px 控件、safe-area、允许浏览器缩放、reduced-motion CSS、统一 SVG 图标标签 | 390×844 真实会话页扫描：横向溢出 0、可见小于 44px 的按钮 0、page errors 0 |
| 对话页和独立设置页 | 通过 | 会话路由与独立 `/settings` 页面 | 手机和桌面设置页均完成视觉巡检 |
| 安装到手机/PWA | 通过 | PWA icons、manifest、Service Worker、Apple icon、mask icon | GitHub Actions 完整 production PWA build 成功，构建产物已部署 |
| 中英文界面 | 通过 | Web i18n 文案与语言设置 | Web 测试和实际页面巡检通过 |
| 可自托管且限制服务器资源 | 通过 | systemd 部署、`scripts/limited-run.sh`、`scripts/limited-build.sh` | 2C2G 机器上 Hub/Runner 均 active；Hub `MemoryMax=320M`，Runner `MemoryMax=750M`，CPU quota 分别为 60%/140% |

## 2. Provider 验收

### Codex

- 使用 Codex app-server 原生协议，而不是模拟终端输出。
- 支持会话创建/恢复、模型与 reasoning、审批模式、slash commands、MCP bridge、diff、terminal events 和停止。
- 真实 E2E：通过 Orbix API 创建会话并发送消息，Codex 返回精确标记 `ORBIX_CODEX_E2E_OK`。

### Cursor Agent

- 使用 ACP，并保留 legacy adapter 的兼容和安全边界。
- 支持模型探测/缓存、模式切换、reasoning、tool calls、AskQuestion、消息排队和进程树停止。
- 真实 E2E：会话实时返回 reasoning 与精确标记 `ORBIX_CURSOR_E2E_OK`。
- 修复 Linux zombie 子进程导致的停止等待；真实停止耗时约 2533ms。

### Claude Code

- 使用 Claude Code SDK/stream 集成，包含会话恢复、消息队列、effort/model、permission handler、hooks 和事件转换。
- Orbix 链路验收通过：会话创建、消息排队、SDK 启动、流及外部错误均能同步到客户端。
- 本机 Claude 账户当前返回过 `429 rate limit`，随后显示 `Not logged in · Please run /login`。这是本机 Claude 账户认证/配额状态；不能据此声称模型回答成功。用户完成 `claude /login` 后即可做最终模型响应验收。

## 3. 自动化质量门禁

GitHub Actions 工作流：`.github/workflows/ci.yml`。

每次推送到重构分支依次执行：

1. 锁定 Bun 1.3.14 并全量安装依赖；
2. 所有 packages TypeScript typecheck；
3. Shared tests（已记录 105 passed）；
4. Hub tests（最新基线 454 passed、3 skipped）；
5. 完整 CLI provider/transport Vitest suite；
6. Web Vitest suite（已记录 134 files、1131 tests passed）；
7. 4GB V8 heap 的完整 production PWA build；
8. 上传 `orbix-web` 构建 artifact。

验收时最近的完整成功 run：`29158845613`（commit `e3cbfdd`）。工作流还会验证 marketing website typecheck、公开发行链接审计以及 website/VitePress production build。本机资源只有约 2C2G，完整 Rollup/Vite production build 明确放在 GitHub Actions 执行，避免突破服务器资源上限。

## 4. 真实运行验收

隔离状态目录：`ORBIX_HOME=/root/.orbix-next-state`。

| 服务 | 监听/工作目录 | 资源边界 |
| --- | --- | --- |
| `orbix-next-hub.service` | 仅回环 `127.0.0.1:3406`，由 Nginx HTTPS 反代 | MemoryHigh 256M、MemoryMax 320M、CPUQuota 60% |
| `orbix-next-runner.service` | workspace `/root/orbix-next` | MemoryHigh 650M、MemoryMax 750M、CPUQuota 140% |

当前可信 HTTPS 入口：`https://orbix.47.251.191.185.sslip.io`。HTTP 自动 301 到 HTTPS；Let's Encrypt 证书自动续期，Nginx 支持 SSE、WebSocket 和 68 MiB 上传。旧 Orbix 的 `/orbix`、`/tricli`、`/api` 反向代理已移除。生产 Web 包来自成功的 GitHub Actions artifact，而不是在受限机器上强行完成大内存构建。

## 5. 安全与运维边界

- 访问凭据只保存在隔离的 Orbix home/settings 中，不进入 Git。
- 服务开启 `NoNewPrivileges=true`，并配置 memory、swap、CPU 和 tasks 上限。
- Hub 支持 token authentication；公网使用应配合 HTTPS、自有隧道或 WireGuard，见安装文档。
- 当前部署只通过 Nginx 暴露 443，Hub 自身不再监听公网接口；HSTS、nosniff 和严格 Referrer Policy 已启用。
- `/root/bin/safe-run` 提供主机级内存/CPU/tasks/timeout 限制和全局互斥锁；本地 production build 默认拒绝并转交 GitHub Actions。
- Service Worker 只缓存应用壳和公开静态资源；旧版本的 session/machine 私有缓存会在 activate 时主动删除，防止同设备切换 Hub/账户后读取前一身份的数据。
- 参考项目源码位于忽略目录，仅用于架构与交互研究，不随 Orbix 仓库发布。
- 不修改用户现有 Codex/Claude/Cursor 全局配置来制造测试条件。

## 6. 发布判定

代码、生产构建、Codex/Cursor 真实会话、上传、实时同步、通知、响应式 UI 和受限部署均达到可用标准。唯一需要用户账户侧动作的验收项是：在运行 Runner 的机器上执行 Claude Code 登录，以解除当前 Claude 未登录/限流状态；Orbix 的 Claude transport 本身已验证可用。
