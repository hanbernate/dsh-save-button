# 开发

安装与使用见 [README](../README.zh.md)（英文版 [README.md](../README.md)）；兼容矩阵与真机验证见 [compatibility.md](compatibility.md)；
设计动机见 [architecture.md](architecture.md)。

---

## 1. 目录结构

```
package.json            清单：dsh.bundle.patch / dsh.client / exports（files 只发 lib + patch + README + LICENSE）
cordis.patch.yml        profile 层：插入名为 dsh-download-button 的 loader entry
lib/index.js            Host 半区：注册 /api/download.button
lib/download.js         Host 纯函数：查询校验、响应头、失败分类、分块字节流
lib/client.js           浏览器半区：__ModuleLoader__ bundle（手写，无构建，872 行）
test/client-harness.mjs              共享桩：bundle 装载、两代 primitives、声明树、树遍历与文案
test/client.test.mjs                 主流程（走最新 RC 适配器：0.1.7 的 per-file action list）
test/adapter-file-actions-017.test.mjs  0.1.7-rc.* 适配器专属（子 slot 注册、坐标、按钮与下载手势）
test/adapter-chain-015.test.mjs       0.1.5-rc.* 适配器专属（chain 认领、整行卡片、chips、折叠）
test/select-adapter.test.mjs          选择器与图标解析（声明树探测、适配器优先级、三代图标名）
test/download.test.mjs                Host 纯函数与流行为
test/host.test.mjs                    Host 路由端到端（伪 Cordis 上下文，含「不接受 path」断言）
test/package.test.mjs                 清单/补丁/模块请求守卫
doc/                                  本目录：架构与决策、兼容性、开发
.script/                              临时脚本（gitignored）：compat/ 静态探针
```

## 2. 跑测试

```sh
npm test        # L0：node --test，Node ≥ 22，无第三方依赖（当前 85 条断言全绿）
```

静态契约探针（无需安装任何版本，直接读 registry/发布物与 `lib/client.js`）：

```sh
node .script/compat/probe-017.mjs           # 0.1.7-rc.2 的 C6–C8 契约/图标面
node .script/compat/probe-icons-matrix.mjs  # 全部 RC tag 的图标矩阵（10 个 tag）
```

真机规格（真 registry + 生产渲染器）在兼容性工作树里跑，换线与命令见
[compatibility.md 第 10 节](compatibility.md#10-换线操作手册)。

## 3. 改完代码怎么生效

| 改动 | 生效方式 |
|---|---|
| `lib/index.js` / `lib/download.js`（Host 半区） | 随 Loader 热重组合生效 |
| `lib/client.js`（浏览器半区） | **刷新页面**。bundle 由 Host 按 revision 提供，页面不刷新不会重拉；开发 Web GUI 时的 `pnpm run dev:web` 只重编官方 bundle，本包不参与该构建 |
| `cordis.patch.yml` / `package.json` | 重新 `dsh plugin --profile web add <本目录>`（或重启 `dsh web`） |

## 4. 约定

- **零依赖、零构建**：没有 `postinstall`、没有编译步骤。浏览器半区是手写的
  `window.__ModuleLoader__.load({ id, factory })` 包封（与官方 bundle 同格式）。
- **只 `require` 客户端基线模块**：`react` 与 `@deepseek-ai/dsh-client-ui-primitives`。**不要** import 官方
  deliverables 包——那会与官方实现耦合，`test/package.test.mjs` 里有守卫。
- **适配器必须是同一文件里的对象**：加载器的模块表只接受「table words」，相对 `require` 拿不到自定义模块。
  主流程只调用适配器接口（`accepts` / `register`），不写 `if (版本)`。
- **图标名只从 `ICON_GENERATIONS` 取**，不要在渲染代码里直接解构 primitives 的图标名。
- **临时脚本一律放项目根 `.script/`**（已被 `.gitignore`；按 `temporary-scripts-in-dot-script` 约定）。

### 新增一个世代的适配器（checklist）

1. 在 `lib/client.js` 顶部给受影响的图标**加一列**候选名（`ICON_GENERATIONS`），并确认 `resolveIcons` 能命中。
2. 写一个适配器对象：`{ id, accepts(ctx), register(ctx) }`——`accepts` 只读 `declaredKind(ctx, key)` 这类
   **正向能力信号**，不要匹配异常文案。
3. 加进 `ADAPTERS`（顺序 = 优先级；子 slot 适配器放在整行认领适配器之前）。
4. 加一个专属测试类 `test/adapter-<name>.test.mjs`，并在 `test/select-adapter.test.mjs` 里补声明树/优先级用例。
5. 在兼容性工作树上换到该世代的 tag，补一份真机 spec（或扩展现有 spec）与
   [compatibility.md](compatibility.md) 的实测记录。

## 5. 发布前检查清单

- [ ] `npm test` 全绿（85 条）。
- [ ] 两个静态探针退出码 0；图标矩阵覆盖到最新 RC tag。
- [ ] 兼容性工作树切到 latest 与 next 两个 RC，各跑一次真机规格（`vitest run --config .script/verify/vitest.verify.config.ts`）。
- [ ] `dsh plugin --profile web add <本目录>` + `dsh --profile web --dump-config | grep download-button` 通过。
- [ ] 浏览器里实际点一次「下载」，确认字节一致（含中文名/大文件）。
- [ ] 本文件与 [compatibility.md](compatibility.md) 的版本表、断言数、实测记录已同步更新。

## 6. 常见开发陷阱

| 陷阱 | 说明 |
|---|---|
| 桩里的名字不是真包的导出名 | 曾经把 0.1.7 写成裸名 `IconDownloadOutline`（真包从不导出它），于是真机已断、L0 仍全绿。桩、探针里的名字必须以真包 `lib/types/icons/index.d.ts` 为准 |
| 把 `undefined` 当组件用 | 渲染期才炸，React 只报 `Element type is invalid`。图标解析必须显式核对 |
| 靠异常文案判代 | list 分支的 `requires options.id` 是反向信号，措辞会变。用 `ctx.slots.snapshot()` 的声明树 |
| `slots.entries(key)` 判存在性 | 它无法区分「已声明但为空」与「未声明」，所以探测要用 `snapshot()` |
| 0.1.7-rc.2 上 `pnpm run clean` | 该版本自身的问题（tracked tsconfig 的 outDir 违反自己的校验），跳过 clean，直接 `pnpm install && pnpm run build`，并核对产物世代 |
| 跨 tag 切换工作树 | 先清「没有 package.json 的幽灵目录」和根 `lib/`，否则构建报 `Cannot find entry` 或 clean 报 outDir 错 |
