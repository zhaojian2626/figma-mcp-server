# 迁移说明

MCP 服务器代码已从项目中独立出来，现在位于独立的目录中。

## 新位置

MCP 服务器现在位于：`/Users/altasv/AndroidStudioProjects/figma-mcp-server/`

## 迁移步骤

1. **安装依赖**：
```bash
cd /Users/altasv/AndroidStudioProjects/figma-mcp-server
npm install
```

2. **配置**：
```bash
cp config.json.example config.json
# 编辑 config.json，填入您的 Figma API 凭证
```

3. **更新 Cursor 配置**：
在 Cursor 的 MCP 配置文件中，更新服务器路径为：
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

4. **重启 Cursor** 以使配置生效

## 已删除的文件

以下文件已从项目中删除（已移至独立项目）：
- `scripts/figma/mcp-server.js`
- `scripts/figma/MCP_DEPLOYMENT.md`
- `scripts/figma/README_MCP.md`
- `scripts/figma/start-mcp.sh`
- `scripts/figma/.cursor-mcp-config.example.json`

## 项目结构

独立项目包含：
- `server.js` - MCP 服务器主文件
- `figma-api.js` - Figma API 客户端
- `downloader.js` - 数据下载和简化逻辑
- `package.json` - 项目配置
- `config.json.example` - 配置文件模板
- `README.md` - 使用说明

