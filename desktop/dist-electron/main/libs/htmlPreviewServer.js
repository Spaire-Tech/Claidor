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
exports.startHtmlPreviewServer = startHtmlPreviewServer;
exports.stopHtmlPreviewServer = stopHtmlPreviewServer;
exports.createPreviewSession = createPreviewSession;
exports.createOfficePreviewSession = createOfficePreviewSession;
exports.destroyPreviewSession = destroyPreviewSession;
exports.isPreviewServerUrl = isPreviewServerUrl;
const crypto = __importStar(require("node:crypto"));
const fs = __importStar(require("node:fs"));
const http = __importStar(require("node:http"));
const path = __importStar(require("node:path"));
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.ico': 'image/x-icon',
    '.bmp': 'image/bmp',
    '.tiff': 'image/tiff',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'font/otf',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.wasm': 'application/wasm',
    '.pdf': 'application/pdf',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.zip': 'application/zip',
    '.map': 'application/json',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.ts': 'text/javascript; charset=utf-8',
    '.tsx': 'text/javascript; charset=utf-8',
    '.jsx': 'text/javascript; charset=utf-8',
};
let server = null;
let serverPort = null;
const sessions = new Map();
function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return MIME_TYPES[ext] || 'application/octet-stream';
}
function getPptxPreviewUmdPath() {
    return require.resolve('pptx-preview/dist/pptx-preview.umd.js');
}
function writePreviewHeaders(res, statusCode, headers = {}, includePreviewCsp = false) {
    const responseHeaders = {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
        ...headers,
    };
    if (includePreviewCsp) {
        responseHeaders['Content-Security-Policy'] = [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: http: https:",
            "font-src 'self' data: blob:",
            "media-src 'self' data: blob:",
            "connect-src 'self' data: blob:",
            "worker-src 'self' blob:",
        ].join('; ');
    }
    res.writeHead(statusCode, {
        ...responseHeaders,
    });
}
function streamFile(filePath, res) {
    fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
            res.writeHead(404);
            res.end('Not Found');
            return;
        }
        writePreviewHeaders(res, 200, {
            'Content-Type': getMimeType(filePath),
            'Content-Length': stat.size,
        });
        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
        stream.on('error', () => {
            if (!res.headersSent) {
                res.writeHead(500);
            }
            res.end();
        });
    });
}
function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
function buildPptxPreviewPage(sessionId, token, fileName) {
    const sourceUrl = `/${sessionId}/__office_preview__/source.pptx?token=${encodeURIComponent(token)}`;
    const vendorUrl = `/${sessionId}/__office_preview__/pptx-preview.umd.js?token=${encodeURIComponent(token)}`;
    const title = escapeHtml(fileName);
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; background: #f3f4f6; color: #111827; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { padding: 16px; overflow-y: auto; }
    #status { min-height: 40px; display: flex; align-items: center; justify-content: center; color: #6b7280; font-size: 13px; }
    #pptx-wrapper { width: 100%; min-height: 100px; }
    .pptx-preview-wrapper { background: transparent !important; width: 100% !important; max-width: 100% !important; margin: 0 auto !important; overflow: visible !important; }
    .pptx-preview-slide-wrapper { max-width: 100% !important; margin: 0 auto 16px !important; box-shadow: 0 2px 8px rgba(0,0,0,0.12); border-radius: 4px; overflow: hidden; background: #fff; }
    .pptx-preview-slide-wrapper img { max-width: none; }
    .error { color: #dc2626; white-space: pre-wrap; padding: 16px; }
  </style>
</head>
<body>
  <div id="status">Loading...</div>
  <div id="pptx-wrapper"></div>
  <script src="${vendorUrl}"></script>
  <script>
    (function () {
      var status = document.getElementById('status');
      var wrapper = document.getElementById('pptx-wrapper');
      var sourceUrl = ${JSON.stringify(sourceUrl)};
      var previewer = null;

      function setStatus(message, isError) {
        status.textContent = message;
        status.className = isError ? 'error' : '';
      }

      function getRenderWidth() {
        return Math.max(320, Math.min(1200, document.documentElement.clientWidth - 32));
      }

      async function render() {
        try {
          var api = window.pptxPreview;
          if (!api || typeof api.init !== 'function') {
            throw new Error('pptx-preview runtime failed to load');
          }
          var response = await fetch(sourceUrl, { cache: 'no-store' });
          if (!response.ok) {
            throw new Error('failed to load PPTX: ' + response.status + ' ' + response.statusText);
          }
          var data = await response.arrayBuffer();
          wrapper.innerHTML = '';
          previewer = api.init(wrapper, { width: getRenderWidth(), mode: 'list' });
          await previewer.preview(data);
          status.remove();
        } catch (error) {
          setStatus(error && error.message ? error.message : String(error), true);
        }
      }

      window.addEventListener('beforeunload', function () {
        if (previewer && typeof previewer.destroy === 'function') previewer.destroy();
      });
      render();
    })();
  </script>
</body>
</html>`;
}
function handlePptxPreviewRequest(relativePath, sessionId, session, res) {
    if (relativePath === '__office_preview__/index.html') {
        const html = buildPptxPreviewPage(sessionId, session.token, path.basename(session.filePath));
        writePreviewHeaders(res, 200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Length': Buffer.byteLength(html),
        }, true);
        res.end(html);
        return;
    }
    if (relativePath === '__office_preview__/source.pptx') {
        streamFile(session.filePath, res);
        return;
    }
    if (relativePath === '__office_preview__/pptx-preview.umd.js') {
        streamFile(getPptxPreviewUmdPath(), res);
        return;
    }
    res.writeHead(404);
    res.end('Not Found');
}
function extractTokenFromReferer(req) {
    const referer = req.headers.referer;
    if (!referer)
        return null;
    try {
        const refererUrl = new URL(referer);
        return refererUrl.searchParams.get('token');
    }
    catch {
        return null;
    }
}
function handleRequest(req, res) {
    if (!req.url) {
        res.writeHead(400);
        res.end('Bad Request');
        return;
    }
    const parsedUrl = new URL(req.url, `http://127.0.0.1:${serverPort}`);
    const pathname = decodeURIComponent(parsedUrl.pathname);
    const token = parsedUrl.searchParams.get('token') || extractTokenFromReferer(req);
    // URL format: /{sessionId}/relative/path/to/file
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length < 1) {
        res.writeHead(404);
        res.end('Not Found');
        return;
    }
    const sessionId = parts[0];
    const session = sessions.get(sessionId);
    if (!session) {
        res.writeHead(404);
        res.end('Session Not Found');
        return;
    }
    if (token !== session.token) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }
    const relativePath = parts.slice(1).join('/') || path.basename(session.filePath);
    if (session.kind === 'pptx' && relativePath.startsWith('__office_preview__/')) {
        handlePptxPreviewRequest(relativePath, sessionId, session, res);
        return;
    }
    const resolvedPath = path.resolve(session.rootDir, relativePath);
    // Path traversal protection
    if (!resolvedPath.startsWith(session.rootDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }
    streamFile(resolvedPath, res);
}
async function startHtmlPreviewServer() {
    if (server && serverPort) {
        return serverPort;
    }
    return new Promise((resolve, reject) => {
        const s = http.createServer((req, res) => {
            try {
                handleRequest(req, res);
            }
            catch (e) {
                console.error('[HtmlPreviewServer] Request error:', e);
                if (!res.headersSent) {
                    res.writeHead(500);
                }
                res.end();
            }
        });
        s.on('error', (err) => {
            console.error('[HtmlPreviewServer] Server error:', err);
            reject(err);
        });
        s.listen(0, '127.0.0.1', () => {
            const addr = s.address();
            if (addr && typeof addr === 'object') {
                serverPort = addr.port;
                server = s;
                console.log(`[HtmlPreviewServer] Started on port ${serverPort}`);
                resolve(serverPort);
            }
            else {
                reject(new Error('Failed to get server address'));
            }
        });
    });
}
async function stopHtmlPreviewServer() {
    if (!server)
        return;
    const activeServer = server;
    server = null;
    serverPort = null;
    sessions.clear();
    // Bounded shutdown: server.close() waits for open preview connections
    // (e.g. a renderer webview keeping keep-alive sockets), so force-close
    // stragglers after a short drain window and cap the total wait.
    return new Promise((resolve) => {
        let settled = false;
        let drainTimer = null;
        let deadlineTimer = null;
        const settle = () => {
            if (settled)
                return;
            settled = true;
            if (drainTimer)
                clearTimeout(drainTimer);
            if (deadlineTimer)
                clearTimeout(deadlineTimer);
            console.log('[HtmlPreviewServer] Stopped');
            resolve();
        };
        drainTimer = setTimeout(() => activeServer.closeAllConnections(), 1_000);
        deadlineTimer = setTimeout(settle, 3_000);
        activeServer.close(() => settle());
    });
}
async function createPreviewSession(filePath) {
    const resolvedFilePath = path.resolve(filePath);
    const stat = await fs.promises.stat(resolvedFilePath);
    if (!stat.isFile()) {
        throw new Error('Preview target is not a file');
    }
    const port = await startHtmlPreviewServer();
    const sessionId = crypto.randomBytes(16).toString('hex');
    const token = crypto.randomBytes(24).toString('hex');
    const rootDir = path.dirname(resolvedFilePath) + path.sep;
    const fileName = path.basename(resolvedFilePath);
    sessions.set(sessionId, { rootDir, token, filePath: resolvedFilePath, kind: 'html' });
    const url = `http://127.0.0.1:${port}/${sessionId}/${encodeURIComponent(fileName)}?token=${token}`;
    return { sessionId, url };
}
async function createOfficePreviewSession(filePath) {
    const port = await startHtmlPreviewServer();
    const sessionId = crypto.randomBytes(16).toString('hex');
    const token = crypto.randomBytes(24).toString('hex');
    const resolvedFilePath = path.resolve(filePath);
    const rootDir = path.dirname(resolvedFilePath) + path.sep;
    sessions.set(sessionId, { rootDir, token, filePath: resolvedFilePath, kind: 'pptx' });
    const url = `http://127.0.0.1:${port}/${sessionId}/__office_preview__/index.html?token=${token}`;
    return { sessionId, url };
}
function destroyPreviewSession(sessionId) {
    sessions.delete(sessionId);
}
function isPreviewServerUrl(url) {
    if (!serverPort)
        return false;
    try {
        const parsed = new URL(url);
        return parsed.hostname === '127.0.0.1' && parsed.port === String(serverPort);
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=htmlPreviewServer.js.map