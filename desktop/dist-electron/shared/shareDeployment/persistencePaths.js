"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findShareDeploymentPersistencePathConflict = findShareDeploymentPersistencePathConflict;
const PERSISTENCE_PATH_FIELDS = ['appPath', 'dataPath'];
function findShareDeploymentPersistencePathConflict(bindings) {
    for (let firstBindingIndex = 0; firstBindingIndex < bindings.length - 1; firstBindingIndex += 1) {
        const firstBinding = bindings[firstBindingIndex];
        for (let secondBindingIndex = firstBindingIndex + 1; secondBindingIndex < bindings.length; secondBindingIndex += 1) {
            const secondBinding = bindings[secondBindingIndex];
            for (const firstField of PERSISTENCE_PATH_FIELDS) {
                for (const secondField of PERSISTENCE_PATH_FIELDS) {
                    const firstPath = firstBinding[firstField];
                    const secondPath = secondBinding[secondField];
                    if (persistencePathsOverlap(firstPath, secondPath)) {
                        return {
                            firstBindingIndex,
                            firstField,
                            firstPath,
                            secondBindingIndex,
                            secondField,
                            secondPath,
                        };
                    }
                }
            }
        }
    }
    return null;
}
function persistencePathsOverlap(firstPath, secondPath) {
    const first = normalizePersistencePathForComparison(firstPath);
    const second = normalizePersistencePathForComparison(secondPath);
    if (!first || !second)
        return false;
    return (first === second ||
        first.startsWith(`${second}/`) ||
        second.startsWith(`${first}/`));
}
function normalizePersistencePathForComparison(value) {
    if (!value || value.includes('\0'))
        return '';
    const segments = [];
    for (const segment of value.trim().replace(/\\/g, '/').split('/')) {
        if (!segment || segment === '.')
            continue;
        if (segment === '..') {
            if (segments.length === 0)
                return '';
            segments.pop();
            continue;
        }
        segments.push(segment.toLowerCase());
    }
    return segments.join('/');
}
//# sourceMappingURL=persistencePaths.js.map