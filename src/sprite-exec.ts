import { spawn } from "child_process";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface SpriteExecOptions {
  /** Name of the sprite to target */
  spriteName: string;
  /** Base working directory on the sprite (default: /home/sprite) */
  workingDirectory?: string;
  /** Timeout in seconds (optional) */
  timeout?: number;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

/**
 * Escape a string for safe use inside a single-quoted shell argument.
 */
export function escapeShellArg(arg: string): string {
  if (!arg.includes("'")) {
    return `'${arg}'`;
  }
  return "'" + arg.replace(/'/g, "'\"'\"'") + "'";
}

/**
 * Build the base `sprite exec` argument array.
 *
 * `extraArgs` are inserted before the `--` separator (e.g. `--file`).
 */
function buildSpriteArgs(
  spriteName: string,
  command: string,
  extraArgs: string[] = []
): string[] {
  const args = ["-s", spriteName, "exec"];
  args.push(...extraArgs);
  args.push("--", "bash", "-c", command);
  return args;
}

/**
 * Execute a command on a sprite via the sprite CLI.
 *
 * Commands run through `bash -c` on the sprite, with `cd <workingDirectory>`
 * prepended so relative paths resolve correctly.
 */
export function execOnSprite(
  command: string,
  options: SpriteExecOptions & { extraArgs?: string[] }
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const {
      spriteName,
      workingDirectory = "/home/sprite",
      timeout,
      signal,
      extraArgs = [],
    } = options;

    const fullCommand = `cd ${escapeShellArg(workingDirectory)} && ${command}`;
    const args = buildSpriteArgs(spriteName, fullCommand, extraArgs);

    const child = spawn("sprite", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let timeoutHandle: NodeJS.Timeout | undefined;

    if (timeout !== undefined && timeout > 0) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeout * 1000);
    }

    const onAbort = () => {
      child.kill();
    };

    if (signal) {
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener("abort", onAbort, { once: true });
      }
    }

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString("utf-8");
    });

    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString("utf-8");
    });

    child.on("error", (err) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (signal) signal.removeEventListener("abort", onAbort);
      reject(err);
    });

    child.on("close", (code) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (signal) signal.removeEventListener("abort", onAbort);

      if (signal?.aborted) {
        reject(new Error("Operation aborted"));
        return;
      }
      if (timedOut) {
        reject(new Error(`timeout:${timeout}`));
        return;
      }
      resolve({ stdout, stderr, exitCode: code });
    });
  });
}

/**
 * Stream a command execution on a sprite, calling onData for each chunk.
 *
 * Mirrors the interface expected by pi-coding-agent's BashOperations.exec.
 */
export function streamOnSprite(
  command: string,
  options: SpriteExecOptions & {
    onData: (data: Buffer) => void;
    extraArgs?: string[];
    env?: NodeJS.ProcessEnv;
  }
): Promise<{ exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const {
      spriteName,
      workingDirectory = "/home/sprite",
      timeout,
      signal,
      onData,
      extraArgs = [],
      env,
    } = options;

    const fullCommand = `cd ${escapeShellArg(workingDirectory)} && ${command}`;
    const args = buildSpriteArgs(spriteName, fullCommand, extraArgs);

    const child = spawn("sprite", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });

    let timedOut = false;
    let timeoutHandle: NodeJS.Timeout | undefined;

    if (timeout !== undefined && timeout > 0) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeout * 1000);
    }

    const onAbort = () => {
      child.kill();
    };

    if (signal) {
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener("abort", onAbort, { once: true });
      }
    }

    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);

    child.on("error", (err) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (signal) signal.removeEventListener("abort", onAbort);
      reject(err);
    });

    child.on("close", (code) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (signal) signal.removeEventListener("abort", onAbort);

      if (signal?.aborted) {
        reject(new Error("Operation aborted"));
        return;
      }
      if (timedOut) {
        reject(new Error(`timeout:${timeout}`));
        return;
      }
      resolve({ exitCode: code });
    });
  });
}

/**
 * Upload a local file to a sprite using `sprite exec --file`.
 *
 * The uploaded file is assumed to be available on the sprite at the same
 * absolute path as the local file. It is then moved to `remoteDest`.
 *
 * Adjust this if your sprite CLI places uploaded files elsewhere.
 */
export async function uploadFileToSprite(
  spriteName: string,
  localPath: string,
  remoteDest: string,
  workingDirectory: string = "/home/sprite"
): Promise<void> {
  const result = await execOnSprite(
    `mv ${escapeShellArg(localPath)} ${escapeShellArg(remoteDest)}`,
    {
      spriteName,
      workingDirectory,
      extraArgs: ["--file", localPath],
    }
  );
  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to upload file to ${remoteDest}: ${result.stderr || result.stdout}`
    );
  }
}

/**
 * Write string content to a remote file on a sprite by:
 * 1. Writing to a local temp file
 * 2. Uploading via `sprite exec --file`
 * 3. Moving it to the target path on the sprite
 *
 * This avoids base64 encoding and command-line length limits.
 */
export async function writeFileToSprite(
  spriteName: string,
  remotePath: string,
  content: string,
  workingDirectory: string = "/home/sprite"
): Promise<void> {
  const tmpFile = join(tmpdir(), `pi-sprite-${randomBytes(8).toString("hex")}.txt`);

  // Write locally
  await import("node:fs/promises").then((fs) => fs.writeFile(tmpFile, content, "utf-8"));

  try {
    await uploadFileToSprite(spriteName, tmpFile, remotePath, workingDirectory);
  } finally {
    // Clean up local temp file (best-effort)
    await import("node:fs/promises")
      .then((fs) => fs.unlink(tmpFile))
      .catch(() => {});
  }
}

/**
 * Create a shell command that writes content to a file on a sprite using
 * base64 encoding via heredoc. Used as a fallback when `--file` is unavailable.
 */
export function createSpriteWriteCommand(
  absolutePath: string,
  content: string
): string {
  const base64 = Buffer.from(content, "utf-8").toString("base64");
  let delimiter = `EOF_${randomBytes(8).toString("hex")}`;
  while (base64.includes(delimiter)) {
    delimiter = `EOF_${randomBytes(8).toString("hex")}`;
  }
  return `base64 -d > ${JSON.stringify(absolutePath)} << '${delimiter}'\n${base64}\n${delimiter}`;
}
