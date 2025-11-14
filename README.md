# Figma MCP Server

独立的 Figma MCP (Model Context Protocol) 服务器，将 Figma 自动化工具暴露为 MCP 服务。支持本地 stdio 模式和远程 HTTP 模式部署。

## ✨ 功能特性

- 🔌 **双模式支持**：stdio 模式（本地）和 HTTP 模式（远程）
- 🎨 **Figma 集成**：完整的 Figma API 集成
- 🖼️ **智能图片识别**：自动识别可下载的图片节点
- 🐳 **Docker 支持**：容器化部署
- 🔐 **多种认证方式**：支持环境变量、配置文件、HTTP Headers
- 📦 **简化数据**：自动简化 Figma 节点数据
- 🚀 **易于部署**：提供多种部署方式

## 📋 目录

- [安装](#安装)
- [配置](#配置)
- [部署方式](#部署方式)
- [Cursor MCP 配置](#cursor-mcp-配置)
- [可用的 MCP Tools](#可用的-mcp-tools)
- [使用示例](#使用示例)
- [部署指南](#部署指南)
- [常见问题](#常见问题)

## 🚀 安装

### 前置要求

- Node.js >= 16.0.0
- npm 或 yarn
- Figma API Access Token

### 安装步骤

```bash
# 克隆仓库
git clone https://github.com/zhaojian2626/figma-mcp-server.git
cd figma-mcp-server

# 安装依赖
npm install
```

## ⚙️ 配置

### 方式一：配置文件（推荐用于本地开发）

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

**获取 Figma API 凭证**：
- `accessToken`: 访问 [Figma Settings](https://www.figma.com/settings) → Personal access tokens 创建
- `fileKey`: 从 Figma 文件 URL 获取，例如 `https://www.figma.com/file/XXXXX/文件名` 中的 `XXXXX`

### 方式二：环境变量（推荐用于生产环境）

```bash
export FIGMA_ACCESS_TOKEN="your-figma-access-token"
export FIGMA_FILE_KEY="your-figma-file-key"
export PORT=3000  # HTTP 服务器端口（可选）
```

### 方式三：HTTP Headers（用于远程访问）

在 Cursor MCP 配置中使用 HTTP Headers 传递凭证（见下方配置说明）。

### 配置优先级

服务器按以下优先级读取凭证：
1. **HTTP Headers** (`X-Figma-Access-Token`, `X-Figma-File-Key`)
2. **环境变量** (`FIGMA_ACCESS_TOKEN`, `FIGMA_FILE_KEY`)
3. **配置文件** (`config.json`)

## 🚢 部署方式

### 方式一：stdio 模式（本地 Cursor 使用）

直接运行服务器，通过标准输入输出与 Cursor 通信：

```bash
npm start
# 或
node server.js
```

### 方式二：HTTP 模式（远程访问）

启动 HTTP 服务器，支持远程访问：

```bash
node server-http.js
```

服务器将在 `http://localhost:3000` 启动（可通过 `PORT` 环境变量修改）。

## 🔧 Cursor MCP 配置

### 配置方式一：stdio 模式（本地）

在 Cursor 的 MCP 配置文件中添加：

**配置文件位置**：
- **macOS**: `~/Library/Application Support/Cursor/User/globalStorage/mcp.json`
- **Windows**: `%APPDATA%\Cursor\User\globalStorage\mcp.json`
- **Linux**: `~/.config/Cursor/User/globalStorage/mcp.json`

```json
{
  "mcpServers": {
    "figma-server": {
      "command": "node",
      "args": [
        "/path/to/figma-mcp-server/server.js"
      ],
      "env": {
        "FIGMA_ACCESS_TOKEN": "your-figma-access-token",
        "FIGMA_FILE_KEY": "your-figma-file-key"
      }
    }
  }
}
```

### 配置方式二：HTTP URL 模式（远程或本地 HTTP）

#### 使用 localhost（仅本机）

```json
{
  "mcpServers": {
    "figma-server": {
      "url": "http://localhost:3000",
      "headers": {
        "X-Figma-Access-Token": "your-figma-access-token",
        "X-Figma-File-Key": "your-figma-file-key"
      }
    }
  }
}
```

#### 使用本地 IP（局域网访问）

```json
{
  "mcpServers": {
    "figma-server": {
      "url": "http://192.168.x.x:3000",
      "headers": {
        "X-Figma-Access-Token": "your-figma-access-token",
        "X-Figma-File-Key": "your-figma-file-key"
      }
    }
  }
}
```

#### 使用远程服务器

```json
{
  "mcpServers": {
    "figma-server": {
      "url": "http://your-server-ip:3000",
      "headers": {
        "X-Figma-Access-Token": "your-figma-access-token",
        "X-Figma-File-Key": "your-figma-file-key"
      }
    }
  }
}
```

**注意**：
- 如果服务器已配置环境变量或配置文件，可以省略 `headers` 中的凭证
- 修改配置后需要**完全退出并重启 Cursor** 才能生效

### 完整配置示例

```json
{
  "_comment": "Figma MCP Server 配置",
  "mcpServers": {
    "figma-server": {
      "url": "http://localhost:3000",
      "headers": {
        "X-Figma-Access-Token": "figd_xxxxx",
        "X-Figma-File-Key": "xxxxx"
      }
    }
  }
}
```

## 🛠️ 可用的 MCP Tools

### 1. `figma_list_frames`

列出 Figma 文件中所有可用的页面和顶级 Frame。

**参数**：无

**返回**：
```json
[
  {
    "pageId": "0:1",
    "pageName": "Page 1",
    "frames": [
      {
        "id": "2370:65",
        "name": "Frame Name"
      }
    ]
  }
]
```

### 2. `figma_download_and_simplify`

从 Figma 获取指定节点（Page 或 Frame）的数据并返回简化后的 JSON（不下载图片）。

**参数**：
- `nodeId` (string, 必需): Figma 节点 ID（Page ID 或 Frame ID）

**返回**：简化后的节点数据，包含 `isImageNode` 标记

### 3. `figma_download_images`

按需下载指定的图片节点，基于 node-id 列表。

**参数**：
- `nodeIds` (array, 必需): 要下载的图片节点 ID 列表

**返回**：下载结果，包含文件路径和状态

### 4. `figma_list_json_files`

列出所有可用的简化 JSON 文件。

**参数**：无

**返回**：JSON 文件列表和图片文件列表

## 📖 使用示例

### 基本使用流程

1. **查询页面和 Frame**：
   ```
   使用 figma_list_frames 获取所有页面和 Frame
   ```

2. **获取节点数据**：
   ```
   使用 figma_download_and_simplify 获取指定 Frame 的简化数据
   查找标记了 isImageNode: true 的节点
   ```

3. **下载图片**：
   ```
   使用 figma_download_images 下载标记的图片节点
   ```

### 图片节点识别规则

以下类型的节点会被自动识别为可下载的图片节点：

1. **导出组**：节点名称以 `exp_` 开头（整个节点作为一张图片）
2. **图片填充**：包含图片填充（IMAGE fill）的节点
3. **图标节点**：节点名称以 `ic/` 或 `icon/` 开头的节点

在 `figma_download_and_simplify` 返回的 JSON 中，这些节点会被标记为 `isImageNode: true`。

## 📚 部署指南

详细的部署指南请参考：

- [DEPLOYMENT.md](./DEPLOYMENT.md) - 完整的部署文档
- [DEPLOYMENT_SUMMARY.md](./DEPLOYMENT_SUMMARY.md) - 部署修改总结
- [MCP_CONFIG_GUIDE.md](./MCP_CONFIG_GUIDE.md) - MCP 配置详细指南

### 快速部署检查清单

- [ ] 安装 Node.js >= 16.0.0
- [ ] 安装依赖：`npm install`
- [ ] 配置 Figma 凭证（环境变量或配置文件）
- [ ] 启动服务器（stdio 或 HTTP 模式）
- [ ] 配置 Cursor MCP
- [ ] 重启 Cursor
- [ ] 测试连接

## 🧪 测试

### 测试 HTTP 服务器

```bash
# 健康检查
curl -X OPTIONS http://localhost:3000

# 测试初始化
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'

# 测试工具列表
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

### 测试查询页面

```bash
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -H "X-Figma-Access-Token: your-token" \
  -H "X-Figma-File-Key: your-file-key" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"figma_list_frames","arguments":{}}}'
```

## ❓ 常见问题

### Q: 如何获取 Figma Access Token？

A: 
1. 访问 https://www.figma.com/settings
2. 找到 "Personal access tokens" 部分
3. 点击 "Create new token"
4. 复制生成的 token

### Q: 如何获取 Figma File Key？

A: 
1. 打开 Figma 文件
2. 从 URL 中获取：`https://www.figma.com/file/XXXXX/文件名`
3. `XXXXX` 就是 fileKey

### Q: stdio 模式和 HTTP 模式有什么区别？

A:
- **stdio 模式**：通过标准输入输出通信，适合本地 Cursor 使用
- **HTTP 模式**：通过 HTTP 请求通信，支持远程访问和多个客户端

### Q: 配置后无法连接？

A: 检查以下几点：
1. 服务器是否正在运行
2. 端口是否正确
3. 凭证是否正确配置
4. 防火墙是否允许访问
5. 是否已重启 Cursor

### Q: 如何查看服务器日志？

A:
- **直接运行**：查看终端输出
- **Docker**：`docker logs figma-mcp-server`
- **PM2**：`pm2 logs figma-mcp-server`

### Q: 支持多个 Figma 文件吗？

A: 当前版本每个服务器实例支持一个 fileKey。如需支持多个文件，可以：
1. 运行多个服务器实例（不同端口）
2. 在 Cursor 中配置多个 MCP 服务器

## 📝 开发

### 项目结构

```
figma-mcp-server/
├── server.js              # stdio 模式服务器
├── server-http.js         # HTTP 模式服务器
├── figma-api.js           # Figma API 客户端
├── downloader.js          # 数据下载和简化逻辑
├── config.json.example    # 配置文件模板
├── Dockerfile             # Docker 镜像配置
├── docker-compose.yml     # Docker Compose 配置
├── deploy.sh              # 部署脚本
└── README.md              # 本文档
```

### 可用脚本

```bash
npm start          # 启动 stdio 模式服务器
npm run start:http # 启动 HTTP 模式服务器
npm run dev        # 开发模式（HTTP）
npm run docker:build # 构建 Docker 镜像
npm run docker:run   # 运行 Docker Compose
npm run docker:stop  # 停止 Docker Compose
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 🔗 相关文档

- [部署指南](./DEPLOYMENT.md)
- [MCP 配置指南](./MCP_CONFIG_GUIDE.md)
- [测试报告](./TEST_REPORT.md)
- [GitHub 设置指南](./GITHUB_SETUP.md)

## 📞 支持

如有问题，请：
1. 查看 [常见问题](#常见问题)
2. 查看相关文档
3. 提交 [Issue](https://github.com/zhaojian2626/figma-mcp-server/issues)

---

**注意**：请妥善保管您的 Figma Access Token，不要将其提交到代码仓库。
