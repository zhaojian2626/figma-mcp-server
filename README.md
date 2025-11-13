# Figma MCP Server

独立的 Figma MCP (Model Context Protocol) 服务器，将 Figma 自动化工具暴露为 MCP 服务。

## 安装

```bash
cd /Users/altasv/AndroidStudioProjects/figma-mcp-server
npm install
```

## 配置

1. 复制配置文件模板：
```bash
cp config.json.example config.json
```

2. 编辑 `config.json`，填入您的 Figma API 凭证：
```json
{
  "figma": {
    "accessToken": "your-figma-access-token",
    "fileKey": "your-figma-file-key"
  },
  "output": {
    "directory": "output"
  }
}
```

- `accessToken`: Figma API 访问令牌（从 Figma 设置中获取）
- `fileKey`: Figma 文件 ID（从 Figma 文件 URL 中获取）

## 在 Cursor 中配置

在 Cursor 的 MCP 配置文件中添加以下内容：

**macOS**: `~/Library/Application Support/Cursor/User/globalStorage/mcp.json`
**Windows**: `%APPDATA%\Cursor\User\globalStorage\mcp.json`
**Linux**: `~/.config/Cursor/User/globalStorage/mcp.json`

```json
{
  "mcpServers": {
    "figma-automation": {
      "command": "node",
      "args": [
        "/Users/altasv/AndroidStudioProjects/figma-mcp-server/server.js"
      ]
    }
  }
}
```

**注意**: 请将路径替换为实际的服务器路径。

## 可用的 MCP Tools

1. **figma_list_frames** - 列出 Figma 文件中所有可用的页面和顶级 Frame
2. **figma_download_and_simplify** - 从 Figma 获取指定节点的数据并返回简化后的 JSON（不下载图片）
3. **figma_download_images** - 按需下载指定的图片节点，基于 node-id 列表
4. **figma_list_json_files** - 列出所有可用的简化 JSON 文件

## 图片节点识别规则

以下类型的节点会被识别为可下载的图片节点：

1. 节点名称以 `exp_` 开头的节点（导出组，整个节点作为一张图片）
2. 包含图片填充（IMAGE fill）的节点
3. 节点名称以 `ic/` 或 `icon/` 开头的节点（图标节点）

在 `figma_download_and_simplify` 返回的 JSON 中，这些节点会被标记为 `isImageNode: true`。

## 使用流程

1. 调用 `figma_download_and_simplify` 获取 JSON 数据
2. 查找标记了 `isImageNode: true` 的节点
3. 使用这些节点的 ID 调用 `figma_download_images` 下载图片

## 远程部署

如需将服务部署到远程服务器，请参考 [DEPLOYMENT.md](./DEPLOYMENT.md) 文档。

### 快速部署

```bash
# 1. 设置环境变量
export FIGMA_ACCESS_TOKEN="your-figma-access-token"
export FIGMA_FILE_KEY="your-figma-file-key"

# 2. 使用 Docker Compose 部署
docker-compose up -d

# 3. 或使用部署脚本
./deploy.sh docker
```

### HTTP 服务器

启动 HTTP 服务器（用于远程访问）：

```bash
npm run start:http
# 或
node server-http.js
```

服务器将在 `http://localhost:3000` 启动。

## 许可证

MIT

