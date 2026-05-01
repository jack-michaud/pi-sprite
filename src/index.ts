import type { AgentTool } from "@mariozechner/pi-agent-core";
import {
  createSpriteReadTool,
  type SpriteReadToolOptions,
} from "./tools/read.js";
import {
  createSpriteBashTool,
  type SpriteBashToolOptions,
} from "./tools/bash.js";
import {
  createSpriteEditTool,
  type SpriteEditToolOptions,
} from "./tools/edit.js";
import {
  createSpriteWriteTool,
  type SpriteWriteToolOptions,
} from "./tools/write.js";
import {
  createSpriteGrepTool,
  type SpriteGrepToolOptions,
} from "./tools/grep.js";
import {
  createSpriteFindTool,
  type SpriteFindToolOptions,
} from "./tools/find.js";
import {
  createSpriteLsTool,
  type SpriteLsToolOptions,
} from "./tools/ls.js";

export * from "./sprite-exec.js";
export { createSpriteReadTool, type SpriteReadToolOptions, createSpriteReadOperations } from "./tools/read.js";
export { createSpriteBashTool, type SpriteBashToolOptions, createSpriteBashOperations } from "./tools/bash.js";
export { createSpriteEditTool, type SpriteEditToolOptions, createSpriteEditOperations } from "./tools/edit.js";
export { createSpriteWriteTool, type SpriteWriteToolOptions, createSpriteWriteOperations } from "./tools/write.js";
export { createSpriteGrepTool, type SpriteGrepToolOptions, createSpriteGrepOperations, verifyRipgrepInstalled } from "./tools/grep.js";
export { createSpriteFindTool, type SpriteFindToolOptions, createSpriteFindOperations } from "./tools/find.js";
export { createSpriteLsTool, type SpriteLsToolOptions, createSpriteLsOperations } from "./tools/ls.js";

export interface SpriteToolSet {
  read: AgentTool<any>;
  bash: AgentTool<any>;
  edit: AgentTool<any>;
  write: AgentTool<any>;
  grep: AgentTool<any>;
  find: AgentTool<any>;
  ls: AgentTool<any>;
}

export interface CreateSpriteToolsOptions {
  /** Name of the sprite to target */
  spriteName: string;
  /** Base working directory on the sprite (default: /home/sprite) */
  workingDirectory?: string;
}

/**
 * Create all sprite tools with default settings.
 *
 * ```ts
 * const tools = createSpriteTools({ spriteName: "my-sprite" });
 * // tools.read, tools.bash, tools.edit, tools.write, tools.grep, tools.find, tools.ls
 * ```
 */
export function createSpriteTools(
  options: CreateSpriteToolsOptions
): SpriteToolSet {
  const { spriteName, workingDirectory = "/home/sprite" } = options;

  return {
    read: createSpriteReadTool({ spriteName, workingDirectory }),
    bash: createSpriteBashTool({ spriteName, workingDirectory }),
    edit: createSpriteEditTool({ spriteName, workingDirectory }),
    write: createSpriteWriteTool({ spriteName, workingDirectory }),
    grep: createSpriteGrepTool({ spriteName, workingDirectory }),
    find: createSpriteFindTool({ spriteName, workingDirectory }),
    ls: createSpriteLsTool({ spriteName, workingDirectory }),
  };
}

/**
 * Create the default "coding" tool set (read, bash, edit, write).
 *
 * This mirrors pi-coding-agent's `codingTools` preset.
 */
export function createSpriteCodingTools(
  options: CreateSpriteToolsOptions
): AgentTool<any>[] {
  const { spriteName, workingDirectory = "/home/sprite" } = options;
  return [
    createSpriteReadTool({ spriteName, workingDirectory }),
    createSpriteBashTool({ spriteName, workingDirectory }),
    createSpriteEditTool({ spriteName, workingDirectory }),
    createSpriteWriteTool({ spriteName, workingDirectory }),
  ];
}

/**
 * Create the "read-only" tool set (read, grep, find, ls).
 *
 * This mirrors pi-coding-agent's `readOnlyTools` preset — useful
 * for exploration without modification.
 */
export function createSpriteReadOnlyTools(
  options: CreateSpriteToolsOptions
): AgentTool<any>[] {
  const { spriteName, workingDirectory = "/home/sprite" } = options;
  return [
    createSpriteReadTool({ spriteName, workingDirectory }),
    createSpriteGrepTool({ spriteName, workingDirectory }),
    createSpriteFindTool({ spriteName, workingDirectory }),
    createSpriteLsTool({ spriteName, workingDirectory }),
  ];
}
