"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PIP_WRAPPER_SH_TEMPLATE = exports.PIP_WRAPPER_CMD_TEMPLATE = exports.PIP_SHIM_INIT_TEMPLATE = exports.PIP_SHIM_MAIN_TEMPLATE = exports.PIP_SHIM_INIT_REL_PATH = exports.PIP_SHIM_MAIN_REL_PATH = exports.PIP_PYZ_REL_PATH = void 0;
exports.repairPipShims = repairPipShims;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// Canonical content of the LobsterAI-generated pip shim and wrapper files for
// the bundled Windows Python runtime. scripts/setup-python-runtime.js keeps a
// CJS copy of these templates for packaging time; pythonPipShim.test.ts asserts
// both copies stay byte-identical so the two can never drift again.
//
// This module must stay free of Electron imports so it remains unit-testable.
exports.PIP_PYZ_REL_PATH = path_1.default.join('tools', 'pip.pyz');
exports.PIP_SHIM_MAIN_REL_PATH = path_1.default.join('Lib', 'site-packages', 'pip', '__main__.py');
exports.PIP_SHIM_INIT_REL_PATH = path_1.default.join('Lib', 'site-packages', 'pip', '__init__.py');
exports.PIP_SHIM_MAIN_TEMPLATE = [
    'import pathlib',
    'import runpy',
    'import sys',
    '',
    'root = pathlib.Path(__file__).resolve().parents[3]',
    "pip_pyz = root / 'tools' / 'pip.pyz'",
    'if not pip_pyz.exists():',
    "    raise SystemExit(f'pip runtime archive missing: {pip_pyz}')",
    '',
    '# Ensure pip imports resolve to the zipapp payload, not this shim package.',
    'sys.path.insert(0, str(pip_pyz))',
    'for name in list(sys.modules):',
    "    if name == 'pip' or name.startswith('pip.'):",
    '        del sys.modules[name]',
    '',
    "sys.argv[0] = 'pip'",
    "runpy.run_module('pip', run_name='__main__', alter_sys=True)",
    '',
].join('\n');
exports.PIP_SHIM_INIT_TEMPLATE = '';
exports.PIP_WRAPPER_CMD_TEMPLATE = [
    '@echo off',
    'setlocal',
    'set "PYROOT=%~dp0.."',
    '"%PYROOT%\\python.exe" -m pip %*',
    '',
].join('\r\n');
exports.PIP_WRAPPER_SH_TEMPLATE = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
    'PYROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"',
    'exec "${PYROOT}/python.exe" -m pip "$@"',
    '',
].join('\n');
// A pip module dir is "ours" when its __main__.py redirects through pip.pyz —
// true for every historical LobsterAI shim, never for a real pip package
// (e.g. copied from a host Python or installed by get-pip/`pip install pip`).
const PIP_SHIM_OWNERSHIP_MARKER = 'pip.pyz';
const PIP_WRAPPER_OWNERSHIP_MARKER = '-m pip';
const PIP_WRAPPER_FILES = [
    { relPath: path_1.default.join('Scripts', 'pip.cmd'), template: exports.PIP_WRAPPER_CMD_TEMPLATE },
    { relPath: path_1.default.join('Scripts', 'pip3.cmd'), template: exports.PIP_WRAPPER_CMD_TEMPLATE },
    { relPath: path_1.default.join('Scripts', 'pip'), template: exports.PIP_WRAPPER_SH_TEMPLATE },
    { relPath: path_1.default.join('Scripts', 'pip3'), template: exports.PIP_WRAPPER_SH_TEMPLATE },
];
function readTextIfExists(filePath) {
    try {
        return fs_1.default.readFileSync(filePath, 'utf8');
    }
    catch {
        return null;
    }
}
/**
 * Converge LobsterAI-owned pip shim/wrapper files to the current templates.
 *
 * Runtimes deployed by older app versions keep whatever shim they were synced
 * with (the health checks only test file existence), so a broken shim would
 * otherwise survive every upgrade. Rewriting is guarded by ownership markers:
 * a real pip package installed into the runtime is never touched, and user
 * packages in site-packages are never affected.
 */
function repairPipShims(rootDir) {
    const changed = [];
    const write = (relPath, content) => {
        const fullPath = path_1.default.join(rootDir, relPath);
        if (readTextIfExists(fullPath) === content) {
            return;
        }
        fs_1.default.mkdirSync(path_1.default.dirname(fullPath), { recursive: true });
        fs_1.default.writeFileSync(fullPath, content, 'utf8');
        changed.push(relPath);
    };
    const shimMain = readTextIfExists(path_1.default.join(rootDir, exports.PIP_SHIM_MAIN_REL_PATH));
    const ownsShim = shimMain === null
        ? fs_1.default.existsSync(path_1.default.join(rootDir, exports.PIP_PYZ_REL_PATH))
        : shimMain.includes(PIP_SHIM_OWNERSHIP_MARKER);
    if (!ownsShim) {
        return { changed };
    }
    write(exports.PIP_SHIM_MAIN_REL_PATH, exports.PIP_SHIM_MAIN_TEMPLATE);
    write(exports.PIP_SHIM_INIT_REL_PATH, exports.PIP_SHIM_INIT_TEMPLATE);
    for (const wrapper of PIP_WRAPPER_FILES) {
        const existing = readTextIfExists(path_1.default.join(rootDir, wrapper.relPath));
        if (existing !== null && !existing.includes(PIP_WRAPPER_OWNERSHIP_MARKER)) {
            continue;
        }
        write(wrapper.relPath, wrapper.template);
    }
    return { changed };
}
//# sourceMappingURL=pythonPipShim.js.map