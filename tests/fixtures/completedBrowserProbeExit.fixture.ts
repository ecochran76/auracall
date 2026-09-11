import { exitAfterCompletedBrowserProbeCommand } from "../../src/cli/completedBrowserCommandExit.js";

setInterval(() => undefined, 60_000);
console.log("PROFILE_IDENTITY_SMOKE_COMPLETE");
exitAfterCompletedBrowserProbeCommand();
