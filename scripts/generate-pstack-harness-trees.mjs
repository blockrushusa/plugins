#!/usr/bin/env node

import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const PSTACK = join(dirname(fileURLToPath(import.meta.url)), "..", "pstack");
const SKILLS = join(PSTACK, "skills");
const OUT = join(PSTACK, "harness");
const COMMAND = "node scripts/generate-pstack-harness-trees.mjs";
// Codex ignores disable-model-invocation, so each hidden skill needs a sidecar.
const SIDECAR = "policy:\n  allow_implicit_invocation: false\n";
const README = `# pstack harness trees

This folder is generated from \`pstack/skills\`, \`pstack/agents\`, \`pstack/docs/harness\`, and \`pstack/plugin.json\`. Do not edit it by hand.

Cursor uses \`pstack/\` directly. Claude Code installs \`claude-code/\`, and Codex installs \`codex/\`.

After editing those sources, run \`${COMMAND}\` from the repository root and commit the result.
`;

const HARNESSES = [
  { dir: "claude-code", label: "Claude Code", manifests: ["plugin.json", ".claude-plugin/plugin.json"], sidecars: false },
  { dir: "codex", label: "Codex", manifests: ["plugin.json"], sidecars: true },
];

const TERMS = [
  { key: "`Task`", re: /`Task`|\bTask (tool|subagent|call)/ },
  { key: "`AskQuestion`", re: /AskQuestion/ },
  { key: "todolist", re: /\btodo ?list\b/i },
  { key: "generalPurpose", re: /generalPurpose/ },
  { key: "poteto-agent", re: /poteto-agent/ },
  { key: "comment-sicko", re: /comment-sicko/ },
  { key: "`readonly: true`", re: /readonly: (true|false)|readonly\/Ask/ },
  { key: "`environment: \"cloud\"`", re: /environment: "(cloud|local)"/ },
  { key: "cloud_base_branch", re: /cloud_base_branch/ },
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

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (name === ".DS_Store" || name === "node_modules") return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function file(path) {
  return { bytes: readFileSync(path), executable: (statSync(path).mode & 0o111) !== 0 };
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
  for (const path of walk(dir).filter((path) => path.endsWith(".md"))) {
    const text = readFileSync(path, "utf8");
    for (const term of TERMS) if (term.re.test(text)) usesCursorNames.add(term.key);
    if (text.split("\n").some(namesBareSkill)) usesCursorNames.add(ROUTE_KEY);
  }
  const text = readFileSync(join(dir, "SKILL.md"), "utf8");
  const wrap = usesCursorNames.size > 0 && /^# /m.test(text);
  return { usesCursorNames, wrap, hidden: /^disable-model-invocation: true$/m.test(text) };
}

const classes = new Map(skills.map((skill) => [skill, classify(skill)]));
const problems = [];
const users = new Map();
for (const [skill, { usesCursorNames, wrap }] of classes) {
  if (usesCursorNames.size > 0 && !wrap) problems.push(`skills/${skill}/SKILL.md uses Cursor names but has no H1`);
  for (const key of usesCursorNames) users.set(key, [...(users.get(key) ?? []), skill]);
}
for (const { dir, label } of HARNESSES) {
  const adapter = readFileSync(join(PSTACK, "docs/harness", `${dir}.md`), "utf8");
  for (const [key, using] of users) {
    if (!adapter.includes(key)) problems.push(`${label} adapter has no row for ${key}, used by ${using.join(", ")}`);
  }
}
for (const problem of problems) console.log(`FAIL ${problem}`);
if (problems.length > 0) process.exit(1);

function render({ dir, label, manifests, sidecars }) {
  const copies = [...walk(SKILLS), ...walk(join(PSTACK, "agents"))];
  const files = new Map(copies.map((path) => [relative(PSTACK, path), file(path)]));
  const line =
    `In ${label}, read [the ${label} adapter](../../docs/harness/${dir}.md) once per session before you follow this skill. ` +
    `It maps the Cursor names in pstack skills to ${label}.`;
  for (const [skill, { wrap, hidden }] of classes) {
    const path = `skills/${skill}/SKILL.md`;
    const text = files.get(path).bytes.toString("utf8");
    if (wrap) files.get(path).bytes = Buffer.from(text.replace(/^(# .*)\n+/m, `$1\n\n${line}\n\n`));
    if (sidecars && hidden) files.set(`skills/${skill}/agents/openai.yaml`, { bytes: Buffer.from(SIDECAR), executable: false });
  }
  files.set(`docs/harness/${dir}.md`, file(join(PSTACK, "docs/harness", `${dir}.md`)));
  files.set("LICENSE", file(join(PSTACK, "LICENSE")));
  for (const manifest of manifests) files.set(manifest, file(join(PSTACK, "plugin.json")));
  return files;
}

const rendered = new Map([["README.md", { bytes: Buffer.from(README), executable: false }]]);
for (const harness of HARNESSES) {
  for (const [path, entry] of render(harness)) rendered.set(`${harness.dir}/${path}`, entry);
}

if (process.argv.includes("--check")) {
  const onDisk = new Map(existsSync(OUT) ? walk(OUT).map((path) => [relative(OUT, path), file(path)]) : []);
  const drifted = [...new Set([...rendered.keys(), ...onDisk.keys()])].sort().filter((path) => {
    const [want, have] = [rendered.get(path), onDisk.get(path)];
    return !want || !have || !want.bytes.equals(have.bytes) || want.executable !== have.executable;
  });
  for (const path of drifted.slice(0, 20)) console.log(`pstack/harness/${path}`);
  if (drifted.length > 0) {
    console.log(`pstack/harness is out of date. Run \`${COMMAND}\` and commit the result.`);
    process.exit(1);
  }
  console.log("pstack/harness is up to date.");
} else {
  rmSync(OUT, { recursive: true, force: true });
  for (const [path, { bytes, executable }] of rendered) {
    mkdirSync(dirname(join(OUT, path)), { recursive: true });
    writeFileSync(join(OUT, path), bytes);
    chmodSync(join(OUT, path), executable ? 0o755 : 0o644);
  }
  const count = (key) => [...classes.values()].filter((entry) => entry[key]).length;
  console.log(`${skills.length} skills, ${count("wrap")} SKILL.md files with the adapter line, ${count("hidden")} Codex sidecars`);
}
