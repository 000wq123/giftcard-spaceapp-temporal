import { assertDevInstanceIsolated } from "@space/contracts";
import { createApp } from "./app.js";
import { getApiConfig } from "./config.js";
import { loadOwnerSetupBootstrap } from "./owner-setup.js";
import { pluginsService } from "./plugins-service.js";
import { installProcessGuards } from "./process-guards.js";

assertDevInstanceIsolated(process.env, "api");
const config = getApiConfig(process.env);
const setup = await loadOwnerSetupBootstrap(process.env);
const app = await createApp({
  config,
  setup,
  agentToolsOptions: {
    rootWriterCommand: config.agentToolsWriterCommand
  },
  resumeChessTournament: config.instanceJobs["chess-tournament-resume"]
});

installProcessGuards({ log: app.log, shutdown: () => app.close() });

await app.listen({ host: config.host, port: config.port });
// Built-in skill plugins reach the CLIs only through these links, which live in stable's skill directories.
if (config.instanceJobs["plugin-skill-links"]) void pluginsService.syncSkillSymlinks().catch(() => {});
