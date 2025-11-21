#!/usr/bin/env node

import axios from 'axios';

export class FigmaApi {
    constructor(accessToken, fileKey) {
        this.accessToken = accessToken;
        this.fileKey = fileKey;
        this.axios = axios.create({
            baseURL: 'https://api.figma.com/v1',
            headers: { 'X-Figma-Token': this.accessToken }
        });
    }

    /**
     * 设置或更新 fileKey
     * @param {string} fileKey - 新的 fileKey
     */
    setFileKey(fileKey) {
        this.fileKey = fileKey;
    }

    async getFile() {
        try {
            const response = await this.axios.get(`/files/${this.fileKey}`);
            return response.data;
        } catch (error) {
            this.handleApiError(error, 'getFile');
            throw error;
        }
    }

    async getPages() {
        const data = await this.getFile();
        return data.document.children.map(({ id, name }) => ({ id, name }));
    }

    async getNodeData(nodeIds) {
        try {
            const response = await this.axios.get(`/files/${this.fileKey}/nodes`, {
                params: { ids: nodeIds }
            });
            return response.data.nodes;
        } catch (error) {
            this.handleApiError(error, 'getNodeData');
            throw error;
        }
    }

    async getImageUrls(nodeIds) {
        try {
            const response = await this.axios.get(`/images/${this.fileKey}`, {
                params: { 
                    ids: nodeIds.join(','),
                    format: 'png',
                    scale: 3
                }
            });
            return response.data.images;
        } catch (error) {
            this.handleApiError(error, 'getImageUrls');
            throw error;
        }
    }

    handleApiError(error, method) {
        if (error.response) {
            // 服务器返回了错误响应
            const status = error.response.status;
            const statusText = error.response.statusText;
            const headers = error.response.headers;
            const data = error.response.data;

            // 构建详细的错误信息
            const errorDetails = {
                method,
                status,
                statusText,
                message: error.message,
                responseData: data,
                rateLimitInfo: null
            };

            // 429 错误特殊处理：提取速率限制信息
            if (status === 429) {
                errorDetails.rateLimitInfo = {
                    retryAfter: headers['retry-after'] || headers['Retry-After'],
                    xRateLimitLimit: headers['x-ratelimit-limit'] || headers['X-RateLimit-Limit'],
                    xRateLimitRemaining: headers['x-ratelimit-remaining'] || headers['X-RateLimit-Remaining'],
                    xRateLimitReset: headers['x-ratelimit-reset'] || headers['X-RateLimit-Reset'],
                    allHeaders: headers
                };
                
                // 将详细信息附加到错误对象
                error.details = errorDetails;
                error.message = `Figma API Rate Limit Exceeded (429). ${errorDetails.rateLimitInfo.retryAfter ? `Retry after ${errorDetails.rateLimitInfo.retryAfter} seconds.` : 'Please wait before retrying.'}`;
            } else {
                error.details = errorDetails;
            }
        } else if (error.request) {
            // 请求已发出但没有收到响应
            error.details = {
                method,
                message: 'No response received from Figma API',
                request: error.request
            };
        } else {
            // 设置请求时出错
            error.details = {
                method,
                message: error.message
            };
        }
    }
}

