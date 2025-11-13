# 部署到远程服务器 - 修改总结

## 已完成的修改

### 1. 创建 HTTP 服务器版本
- **文件**: `server-http.js`
- **功能**: 将 MCP 服务器转换为 HTTP 服务，支持远程访问
- **端口**: 默认 3000（可通过环境变量 PORT 配置）

### 2. 修改 server.js
- **修改**: 导出 `FigmaMCPServer` 类供 HTTP 服务器使用
- **保持**: stdio 模式仍然可用（本地 Cursor 使用）

### 3. 创建 Docker 相关文件
- **Dockerfile**: 容器化部署配置
- **docker-compose.yml**: Docker Compose 配置
- **.dockerignore**: Docker 构建忽略文件

### 4. 创建部署脚本
- **deploy.sh**: 自动化部署脚本
  - 支持 Docker 部署
  - 支持 PM2 部署
  - 支持直接运行

### 5. 更新 package.json
- 添加新的 npm 脚本：
  - `npm run start:http` - 启动 HTTP 服务器
  - `npm run dev` - 开发模式（HTTP）
  - `npm run docker:build` - 构建 Docker 镜像
  - `npm run docker:run` - 运行 Docker Compose
  - `npm run docker:stop` - 停止 Docker Compose

### 6. 创建部署文档
- **DEPLOYMENT.md**: 详细的部署指南
- **README.md**: 更新了远程部署说明

## 部署方式选择

### 方式一：Docker 部署（推荐）
```bash
# 设置环境变量
export FIGMA_ACCESS_TOKEN="your-token"
export FIGMA_FILE_KEY="your-file-key"

# 使用 Docker Compose
docker-compose up -d

# 或使用部署脚本
./deploy.sh docker
```

### 方式二：PM2 部署
```bash
# 安装 PM2
npm install -g pm2

# 设置环境变量
export FIGMA_ACCESS_TOKEN="your-token"
export FIGMA_FILE_KEY="your-file-key"

# 启动
pm2 start server-http.js --name figma-mcp-server \
  --env FIGMA_ACCESS_TOKEN="$FIGMA_ACCESS_TOKEN" \
  --env FIGMA_FILE_KEY="$FIGMA_FILE_KEY"
```

### 方式三：直接运行
```bash
# 设置环境变量
export FIGMA_ACCESS_TOKEN="your-token"
export FIGMA_FILE_KEY="your-file-key"
export PORT=3000

# 启动
npm run start:http
```

## 环境变量配置

必须设置的环境变量：
- `FIGMA_ACCESS_TOKEN`: Figma API 访问令牌
- `FIGMA_FILE_KEY`: Figma 文件 ID

可选环境变量：
- `PORT`: 服务器端口（默认 3000）
- `NODE_ENV`: 运行环境（production/development）
- `OUTPUT_DIRECTORY`: 输出目录（默认 output）

## 在 Cursor 中配置远程服务器

如果服务器部署在远程，在 Cursor 的 MCP 配置中使用 HTTP URL：

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

## 测试部署

```bash
# 1. 健康检查
curl -X OPTIONS http://localhost:3000

# 2. 测试初始化
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'

# 3. 测试工具列表
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

## 安全建议

1. **使用 HTTPS**: 在生产环境使用 HTTPS
2. **API 认证**: 考虑添加 API 密钥验证
3. **防火墙**: 只开放必要端口
4. **环境变量**: 不要将敏感信息提交到代码仓库

## 文件清单

新增文件：
- `server-http.js` - HTTP 服务器
- `Dockerfile` - Docker 镜像配置
- `docker-compose.yml` - Docker Compose 配置
- `.dockerignore` - Docker 忽略文件
- `deploy.sh` - 部署脚本
- `DEPLOYMENT.md` - 部署文档
- `DEPLOYMENT_SUMMARY.md` - 本文件

修改文件：
- `server.js` - 导出类供 HTTP 服务器使用
- `package.json` - 添加新的 npm 脚本
- `README.md` - 添加远程部署说明

## 下一步

1. 将代码推送到 Git 仓库
2. 在远程服务器上克隆代码
3. 设置环境变量
4. 运行部署脚本或使用 Docker
5. 配置 Nginx 反向代理（可选）
6. 在 Cursor 中配置远程服务器 URL

