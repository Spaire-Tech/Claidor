"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.packageNodeServiceDeployment = packageNodeServiceDeployment;
const child_process_1 = require("child_process");
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const promises_1 = require("stream/promises");
const util_1 = require("util");
const yazl_1 = __importDefault(require("yazl"));
const constants_1 = require("../../../shared/shareDeployment/constants");
const coworkUtil_1 = require("../coworkUtil");
const nodeServiceProjectAnalyzer_1 = require("./nodeServiceProjectAnalyzer");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const COMMAND_OUTPUT_TAIL_CHARS = 4000;
const COMMAND_OUTPUT_MAX_LINES = 24;
const COMMAND_MAX_BUFFER_BYTES = 4 * 1024 * 1024;
const NEXT_STANDALONE_START_COMMAND = 'node server.js';
const NITRO_OUTPUT_START_COMMAND = 'node .output/server/index.mjs';
const STATIC_BUILD_START_COMMAND = 'node server.js';
const STATIC_SITE_ENTRY_FILE = 'index.html';
const ANSI_ESCAPE_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g');
const NEXT_DOCUMENT_IMPORT_ERROR_PATTERN = /<Html>\s+should\s+not\s+be\s+imported\s+outside\s+of\s+pages\/_document/;
const MISSING_NODE_TOOL_PATTERN = /(?:^|\n)(?:.*?:\s*)?(node|npm|npx|pnpm|yarn)(?:\.cmd)?:\s+command not found\b/i;
const STALE_BUILD_OUTPUT_DIRECTORY_NAMES = [
    '.next',
    '.nuxt',
    '.svelte-kit',
    '.output',
    '.lobster-static-runtime',
    'dist',
    'build',
    'out',
];
async function writeZip(entries) {
    const tempDir = await fs_1.default.promises.mkdtemp(path_1.default.join(os_1.default.tmpdir(), 'lobster-node-deploy-'));
    const archivePath = path_1.default.join(tempDir, 'deployment.zip');
    const zipFile = new yazl_1.default.ZipFile();
    zipFile.on('error', (error) => {
        zipFile.outputStream.destroy(error);
    });
    for (const entry of entries) {
        zipFile.addFile(entry.absolutePath, entry.archiveName);
    }
    const outputStream = fs_1.default.createWriteStream(archivePath);
    const pipelinePromise = (0, promises_1.pipeline)(zipFile.outputStream, outputStream);
    zipFile.end();
    await pipelinePromise;
    const stat = await fs_1.default.promises.stat(archivePath);
    if (stat.size > nodeServiceProjectAnalyzer_1.NODE_SERVICE_DEPLOYMENT_LIMITS.MaxArchiveBytes) {
        throw new Error(`Deployment package is too large. The limit is ${Math.floor(nodeServiceProjectAnalyzer_1.NODE_SERVICE_DEPLOYMENT_LIMITS.MaxArchiveBytes / 1024 / 1024)}MB.`);
    }
    const buffer = await fs_1.default.promises.readFile(archivePath);
    return {
        archivePath,
        sourceSha256: crypto_1.default.createHash('sha256').update(buffer).digest('hex'),
        archiveBytes: stat.size,
    };
}
async function copyPackageEntries(entries, targetDirectory) {
    await fs_1.default.promises.mkdir(targetDirectory, { recursive: true });
    for (const entry of entries) {
        const destination = path_1.default.join(targetDirectory, entry.archiveName);
        const parent = path_1.default.dirname(destination);
        await fs_1.default.promises.mkdir(parent, { recursive: true });
        await fs_1.default.promises.copyFile(entry.absolutePath, destination);
    }
}
function shellCommandArgs(command) {
    if (process.platform === 'win32') {
        return {
            file: process.env.ComSpec || 'cmd.exe',
            args: ['/d', '/s', '/c', command],
        };
    }
    return {
        file: '/bin/sh',
        args: ['-lc', command],
    };
}
function commandEnvironment(baseEnv, port, extraEnv) {
    const portValue = String(port || 8000);
    const env = { ...baseEnv };
    delete env.NODE_ENV;
    delete env.NEXT_RUNTIME;
    delete env.NEXT_PHASE;
    delete env.__NEXT_PROCESSED_ENV;
    return {
        ...env,
        CI: 'true',
        PORT: portValue,
        HOST: '0.0.0.0',
        HOSTNAME: '0.0.0.0',
        ...extraEnv,
    };
}
function outputTail(value) {
    return value.length <= COMMAND_OUTPUT_TAIL_CHARS
        ? value
        : value.slice(value.length - COMMAND_OUTPUT_TAIL_CHARS);
}
function commandOutputPathAliases(projectDirectory) {
    const normalizedProjectDirectory = path_1.default.resolve(projectDirectory);
    const aliases = new Set([normalizedProjectDirectory]);
    if (normalizedProjectDirectory.startsWith('/var/')) {
        aliases.add(`/private${normalizedProjectDirectory}`);
    }
    else if (normalizedProjectDirectory.startsWith('/private/var/')) {
        aliases.add(normalizedProjectDirectory.slice('/private'.length));
    }
    return Array.from(aliases).sort((a, b) => b.length - a.length);
}
function sanitizeCommandOutput(value, projectDirectory) {
    let output = value.replace(ANSI_ESCAPE_PATTERN, '');
    for (const alias of commandOutputPathAliases(projectDirectory)) {
        output = output.split(alias).join('<deployment-temp>/project');
    }
    return output.trim();
}
function commandFailureHint(label, output) {
    const missingToolMatch = output.match(MISSING_NODE_TOOL_PATTERN);
    if (missingToolMatch?.[1]) {
        return `Deployment could not find ${missingToolMatch[1]} in the prepared Node tool environment.`;
    }
    if (NEXT_DOCUMENT_IMPORT_ERROR_PATTERN.test(output)) {
        if (label !== 'build')
            return '';
        return [
            'Next.js build failed: <Html> from next/document can only be used in pages/_document.',
            'Remove that import from pages/components such as pages/404, or move document markup into pages/_document.',
        ].join(' ');
    }
    return '';
}
function conciseNextDocumentImportErrorOutput(output) {
    const seen = new Set();
    const lines = [];
    for (const line of output.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        if (!trimmed.includes('Error occurred prerendering page') &&
            !trimmed.includes('<Html> should not be imported outside of pages/_document') &&
            !trimmed.includes('nextjs.org/docs/messages/no-document-import-in-page')) {
            continue;
        }
        if (seen.has(trimmed))
            continue;
        seen.add(trimmed);
        lines.push(trimmed);
    }
    return lines.slice(0, COMMAND_OUTPUT_MAX_LINES).join('\n');
}
function formatCommandOutputForError(output) {
    if (NEXT_DOCUMENT_IMPORT_ERROR_PATTERN.test(output)) {
        return conciseNextDocumentImportErrorOutput(output);
    }
    return outputTail(output);
}
function errorOutput(error, projectDirectory) {
    const source = error;
    const stdout = typeof source.stdout === 'string' ? source.stdout.trim() : '';
    const stderr = typeof source.stderr === 'string' ? source.stderr.trim() : '';
    const message = typeof source.message === 'string' ? source.message.trim() : '';
    const sanitized = sanitizeCommandOutput([stderr, stdout, message].filter(Boolean).join('\n'), projectDirectory);
    return formatCommandOutputForError(sanitized);
}
async function runDeploymentCommand(projectDirectory, command, label, baseEnv, port, extraEnv) {
    const trimmed = command.trim();
    if (!trimmed)
        return;
    const shell = shellCommandArgs(trimmed);
    try {
        await execFileAsync(shell.file, shell.args, {
            cwd: projectDirectory,
            env: commandEnvironment(baseEnv, port, extraEnv),
            timeout: nodeServiceProjectAnalyzer_1.NODE_SERVICE_DEPLOYMENT_LIMITS.CommandTimeoutMs,
            maxBuffer: COMMAND_MAX_BUFFER_BYTES,
        });
    }
    catch (error) {
        const output = errorOutput(error, projectDirectory);
        const hint = commandFailureHint(label, output);
        throw new Error([
            `Node service deployment ${label} command failed: ${trimmed}`,
            hint,
            output,
        ].filter(Boolean).join('\n'));
    }
}
async function removeStaleBuildOutputs(projectDirectory) {
    await Promise.all(STALE_BUILD_OUTPUT_DIRECTORY_NAMES.map(directoryName => fs_1.default.promises.rm(path_1.default.join(projectDirectory, directoryName), { recursive: true, force: true })));
}
function pruneCommand(packageManager) {
    switch (packageManager) {
        case constants_1.ShareDeploymentPackageManager.Npm:
            return 'npm prune --omit=dev';
        case constants_1.ShareDeploymentPackageManager.Pnpm:
            return 'pnpm prune --prod';
        case constants_1.ShareDeploymentPackageManager.Yarn:
        default:
            return '';
    }
}
function effectiveCommand(value, fallback, options = {}) {
    const trimmed = value?.trim();
    if (trimmed)
        return trimmed;
    if (value !== undefined && !options.blankUsesFallback)
        return '';
    return fallback;
}
async function runProductionDependencyPrune(projectDirectory, packageManager, commandWarnings, baseEnv, port) {
    const prune = pruneCommand(packageManager);
    if (!prune)
        return;
    try {
        await runDeploymentCommand(projectDirectory, prune, 'production dependency pruning', baseEnv, port);
    }
    catch (error) {
        commandWarnings.push(error instanceof Error ? error.message : 'Production dependency pruning failed.');
    }
}
async function readPackageJson(projectDirectory) {
    try {
        const raw = await fs_1.default.promises.readFile(path_1.default.join(projectDirectory, 'package.json'), 'utf8');
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
function isNextPackageJson(packageJson) {
    return hasPackageDependency(packageJson, ['next']);
}
function hasPackageDependency(packageJson, packageNames) {
    const dependencies = {
        ...packageJson?.dependencies,
        ...packageJson?.devDependencies,
    };
    return packageNames.some(packageName => Boolean(dependencies[packageName]));
}
function isStaticBuildPackageJson(packageJson) {
    return hasPackageDependency(packageJson, [
        'vite',
        'react-scripts',
        '@vue/cli-service',
        '@angular/cli',
        'astro',
        'parcel',
        '@sveltejs/vite-plugin-svelte',
    ]);
}
async function shouldUseNextStandalonePackage(packageJson, buildCommand) {
    if (!buildCommand.trim())
        return false;
    return isNextPackageJson(packageJson);
}
function scriptRunCommand(packageManager, scriptName) {
    switch (packageManager) {
        case constants_1.ShareDeploymentPackageManager.Pnpm:
            return `pnpm run ${scriptName}`;
        case constants_1.ShareDeploymentPackageManager.Yarn:
            return `yarn run ${scriptName}`;
        case constants_1.ShareDeploymentPackageManager.Npm:
        default:
            return `npm run ${scriptName}`;
    }
}
function resolvePackageScriptStartCommand(packageJson, packageManager) {
    const scripts = packageJson?.scripts ?? {};
    if (typeof scripts.start === 'string' && scripts.start.trim()) {
        return scriptRunCommand(packageManager, 'start');
    }
    if (typeof scripts.serve === 'string' && scripts.serve.trim()) {
        return scriptRunCommand(packageManager, 'serve');
    }
    if (typeof scripts.dev === 'string' && scripts.dev.trim()) {
        return scriptRunCommand(packageManager, 'dev');
    }
    return '';
}
function isGeneratedOptimizedStartCommand(command) {
    return command === NEXT_STANDALONE_START_COMMAND ||
        command === NITRO_OUTPUT_START_COMMAND ||
        command === STATIC_BUILD_START_COMMAND;
}
function shellTokens(command) {
    const tokens = [];
    let current = '';
    let quote = null;
    for (let index = 0; index < command.length; index += 1) {
        const char = command[index];
        if (quote) {
            if (char === quote) {
                quote = null;
            }
            else {
                current += char;
            }
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            continue;
        }
        if (/\s/.test(char)) {
            if (current) {
                tokens.push(current);
                current = '';
            }
            continue;
        }
        current += char;
    }
    if (current) {
        tokens.push(current);
    }
    return tokens;
}
function normalizeRelativeArchiveName(value) {
    let normalized = value.replace(/\\/g, '/');
    while (normalized.startsWith('./')) {
        normalized = normalized.slice(2);
    }
    if (!normalized ||
        normalized.startsWith('/') ||
        normalized.split('/').some(part => part === '..')) {
        return null;
    }
    return normalized;
}
async function includePersistenceEntries(collection, sourceEntries, projectDirectory, persistence) {
    if (!persistence?.enabled || persistence.bindings.length === 0) {
        return collection;
    }
    const selectedEntries = new Map();
    for (const binding of persistence.bindings) {
        const appPath = normalizeRelativeArchiveName(binding.appPath);
        if (!appPath)
            continue;
        const directoryPrefix = `${appPath}/`;
        for (const entry of sourceEntries) {
            const selected = binding.kind === constants_1.ShareDeploymentPersistenceBindingKind.Directory
                ? entry.archiveName.startsWith(directoryPrefix)
                : entry.archiveName === appPath;
            if (selected) {
                selectedEntries.set(entry.archiveName, entry);
            }
        }
    }
    if (selectedEntries.size === 0) {
        return collection;
    }
    const entriesByArchiveName = new Map(collection.entries.map(entry => [entry.archiveName, entry]));
    let totalBytes = collection.totalBytes;
    for (const sourceEntry of selectedEntries.values()) {
        if (entriesByArchiveName.has(sourceEntry.archiveName))
            continue;
        const absolutePath = path_1.default.join(projectDirectory, sourceEntry.archiveName);
        let stat;
        try {
            stat = await fs_1.default.promises.stat(absolutePath);
        }
        catch {
            continue;
        }
        if (!stat.isFile())
            continue;
        entriesByArchiveName.set(sourceEntry.archiveName, {
            absolutePath,
            archiveName: sourceEntry.archiveName,
            size: stat.size,
        });
        totalBytes += stat.size;
    }
    const blockers = [...collection.blockers];
    if (entriesByArchiveName.size > nodeServiceProjectAnalyzer_1.NODE_SERVICE_DEPLOYMENT_LIMITS.MaxFiles) {
        blockers.push(`Project has more than ${nodeServiceProjectAnalyzer_1.NODE_SERVICE_DEPLOYMENT_LIMITS.MaxFiles} files after exclusions.`);
    }
    if (totalBytes > nodeServiceProjectAnalyzer_1.NODE_SERVICE_DEPLOYMENT_LIMITS.MaxDeploymentTotalBytes) {
        blockers.push(`Project files exceed ${Math.floor(nodeServiceProjectAnalyzer_1.NODE_SERVICE_DEPLOYMENT_LIMITS.MaxDeploymentTotalBytes / 1024 / 1024)}MB after exclusions.`);
    }
    return {
        ...collection,
        entries: Array.from(entriesByArchiveName.values())
            .sort((a, b) => a.archiveName.localeCompare(b.archiveName)),
        totalBytes,
        blockers,
    };
}
function nodeStartCommandEntryName(command) {
    const tokens = shellTokens(command.trim());
    if (tokens.length < 2)
        return null;
    const binary = path_1.default.basename(tokens[0]).toLowerCase().replace(/\.exe$/, '');
    if (binary !== 'node' && binary !== 'nodejs')
        return null;
    for (let index = 1; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (token === '-e' || token === '--eval' || token === '-p' || token === '--print') {
            return null;
        }
        if (token === '-r' || token === '--require' || token === '--loader' || token === '--import') {
            index += 1;
            continue;
        }
        if (token.startsWith('-')) {
            continue;
        }
        const entryName = normalizeRelativeArchiveName(token);
        if (!entryName || !/\.(?:cjs|js|mjs|ts)$/i.test(entryName)) {
            return null;
        }
        return entryName;
    }
    return null;
}
function missingNodeStartCommandEntryName(collection, startCommand) {
    const entryName = nodeStartCommandEntryName(startCommand);
    if (!entryName)
        return null;
    return collection.entries.some(entry => entry.archiveName === entryName) ? null : entryName;
}
async function pathExists(targetPath) {
    try {
        await fs_1.default.promises.access(targetPath);
        return true;
    }
    catch {
        return false;
    }
}
function isBlockedDeploymentFileName(name) {
    return name === '.DS_Store' ||
        name === 'Thumbs.db' ||
        /^\.env(?:\.|$)/i.test(name) ||
        /(?:^|[-_.])(secret|credential|credentials|token|private[-_.]?key)(?:[-_.]|$)/i.test(name);
}
async function collectDeploymentDirectoryEntries(sourceDirectory, archivePrefix, entriesByArchiveName, state) {
    if (state.blockers.length > 0)
        return;
    let children;
    try {
        children = await fs_1.default.promises.readdir(sourceDirectory, { withFileTypes: true });
    }
    catch {
        return;
    }
    for (const child of children) {
        if (state.blockers.length > 0)
            return;
        const absolutePath = path_1.default.join(sourceDirectory, child.name);
        const relativeName = archivePrefix
            ? path_1.default.posix.join(archivePrefix, child.name)
            : child.name;
        if (isBlockedDeploymentFileName(child.name) || child.isSymbolicLink()) {
            state.excludedCount += 1;
            continue;
        }
        if (child.isDirectory()) {
            await collectDeploymentDirectoryEntries(absolutePath, relativeName, entriesByArchiveName, state);
            continue;
        }
        if (!child.isFile()) {
            state.excludedCount += 1;
            continue;
        }
        const stat = await fs_1.default.promises.stat(absolutePath);
        state.totalBytes += stat.size;
        entriesByArchiveName.set(relativeName, {
            absolutePath,
            archiveName: relativeName,
            size: stat.size,
        });
        if (entriesByArchiveName.size > nodeServiceProjectAnalyzer_1.NODE_SERVICE_DEPLOYMENT_LIMITS.MaxFiles) {
            state.blockers.push(`Project has more than ${nodeServiceProjectAnalyzer_1.NODE_SERVICE_DEPLOYMENT_LIMITS.MaxFiles} files after exclusions.`);
            return;
        }
        if (state.totalBytes > nodeServiceProjectAnalyzer_1.NODE_SERVICE_DEPLOYMENT_LIMITS.MaxDeploymentTotalBytes) {
            state.blockers.push(`Project files exceed ${Math.floor(nodeServiceProjectAnalyzer_1.NODE_SERVICE_DEPLOYMENT_LIMITS.MaxDeploymentTotalBytes / 1024 / 1024)}MB after exclusions.`);
            return;
        }
    }
}
async function collectNextStandaloneDeploymentPackageEntries(projectDirectory) {
    const standaloneDirectory = path_1.default.join(projectDirectory, '.next', 'standalone');
    const staticDirectory = path_1.default.join(projectDirectory, '.next', 'static');
    const publicDirectory = path_1.default.join(projectDirectory, 'public');
    const entriesByArchiveName = new Map();
    const state = {
        totalBytes: 0,
        excludedCount: 0,
        blockers: [],
    };
    if (!await pathExists(path_1.default.join(standaloneDirectory, 'server.js'))) {
        return {
            entries: [],
            totalBytes: 0,
            excludedCount: 0,
            warnings: [],
            blockers: ['Next.js standalone build output was not found.'],
        };
    }
    await collectDeploymentDirectoryEntries(standaloneDirectory, '', entriesByArchiveName, state);
    await collectDeploymentDirectoryEntries(staticDirectory, '.next/static', entriesByArchiveName, state);
    await collectDeploymentDirectoryEntries(publicDirectory, 'public', entriesByArchiveName, state);
    return {
        entries: Array.from(entriesByArchiveName.values()).sort((a, b) => a.archiveName.localeCompare(b.archiveName)),
        totalBytes: state.totalBytes,
        excludedCount: state.excludedCount,
        warnings: [],
        blockers: state.blockers,
    };
}
async function collectNitroDeploymentPackageEntries(projectDirectory) {
    const outputDirectory = path_1.default.join(projectDirectory, '.output');
    if (!await pathExists(path_1.default.join(outputDirectory, 'server', 'index.mjs'))) {
        return null;
    }
    const entriesByArchiveName = new Map();
    const state = {
        totalBytes: 0,
        excludedCount: 0,
        blockers: [],
    };
    await collectDeploymentDirectoryEntries(outputDirectory, '.output', entriesByArchiveName, state);
    return {
        entries: Array.from(entriesByArchiveName.values()).sort((a, b) => a.archiveName.localeCompare(b.archiveName)),
        totalBytes: state.totalBytes,
        excludedCount: state.excludedCount,
        warnings: [],
        blockers: state.blockers,
    };
}
async function hasIndexHtml(directory) {
    try {
        const stat = await fs_1.default.promises.stat(path_1.default.join(directory, 'index.html'));
        return stat.isFile();
    }
    catch {
        return false;
    }
}
async function findStaticBuildOutputDirectory(projectDirectory, includeProjectRoot = false) {
    const directCandidates = [
        ...(includeProjectRoot ? [projectDirectory] : []),
        ...['dist', 'build', 'out'].map(name => path_1.default.join(projectDirectory, name)),
    ];
    for (const candidate of directCandidates) {
        if (await hasIndexHtml(candidate))
            return candidate;
    }
    const distDirectory = path_1.default.join(projectDirectory, 'dist');
    let children;
    try {
        children = await fs_1.default.promises.readdir(distDirectory, { withFileTypes: true });
    }
    catch {
        return null;
    }
    const nestedCandidates = [];
    for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
        if (!child.isDirectory())
            continue;
        const childDirectory = path_1.default.join(distDirectory, child.name);
        nestedCandidates.push(path_1.default.join(childDirectory, 'browser'), childDirectory);
    }
    for (const candidate of nestedCandidates) {
        if (await hasIndexHtml(candidate))
            return candidate;
    }
    return null;
}
async function collectStaticBuildDeploymentPackageEntries(projectDirectory, includeProjectRoot = false) {
    const staticOutputDirectory = await findStaticBuildOutputDirectory(projectDirectory, includeProjectRoot);
    if (!staticOutputDirectory)
        return null;
    return await (0, nodeServiceProjectAnalyzer_1.collectStaticSiteDeploymentPackageEntries)(staticOutputDirectory);
}
async function collectOptimizedDeploymentPackage(projectDirectory, packageJson) {
    if (isNextPackageJson(packageJson)) {
        const collection = await collectNextStandaloneDeploymentPackageEntries(projectDirectory);
        if (collection.blockers.length === 0) {
            return {
                collection,
                deploymentKind: constants_1.ShareDeploymentKind.NodeService,
                startCommand: NEXT_STANDALONE_START_COMMAND,
            };
        }
    }
    const nitroCollection = await collectNitroDeploymentPackageEntries(projectDirectory);
    if (nitroCollection && nitroCollection.blockers.length === 0) {
        return {
            collection: nitroCollection,
            deploymentKind: constants_1.ShareDeploymentKind.NodeService,
            startCommand: NITRO_OUTPUT_START_COMMAND,
        };
    }
    if (isStaticBuildPackageJson(packageJson) || isNextPackageJson(packageJson) || !packageJson) {
        const staticCollection = await collectStaticBuildDeploymentPackageEntries(projectDirectory, !packageJson);
        if (staticCollection && staticCollection.blockers.length === 0) {
            return {
                collection: staticCollection,
                deploymentKind: constants_1.ShareDeploymentKind.StaticSite,
                startCommand: '',
                entryFile: STATIC_SITE_ENTRY_FILE,
                spaFallback: true,
            };
        }
    }
    return null;
}
async function packageNodeServiceDeployment(input) {
    const plan = await (0, nodeServiceProjectAnalyzer_1.buildNodeServiceProjectPackagePlan)({
        projectDirectory: input.projectDirectory,
        localServiceUrl: input.localServiceUrl,
    });
    if (!plan.analysis.success) {
        throw new Error(plan.analysis.blockers.join('\n') || 'Project cannot be deployed.');
    }
    const commandEnv = await (0, coworkUtil_1.getNodeToolEnv)();
    const tempDir = await fs_1.default.promises.mkdtemp(path_1.default.join(os_1.default.tmpdir(), 'lobster-node-build-'));
    const projectDir = path_1.default.join(tempDir, 'project');
    const commandWarnings = [];
    const isPlainStaticDeployment = plan.analysis.deploymentKind === constants_1.ShareDeploymentKind.StaticSite &&
        plan.analysis.packageManager === constants_1.ShareDeploymentPackageManager.Unknown;
    const installCommand = isPlainStaticDeployment
        ? ''
        : effectiveCommand(input.installCommand, plan.analysis.installCommand, { blankUsesFallback: plan.analysis.deploymentKind === constants_1.ShareDeploymentKind.StaticSite });
    const buildCommand = isPlainStaticDeployment
        ? ''
        : effectiveCommand(input.buildCommand, plan.analysis.buildCommand, { blankUsesFallback: plan.analysis.deploymentKind === constants_1.ShareDeploymentKind.StaticSite });
    const startCommand = isPlainStaticDeployment
        ? ''
        : effectiveCommand(input.startCommand, plan.analysis.startCommand);
    const port = input.port ?? plan.analysis.port;
    try {
        await copyPackageEntries(plan.entries, projectDir);
        const packageJson = await readPackageJson(projectDir);
        const useNextStandalonePackage = await shouldUseNextStandalonePackage(packageJson, buildCommand);
        if (buildCommand.trim()) {
            await removeStaleBuildOutputs(projectDir);
        }
        await runDeploymentCommand(projectDir, installCommand, 'install', commandEnv, port);
        await runDeploymentCommand(projectDir, buildCommand, 'build', commandEnv, port, {
            NODE_ENV: 'production',
            ...(useNextStandalonePackage ? { NEXT_PRIVATE_STANDALONE: 'true' } : {}),
        });
        let effectiveStartCommand = startCommand;
        let deploymentKind = constants_1.ShareDeploymentKind.NodeService;
        let entryFile;
        let spaFallback;
        let deploymentPackage = null;
        const optimizedPackage = await collectOptimizedDeploymentPackage(projectDir, packageJson);
        if (optimizedPackage) {
            deploymentPackage = optimizedPackage.collection;
            deploymentKind = optimizedPackage.deploymentKind;
            effectiveStartCommand = optimizedPackage.startCommand;
            entryFile = optimizedPackage.entryFile;
            spaFallback = optimizedPackage.spaFallback;
        }
        else {
            await runProductionDependencyPrune(projectDir, plan.analysis.packageManager, commandWarnings, commandEnv, port);
            deploymentPackage = await (0, nodeServiceProjectAnalyzer_1.collectNodeServiceDeploymentPackageEntries)(projectDir);
            const fallbackStartCommand = resolvePackageScriptStartCommand(packageJson, plan.analysis.packageManager);
            if (isGeneratedOptimizedStartCommand(effectiveStartCommand) && fallbackStartCommand) {
                effectiveStartCommand = fallbackStartCommand;
            }
        }
        if (deploymentKind === constants_1.ShareDeploymentKind.NodeService) {
            deploymentPackage = await includePersistenceEntries(deploymentPackage, plan.entries, projectDir, input.persistence ?? plan.analysis.persistence);
        }
        if (deploymentPackage.blockers.length) {
            throw new Error(deploymentPackage.blockers.join('\n'));
        }
        if (deploymentKind === constants_1.ShareDeploymentKind.NodeService) {
            const missingStartEntry = missingNodeStartCommandEntryName(deploymentPackage, effectiveStartCommand);
            if (missingStartEntry) {
                throw new Error([
                    `Deployment start command references "${missingStartEntry}", but this file is not included in the deployment package.`,
                    'Check the build output or define a package.json start, serve, or dev script before retrying.',
                ].join(' '));
            }
        }
        const archive = await writeZip(deploymentPackage.entries);
        const analysis = {
            ...plan.analysis,
            deploymentKind,
            entryFile,
            spaFallback,
            installCommand,
            buildCommand,
            startCommand: effectiveStartCommand,
            port,
            totalFiles: deploymentPackage.entries.length,
            totalBytes: deploymentPackage.totalBytes,
            excludedCount: deploymentPackage.excludedCount,
            warnings: [
                ...plan.analysis.warnings,
                ...deploymentPackage.warnings,
                ...commandWarnings,
            ],
        };
        return {
            ...archive,
            analysis,
            deploymentKind,
            entryFile,
            spaFallback,
            totalFiles: analysis.totalFiles,
            totalBytes: analysis.totalBytes,
            warnings: analysis.warnings,
        };
    }
    finally {
        await fs_1.default.promises.rm(tempDir, { recursive: true, force: true });
    }
}
//# sourceMappingURL=nodeServiceDeploymentPackager.js.map