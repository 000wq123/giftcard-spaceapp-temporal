import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createUserRuntimeRegistries, readCliUserHostSockets } from "../src/cli-user-hosts.js";
import { getApiConfig } from "../src/config.js";

it("reads the per-user pane host map and refuses an invalid one (fail closed)", async () => {
  const root = await mkdtemp(join(tmpdir(), "space-cli-user-hosts-"));
  try {
    expect(readCliUserHostSockets(null)).toBeNull();
    const file = join(root, "cli-hosts.json");
    await writeFile(file, JSON.stringify({ "user:bob": "/run/spaceapp-cli/user-bob/host.sock" }));
    expect(readCliUserHostSockets(file)).toEqual({ "user:bob": "/run/spaceapp-cli/user-bob/host.sock" });
    for (const bad of [{ "user:bob": "relative/host.sock" }, { "../etc": "/run/x.sock" }, ["user:bob"]]) {
      await writeFile(file, JSON.stringify(bad));
      expect(() => readCliUserHostSockets(file)).toThrow();
    }
    expect(() => readCliUserHostSockets(join(root, "missing.json"))).toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("keeps one runtime registry per user with an own container and none for anyone else", () => {
  const config = { ...getApiConfig({ SPACE_LOG_LEVEL: "silent" }), publicDistribution: true, cliEnabled: true };
  const registryFor = createUserRuntimeRegistries(config, { "user:bob": "/run/spaceapp-cli-users/bob/host.sock" });
  expect(registryFor("user:carol")).toBeNull();
  const bob = registryFor("user:bob");
  expect(bob).not.toBeNull();
  expect(registryFor("user:bob")).toBe(bob);
  expect(createUserRuntimeRegistries(config, null)("user:bob")).toBeNull();
});
