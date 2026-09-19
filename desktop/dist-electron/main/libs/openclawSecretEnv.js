"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pickReferencedSecretEnvVars = exports.collectReferencedEnvVarNames = void 0;
const ENV_PLACEHOLDER_PATTERN = /\$\{([A-Z0-9_]+)\}/g;
const collectReferencedEnvVarNames = (value) => {
    const source = typeof value === 'string' ? value : JSON.stringify(value);
    const names = new Set();
    if (!source)
        return names;
    for (const match of source.matchAll(ENV_PLACEHOLDER_PATTERN)) {
        names.add(match[1]);
    }
    return names;
};
exports.collectReferencedEnvVarNames = collectReferencedEnvVarNames;
const pickReferencedSecretEnvVars = (env, referencedNames) => {
    const picked = {};
    for (const key of Object.keys(env).sort()) {
        if (referencedNames.has(key)) {
            picked[key] = env[key];
        }
    }
    return picked;
};
exports.pickReferencedSecretEnvVars = pickReferencedSecretEnvVars;
//# sourceMappingURL=openclawSecretEnv.js.map