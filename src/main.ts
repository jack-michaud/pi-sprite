#!/usr/bin/env node

import { Agent } from "@mariozechner/pi-agent-core";
import type { AgentEvent } from "@mariozechner/pi-agent-core";
import { getModel, streamSimple } from "@mariozechner/pi-ai";
import { createSpriteCodingTools } from "./index.js";
import * as readline from "readline";

// ─────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────

const SPRITE_NAME = process.env.SPRITE_NAME || "pi-sprite-test";
const SPRITE_DIR = process.env.SPRITE_WORKING_DIR || "/home/sprite";
const MODEL_PROVIDER = process.env.MODEL_PROVIDER || "openrouter";
const MODEL_ID = process.env.MODEL_ID || "moonshotai/kimi-k2.6";

// ─────────────────────────────────────────────────────────────
// Sprite Agent
// ─────────────────────────────────────────────────────────────

const model = getModel(MODEL_PROVIDER as any, MODEL_ID as any);
const tools = createSpriteCodingTools({
  spriteName: SPRITE_NAME,
  workingDirectory: SPRITE_DIR,
});

const agent = new Agent({
  initialState: {
    systemPrompt:
      "You are a helpful coding assistant with access to a Fly.io Sprite. " +
      "You can read files, write files, edit files, and run shell commands on the sprite. " +
      "The sprite is an isolated cloud VM accessed via the `sprite exec` CLI. " +
      "Be concise. When listing files, use the ls tool. When examining files, use read. " +
      "For searches, prefer grep or find.",
    model,
    tools,
    thinkingLevel: "off",
  },
  streamFn: streamSimple,
});

// ─────────────────────────────────────────────────────────────
// Event handler
// ─────────────────────────────────────────────────────────────

function handleEvent(event: AgentEvent) {
  switch (event.type) {
    case "agent_start":
      process.stdout.write("\n🤖 Thinking...\n");
      break;

    case "message_update":
      if (event.assistantMessageEvent.type === "text_delta") {
        process.stdout.write(event.assistantMessageEvent.delta);
      }
      break;

    case "tool_execution_start":
      process.stdout.write("\n");
      process.stdout.write(
        `  ⚡ [${event.toolName}] ` +
          summarizeArgs(event.args) +
          "\n"
      );
      break;

    case "tool_execution_end": {
      if (event.isError) {
        // Error content is usually already in the stream via tool_execution_update
        break;
      }
      break;
    }

    case "agent_end":
      process.stdout.write("\n\n");
      break;
  }
}

function summarizeArgs(args: any): string {
  if (!args) return "";
  if (args.path) return args.path;
  if (args.command) {
    const cmd = args.command;
    return cmd.length > 70 ? cmd.slice(0, 67) + "..." : cmd;
  }
  if (args.query) return `"${args.query}"`;
  if (args.pattern) return args.pattern;
  const json = JSON.stringify(args);
  return json.length > 70 ? json.slice(0, 67) + "..." : json;
}

agent.subscribe(handleEvent);

// ─────────────────────────────────────────────────────────────
// REPL
// ─────────────────────────────────────────────────────────────

function printBanner() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  🧚 pi-sprite — coding agent on Sprites                     ║
╠══════════════════════════════════════════════════════════════╣
║  Sprite:     ${SPRITE_NAME.padEnd(44)} ║
║  Working:    ${SPRITE_DIR.padEnd(44)} ║
║  Model:      ${(MODEL_PROVIDER + "/" + MODEL_ID).padEnd(44)} ║
╚══════════════════════════════════════════════════════════════╝

Commands:
  /exit       — quit the agent

Type a message and press Enter to send.
Multi-line: end a line with \\ and press Enter to continue.
`);
}

function createPrompt(question: string): string {
  // Shorten prompt to keep terminal clean
  return `You@${SPRITE_NAME}: ${question}`;
}

async function runRepl() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let multilineBuffer = "";
  let isMultiline = false;

  const promptText = () => (isMultiline ? "... " : "You: ");

  // Override the standard prompt
  const _prompt = () => {
    process.stdout.write(promptText());
  };

  _prompt();

  for await (const line of rl) {
    const trimmed = line.trimEnd(); // keep leading spaces but not trailing

    // Multi-line continuation marker
    if (trimmed.endsWith("\\")) {
      multilineBuffer += trimmed.slice(0, -1) + "\n";
      isMultiline = true;
      _prompt();
      continue;
    }

    const input = multilineBuffer + trimmed;
    multilineBuffer = "";
    isMultiline = false;

    if (!input) {
      _prompt();
      continue;
    }

    // ── Slash commands ──
    if (input.startsWith("/")) {
      const [cmd] = input.split(/\s+/, 1);
      switch (cmd) {
        case "/exit":
        case "/quit":
          console.log("\n👋 Goodbye!");
          rl.close();
          process.exit(0);
          break;
        default:
          console.log(`\nUnknown command: ${cmd}. Type /exit to quit.\n`);
          break;
      }
      _prompt();
      continue;
    }

    // ── Send to agent ──
    try {
      console.log("\n🤖 Agent:");
      await agent.prompt(input);
    } catch (err: any) {
      console.error(`\n❌ Error: ${err.message || err}\n`);
    }

    _prompt();
  }
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main() {
  printBanner();
  await runRepl();
}

main().catch((err) => {
  console.error("Failed to start:", err.message);
  console.error(
    "\n💡 Make sure:\n" +
      `  • The sprite "${SPRITE_NAME}" exists: sprite list\n` +
      `  • You are logged in: sprite login\n` +
      `  • API keys are set: export ANTHROPIC_API_KEY=sk-ant-...\n`
  );
  process.exit(1);
});
