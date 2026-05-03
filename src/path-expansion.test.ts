import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chmod } from "node:fs/promises";
import { resolveSpritePath, SPRITE_HOME } from "./sprite-exec.js";
import { createSpriteReadOperations } from "./tools/read.js";

async function createFakeSprite(argsFile: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pi-sprite-fake-"));
  const spritePath = join(dir, "sprite");
  const script = `#!/bin/sh
printf '%s\n' "$@" > "$SPRITE_ARGS_FILE"
printf 'b2s=\n'
`;
  await writeFile(spritePath, script, "utf8");
  await chmod(spritePath, 0o755);
  return dir;
}

async function main() {
  assert.equal(resolveSpritePath("~"), SPRITE_HOME);
  assert.equal(resolveSpritePath("~/.agents/skills/SKILL.md"), "/home/sprite/.agents/skills/SKILL.md");
  assert.equal(resolveSpritePath("/tmp/absolute"), "/tmp/absolute");

  const argsFileDir = await mkdtemp(join(tmpdir(), "pi-sprite-args-"));
  const argsFile = join(argsFileDir, "args.txt");
  const fakeSpriteDir = await createFakeSprite(argsFile);

  const originalPath = process.env.PATH ?? "";
  process.env.PATH = `${fakeSpriteDir}:${originalPath}`;
  process.env.SPRITE_ARGS_FILE = argsFile;

  try {
    const ops = createSpriteReadOperations("test-sprite", "/home/sprite/project");
    const content = await ops.readFile("~/.agents/skills/SKILL.md");
    assert.equal(content.toString("utf8"), "ok");

    const args = await readFile(argsFile, "utf8");
    assert.match(args, /\/home\/sprite\/\.agents\/skills\/SKILL\.md/);
    assert.doesNotMatch(args, /(^|\n)~\//);
  } finally {
    process.env.PATH = originalPath;
    delete process.env.SPRITE_ARGS_FILE;
    await rm(argsFileDir, { recursive: true, force: true });
    await rm(fakeSpriteDir, { recursive: true, force: true });
  }

  console.log("path expansion test passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
