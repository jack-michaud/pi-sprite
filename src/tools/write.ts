import type { AgentTool } from "@mariozechner/pi-agent-core";
import type {
  WriteOperations,
  WriteToolOptions,
} from "@mariozechner/pi-coding-agent";
import { createWriteTool } from "@mariozechner/pi-coding-agent";
import { execOnSprite, writeFileToSprite } from "../sprite-exec.js";

export interface SpriteWriteToolOptions extends WriteToolOptions {
  /** Name of the sprite to target */
  spriteName: string;
  /** Base working directory on the sprite (default: /home/sprite) */
  workingDirectory?: string;
}

/**
 * Create write operations that create/modify files on a sprite.
 *
 * Files are written locally to a temp file, then uploaded via
 * `sprite exec --file` for efficient transfer without base64 overhead
 * or command-line length limits.
 */
export function createSpriteWriteOperations(
  spriteName: string,
  workingDirectory: string = "/home/sprite"
): WriteOperations {
  return {
    writeFile: async (absolutePath, content) => {
      await writeFileToSprite(spriteName, absolutePath, content, workingDirectory);
    },

    mkdir: async (dir) => {
      const result = await execOnSprite(
        `mkdir -p ${JSON.stringify(dir)}`,
        { spriteName, workingDirectory }
      );
      if (result.exitCode !== 0) {
        throw new Error(`Failed to create directory ${dir}: ${result.stderr}`);
      }
    },
  };
}

/**
 * Create a write tool that writes files on a sprite.
 *
 * Files are uploaded via `sprite exec --file` for efficient transfer
 * of large content without base64 encoding or shell escaping issues.
 */
export function createSpriteWriteTool(
  options: SpriteWriteToolOptions
): AgentTool<any> {
  const { spriteName, workingDirectory = "/home/sprite", ...rest } = options;
  const operations = createSpriteWriteOperations(spriteName, workingDirectory);

  return createWriteTool(workingDirectory, {
    ...rest,
    operations,
  });
}
