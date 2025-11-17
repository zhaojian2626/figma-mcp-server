#!/usr/bin/env node

/**
 * Figma MCP Server - HTTP 版本
 * 将 Figma 自动化工具暴露为 HTTP 服务，支持远程访问
 */

import http from 'http';
import { FigmaMCPServer } from './server.js';

class FigmaMCPHTTPServer {
    constructor(port = 3001) {
        this.port = port || process.env.PORT || 3001;
        this.mcpServer = new FigmaMCPServer();
    }

    async handleRequest(req, res) {
        // 设置 CORS 头
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Figma-Access-Token, X-Figma-File-Key');

        // 处理 OPTIONS 请求
        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        // 只处理 POST 请求
        if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                jsonrpc: '2.0',
                error: {
                    code: -32600,
                    message: 'Method not allowed. Only POST requests are supported.'
                }
            }));
            return;
        }

        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', async () => {
            try {
                const request = JSON.parse(body);
                
                // 从 HTTP headers 中提取凭证（如果提供）
                // 支持 X-Figma-Access-Token 和 X-Figma-File-Key headers
                const headerToken = req.headers['x-figma-access-token'];
                const headerFileKey = req.headers['x-figma-file-key'];
                
                // 如果 headers 中提供了凭证，添加到 mcp_config 中
                if (headerToken || headerFileKey) {
                    if (!request.params) {
                        request.params = {};
                    }
                    if (!request.params.mcp_config) {
                        request.params.mcp_config = {};
                    }
                    if (headerToken) {
                        request.params.mcp_config.accessToken = headerToken;
                    }
                    if (headerFileKey) {
                        request.params.mcp_config.fileKey = headerFileKey;
                    }
                }
                
                // 处理请求
                const response = await this.mcpServer.handleRequest(request);
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(response));
            } catch (error) {
                console.error('Error handling request:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    jsonrpc: '2.0',
                    id: null,
                    error: {
                        code: -32603,
                        message: error.message || 'Internal server error'
                    }
                }));
            }
        });

        req.on('error', error => {
            console.error('Request error:', error);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                jsonrpc: '2.0',
                id: null,
                error: {
                    code: -32700,
                    message: 'Parse error'
                }
            }));
        });
    }

    start() {
        const server = http.createServer((req, res) => {
            this.handleRequest(req, res);
        });

        server.listen(this.port, () => {
            console.log(`Figma MCP HTTP Server is running on port ${this.port}`);
            console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
        });

        server.on('error', error => {
            console.error('Server error:', error);
            process.exit(1);
        });

        // 优雅关闭
        process.on('SIGTERM', () => {
            console.log('SIGTERM received, shutting down gracefully');
            server.close(() => {
                console.log('Server closed');
                process.exit(0);
            });
        });
    }
}

// 启动服务器
const port = process.env.PORT || 3001;
const server = new FigmaMCPHTTPServer(port);
server.start();

