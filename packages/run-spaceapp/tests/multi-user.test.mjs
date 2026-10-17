import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import test from "node:test";
import { run } from "../src/cli.mjs";
import { addUser, createDefaultConfig, renderCliHosts, renderWorkspaceCompose, userSlug, validateConfig } from "../src/index.mjs";

// Multi-user (plan clipboard:evAaFYqrgDfd step 5): each user's CLIs run in their own container with their own keys,
// logins, memory and workspaces; the core reads the user -> pane host socket map from SPACE_CLI_HOST_SOCKETS_FILE.

function capture() {
  let value = "";
  return { stream: new Writable({ write(chunk, _e, done) { value += chunk.toString(); done(); } }), value: () => value };
}
function ttyStdin(...answers) {
  let index = 0;
  return {
    isTTY: true, setRawMode() {}, resume() {}, pause() {}, setEncoding() {},
    [Symbol.asyncIterator]() { return { async next() { return index >= answers.length ? { done: true } : { done: false, value: `${answers[index++]}\r` }; } }; }
  };
}
async function installation(execute, platform = "linux") {
  const root = await mkdtemp(join(tmpdir(), "spaceapp-multi-user-"));
  const stdout = capture();
  const stderr = capture();
  const options = {
    env: { SPACEAPP_HOME: root }, platform, stdin: ttyStdin("y"), stdout: stdout.stream, stderr: stderr.stream,
    inspectResources: async () => ({ cpuCount: 4, totalMemoryBytes: 8 * 1024 ** 3, freeDiskBytes: 15 * 1024 ** 3 }),
    prepareDockerPath: async () => null, request: async () => ({ ok: true, json: async () => ({ ok: true }) }), sleep: async () => {},
    execute
  };
  await run(["init"], options);
  return { root, stdout, stderr, options };
}

test("user enable, add and remove give each user a CLI container and the core its host map", async () => {
  const calls = [];
  const { root, stdout, options } = await installation(async (spec) => { calls.push(spec.args); return 0; });
  await assert.rejects(run(["user", "add", "user:Bob12345"], options), /accounts are off/);
  assert.equal(await run(["user", "enable"], options), 0);
  let compose = await readFile(join(root, "compose.workspaces.yml"), "utf8");
  assert.match(compose, /SPACE_MULTI_USER_ENABLED: "true"/);
  assert.match(compose, /SPACE_CLI_HOST_SOCKETS_FILE: \/etc\/spaceapp\/cli-hosts\.json/);
  assert.equal(await readFile(join(root, "cli-hosts.json"), "utf8"), "{}\n");

  assert.equal(await run(["user", "add", "user:Bob12345", "--memory", "1536m"], options), 0);
  const slug = userSlug("user:Bob12345");
  assert.deepEqual(calls.at(-1).slice(-3), ["up", "-d", "--remove-orphans"]);
  compose = await readFile(join(root, "compose.workspaces.yml"), "utf8");
  assert.match(compose, new RegExp(`spaceapp-cli-${slug}:`));
  assert.match(compose, /mem_limit: "1536m"/);
  for (const volume of ["cli-state", "memory", "cli-socket", "workspaces"]) assert.match(compose, new RegExp(`spaceapp-${volume}-${slug}:`));
  assert.match(compose, new RegExp(`\\./secrets/users/${slug}/providers:/run/spaceapp-secrets/providers:ro`));
  // The user's container never mounts the owner's keys, CLI state, memory or workspaces.
  const service = compose.slice(compose.indexOf(`spaceapp-cli-${slug}:`), compose.indexOf("\nvolumes:"));
  assert.doesNotMatch(service, /- spaceapp-cli-state:|- spaceapp-memory:|- spaceapp-workspaces:|\.\/secrets\/providers:/);
  assert.deepEqual(JSON.parse(await readFile(join(root, "cli-hosts.json"), "utf8")), { "user:Bob12345": `/run/spaceapp-cli-users/${slug}/host.sock` });
  assert.equal((await stat(join(root, "secrets", "users", slug, "providers"))).mode & 0o777, 0o700);
  assert.match(stdout.value(), /credentials set <provider> --user user:Bob12345/);

  assert.equal(await run(["user", "remove", "user:Bob12345"], options), 0);
  assert.doesNotMatch(await readFile(join(root, "compose.workspaces.yml"), "utf8"), new RegExp(`spaceapp-cli-${slug}`));
  assert.equal(await readFile(join(root, "cli-hosts.json"), "utf8"), "{}\n");
});

test("credentials and workspaces with --user reach only that user's container", async () => {
  const calls = [];
  const { root, options } = await installation(async (spec) => { calls.push(spec.args); return 0; });
  await assert.rejects(run(["credentials", "set", "claude", "--user", "user:Bob12345"], { ...options, stdin: Readable.from(["sk-test\n"]) }), /no CLI container/);
  await run(["user", "enable"], options);
  await run(["user", "add", "user:Bob12345"], options);
  const slug = userSlug("user:Bob12345");
  assert.equal(await run(["credentials", "set", "claude", "--user", "user:Bob12345"], { ...options, stdin: Readable.from(["sk-bob\n"]) }), 0);
  assert.equal(await readFile(join(root, "secrets", "users", slug, "providers", "claude.key"), "utf8"), "sk-bob");
  await assert.rejects(readFile(join(root, "secrets", "providers", "claude.key")));
  assert.deepEqual(calls.at(-1).slice(-5), ["up", "-d", "--no-deps", "--force-recreate", `spaceapp-cli-${slug}`]);

  const folder = await mkdtemp(join(tmpdir(), "spaceapp-multi-user-repo-"));
  assert.equal(await run(["workspace", "add", folder, "--read-only", "--user", "user:Bob12345"], options), 0);
  const config = JSON.parse(await readFile(join(root, "config.json"), "utf8"));
  assert.deepEqual(config.workspaces, []);
  assert.equal(config.users[0].workspaces[0].hostPath, folder);
  const compose = await readFile(join(root, "compose.workspaces.yml"), "utf8");
  const userService = compose.slice(compose.indexOf(`spaceapp-cli-${slug}:`));
  assert.ok(userService.includes(JSON.stringify(folder)));
  assert.ok(!compose.slice(0, compose.indexOf(`spaceapp-cli-${slug}:`)).includes(JSON.stringify(folder)));
  assert.equal(await run(["workspace", "remove", folder, "--user", "user:Bob12345"], options), 0);
});

test("users need isolated access, and user ids are validated", () => {
  const config = { ...createDefaultConfig({ version: "1.1.7", profile: "small" }), users: [] };
  assert.throws(() => addUser({ ...config, accessMode: "host-root" }, "user:Bob12345"), /isolated access/);
  assert.throws(() => validateConfig({ ...addUser(config, "user:Bob12345"), accessMode: "host-root" }), /isolated access/);
  for (const bad of ["bob", "user:", "user:../x", "user:a b"]) assert.throws(() => addUser(config, bad), /Invalid/);
  assert.notEqual(userSlug("user:Bob12345"), userSlug("user:bob12345"));
  const off = createDefaultConfig({ version: "1.1.7", profile: "small" });
  assert.doesNotMatch(renderWorkspaceCompose(off), /SPACE_MULTI_USER_ENABLED|cli-hosts/);
  assert.equal(renderCliHosts(off), "{}\n");
});
