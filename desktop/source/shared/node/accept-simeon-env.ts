// The first import of every process entry (the Mac app's main process, the
// host, the coordinator, the daemons): `SIMEON_<NAME>` settings are accepted
// before any module reads `SAND_<NAME>` (`env-names.ts`).
import { acceptSimeonEnvNames } from "./env-names.js";

acceptSimeonEnvNames();
