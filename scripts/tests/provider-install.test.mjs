import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { approveInstallScripts, providers } from "../../deploy/docker/provider-install.mjs";

// npm 11 warns about install scripts that package.json allowScripts does not cover and is moving to blocking them
// (1.1.6 rehearsal: an allow-scripts warning on Claude Code's first install). Claude Code's postinstall puts its native
// binary in place, so only it is approved, for exactly its pinned version.
test("only Claude Code's pinned install script is approved", () => {
  assert.equal(providers.claude.allowScripts, true);
  assert.match(providers.claude.package, /^@anthropic-ai\/claude-code@\d+\.\d+\.\d+$/);
  for (const [name, entry] of Object.entries(providers)) if (name !== "claude") assert.equal(entry.allowScripts, undefined, name);
});

test("the approval keeps what the vendor project's package.json already has", async () => {
  const directory = await mkdtemp(join(tmpdir(), "provider-install-"));
  try {
    await approveInstallScripts(directory, "@anthropic-ai/claude-code@2.1.301");
    assert.deepEqual(JSON.parse(await readFile(join(directory, "package.json"), "utf8")),
      { private: true, allowScripts: { "@anthropic-ai/claude-code@2.1.301": true } });
    await writeFile(join(directory, "package.json"), JSON.stringify({ dependencies: { "@anthropic-ai/claude-code": "^2.1.301" }, allowScripts: { "@anthropic-ai/claude-code@2.1.301": true } }));
    await approveInstallScripts(directory, "@anthropic-ai/claude-code@2.1.302");
    assert.deepEqual(JSON.parse(await readFile(join(directory, "package.json"), "utf8")), {
      dependencies: { "@anthropic-ai/claude-code": "^2.1.301" },
      allowScripts: { "@anthropic-ai/claude-code@2.1.301": true, "@anthropic-ai/claude-code@2.1.302": true }
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
