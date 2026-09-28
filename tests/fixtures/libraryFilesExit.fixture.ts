import { exitAfterCompletedBrowserProbeCommand } from "../../src/cli/completedBrowserCommandExit.js";

setInterval(() => undefined, 60_000);
console.log(JSON.stringify({ object: "auracall.library_files_error", status: "error" }));
exitAfterCompletedBrowserProbeCommand();
