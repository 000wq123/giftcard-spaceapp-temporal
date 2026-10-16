import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createBackupId,
  createFileRecord,
  createPortableBackup,
  parseDatabaseEnvironment
} from "../portable-backup.mjs";
import {
  restorePortableBackup,
  selectBackup,
  selectLatestBackup,
  validateBackupManifest
} from "../portable-restore.mjs";

test("portable backups use sortable UTC identifiers and secret-free PostgreSQL process env", () => {
  assert.equal(
    createBackupId(new Date("2026-07-23T12:34:56.789Z")),
    "spaceapp-backup-20260723T123456789Z"
  );
  const database = parseDatabaseEnvironment(
    "postgresql://spaceapp:p%40ssword@postgres:5432/spaceapp"
  );
  assert.equal(database.databaseName, "spaceapp");
  assert.deepEqual(database.env, {
    PGHOST: "postgres",
    PGPORT: "5432",
    PGUSER: "spaceapp",
    PGPASSWORD: "p@ssword",
    PGDATABASE: "spaceapp"
  });
  assert.doesNotMatch(JSON.stringify(database.args), /p@ssword|p%40ssword/);
});

test("restore selects the latest strict backup directory and validates every checksum", async () => {
  const root = await mkdtemp(join(tmpdir(), "spaceapp-portable-restore-"));
  const older = join(root, "spaceapp-backup-20260723T120000000Z");
  const latest = join(root, "spaceapp-backup-20260723T130000000Z");
  await mkdir(older);
  await mkdir(latest);
  await mkdir(join(root, "not-a-backup"));
  await writeFile(join(latest, "database.dump"), "database");
  await writeFile(join(latest, "data.tar.gz"), "data");
  await writeFile(join(latest, "memory.tar.gz"), "memory");
  const files = Object.fromEntries(await Promise.all(
    ["database.dump", "data.tar.gz", "memory.tar.gz"].map(async (name) => [
      name,
      await createFileRecord(join(latest, name))
    ])
  ));
  const manifest = {
    format: "spaceapp-portable-backup",
    schemaVersion: 1,
    createdAt: "2026-07-23T13:00:00.000Z",
    appVersion: "0.1.0",
    files
  };
  await writeFile(join(latest, "manifest.json"), `${JSON.stringify(manifest)}\n`);

  assert.equal(await selectLatestBackup(root), latest);
  assert.equal(
    await selectBackup(root, "spaceapp-backup-20260723T120000000Z"),
    older
  );
  await assert.rejects(
    () => selectBackup(root, "../spaceapp-backup-20260723T130000000Z"),
    /identifier/i
  );
  await assert.doesNotReject(() => validateBackupManifest(latest));

  await writeFile(join(latest, "memory.tar.gz"), "tampered");
  await assert.rejects(() => validateBackupManifest(latest), /checksum/i);
});

async function backupWith(files, schemaVersion) {
  const root = await mkdtemp(join(tmpdir(), "spaceapp-portable-v2-"));
  const backup = join(root, "spaceapp-backup-20261016T120000000Z");
  await mkdir(backup);
  for (const [name, content] of Object.entries(files)) await writeFile(join(backup, name), content);
  const records = Object.fromEntries(await Promise.all(Object.keys(files).map(async (name) => [name, await createFileRecord(join(backup, name))])));
  await writeFile(join(backup, "manifest.json"), JSON.stringify({
    format: "spaceapp-portable-backup", schemaVersion, createdAt: "2026-10-16T12:00:00.000Z", appVersion: "1.1.6", files: records
  }));
  return { root, backup };
}

test("version 2 manifests may carry the Temporal dumps and nothing else", async () => {
  const base = { "database.dump": "db", "data.tar.gz": "data", "memory.tar.gz": "memory" };
  await assert.doesNotReject(async () => validateBackupManifest((await backupWith({ ...base, "temporal.dump": "t" }, 2)).backup));
  await assert.rejects(async () => validateBackupManifest((await backupWith({ ...base, "temporal.dump": "t" }, 1)).backup), /unsupported/);
  await assert.rejects(async () => validateBackupManifest((await backupWith({ ...base, "other.dump": "x" }, 2)).backup), /unsupported/);
  await assert.rejects(async () => validateBackupManifest((await backupWith({ "database.dump": "db", "data.tar.gz": "data" }, 2)).backup), /unsupported/);
});

test("restore swaps the files in only after every database restored", async () => {
  const work = await mkdtemp(join(tmpdir(), "spaceapp-portable-restore-order-"));
  const source = join(work, "source");
  await mkdir(join(source, "data"), { recursive: true });
  await mkdir(join(source, "memory"));
  await writeFile(join(source, "data", "restored.txt"), "from backup");
  await writeFile(join(source, "memory", "graph.json"), "{}");
  execFileSync("tar", ["--create", "--gzip", `--file=${join(work, "data.tar.gz")}`, `--directory=${join(source, "data")}`, "."]);
  execFileSync("tar", ["--create", "--gzip", `--file=${join(work, "memory.tar.gz")}`, `--directory=${join(source, "memory")}`, "."]);
  const { root } = await backupWith({
    "database.dump": "db", "temporal.dump": "t",
    "data.tar.gz": await readFile(join(work, "data.tar.gz")), "memory.tar.gz": await readFile(join(work, "memory.tar.gz"))
  }, 2);
  const shims = join(work, "bin");
  await mkdir(shims);
  const restored = join(work, "pg_restore.log");
  const restore = async (exitCode) => {
    await writeFile(join(shims, "pg_restore"), `#!/bin/sh\necho "$PGDATABASE $*" >> ${restored}\nexit ${exitCode}\n`);
    await chmod(join(shims, "pg_restore"), 0o755);
    const dataRoot = join(work, `live-${exitCode}`);
    const memoryRoot = join(dataRoot, "memory");
    await mkdir(memoryRoot, { recursive: true });
    await writeFile(join(dataRoot, "current.txt"), "live");
    await writeFile(join(memoryRoot, "current.json"), "live");
    const env = { PATH: `${shims}:${process.env.PATH}`, SPACE_DATABASE_URL: "postgresql://spaceapp:pw@postgres:5432/spaceapp" };
    const result = restorePortableBackup({
      env, stdout: { write() {} }, inputRoot: root, backupId: "spaceapp-backup-20261016T120000000Z", confirmation: "RESTORE", dataRoot, memoryRoot
    });
    return { result, dataRoot, memoryRoot };
  };

  const failed = await restore(1);
  await assert.rejects(failed.result, /pg_restore failed/);
  assert.deepEqual((await readdir(failed.dataRoot)).sort(), ["current.txt", "memory"]);
  assert.deepEqual(await readdir(failed.memoryRoot), ["current.json"]);

  const ok = await restore(0);
  await ok.result;
  assert.deepEqual((await readdir(ok.dataRoot)).sort(), ["memory", "restored.txt"]);
  assert.deepEqual(await readdir(ok.memoryRoot), ["graph.json"]);
  const log = await readFile(restored, "utf8");
  assert.match(log, /spaceapp .*--single-transaction.*database\.dump/);
  assert.match(log, /temporal .*--dbname=temporal .*temporal\.dump/);
});

test("backup dumps the Temporal databases that exist next to the app database", async () => {
  const work = await mkdtemp(join(tmpdir(), "spaceapp-portable-backup-temporal-"));
  const shims = join(work, "bin");
  const dataRoot = join(work, "data");
  await mkdir(shims);
  await mkdir(join(dataRoot, "memory"), { recursive: true });
  await writeFile(join(dataRoot, "settings.json"), "{}");
  await writeFile(join(shims, "psql"), "#!/bin/sh\nprintf 'temporal\\ntemporal_visibility\\n'\n");
  await writeFile(join(shims, "pg_dump"), "#!/bin/sh\nfor arg; do case $arg in --file=*) echo \"$PGDATABASE\" > \"${arg#--file=}\";; esac; done\n");
  await chmod(join(shims, "psql"), 0o755);
  await chmod(join(shims, "pg_dump"), 0o755);
  const target = await createPortableBackup({
    env: { PATH: `${shims}:${process.env.PATH}`, SPACE_DATABASE_URL: "postgresql://spaceapp:pw@postgres:5432/spaceapp" },
    stdout: { write() {} }, now: new Date("2026-10-16T12:00:00.000Z"),
    backupRoot: join(work, "backups"), dataRoot, memoryRoot: join(dataRoot, "memory")
  });
  const manifest = JSON.parse(await readFile(join(target, "manifest.json"), "utf8"));
  assert.equal(manifest.schemaVersion, 2);
  assert.deepEqual(Object.keys(manifest.files).sort(),
    ["data.tar.gz", "database.dump", "memory.tar.gz", "temporal.dump", "temporal_visibility.dump"]);
  assert.equal((await readFile(join(target, "temporal_visibility.dump"), "utf8")).trim(), "temporal_visibility");
  await assert.doesNotReject(() => validateBackupManifest(target));
});
