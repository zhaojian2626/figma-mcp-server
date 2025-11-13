#!/bin/bash

# Figma MCP Server 部署脚本

set -e

echo "🚀 开始部署 Figma MCP Server..."

# 检查环境变量
if [ -z "$FIGMA_ACCESS_TOKEN" ] || [ -z "$FIGMA_FILE_KEY" ]; then
    echo "❌ 错误: 请设置环境变量 FIGMA_ACCESS_TOKEN 和 FIGMA_FILE_KEY"
    exit 1
fi

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js，请先安装 Node.js"
    exit 1
fi

# 安装依赖
echo "📦 安装依赖..."
npm install --production

# 创建输出目录
mkdir -p output/images/downloads

# 检查是否使用 Docker
if command -v docker &> /dev/null && [ "$1" == "docker" ]; then
    echo "🐳 使用 Docker 部署..."
    
    # 构建镜像
    docker build -t figma-mcp-server .
    
    # 运行容器
    docker run -d \
        --name figma-mcp-server \
        -p ${PORT:-3000}:3000 \
        -e FIGMA_ACCESS_TOKEN="$FIGMA_ACCESS_TOKEN" \
        -e FIGMA_FILE_KEY="$FIGMA_FILE_KEY" \
        -e NODE_ENV=production \
        -v "$(pwd)/output:/app/output" \
        --restart unless-stopped \
        figma-mcp-server
    
    echo "✅ Docker 容器已启动"
    echo "📝 查看日志: docker logs -f figma-mcp-server"
else
    echo "📝 使用 Node.js 直接运行..."
    
    # 使用 PM2 或直接运行
    if command -v pm2 &> /dev/null; then
        echo "🔄 使用 PM2 管理进程..."
        pm2 start server-http.js --name figma-mcp-server \
            --env NODE_ENV=production \
            --env PORT=${PORT:-3000} \
            --env FIGMA_ACCESS_TOKEN="$FIGMA_ACCESS_TOKEN" \
            --env FIGMA_FILE_KEY="$FIGMA_FILE_KEY"
        pm2 save
        echo "✅ PM2 进程已启动"
        echo "📝 查看日志: pm2 logs figma-mcp-server"
    else
        echo "⚠️  未找到 PM2，直接运行服务器（按 Ctrl+C 停止）..."
        PORT=${PORT:-3000} \
        FIGMA_ACCESS_TOKEN="$FIGMA_ACCESS_TOKEN" \
        FIGMA_FILE_KEY="$FIGMA_FILE_KEY" \
        NODE_ENV=production \
        node server-http.js
    fi
fi

echo "✅ 部署完成！"
echo "🌐 服务器地址: http://localhost:${PORT:-3000}"

