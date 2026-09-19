"use strict";
/**
 * Startup performance profiler.
 *
 * Records wall-clock durations for each initialisation phase so that cold-start
 * bottlenecks are immediately visible in the main log file.
 *
 * Usage:
 *   const profiler = new StartupProfiler();
 *   profiler.mark('initStore');
 *   store = await initStore();
 *   profiler.measure('initStore');
 *   ...
 *   console.log(profiler.summary());
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StartupProfiler = void 0;
const perf_hooks_1 = require("perf_hooks");
class StartupProfiler {
    marks = new Map();
    phases = [];
    t0;
    constructor() {
        this.t0 = perf_hooks_1.performance.now();
    }
    /** Record the start of a phase. */
    mark(name) {
        this.marks.set(name, perf_hooks_1.performance.now());
    }
    /** Record the end of a previously marked phase. */
    measure(name) {
        const start = this.marks.get(name);
        if (start !== undefined) {
            this.phases.push({ name, duration: perf_hooks_1.performance.now() - start });
            this.marks.delete(name);
        }
    }
    /** Elapsed ms since the profiler was created. */
    elapsed() {
        return perf_hooks_1.performance.now() - this.t0;
    }
    /** Pretty-print all recorded phases as a table. */
    summary() {
        const total = this.elapsed();
        const lines = [
            '',
            '='.repeat(70),
            '  STARTUP PERFORMANCE PROFILE',
            '='.repeat(70),
        ];
        for (const { name, duration } of this.phases) {
            const pct = total > 0 ? (duration / total) * 100 : 0;
            const bar = '#'.repeat(Math.max(1, Math.round(pct / 2)));
            lines.push(`  ${name.padEnd(38)} ${duration.toFixed(0).padStart(7)}ms  ${pct.toFixed(1).padStart(5)}%  ${bar}`);
        }
        lines.push('-'.repeat(70));
        lines.push(`  ${'TOTAL'.padEnd(38)} ${total.toFixed(0).padStart(7)}ms`);
        lines.push('='.repeat(70));
        lines.push('');
        return lines.join('\n');
    }
}
exports.StartupProfiler = StartupProfiler;
//# sourceMappingURL=startupProfiler.js.map