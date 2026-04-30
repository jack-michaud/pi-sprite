import type { AgentTool } from "@mariozechner/pi-agent-core";
import type {
  EditOperations,
  EditToolOptions,
} from "@mariozechner/pi-coding-agent";
import { createEditTool } from "@mariozechner/pi-coding-agent";
import { execOnSprite, writeFileToSprite } from "../sprite-exec.js";

export interface SpriteEditToolOptions extends EditToolOptions {
  /** Name of the sprite to target */
  spriteName: string;
  /** Base working directory on the sprite (default: /home/sprite) */
  workingDirectory?: string;
}

/**
 * Create edit operations that modify files on a sprite.
 *
 * The edit tool reads the file via `cat`, then writes it back via file upload.
 */
export function createSpriteEditOperations(
  spriteName: string,
  workingDirectory: string = "/home/sprite"
): EditOperations {
  return {
    readFile: async (absolutePath) => {
      const result = await execOnSprite(`cat ${JSON.stringify(absolutePath)}`, {
        spriteName,
        workingDirectory,
      });
      return Buffer.from(result.stdout, "utf-8");
    },

    writeFile: async (absolutePath, content) => {
      await writeFileToSprite(spriteName, absolutePath, content, workingDirectory);
    },

    access: async (absolutePath) => {
      const result = await execOnSprite(
        `test -r ${JSON.stringify(absolutePath)} && test -w ${JSON.stringify(absolutePath)} && echo "ok"`,
        { spriteName, workingDirectory }
      );
      if (!result.stdout.trim()) {
        throw new Error(`File not accessible: ${absolutePath}`);
      }
    },
  };
}

/**
 * Create an edit tool that makes targeted text replacements on a sprite.
 */
export function createSpriteEditTool(
  options: SpriteEditToolOptions
): AgentTool<any> {
  const { spriteName, workingDirectory = "/home/sprite", ...rest } = options;
  const operations = createSpriteEditOperations(spriteName, workingDirectory);

  return createEditTool(workingDirectory, {
    ...rest,
    operations,
  });
}
