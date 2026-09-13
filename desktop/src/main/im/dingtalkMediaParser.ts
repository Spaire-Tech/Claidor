/**
 * DingTalk Media Marker Parser
 * Parses media markers out of text.
 */
import type { MediaMarker } from './types';

// File extension categories
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'amr', 'm4a', 'aac'];
const VIDEO_EXTENSIONS = ['mp4', 'mov'];
// Document/file extensions (not media types, but must be sent as files)
const FILE_EXTENSIONS = [
  'txt', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'zip', 'rar', '7z', 'tar', 'gz',
  'json', 'xml', 'csv', 'md', 'html', 'htm',
  'js', 'ts', 'py', 'java', 'c', 'cpp', 'h', 'cs', 'go', 'rs', 'rb', 'php', 'sh',
];

// Regular expression patterns
// Markdown image: ![alt](path) - matches local paths
// Supports: the file:/// protocol, common system paths, and user-directory paths such as ~/.maties
const MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\(((?:file:\/\/\/|\/(?:tmp|var|private|Users|home|root)|~\/|[A-Za-z]:)[^)]+)\)/g;

// Markdown link: [text](path) - matches local media file paths
// Used to recognise audio/video files in plain links
const MARKDOWN_LINK_RE = /\[([^\]]*)\]\(((?:file:\/\/\/|\/(?:tmp|var|private|Users|home|root)|~\/|[A-Za-z]:)[^)]+)\)/g;

// Bare image path: /path/to/image.png
const BARE_IMAGE_PATH_RE = /(?:^|\s)((?:\/(?:tmp|var|private|Users|home|root)\/[^\s`'",)]+|~\/[^\s`'",)]+|[A-Za-z]:[\\/][^\s`'",)]+)\.(?:png|jpg|jpeg|gif|bmp|webp))(?:\s|$|[,.])/gi;

// Bare audio/video path: /path/to/audio.mp3 or /path/to/video.mp4
const BARE_MEDIA_PATH_RE = /(?:^|\s)((?:\/(?:tmp|var|private|Users|home|root)\/[^\s`'",)]+|~\/[^\s`'",)]+|[A-Za-z]:[\\/][^\s`'",)]+)\.(?:mp3|wav|ogg|amr|m4a|aac|mp4|mov))(?:\s|$|[,.])/gi;

// Bare file path: /path/to/file.txt, /path/to/file.pdf, etc.
const BARE_FILE_PATH_RE = /(?:^|\s)((?:\/(?:tmp|var|private|Users|home|root)\/[^\s`'",)]+|~\/[^\s`'",)]+|[A-Za-z]:[\\/][^\s`'",)]+)\.(?:txt|pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|7z|tar|gz|json|xml|csv|md|html|htm|js|ts|py|java|c|cpp|h|cs|go|rs|rb|php|sh))(?:\s|$|[,.])/gi;

// Video marker: [DINGTALK_VIDEO]{"path":"..."}[/DINGTALK_VIDEO]
const VIDEO_MARKER_RE = /\[DINGTALK_VIDEO\](\{[\s\S]*?\})\[\/DINGTALK_VIDEO\]/g;

// Audio marker: [DINGTALK_AUDIO]{"path":"..."}[/DINGTALK_AUDIO]
const AUDIO_MARKER_RE = /\[DINGTALK_AUDIO\](\{[\s\S]*?\})\[\/DINGTALK_AUDIO\]/g;

// File marker: [DINGTALK_FILE]{"path":"...","name":"..."}[/DINGTALK_FILE]
const FILE_MARKER_RE = /\[DINGTALK_FILE\](\{[\s\S]*?\})\[\/DINGTALK_FILE\]/g;

/**
 * Determine the media type from the file extension
 */
function getMediaTypeByExtension(filePath: string): 'image' | 'audio' | 'video' | 'file' | null {
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (!ext) return null;
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
  if (AUDIO_EXTENSIONS.includes(ext)) return 'audio';
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  if (FILE_EXTENSIONS.includes(ext)) return 'file';
  return null;
}

/**
 * Clean a path (strip the file:// protocol, unescape spaces)
 */
function cleanPath(rawPath: string): string {
  let path = rawPath.replace(/\\ /g, ' ');
  if (path.startsWith('file:///')) {
    path = decodeURIComponent(path.replace('file://', ''));
  }
  return path;
}

/**
 * Parse all media markers in the text
 */
export function parseMediaMarkers(text: string): MediaMarker[] {
  const markers: MediaMarker[] = [];
  const processedPaths = new Set<string>();

  console.log(`[DingTalk MediaParser] Parsing media markers, text length: ${text.length}`);

  // 1. Parse Markdown images ![alt](path)
  for (const match of text.matchAll(MARKDOWN_IMAGE_RE)) {
    const [fullMatch, altText, rawPath] = match;
    const path = cleanPath(rawPath);
    // Use the alt text as the file name when present, otherwise derive it from the path
    const name = altText?.trim() || undefined;
    console.log(`[DingTalk MediaParser] Found Markdown image:`, JSON.stringify({ rawPath, cleanedPath: path, name, fullMatch }));
    if (!processedPaths.has(path)) {
      processedPaths.add(path);
      markers.push({
        type: 'image',
        path,
        name,
        originalMarker: fullMatch,
      });
    }
  }

  // 2. Parse media files in plain Markdown links [text](path)
  for (const match of text.matchAll(MARKDOWN_LINK_RE)) {
    const [fullMatch, linkText, rawPath] = match;
    const path = cleanPath(rawPath);
    const mediaType = getMediaTypeByExtension(path);
    // Use the link text as the file name when present
    const name = linkText?.trim() || undefined;
    console.log(`[DingTalk MediaParser] Found Markdown link:`, JSON.stringify({ rawPath, cleanedPath: path, mediaType, name, fullMatch }));
    if (mediaType && !processedPaths.has(path)) {
      processedPaths.add(path);
      markers.push({
        type: mediaType,
        path,
        name,
        originalMarker: fullMatch,
      });
    }
  }

  // 3. Parse bare image paths
  for (const match of text.matchAll(BARE_IMAGE_PATH_RE)) {
    const [fullMatch, rawPath] = match;
    const path = cleanPath(rawPath.trim());
    console.log(`[DingTalk MediaParser] Found bare image path:`, JSON.stringify({ rawPath, cleanedPath: path, fullMatch: fullMatch.trim() }));
    if (!processedPaths.has(path)) {
      processedPaths.add(path);
      markers.push({
        type: 'image',
        path,
        originalMarker: fullMatch.trim(),
      });
    }
  }

  // 4. Parse bare audio/video paths
  for (const match of text.matchAll(BARE_MEDIA_PATH_RE)) {
    const [fullMatch, rawPath] = match;
    const path = cleanPath(rawPath.trim());
    const mediaType = getMediaTypeByExtension(path);
    console.log(`[DingTalk MediaParser] Found bare media path:`, JSON.stringify({ rawPath, cleanedPath: path, mediaType, fullMatch: fullMatch.trim() }));
    if (mediaType && !processedPaths.has(path)) {
      processedPaths.add(path);
      markers.push({
        type: mediaType,
        path,
        originalMarker: fullMatch.trim(),
      });
    }
  }

  // 5. Parse bare file paths (txt, pdf, doc, etc.)
  for (const match of text.matchAll(BARE_FILE_PATH_RE)) {
    const [fullMatch, rawPath] = match;
    const path = cleanPath(rawPath.trim());
    console.log(`[DingTalk MediaParser] Found bare file path:`, JSON.stringify({ rawPath, cleanedPath: path, fullMatch: fullMatch.trim() }));
    if (!processedPaths.has(path)) {
      processedPaths.add(path);
      markers.push({
        type: 'file',
        path,
        originalMarker: fullMatch.trim(),
      });
    }
  }

  // 6. Parse video markers [DINGTALK_VIDEO]
  for (const match of text.matchAll(VIDEO_MARKER_RE)) {
    try {
      const info = JSON.parse(match[1]);
      console.log(`[DingTalk MediaParser] Found video marker:`, JSON.stringify({ info, fullMatch: match[0] }));
      if (info.path && !processedPaths.has(info.path)) {
        processedPaths.add(info.path);
        markers.push({
          type: 'video',
          path: info.path,
          name: info.title || info.name,
          originalMarker: match[0],
        });
      }
    } catch (e) {
      console.warn(`[DingTalk MediaParser] Failed to parse video marker:`, match[0], e);
    }
  }

  // 7. Parse audio markers [DINGTALK_AUDIO]
  for (const match of text.matchAll(AUDIO_MARKER_RE)) {
    try {
      const info = JSON.parse(match[1]);
      console.log(`[DingTalk MediaParser] Found audio marker:`, JSON.stringify({ info, fullMatch: match[0] }));
      if (info.path && !processedPaths.has(info.path)) {
        processedPaths.add(info.path);
        markers.push({
          type: 'audio',
          path: info.path,
          originalMarker: match[0],
        });
      }
    } catch (e) {
      console.warn(`[DingTalk MediaParser] Failed to parse audio marker:`, match[0], e);
    }
  }

  // 8. Parse file markers [DINGTALK_FILE]
  for (const match of text.matchAll(FILE_MARKER_RE)) {
    try {
      const info = JSON.parse(match[1]);
      console.log(`[DingTalk MediaParser] Found file marker:`, JSON.stringify({ info, fullMatch: match[0] }));
      if (info.path && !processedPaths.has(info.path)) {
        processedPaths.add(info.path);
        markers.push({
          type: 'file',
          path: info.path,
          name: info.name || info.fileName,
          originalMarker: match[0],
        });
      }
    } catch (e) {
      console.warn(`[DingTalk MediaParser] Failed to parse file marker:`, match[0], e);
    }
  }

  console.log(`[DingTalk MediaParser] Parsing finished, found ${markers.length} media markers:`, JSON.stringify(markers, null, 2));

  return markers;
}

/**
 * Remove processed media markers from the text
 */
export function stripMediaMarkers(text: string, markers: MediaMarker[]): string {
  let result = text;
  for (const marker of markers) {
    result = result.replace(marker.originalMarker, '');
  }
  // Collapse extra blank lines
  return result.replace(/\n{3,}/g, '\n\n').trim();
}
