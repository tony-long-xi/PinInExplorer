<div align="center">

# PinInExplorer Development & Release Guide

[**English**](#english) · [简体中文](#简体中文)

</div>

---

## English

### 1. Prerequisites

| Tool | Requirement | Notes |
|---|---|---|
| Node.js | >= 18 | Required to compile TypeScript |
| npm | >= 9 | Installed with Node.js |
| Git | Any version | Optional, for version control |
| VS Code | >= 1.75 | Matches the `engines` field in `package.json` |

### 2. Install Dependencies

```bash
npm install
```

- Must be run after cloning the repository for the first time.
- Creates the `node_modules` directory.

### 3. Build & Lint

| Command | Purpose |
|---|---|
| `npm run compile` | Compile TypeScript into the `out/` directory |
| `npm run watch` | Incremental watch compilation (for development) |
| `npm run lint` | Run ESLint checks |
| `npm run pretest` | Compile + lint (test prerequisite) |

```bash
npm run compile
npm run lint
```

- The extension entry point is `./out/extension.js` (see the `main` field in `package.json`); the compiled output must exist before publishing.

### 4. Debug Logging

Enable detailed logging in VS Code settings to troubleshoot issues:

1. Open VS Code Settings (`Ctrl+,`) and search for `pinInExplorer.logging.enabled`.
2. When enabled, operation logs (pin/unpin, move, errors, etc.) are shown in the Output panel.
3. Example:

   ```json
   {
     "pinInExplorer.logging.enabled": true
   }
   ```

### 5. Install the VSCE Tool

VSCE (VS Code Extension Manager) is Microsoft's official tool for packaging and publishing extensions.

**Option 1: Global install (recommended)**

```bash
npm install -g @vscode/vsce
```

**Option 2: Run on the fly (no install)**

```bash
npx @vscode/vsce package
```

> Note: the current package name is `@vscode/vsce`; the legacy `vsce` package is deprecated.

### 6. Package into a .vsix

```bash
vsce package
```

- `vscode:prepublish` (i.e. `npm run compile`) is automatically executed before packaging, so `out/` is always up to date.
- By default it produces `pin-in-explorer-<version>.vsix` (e.g. `pin-in-explorer-1.3.0.vsix`).
- The version comes from the `version` field in `package.json`.
- Note: The publisher field must be a valid identifier (like `tonytian`), without special characters.

**Useful Options**

| Option | Description |
|---|---|
| `--out <path>` | Specify the output path |
| `--baseContentUrl <url>` | Set the base URL for relative links in README/CHANGELOG |
| `--baseImagesUrl <url>` | Set the base URL for relative image links |

```bash
# Example: output to a specific directory
vsce package --out dist/
```

**What Goes Into the Package**

The `.vscodeignore` file controls what is excluded from the package (currently excludes `src/`, `node_modules/`, `tsconfig.json`, etc.):

- The package only contains the compiled `out/` output, `images/`, `package.json`, `README.md`, `LICENSE` and other necessary files.
- If you add static assets that must ship with the release, check `.vscodeignore` so they are not accidentally excluded.

### 7. Local Install & Test

**Option 1: Install the .vsix file**

```bash
code --install-extension pin-in-explorer-1.3.0.vsix
```

- Or: Extensions view → `...` → Install from VSIX…

**Option 2: Debug in Extension Host (F5)**

- Open the project in VS Code and press `F5` to launch the Extension Development Host for live debugging without packaging.

### 8. Publish to the Marketplace

#### 8.1 Create a Personal Access Token (PAT)

1. Open Azure DevOps: https://dev.azure.com and sign in with the account bound to the publisher.
2. Go to **User settings → Personal Access Tokens → New Token**.
3. Configure: Organization = `All accessible organizations` (or the organization owning the publisher); Scope = **Marketplace → Manage**.
4. Copy the generated token (shown only once; save it securely).

#### 8.2 Log in as Publisher

```bash
vsce login tonytian
```

- Paste the PAT when prompted.
- Credentials are stored in `~/.vsce/` and persist across sessions.

#### 8.3 Publish

```bash
# Publish with the current version
vsce publish

# Publish and auto-bump patch version (1.3.0 → 1.3.1)
vsce publish patch

# Publish and auto-bump minor version (1.3.x → 1.4.0)
vsce publish minor

# Publish and auto-bump major version (1.x.y → 2.0.0)
vsce publish major
```

- `vsce publish` runs: pre-publish compilation → packaging → upload to the Marketplace.
- Publishing fails if the version already exists on the Marketplace; bump the version and retry.

#### 8.4 Other Useful Modes

```bash
# Pass the token via environment variable (common in CI)
$env:VSCE_PAT = "<your-pat>"
vsce publish

# Publish a pre-built .vsix
vsce publish --packagePath pin-in-explorer-1.3.1.vsix
```

### 9. End-to-End Example

```bash
# 1. Install dependencies
npm install

# 2. Lint
npm run lint

# 3. Compile
npm run compile

# 4. Package
vsce package

# 5. Verify locally
code --install-extension pin-in-explorer-1.3.1.vsix

# 6. Log in as publisher (first time)
vsce login tonytian

# 7. Publish with version bump
vsce publish patch
```

### 10. Troubleshooting

**Issue 1: `vsce` command not found**

```
vsce : 无法将"vsce"项识别为 cmdlet、函数、脚本文件或可运行程序的名称
```

Solution:

```bash
npm install -g @vscode/vsce
# Or use npx:
npx @vscode/vsce package
```

**Issue 2: Login failure or 401 when publishing**

- Make sure the PAT scope includes **Marketplace → Manage**.
- Make sure the token's organization matches the publisher; re-run `vsce login tonytian`.
- Make sure the `publisher` field in `package.json` exactly matches the registered publisher ID.

**Issue 3: Version already exists**

```
Extension with id ... already exists
```

Solution: bump the version and publish again:

```bash
vsce publish patch
```

**Issue 4: Compiled output missing**

Solution:

```bash
npm run compile
ls out/
```

### 11. References

- [VS Code Marketplace](https://marketplace.visualstudio.com/)
- [VSCE Documentation (Microsoft)](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [Extension Packaging Guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#packaging-extensions)

---

## 简体中文

### 1. 环境要求

| 工具 | 要求 | 说明 |
|---|---|---|
| Node.js | >= 18 | 编译 TypeScript 需要 |
| npm | >= 9 | 随 Node.js 安装 |
| Git | 任意版本 | 可选，用于版本管理 |
| VS Code | >= 1.75 | 与 `package.json` 中 `engines` 一致 |

### 2. 安装依赖

```bash
npm install
```

- 首次克隆仓库后必须执行。
- 生成 `node_modules` 目录。

### 3. 编译与代码检查

| 命令 | 用途 |
|---|---|
| `npm run compile` | 编译 TypeScript 到 `out/` 目录 |
| `npm run watch` | 监听模式增量编译（开发时使用） |
| `npm run lint` | ESLint 代码检查 |
| `npm run pretest` | 编译 + 检查（测试前置） |

```bash
npm run compile
npm run lint
```

- 扩展入口为 `./out/extension.js`（见 `package.json` 的 `main` 字段），发布前必须确保编译产物存在。

### 4. 调试日志

在 VS Code 设置中启用详细日志，便于排查问题：

1. 打开 VS Code 设置（`Ctrl+,`），搜索 `pinInExplorer.logging.enabled`。
2. 启用后，操作日志（固定/取消固定、移动、错误等）会显示在输出面板中。
3. 示例：

   ```json
   {
     "pinInExplorer.logging.enabled": true
   }
   ```

### 5. 安装 VSCE 工具

VSCE（VS Code Extension Manager）是微软官方的扩展打包/发布工具。

**方式一：全局安装（推荐）**

```bash
npm install -g @vscode/vsce
```

**方式二：临时使用（无需安装）**

```bash
npx @vscode/vsce package
```

> 注意：新版包名为 `@vscode/vsce`，旧版 `vsce` 已弃用。

### 6. 打包生成 .vsix

```bash
vsce package
```

- 运行前会自动执行 `vscode:prepublish`（即 `npm run compile`），确保 `out/` 是最新产物。
- 默认生成 `pin-in-explorer-<version>.vsix`（如 `pin-in-explorer-1.3.0.vsix`）。
- 版本号取自 `package.json` 的 `version` 字段。
- 注意：publisher 字段必须是有效的标识符（如 `tonytian`），不能包含特殊字符。

**常用参数**

| 参数 | 说明 |
|---|---|
| `--out <path>` | 指定输出路径 |
| `--baseContentUrl <url>` | 设置 README/CHANGELOG 中相对链接的基础 URL |
| `--baseImagesUrl <url>` | 设置图片相对链接的基础 URL |

```bash
# 示例：输出到指定目录
vsce package --out dist/
```

**打包内容控制**

`.vscodeignore` 文件控制打包时排除的内容（当前已排除 `src/`、`node_modules/`、`tsconfig.json` 等）：

- 打包只包含 `out/` 编译产物、`images/`、`package.json`、`README.md`、`LICENSE` 等必要文件。
- 若新增了发布时需要包含的静态资源，请同步检查 `.vscodeignore`，避免被误排除。

### 7. 本地安装与测试

**方式一：安装 .vsix 文件**

```bash
code --install-extension pin-in-explorer-1.3.0.vsix
```

- 或：扩展面板 → `...` → 从 VSIX 安装…

**方式二：扩展宿主调试（F5）**

- 在 VS Code 中打开项目，按 `F5` 启动扩展开发宿主，直接调试最新源码，无需打包。

### 8. 发布到扩展市场

#### 8.1 准备 Personal Access Token (PAT)

1. 打开 Azure DevOps：https://dev.azure.com ，登录与发布者绑定的账号。
2. 进入 **User settings → Personal Access Tokens → New Token**。
3. 配置：Organization 选择 `All accessible organizations`（或发布者所属组织）；Scope 选择 **Marketplace → Manage**。
4. 复制生成的 token（仅显示一次，请妥善保存）。

#### 8.2 登录发布者

```bash
vsce login tonytian
```

- 按提示粘贴上一步的 PAT。
- 登录信息保存在 `~/.vsce/`，无需重复登录。

#### 8.3 发布

```bash
# 以当前版本号发布
vsce publish

# 发布并自动递增补丁版本（1.3.0 → 1.3.1）
vsce publish patch

# 发布并自动递增次要版本（1.2.x → 1.3.0）
vsce publish minor

# 发布并自动递增主版本（1.x.y → 2.0.0）
vsce publish major
```

- `vsce publish` 会依次执行：预发布编译 → 打包 → 上传市场。
- 版本号在市场上已存在时会报错；递增版本后重试即可。

#### 8.4 其他常用方式

```bash
# 通过环境变量传入 token（CI 环境常用）
$env:VSCE_PAT = "<your-pat>"
vsce publish

# 直接发布已打包好的 .vsix
vsce publish --packagePath pin-in-explorer-1.3.1.vsix
```

### 9. 完整发布流程示例

```bash
# 1. 安装依赖
npm install

# 2. 代码检查
npm run lint

# 3. 编译
npm run compile

# 4. 打包
vsce package

# 5. 本地验证
code --install-extension pin-in-explorer-1.3.1.vsix

# 6. 登录发布者（首次）
vsce login tonytian

# 7. 发布并递增版本
vsce publish patch
```

### 10. 常见问题

**问题 1：`vsce` 命令未找到**

```
vsce : 无法将"vsce"项识别为 cmdlet、函数、脚本文件或可运行程序的名称
```

解决：

```bash
npm install -g @vscode/vsce
# 或使用 npx：
npx @vscode/vsce package
```

**问题 2：发布时提示登录失败或 401**

- 确认 PAT 的 Scope 包含 **Marketplace → Manage**。
- 确认 PAT 所属组织与发布者匹配；重新执行 `vsce login tonytian`。
- 确认 `package.json` 的 `publisher` 与市场注册的发布者 ID 完全一致。

**问题 3：版本号已存在**

```
Extension with id ... already exists
```

解决：递增版本号后再发布：

```bash
vsce publish patch
```

**问题 4：编译输出缺失**

解决：

```bash
npm run compile
ls out/
```

### 11. 参考

- [VS Code 扩展市场](https://marketplace.visualstudio.com/)
- [VSCE 文档（微软官方）](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [扩展打包指南](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#packaging-extensions)
