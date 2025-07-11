# PinInExplorer

## 功能 / Features

本 VSCode/TRAE/CURSOR 插件 "PinInExplorer" 允许您将常用的文件或文件夹固定到资源管理器的Pins视图中，同时支持代码的书签收藏和导航功能，方便快速访问。具体方法：在文件或文件夹或代码行上右键，选择"Pin"，即可固定到Pins视图中。

The VSCode/TRAE/CURSOR plugin "PinInExplorer" allows you to pin frequently used files or folders to the Pins view in the explorer. It also supports code bookmarking and navigation functions for easy quick access.

Specific method: Right-click on a file, folder, or line of code, and select "Pin" to pin it to the Pins view.

### 主要功能 / Main Features

#### 固定操作 / Pin Operations
- **Pin/Unpin**: 在文件资源管理器中右键文件或文件夹，选择"Toggle Pin"来固定或取消固定项目
- **Pin/Unpin**: Right-click on files or folders in the file explorer and select "Toggle Pin" to pin or unpin items

#### Pins视图中的4个功能按钮 / 4 Function Buttons in Pins View

1. **📂 打开 / Open Button**
   - 功能：直接打开固定的文件或文件夹
   - Function: Directly open the pinned file or folder

2. **⬆️ 上移 / Move Up Button**
   - 功能：将选中的项目在列表中向上移动一位
   - Function: Move the selected item up one position in the list

3. **⬇️ 下移 / Move Down Button**
   - 功能：将选中的项目在列表中向下移动一位
   - Function: Move the selected item down one position in the list

4. **📌 置顶/取消置顶 / Pin to Top/Remove from Top Button**
   - 功能：将项目置顶显示或从置顶位置移除
   - 置顶的项目会显示在列表最前面，并有特殊的图标标识
   - Function: Pin items to the top of the list or remove them from the top position
   - Pinned-to-top items are displayed at the beginning of the list with special icon indicators

### 调试功能 / Debug Features

#### 日志开关 / Logging Toggle

在VSCode设置中可以启用调试日志功能：
You can enable debug logging in VSCode settings:

1. **设置路径 / Settings Path**: 
   - 打开VSCode设置 (Ctrl+,) / Open VSCode Settings (Ctrl+,)
   - 搜索 "pinInExplorer.logging.enabled" / Search for "pinInExplorer.logging.enabled"

2. **功能说明 / Function Description**:
   - 启用后会在输出面板显示详细的操作日志
   - 包括文件固定/取消固定、移动、错误信息等
   - 有助于调试和问题排查
   - When enabled, detailed operation logs will be displayed in the output panel
   - Includes file pin/unpin, move operations, error messages, etc.
   - Helpful for debugging and troubleshooting

3. **使用方法 / Usage**:
   ```json
   {
     "pinInExplorer.logging.enabled": true
   }
   ```

### 其他特性 / Additional Features

#### 自动清理 / Auto Cleanup
- 自动检测并移除已删除的文件或文件夹
- Automatically detect and remove deleted files or folders

#### 状态反馈 / Status Feedback
- 所有操作都有状态栏消息提示
- 操作成功或失败都有相应的图标和文字提示
- All operations provide status bar message feedback
- Success or failure operations have corresponding icons and text prompts

#### 快捷操作 / Quick Operations
- 支持右键菜单快速固定/取消固定
- 支持在Pins视图中直接管理固定项目
- Support right-click menu for quick pin/unpin
- Support direct management of pinned items in the Pins view

#### 持久化存储 / Persistent Storage
- 固定的项目会保存在工作区状态中
- 重启VSCode后固定状态保持不变
- Pinned items are saved in workspace state
- Pin status remains unchanged after restarting VSCode

#### 代码书签 / BookMark
- 在代码行上右键，选择"Toggle Bookmark"来添加或移除书签
- 书签会显示在代码行左侧的行号旁边
- Bookmarks can be added or removed by right-clicking on a line of code and selecting "Toggle Bookmark"
- Bookmarks are displayed next to the line number on the left side of the code line

- 该功能处于开发中，敬请期待
- This feature is under development, please wait for the next release.


## 开发和发布 / Development and Publishing

### 编译项目 / Compile Project
```bash
npm run compile
```

### 监听模式编译 / Watch Mode Compilation
```bash
npm run watch
```

### 代码检查 / Linting
```bash
npm run lint
```

### 打包发布 / Package for Publishing

#### 预发布编译 / Pre-publish Compilation
```bash
npm run vscode:prepublish
```
**说明 / Description:**
- 此命令会编译TypeScript代码到 `out/` 目录
- 生成的文件包括：`extension.js`、`logger.js` 及对应的 `.map` 文件
- 这是发布前的必要步骤，确保代码被正确编译
- This command compiles TypeScript code to the `out/` directory
- Generated files include: `extension.js`, `logger.js` and corresponding `.map` files
- This is a necessary step before publishing to ensure code is properly compiled

#### 安装VSCE工具 / Install VSCE Tool
```bash
npm install -g @vscode/vsce
```
**说明 / Description:**
- VSCE是VSCode扩展的官方命令行工具
- 首次使用需要全局安装此工具
- 如果遇到"vsce命令未找到"错误，请先执行此安装命令
- VSCE is the official command-line tool for VSCode extensions
- First-time users need to install this tool globally
- If you encounter "vsce command not found" error, please run this installation command first

#### 创建安装包 / Create Installation Package
```bash
vsce package
```
**说明 / Description:**
- 此命令会创建 `.vsix` 安装包文件
- 安装包包含所有必要的文件和依赖
- 生成的 `.vsix` 文件可以直接安装到VSCode中
- 也可以发布到VSCode扩展市场
- 注意：publisher字段必须是有效的标识符（如"tonytian"），不能包含特殊字符
- This command creates a `.vsix` installation package file
- The package contains all necessary files and dependencies
- The generated `.vsix` file can be directly installed in VSCode
- It can also be published to the VSCode extension marketplace
- Note: The publisher field must be a valid identifier (like "tonytian"), cannot contain special characters

#### 完整发布流程 / Complete Publishing Process
```bash
# 1. 安装依赖 / Install dependencies
npm install

# 2. 安装VSCE工具（首次使用） / Install VSCE tool (first time only)
npm install -g @vscode/vsce

# 3. 代码检查 / Code linting
npm run lint

# 4. 预发布编译 / Pre-publish compilation
npm run vscode:prepublish

# 5. 创建安装包 / Create package
vsce package
```

### 安装依赖 / Install Dependencies
```bash
npm install
```

### 本地安装测试 / Local Installation Testing
```bash
# 安装生成的.vsix文件 / Install the generated .vsix file
code --install-extension pin-in-explorer-1.1.0.vsix
```

### 常见问题解决 / Troubleshooting

#### 问题1：vsce命令未找到 / Issue 1: vsce command not found
**错误信息 / Error Message:**
```
vsce : 无法将"vsce"项识别为 cmdlet、函数、脚本文件或可运行程序的名称
```

**解决方案 / Solution:**
```bash
npm install -g @vscode/vsce
```

#### 问题2：发布者标识符无效 / Issue 2: Invalid publisher identifier
**错误信息 / Error Message:**
```
ERROR Invalid extension "publisher": "tony.tian" in package.json
```

**解决方案 / Solution:**
- 修改 `package.json` 中的 `publisher` 字段
- 使用有效的标识符，不能包含点号或特殊字符
- 例如：将 `"tony.tian"` 改为 `"tonytian"`
- Modify the `publisher` field in `package.json`
- Use a valid identifier without dots or special characters
- Example: change `"tony.tian"` to `"tonytian"`

#### 问题3：编译输出文件未找到 / Issue 3: Compiled output files not found
**解决方案 / Solution:**
```bash
# 确保先运行编译命令 / Make sure to run compilation first
npm run vscode:prepublish
# 检查out目录是否存在 / Check if out directory exists
ls out/
```

### MIT License
