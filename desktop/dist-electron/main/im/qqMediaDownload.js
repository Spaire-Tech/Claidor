"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getQQMediaDir = getQQMediaDir;
exports.mapQQMediaType = mapQQMediaType;
exports.downloadQQAttachment = downloadQQAttachment;
exports.cleanupOldQQMediaFiles = cleanupOldQQMediaFiles;
/**
 * QQ Media Download Utilities
 * QQ 媒体下载工具函数（接收端）
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const electron_1 = require("electron");
const http_1 = require("./http");
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const INBOUND_DIR = 'qq-inbound';
/**
 * 获取 QQ 媒体存储目录
 */
function getQQMediaDir() {
    const userDataPath = electron_1.app.getPath('userData');
    const mediaDir = path.join(userDataPath, INBOUND_DIR);
    if (!fs.existsSync(mediaDir)) {
        fs.mkdirSync(mediaDir, { recursive: true });
    }
    return mediaDir;
}
/**
 * 生成唯一文件名
 */
function generateFileName(extension) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    return `${timestamp}_${random}${extension}`;
}
/**
 * 根据 MIME 类型获取文件扩展名
 */
function getExtensionFromMime(mimeType) {
    const mimeMap = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'video/mp4': '.mp4',
        'video/quicktime': '.mov',
        'video/webm': '.webm',
        'audio/ogg': '.ogg',
        'audio/mpeg': '.mp3',
        'audio/mp4': '.m4a',
        'audio/wav': '.wav',
        'audio/amr': '.amr',
        'application/pdf': '.pdf',
        'application/zip': '.zip',
    };
    return mimeMap[mimeType] || '.bin';
}
/**
 * 将 QQ SDK 解析的 type 映射为 IMMediaType
 */
function mapQQMediaType(type) {
    switch (type) {
        case 'image': return 'image';
        case 'video': return 'video';
        case 'audio': return 'audio';
        case 'voice': return 'voice';
        default: return 'document';
    }
}
/**
 * 根据文件名推断 MIME 类型
 */
function inferMimeType(type, fileName) {
    if (fileName) {
        const ext = path.extname(fileName).toLowerCase();
        const extMap = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.mp4': 'video/mp4',
            '.mov': 'video/quicktime',
            '.webm': 'video/webm',
            '.mp3': 'audio/mpeg',
            '.ogg': 'audio/ogg',
            '.wav': 'audio/wav',
            '.m4a': 'audio/mp4',
            '.amr': 'audio/amr',
            '.pdf': 'application/pdf',
            '.zip': 'application/zip',
        };
        if (extMap[ext])
            return extMap[ext];
    }
    // Fallback based on type
    switch (type) {
        case 'image': return 'image/jpeg';
        case 'video': return 'video/mp4';
        case 'audio':
        case 'voice': return 'audio/mpeg';
        default: return 'application/octet-stream';
    }
}
/**
 * 下载 QQ 附件
 *
 * @param url QQ CDN 下载 URL
 * @param type SDK 解析的媒体类型 (image/video/audio/file)
 * @param fileName 原始文件名（可选）
 */
async function downloadQQAttachment(url, type, fileName) {
    try {
        const mimeType = inferMimeType(type, fileName);
        console.log(`[QQ Media] 下载附件:`, JSON.stringify({
            type,
            mimeType,
            fileName,
        }));
        const response = await (0, http_1.fetchWithSystemProxy)(url);
        if (!response.ok) {
            console.error(`[QQ Media] 下载失败: HTTP ${response.status}`);
            return null;
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > MAX_FILE_SIZE) {
            console.warn(`[QQ Media] 文件过大: ${(buffer.length / 1024 / 1024).toFixed(1)}MB (限制: 25MB)`);
            return null;
        }
        // 确定文件扩展名
        let extension = getExtensionFromMime(mimeType);
        if (fileName) {
            const ext = path.extname(fileName);
            if (ext)
                extension = ext;
        }
        const localFileName = generateFileName(extension);
        const mediaDir = getQQMediaDir();
        const localPath = path.join(mediaDir, localFileName);
        fs.writeFileSync(localPath, buffer);
        console.log(`[QQ Media] 下载成功: ${localFileName} (${(buffer.length / 1024).toFixed(1)} KB)`);
        return {
            localPath,
            fileSize: buffer.length,
            mimeType,
        };
    }
    catch (error) {
        console.error(`[QQ Media] 下载失败: ${error.message}`);
        return null;
    }
}
/**
 * 清理过期的媒体文件
 * @param maxAgeDays 最大保留天数，默认 7 天
 */
function cleanupOldQQMediaFiles(maxAgeDays = 7) {
    const mediaDir = getQQMediaDir();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    try {
        if (!fs.existsSync(mediaDir)) {
            return;
        }
        const files = fs.readdirSync(mediaDir);
        let cleanedCount = 0;
        for (const file of files) {
            const filePath = path.join(mediaDir, file);
            try {
                const stat = fs.statSync(filePath);
                if (now - stat.mtimeMs > maxAgeMs) {
                    fs.unlinkSync(filePath);
                    cleanedCount++;
                }
            }
            catch (err) {
                console.warn(`[QQ Media] 清理文件失败 ${file}: ${err.message}`);
            }
        }
        if (cleanedCount > 0) {
            console.log(`[QQ Media] 清理了 ${cleanedCount} 个过期文件`);
        }
    }
    catch (error) {
        console.warn(`[QQ Media] 清理错误: ${error.message}`);
    }
}
//# sourceMappingURL=qqMediaDownload.js.map