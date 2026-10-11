# Sense (Cangjie) for VS Code

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/opencj.sense)](https://marketplace.visualstudio.com/items?itemName=opencj.sense)
[![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/opencj.sense)](https://marketplace.visualstudio.com/items?itemName=opencj.sense)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://atomgit.com/OpenCangjieCommunity/sense_vscode/blob/master/LICENSE)

在 Visual Studio Code 中使用 [sense](https://gitcode.com) 包管理器与 `sense lsp` 语言服务器开发仓颉（Cangjie）程序。

本插件与官方仓颉插件不兼容，请勿同时启用。

## 安装

在 VS Code 的扩展面板中搜索 `Sense (Cangjie)`，或访问 [Marketplace 页面](https://marketplace.visualstudio.com/items?itemName=opencj.sense) 安装。

离线安装：下载 `.vsix` 之后执行 `code --install-extension sense-<版本>.vsix`。

## 功能

- **语法与语义高亮**：`.cj` 源文件、语义 token 类型（内建类型、`this`、类型别名、注解）与各主题的回退 scope。
- **语言服务**：基于 `sense lsp`，提供补全、定义跳转、查找引用、悬浮提示、重命名、大纲、类型层次、调用层次、诊断等能力。
- **清单补全**：`sense.toml` 的键名、取值与错误提示，通过 [Even Better TOML](https://marketplace.visualstudio.com/items?itemName=tamasfe.even-better-toml) 扩展加载本插件声明的 JSON Schema 获得。
- **索引进度**：语言服务器建立工程索引时，进度会显示在状态栏的 `sense` 条目上。
- **格式化**：调用 SDK 自带 `cjfmt`，支持整文件与选区格式化。
- **静态检查**：调用 SDK 自带 `cjlint`，支持保存时检查与结果面板跳转。
- **覆盖率**：`sense test --coverage` 配合 `cjcov` 生成 HTML 报告。
- **构建**：`sense build`，支持 release 配置、自定义产物目录、目标三元组、feature、并发数、工作区整体构建。
- **测试**：`sense test`，支持 `--no-run`、`--skip-build`、`--coverage`、`--filter`、`-j`。
- **运行**：先构建再运行 `target/<配置>/bin/<模块名>`。
- **依赖管理**：`sense fetch`、`sense update`，并在资源管理器里以树形展示 `sense.toml` 声明的依赖。
- **文档**：`sense docs` 生成 API 文档网站并打开首页。
- **工程创建**：命令行向导与图形化面板两种方式，直接生成 `sense.toml` 与起始源码。

## 要求

- Visual Studio Code 1.134 或更高版本。
- 仓颉 SDK：通过 `sense.sdkPath` 设置或 `CANGJIE_HOME` 环境变量提供，且包含 `bin/cjc`、`tools/bin/LSPServer`、`envsetup.sh`。
- `sense` 可执行文件：通过 `sense.executablePath` 设置或 PATH 提供。`sense docs` 还需要 `sense_docs` 与 `cangjie-docs`。
- `sense.toml` 的补全与校验需要安装 [Even Better TOML](https://marketplace.visualstudio.com/items?itemName=tamasfe.even-better-toml) 扩展。

## 快速开始

1. 安装仓颉 SDK，并确认 `CANGJIE_HOME` 指向 SDK 根目录。
2. 打开一个包含 `sense.toml` 的工程，或在命令面板执行 `Sense: Create Cangjie Project` 新建工程。
3. 如果扩展没有自动找到 SDK 或 `sense`，执行 `Sense: Select Cangjie SDK`，或在工作区设置里填写 `sense.sdkPath` 与 `sense.executablePath`。
4. 打开任意 `.cj` 文件，语言服务会在后台建立索引，状态栏的 `sense` 条目会显示 `x/y packages indexed`。

## 启用条件

扩展只在工作区根目录存在 `sense.toml`，或者用户打开了任意位置的 `sense.toml` 时启用语言服务。其它情况下只保留命令注册，不启动语言服务。

## 设置

| 设置项 | 默认值 | 说明 |
| --- | --- | --- |
| `sense.sdkPath` | `""` | 仓颉 SDK 的绝对路径；为空时使用 `CANGJIE_HOME` |
| `sense.executablePath` | `""` | `sense` 可执行文件的绝对路径，或包含 `sense`、`sense_docs`、`cangjie-docs` 的目录；为空时在 PATH 中查找 |
| `sense.lsp.autoRestart` | `true` | 语言服务异常结束后的自动重启 |
| `sense.lsp.arguments` | `[]` | 附加给 `sense lsp` 的参数，非选项参数会转交给 `LSPServer` |
| `sense.lsp.discovery` | `lazy` | 嵌套工程发现方式，可选 `lazy`、`eager`、`off`，对应 `CANGJIE_LSP_DISCOVERY` |
| `sense.trace.server` | `off` | JSON-RPC 通信跟踪，可选 `off`、`messages`、`verbose`；报文写入 `sense Trace` 输出通道 |
| `sense.codeCheck.onSave` | `false` | 保存 `.cj` 文件时执行 `cjlint` |
| `sense.build.targetDir` | `""` | 传给 `sense build --target-dir` 的产物根目录，也用于定位 `sense.run` 要执行的文件；为空时使用工程默认的 `target` |
| `sense.lsp.runtimeEnv` | `{ "cjHeapSize": "700MB", "cjStackSize": "8MB" }` | 交给 `sense lsp` 进程的仓颉运行时环境变量；取值必须带 `KB`、`MB` 或 `GB` 单位，设为空字符串则从子进程环境中移除该变量 |

## 命令

命令面板中搜索 `sense`：

- 构建：`sense.build`、`sense.build.release`、`sense.build.workspace`、`sense.build.targetDir`、`sense.build.jobs`、`sense.build.target`、`sense.build.feature`
- 依赖：`sense.build.fetch`、`sense.build.update`
- 清理：`sense.build.clean`
- 运行：`sense.run`
- 测试：`sense.test`、`sense.test.noRun`、`sense.test.skipBuild`、`sense.test.coverage`、`sense.test.jobs`、`sense.test.filter`
- 文档：`sense.docs`
- 格式化：`sense.format`、`sense.formatFolder`
- 检查：`sense.codeCheck`、`sense.codeCheckFolder`
- 覆盖率：`sense.coverage`、`sense.coverageFolder`
- 工程：`sense.project.create`、`sense.project.create.view`
- SDK：`sense.sdk.select`

## 输出通道

扩展创建两个日志通道：

- `sense`：扩展自身的诊断、sense lsp 的 stderr 与语言客户端日志。状态栏的 `Open Log` 打开它。
- `sense Trace`：`sense.trace.server` 打开时的 JSON-RPC 报文跟踪。状态栏的 `Open Trace` 打开它。

两个通道都按日志级别过滤，其级别由用户在输出面板中切换。要看到跟踪报文，除了把 `sense.trace.server` 设为 `messages` 或 `verbose`，还需要把 `sense Trace` 通道的级别切到 `Trace`。

## 问题反馈

在 [Issues](https://atomgit.com/OpenCangjieCommunity/sense_vscode/issues) 中反馈。提交问题时请附上 VS Code 版本、仓颉 SDK 版本、`sense lsp` 版本，以及 `sense` 输出通道的日志。

## 开发

```shell
pnpm install
pnpm run check          # 类型检查
pnpm run compile        # 生成到 out/
pnpm run webpack        # 打包成 out/extension.js
pnpm run package        # 生成 vsix
```

端到端测试使用 `@vscode/test-cli`，测试工作区是 `test-fixtures/sample-project`：

```shell
export CANGJIE_HOME=/path/to/cangjie-sdk
export SENSE_EXECUTABLE_PATH=/path/to/sense
pnpm test
```

未设置 `CANGJIE_HOME` 与 `SENSE_EXECUTABLE_PATH` 时，语言服务器测试会自动跳过，只运行冒烟测试。

也可以从任意 shell 运行整体验证：

```shell
CANGJIE_HOME=/path/to/cangjie-sdk \
SENSE_EXECUTABLE_PATH=/path/to/sense \
bash scripts/verify.sh
```

打包内容校验（不包含源码、测试与开发文件，运行时依赖已打进 `out/extension.js`）：

```shell
bash scripts/checkPackage.sh
```

## 发布

发布由仓库根目录的 `.gitcode/workflows/release.yml` 在推送 `v*` 标签时触发，流水线会打包含当前 `package.json` 版本的扩展并用 `vsce` 发布。需要在平台 secrets 中提供 `VSCE_PAT`（VS Code Marketplace 的个人访问令牌）。本地手动发布：

```shell
pnpm run package
pnpm exec vsce publish --packagePath sense-<版本>.vsix
```

发布前请更新 `package.json` 的 `version` 与 `CHANGELOG.md`。

## 许可

Apache-2.0
