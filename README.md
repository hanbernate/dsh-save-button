# dsh-present-download

在 DSH Web GUI 的**交付卡片**上，给「打开」按钮右边加一个「下载」按钮：模型用 `present` 交付的文件（打包好的 zip、报告、数据集、图片……）直接通过浏览器下载到本机，不用再开 SFTP/SCP 拉文件。

```
┌──────────────────────────────────────────────────────────────────┐
│  📄  HexHowitzer-windows-x86_64.zip                    ┌────────┐ │
│      在侧边栏预览                                       │ 打开 ▾ │ │  ← 官方卡片
│                                                        └────────┘ │
└──────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│  📄  HexHowitzer-windows-x86_64.zip           ┌────────┐ ┌──────┐ │
│      在侧边栏预览                              │ 打开 ▾ │ │ ⬇ 下载│ │  ← 装上本插件
│                                               └────────┘ └──────┘ │
└──────────────────────────────────────────────────────────────────┘
```

远程/容器里跑 DSH（云主机、GPU 机器、WSL、内网服务器）时最有用：文件在 Host 上，浏览器在你手上，中间只差一个按钮。

## 功能

- **交付卡片一键下载**：`present` 声明的每个文件右边都有「下载」按钮，走 `Content-Disposition: attachment`，由浏览器自己的下载管理器流式落盘——几十上百 MB 的 zip 不会先塞进页面内存。
- **官方卡片能力保留**：点卡片/「打开」在侧边栏预览；右侧 `▾` 仍是官方的「用默认应用打开」「打开所在文件夹 / 在 Finder 中显示 / 在文件资源管理器中显示」，主机没有桌面时按官方语义禁用并提示。
- **状态就地反馈**：正在准备下载… / 已开始下载 / 下载失败，点击重试；打开、打开所在文件夹同样有状态与失败重试。
- **本轮文件改动 chips 保留**：同一个回合里既改了文件又交付了产物时，改动清单照旧显示（最多 6 个 + `+ N 个文件`）。
- **交付文件多于 4 个时保留官方折叠行为**（`全部 N 个文件` / `收起`）。
- **零依赖、零构建**：纯 ESM + 手写浏览器 bundle，装完即用；没有 `postinstall`、没有编译步骤。
- **中英双语**：跟随 GUI 语言。

## 安装

在本目录下不需要 `npm install`（没有依赖）。把项目链接进 web profile：

```sh
dsh plugin --profile web add /home/liumenghan/dsh-present-download
```

`dsh` 不在 PATH 上时，用你启动 Web GUI 的那份 CLI，例如：

```sh
node /home/liumenghan/.dsh/profiles/node_modules/@deepseek-ai/dsh/lib/bin.js \
  plugin --profile web add /home/liumenghan/dsh-present-download
```

这条命令做三件事：把包链接进 `~/.dsh/profiles/web/node_modules`、把 `dsh-present-download` 追加到 profile 的 `dsh.profile.bundles`、由 Loader 插入本包 `cordis.patch.yml` 里的那条 entry。

生效方式：

- 装完 **刷新浏览器页面**（浏览器半区是构建产物，页面刷新才会重新拉取 bundle）。
- 若页面刷新后没出现按钮，重启 Web GUI：`dsh web`（或你平时的启动命令）。

验证：随便让它 `present` 一个文件（例如先 `ls` 出你打包好的 zip），卡片右侧就会出现「下载」。

## 卸载

```sh
dsh plugin --profile web remove dsh-present-download
```

然后刷新页面。插件被移除后，官方交付卡片原样恢复——本插件不修改任何官方文件。

## 工作原理

```
浏览器（本插件 client.js）                        Host（本插件 index.js）
─────────────────────────────────────────       ───────────────────────────────────────────
conversation.chat.turnTail（chain slot）
  priority: -1  ← 先于官方 entry 参与选举
  select(owner):
    owner.turn.data.get('deliverables')
      有 presented  → 认领这一轮，自己渲染卡片
      无 presented  → 返回 null，官方 entry 照旧渲染
                                                 GET/HEAD /api/present.download
点击「下载」 ───────────────────────────────────▶   ?sessionId=…&seq=…&index=…
  1. fetch(HEAD) 探测可下载性                      ├─ sessionQuery.readEvent 取 durable 事件
  2. <a download> 交给浏览器下载管理器             ├─ deliverables/presented → 声明里的 path
                                                   ├─ workspaceFiles.stat → Session 文件系统
                                                   ├─ fs.stat 必须是普通文件
                                                   └─ fs.readByteRange 分块流式响应
                                                      Content-Disposition: attachment
```

### 为什么用 chain 的优先级遮蔽

`conversation.chat.turnTail` 是 **chain** 类型的 slot：每个贡献者提供 `select`，第一个返回非 null 的胜出，平手按 `priority` 升序。本插件 `priority: -1`，并且**只在当前回合确实有 `present` 交付时才认领**：

- 有 `present` 的回合：由本插件渲染卡片（含「下载」），因此也必须一并渲染「本轮文件改动」chips——chain 只会渲染一个贡献。
- 没有 `present` 的回合（只改文件、没交付）：本插件返回 `null`，**官方那一行完全不受影响**。
- 官方的 `ui-deliverables` 插件被移除/禁用时，本插件的 `select` 读不到数据 → 返回 `null` → 什么也不渲染，不会报错。

不依赖 `@deepseek-ai/dsh-client-ui-deliverables` 的任何导出：声明数据从 `owner.turn.data` 的 `deliverables` 投影里按官方同样的规则（`seq < 收尾 seq`、同路径取最后一次声明、首见顺序）重新推导。

## 安全边界

这一点值得单独说清楚，因为「从 Web 下载服务器文件」很容易写成一个任意文件读取漏洞（社区里就有把 `?path=` 直接交给 `createReadStream` 的插件）。

本插件的下载**没有 path 参数**，只能用和官方 `/api/present.open` 完全相同的三元组寻址：

1. `(sessionId, seq, index)` → `sessionQuery.readEvent` 读 durable 的 `deliverables/presented` 事件；
2. 取出该事件里 `files[index]` 的声明路径；索引不到就 404；
3. 路径交给 `workspaceFiles.stat({sessionId, workspaceRoot})` 解析——也就是**侧边栏预览用的那套 Session 文件系统**，越界/不存在/不是普通文件都会失败；
4. 再用 `fs.resolve` + `fs.stat` 复核目标，最后用 `fs.readByteRange` 分块读取。

也就是说，**只有 Session 自己用 `present` 声明过的文件能被下载**，不能指向任意主机文件。此外路由注册在 Connection 的共享 `/api` 通道上，自动继承与其它 Host 路由相同的 trust fence 与浏览器 Cookie 认证；`/api/present.open`（原生打开）的判定仍由官方代码负责，本插件只是调用方。

## 兼容性

| 依赖的官方契约 | 出处 |
|---|---|
| `conversation.chat.turnTail` chain slot（`select` + `priority`） | `@deepseek-ai/dsh-client-ui-chat` |
| Turn 数据投影 `deliverables`（`produced` / `presented`） | `@deepseek-ai/dsh-client-ui-deliverables` |
| `deliverables/presented` durable 事件 | `@deepseek-ai/dsh-tool-present` |
| `/api/present.open`、`/api/present.host` | `@deepseek-ai/dsh-client-ui-deliverables`（host half） |
| `ctx.connection.fetch.register` 精确路由 | `@deepseek-ai/dsh-client-connection` |
| `ctx.sessionQuery.readEvent`、`ctx.workspaceFiles.stat`、`ctx.fs.readByteRange` | Host 服务 |

已验证：DSH `0.1.5-rc.2`（web profile，`dshmarket` 作为前置插件共存）。

行为差异（与官方卡片相比，这是 chain 遮蔽的必然代价，已尽量对齐）：

- 卡片视觉与交互按官方样式重写（同样的 60px 卡片、40px 图标框、28px 分段控件、`--dsw-*` 语义色，深色主题跟随），但不是同一份 CSS，像素级细节可能有细微差异。
- 「本轮文件改动」chips 固定最多 6 个 + `+ N 个文件`，未实现官方的容器查询分档（窄宽度下官方会逐档减少 chips）。

## 开发

```
package.json          清单：dsh.bundle.patch / dsh.client / exports
cordis.patch.yml      profile 层：插入名为 dsh-present-download 的 loader entry
lib/index.js          Host 半区：注册 /api/present.download
lib/download.js       Host 纯函数：查询校验、响应头、失败分类、分块字节流
lib/client.js         浏览器半区：__ModuleLoader__ bundle（手写，无构建）
test/download.test.mjs  Host 纯函数与流行为
test/client.test.mjs    bundle envelope、select 规则、渲染出的按钮与下载手势
test/package.test.mjs   清单/补丁/模块请求守卫
```

跑测试：

```sh
npm test        # node --test（Node ≥ 22，无第三方依赖）
```

改完 `lib/` 下的文件后：Host 半区随 Loader 热重组合生效；`lib/client.js` 是页面加载的 bundle，需要**刷新页面**（开发 Web GUI 时 `pnpm run dev:web` 会重编官方 bundle，但本包不参与该构建，仍以刷新为准）。

浏览器半区是手写的 `window.__ModuleLoader__.load({ id, factory })` 包封（与官方 bundle 同格式），只 `require` 客户端基线模块：`react` 与 `@deepseek-ai/dsh-client-ui-primitives`。**不要**在这里 import 官方 deliverables 包——那样会和官方实现耦合，测试里有守卫。

## 故障排查

| 现象 | 处理 |
|---|---|
| 卡片右侧没有「下载」 | 先刷新页面；再确认 `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles` 里有 `dsh-present-download`；仍无效则重启 `dsh web` |
| 按钮出现，点了提示「下载失败，点击重试」 | 打开浏览器开发者工具看 `/api/present.download?...` 的响应：401/403 = 认证，404 = 该声明不在 Session 里（换了会话或事件被裁剪），422 = 不是常规文件/在工作区之外 |
| 点「打开」报「打开失败」 | Host 无桌面（纯服务器）时的正常结果；用「下载」或侧边栏预览 |
| 报 `exports["./client"] must be a string` | `package.json` 的 `exports` 被改坏了，跑 `npm test` 看守卫 |
| 改了 `lib/client.js` 没生效 | 刷新页面（bundle 由 Host 按 revision 提供，页面不刷新不会重拉） |

## License

MIT，见 [LICENSE](LICENSE)。
