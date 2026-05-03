import type { AgentTool } from "@mariozechner/pi-agent-core";
import type {
  LsOperations,
  LsToolDetails,
  LsToolInput,
  LsToolOptions,
} from "@mariozechner/pi-coding-agent";
import { createLsTool } from "@mariozechner/pi-coding-agent";
import { execOnSprite, resolveSpritePath } from "../sprite-exec.js";

export interface SpriteLsToolOptions extends LsToolOptions {
  /** Name of the sprite to target */
  spriteName: string;
  /** Base working directory on the sprite (default: /home/sprite) */
  workingDirectory?: string;
}

/**
 * Create ls operations that list directories on a sprite.
 */
export function createSpriteLsOperations(
  spriteName: string,
  workingDirectory: string = "/home/sprite"
): LsOperations {
  return {
    exists: async (absolutePath) => {
      const result = await execOnSprite(
        `test -e ${JSON.stringify(resolveSpritePath(absolutePath))} && echo "yes" || echo "no"`,
        { spriteName, workingDirectory: resolveSpritePath(workingDirectory) }
      );
      return result.stdout.trim() === "yes";
    },

    stat: async (absolutePath) => {
      const result = await execOnSprite(
        `test -d ${JSON.stringify(resolveSpritePath(absolutePath))} && echo "dir" || echo "file"`,
        { spriteName, workingDirectory: resolveSpritePath(workingDirectory) }
      );
      const isDir = result.stdout.trim() === "dir";
      return {
        isDirectory: () => isDir,
      };
    },

    readdir: async (absolutePath) => {
      const result = await execOnSprite(
        `ls -A ${JSON.stringify(resolveSpritePath(absolutePath))} 2>/dev/null || echo ""`,
        { spriteName, workingDirectory: resolveSpritePath(workingDirectory) }
      );
      const items = result.stdout
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      return items;
    },
  };
}

/**
 * Create an ls tool that lists directory contents on a sprite.
 */
export function createSpriteLsTool(
  options: SpriteLsToolOptions
): AgentTool<any> {
  const { spriteName, workingDirectory = "/home/sprite", ...rest } = options;
  const operations = createSpriteLsOperations(spriteName, workingDirectory);

  return createLsTool(workingDirectory, {
    ...rest,
    operations,
  });
}
