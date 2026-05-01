/**
 * pi-sprite Extension — Fly.io Sprite Remote Execution
 *
 * When --sprite (or SPRITE_NAME env) is provided, all filesystem tools
 * (read, bash, edit, write, grep, find, ls) operate on the target sprite
 * instead of the local machine. User `!` / `!!` commands are also routed
 * to the sprite.
 *
 * Usage:
 *   pi -e ./extensions/sprite.ts --sprite my-sprite
 *   SPRITE_NAME=my-sprite pi -e ./extensions/sprite.ts
 *
 * Install as a package:
 *   pi install npm:@your-org/pi-sprite
 *     # or add to settings.json globally
 *   pi install ./path/to/pi-sprite
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  createBashTool,
  createEditTool,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
  type BashOperations,
  type ReadOperations,
  type WriteOperations,
  type EditOperations,
  type GrepOperations,
  type FindOperations,
  type LsOperations,
} from "@mariozechner/pi-coding-agent";
import {
  createSpriteBashOperations,
  createSpriteEditOperations,
  createSpriteFindOperations,
  createSpriteGrepOperations,
  createSpriteLsOperations,
  createSpriteReadOperations,
} from "../src/index.js";

export default function (pi: ExtensionAPI) {
  // ── Configuration ────────────────────────────────────────────

  pi.registerFlag("sprite", {
    description: "Sprite name (or set SPRITE_NAME env var)",
    type: "string",
  });

  const localCwd = process.cwd();

  // CWD on the sprite — resolved lazily on session_start
  let spriteConfig: {
    spriteName: string;
    spriteWorkingDir: string;
  } | null = null;

  // ── Path translation: local → sprite ─────────────────────────

  function getToRemote(): ((p: string) => string) | null {
    const cfg = getSpriteConfig();
    if (!cfg) return null;
    const localPrefix = localCwd.endsWith("/") ? localCwd : localCwd + "/";
    const remotePrefix = cfg.spriteWorkingDir.endsWith("/")
      ? cfg.spriteWorkingDir
      : cfg.spriteWorkingDir + "/";
    return (localPath: string): string => {
      if (localPath === localCwd || localPath === localPrefix) {
        return cfg.spriteWorkingDir;
      }
      if (localPath.startsWith(localPrefix)) {
        return remotePrefix + localPath.slice(localPrefix.length);
      }
      return localPath;
    };
  }

  // ── Lazy resolution ──────────────────────────────────────────

  function getSpriteConfig() {
    return spriteConfig;
  }

  // ── Local tool stubs (built-in behavior) ─────────────────────

  const localRead = createReadTool(localCwd);
  const localWrite = createWriteTool(localCwd);
  const localEdit = createEditTool(localCwd);
  const localBash = createBashTool(localCwd);
  const localGrep = createGrepTool(localCwd);
  const localFind = createFindTool(localCwd);
  const localLs = createLsTool(localCwd);

  // ── Remote operations factories ──────────────────────────────

  function getReadOps(): ReadOperations {
    const cfg = getSpriteConfig()!;
    const toRemote = getToRemote()!;
    const ops = createSpriteReadOperations(cfg.spriteName, cfg.spriteWorkingDir);
    return {
      readFile: (p) => ops.readFile(toRemote(p)),
      access: (p) => ops.access(toRemote(p)),
      detectImageMimeType: (p) => ops.detectImageMimeType(toRemote(p)),
    };
  }

  function getWriteOps(): WriteOperations {
    const cfg = getSpriteConfig()!;
    const toRemote = getToRemote()!;
    const ops = createSpriteWriteOperations(cfg.spriteName, cfg.spriteWorkingDir);
    return {
      writeFile: (p, content) => ops.writeFile(toRemote(p), content),
      mkdir: (dir) => ops.mkdir(toRemote(dir)),
    };
  }

  function getEditOps(): EditOperations {
    const cfg = getSpriteConfig()!;
    const toRemote = getToRemote()!;
    const ops = createSpriteEditOperations(cfg.spriteName, cfg.spriteWorkingDir);
    return {
      readFile: (p) => ops.readFile(toRemote(p)),
      writeFile: (p, content) => ops.writeFile(toRemote(p), content),
      access: (p) => ops.access(toRemote(p)),
    };
  }

  function getBashOps(): BashOperations {
    const cfg = getSpriteConfig()!;
    const toRemote = getToRemote()!;
    const ops = createSpriteBashOperations(cfg.spriteName, cfg.spriteWorkingDir);
    return {
      exec: (command, cwd, options) => ops.exec(command, toRemote(cwd), options),
    };
  }

  function getGrepOps(): GrepOperations {
    const cfg = getSpriteConfig()!;
    const toRemote = getToRemote()!;
    const ops = createSpriteGrepOperations(cfg.spriteName, cfg.spriteWorkingDir);
    return {
      isDirectory: (p) => ops.isDirectory(toRemote(p)),
      readFile: (p) => ops.readFile(toRemote(p)),
    };
  }

  function getFindOps(): FindOperations {
    const cfg = getSpriteConfig()!;
    const toRemote = getToRemote()!;
    const ops = createSpriteFindOperations(cfg.spriteName, cfg.spriteWorkingDir);
    return {
      exists: (p) => ops.exists(toRemote(p)),
      glob: (pattern, cwd, options) => ops.glob(pattern, toRemote(cwd), options),
    };
  }

  function getLsOps(): LsOperations {
    const cfg = getSpriteConfig()!;
    const toRemote = getToRemote()!;
    const ops = createSpriteLsOperations(cfg.spriteName, cfg.spriteWorkingDir);
    return {
      exists: (p) => ops.exists(toRemote(p)),
      stat: (p) => ops.stat(toRemote(p)),
      readdir: (p) => ops.readdir(toRemote(p)),
    };
  }

  // ── Tool overrides ───────────────────────────────────────────

  pi.registerTool({
    ...localRead,
    async execute(id, params, signal, onUpdate, _ctx) {
      if (getSpriteConfig()) {
        const tool = createReadTool(localCwd, { operations: getReadOps() });
        return tool.execute(id, params, signal, onUpdate);
      }
      return localRead.execute(id, params, signal, onUpdate);
    },
  });

  pi.registerTool({
    ...localWrite,
    async execute(id, params, signal, onUpdate, _ctx) {
      if (getSpriteConfig()) {
        const tool = createWriteTool(localCwd, { operations: getWriteOps() });
        return tool.execute(id, params, signal, onUpdate);
      }
      return localWrite.execute(id, params, signal, onUpdate);
    },
  });

  pi.registerTool({
    ...localEdit,
    async execute(id, params, signal, onUpdate, _ctx) {
      if (getSpriteConfig()) {
        const tool = createEditTool(localCwd, { operations: getEditOps() });
        return tool.execute(id, params, signal, onUpdate);
      }
      return localEdit.execute(id, params, signal, onUpdate);
    },
  });

  pi.registerTool({
    ...localBash,
    async execute(id, params, signal, onUpdate, _ctx) {
      if (getSpriteConfig()) {
        const tool = createBashTool(localCwd, { operations: getBashOps() });
        return tool.execute(id, params, signal, onUpdate);
      }
      return localBash.execute(id, params, signal, onUpdate);
    },
  });

  pi.registerTool({
    ...localGrep,
    async execute(id, params, signal, onUpdate, _ctx) {
      if (getSpriteConfig()) {
        const tool = createGrepTool(localCwd, { operations: getGrepOps() });
        return tool.execute(id, params, signal, onUpdate);
      }
      return localGrep.execute(id, params, signal, onUpdate);
    },
  });

  pi.registerTool({
    ...localFind,
    async execute(id, params, signal, onUpdate, _ctx) {
      if (getSpriteConfig()) {
        const tool = createFindTool(localCwd, { operations: getFindOps() });
        return tool.execute(id, params, signal, onUpdate);
      }
      return localFind.execute(id, params, signal, onUpdate);
    },
  });

  pi.registerTool({
    ...localLs,
    async execute(id, params, signal, onUpdate, _ctx) {
      if (getSpriteConfig()) {
        const tool = createLsTool(localCwd, { operations: getLsOps() });
        return tool.execute(id, params, signal, onUpdate);
      }
      return localLs.execute(id, params, signal, onUpdate);
    },
  });

  // ── Session start: resolve sprite config ─────────────────────

  pi.on("session_start", async (_event, ctx) => {
    const flagValue = pi.getFlag("sprite") as string | undefined;
    const envName = process.env.SPRITE_NAME;
    const name = flagValue ?? envName;

    if (name) {
      const envDir = process.env.SPRITE_WORKING_DIR;
      let spriteWorkingDir = envDir ?? "/home/sprite";

      // Validate the sprite exists by running a quick `pwd`
      try {
        const { execOnSprite } = await import("../src/sprite-exec.js");
        const result = await execOnSprite("pwd", {
          spriteName: name,
          workingDirectory: spriteWorkingDir,
        });
        if (result.exitCode === 0) {
          spriteWorkingDir = result.stdout.trim();
        }
      } catch (e) {
        ctx.ui.notify(
          `⚠️ Could not verify sprite "${name}". Make sure it's running and the sprite CLI is authenticated.`,
          "error"
        );
        // Leave spriteConfig as null so tools fall back to local
        return;
      }

      spriteConfig = { spriteName: name, spriteWorkingDir };

      ctx.ui.setStatus(
        "sprite",
        ctx.ui.theme.fg("accent", `Sprite: ${name}:${spriteWorkingDir}`)
      );
      ctx.ui.notify(
        `🧚 Sprite mode: ${name} (${spriteWorkingDir})`,
        "success"
      );
    } else {
      ctx.ui.setStatus("sprite", ctx.ui.theme.fg("dim", "Sprite: local"));
    }
  });

  // ── User bash (! / !!) ───────────────────────────────────────

  pi.on("user_bash", (_event) => {
    if (!getSpriteConfig()) return;
    return { operations: getBashOps() };
  });

  // ── Patch system prompt to show remote CWD ───────────────────

  pi.on("before_agent_start", async (event) => {
    const cfg = getSpriteConfig();
    if (cfg) {
      const modified = event.systemPrompt.replace(
        `Current working directory: ${localCwd}`,
        `Current working directory: ${cfg.spriteWorkingDir} (Sprite: ${cfg.spriteName})`
      );
      return { systemPrompt: modified };
    }
  });

  // ── /sprite command ──────────────────────────────────────────

  pi.registerCommand("sprite", {
    description: "Show current sprite connection status or switch sprite",
    handler: async (args, ctx) => {
      const cfg = getSpriteConfig();
      if (!cfg) {
        ctx.ui.notify("Not in sprite mode. Run with --sprite <name>", "info");
        ctx.ui.notify(
          "Hint: pi --sprite my-sprite  or  SPRITE_NAME=my-sprite pi",
          "info"
        );
        return;
      }

      if (args) {
        // Switch to a different sprite (creates new session)
        const newName = args.trim();
        await ctx.reload();
        ctx.ui.notify(`Switched to sprite: ${newName}`, "success");
      } else {
        ctx.ui.notify(
          `Connected to: ${cfg.spriteName} (${cfg.spriteWorkingDir})`,
          "info"
        );
      }
    },
  });
}
