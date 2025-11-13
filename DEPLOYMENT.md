# Figma MCP Server 部署指南

本文档说明如何将 Figma MCP Server 部署到远程服务器。

## 部署方式

### 方式一：Docker 部署（推荐）

#### 1. 使用 Docker Compose（最简单）

```bash
# 1. 设置环境变量
export FIGMA_ACCESS_TOKEN="your-figma-access-token"
export FIGMA_FILE_KEY="your-figma-file-key"
export PORT=3000

# 2. 启动服务
docker-compose up -d

# 3. 查看日志
docker-compose logs -f

# 4. 停止服务
docker-compose down
```

#### 2. 使用 Docker 命令

```bash
# 1. 构建镜像
docker build -t figma-mcp-server .

# 2. 运行容器
docker run -d \
  --name figma-mcp-server \
  -p 3000:3000 \
  -e FIGMA_ACCESS_TOKEN="your-figma-access-token" \
  -e FIGMA_FILE_KEY="your-figma-file-key" \
  -e NODE_ENV=production \
  -v $(pwd)/output:/app/output \
  --restart unless-stopped \
  figma-mcp-server

# 3. 查看日志
docker logs -f figma-mcp-server
```

### 方式二：直接部署（使用 PM2）

```bash
# 1. 安装 PM2
npm install -g pm2

# 2. 设置环境变量
export FIGMA_ACCESS_TOKEN="your-figma-access-token"
export FIGMA_FILE_KEY="your-figma-file-key"
export PORT=3000

# 3. 启动服务
pm2 start server-http.js --name figma-mcp-server \
  --env NODE_ENV=production \
  --env PORT=3000 \
  --env FIGMA_ACCESS_TOKEN="$FIGMA_ACCESS_TOKEN" \
  --env FIGMA_FILE_KEY="$FIGMA_FILE_KEY"

# 4. 保存 PM2 配置
pm2 save

# 5. 设置开机自启
pm2 startup
```

### 方式三：使用部署脚本

```bash
# 1. 设置环境变量
export FIGMA_ACCESS_TOKEN="your-figma-access-token"
export FIGMA_FILE_KEY="your-figma-file-key"
export PORT=3000

# 2. 运行部署脚本
./deploy.sh

# 或使用 Docker 部署
./deploy.sh docker
```

## 环境变量配置

创建 `.env` 文件（或使用环境变量）：

```bash
FIGMA_ACCESS_TOKEN=your-figma-access-token
FIGMA_FILE_KEY=your-figma-file-key
PORT=3000
NODE_ENV=production
OUTPUT_DIRECTORY=output
```

## 服务器配置

### Nginx 反向代理配置

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Systemd 服务配置（可选）

创建 `/etc/systemd/system/figma-mcp-server.service`:

```ini
[Unit]
Description=Figma MCP Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/figma-mcp-server
Environment="FIGMA_ACCESS_TOKEN=your-token"
Environment="FIGMA_FILE_KEY=your-file-key"
Environment="PORT=3000"
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node server-http.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

启动服务：

```bash
sudo systemctl enable figma-mcp-server
sudo systemctl start figma-mcp-server
sudo systemctl status figma-mcp-server
```

## 测试部署

### 1. 健康检查

```bash
curl -X OPTIONS http://localhost:3000
```

应该返回 200 状态码。

### 2. 测试初始化

```bash
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {}
  }'
```

### 3. 测试工具列表

```bash
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }'
```

### 4. 测试查询页面

```bash
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "figma_list_frames",
      "arguments": {}
    }
  }'
```

## 在 Cursor 中配置远程服务器

如果服务器部署在远程，需要在 Cursor 的 MCP 配置中使用 HTTP 方式连接：

```json
{
  "mcpServers": {
    "figma-server-remote": {
      "url": "http://your-server-ip:3000",
      "headers": {}
    }
  }
}
```

或者使用 HTTPS：

```json
{
  "mcpServers": {
    "figma-server-remote": {
      "url": "https://your-domain.com",
      "headers": {
        "Authorization": "Bearer your-api-key"
      }
    }
  }
}
```

## 安全建议

1. **使用 HTTPS**：在生产环境中使用 HTTPS 加密连接
2. **API 密钥认证**：添加 API 密钥验证（需要修改 server-http.js）
3. **防火墙配置**：只开放必要的端口
4. **环境变量安全**：不要将敏感信息提交到代码仓库
5. **定期更新**：保持依赖包和系统更新

## 监控和日志

### Docker 日志

```bash
docker logs -f figma-mcp-server
```

### PM2 日志

```bash
pm2 logs figma-mcp-server
```

### Systemd 日志

```bash
sudo journalctl -u figma-mcp-server -f
```

## 故障排查

1. **检查端口是否被占用**：
   ```bash
   lsof -i :3000
   ```

2. **检查环境变量**：
   ```bash
   env | grep FIGMA
   ```

3. **检查服务状态**：
   ```bash
   # Docker
   docker ps | grep figma
   
   # PM2
   pm2 status
   
   # Systemd
   sudo systemctl status figma-mcp-server
   ```

4. **查看错误日志**：
   ```bash
   # Docker
   docker logs figma-mcp-server
   
   # PM2
   pm2 logs figma-mcp-server --err
   ```

## 性能优化

1. **使用反向代理**：Nginx 或 Caddy
2. **启用缓存**：对于频繁查询的数据
3. **负载均衡**：多实例部署
4. **资源限制**：Docker 资源限制或 PM2 集群模式

