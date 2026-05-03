import type { AgentTool } from "@mariozechner/pi-agent-core";
import type {
  FindOperations,
  FindToolDetails,
  FindToolInput,
  FindToolOptions,
} from "@mariozechner/pi-coding-agent";
import { createFindTool } from "@mariozechner/pi-coding-agent";
import { execOnSprite, resolveSpritePath } from "../sprite-exec.js";

export interface SpriteFindToolOptions extends FindToolOptions {
  /** Name of the sprite to target */
  spriteName: string;
  /** Base working directory on the sprite (default: /home/sprite) */
  workingDirectory?: string;
}

/**
 * Create find operations that search for files on a sprite.
 *
 * Requires `fd` to be installed on the sprite.
 * All file access is done through sprite-exec commands.
 */
export function createSpriteFindOperations(
  spriteName: string,
  workingDirectory: string = "/home/sprite"
): FindOperations {
  return {
    exists: async (absolutePath) => {
      const result = await execOnSprite(
        `test -e ${JSON.stringify(resolveSpritePath(absolutePath))} && echo "yes" || echo "no"`,
        { spriteName, workingDirectory: resolveSpritePath(workingDirectory) }
      );
      return result.stdout.trim() === "yes";
    },

    glob: async (pattern, cwd, { ignore, limit }) => {
      // Build a find command that handles basic glob patterns
      // For simple *.ext patterns, we use bash globbing
      // For **/ patterns, we use find
      let command: string;

      if (pattern.includes("**") || pattern.includes("/")) {
        // Convert glob to find pattern - basic approximation
        const findPattern = pattern
          .replace(/\*\*/g, "*")
          .replace(/\*/g, "*")
          .replace(/\?/g, "?");
        command = `find ${JSON.stringify(resolveSpritePath(cwd))} -name ${JSON.stringify(findPattern)} -type f 2>/dev/null | head -n ${limit}`;
      } else {
        // Simple glob in cwd
        command = `find ${JSON.stringify(resolveSpritePath(cwd))} -maxdepth 1 -name ${JSON.stringify(pattern)} -type f 2>/dev/null | head -n ${limit}`;
      }

      const result = await execOnSprite(command, {
        spriteName,
        workingDirectory: resolveSpritePath(workingDirectory),
      });
      return result.stdout
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
    },
  };
}

/**
 * Create a find tool that searches for files on a sprite.
 *
 * Falls back to the `find` command if `fd` is not installed.
 */
export function createSpriteFindTool(
  options: SpriteFindToolOptions
): AgentTool<any> {
  const { spriteName, workingDirectory = "/home/sprite", ...rest } = options;
  const operations = createSpriteFindOperations(spriteName, workingDirectory);

  return createFindTool(workingDirectory, {
    ...rest,
    operations,
  });
}
