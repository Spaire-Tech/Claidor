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
exports.scanSkillSecurity = scanSkillSecurity;
exports.scanMultipleSkillDirs = scanMultipleSkillDirs;
exports.mergeReports = mergeReports;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const skillSecurityRules_1 = require("./skillSecurityRules");
const skillSecurityPromptAudit_1 = require("./skillSecurityPromptAudit");
const MAX_FILES = 500;
const MAX_FILE_SIZE_BYTES = 512 * 1024;
const MAX_FINDINGS = 100;
const SCAN_TIMEOUT_MS = 5000;
const SKIP_DIRS = new Set(['node_modules', '.git', '__pycache__', '.svn', '.hg']);
const JS_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts']);
const SKILL_FILE_NAME = 'SKILL.md';
const JSXRAY_WARNING_MAP = {
    'data-exfiltration': { dimension: 'network', severity: 'critical' },
    'unsafe-command': { dimension: 'dangerous_command', severity: 'danger' },
    'obfuscated-code': { dimension: 'process', severity: 'critical' },
    'encoded-literal': { dimension: 'network', severity: 'warning' },
    'unsafe-stmt': { dimension: 'dangerous_command', severity: 'danger' },
    'serialize-environment': { dimension: 'file_access', severity: 'info' },
    'shady-link': { dimension: 'network', severity: 'warning' },
    'unsafe-import': { dimension: 'process', severity: 'info' },
    'weak-crypto': { dimension: 'network', severity: 'info' },
    'suspicious-file': { dimension: 'process', severity: 'critical' },
    'insecure-random': { dimension: 'network', severity: 'info' },
    'monkey-patch': { dimension: 'process', severity: 'warning' },
    'prototype-pollution': { dimension: 'process', severity: 'danger' },
    'sql-injection': { dimension: 'dangerous_command', severity: 'danger' },
};
// ── Scoring ───────────────────────────────────────────────────────────────────
const SEVERITY_SCORES = {
    info: 0,
    warning: 5,
    danger: 20,
    critical: 50,
};
function computeRiskScore(findings) {
    let score = 0;
    for (const f of findings) {
        score += SEVERITY_SCORES[f.severity];
    }
    return Math.min(score, 100);
}
function riskScoreToLevel(score) {
    if (score === 0)
        return 'safe';
    if (score <= 10)
        return 'low';
    if (score <= 30)
        return 'medium';
    if (score <= 70)
        return 'high';
    return 'critical';
}
// ── File collection ───────────────────────────────────────────────────────────
function collectScannableFiles(rootDir) {
    const files = [];
    const seen = new Set();
    const queue = [rootDir];
    while (queue.length > 0 && files.length < MAX_FILES) {
        const current = queue.shift();
        const resolved = path.resolve(current);
        if (seen.has(resolved))
            continue;
        seen.add(resolved);
        let entries;
        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            if (files.length >= MAX_FILES)
                break;
            if (!entry.name || entry.name.startsWith('.') && SKIP_DIRS.has(entry.name))
                continue;
            if (SKIP_DIRS.has(entry.name))
                continue;
            const fullPath = path.join(current, entry.name);
            if (entry.isSymbolicLink()) {
                // Skip symlinks to avoid loops and escapes
                continue;
            }
            if (entry.isDirectory()) {
                queue.push(fullPath);
                continue;
            }
            if (entry.isFile()) {
                try {
                    const stat = fs.statSync(fullPath);
                    if (stat.size > MAX_FILE_SIZE_BYTES)
                        continue;
                    if (stat.size === 0)
                        continue;
                }
                catch {
                    continue;
                }
                // Skip binary files (check first 512 bytes for null bytes)
                try {
                    const buf = Buffer.alloc(512);
                    const fd = fs.openSync(fullPath, 'r');
                    const bytesRead = fs.readSync(fd, buf, 0, 512, 0);
                    fs.closeSync(fd);
                    if (buf.subarray(0, bytesRead).includes(0))
                        continue;
                }
                catch {
                    continue;
                }
                const ext = path.extname(entry.name).toLowerCase();
                files.push({
                    absolutePath: fullPath,
                    relativePath: path.relative(rootDir, fullPath),
                    extension: ext,
                });
            }
        }
    }
    return files;
}
// ── Regex engine scan ─────────────────────────────────────────────────────────
function scanFileWithRegex(file, content) {
    const findings = [];
    const rules = (0, skillSecurityRules_1.getRulesForFile)(file.relativePath);
    if (rules.length === 0)
        return findings;
    const lines = content.split('\n');
    for (const rule of rules) {
        for (const pattern of rule.patterns) {
            for (let i = 0; i < lines.length; i++) {
                if (pattern.test(lines[i])) {
                    findings.push({
                        dimension: rule.dimension,
                        severity: rule.severity,
                        ruleId: rule.id,
                        file: file.relativePath,
                        line: i + 1,
                        matchedPattern: lines[i].trim().substring(0, 200),
                        description: rule.description,
                    });
                    break; // One match per pattern per file
                }
            }
        }
    }
    return findings;
}
// ── package.json audit ────────────────────────────────────────────────────────
function auditPackageJson(pkgPath, relativePath) {
    const findings = [];
    try {
        const content = fs.readFileSync(pkgPath, 'utf-8');
        const pkg = JSON.parse(content);
        // Check for suspicious install scripts
        const scripts = pkg.scripts || {};
        const dangerousScripts = ['preinstall', 'install', 'postinstall'];
        for (const scriptName of dangerousScripts) {
            if (scripts[scriptName]) {
                findings.push({
                    dimension: 'process',
                    severity: 'warning',
                    ruleId: 'package.install_script',
                    file: relativePath,
                    matchedPattern: `${scriptName}: ${String(scripts[scriptName]).substring(0, 200)}`,
                    description: 'securityFindingInstallScript',
                });
            }
        }
    }
    catch {
        // Ignore parse errors
    }
    return findings;
}
// ── js-x-ray engine ──────────────────────────────────────────────────────────
let jsxrayModule = null;
let jsxrayLoadFailed = false;
async function loadJsxray() {
    if (jsxrayModule)
        return jsxrayModule;
    if (jsxrayLoadFailed)
        return null;
    try {
        // Use indirect import() to prevent tsc from converting it to require().
        // js-x-ray is ESM-only; CJS require() cannot load it.
        const dynamicImport = new Function('specifier', 'return import(specifier)');
        jsxrayModule = await dynamicImport('@nodesecure/js-x-ray');
        return jsxrayModule;
    }
    catch (err) {
        console.warn('[SkillSecurity] Failed to load @nodesecure/js-x-ray:', err);
        jsxrayLoadFailed = true;
        return null;
    }
}
async function scanFileWithJsxray(file, content) {
    const findings = [];
    const mod = await loadJsxray();
    if (!mod)
        return findings;
    try {
        const analyser = new mod.AstAnalyser({ sensitivity: 'aggressive' });
        const result = analyser.analyse(content, { module: false });
        if (result.warnings && Array.isArray(result.warnings)) {
            for (const warning of result.warnings) {
                const mapping = JSXRAY_WARNING_MAP[warning.kind];
                if (!mapping)
                    continue;
                const line = warning.location?.[0]?.start?.line
                    ?? warning.location?.start?.line
                    ?? undefined;
                findings.push({
                    dimension: mapping.dimension,
                    severity: mapping.severity,
                    ruleId: `jsxray.${warning.kind}`,
                    file: file.relativePath,
                    line,
                    matchedPattern: String(warning.value ?? warning.source ?? warning.kind).substring(0, 200),
                    description: `securityFindingJsxray_${warning.kind.replace(/-/g, '_')}`,
                });
            }
        }
    }
    catch (err) {
        // AST parse failure — record as info, don't block scanning
        findings.push({
            dimension: 'process',
            severity: 'info',
            ruleId: 'jsxray.parse_error',
            file: file.relativePath,
            matchedPattern: `Parse error: ${err instanceof Error ? err.message : 'unknown'}`.substring(0, 200),
            description: 'securityFindingParseError',
        });
    }
    return findings;
}
// ── Build dimension summary ──────────────────────────────────────────────────
function buildDimensionSummary(findings) {
    const summary = {};
    const severityOrder = ['info', 'warning', 'danger', 'critical'];
    for (const f of findings) {
        const existing = summary[f.dimension];
        if (!existing) {
            summary[f.dimension] = { count: 1, maxSeverity: f.severity };
        }
        else {
            existing.count++;
            if (severityOrder.indexOf(f.severity) > severityOrder.indexOf(existing.maxSeverity)) {
                existing.maxSeverity = f.severity;
            }
        }
    }
    return summary;
}
// ── Parse SKILL.md metadata ──────────────────────────────────────────────────
function parseSkillName(skillDir) {
    const skillMdPath = path.join(skillDir, SKILL_FILE_NAME);
    try {
        const content = fs.readFileSync(skillMdPath, 'utf-8');
        const nameMatch = /^name:\s*(.+)$/m.exec(content);
        if (nameMatch)
            return nameMatch[1].trim();
    }
    catch {
        // Ignore
    }
    return path.basename(skillDir);
}
// ── Main scanner ─────────────────────────────────────────────────────────────
async function scanSkillSecurity(skillDir) {
    const startTime = Date.now();
    const allFindings = [];
    const skillName = parseSkillName(skillDir);
    try {
        // 1. Collect scannable files
        const files = collectScannableFiles(skillDir);
        // 2. Scan each file
        for (const file of files) {
            if (Date.now() - startTime > SCAN_TIMEOUT_MS - 500)
                break;
            if (allFindings.length >= MAX_FINDINGS)
                break;
            let content;
            try {
                content = fs.readFileSync(file.absolutePath, 'utf-8');
            }
            catch {
                continue;
            }
            // SKILL.md → prompt injection audit
            if (path.basename(file.absolutePath) === SKILL_FILE_NAME) {
                const promptFindings = (0, skillSecurityPromptAudit_1.scanPromptInjection)(content, file.relativePath);
                allFindings.push(...promptFindings);
                continue;
            }
            // JS/TS → js-x-ray AST analysis
            if (JS_EXTENSIONS.has(file.extension)) {
                const jsFindings = await scanFileWithJsxray(file, content);
                allFindings.push(...jsFindings);
                // Also run regex rules for JS files (catch patterns js-x-ray might miss)
                const regexFindings = scanFileWithRegex(file, content);
                allFindings.push(...regexFindings);
                continue;
            }
            // All other files → regex engine
            const regexFindings = scanFileWithRegex(file, content);
            allFindings.push(...regexFindings);
        }
        // 3. Audit package.json if present
        const pkgJsonPath = path.join(skillDir, 'package.json');
        if (fs.existsSync(pkgJsonPath)) {
            const pkgFindings = auditPackageJson(pkgJsonPath, 'package.json');
            allFindings.push(...pkgFindings);
        }
        // Also check scripts/package.json
        const scriptsPkgPath = path.join(skillDir, 'scripts', 'package.json');
        if (fs.existsSync(scriptsPkgPath)) {
            const scriptsPkgFindings = auditPackageJson(scriptsPkgPath, 'scripts/package.json');
            allFindings.push(...scriptsPkgFindings);
        }
    }
    catch (err) {
        console.warn('[SkillSecurity] Scan error (non-blocking):', err);
    }
    // Deduplicate: same ruleId + same file → keep only the first occurrence
    const seen = new Set();
    const deduped = [];
    for (const f of allFindings) {
        const key = `${f.ruleId}::${f.file}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        deduped.push(f);
    }
    const truncatedFindings = deduped.slice(0, MAX_FINDINGS);
    const riskScore = computeRiskScore(truncatedFindings);
    return {
        scannedAt: Date.now(),
        skillName,
        riskLevel: riskScoreToLevel(riskScore),
        riskScore,
        findings: truncatedFindings,
        dimensionSummary: buildDimensionSummary(truncatedFindings),
        scanDurationMs: Date.now() - startTime,
    };
}
/**
 * Scan multiple skill directories and merge results.
 * Used when a download source contains multiple skills.
 */
async function scanMultipleSkillDirs(skillDirs) {
    const reports = [];
    for (const dir of skillDirs) {
        reports.push(await scanSkillSecurity(dir));
    }
    return reports;
}
/**
 * Merge multiple reports into one aggregate report.
 */
function mergeReports(reports) {
    if (reports.length === 0)
        return null;
    if (reports.length === 1)
        return reports[0];
    const allFindings = [];
    let maxRiskScore = 0;
    const names = [];
    for (const r of reports) {
        allFindings.push(...r.findings);
        if (r.riskScore > maxRiskScore)
            maxRiskScore = r.riskScore;
        names.push(r.skillName);
    }
    const truncated = allFindings.slice(0, MAX_FINDINGS);
    const score = Math.max(computeRiskScore(truncated), maxRiskScore);
    return {
        scannedAt: Date.now(),
        skillName: names.join(', '),
        riskLevel: riskScoreToLevel(score),
        riskScore: score,
        findings: truncated,
        dimensionSummary: buildDimensionSummary(truncated),
        scanDurationMs: reports.reduce((sum, r) => sum + r.scanDurationMs, 0),
    };
}
//# sourceMappingURL=skillSecurityScanner.js.map