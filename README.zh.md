# dsh-download-button

[English](README.md) | 中文

在 DSH Web GUI 的**交付卡片**上，给「打开」按钮右边加一个「下载」按钮：模型用 `present` 交付的文件（打包好的
zip、报告、数据集、图片……）直接通过浏览器下载到本机，不用再开 SFTP/SCP 拉文件。

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

远程/容器里跑 DSH（云主机、GPU 机器、WSL、内网服务器）时最有用：文件在 Host 上，浏览器在你手上，
中间只差一个按钮。

## 功能

- **交付卡片一键下载**：`present` 声明的每个文件右边都有「下载」，走 `Content-Disposition: attachment`，
  由浏览器自己的下载管理器流式落盘——几十上百 MB 的 zip 不会先塞进页面内存。
- **官方卡片能力保留**：点卡片/「打开」在侧边栏预览；右侧 `▾` 仍是官方的「用默认应用打开」
  「打开所在文件夹 / 在 Finder 中显示 / 在文件资源管理器中显示」，主机没有桌面时按官方语义禁用并提示。
- **状态就地反馈**：正在准备下载… / 已开始下载 / 下载失败，点击重试；打开、打开所在文件夹同样有状态与重试。
- **不干扰官方渲染**：本轮文件改动 chips、多文件折叠（`全部 N 个文件` / `收起`）等官方行为照旧；
  插件的回合没有交付产物时，官方那一行完全不受影响。
- **零依赖、零构建**：纯 ESM + 手写浏览器 bundle，装完即用；没有 `postinstall`、没有编译步骤。
- **中英双语**：跟随 GUI 语言。
- **同时兼容 DSH 0.1.5-rc.\* 与 0.1.7-rc.\***：见下方「支持的 DSH 版本」。

## 安装

从 npm 装进 web profile：

```sh
dsh plugin --profile web add dsh-download-button
```

也可以直接装 git 仓库——本包无构建步骤，`lib/` 已提交：

```sh
dsh plugin --profile web add github:hanbernate/dsh-download-button
```

本地开发时改为链接本目录，改动后 Host 半区随 Loader 热重组合生效：

```sh
dsh plugin --profile web add /path/to/dsh-download-button
```

`dsh` 不在 PATH 上时，用你启动 Web GUI 的那份 CLI，例如：

```sh
node ~/.dsh/profiles/node_modules/@deepseek-ai/dsh/lib/bin.js \
  plugin --profile web add dsh-download-button
```

这条命令把 `dsh-download-button` 追加到 profile 的 `dsh.profile.bundles`，并由 Loader 插入本包
`cordis.patch.yml` 里的那条 entry。

生效方式：

- 装完 **刷新浏览器页面**（浏览器半区是页面加载的 bundle，刷新才会重新拉取）。
- 若刷新后没出现按钮，重启 Web GUI：`dsh web`（或你平时的启动命令）。

验证：随便让它 `present` 一个文件（例如先 `ls` 出你打包好的 zip），卡片右侧就会出现「下载」。

## 使用

按钮长在**官方交付卡片**的「打开」右侧，一文件一个：

| 操作 | 行为 |
|---|---|
| **下载** | 先 `HEAD /api/download.button?sessionId=…&seq=…&index=…` 探测可下载性，成功后用 `<a download>` 把文件交给浏览器下载管理器；文件名由 Host 的 `Content-Disposition` 决定 |
| **打开** | 与官方一致：在侧边栏预览该文件 |
| **▾ 菜单** | 官方动作：用默认应用打开 / 打开所在文件夹（Finder / 资源管理器）；主机无桌面时禁用 |
| **失败** | 就地显示失败原因（如「该文件已不在会话中」），点击原按钮重试 |
| **多于 4 个文件** | 保留官方折叠：`全部 N 个文件` / `收起` |

下载只接受 `(sessionId, seq, index)` 三元组寻址，**没有 `path` 参数**，因此只有该会话用 `present` 声明过的
文件能被下载；解析、越界与类型校验、分块读取全在 Host 半区。详见 [doc/architecture.md](doc/architecture.md#5-安全边界)。

## 支持的 DSH 版本

| DSH RC | `turnTail` 契约 | 集成方式 | 状态 |
|---|---|---|---|
| 0.1.0-rc.2 … 0.1.2-rc.1 | —（无 `present` / `workspaceFiles`） | 不适用 | 不支持 |
| 0.1.5-rc.1 / rc.2 / rc.3 | chain | 按 `priority: -1` 认领整行并自绘卡片 | 支持（rc.3 实测 11/11） |
| 0.1.7-rc.1 / rc.2 | list | 官方卡片原样，注入 `deliverables.file.actions` 下载按钮 | 支持（rc.2 实测 12/12） |

> 插件在初始化时按运行时**实际声明**选择适配器（客户端拿不到 DSH 版本号），所以同一份安装包在两条线上都工作。
> 契约清单、测试分层、逐项实测记录与换线手册见 [doc/compatibility.md](doc/compatibility.md)。

## 卸载

```sh
dsh plugin --profile web remove dsh-download-button
```

然后刷新页面。插件被移除后，官方交付卡片原样恢复——本插件不修改任何官方文件。

## 故障排查

| 现象 | 处理 |
|---|---|
| 卡片右侧没有「下载」 | 先刷新页面；再确认 `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles` 里有 `dsh-download-button`；仍无效则重启 `dsh web` |
| 按钮出现，点了提示「下载失败，点击重试」 | 打开浏览器开发者工具看 `/api/download.button?...` 的响应：401/403 = 认证，404 = 该声明不在 Session 里（换了会话或事件被裁剪），422 = 不是常规文件/在工作区之外 |
| 点「打开」报「打开失败」 | Host 无桌面（纯服务器）时的正常结果；用「下载」或侧边栏预览 |
| 报 `exports["./client"] must be a string` | `package.json` 的 `exports` 被改坏了，跑 `npm test` 看守卫 |
| 改了 `lib/client.js` 没生效 | 刷新页面（bundle 由 Host 按 revision 提供，页面不刷新不会重拉） |

## 文档

| 文档 | 内容 |
|---|---|
| [doc/architecture.md](doc/architecture.md) | 工作原理、两个半区、适配器与能力探测选择器、图标能力表、安全边界、设计决策记录 |
| [doc/compatibility.md](doc/compatibility.md) | 支持矩阵、官方契约面清单（C1–C10）、两个断点的历史、测试分层与用例、真机实测记录（V1–V17）、换线手册 |
| [doc/development.md](doc/development.md) | 目录结构、跑测试、改完怎么生效、新增适配器的步骤、发布前检查清单、开发陷阱 |

## License

MIT，见 [LICENSE](LICENSE)。
