#!/usr/bin/env node

/**
 * Figma MCP Server
 * 将 Figma 自动化工具暴露为 MCP (Model Context Protocol) 服务
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { FigmaApi } from './figma-api.js';
import { Downloader } from './downloader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class FigmaMCPServer {
    constructor() {
        this.config = this.loadConfig();
    }

    loadConfig() {
        const configFile = path.resolve(__dirname, 'config.json');
        let config = { output: { directory: 'output' } };
        
        // 从环境变量读取配置（MCP 配置中的 config 字段会通过环境变量传递）
        const envAccessToken = process.env.FIGMA_ACCESS_TOKEN;
        const envFileKey = process.env.FIGMA_FILE_KEY;
        
        // 从配置文件读取
        if (fs.existsSync(configFile)) {
            try {
                const fileConfig = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
                config = { ...config, ...fileConfig };
            } catch (e) {
                console.error(`Error reading config.json: ${e.message}. Using default output directory.`);
            }
        }
        
        // 环境变量优先级更高
        if (envAccessToken || envFileKey) {
            if (!config.figma) {
                config.figma = {};
            }
            if (envAccessToken) {
                config.figma.accessToken = envAccessToken;
            }
            if (envFileKey) {
                config.figma.fileKey = envFileKey;
            }
        }
        
        if (!config.output || !config.output.directory) {
            config.output = { directory: 'output' };
        }
        
        return config;
    }

    async handleRequest(request) {
        try {
            const { method, params, id } = request;

            let result;
            switch (method) {
                case 'initialize':
                    result = {
                        protocolVersion: '2024-11-05',
                        capabilities: {
                            tools: {}
                        },
                        serverInfo: {
                            name: 'figma-mcp-server',
                            version: '1.0.0'
                        }
                    };
                    break;

                case 'tools/list':
                    result = {
                        tools: [
                            {
                                name: 'figma_list_frames',
                                description: '列出 Figma 文件中所有可用的页面和顶级 Frame',
                                inputSchema: {
                                    type: 'object',
                                    properties: {},
                                    required: []
                                }
                            },
                            {
                                name: 'figma_download_and_simplify',
                                description: `从 Figma 获取指定节点（Page 或 Frame）的数据并返回简化后的 JSON（不下载图片）。

返回的 JSON 中，可下载的图片节点会被标记为 isImageNode: true。

图片节点识别规则：
1. 节点名称以 'exp_' 开头的节点被视为可导出的图片节点（整个节点作为一张图片）
2. 包含图片填充（IMAGE fill）的节点
3. 节点名称以 'ic/' 或 'icon/' 开头的节点（图标节点）

这些标记了 isImageNode: true 的节点，可以使用 figma_download_images 工具按需下载。

name字段使用说明（强制规则）：
- 所有节点都必须校验 name 字段，如果 name 中包含功能描述或要求，必须遵守并基于此生成代码
- name 字段可能包含功能描述信息，例如："点击后弹出会员购买页面 from = xxx"，应基于此生成相应的代码逻辑
- 调用方必须检查每个节点的 name 字段，如果 name 中包含功能要求（如交互行为、跳转逻辑、参数传递等），必须严格按照 name 中的要求实现
- 不区分节点类型，所有节点的 name 字段都应被校验和使用`,
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        nodeId: {
                                            type: 'string',
                                            description: 'Figma 节点 ID（Page ID 或 Frame ID）'
                                        }
                                    },
                                    required: ['nodeId']
                                }
                            },
                            {
                                name: 'figma_download_images',
                                description: `按需下载指定的图片节点，基于 node-id 列表。

支持的图片节点类型：
1. 节点名称以 'exp_' 开头的节点（导出组，整个节点作为一张图片）
2. 包含图片填充（IMAGE fill）的节点
3. 节点名称以 'ic/' 或 'icon/' 开头的节点（图标节点）

建议：先使用 figma_download_and_simplify 获取 JSON 数据，查找标记了 isImageNode: true 的节点，然后使用这些节点的 ID 调用本工具下载图片。`,
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        nodeIds: {
                                            type: 'array',
                                            items: {
                                                type: 'string'
                                            },
                                            description: '要下载的图片节点 ID 列表。这些节点应该是可下载的图片节点（通常从 figma_download_and_simplify 返回的 JSON 中查找 isImageNode: true 的节点）'
                                        }
                                    },
                                    required: ['nodeIds']
                                }
                            },
                            {
                                name: 'figma_list_json_files',
                                description: '列出所有可用的简化 JSON 文件',
                                inputSchema: {
                                    type: 'object',
                                    properties: {},
                                    required: []
                                }
                            }
                        ]
                    };
                    break;

                case 'tools/call':
                    result = await this.handleToolCall(params);
                    break;

                default:
                    throw new Error(`Unknown method: ${method}`);
            }

            return {
                jsonrpc: '2.0',
                id,
                result
            };
        } catch (error) {
            return {
                jsonrpc: '2.0',
                id: request.id,
                error: {
                    code: -32603,
                    message: error.message
                }
            };
        }
    }

    async handleToolCall(params) {
        const { name, arguments: args, mcp_config } = params;

        // 优先使用 mcp_config 中的凭证，如果没有则从配置文件读取
        const accessToken = mcp_config?.accessToken || this.config.figma?.accessToken;
        const fileKey = mcp_config?.fileKey || this.config.figma?.fileKey;

        if (!accessToken || !fileKey) {
            // Throw an error that includes the received params for debugging
            throw new Error(`Figma accessToken and fileKey are required. Please configure them in config.json or provide via mcp_config. Received params: ${JSON.stringify(params, null, 2)}`);
        }

        this.api = new FigmaApi(accessToken, fileKey);
        this.downloader = new Downloader(this.api, this.config.output.directory);

        switch (name) {
            case 'figma_list_frames':
                return await this.listFrames();

            case 'figma_download_and_simplify':
                return await this.downloadAndSimplify(args.nodeId);

            case 'figma_download_images':
                return await this.downloadImages(args.nodeIds);

            case 'figma_list_json_files':
                return await this.listJsonFiles();

            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }

    async listFrames() {
        const fileData = await this.api.getFile();
        const pages = [];

        fileData.document.children.forEach(page => {
            const frames = page.children.filter(child => child.type === 'FRAME');
            pages.push({
                pageId: page.id,
                pageName: page.name,
                frames: frames.map(frame => ({
                    id: frame.id,
                    name: frame.name
                }))
            });
        });

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(pages, null, 2)
                }
            ]
        };
    }

    async downloadAndSimplify(nodeId) {
        try {
            // 获取文件数据
            const fileData = await this.api.getFile();
            const { document } = fileData;

            // 查找目标节点
            let targetNodeInfo = null;
            for (const page of document.children) {
                if (page.id === nodeId) {
                    targetNodeInfo = { node: page, parentPage: page, type: 'PAGE' };
                    break;
                }
                const foundFrame = page.children.find(child => child.id === nodeId);
                if (foundFrame) {
                    targetNodeInfo = { node: foundFrame, parentPage: page, type: 'FRAME' };
                    break;
                }
            }

            if (!targetNodeInfo) {
                throw new Error(`Node not found: ${nodeId}`);
            }

            const { node: targetNode, parentPage, type: nodeType } = targetNodeInfo;

            // 获取完整的页面数据
            const pageData = await this.api.getNodeData(parentPage.id);
            const fullPageNode = pageData[parentPage.id]?.document;

            if (!fullPageNode) {
                throw new Error(`Could not fetch full data for page ${parentPage.id}`);
            }

            // 获取要处理的数据
            const dataToProcess = (nodeType === 'PAGE')
                ? fullPageNode
                : fullPageNode.children.find(child => child.id === nodeId);

            if (!dataToProcess) {
                throw new Error(`Could not find node data for ${nodeId} within the page data.`);
            }

            // 简化数据（不下载图片）
            const simplifiedData = this.downloader.simplifyNode(dataToProcess);

            // 标记所有可下载的图片节点（包括 exp_ 开头的节点）
            this.markImageNodes(simplifiedData, dataToProcess);

            // 在返回的数据中添加元数据说明
            const result = {
                data: simplifiedData,
                metadata: {
                    imageNodeRules: {
                        description: '以下节点被标记为可下载的图片节点（isImageNode: true）',
                        rules: [
                            "节点名称以 'exp_' 开头（导出组，整个节点作为一张图片）",
                            "包含图片填充（IMAGE fill）的节点",
                            "节点名称以 'ic/' 或 'icon/' 开头（图标节点）"
                        ],
                        usage: '使用这些节点的 ID 调用 figma_download_images 工具可以下载对应的图片资源'
                    },
                    nameFieldRules: {
                        description: 'name 字段使用规则（强制校验，用于代码生成）',
                        rules: [
                            "强制规则：所有节点都必须校验 name 字段，如果 name 中包含功能描述或要求，必须遵守并基于此生成代码",
                            "name 字段可能包含功能描述信息，例如：name: '点击后弹出会员购买页面 from = xxx'，应基于此生成相应的点击事件处理代码",
                            "调用方必须检查每个节点的 name 字段，如果 name 中包含功能要求（如交互行为、跳转逻辑、参数传递等），必须严格按照 name 中的要求实现",
                            "不区分节点类型（TEXT、GROUP、FRAME、COMPONENT 等），所有节点的 name 字段都应被校验和使用",
                            "如果 name 字段为空或不存在，则无需处理；如果 name 字段包含内容，必须解析其中的功能要求并实现"
                        ],
                        usage: '调用方必须检查所有节点的 name 字段，如果 name 中包含功能描述或要求，必须严格遵守并基于此生成代码，不区分节点类型'
                    }
                }
            };

            // 直接返回简化后的 JSON 数据（包含元数据）
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2)
                    }
                ]
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            success: false,
                            error: error.message
                        }, null, 2)
                    }
                ],
                isError: true
            };
        }
    }

    async downloadImages(nodeIds) {
        try {
            if (!Array.isArray(nodeIds) || nodeIds.length === 0) {
                throw new Error('nodeIds 必须是非空数组');
            }

            // 获取文件数据以查找节点名称
            const fileData = await this.api.getFile();
            const nodeNameMap = new Map();
            
            // 递归查找所有节点并建立 ID 到名称的映射
            const findAllNodes = (node) => {
                if (node.id && nodeIds.includes(node.id)) {
                    nodeNameMap.set(node.id, node.name || node.id);
                }
                if (node.children) {
                    node.children.forEach(child => findAllNodes(child));
                }
            };
            
            fileData.document.children.forEach(page => {
                findAllNodes(page);
            });

            // 获取图片 URL
            const imageUrls = await this.api.getImageUrls(nodeIds);

            if (!imageUrls || Object.keys(imageUrls).length === 0) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                success: false,
                                error: '无法获取图片 URL，请确认节点 ID 是否正确且节点包含图片'
                            }, null, 2)
                        }
                    ],
                    isError: true
                };
            }

            // 创建统一的图片目录（使用第一个节点名称或默认名称）
            const outputDir = path.resolve(__dirname, this.config.output.directory);
            const imageDir = path.join(outputDir, 'images', 'downloads');
            
            if (!fs.existsSync(imageDir)) {
                fs.mkdirSync(imageDir, { recursive: true });
            }

            // 下载所有指定的图片
            const downloadResults = [];
            const downloadPromises = Object.keys(imageUrls).map(async (nodeId) => {
                const nodeName = nodeNameMap.get(nodeId) || nodeId;
                const saneNodeName = this.downloader.sanitizeName(nodeName);
                const saneNodeId = nodeId.replace(/:/g, '-');
                const finalFileName = `${saneNodeName}_${saneNodeId}.png`;
                const filePath = path.join(imageDir, finalFileName);

                try {
                    await this.downloadImage(imageUrls[nodeId], filePath);
                    downloadResults.push({
                        nodeId,
                        nodeName,
                        fileName: finalFileName,
                        filePath: filePath,
                        success: true
                    });
                } catch (error) {
                    downloadResults.push({
                        nodeId,
                        nodeName,
                        fileName: finalFileName,
                        success: false,
                        error: error.message
                    });
                }
            });

            await Promise.all(downloadPromises);

            // 处理未找到图片 URL 的节点
            nodeIds.forEach(nodeId => {
                if (!imageUrls[nodeId]) {
                    const nodeName = nodeNameMap.get(nodeId) || nodeId;
                    downloadResults.push({
                        nodeId,
                        nodeName,
                        success: false,
                        error: '未找到图片 URL，该节点可能不包含图片'
                    });
                }
            });

            const successCount = downloadResults.filter(r => r.success).length;
            const failCount = downloadResults.filter(r => !r.success).length;

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            message: `成功下载 ${successCount} 张图片，失败 ${failCount} 张`,
                            imageDirectory: imageDir,
                            images: downloadResults
                        }, null, 2)
                    }
                ]
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            success: false,
                            error: error.message
                        }, null, 2)
                    }
                ],
                isError: true
            };
        }
    }

    /**
     * 查找所有可下载的图片节点（包括 exp_ 开头的节点）
     */
    findImageNodes(node) {
        let nodes = [];
        if (!node) return nodes;

        const isVisible = node.visible !== false;
        if (!isVisible) return nodes;

        const name = node.name || '';
        
        // Rule: If name starts with `exp_`, treat the whole node as a single exportable image.
        if (name.startsWith('exp_')) {
            nodes.push(node);
            return nodes; // Stop recursion for children of this node
        }

        // Rule: Check for image fills
        if (node.fills && Array.isArray(node.fills)) {
            for (const fill of node.fills) {
                if (fill.type === 'IMAGE' && fill.visible !== false) {
                    nodes.push(node);
                    break; 
                }
            }
        }
        
        // Rule: Check for `ic/` or `icon/` prefix (unless it's already marked for export)
        if (name.startsWith('ic/') || name.startsWith('icon/')) {
             nodes.push(node);
        }

        if (node.children && Array.isArray(node.children)) {
            for (const child of node.children) {
                nodes = nodes.concat(this.findImageNodes(child));
            }
        }
        return nodes;
    }

    /**
     * 在简化后的 JSON 数据中标记可下载的图片节点
     */
    markImageNodes(simplifiedNode, originalNode) {
        if (!simplifiedNode || !originalNode) return;

        // 查找所有图片节点
        const imageNodes = this.findImageNodes(originalNode);
        const imageNodeIds = new Set(imageNodes.map(n => n.id));

        // 递归标记节点
        const markNode = (simplified, original) => {
            if (!simplified || !original) return;

            // 如果当前节点是图片节点，添加标记
            if (imageNodeIds.has(original.id)) {
                simplified.isImageNode = true;
            }

            // 递归处理子节点
            if (simplified.children && original.children) {
                for (let i = 0; i < simplified.children.length && i < original.children.length; i++) {
                    markNode(simplified.children[i], original.children[i]);
                }
            }
        };

        markNode(simplifiedNode, originalNode);
    }

    async downloadImage(url, filepath) {
        if (!url) {
            throw new Error('Image URL is empty');
        }
        const response = await axios({ url, responseType: 'stream' });
        const writer = fs.createWriteStream(filepath);
        response.data.pipe(writer);
        
        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
            response.data.on('error', reject);
        });
    }

    async listJsonFiles() {
        const outputDir = path.resolve(__dirname, this.config.output.directory);
        
        if (!fs.existsSync(outputDir)) {
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            jsonFiles: [],
                            imageFiles: []
                        }, null, 2)
                    }
                ]
            };
        }

        const jsonFiles = fs.readdirSync(outputDir)
            .filter(file => file.endsWith('.json') && file.startsWith('sim-'))
            .sort();

        const imageFiles = fs.readdirSync(outputDir)
            .filter(file => /\.(png|jpg|jpeg|gif|webp)$/i.test(file))
            .sort();

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        jsonFiles,
                        imageFiles
                    }, null, 2)
                }
            ]
        };
    }

    start() {
        let buffer = '';

        process.stdin.setEncoding('utf8');

        process.stdin.on('data', (chunk) => {
            buffer += chunk;
            
            // 尝试解析完整的 JSON 对象
            let start = 0;
            while (start < buffer.length) {
                let braceCount = 0;
                let inString = false;
                let escapeNext = false;
                let jsonEnd = -1;

                for (let i = start; i < buffer.length; i++) {
                    const char = buffer[i];
                    
                    if (escapeNext) {
                        escapeNext = false;
                        continue;
                    }
                    
                    if (char === '\\') {
                        escapeNext = true;
                        continue;
                    }
                    
                    if (char === '"') {
                        inString = !inString;
                        continue;
                    }
                    
                    if (inString) continue;
                    
                    if (char === '{') {
                        braceCount++;
                    } else if (char === '}') {
                        braceCount--;
                        if (braceCount === 0) {
                            jsonEnd = i + 1;
                            break;
                        }
                    }
                }

                if (jsonEnd > 0) {
                    try {
                        const jsonStr = buffer.substring(start, jsonEnd);
                        const request = JSON.parse(jsonStr);
                        
                        this.handleRequest(request).then(response => {
                            const output = JSON.stringify(response) + '\n';
                            process.stdout.write(output);
                        }).catch(error => {
                            const errorResponse = {
                                jsonrpc: '2.0',
                                id: request.id || null,
                                error: {
                                    code: -32603,
                                    message: error.message
                                }
                            };
                            process.stdout.write(JSON.stringify(errorResponse) + '\n');
                        });
                        
                        buffer = buffer.substring(jsonEnd);
                        start = 0;
                    } catch (e) {
                        // JSON 解析失败，继续等待更多数据
                        break;
                    }
                } else {
                    // 没有找到完整的 JSON，等待更多数据
                    break;
                }
            }
        });

        process.stdin.on('end', () => {
            process.exit(0);
        });
    }
}

// 导出类供 HTTP 服务器使用
export { FigmaMCPServer };

// 如果直接运行此文件，启动 stdio 模式
// 检查是否作为主模块运行
const isMainModule = import.meta.url === `file://${process.argv[1]}` || 
                     process.argv[1]?.endsWith('server.js') ||
                     process.argv[1]?.includes('server.js');
                     
if (isMainModule) {
    const server = new FigmaMCPServer();
    server.start();
}

