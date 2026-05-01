import path from "node:path";
import { parseFrontmatter } from "@mariozechner/pi-coding-agent";
import { escapeShellArg, execOnSprite, type SpriteExecOptions } from "./sprite-exec.js";

export interface SpriteSkill {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  disableModelInvocation: boolean;
}

export interface DiscoverSpriteSkillsOptions extends SpriteExecOptions {
  /** Additional absolute skill roots to scan on the sprite. */
  skillRoots?: string[];
  /** Include default sprite skill roots (default: true). */
  includeDefaultRoots?: boolean;
}

export interface DiscoverSpriteSkillsResult {
  skills: SpriteSkill[];
  diagnostics: Array<{ type: "warning" | "error"; message: string; path?: string }>;
  /** System-prompt section describing sprite-local skills, or an empty string when none are visible. */
  spriteSkillsSystemPrompt: string;
}

interface SkillFrontmatter {
  name?: string;
  description?: string;
  "disable-model-invocation"?: boolean;
  [key: string]: unknown;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function defaultSkillRoots(workingDirectory: string): string[] {
  const cwd = workingDirectory.replace(/\\/g, "/");
  return unique([
    "/home/sprite/.claude/skills",
    path.posix.join(cwd, ".claude", "skills"),
  ]);
}

function formatSpriteSkillsForPrompt(skills: SpriteSkill[]): string {
  const visibleSkills = skills.filter((skill) => !skill.disableModelInvocation);
  if (visibleSkills.length === 0) return "";

  const lines = [
    "\n\nThe following skills are installed on the Sprite and provide specialized instructions for specific tasks.",
    "Use the read tool to load a skill's file when the task matches its description. These skill locations are Sprite filesystem paths.",
    "When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.",
    "",
    "<available_skills>",
  ];

  for (const skill of visibleSkills) {
    lines.push("  <skill>");
    lines.push(`    <name>${escapeXml(skill.name)}</name>`);
    lines.push(`    <description>${escapeXml(skill.description)}</description>`);
    lines.push(`    <location>${escapeXml(skill.filePath)}</location>`);
    lines.push("  </skill>");
  }

  lines.push("</available_skills>");
  return lines.join("\n");
}

function parseSpriteSkill(filePath: string, content: string): { skill?: SpriteSkill; diagnostic?: { type: "warning"; message: string; path: string } } {
  try {
    const { frontmatter } = parseFrontmatter<SkillFrontmatter>(content);
    const baseDir = path.posix.dirname(filePath);
    const parentDirName = path.posix.basename(baseDir);
    const name = typeof frontmatter.name === "string" && frontmatter.name.trim() ? frontmatter.name.trim() : parentDirName;
    const description = typeof frontmatter.description === "string" ? frontmatter.description.trim() : "";

    if (!description) {
      return { diagnostic: { type: "warning", message: "Skill missing description", path: filePath } };
    }

    return {
      skill: {
        name,
        description,
        filePath,
        baseDir,
        disableModelInvocation: frontmatter["disable-model-invocation"] === true,
      },
    };
  } catch (error) {
    return {
      diagnostic: {
        type: "warning",
        message: error instanceof Error ? error.message : "failed to parse skill file",
        path: filePath,
      },
    };
  }
}

/**
 * Discover skills installed on a sprite and return both structured metadata and
 * a system-prompt section whose locations are valid on the Sprite filesystem.
 */
export async function discoverSpriteSkills(options: DiscoverSpriteSkillsOptions): Promise<DiscoverSpriteSkillsResult> {
  const { spriteName, workingDirectory = "/home/sprite", timeout = 10, signal, includeDefaultRoots = true } = options;
  const roots = unique([...(includeDefaultRoots ? defaultSkillRoots(workingDirectory) : []), ...(options.skillRoots ?? [])]);

  if (roots.length === 0) {
    return { skills: [], diagnostics: [], spriteSkillsSystemPrompt: "" };
  }

  const findExpression = roots
    .map((root) => `[ -d ${escapeShellArg(root)} ] && find ${escapeShellArg(root)} -name SKILL.md -type f -print`)
    .join("; ");
  const findResult = await execOnSprite(findExpression, { spriteName, workingDirectory, timeout, signal });
  const skillFiles = unique(findResult.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)).sort();
  const diagnostics: DiscoverSpriteSkillsResult["diagnostics"] = [];

  if (findResult.exitCode !== 0 && findResult.stderr.trim()) {
    diagnostics.push({ type: "warning", message: findResult.stderr.trim() });
  }

  const skills: SpriteSkill[] = [];
  for (const filePath of skillFiles) {
    const readResult = await execOnSprite(`base64 ${escapeShellArg(filePath)}`, { spriteName, workingDirectory, timeout, signal });
    if (readResult.exitCode !== 0) {
      diagnostics.push({ type: "warning", message: readResult.stderr.trim() || "failed to read skill file", path: filePath });
      continue;
    }

    const content = Buffer.from(readResult.stdout.trim(), "base64").toString("utf8");
    const parsed = parseSpriteSkill(filePath, content);
    if (parsed.skill) skills.push(parsed.skill);
    if (parsed.diagnostic) diagnostics.push(parsed.diagnostic);
  }

  return {
    skills,
    diagnostics,
    spriteSkillsSystemPrompt: formatSpriteSkillsForPrompt(skills),
  };
}
