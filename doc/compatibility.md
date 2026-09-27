# 兼容性

面向维护者与发版：**支持哪些 DSH RC、依赖哪些官方契约、怎么验证**。设计动机（为什么是「两个适配器 +
能力探测」）见 [architecture.md](architecture.md)；安装与使用见 [README](../README.zh.md)（英文版 [README.md](../README.md)）。

> 范围约定：**只测 RC 版本，不测 alpha**（alpha 只作历史事实引用，不进入矩阵）。
> 目标 profile：Web GUI（`dsh web` / `--profile web`）。

---

## 1. 结论先行（现状）

| DSH RC | `turnTail` 契约 | 集成方式（适配器） | 状态 |
|---|---|---|---|
| 0.1.0-rc.2 … 0.1.2-rc.1 | —（无 `present` / `workspaceFiles`） | 不适用 | **不支持**（缺服务/事件） |
| 0.1.5-rc.1 / rc.2 / rc.3 | chain | `chain015`：`priority: -1` 认领整行，自绘卡片 | **支持**（rc.3 实测 **11/11**） |
| 0.1.7-rc.1 / rc.2 | list | `fileActions017`：官方卡片原样，注入 `deliverables.file.actions` 下载按钮 | **支持**（rc.2 实测 **12/12**） |

- 两条线各有专属适配器，且**各自在真机 registry + 生产渲染器上被验证**（第 9 节 V1–V17）。
- 下界是 **0.1.5-rc.1**（见第 4 节 RC-03）。
- 插件**不修改任何官方文件**；未认领的回合官方渲染原样。

## 2. 支持矩阵与基线

**RC 全量（来自 npm registry，`@deepseek-ai/dsh`）**

| 通道 | 版本 | 说明 |
|---|---|---|
| latest | 0.1.5-rc.3 | stable 通道，必须测 |
| next | 0.1.7-rc.2 | 下一版通道，必须测 |
| — | 0.1.5-rc.1 / 0.1.5-rc.2 | 功能基线（rc.2 是早期已验版本） |
| — | 0.1.7-rc.1 | 0.1.7 线入口，用于定位断点 |
| — | 0.1.0-rc.2 / rc.3 / rc.6 / rc.7 / rc.8、0.1.1-rc.1 / rc.2、0.1.2-rc.1 | 下界负例，只测「优雅失败 / 不支持」 |

**关键依赖首发版本（决定下界）**

| 包 | 首发版本 | 首个含它的 RC |
|---|---|---|
| `@deepseek-ai/dsh-api-workspace-files` | 0.1.5-alpha.1 | 0.1.5-rc.1 |
| `@deepseek-ai/dsh-tool-present` | 0.1.5-alpha.2 | 0.1.5-rc.1 |

**判定矩阵（执行前冻结的「标准答案」，现已带回填的实测）**

| RC 版本 | 安装/加载 | Host 路由 | Client 装载 | 渲染 | 下载 E2E | 总判定 |
|---|---|---|---|---|---|---|
| 0.1.0-rc.* / 0.1.1-rc.* / 0.1.2-rc.1 | ✓（不崩） | ✗（无 presented 源） | ✓（不认领） | 官方卡片原样 | N/A | **不支持**（预期失败） |
| 0.1.5-rc.1 | ✓ | ✓ | ✓ | ✓ | 未实测 | **应通过**（契约同 rc.3） |
| 0.1.5-rc.2 | ✓ | ✓ | ✓ | ✓ | 基线 | **应通过**（已验基线） |
| 0.1.5-rc.3 | ✓ | ✓ | ✓ | ✓ | ✓ | **实测通过 11/11**（第 9.2 节） |
| 0.1.7-rc.1 | ✓ | ✓ | ✓（同 rc.2 契约） | ✓（修复后） | 未实测 | **应通过**（契约同 rc.2） |
| 0.1.7-rc.2 | ✓ | ✓ | ✓（实测） | ✓（修复后实测） | ✓（渲染级） | **实测通过 12/12**（第 9.1 节） |

## 3. 契约面清单（插件依赖什么）

| # | 契约 | 出处包 | 插件用法 | 0.1.5-rc.* → 0.1.7-rc.* 状态 |
|---|---|---|---|---|
| C1 | `ctx.connection.fetch.register({path, methods, requestBody, fetch})` | `@deepseek-ai/dsh-client-connection` | `lib/index.js` 注册 `/api/download.button` | **稳定** |
| C2 | `ctx.sessionQuery.readEvent({sessionId,seq,before,after}, signal) → {target, session.cwd}` | `@deepseek-ai/dsh-session-query` | 取 durable 事件 | **稳定** |
| C3 | `ctx.workspaceFiles.stat({sessionId, workspaceRoot}, path, signal) → {absolutePath, version, bytes?}` | `@deepseek-ai/dsh-api-workspace-files` | 解析声明路径 | **稳定** |
| C4 | `ctx.fs.resolve / stat(type,size) / readByteRange(target,{offset,length},signal)` | `@deepseek-ai/dsh-fs` | 复核 + 分块读取 | **稳定** |
| C5 | `deliverables/presented` 事件 `{turn,callId,files:[{path,description?}]}` | `@deepseek-ai/dsh-tool-present` | 数据源 + 索引 | **稳定**（0.1.5 的投影不来自该事件，见下） |
| C6 | `conversation.chat.turnTail` slot：`kind`、`select`/`priority`(chain) 或 `id`/`order`(list)、`TurnTailOwnerProps` | `@deepseek-ai/dsh-client-ui-chat` + ui-slots | 遮蔽/认领回合 | **chain → list（RC-01 断点）** |
| C7 | Turn 数据投影 `turn.data.get('deliverables')` = `{produced, presented?}` | `@deepseek-ai/dsh-client-ui-conversation` + ui-deliverables | `select` 判据、卡片数据 | **稳定** |
| C8 | primitives 导出：`Menu`、`FileTypeIcon`、`LinkIcon`、`classifyLinkPath`、`fileExtension`、5 个图标 | `@deepseek-ai/dsh-client-ui-primitives` | 卡片渲染 | 基础符号稳定；**5 图标改名（RC-02 断点）** |
| C9 | 清单契约：`dsh.bundle.patch` / `dsh.client.platform` / `exports['./client']` / bundle id | DSH loader + client-modules | 装载入口 | **稳定** |
| C10 | `dsh plugin --profile <p> add` 与 `dsh --profile <p> --dump-config` | `@deepseek-ai/dsh` CLI / app-boot | 安装与组合 | **稳定** |

**按线核对过的事实**

| 事实 | 0.1.5-rc.* | 0.1.7-rc.* |
|---|---|---|
| Turn 数据投影 `deliverables` 从哪来 | 官方客户端从 `present` **工具调用参数**折叠（`packages/client/ui-deliverables/src/client/turn-deliverables.ts`） | durable 事件 `deliverables/presented` 投影（`packages/deliverables/**`，0.1.5 无此包） |
| `TurnTailOwnerProps` | `{ turn, seq, openFile }`（**没有** `sessionId`；`sessionId` 是框架给 session 作用域 slot 的标准席位） | owner 带 `actionUrl`（坐标在 query 里） |
| 子 slot `deliverables.file.actions` | 不存在 | 存在（list） |
| `/api/present.open` 的 Host 半区 | `packages/client/ui-deliverables/src/present-open.ts` | 同上 |

## 4. 两个断点的历史与现状

### RC-01（阻断）`conversation.chat.turnTail` 从 chain 变 list

- 0.1.5-rc.1 / rc.2 / rc.3：声明为 `kind: 'chain'`。
- 0.1.7-rc.1 / rc.2：声明为 `kind: 'list'`。
- 当时插件注册的是 chain 形态 `{ name, priority: -1, select, locale }`，**没有 `id`**；list 分支的
  `SlotCore.register` 会抛 `list slot "conversation.chat.turnTail" requires options.id` → 0.1.7 上客户端
  注册失败，卡片不出现（按注册顺序还可能在 `slots.inject` 的 reconcile 里抛出）。
- 现状：**已由「两个适配器 + 能力探测」解决**（[architecture.md](architecture.md) 第 3 节），
  0.1.7-rc.2 上 `turnTail` 无条目、只落 `deliverables.file.actions`（V6）。

### RC-02（阻断）ui-primitives 图标改名

| 0.1.5-rc.* | 0.1.7-rc.2 实测（只有权重后缀名） |
|---|---|
| `IconChevronDownOutline14` | `IconChevronDownOutlineRegular`（另有 `…Medium`） |
| `IconChevronUpOutline14` | `IconChevronUpOutlineRegular`（另有 `…Medium`） |
| `IconRightUpOutline16` | `IconRightUpOutlineRegular`（另有 `…Medium`） |
| `IconFolderOpenOutline16` | `IconFolderOpenOutlineRegular`（另有 `…Medium`） |
| `IconDownloadOutline16` | `IconDownloadOutlineRegular`（另有 `…Medium`） |

- 旧名在 0.1.7-rc.* 已被移除；**无后缀名从未存在**（`grep -c 'export declare const IconDownloadOutline:'` = 0）。
- 其余 primitives（`Menu` / `FileTypeIcon` / `LinkIcon` / `classifyLinkPath` / `fileExtension`）两代都在。
- 现状：图标面收敛到 `ICON_GENERATIONS` + `resolveIcons()`（[architecture.md](architecture.md) 第 4 节）。

```js
// 当时的历史形态（V7/V8 转绿时的 5 行）；现已由 ICON_GENERATIONS 表取代：
const IconDownload = primitives.IconDownloadOutline16 ?? primitives.IconDownloadOutlineRegular ?? primitives.IconDownloadOutline
```

> **这次事故的教训**：「0.1.7 升级后下载按钮消失」的直接原因不是 RC-01，而是当时的回退链写成
> `…16 ?? …Outline`——漏了真实存在的权重后缀名，于是五个图标全 `undefined`，`ActionDownload` 以
> `Element type is invalid` 炸掉，官方卡片那个 slot 只剩错误边界。**L0 桩当时把 0.1.7 写成裸名，
> 于是真机已断、85 条断言仍全绿**：桩里的名字必须是真包的导出名，且选择器/图标解析必须被直接测
> （现由 `test/select-adapter.test.mjs` 承担）。

### RC-03（下界）0.1.5-rc.1 之前不可能工作

插件 `inject` 依赖 `workspaceFiles`，下载数据源依赖 `present`；两者首发于 0.1.5-alpha。更早的 RC 上
要么缺服务（Cordis 拒绝加载，本插件不影响其它插件），要么永远没有 `present` 事件（无卡片）。
**首个可工作 RC = 0.1.5-rc.1。**

## 5. 测试分层

### L0 — 静态与单元（与版本无关，先在主分支跑绿）

主流程测试 + 每个适配器一个测试类，共 **85 条断言**：

| 文件 | 覆盖 |
|---|---|
| `test/package.test.mjs` | 清单、patch、bundle 只 require 基线模块 |
| `test/download.test.mjs` | 坐标校验、头部安全、失败分类、分块流 |
| `test/host.test.mjs` | 路由端到端 +「不接受 path」不变量 |
| `test/client.test.mjs` | **主流程，走最新 RC 适配器（0.1.7 的 `fileActions017`）**：envelope、apply 选择、`select` 规则、坐标、按钮与下载手势 |
| `test/adapter-file-actions-017.test.mjs` | 0.1.7-rc.* 适配器专属：子 slot 注册（`id`/`locale`、无 `select`）、坐标来源、按钮与失败路径 |
| `test/adapter-chain-015.test.mjs` | 0.1.5-rc.* 适配器专属：chain 认领（`priority: -1` + `select`）、整行卡片、chips、折叠 |
| `test/select-adapter.test.mjs` | 选择器与图标解析：声明树探测（root/子/深层/缺失）、适配器优先级、三代图标名与「后缀不统一」守卫 |
| `test/client-harness.mjs` | 共享桩（非测试文件）：bundle 装载、两代 primitives、声明树构造、树遍历与文案 |

> L0 用的是**自造桩**：桩件级通过不代表跨版本装载/渲染通过，那以 L1/L2 为准。

### L1 — 契约形状探针（每版本一套）

对目标版本断言第 3 节的契约形状。两种实现，都在用：

- **L1a 轻量探针（无需安装）**：从 registry/unpkg 读目标版本发布物，断言符号是否存在。适合每次提交的
  快速回归（当年正是此法发现 RC-01/RC-02）。落地：`.script/compat/probe-017.mjs`（C6–C8）、
  `.script/compat/probe-icons-matrix.mjs`（全部 RC tag 的图标矩阵，10 个 tag）。
- **L1b 安装探针（保真）**：`npm pack` / `npm i` 目标版本到临时目录，读 `.d.ts` / 运行时导出，断言同样事实。

### L2 — Client 半区装载（每版本，重点）

不要只用桩，而是加载**目标版本真实的 `@deepseek-ai/dsh-client-ui-slots` SlotCore**：

- L2-01：先按目标版本的 slot 声明注册该 slot（0.1.5-rc.* 用 chain；0.1.7-rc.* 用 list），再调用插件
  `apply`；断言不抛。
- L2-02：断言插件注册项形态与 slot kind 匹配（chain 必须有 `select`；list 必须有 `id`）。
- L2-03：用目标版本真实 `@deepseek-ai/dsh-client-ui-primitives` 的导出表实例化 bundle，断言图标符号存在。

落地（在兼容性工作树 `.script/verify/`）：`plugin-client.client.spec.tsx`（0.1.7 线，
真 `SlotTestRuntime` + 真 registry/renderer/primitives）与 `plugin-client-chain015.client.spec.tsx`
（0.1.5 线，chain 经 `renderSlotChain` 渲染）。两者都另外断言 `declaredKind` / `selectAdapter` 在**真实声明树**
上选对了适配器，并用**插件自己的 `resolveIcons`**（而不是在 spec 里重抄一份链）核对这一代的图标名。

### L3 — Host 路由端到端（每版本）

用 C1–C5 的**目标版本真实声明**驱动真实 Cordis context（或按目标版本签名更新的桩），覆盖：

- 200 流式下载 + `Content-Disposition` / `Content-Length` / `nosniff`。
- HEAD 同头无体。
- 400（坐标非法）、404（非 presented / 越界）、422（非常规文件 / 越界）、500（未知错误）。
- 「`path=` 参数被忽略且不解析」的安全不变量。

落地：`.script/verify/plugin-route.host.spec.ts`（5 项，两代**同一份 spec 都通过**）。

### L4 — 安装与加载器（每版本）

- `dsh plugin --profile web-<v> add <本包>` 成功；依赖为 `link:`。
- `dsh --profile web-<v> --dump-config` 组合成功，末尾出现 `# == dsh-download-button` 条目。
- 与同类插件共存（如 `dshmarket`）能组合。

### L5 — 浏览器端到端（每版本，人工或 Playwright）

1. 启动该版本 Web GUI（独立 `DSH_HOME`）。
2. 让 Agent `present` 一个已知内容的文件（含中文名、大文件两个用例）。
3. 断言：卡片出现「下载」；点击后 `GET /api/download.button?...` 返回 200；落盘字节 == 源文件字节；
   文件名正确（含 `filename*`）。
4. 没有 `present` 的回合：官方卡片/改动 chips 原样，无重复。
5. 未装插件时官方卡片原样（对照）。

## 6. 用例清单

「自动化」列：✅ = 已由 L0/L1/L2/L3 覆盖；⏳ = 仍为人工/未自动化。

| ID | 层 | 前置 | 步骤/断言 | 适用版本 | 期望 | 自动化 |
|---|---|---|---|---|---|---|
| T-01 | L0 | — | `npm test` | 全部 | **85 断言全绿** | ✅ |
| T-10 | L1 | registry | `turnTail` 的 `kind` 与目标版本一致 | 全部 | 记录实际值 | ✅ |
| T-11 | L1 | registry | 5 个图标符号存在性 | 全部 | 0.1.5-rc.* 旧名；0.1.7-rc.* 新名 | ✅ |
| T-12 | L1 | registry | C1–C5 形状断言 | 全部 | 通过 | ✅ |
| T-20 | L2 | 真 SlotCore | 按目标 kind 声明后 `apply` 不抛 | 全部 | 通过（0.1.5 chain / 0.1.7 list 各一） | ✅ |
| T-21 | L2 | 真 primitives | bundle 实例化 + 图标符号 + 渲染 | 全部 | 通过 | ✅ |
| T-30 | L3 | 桩/真实 ctx | 下载 200/HEAD/400/404/422/500 | 全部 | 通过 | ✅ |
| T-31 | L3 | — | `path=` 被忽略 | 全部 | 400 且不解析路径 | ✅ |
| T-40 | L4 | 隔离 profile | `plugin add` + `--dump-config` | ≥0.1.5-rc.1 | 通过 | ⏳ |
| T-41 | L4 | 隔离 profile | 预下界 RC 安装不崩 | <0.1.5-rc.1 | 加载/组合不致命 | ⏳ |
| T-50 | L5 | 浏览器 | present→点击下载→字节比对 | ≥0.1.5-rc.1 | 通过 | ⏳ |
| T-51 | L5 | 浏览器 | 无 present 回合官方原样 | 全部 | 通过 | ⏳ |
| T-52 | L5 | 浏览器 | 中文名 + 大文件（≥100MB） | 参照版本 | 通过 | ⏳ |

## 7. 执行方式（版本隔离 + 一键矩阵）

**原则**：每个版本独立 `DSH_HOME`、独立 profile，互不污染。

```sh
export DSH_HOME=/tmp/dsh-compat/0.1.7-rc.2/.dsh
export DSH_BIN="/path/to/that/version/node_modules/@deepseek-ai/dsh/lib/bin.js"
node "$DSH_BIN" plugin --profile web add /home/liumenghan/dsh-download-button
node "$DSH_BIN" --profile web --dump-config | tail -5
```

- **轻量矩阵（无安装，每次提交）**：对第 2 节每个版本拉 registry/unpkg 元数据，跑 T-10/T-11/T-12，
  产出矩阵文本。
- **重量矩阵（发版前/每日）**：每版本装依赖 + T-20/T-21/T-30/T-40，必要时 L5。
- **临时脚本位置**：一过性探针/矩阵 runner 放项目根 `.script/compat/`（按
  `temporary-scripts-in-dot-script` 约定）；要长期保留的契约断言作为正式测试放 `test/`（当前
  L0 已在 `test/`，L2/L3 仍在工作树 `.script/verify/`）。

## 8. 判定标准（准入/准出）

- **必须全绿**：矩阵中标记「应通过」的每个 RC，T-01、T-10、T-11、T-12、T-20、T-21、T-30、T-31、T-40、
  T-50 全部通过。
- **不得把红刷绿**：桩里的名字/形状必须取自真包；预下界 RC 与不支持的版本必须如实验出「不通过」，不许用
  桩掩盖（RC-02 的教训）。
- **无回归**：任一 RC 不得出现官方交付卡片消失、重复，或 GUI 启动失败。
- **发版门**：README 的兼容表只能声明矩阵中全绿的 RC。

## 9. 实测验证记录（无浏览器）

被测对象：`lib/client.js` / `lib/index.js` 当前实现。被测 DSH：兼容性专用工作树
`/home/liumenghan/deepseek-harness-test`（`deepseek-harness` 的 git worktree），逐 tag 切换后重建再跑。

### 9.1 0.1.7-rc.2（tag `dsh-v0.1.7-rc.2` = `477b4f4205`）

| # | 验证项 | 手段 | 结果 |
|---|---|---|---|
| V1 | 安装与组合 | `DSH_HOME=… pnpm dsh plugin --profile web add <插件>` + `--dump-config` | ✅ 出现 `# == dsh-download-button` / `- id: download-button` |
| V2 | 真机 GUI 装载 | `pnpm dsh web --no-open --port 3099 --host 127.0.0.1`（隔离 home） | ✅ 启动；`__DSH_BOOT__.entries` 含 `dsh-download-button`（`rev=959b49065e7c`） |
| V3 | 客户端模块下发 | `GET /plugins/??dsh-download-button/client.js&rev=…`（带登录 cookie） | ✅ 200，34 186 B，含 `deliverables.file.actions` |
| V4 | Host 路由（真机） | `HEAD/GET /api/download.button…` | ✅ 无坐标 400；`sessionId=x&seq=1&index=0` 404（未知会话）；`/api/nonexistent` 404 对照 |
| V5 | Host 路由（真服务规格） | `.script/verify/plugin-route.host.spec.ts`：真 `LocalFileSystem`+`WorkspaceFiles`+`HostConnectionService` | ✅ 5/5：GET/HEAD 头部与字节、`path=` 被忽略、400/404/422 拒绝 |
| V6 | 客户端注册（真 registry） | `.script/verify/plugin-client.client.spec.tsx`：`SlotTestRuntime` + 真 `SlotRegistry`/renderer/primitives | ✅ 只落 `deliverables.file.actions`（`options.id='dsh-download-button'`、`locale='downloadButton'`），`turnTail` 无条目；dispose 后移除 |
| V7 | 渲染 | 同上：`renderSlot('deliverables.file.actions', {actionUrl, available, pending, onAction})` | 修复前 ❌ `data-slot-error`：`React.createElement: type is invalid … 'ActionDownload'`；**修复后 ✅** 按钮正常渲染、点击走 HEAD + anchor、成功/失败文案就位 |
| V8 | 图标面 | 真 primitives 导出表 + `lib/client.js` 里读出的实际回退链 | 修复前 ❌ 5 个图标全 `undefined`；**修复后 ✅** 5 条链都解析到 `…OutlineRegular` |
| V9 | 适配器选择（真声明树） | 同上，`declaredKind(runtime.ctx, …)` + `selectAdapter(runtime.ctx)` | ✅ `deliverables.file.actions → 'list'`、`turnTail → 'list'`，选中 `fileActions017` |
| V10 | 图标面（走插件自己的解析器） | `plugin.module.resolveIcons(realPrimitives)` | ✅ 5/5 解析到真组件，且 `IconDownload === IconDownloadOutlineRegular` |

**0.1.7 结论**：修复前渲染 ❌（错误边界）；修复后 `plugin-client.client.spec.tsx` 7/7 +
`plugin-route.host.spec.ts` 5/5 = **12/12**，L0 85/85，静态探针 C6–C8 全过，图标矩阵 10 个 tag 全过。

### 9.2 0.1.5-rc.3（tag `dsh-v0.1.5-rc.3` = `a4c74a91e0`）

同一工作树切 tag、重建后重跑：

| # | 验证项 | 方式 | 结果 |
|---|---|---|---|
| V11 | 适配器选择（真声明树） | `plugin-client-chain015.client.spec.tsx` | ✅ `declaredKind(turnTail)='chain'`、`declaredKind('deliverables.file.actions')=undefined`，`selectAdapter` 选中 `chain015` |
| V12 | chain 认领与卸载 | 同上（真 registry） | ✅ 1 条 entry：`priority=-1`、`locale='downloadButton'`、`select` 为函数；dispose 后清零 |
| V13 | 渲染（生产渲染器 + `renderSlotChain`） | 同上 | ✅ 整行渲染出 打开/更多/下载，无 `data-slot-error`；**下载 URL 带上框架解析的 `sessionId`**（`/api/download.button?sessionId=session-1&seq=7&index=0`，HEAD），无 `path=` |
| V14 | 官方打开链路 | 同上 | ✅ 主按钮把路径交给官方 `openFile(path)`；菜单「用默认应用打开」POST 官方 `/api/present.open`，同一坐标三元组、无 `path=` |
| V15 | 无交付即让位 | 同上（换一个只改文件的回合） | ✅ 下载按钮消失、无 error face，官方 chain 结果为空 |
| V16 | 图标世代 | `resolveIcons(真 primitives)` | ✅ `IconDownload === IconDownloadOutline16`、`IconChevronDown === IconChevronDownOutline14` |
| V17 | Host 路由 | `plugin-route.host.spec.ts`（同一份 spec） | ✅ 5/5，与 0.1.7 完全同一套断言 |

**0.1.5 结论**：chain 6 + host 5 = **11/11**。

### 9.3 临时脚本位置

按 `temporary-scripts-in-dot-script` 约定（`.script/` 已被 `.gitignore`）：

- 工作树侧 `.script/verify/`：`plugin-client.client.spec.tsx`（0.1.7）、`plugin-client-chain015.client.spec.tsx`
  （0.1.5）、`plugin-route.host.spec.ts`（两代共用）、`vitest.verify.config.ts`（**按线自动选 spec**：以
  `packages/deliverables/tool-present` 是否存在判定，并条件性加载只在该线存在的 `test-dom-environment.ts`）。
- 插件侧 `.script/compat/`：`probe-017.mjs`、`probe-icons-matrix.mjs`、`icon-chains.mjs`
  （两个探针共享的图标链读取器——直接读 `lib/client.js` 的 `ICON_GENERATIONS`，避免各抄一份而失真）。

## 10. 换线操作手册

`/home/liumenghan/deepseek-harness-test` 是长期工作树（**不要**直接 `mv`，改名要用
`git -C /home/liumenghan/deepseek-harness worktree move`，否则 `.git` 指针与
`.git/worktrees/*/gitdir` 会失配）。

```bash
cd /home/liumenghan/deepseek-harness-test
git fetch --tags && git checkout dsh-v0.1.5-rc.3      # 换成目标 RC tag
# 跨 tag 切换后可能残留「没有 package.json 的幽灵目录」：
# 它们被 tsdown 的 workspace 目录 glob（vendor/*、packages/*/*）匹配到，readPackageJson
# 会向上找到仓库根的 dsh-root，进而报 `Cannot find entry: ["lib/types/{index,invariant,startup}.js"]`。
for d in vendor/* packages/*/*; do [ -d "$d" ] && [ ! -e "$d/package.json" ] && echo "幽灵目录: $d"; done
# 逐个 rm -rf 上面列出的目录；另外**根目录 lib/ 也要删**（0.1.5 的 desktop-keyboard 测试产物，
# 会被 0.1.7 的 clean 校验拒绝），然后：
pnpm install && pnpm run build
```

> `pnpm run clean` 在 **0.1.7-rc.2 上本身就是坏的**：它自查每个 tsconfig 的 `outDir` 必须以 `/types`
> 结尾，而该版本 track 的 `tsconfig.desktop-keyboard-tests.json` 写的是 `lib/desktop-keyboard-test-types`
> （`scripts/clean.ts:135-143`），于是 clean 直接抛错。这条线上跳过 clean；构建完请核对产物确实是目标线
> （例如 `packages/client/ui-primitives/lib/types/icons/index.d.ts` 里应出现 `IconDownloadOutlineRegular`，
> 而不是 0.1.5 的 `IconDownloadOutline16`）。

换线后 spec 会自动切换，无需改配置。两条线的 bench 接线不同：

| | 0.1.5-rc.* | 0.1.7-rc.* |
|---|---|---|
| runtime 提供的 double | 只有 `sessions`/`workspaces`/`fileUpload`，**要自己** `new TestRemote(ctx)`；还要 provide `settingsScope` 桩（locale 插件注入它） | 自带 `stubConfigForm` 等；spec 可直接 `mount` |
| chain slot 渲染 | 自动 frame 只暴露 `renderSlot`，**chain 必须用自定义 root frame 的 `renderSlotChain`** | `renderSlot` 即够（list） |
| DOM 环境 | 无 `scripts/test-dom-environment.ts`，用 `// @vitest-environment jsdom` | 有该 setup 文件，由配置条件加载 |

跑：

```bash
DSH_HOME=/tmp/dsh-<版本>-verify/.dsh pnpm dsh plugin --profile web add /home/liumenghan/dsh-download-button
DSH_HOME=/tmp/dsh-<版本>-verify/.dsh pnpm dsh --profile web --dump-config | grep -n download-button
./node_modules/.bin/vitest run --config .script/verify/vitest.verify.config.ts
```

## 11. 证据方法（可复现）

- 版本清单：`https://registry.npmjs.org/@deepseek-ai%2Fdsh` 的 `versions` / `dist-tags`。
- 符号/声明核对：`https://unpkg.com/<pkg>@<version>/<path>.d.ts` 与 `/lib/*.js`。
- slot 运行时校验：`@deepseek-ai/dsh-client-ui-slots@<v>/lib/index.js` 的 `register` → list 分支
  `requires options.id`。
- 官方对照注册：取 `@deepseek-ai/dsh-client-ui-deliverables@<v>/lib/client.js`，搜
  `slots.inject("conversation.chat.turnTail"`。
- 本地等价物：`.script/compat/probe-017.mjs`、`.script/compat/probe-icons-matrix.mjs`。

## 附：CI 门禁建议

- **每次 PR**：L0 + 轻量 L1 矩阵（覆盖全部 RC），几分钟内完成。
- **每夜**：完整 RC 重量矩阵（安装探针 + Host E2E）。
- **发版前**：全矩阵 + L5 抽样（latest 与 next 各一），产物为兼容性矩阵报告，README 声明以其为准。
