# pi-sprite

Sprite-specific implementations of the [pi-coding-agent] tools. Run your agent on [Fly.io Sprites] instead of the local filesystem.

[pi-coding-agent]: https://github.com/badlogic/pi-mono
[Fly.io Sprites]: https://fly.io/docs/sprite/

## What this is

`pi-coding-agent` provides powerful file-system tools (`read`, `write`, `edit`, `bash`, `grep`, `find`, `ls`) for building AI coding agents. By default they operate on your local machine.

`pi-sprite` provides **drop-in replacements** that operate on a **Fly.io Sprite** — an isolated cloud VM accessed via the `sprite` CLI.

## Install

```bash
npm install @mariozechner/pi-coding-agent
# or just clone this repo and build
npm install
npm run build
```

Requires the `sprite` CLI to be installed and authenticated:

```bash
sprite login
sprite list                    # verify
```

## Usage

### Create tool presets (mirrors pi-coding-agent presets)

```typescript
import { createAgentSession, SessionManager } from "@mariozechner/pi-coding-agent";
import { createSpriteCodingTools } from "pi-sprite";

const tools = createSpriteCodingTools({
  spriteName: "my-sprite",
  workingDirectory: "/home/sprite/project",
});

const { session } = await createAgentSession({
  model,
  tools,
  sessionManager: SessionManager.inMemory(),
});

await session.prompt("Read the README and tell me what this project does.");
```

### Individual tools

```typescript
import {
  createSpriteReadTool,
  createSpriteBashTool,
  createSpriteWriteTool,
  createSpriteEditTool,
  createSpriteGrepTool,
  createSpriteFindTool,
  createSpriteLsTool,
} from "pi-sprite";

const read = createSpriteReadTool({ spriteName: "my-sprite" });
const bash = createSpriteBashTool({ spriteName: "my-sprite" });
const write = createSpriteWriteTool({ spriteName: "my-sprite" });
const edit = createSpriteEditTool({ spriteName: "my-sprite" });
const grep = createSpriteGrepTool({ spriteName: "my-sprite" });
const find = createSpriteFindTool({ spriteName: "my-sprite" });
const ls = createSpriteLsTool({ spriteName: "my-sprite" });
```

### All tools at once

```typescript
import { createSpriteTools } from "pi-sprite";

const tools = createSpriteTools({
  spriteName: "my-sprite",
  workingDirectory: "/home/sprite/project",
});

// tools.read, tools.bash, tools.edit, tools.write,
// tools.grep, tools.find, tools.ls
```

### Read-only tools (safe for exploration)

```typescript
import { createSpriteReadOnlyTools } from "pi-sprite";

const tools = createSpriteReadOnlyTools({ spriteName: "my-sprite" });
// [read, grep, find, ls] — no modifications allowed
```

### Using with the low-level `Agent`

If you're building directly with `@mariozechner/pi-agent-core` (no session manager, no extensions—just the agent loop):

```typescript
import { Agent } from "@mariozechner/pi-agent-core";
import { getModel, streamSimple } from "@mariozechner/pi-ai";
import { createSpriteCodingTools } from "pi-sprite";

const tools = createSpriteCodingTools({
  spriteName: "my-sprite",
  workingDirectory: "/home/sprite/project",
});

const agent = new Agent({
  initialState: {
    systemPrompt: "You are a helpful assistant on a Fly.io Sprite.",
    model: getModel("anthropic", "claude-sonnet-4-20250514"),
    tools,
    thinkingLevel: "off",
  },
  streamFn: streamSimple,
});

agent.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

await agent.prompt("What files are in the current directory?");
```

## How it works

All tool operations delegate to `sprite -s <name> exec -- <command>`, the standard way to interact with Sprites. There's no SSH — it's all through the sprite CLI.

| Tool | How it works |
|------|-------------|
| `read` | `base64 <path>` on sprite, decoded locally |
| `write` | Writes locally → `sprite exec --file` → `mv` on sprite |
| `edit` | `cat` on sprite → apply edits locally → upload via `--file` → `mv` on sprite |
| `bash` | `sprite exec -- <command>` natively |
| `grep` | `rg` on sprite with JSON output |
| `find` | `find` command on sprite when `fd` unavailable |
| `ls` | `ls -A` on sprite |

## Sprite Prerequisites

- **`sprite` CLI installed and authenticated** (`sprite login`)
- **`bash`** available on the sprite (standard on Fly.io base images)
- **`rg` (ripgrep)** for `grep` — the tool will throw a clear error if missing
- **`file`** for image MIME detection in `read` (usually available via `libmagic1`)

Install `rg` on an Alpine-based sprite:
```bash
sprite -s my-sprite exec -- bash -c 'apk add ripgrep'
```

Or Debian/Ubuntu:
```bash
sprite -s my-sprite exec -- bash -c 'apt-get update && apt-get install -y ripgrep'
```

## Built-in REPL

This repo includes a ready-to-run REPL in `src/main.ts`. It uses `@mariozechner/pi-agent-core`'s `Agent` directly to give you a minimal, streaming terminal agent on your sprite.

```bash
# Run with defaults (sprite: pi-sprite-test, model: anthropic/claude-sonnet-4-20250514)
npm start

# Configure via environment variables
SPRITE_NAME=prod-1 MODEL_PROVIDER=openai MODEL_ID=gpt-4o npm start
SPRITE_WORKING_DIR=/home/sprite/app npm start
```

### REPL features

- **Streaming output** — text appears as the model generates it
- **Multi-line input** — end a line with `\` and press Enter to continue
- **Tool call display** — shows `[read]`, `[bash]`, etc. in real time
- **Slash commands** — `/exit` to quit

Requirements for the REPL:
- `ANTHROPIC_API_KEY` (or matching key for your provider)
- `sprite` CLI authenticated and the target sprite exists

## API

### `createSpriteCodingTools(options)`

Returns `[read, bash, edit, write]` for the default coding workflow.

### `createSpriteReadOnlyTools(options)`

Returns `[read, grep, find, ls]` for safe exploration without write access.

### `createSpriteTools(options)`

Returns all 7 tools as a named object: `{ read, bash, edit, write, grep, find, ls }`.

### `createSprite<Name>Tool(options)`

Create a single tool with full control over its options.

All functions accept:
- `spriteName` — the sprite's name (`sprite list` to see yours)
- `workingDirectory` — base directory on the sprite (default: `/home/sprite`)

## License

MIT
