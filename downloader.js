#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { FigmaApi } from './figma-api.js';

export class Downloader {
    constructor(api, outputDir) {
        this.api = api;
        this.outputDir = outputDir;
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    sanitizeName(name) {
        return name.replace(/[\s\/]/g, '_').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    }

    simplifyNode(node) {
        if (!node || node.visible === false) {
            return null;
        }

        if (node.type === 'GROUP' && node.children && node.children.length === 1) {
            return this.simplifyNode(node.children[0]);
        }
        
        const isIcon = node.name && (node.name.startsWith('ic/') || node.name.startsWith('icon/'));
        const isExportGroup = node.name && node.name.startsWith('exp_');

        let simplifiedChildren = null;
        if (node.children && !isIcon && !isExportGroup) {
            simplifiedChildren = node.children
                .map(child => this.simplifyNode(child))
                .filter(child => child !== null);
        }

        const result = {
            id: node.id,
            name: node.name,
            type: node.type,
        };

        if (node.absoluteBoundingBox) {
            result.frame = {
                x: node.absoluteBoundingBox.x,
                y: node.absoluteBoundingBox.y,
                width: node.absoluteBoundingBox.width,
                height: node.absoluteBoundingBox.height,
            };
        }
        
        if (node.layoutMode) {
            result.layout = {
                mode: node.layoutMode,
                spacing: node.itemSpacing,
                padding: {
                    top: node.paddingTop,
                    right: node.paddingRight,
                    bottom: node.paddingBottom,
                    left: node.paddingLeft
                },
                alignment: node.primaryAxisAlignItems
            }
        }

        const firstVisibleFill = node.fills?.find(f => f.visible !== false && (f.type === 'SOLID' || f.type === 'IMAGE' || f.type === 'GRADIENT_LINEAR'));
        if (firstVisibleFill?.type === 'SOLID') {
            const { r, g, b } = firstVisibleFill.color;
            result.fill = `#${Math.round(r * 255).toString(16).padStart(2, '0')}${Math.round(g * 255).toString(16).padStart(2, '0')}${Math.round(b * 255).toString(16).padStart(2, '0')}`;
        } else if (firstVisibleFill?.type === 'GRADIENT_LINEAR') {
            const colors = firstVisibleFill.gradientStops.map(stop => {
                const { r, g, b } = stop.color;
                return `#${Math.round(r * 255).toString(16).padStart(2, '0')}${Math.round(g * 255).toString(16).padStart(2, '0')}${Math.round(b * 255).toString(16).padStart(2, '0')}`;
            });
            result.gradientFill = {
                type: 'GRADIENT_LINEAR',
                colors: colors
            };
        } else if (firstVisibleFill?.type === 'IMAGE') {
            result.fillType = 'IMAGE';
        }

        const firstVisibleStroke = node.strokes?.find(s => s.visible !== false && s.type === 'SOLID');
        if (firstVisibleStroke) {
            const { r, g, b } = firstVisibleStroke.color;
            result.stroke = {
                color: `#${Math.round(r * 255).toString(16).padStart(2, '0')}${Math.round(g * 255).toString(16).padStart(2, '0')}${Math.round(b * 255).toString(16).padStart(2, '0')}`,
                weight: node.strokeWeight
            }
        }

        if (node.cornerRadius) {
            result.cornerRadius = node.cornerRadius;
        }
        
        if (node.characters) {
            result.text = node.characters.trim();
            const fill = node.fills?.find(f => f.visible !== false && f.type === 'SOLID');
            let textColor = null;
            if (fill) {
                 const { r, g, b } = fill.color;
                 textColor = `#${Math.round(r * 255).toString(16).padStart(2, '0')}${Math.round(g * 255).toString(16).padStart(2, '0')}${Math.round(b * 255).toString(16).padStart(2, '0')}`;
            }

            result.textStyle = {
                fontSize: node.style.fontSize,
                fontWeight: node.style.fontWeight,
                color: textColor,
                textAlignHorizontal: node.style.textAlignHorizontal,
                textAlignVertical: node.style.textAlignVertical
            }
        }

        if (simplifiedChildren && simplifiedChildren.length > 0) {
            result.children = simplifiedChildren;
        }
        
        if (node.componentId) {
            result.componentId = node.componentId;
        }

        return result;
    }
}

