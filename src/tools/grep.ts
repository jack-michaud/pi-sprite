import type { AgentTool } from "@mariozechner/pi-agent-core";
import type {
  GrepOperations,
  GrepToolDetails,
  GrepToolInput,
  GrepToolOptions,
} from "@mariozechner/pi-coding-agent";
import { createGrepTool } from "@mariozechner/pi-coding-agent";
import { execOnSprite, resolveSpritePath } from "../sprite-exec.js";

export interface SpriteGrepToolOptions extends GrepToolOptions {
  /** Name of the sprite to target */
  spriteName: string;
  /** Base working directory on the sprite (default: /home/sprite) */
  workingDirectory?: string;
}

/**
 * Create grep operations that search files on a sprite.
 *
 * Requires ripgrep (`rg`) to be installed on the sprite.
 * All file access is done through sprite-exec commands.
 */
export function createSpriteGrepOperations(
  spriteName: string,
  workingDirectory: string = "/home/sprite"
): GrepOperations {
  return {
    isDirectory: async (absolutePath) => {
      const result = await execOnSprite(
        `test -d ${JSON.stringify(resolveSpritePath(absolutePath))} && echo "yes" || echo "no"`,
        { spriteName, workingDirectory: resolveSpritePath(workingDirectory) }
      );
      return result.stdout.trim() === "yes";
    },

    readFile: async (absolutePath) => {
      const result = await execOnSprite(
        `cat ${JSON.stringify(resolveSpritePath(absolutePath))}`,
        { spriteName, workingDirectory: resolveSpritePath(workingDirectory) }
      );
      return result.stdout;
    },
  };
}

/**
 * Verify that ripgrep (`rg`) is installed on the sprite.
 * Throws an error with a clear message if not.
 */
export async function verifyRipgrepInstalled(
  spriteName: string,
  workingDirectory: string = "/home/sprite"
): Promise<void> {
  const result = await execOnSprite("which rg", {
    spriteName,
    workingDirectory: resolveSpritePath(workingDirectory),
  });
  if (result.exitCode !== 0) {
    throw new Error(
      "ripgrep (`rg`) is not installed on this sprite. " +
        "Install it with: sprite -s " +
        spriteName +
        " exec -- bash -c 'apt-get update && apt-get install -y ripgrep'"
    );
  }
}

/**
 * Create a grep tool that searches files on a sprite.
 *
 * **Requires `rg` (ripgrep) to be installed on the sprite.**
 * The tool will throw an error during first use if ripgrep is not found.
 */
export function createSpriteGrepTool(
  options: SpriteGrepToolOptions
): AgentTool<any> {
  const { spriteName, workingDirectory = "/home/sprite", ...rest } = options;
  const operations = createSpriteGrepOperations(spriteName, workingDirectory);

  // Wrap the operations to inject a pre-flight check for rg
  let verified = false;
  const checkedOperations: GrepOperations = {
    isDirectory: async (p) => {
      if (!verified) {
        await verifyRipgrepInstalled(spriteName, workingDirectory);
        verified = true;
      }
      return operations.isDirectory(p);
    },
    readFile: async (p) => {
      if (!verified) {
        await verifyRipgrepInstalled(spriteName, workingDirectory);
        verified = true;
      }
      return operations.readFile(p);
    },
  };

  return createGrepTool(workingDirectory, {
    ...rest,
    operations: checkedOperations,
  });
}
