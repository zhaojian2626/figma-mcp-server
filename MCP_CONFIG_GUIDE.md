# Cursor MCP 配置指南 - IP + 端口方式

## 配置方式说明

Cursor 支持两种方式配置 MCP 服务器：

### 方式一：直接运行命令（本地 stdio 模式）
```json
{
  "mcpServers": {
    "figma-server": {
      "command": "node",
      "args": ["/path/to/server.js"],
      "env": {
        "FIGMA_ACCESS_TOKEN": "your-token",
        "FIGMA_FILE_KEY": "your-file-key"
      }
    }
  }
}
```

### 方式二：HTTP URL 方式（推荐用于远程或本地 HTTP 服务）
```json
{
  "mcpServers": {
    "figma-server": {
      "url": "http://localhost:3000",
      "headers": {}
    }
  }
}
```

## 本地 IP + 端口配置

### 1. 启动 HTTP 服务器

首先确保 HTTP 服务器正在运行：

```bash
cd /Users/altasv/AndroidStudioProjects/figma-mcp-server
FIGMA_ACCESS_TOKEN="your-token" \
FIGMA_FILE_KEY="your-file-key" \
PORT=3000 \
npm run start:http
```

### 2. 获取本地 IP 地址

```bash
# macOS/Linux
ifconfig | grep "inet " | grep -v 127.0.0.1

# 或使用
ipconfig getifaddr en0  # macOS
hostname -I              # Linux
```

### 3. 配置 Cursor MCP

编辑 MCP 配置文件：

**macOS**: `~/Library/Application Support/Cursor/User/globalStorage/mcp.json`  
**Windows**: `%APPDATA%\Cursor\User\globalStorage\mcp.json`  
**Linux**: `~/.config/Cursor/User/globalStorage/mcp.json`

#### 配置示例 1：使用 localhost（仅本机）
```json
{
  "mcpServers": {
    "figma-server": {
      "url": "http://localhost:3000",
      "headers": {}
    }
  }
}
```

#### 配置示例 2：使用本地 IP（局域网访问）
```json
{
  "mcpServers": {
    "figma-server": {
      "url": "http://192.168.50.153:3000",
      "headers": {}
    }
  }
}
```

#### 配置示例 3：使用远程服务器 IP
```json
{
  "mcpServers": {
    "figma-server": {
      "url": "http://your-server-ip:3000",
      "headers": {}
    }
  }
}
```

#### 配置示例 4：使用 HTTPS（生产环境）
```json
{
  "mcpServers": {
    "figma-server": {
      "url": "https://your-domain.com",
      "headers": {
        "Authorization": "Bearer your-api-key"
      }
    }
  }
}
```

## 完整配置示例

```json
{
  "_comment": "配置 Figma 和飞书文档的 MCP 服务",
  "mcpServers": {
    "feishu_service": {
      "url": "https://android-hz-platform.etm.tech/feishu-mcp/mcp"
    },
    "Figma": {
      "url": "https://anycross.feishu.cn/mcp/figma/stream?key=xxx"
    },
    "figma-server": {
      "url": "http://localhost:3000",
      "headers": {}
    },
    "figma-server-remote": {
      "url": "http://192.168.50.153:3000",
      "headers": {}
    }
  }
}
```

## 配置说明

### URL 格式
- **本地**: `http://localhost:3000` 或 `http://127.0.0.1:3000`
- **局域网**: `http://192.168.x.x:3000`（使用你的本地 IP）
- **远程**: `http://your-server-ip:3000` 或 `https://your-domain.com`

### Headers（可选）
如果需要认证，可以在 headers 中添加：
```json
{
  "url": "http://localhost:3000",
  "headers": {
    "Authorization": "Bearer your-api-key",
    "X-API-Key": "your-key"
  }
}
```

## 测试配置

### 1. 测试服务器是否运行
```bash
curl http://localhost:3000 -X OPTIONS
```

### 2. 测试 MCP 初始化
```bash
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

### 3. 重启 Cursor
修改配置后，需要完全退出并重启 Cursor 才能生效。

## 常见问题

### Q: 为什么使用 IP + 端口方式？
A: 
- 可以远程访问服务器
- 多个客户端可以共享同一个服务器
- 更容易管理和监控
- 支持负载均衡

### Q: localhost 和 IP 地址的区别？
A:
- `localhost` 或 `127.0.0.1`: 仅本机访问
- `192.168.x.x`: 局域网内其他设备可以访问
- 远程 IP: 可以从任何地方访问（需要防火墙配置）

### Q: 如何查看服务器是否运行？
A:
```bash
# 检查端口
lsof -i :3000

# 测试连接
curl http://localhost:3000 -X OPTIONS
```

### Q: 配置后无法连接？
A:
1. 确认服务器正在运行
2. 确认端口号正确
3. 确认防火墙允许访问
4. 重启 Cursor
5. 查看 Cursor 的日志输出

## 安全建议

1. **本地开发**: 使用 `localhost` 或 `127.0.0.1`
2. **局域网**: 确保网络安全，考虑添加认证
3. **远程服务器**: 
   - 使用 HTTPS
   - 添加 API 密钥认证
   - 配置防火墙规则
   - 使用反向代理（Nginx）

## 当前配置状态

- ✅ HTTP 服务器已创建 (`server-http.js`)
- ✅ 默认端口: 3000
- ✅ 支持 CORS
- ✅ 支持环境变量配置
- ✅ 配置文件已更新

## 下一步

1. 启动 HTTP 服务器: `npm run start:http`
2. 更新 Cursor MCP 配置为 URL 方式
3. 重启 Cursor
4. 测试 MCP 工具是否可用

