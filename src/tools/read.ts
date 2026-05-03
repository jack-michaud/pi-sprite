import type { AgentTool } from "@mariozechner/pi-agent-core";
import type {
  ReadOperations,
  ReadToolOptions,
} from "@mariozechner/pi-coding-agent";
import { createReadTool } from "@mariozechner/pi-coding-agent";
import { execOnSprite, resolveSpritePath } from "../sprite-exec.js";

export interface SpriteReadToolOptions extends ReadToolOptions {
  /** Name of the sprite to target */
  spriteName: string;
  /** Base working directory on the sprite (default: /home/sprite) */
  workingDirectory?: string;
}

/**
 * Create read operations that target a sprite instead of the local filesystem.
 *
 * Files are read via `base64` encoding to safely handle both text and binary
 * (images). Image MIME detection uses the `file` command on the sprite.
 */
export function createSpriteReadOperations(
  spriteName: string,
  workingDirectory: string = "/home/sprite"
): ReadOperations {
  return {
    readFile: async (absolutePath) => {
      const result = await execOnSprite(
        `base64 ${JSON.stringify(resolveSpritePath(absolutePath))}`,
        { spriteName, workingDirectory: resolveSpritePath(workingDirectory) }
      );
      return Buffer.from(result.stdout.trim(), "base64");
    },

    access: async (absolutePath) => {
      const result = await execOnSprite(
        `test -r ${JSON.stringify(resolveSpritePath(absolutePath))} && echo "ok"`,
        { spriteName, workingDirectory: resolveSpritePath(workingDirectory) }
      );
      if (!result.stdout.trim()) {
        throw new Error(`File not accessible: ${absolutePath}`);
      }
    },

    detectImageMimeType: async (absolutePath) => {
      const result = await execOnSprite(
        `file --mime-type -b ${JSON.stringify(resolveSpritePath(absolutePath))}`,
        { spriteName, workingDirectory: resolveSpritePath(workingDirectory) }
      );
      const mime = result.stdout.trim();
      const supported = ["image/jpeg", "image/png", "image/gif", "image/webp"];
      if (supported.includes(mime)) {
        return mime;
      }
      return null;
    },
  };
}

/**
 * Create a read tool that reads files from a sprite.
 */
export function createSpriteReadTool(
  options: SpriteReadToolOptions
): AgentTool<any> {
  const { spriteName, workingDirectory = "/home/sprite", ...rest } = options;
  const operations = createSpriteReadOperations(spriteName, workingDirectory);

  return createReadTool(workingDirectory, {
    ...rest,
    operations,
  });
}
