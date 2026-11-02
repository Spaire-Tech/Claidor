// Step 7f, the agent's hands on this PC: commands run on this PC for the agents, asked first, never in the sensitive folders (MacLocalHands.swift, MacLocalPermission.swift, SimeonMacCore's LocalExec*).
// Its calls are answered here (`handle`, ../bridge.ts) and named in
// clients/apps/app/src/desktop/contract.ts, in its own section.

import type { AppContext } from '../context'

export function register(_context: AppContext): void {}
