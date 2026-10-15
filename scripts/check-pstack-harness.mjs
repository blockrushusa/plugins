#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "pstack");
const SKILLS = join(ROOT, "skills");
const ADAPTERS = {
  "Claude Code": readFileSync(join(ROOT, "docs/harness/claude-code.md"), "utf8"),
  Codex: readFileSync(join(ROOT, "docs/harness/codex.md"), "utf8"),
};
const POINTER =
  "Outside Cursor, first read the adapter for your harness, [Claude Code](../../docs/harness/claude-code.md) or [Codex](../../docs/harness/codex.md).";
// Codex ignores disable-model-invocation, so each hidden skill needs a sidecar.
const SIDECAR = "policy:\n  allow_implicit_invocation: false\n";

const TERMS = [
  { key: "`Task`", re: /`Task`|\bTask (tool|subagent|call)/ },
  { key: "`AskQuestion`", re: /AskQuestion/ },
  { key: "todolist", re: /\btodo ?list\b/i },
  { key: "generalPurpose", re: /generalPurpose/ },
  { key: "poteto-agent", re: /poteto-agent/ },
  { key: "comment-sicko", re: /comment-sicko/ },
  { key: "`readonly: true`", re: /readonly: (true|false)|readonly\/Ask/ },
  { key: "`environment: \"cloud\"`", re: /environment: "(cloud|local)"/ },
  { key: "`cloud_base_branch", re: /cloud_base_branch/ },
  { key: "`run_in_background: true`", re: /run_in_background/ },
  { key: "`resume`", re: /`resume`/ },
  { key: "`file_attachments`", re: /file_attachments/ },
  { key: "claude-", re: /\bclaude-[a-z]+-\d/ },
  { key: "grok-", re: /\bgrok-\d/ },
  { key: "gpt-", re: /\bgpt-\d/ },
  { key: "inherit-parent", re: /inherit-parent/ },
  { key: "pstack-models.mdc", re: /pstack-models\.mdc/ },
  { key: ".cursor/skills/", re: /\.cursor\/skills/ },
  { key: "~/.cursor/plugins/", re: /\.cursor\/plugins|\.cursor-plugin/ },
  { key: ".cursor/rules/", re: /\.cursor\/rules|always-applied rule/ },
  { key: "agent-transcripts", re: /agent-transcripts|\.cursor\/projects/ },
  { key: "Cursor-only features", re: /Bugbot|Cursor [Aa]utomation|cursor\.(sh|com)\/automations|[Cc]loud [Aa]gent/ },
];
const ROUTE_KEY = "Run another pstack skill";

const fix = process.argv.includes("--fix");
const problems = [];

function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesUnder(path);
    return path.endsWith(".md") ? [path] : [];
  });
}

const skills = readdirSync(SKILLS).filter((name) => existsSync(join(SKILLS, name, "SKILL.md")));

function classify(skill) {
  const dir = join(SKILLS, skill);
  const others = skills.filter((name) => name !== skill).join("|");
  const route = new RegExp(`the \\*\\*(?<bold>${others})\\*\\* skill|\`/(?<command>${others})\``, "g");
  const linksToSkill = (line, name) => line.includes(`(../${name}/`);
  const namesBareSkill = (line) =>
    [...line.matchAll(route)].some(({ groups }) => !linksToSkill(line, groups.bold ?? groups.command));
  const usesCursorNames = new Set();
  for (const file of filesUnder(dir)) {
    const text = readFileSync(file, "utf8");
    for (const term of TERMS) if (term.re.test(text)) usesCursorNames.add(term.key);
    if (text.split("\n").some(namesBareSkill)) usesCursorNames.add(ROUTE_KEY);
  }
  const hidden = /^disable-model-invocation: true$/m.test(readFileSync(join(dir, "SKILL.md"), "utf8"));
  return { usesCursorNames, hidden };
}

const classes = new Map(skills.map((skill) => [skill, classify(skill)]));
let needPointer = 0;
let needSidecar = 0;

for (const [skill, { usesCursorNames, hidden }] of classes) {
  const required = { pointer: usesCursorNames.size > 0, sidecar: hidden };
  const skillPath = join(SKILLS, skill, "SKILL.md");
  const skillText = readFileSync(skillPath, "utf8");
  const sidecarPath = join(SKILLS, skill, "agents/openai.yaml");
  const sidecarHides =
    existsSync(sidecarPath) && /allow_implicit_invocation:\s*false/.test(readFileSync(sidecarPath, "utf8"));
  if (required.pointer) needPointer += 1;
  if (required.sidecar) needSidecar += 1;

  if (required.pointer && !skillText.includes(POINTER)) {
    const uses = [...usesCursorNames].join(", ");
    if (!fix) {
      problems.push(`skills/${skill}/SKILL.md uses ${uses} but lacks the adapter pointer (run with --fix)`);
    } else if (!/^# /m.test(skillText)) {
      problems.push(`skills/${skill}/SKILL.md uses ${uses} but has no H1 to put the adapter pointer after`);
    } else {
      writeFileSync(skillPath, skillText.replace(/^(# .*)\n+/m, `$1\n\n${POINTER}\n\n`));
    }
  }
  if (required.sidecar && !sidecarHides) {
    if (fix) {
      mkdirSync(dirname(sidecarPath), { recursive: true });
      writeFileSync(sidecarPath, SIDECAR);
    } else {
      problems.push(`skills/${skill} sets disable-model-invocation but has no Codex sidecar (run with --fix)`);
    }
  }
  if (!required.sidecar && sidecarHides) {
    if (fix) rmSync(sidecarPath);
    else problems.push(`skills/${skill} is model-invocable but its Codex sidecar hides it (run with --fix)`);
  }
}

const users = new Map();
for (const [skill, { usesCursorNames }] of classes) {
  for (const key of usesCursorNames) users.set(key, [...(users.get(key) ?? []), skill]);
}
for (const [key, skillsUsing] of users) {
  for (const [harness, text] of Object.entries(ADAPTERS)) {
    if (!text.includes(key)) {
      problems.push(`${harness} adapter has no row for ${key}, used by ${skillsUsing.join(", ")}`);
    }
  }
}

console.log(`checked ${skills.length} skills; ${needPointer} skills use Cursor names, ${needSidecar} need a Codex sidecar`);
for (const problem of problems) console.log(`FAIL ${problem}`);
process.exit(problems.length > 0 ? 1 : 0);
