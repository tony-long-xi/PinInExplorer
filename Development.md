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


#### 安装VSCE工具 / Install VSCE Tool
```bash
npm install -g @vscode/vsce
```


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
code --install-extension pin-in-explorer-x.x.x.vsix
```

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

#### 问题2：编译输出文件未找到 / Issue 2: Compiled output files not found
**解决方案 / Solution:**
```bash
# 确保先运行编译命令 / Make sure to run compilation first
npm run vscode:prepublish
# 检查out目录是否存在 / Check if out directory exists
ls out/
```