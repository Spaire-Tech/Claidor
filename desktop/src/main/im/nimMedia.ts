/**
 * NIM Media Utilities
 * NIM media message handling: download, send, type inference, cleanup.
 *
 * Based on openclaw-nim/src/media.ts, adapted to the Swen Gateway architecture.
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';

import type { IMMediaAttachment, IMMediaType } from './types';

// ==================== Constants ====================

/** Maximum download size: 30MB (same as openclaw-nim) */
const MAX_FILE_SIZE = 30 * 1024 * 1024;

/** Subdirectory for downloaded files */
const INBOUND_DIR = 'nim-inbound';

// ==================== Directory management ====================

/**
 * Get the NIM media storage directory
 */
export function getNimMediaDir(): string {
  const userDataPath = app.getPath('userData');
  const mediaDir = path.join(userDataPath, INBOUND_DIR);

  if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true });
  }

  return mediaDir;
}

// ==================== File name and type inference ====================

/**
 * Generate a unique file name
 */
function generateFileName(prefix: string, extension: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `${timestamp}_${prefix}_${random}${extension}`;
}

/**
 * Infer the NIM message type from the file extension (decides which SDK method to call when sending).
 * Mirrors inferMessageType in openclaw-nim/src/media.ts.
 */
export function inferMediaType(filePath: string): 'image' | 'audio' | 'video' | 'file' {
  const ext = path.extname(filePath).toLowerCase();

  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
  const audioExts = ['.mp3', '.wav', '.aac', '.m4a', '.ogg', '.amr'];
  const videoExts = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv'];

  if (imageExts.includes(ext)) return 'image';
  if (audioExts.includes(ext)) return 'audio';
  if (videoExts.includes(ext)) return 'video';
  return 'file';
}

/**
 * Infer the MIME type from the file extension (used to fill IMMediaAttachment.mimeType).
 */
export function inferMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();

  const mimeMap: Record<string, string> = {
    // Images
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    // Audio
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.aac': 'audio/aac',
    '.m4a': 'audio/mp4',
    '.ogg': 'audio/ogg',
    '.amr': 'audio/amr',
    // Video
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    '.flv': 'video/x-flv',
    // Documents
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.rar': 'application/x-rar-compressed',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain',
  };

  return mimeMap[ext] || 'application/octet-stream';
}

/**
 * Convert an inferMediaType result to IMMediaType
 */
function toIMMediaType(mediaType: 'image' | 'audio' | 'video' | 'file'): IMMediaType {
  if (mediaType === 'file') return 'document';
  return mediaType;
}

/**
 * Placeholder text for a message's media type.
 * Mirrors inferMediaPlaceholder in openclaw-nim/src/media.ts.
 */
export function inferMediaPlaceholder(messageType: string): string {
  switch (messageType) {
    case 'image':
      return '[Photo]';
    case 'audio':
      return '[Voice Message]';
    case 'video':
      return '[Video]';
    case 'file':
      return '[File]';
    default:
      return '[Media Message]';
  }
}

// ==================== Download ====================

/**
 * Stream a file download (with redirect handling and a size limit).
 * Mirrors downloadFile in openclaw-nim/src/media.ts.
 */
function downloadFile(url: string, destPath: string, maxBytes: number = MAX_FILE_SIZE): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    let downloadedBytes = 0;

    protocol.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          file.close();
          try { fs.unlinkSync(destPath); } catch { /* ignore */ }
          downloadFile(redirectUrl, destPath, maxBytes).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(destPath); } catch { /* ignore */ }
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }

      response.on('data', (chunk: Buffer) => {
        downloadedBytes += chunk.length;
        if (downloadedBytes > maxBytes) {
          response.destroy();
          file.close();
          try { fs.unlinkSync(destPath); } catch { /* ignore */ }
          reject(new Error(`File too large (>${(maxBytes / 1024 / 1024).toFixed(0)}MB)`));
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });

      file.on('error', (err) => {
        file.close();
        try { fs.unlinkSync(destPath); } catch { /* ignore */ }
        reject(err);
      });
    }).on('error', (err) => {
      file.close();
      try { fs.unlinkSync(destPath); } catch { /* ignore */ }
      reject(err);
    });
  });
}

/**
 * Download a NIM media file and return an IMMediaAttachment
 *
 * @param url NOS media URL
 * @param attachment The V2 message's attachment object
 * @param mediaType Message type (image/audio/video/file)
 * @param log Logging function
 */
export async function downloadNimMedia(
  url: string,
  attachment: {
    name?: string;
    size?: number;
    width?: number;
    height?: number;
    duration?: number;
  },
  mediaType: 'image' | 'audio' | 'video' | 'file',
  log: (...args: any[]) => void = console.log,
): Promise<IMMediaAttachment | null> {
  if (!url) {
    return null;
  }

  try {
    // Extract the extension from the URL
    const urlPath = url.split('?')[0];
    const ext = path.extname(urlPath) || '.bin';
    const fileName = attachment.name || `nim_${Date.now()}${ext}`;
    const localFileName = generateFileName('nim', ext);

    const mediaDir = getNimMediaDir();
    const localPath = path.join(mediaDir, localFileName);

    log(`[NIM Media] Downloading: ${url.substring(0, 80)}...`);

    // Streamed download
    await downloadFile(url, localPath, MAX_FILE_SIZE);

    // Get the actual file size
    const stats = fs.statSync(localPath);
    const mimeType = inferMimeType(localPath);

    log(`[NIM Media] Downloaded: ${localFileName} (${(stats.size / 1024).toFixed(1)} KB)`);

    return {
      type: toIMMediaType(mediaType),
      localPath,
      mimeType,
      fileName,
      fileSize: stats.size,
      width: attachment.width,
      height: attachment.height,
      duration: attachment.duration,
    };
  } catch (error: any) {
    log(`[NIM Media] Download failed: ${error.message}`);
    return null;
  }
}

// ==================== Send ====================

/**
 * Send a media message through the NIM SDK
 *
 * @param messageService V2NIMMessageService instance
 * @param messageCreator V2NIMMessageCreator instance
 * @param conversationId Target conversation ID
 * @param filePath Local file path
 * @param log Logging function
 */
export async function sendNimMediaMessage(
  messageService: any,
  messageCreator: any,
  conversationId: string,
  filePath: string,
  log: (...args: any[]) => void = console.log,
): Promise<void> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  /** Maximum send size: 100MB */
  const MAX_SEND_FILE_SIZE = 100 * 1024 * 1024;
  const fileSize = fs.statSync(filePath).size;
  if (fileSize > MAX_SEND_FILE_SIZE) {
    throw new Error(
      `File too large: ${(fileSize / 1024 / 1024).toFixed(1)}MB, exceeds the 100MB send limit`,
    );
  }

  const mediaType = inferMediaType(filePath);
  const baseName = path.basename(filePath);
  let message: any;

  switch (mediaType) {
    case 'image':
      // createImageMessage(filePath, name, sceneName, width, height)
      message = messageCreator.createImageMessage(filePath, baseName, '', 0, 0);
      break;

    case 'audio':
      // createAudioMessage(filePath, name, sceneName, duration)
      message = messageCreator.createAudioMessage?.(filePath, baseName, '', 0);
      break;

    case 'video':
      // createVideoMessage(filePath, name, sceneName, duration, width, height)
      // Defaults to 1920x1080, same as openclaw-nim/src/outbound.ts
      message = messageCreator.createVideoMessage?.(filePath, baseName, '', 0, 1920, 1080);
      break;

    case 'file':
    default:
      // createFileMessage(filePath, name, sceneName)
      message = messageCreator.createFileMessage(filePath, baseName, '');
      break;
  }

  if (!message) {
    throw new Error(`Failed to create ${mediaType} message for: ${baseName}`);
  }

  log(`[NIM Media] Sending ${mediaType}: ${baseName} to ${conversationId}`);
  const result = await messageService.sendMessage(message, conversationId, {}, () => {});
  log(`[NIM Media] Send result:`, result);
}

// ==================== Cleanup ====================

/**
 * Remove expired NIM media files
 * @param maxAgeDays Maximum retention in days, default 7
 */
export function cleanupOldNimMediaFiles(maxAgeDays: number = 7): void {
  const mediaDir = getNimMediaDir();
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
      } catch (err: any) {
        console.warn(`[NIM Media] Failed to check/delete file ${file}: ${err.message}`);
      }
    }

    if (cleanedCount > 0) {
      console.log(`[NIM Media] Cleaned up ${cleanedCount} old files`);
    }
  } catch (error: any) {
    console.warn(`[NIM Media] Cleanup error: ${error.message}`);
  }
}
