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

    async getFile() {
        const response = await this.axios.get(`/files/${this.fileKey}`);
        return response.data;
    }

    async getPages() {
        const data = await this.getFile();
        return data.document.children.map(({ id, name }) => ({ id, name }));
    }

    async getNodeData(nodeIds) {
        const response = await this.axios.get(`/files/${this.fileKey}/nodes`, {
            params: { ids: nodeIds }
        });
        return response.data.nodes;
    }

    async getImageUrls(nodeIds) {
        const response = await this.axios.get(`/images/${this.fileKey}`, {
            params: { 
                ids: nodeIds.join(','),
                format: 'png',
                scale: 3
            }
        });
        return response.data.images;
    }
}

