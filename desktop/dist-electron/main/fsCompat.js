"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cpRecursiveSync = cpRecursiveSync;
/**
 * Safe recursive copy that bypasses fs.cpSync, which can crash (native-level)
 * when source paths contain non-ASCII characters (e.g. Chinese) on Windows
 * with certain Node.js/Electron versions.
 *
 * Uses fs.readdirSync + fs.copyFileSync as building blocks, which are proven
 * to handle non-ASCII paths correctly via libuv's wide-char API wrappers.
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function cpRecursiveSync(src, dest, opts = {}) {
    const { dereference = false, force = false } = opts;
    const stat = dereference ? fs_1.default.statSync(src) : fs_1.default.lstatSync(src);
    if (stat.isDirectory()) {
        if (!fs_1.default.existsSync(dest)) {
            fs_1.default.mkdirSync(dest, { recursive: true });
        }
        for (const entry of fs_1.default.readdirSync(src)) {
            cpRecursiveSync(path_1.default.join(src, entry), path_1.default.join(dest, entry), opts);
        }
    }
    else if (stat.isFile()) {
        if (fs_1.default.existsSync(dest) && !force) {
            return;
        }
        const destDir = path_1.default.dirname(dest);
        if (!fs_1.default.existsSync(destDir)) {
            fs_1.default.mkdirSync(destDir, { recursive: true });
        }
        fs_1.default.copyFileSync(src, dest);
    }
    else if (stat.isSymbolicLink()) {
        if (fs_1.default.existsSync(dest)) {
            if (!force)
                return;
            fs_1.default.unlinkSync(dest);
        }
        const target = fs_1.default.readlinkSync(src);
        fs_1.default.symlinkSync(target, dest);
    }
}
//# sourceMappingURL=fsCompat.js.map