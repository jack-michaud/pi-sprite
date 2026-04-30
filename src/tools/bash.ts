import type { AgentTool } from "@mariozechner/pi-agent-core";
import type {
  BashOperations,
  BashToolDetails,
  BashToolInput,
  BashToolOptions,
} from "@mariozechner/pi-coding-agent";
import { createBashTool } from "@mariozechner/pi-coding-agent";
import { streamOnSprite } from "../sprite-exec.js";

export interface SpriteBashToolOptions extends BashToolOptions {
  /** Name of the sprite to target */
  spriteName: string;
  /** Base working directory on the sprite (default: /home/sprite) */
  workingDirectory?: string;
}

/**
 * Create bash operations that execute commands on a sprite.
 *
 * Commands run through `bash -c` on the sprite. Pipes, redirects, globs,
 * and environment variables all Just Work because the whole command is
 * one string handed to bash.
 */
export function createSpriteBashOperations(
  spriteName: string,
  workingDirectory: string = "/home/sprite"
): BashOperations {
  return {
    exec: (command, cwd, { onData, signal, timeout, env }) => {
      return streamOnSprite(command, {
        spriteName,
        workingDirectory: cwd || workingDirectory,
        timeout,
        signal,
        onData,
        env,
      });
    },
  };
}

/**
 * Create a bash tool that runs commands on a sprite instead of the local shell.
 */
export function createSpriteBashTool(
  options: SpriteBashToolOptions
): AgentTool<any> {
  const { spriteName, workingDirectory = "/home/sprite", ...rest } = options;
  const operations = createSpriteBashOperations(spriteName, workingDirectory);

  return createBashTool(workingDirectory, {
    ...rest,
    operations,
  });
}
