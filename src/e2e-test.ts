import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import {
  createSpriteBashOperations,
  createSpriteEditOperations,
  createSpriteFindOperations,
  createSpriteGrepOperations,
  createSpriteLsOperations,
  createSpriteReadOperations,
  createSpriteWriteOperations,
  escapeShellArg,
  execOnSprite,
} from "./index.js";

const execFileAsync = promisify(execFile);
const SPRITE_NAME = process.env.SPRITE_NAME || "pi-sprite-test";
const WORKING_DIRECTORY = process.env.SPRITE_WORKING_DIR || "/home/sprite";
const TEST_ROOT = posix.join(WORKING_DIRECTORY, "pi-sprite-e2e");

async function ensureSprite(name: string): Promise<void> {
  const { stdout } = await execFileAsync("sprite", ["list"], { timeout: 30_000 });
  const sprites = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (sprites.includes(name)) {
    console.log(`✓ Sprite exists: ${name}`);
    return;
  }

  console.log(`Creating sprite: ${name}`);
  await execFileAsync("sprite", ["create", "--skip-console", name], {
    timeout: 120_000,
  });
  console.log(`✓ Created sprite: ${name}`);
}

async function maybeInstallRipgrep(): Promise<void> {
  const check = await execOnSprite("command -v rg >/dev/null 2>&1", {
    spriteName: SPRITE_NAME,
    workingDirectory: WORKING_DIRECTORY,
    timeout: 20,
  });
  if (check.exitCode === 0) {
    console.log("✓ ripgrep available");
    return;
  }

  console.log("Installing ripgrep on sprite...");
  const install = await execOnSprite(
    "if command -v apt-get >/dev/null 2>&1; then sudo apt-get update && sudo apt-get install -y ripgrep; else echo 'apt-get not available' >&2; exit 1; fi",
    {
      spriteName: SPRITE_NAME,
      workingDirectory: WORKING_DIRECTORY,
      timeout: 180,
    }
  );
  assert.equal(install.exitCode, 0, install.stderr || install.stdout);
  console.log("✓ ripgrep installed");
}

function assertIncludes(haystack: string, needle: string, message?: string): void {
  assert.ok(
    haystack.includes(needle),
    message ?? `Expected ${JSON.stringify(haystack)} to include ${JSON.stringify(needle)}`
  );
}

async function run(): Promise<void> {
  await ensureSprite(SPRITE_NAME);
  await maybeInstallRipgrep();

  const marker = `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const remoteDir = posix.join(TEST_ROOT, marker);
  const nestedDir = posix.join(remoteDir, "nested");
  const remoteFile = posix.join(nestedDir, "sample.txt");
  const uploadFile = posix.join(remoteDir, "uploaded.txt");
  const localTempDir = await mkdtemp(join(tmpdir(), "pi-sprite-e2e-"));
  const localUpload = join(localTempDir, "upload.txt");

  console.log(`Running e2e on ${SPRITE_NAME}:${remoteDir}`);

  const bashOps = createSpriteBashOperations(SPRITE_NAME, WORKING_DIRECTORY);
  const writeOps = createSpriteWriteOperations(SPRITE_NAME, WORKING_DIRECTORY);
  const readOps = createSpriteReadOperations(SPRITE_NAME, WORKING_DIRECTORY);
  const editOps = createSpriteEditOperations(SPRITE_NAME, WORKING_DIRECTORY);
  const lsOps = createSpriteLsOperations(SPRITE_NAME, WORKING_DIRECTORY);
  const findOps = createSpriteFindOperations(SPRITE_NAME, WORKING_DIRECTORY);
  const grepOps = createSpriteGrepOperations(SPRITE_NAME, WORKING_DIRECTORY);

  try {
    await execOnSprite(`rm -rf ${escapeShellArg(remoteDir)} && mkdir -p ${escapeShellArg(nestedDir)}`, {
      spriteName: SPRITE_NAME,
      workingDirectory: WORKING_DIRECTORY,
      timeout: 30,
    });

    await writeOps.mkdir(nestedDir);
    await writeOps.writeFile(remoteFile, `hello from pi-sprite\nmarker=${marker}\n`);
    const readBack = (await readOps.readFile(remoteFile)).toString("utf-8");
    assert.equal(readBack, `hello from pi-sprite\nmarker=${marker}\n`);
    await readOps.access(remoteFile);
    console.log("✓ write/read/access operations");

    await editOps.access(remoteFile);
    const beforeEdit = (await editOps.readFile(remoteFile)).toString("utf-8");
    assertIncludes(beforeEdit, "hello from pi-sprite");
    await editOps.writeFile(remoteFile, beforeEdit.replace("hello", "goodbye"));
    const afterEdit = (await readOps.readFile(remoteFile)).toString("utf-8");
    assertIncludes(afterEdit, "goodbye from pi-sprite");
    console.log("✓ edit operations");

    const exists = await lsOps.exists(remoteFile);
    assert.equal(exists, true);
    const stat = await lsOps.stat(nestedDir);
    assert.equal(stat.isDirectory(), true);
    const entries = await lsOps.readdir(nestedDir);
    assert.ok(entries.includes("sample.txt"), `Expected sample.txt in ${entries.join(", ")}`);
    console.log("✓ ls operations");

    const matches = await findOps.glob("sample.txt", nestedDir, { ignore: [], limit: 10 });
    assert.ok(
      matches.some((match) => match.endsWith("sample.txt")),
      `Expected sample.txt match, got ${JSON.stringify(matches)}`
    );
    console.log("✓ find operations");

    const isDir = await grepOps.isDirectory(nestedDir);
    assert.equal(isDir, true);
    const grepContent = await grepOps.readFile(remoteFile);
    assertIncludes(grepContent, marker);
    console.log("✓ grep operations");

    let streamed = "";
    const bashResult = await bashOps.exec(
      "printf 'cwd='; pwd; printf '\\npipe='; printf 'alpha\\nbeta\\n' | grep beta",
      remoteDir,
      {
        timeout: 30,
        onData: (data) => {
          streamed += data.toString("utf-8");
        },
      }
    );
    assert.equal(bashResult.exitCode, 0);
    assertIncludes(streamed, `cwd=${remoteDir}`);
    assertIncludes(streamed, "pipe=beta");
    console.log("✓ bash streaming operation");

    await import("node:fs/promises").then((fs) =>
      fs.writeFile(localUpload, `uploaded via --file\nmarker=${marker}\n`, "utf-8")
    );
    const uploadResult = await execOnSprite(
      `test -f ${escapeShellArg(uploadFile)} && cat ${escapeShellArg(uploadFile)}`,
      {
        spriteName: SPRITE_NAME,
        workingDirectory: WORKING_DIRECTORY,
        extraArgs: ["--file", `${localUpload}:${uploadFile}`],
        timeout: 30,
      }
    );
    assert.equal(uploadResult.exitCode, 0, uploadResult.stderr || uploadResult.stdout);
    assertIncludes(uploadResult.stdout, marker);
    console.log("✓ sprite --file upload semantics");
  } finally {
    await execOnSprite(`rm -rf ${escapeShellArg(remoteDir)}`, {
      spriteName: SPRITE_NAME,
      workingDirectory: WORKING_DIRECTORY,
      timeout: 30,
    }).catch(() => {});
    await rm(localTempDir, { recursive: true, force: true }).catch(() => {});
  }

  console.log(`✅ pi-sprite e2e passed on sprite ${SPRITE_NAME}`);
}

run().catch((error) => {
  console.error("❌ pi-sprite e2e failed");
  console.error(error);
  process.exitCode = 1;
});
