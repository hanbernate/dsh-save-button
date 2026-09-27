# 架构与设计决策

面向维护者：本插件**为什么长这样**。安装与使用见 [README](../README.zh.md)（英文版 [README.md](../README.md)），版本契约与实测记录见
[compatibility.md](compatibility.md)。

---

## 1. 一次下载的完整链路

```
浏览器（lib/client.js）                          Host（lib/index.js + lib/download.js）
──────────────────────────────────────────     ──────────────────────────────────────────────
conversation.chat.turnTail
  0.1.5-rc.* chain  → chain015 适配器
    priority: -1，先于官方 entry 参与选举
    select(owner):
      owner.turn.data.get('deliverables')
        有 presented  → 认领该回合，自己渲染整行卡片
        无 presented  → 返回 null，官方 entry 照旧渲染
  0.1.7-rc.* list   → fileActions017 适配器
      官方卡片原样；另注册子 slot
      deliverables.file.actions（list）
        下载按钮读 owner.actionUrl 里的坐标

点击「下载」 ──────────────────────────────────▶  GET/HEAD /api/download.button
  1. fetch(HEAD, 坐标) 探测可下载性                ?sessionId=…&seq=…&index=…
  2. <a download> 交给浏览器下载管理器             ├─ sessionQuery.readEvent 取 durable 事件
                                                   ├─ deliverables/presented → 声明里的 path
                                                   ├─ workspaceFiles.stat → Session 文件系统
                                                   ├─ fs.stat 必须是普通文件
                                                   └─ fs.readByteRange 分块流式响应
                                                      Content-Disposition: attachment
```

关键点：**浏览器半区从不知道文件在磁盘上的位置**，它只知道「哪个回合的第几个交付」；路径解析、权限与
字节读取全在 Host 半区（见第 5 节安全边界）。

## 2. 两个半区

### Host 半区

| 文件 | 职责 |
|---|---|
| [`lib/index.js`](../lib/index.js) | 注册一条精确的 Fetch 路由 `/api/download.button`（[`lib/index.js:51`](../lib/index.js#L51)）；`inject` 只依赖 Host 服务（`connection` / `sessionQuery` / `workspaceFiles` / `fs`） |
| [`lib/download.js`](../lib/download.js) | 纯函数：坐标校验、durable 事件查询、响应头、失败分类（400/404/422/500）、分块字节流 |

Host 半区不碰 DOM，也不认识 slot；它只提供「坐标 → 字节流」这一个能力，所以**两代客户端适配器共用同一份
Host 实现**（0.1.5 与 0.1.7 的 Host 规格是同一份 spec，见 [compatibility.md](compatibility.md)）。

### 浏览器半区

[`lib/client.js`](../lib/client.js) 是一个手写的 `window.__ModuleLoader__.load({ id, factory })` 包封，与官方
客户端 bundle 同格式。三条约束决定了它的形态：

1. **零构建、零依赖**：整包是一个 ESM Host half + 一个手写浏览器 bundle，装完即用（没有 `postinstall`、
   没有编译步骤）。
2. **只 `require` 客户端基线模块**：`react` 与 `@deepseek-ai/dsh-client-ui-primitives`。**不要**在这里
   import 官方 deliverables 包——那会与官方实现耦合，`test/package.test.mjs` 里有守卫。
3. **适配器必须是同一文件里的对象**：加载器的模块表只接受「table words」，相对 `require` 拿不到自定义
   模块，所以适配器、图标能力表都是文件内定义、在文件内被引用的普通对象，主流程只调用适配器接口。
   （这也是「一个适配器 = 一段自洽的注册 + 渲染逻辑」而不是「几个可插拔文件」的原因。）

## 3. 适配器与能力探测选择器

官方在两个 RC 世代改了**两件彼此独立的事**：`conversation.chat.turnTail` 从 chain 变成 list；`ui-primitives`
的图标名从尺寸后缀换成权重后缀。因此插件把**每种 slot 契约做成一个适配器**，初始化时按运行时**实际声明**
选一个：

```
lib/client.js
├── ICON_GENERATIONS / resolveIcons()   图标面 → 实际组件（能力表，不是适配器）
├── adapters.fileActions017            0.1.7-rc.*：注入官方卡片的 deliverables.file.actions（list）
├── adapters.chain015                   0.1.5-rc.*：priority:-1 认领 turnTail（chain），自己渲染整行
├── declaredKind(ctx, key)              读 ctx.slots.snapshot() 的声明树（递归进 children）
├── selectAdapter(ctx)                  ADAPTERS 里第一个 accepts 的；都不匹配 → 宁静不注册
└── apply(ctx)                          inject 触发 → selectAdapter → adapter.register(ctx)
```

对应代码：[`ICON_GENERATIONS`](../lib/client.js#L49) / [`resolveIcons`](../lib/client.js#L63) /
[`declaredKind`](../lib/client.js#L780) / [`fileActionsAdapter`](../lib/client.js#L797) /
[`chainAdapter`](../lib/client.js#L807) / [`ADAPTERS`](../lib/client.js#L823) /
[`selectAdapter`](../lib/client.js#L830) / [`apply`](../lib/client.js#L845)。

### 3.1 为什么不用版本号选（客户端拿不到版本号）

| 可能的来源 | 实测内容 |
|---|---|
| `window.__DSH_BOOT__` | `WebBootGraph = { rev, entries, batches }`：只有内容 `rev` 与条目表（`packages/client/modules/src/index.ts:435-480`） |
| `ctx.modules.version` | 判别式常量 `'client'`，不是发布版本（`packages/client/modules/src/client/manifest.ts:387`） |
| 宿主进程 | 知道版本，但宿主→客户端只有 `ctx.remote` 这类**异步** RPC，而适配器必须在 `apply()` 里同步选定 |

而且版本号是**间接指标**：图标改名与 slot 契约变更互不绑定，版本号回答不了「这个 primitives 包里到底有
没有某个导出名」。所以选择器读两个同步、**正向**的信号：

- **槽位声明树**：`ctx.slots.snapshot()` 返回 `LiveSlotNode = { name, kind, scope, children }`
  （`packages/client/ui-slots/src/index.ts`）。**0.1.5-rc.1 起每个 RC tag 都有，节点形状一致**；子 slot
  （官方卡片的 action list）嵌在 owner 节点下，所以探测必须递归。
- **primitives 导出面**：`resolveIcons(source)` 按代际顺序取第一个真实存在的名字（见第 4 节）。

早先的实现靠匹配注册失败的异常文案（`list slot … requires options.id`）来判代，已废弃：那是反向信号，
且依赖错误措辞。

### 3.2 探测时机

探测放在 `ctx.slots.inject(adapter.id, install)` 的回调里，而不是 `apply()` 顶层（[`lib/client.js:845`](../lib/client.js#L845)）：

- 该回调**只在对应 slot 被声明时**触发，因此不会早于官方 owner 的声明（`slots.entries(key)` 无法区分
  「已声明但为空」与「未声明」，而 `snapshot()` 可以）。
- `install` 只执行一次（闭包里的 `installed` 标志）；两个契约同时存在时 `fileActions017` 优先，
  **只注册一个适配器**，不会重复渲染。

### 3.3 两条线的行为

**0.1.5-rc.\* —— chain（认领整行）**

`snapshot()` 里 `turnTail.kind === 'chain'`，且没有任何 per-file action list，于是选 `chain015`。chain 类型下
每个贡献者提供 `select`，第一个返回非 null 的胜出，平手按 `priority` 升序；本插件 `priority: -1`，并且
**只在当前回合确实有 `present` 交付时才认领**：

- 有 `present` 的回合：由本插件渲染卡片（含「下载」），因此也必须一并渲染「本轮文件改动」chips——
  chain 只会渲染一个贡献。
- 没有 `present` 的回合（只改文件、没交付）：返回 `null`，**官方那一行完全不受影响**。
- 官方的 `ui-deliverables` 被移除/禁用时，`select` 读不到数据 → 返回 `null` → 什么都不渲染，不报错。

数据来源：`owner.turn.data.get('deliverables')`（[`deliverablesOf`](../lib/client.js#L379)），按官方同样的规则
重新推导（`seq <` 收尾 seq、同路径取最后一次声明、首见顺序）。这一投影在 0.1.5 由官方客户端从 `present`
工具调用参数折叠而来，在 0.1.7 由 durable 事件投影而来——**插件只读投影，两代都适用**。

**0.1.7-rc.\* —— list（注入子 slot）**

`snapshot()` 里官方交付卡片声明了子 slot `deliverables.file.actions`（list），于是选 `fileActions017`
（它优先于 chain 适配器）：

- 不注册 `turnTail`，官方交付卡片照常渲染（不会重复）。
- 通过该 list 子 slot 注入一个「下载」按钮（[`ActionDownload`](../lib/client.js#L734)）；该 slot 的 owner 带
  `actionUrl`，其 query 正是 durable 的 `(sessionId, seq, index)`，下载路由继续只认这三个坐标，
  **没有 path 参数**。
- 在 0.1.5-rc.\* 上，`deliverables.file.actions` 从未被声明，这个 injection 只是等待，不报错、不生效。

## 4. 图标能力表

图标名在两个世代都改过，而且**后缀不统一**（有的图标换过两次），所以做成候选表而不是解构：

| 用途 | 0.1.5-rc.\* | 0.1.7-rc.\* | 防御性末项 |
|---|---|---|---|
| 折叠箭头（下/上） | `IconChevronDownOutline14` / `…UpOutline14` | `…OutlineRegular`（另有 `…Medium`） | `…Outline` |
| 右侧上箭头 | `IconRightUpOutline16` | `IconRightUpOutlineRegular` | `IconRightUpOutline` |
| 文件夹 | `IconFolderOpenOutline16` | `IconFolderOpenOutlineRegular` | `IconFolderOpenOutline` |
| 下载 | `IconDownloadOutline16` | `IconDownloadOutlineRegular` | `IconDownloadOutline` |

- [`ICON_GENERATIONS`](../lib/client.js#L49) + [`resolveIcons`](../lib/client.js#L63)：按代际顺序取第一个
  `!== undefined` 的导出名（用 `in` 判定，避免解构出 `undefined`）。
- 0.1.5 命中第 1 项（后续项不被求值，行为零变化），0.1.7 命中第 2 项。
- **无后缀名从未在任何已发布 RC 上存在**（`IconDownloadOutline` 的防御性末项只是兜底）。
- 用 `undefined` 当组件渲染会在渲染期才炸、且信息极差（React 只报 `Element type is invalid`），
  所以解析结果在 `resolveIcons` 里就被核对（`test/select-adapter.test.mjs` 直接测这张表）。

> 病史：0.1.7-rc.2 上线后「下载按钮消失」的直接原因就是这里——当时的回退链是 `…16 ?? …Outline`，
> 而 0.1.7 的真名是**权重后缀** `…OutlineRegular`，五个全部落空。详见 [compatibility.md](compatibility.md)。

## 5. 安全边界

「从 Web 下载服务器文件」很容易写成一个任意文件读取漏洞（社区里就有把 `?path=` 直接交给
`createReadStream` 的插件）。本插件的下载**没有 path 参数**，只能用和官方 `/api/present.open` 完全相同的
三元组寻址：

1. `(sessionId, seq, index)` → `sessionQuery.readEvent` 读 durable 的 `deliverables/presented` 事件；
2. 取出该事件里 `files[index]` 的**声明路径**；索引不到就 404；
3. 路径交给 `workspaceFiles.stat({sessionId, workspaceRoot})` 解析——也就是**侧边栏预览用的那套 Session
   文件系统**，越界/不存在/不是普通文件都会失败；
4. 再用 `fs.resolve` + `fs.stat` 复核目标，最后用 `fs.readByteRange` 分块读取。

也就是说，**只有 Session 自己用 `present` 声明过的文件能被下载**，不能指向任意主机文件。路由注册在
Connection 的共享 `/api` 通道上，自动继承与其它 Host 路由相同的 trust fence 与浏览器 Cookie 认证；
`/api/present.open`（原生打开）的判定仍由官方代码负责，本插件只是调用方。`test/host.test.mjs` 里有一条
「`path=` 被忽略且不解析」的不变量断言。

## 6. 与官方卡片的行为差异

| 场景 | 差异 |
|---|---|
| 0.1.5-rc.\*（chain） | 卡片视觉与交互按官方样式重写（同样的 60px 卡片、40px 图标框、28px 分段控件、`--dsw-*` 语义色，深色主题跟随），但**不是同一份 CSS**，像素级细节可能有细微差异 |
| 0.1.5-rc.\*（chain） | 「本轮文件改动」chips 固定最多 6 个 + `+ N 个文件`，未实现官方的容器查询分档（窄宽度下官方会逐档减少 chips） |
| 0.1.7-rc.\*（list） | 官方卡片与 chips 全部保留，只多一个「下载」按钮，因此没有上述视觉差异；下载文件名由 Host 的 `Content-Disposition` 决定 |

## 7. 决策记录

### D1 — 0.1.7 兼容路线：能力探测适配器（而非版本 fence / 而非跟随官方拆子 slot）

当时的三个选项：

1. 版本自适应注册：探测目标 slot 的 `kind`，chain 走 `select + priority`，list 走 `id + order` 并渲染到
   官方行内部。← **采用（并进一步规范为「适配器 + 能力探测」）**
2. 只支持 0.1.5-rc.\*：加版本 fence + README 声明不兼容，把 0.1.7 的失败变成明确报错。
3. 跟随官方把交付卡片能力拆成 0.1.7 的 `children` 子 slot（工作量最大，但最稳）。← 采用其思路的
   **一半**：不复制官方卡片，而是往官方声明的子 slot 里注入按钮。

选 1 + 3 的混合体：**每个契约一个适配器，按运行时声明同步择优**。代价是两条线各有一套渲染代码；收益是
不依赖任何版本号、不改官方文件、新世代通常只需加一列（图标）或加一个适配器。

### D2 — 图标回退做成表 + 解析器（而不是 `??` 链）

`??` 链一旦漏掉一代就静默变成 `undefined`，而 `undefined` 当组件用只在渲染期炸（0.1.7 的实际事故）。
所以：单一表 + `resolveIcons()` 收敛解析 + 用 `in` 判定 + L0 直接测这张表（而不是让主流程用例间接覆盖）。

### D3 — 下界是 0.1.5-rc.1

`inject` 依赖 `workspaceFiles`（`@deepseek-ai/dsh-api-workspace-files` 首发 0.1.5-alpha.1），且下载数据源是
`deliverables/presented`（`@deepseek-ai/dsh-tool-present` 首发 0.1.5-alpha.2）。更早的 RC 上要么缺服务导致
加载失败，要么永远没有 `present` 事件。更早的 alpha 只作为历史事实引用，不进入兼容矩阵。

### D4 — 测试组织：主流程走最新 RC + 每个适配器一个测试类

- 主流程用例（`test/client.test.mjs`）用**最新 RC**（当前 0.1.7 的 `fileActions017`）的适配器。
- 每个适配器另有专属测试类：`test/adapter-file-actions-017.test.mjs`、`test/adapter-chain-015.test.mjs`。
- 选择器与图标解析单独成类（`test/select-adapter.test.mjs`），共享桩放在 `test/client-harness.mjs`。

理由：主流程只测一条真实路径（避免「两条线都只测了一半」），适配器差异由专属类固定；选择逻辑必须能被
单独测，否则会退化成「靠主流程间接覆盖」。

### D5 — 探测时机放在 `slots.inject` 回调

见 3.2：只有该回调能保证「官方 owner 已声明」，且天然做到只注册一次。

### D6 — 不引入构建与第三方依赖

见第 2 节第 1、3 条。代价是浏览器半区手写、不能 `import` 官方包；收益是安装即生效、无供应链面、
没有 `postinstall` 副作用（history 里那类「装完还要 build」的插件正是本插件刻意避开的）。
