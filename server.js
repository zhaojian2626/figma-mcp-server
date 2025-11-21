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

    /**
     * 从 Figma URL 中提取 fileKey 和 nodeId
     * 支持的 URL 格式：
     * - https://www.figma.com/design/{fileKey}/{fileName}?node-id={nodeId}
     * - https://figma.com/design/{fileKey}/{fileName}?node-id={nodeId}
     * - https://www.figma.com/file/{fileKey}/{fileName}?node-id={nodeId}
     * 
     * @param {string} urlOrNodeId - Figma URL 或 nodeId
     * @returns {Object} { fileKey: string|null, nodeId: string|null, isUrl: boolean }
     */
    parseFigmaUrl(urlOrNodeId) {
        if (!urlOrNodeId || typeof urlOrNodeId !== 'string') {
            return { fileKey: null, nodeId: null, isUrl: false };
        }

        // 检查是否是 URL（必须以 http:// 或 https:// 开头）
        if (!urlOrNodeId.startsWith('http://') && !urlOrNodeId.startsWith('https://')) {
            // 不是 URL，可能是 nodeId
            return { fileKey: null, nodeId: urlOrNodeId, isUrl: false };
        }

        try {
            // 检查是否是 Figma URL
            const urlPattern = /^https?:\/\/(www\.)?figma\.com\/(design|file)\/([^\/]+)\/[^?]*(\?.*)?$/;
            const match = urlOrNodeId.match(urlPattern);
            
            if (match) {
                const fileKey = match[3];
                let nodeId = null;
                
                // 从查询参数中提取 node-id
                const urlObj = new URL(urlOrNodeId);
                const nodeIdParam = urlObj.searchParams.get('node-id');
                
                if (nodeIdParam) {
                    // 将 node-id 格式（如 "4-419"）转换为 API 格式（如 "4:419"）
                    nodeId = nodeIdParam.replace(/-/g, ':');
                }
                
                return { fileKey, nodeId, isUrl: true };
            }
        } catch (error) {
            // URL 解析失败，不是有效的 URL
            // 继续执行，返回 nodeId
        }
        
        // 不是有效的 Figma URL，可能是 nodeId
        return { fileKey: null, nodeId: urlOrNodeId, isUrl: false };
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
- 不区分节点类型，所有节点的 name 字段都应被校验和使用

参数说明：
- nodeId: 可以是 Figma URL（如 https://www.figma.com/design/MNExpk61JtsI2KSgETsArb/Untitled?node-id=4-419）或节点 ID（如 "4:419"）
- 如果提供 URL，将从 URL 中提取 fileKey 和 nodeId；如果只提供 nodeId，将使用配置的 fileKey`,
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        nodeId: {
                                            type: 'string',
                                            description: 'Figma URL 或节点 ID（Page ID 或 Frame ID）。支持完整 URL（如 https://www.figma.com/design/{fileKey}/{fileName}?node-id={nodeId}）或节点 ID（如 "4:419"）'
                                        }
                                    },
                                    required: ['nodeId']
                                }
                            },
                            {
                                name: 'figma_download_images',
                                description: `获取指定图片节点的下载 URL（代理模式，不下载到服务器）。

本工具作为代理，返回 Figma API 提供的图片 URL，由客户端直接下载，减少服务器存储和带宽消耗。

支持的图片节点类型：
1. 节点名称以 'exp_' 开头的节点（导出组，整个节点作为一张图片）
2. 包含图片填充（IMAGE fill）的节点
3. 节点名称以 'ic/' 或 'icon/' 开头的节点（图标节点）

返回结果包含：
- imageUrl: Figma API 提供的可直接下载的图片 URL
- nodeId: 节点 ID
- nodeName: 节点名称
- fileName: 建议的文件名（基于节点名称）

建议：先使用 figma_download_and_simplify 获取 JSON 数据，查找标记了 isImageNode: true 的节点，然后使用这些节点的 ID 调用本工具获取图片 URL。`,
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
        let fileKey = mcp_config?.fileKey || this.config.figma?.fileKey;

        // 对于需要 nodeId 的工具，尝试从 URL 中提取 fileKey 和 nodeId
        if (args?.nodeId) {
            const urlParseResult = this.parseFigmaUrl(args.nodeId);
            if (urlParseResult.isUrl && urlParseResult.fileKey) {
                // 从 URL 中提取的 fileKey 优先级最高
                fileKey = urlParseResult.fileKey;
                // 更新 args.nodeId 为提取的 nodeId（如果有）
                if (urlParseResult.nodeId) {
                    args.nodeId = urlParseResult.nodeId;
                } else {
                    // URL 中没有 node-id，但提供了 URL，说明用户可能想使用 URL 中的 fileKey
                    // 对于需要 nodeId 的工具，如果没有 nodeId，保持原值（可能是完整的 URL 或其他格式）
                    // 后续处理会根据具体情况报错或处理
                }
            }
        }

        // accessToken 是必需的，fileKey 在某些情况下可以是可选的（如果从 URL 提取）
        if (!accessToken) {
            throw new Error(`Figma accessToken is required. Please configure it in config.json or provide via mcp_config.`);
        }

        // 对于需要 fileKey 的工具，检查是否已获取
        const toolsRequiringFileKey = ['figma_list_frames', 'figma_download_and_simplify', 'figma_download_images'];
        if (toolsRequiringFileKey.includes(name) && !fileKey) {
            throw new Error(`Figma fileKey is required for ${name}. Please configure it in config.json, provide via mcp_config, or include it in the Figma URL.`);
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
        // 策略追踪信息
        const strategyInfo = {
            nodeId: nodeId,
            strategiesAttempted: [],
            apiCalls: [],
            usedGetFile: false,
            errors: []
        };

        try {
            // 优化策略：对于已知 node-id，直接查询节点，避免调用 getFile()
            // 先尝试直接获取节点数据
            let dataToProcess = null;

            try {
                // 策略1：直接查询节点（推荐，只消耗1次API调用）
                strategyInfo.strategiesAttempted.push({
                    name: '直接查询节点 (getNodeData)',
                    description: '直接使用 getNodeData() 查询指定节点，只消耗1次API调用',
                    status: 'attempting'
                });
                
                strategyInfo.apiCalls.push('getNodeData');
                const nodeData = await this.api.getNodeData(nodeId);
                
                if (nodeData && nodeData[nodeId]) {
                    const nodeDocument = nodeData[nodeId].document;
                    
                    // 如果节点是 PAGE 类型，直接使用
                    if (nodeDocument.type === 'PAGE') {
                        dataToProcess = nodeDocument;
                    } 
                    // 如果节点是其他类型（FRAME, COMPONENT等），直接使用
                    else {
                        dataToProcess = nodeDocument;
                    }
                    
                    // 策略1成功
                    strategyInfo.strategiesAttempted[0].status = 'success';
                } else {
                    // 策略1失败：节点数据为空
                    strategyInfo.strategiesAttempted[0].status = 'failed';
                    strategyInfo.strategiesAttempted[0].error = '节点数据为空';
                    strategyInfo.errors.push('直接查询返回的节点数据为空');
                }
            } catch (directQueryError) {
                // 策略1失败：直接查询出错
                if (strategyInfo.strategiesAttempted.length > 0) {
                    strategyInfo.strategiesAttempted[0].status = 'failed';
                    strategyInfo.strategiesAttempted[0].error = directQueryError.message;
                } else {
                    strategyInfo.strategiesAttempted.push({
                        name: '直接查询节点 (getNodeData)',
                        description: '直接使用 getNodeData() 查询指定节点',
                        status: 'failed',
                        error: directQueryError.message
                    });
                }
                strategyInfo.errors.push(`直接查询失败: ${directQueryError.message}`);
                // 继续执行回退策略
            }

            // 策略2：如果直接查询失败，使用 getFile() 查找节点位置（需要2次API调用）
            if (!dataToProcess) {
                strategyInfo.usedGetFile = true;
                strategyInfo.strategiesAttempted.push({
                    name: '使用 getFile() 查找节点',
                    description: '通过 getFile() 获取文件结构，然后查找节点位置，需要2次API调用',
                    status: 'attempting'
                });

                try {
                    strategyInfo.apiCalls.push('getFile');
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
                        const errorMsg = `Node not found: ${nodeId}`;
                        strategyInfo.strategiesAttempted[strategyInfo.strategiesAttempted.length - 1].status = 'failed';
                        strategyInfo.strategiesAttempted[strategyInfo.strategiesAttempted.length - 1].error = errorMsg;
                        strategyInfo.errors.push(errorMsg);
                        throw new Error(errorMsg);
                    }

                    const { node: targetNode, parentPage, type: nodeType } = targetNodeInfo;

                    // 获取完整的页面数据
                    strategyInfo.apiCalls.push('getNodeData');
                    const pageData = await this.api.getNodeData(parentPage.id);
                    const fullPageNode = pageData[parentPage.id]?.document;

                    if (!fullPageNode) {
                        const errorMsg = `Could not fetch full data for page ${parentPage.id}`;
                        strategyInfo.strategiesAttempted[strategyInfo.strategiesAttempted.length - 1].status = 'failed';
                        strategyInfo.strategiesAttempted[strategyInfo.strategiesAttempted.length - 1].error = errorMsg;
                        strategyInfo.errors.push(errorMsg);
                        throw new Error(errorMsg);
                    }

                    // 获取要处理的数据
                    dataToProcess = (nodeType === 'PAGE')
                        ? fullPageNode
                        : fullPageNode.children.find(child => child.id === nodeId);

                    if (!dataToProcess) {
                        const errorMsg = `Could not find node data for ${nodeId} within the page data.`;
                        strategyInfo.strategiesAttempted[strategyInfo.strategiesAttempted.length - 1].status = 'failed';
                        strategyInfo.strategiesAttempted[strategyInfo.strategiesAttempted.length - 1].error = errorMsg;
                        strategyInfo.errors.push(errorMsg);
                        throw new Error(errorMsg);
                    }

                    // 策略2成功
                    strategyInfo.strategiesAttempted[strategyInfo.strategiesAttempted.length - 1].status = 'success';
                } catch (getFileError) {
                    // 策略2失败
                    if (strategyInfo.strategiesAttempted.length > 0) {
                        const lastStrategy = strategyInfo.strategiesAttempted[strategyInfo.strategiesAttempted.length - 1];
                        if (lastStrategy.status === 'attempting') {
                            lastStrategy.status = 'failed';
                            lastStrategy.error = getFileError.message;
                        }
                    }
                    strategyInfo.errors.push(`getFile() 策略失败: ${getFileError.message}`);
                    throw getFileError; // 重新抛出错误，让外层 catch 处理
                }
            }

            // 简化数据（不下载图片）
            const simplifiedData = this.downloader.simplifyNode(dataToProcess);

            // 标记所有可下载的图片节点（包括 exp_ 开头的节点）
            this.markImageNodes(simplifiedData, dataToProcess);

            // 在返回的数据中添加元数据说明
            const result = {
                data: simplifiedData,
                metadata: {
                    apiOptimization: {
                        description: 'API 调用优化策略',
                        strategy: strategyInfo.usedGetFile 
                            ? '使用了 getFile() 方法查找节点位置（需要遍历文件结构）' 
                            : '直接使用 getNodeData() 查询节点（推荐，更高效）',
                        apiCalls: strategyInfo.apiCalls,
                        apiCallCount: strategyInfo.apiCalls.length,
                        strategiesAttempted: strategyInfo.strategiesAttempted,
                        note: '尽量减少 getFile() 调用，只有明确需要查询页面节点时才调用 getFile()。对于已知 node-id，直接查询节点，避免调用 getFile()。'
                    },
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
            const errorResponse = {
                success: false,
                error: error.message,
                strategyInfo: {
                    nodeId: strategyInfo.nodeId,
                    strategiesAttempted: strategyInfo.strategiesAttempted,
                    apiCalls: strategyInfo.apiCalls,
                    apiCallCount: strategyInfo.apiCalls.length,
                    usedGetFile: strategyInfo.usedGetFile,
                    errors: strategyInfo.errors,
                    summary: `尝试了 ${strategyInfo.strategiesAttempted.length} 种策略，${strategyInfo.strategiesAttempted.filter(s => s.status === 'success').length} 种成功，${strategyInfo.strategiesAttempted.filter(s => s.status === 'failed').length} 种失败`
                }
            };

            // 如果有详细信息（如 429 错误详情），包含进去
            if (error.details) {
                errorResponse.details = error.details;
            }

            // 如果是 axios 错误，包含更多信息
            if (error.response) {
                errorResponse.status = error.response.status;
                errorResponse.statusText = error.response.statusText;
                if (error.response.data) {
                    errorResponse.responseData = error.response.data;
                }
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(errorResponse, null, 2)
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

            // 获取图片 URL（从 Figma API）
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

            // 构建返回结果（代理模式：只返回 URL，不下载到服务器）
            const imageResults = [];
            
            // 处理成功获取 URL 的节点
            Object.keys(imageUrls).forEach((nodeId) => {
                const nodeName = nodeNameMap.get(nodeId) || nodeId;
                const saneNodeName = this.downloader.sanitizeName(nodeName);
                const saneNodeId = nodeId.replace(/:/g, '-');
                const suggestedFileName = `${saneNodeName}_${saneNodeId}.png`;
                const imageUrl = imageUrls[nodeId];

                if (imageUrl) {
                    imageResults.push({
                        nodeId,
                        nodeName,
                        fileName: suggestedFileName,
                        imageUrl: imageUrl, // Figma API 提供的可直接下载的 URL
                        success: true
                    });
                }
            });

            // 处理未找到图片 URL 的节点
            nodeIds.forEach(nodeId => {
                if (!imageUrls[nodeId]) {
                    const nodeName = nodeNameMap.get(nodeId) || nodeId;
                    imageResults.push({
                        nodeId,
                        nodeName,
                        success: false,
                        error: '未找到图片 URL，该节点可能不包含图片'
                    });
                }
            });

            const successCount = imageResults.filter(r => r.success).length;
            const failCount = imageResults.filter(r => !r.success).length;

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            message: `成功获取 ${successCount} 个图片 URL，失败 ${failCount} 个`,
                            note: '图片 URL 可直接用于下载，客户端应使用这些 URL 从 Figma CDN 下载图片',
                            images: imageResults
                        }, null, 2)
                    }
                ]
            };
        } catch (error) {
            const errorResponse = {
                success: false,
                error: error.message
            };

            // 如果有详细信息（如 429 错误详情），包含进去
            if (error.details) {
                errorResponse.details = error.details;
            }

            // 如果是 axios 错误，包含更多信息
            if (error.response) {
                errorResponse.status = error.response.status;
                errorResponse.statusText = error.response.statusText;
                if (error.response.data) {
                    errorResponse.responseData = error.response.data;
                }
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(errorResponse, null, 2)
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

