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

            // 保留字符级别的样式覆盖信息（用于加粗等样式）
            if (node.characterStyleOverrides && node.characterStyleOverrides.length > 0) {
                result.characterStyleOverrides = node.characterStyleOverrides;
            }

            // 保留样式覆盖表（包含加粗等样式定义）
            if (node.styleOverrideTable && Object.keys(node.styleOverrideTable).length > 0) {
                result.styleOverrideTable = {};
                for (const [key, style] of Object.entries(node.styleOverrideTable)) {
                    result.styleOverrideTable[key] = {
                        fontFamily: style.fontFamily,
                        fontStyle: style.fontStyle,
                        fontWeight: style.fontWeight,
                        fontSize: style.fontSize
                    };
                }
            }

            // 解析加粗范围，提供更易读的格式
            if (node.characterStyleOverrides && node.styleOverrideTable) {
                const boldRanges = this.parseBoldRanges(
                    node.characters,
                    node.characterStyleOverrides,
                    node.styleOverrideTable
                );
                if (boldRanges.length > 0) {
                    result.boldRanges = boldRanges;
                }
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

    /**
     * 解析文本中的加粗范围
     * @param {string} text - 文本内容
     * @param {Array} characterStyleOverrides - 字符样式覆盖数组
     * @param {Object} styleOverrideTable - 样式覆盖表
     * @returns {Array} 加粗范围数组，每个元素包含 {start, end, text, fontWeight}
     */
    parseBoldRanges(text, characterStyleOverrides, styleOverrideTable) {
        if (!text || !characterStyleOverrides || !styleOverrideTable) {
            return [];
        }

        const ranges = [];
        let currentRange = null;

        for (let i = 0; i < text.length && i < characterStyleOverrides.length; i++) {
            const styleOverrideKey = characterStyleOverrides[i];
            
            // 检查是否有样式覆盖，并且该样式是否为加粗（fontWeight >= 500 或 fontStyle 包含 Bold/Medium）
            if (styleOverrideKey && styleOverrideTable[styleOverrideKey]) {
                const style = styleOverrideTable[styleOverrideKey];
                const isBold = style.fontWeight >= 500 || 
                             (style.fontStyle && (style.fontStyle.includes('Bold') || style.fontStyle.includes('Medium')));

                if (isBold) {
                    if (currentRange === null) {
                        currentRange = {
                            start: i,
                            end: i,
                            fontWeight: style.fontWeight,
                            fontStyle: style.fontStyle
                        };
                    } else {
                        currentRange.end = i;
                    }
                } else {
                    if (currentRange !== null) {
                        currentRange.text = text.substring(currentRange.start, currentRange.end + 1);
                        ranges.push(currentRange);
                        currentRange = null;
                    }
                }
            } else {
                if (currentRange !== null) {
                    currentRange.text = text.substring(currentRange.start, currentRange.end + 1);
                    ranges.push(currentRange);
                    currentRange = null;
                }
            }
        }

        // 处理最后一个范围
        if (currentRange !== null) {
            currentRange.text = text.substring(currentRange.start, currentRange.end + 1);
            ranges.push(currentRange);
        }

        return ranges;
    }
}

