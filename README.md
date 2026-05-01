# pi-sprite

Sprite-specific implementations of the [pi-coding-agent] tools. Run your agent on [Fly.io Sprites] instead of the local filesystem.

[pi-coding-agent]: https://github.com/badlogic/pi-mono
[Fly.io Sprites]: https://fly.io/docs/sprite/

## What this is

`pi-coding-agent` provides powerful file-system tools (`read`, `write`, `edit`, `bash`, `grep`, `find`, `ls`) for building AI coding agents. By default they operate on your local machine.

`pi-sprite` provides **drop-in replacements** that operate on a **Fly.io Sprite** — an isolated cloud VM accessed via the `sprite` CLI.

This package works in **two modes**:

1. **Extension mode** — install as a pi package and your existing `pi` session transparently targets a sprite
2. **SDK mode** — import tool factories programmatically in your own scripts

---

## Quick Start (Extension Mode)

Install the pi extension and run pi targeting your sprite:

```bash
# From a local clone
pi install /path/to/pi-sprite

# Or when available on npm
# pi install npm:pi-sprite

# Then launch pi targeting a sprite
pi --sprite my-sprite

# Or via environment variable
SPRITE_NAME=my-sprite SPRITE_WORKING_DIR=/home/sprite/project pi
```

When `--sprite` (or `SPRITE_NAME`) is set, every built-in tool operates on the sprite:
- `read`, `write`, `edit`, `bash`, `grep`, `find`, `ls`
- `!` and `!!` user bash commands

The status bar shows `Sprite: my-sprite:/home/sprite` so you always know where you're running.

Use `/sprite` while running to check the current connection:

```
/sprite                       # show current sprite
```

---

## SDK Mode

For programmatic use in your own agent scripts:

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

---

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

---

## Extension: quick reference

| Flag / Env | Description |
|------------|-------------|
| `--sprite <name>` | Target sprite name |
| `SPRITE_NAME` | Target sprite name (env fallback) |
| `SPRITE_WORKING_DIR` | Base directory on the sprite (default: `/home/sprite`) |
| `/sprite` | Show current sprite connection |

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

## SDK API

### `createSpriteCodingTools(options)`

Returns `[read, bash, edit, write]` for the default coding workflow.

### `createSpriteReadOnlyTools(options)`

Returns `[read, grep, find, ls]` for safe exploration without write access.

### `createSpriteTools(options)`

Returns all 7 tools as a named object: `{ read, bash, edit, write, grep, find, ls }`.

### `createSprite<Name>Tool(options)` (e.g. `createSpriteReadTool`, `createSpriteBashTool`, etc.)

Create a single tool with full control over its options.

### Low-level operations

You can also import the raw `Operations` implementations to compose your own tools:

```typescript
import {
  createSpriteReadOperations,
  createSpriteWriteOperations,
  createSpriteBashOperations,
  // ...etc
} from "pi-sprite";
```

All functions accept:
- `spriteName` — the sprite's name (`sprite list` to see yours)
- `workingDirectory` — base directory on the sprite (default: `/home/sprite`)

## License

MIT
