# pstack in Codex

pstack skills use Cursor names. In Codex, read this file once per session, then map each Cursor name in a skill with the tables below. `<pstack>` means the folder that holds `skills/` and `docs/`. If a Cursor field has no row, drop it and say so. Never pass a field or value the tool schema rejects.

## Tools

| Cursor | Codex |
| --- | --- |
| `Task` | `spawn_agent`. Find it under `collaboration`, or through `tool_search` when it is not listed. Each spawn returns at once. Call `wait_agent` until every final answer has arrived. |
| `AskQuestion` | `request_user_input` in Plan mode. Otherwise ask in plain text. |
| Open a todolist | Keep the list in your reply and update it at each phase. |
| Run another pstack skill (`/name` or "the **name** skill") | Read `<pstack>/skills/<name>/SKILL.md` and follow it. When you tell the user to type it, write `$pstack:<name>`. |
| `Read`, `Grep`, `Glob` | `exec_command` with `sed -n`, `rg`, or `ls`. |

## Subagent fields

| Cursor | Codex `spawn_agent` |
| --- | --- |
| A standalone brief | `fork_turns: "none"` and the whole brief in `message`. The default `all` copies this conversation into the worker. |
| `subagent_type: generalPurpose` | Omit `agent_type`. |
| `poteto-agent`, `comment-sicko` | Codex plugins cannot ship agents. Put the body of `<pstack>/agents/<name>.md` at the top of `message`. |
| `readonly: true` | Codex has no read-only flag. The brief says "do not edit files", and you check `git status` afterward. |
| `readonly: false` | Omit. Workers keep the session's MCP servers. |
| `environment: "cloud"` or `"local"` | Omit. Workers share this checkout, so give each writer its own output path. |
| `cloud_base_branch: <b>` | Tell the worker to read `<b>` with `git show` or `git worktree`, not to switch this checkout. |
| `run_in_background: true` | Omit. Spawns already run in the background. |
| `resume` | `followup_task` with the agent's task name. It starts a new turn when the agent is idle. If `list_agents` does not show the agent, spawn a new one with the earlier result in `message`. |
| `file_attachments` | List the paths in `message`. |
| More than 6 workers | Codex runs 6 at a time by default. Spawn in waves of 6. |

## Models

| Cursor | Codex |
| --- | --- |
| Any slug, such as `grok-4.7-xhigh-fast`, `claude-opus-5-5-xhigh`, or a `gpt-*` slug | Omit `model` so the worker runs on the session model, and say so. Pass `model` only with a slug that the `spawn_agent` description lists. |
| An effort in a slug (`low`, `medium`, `high`, `xhigh`, `max`) | `reasoning_effort` with the same word, if the description lists it for that model. |
| `auto` or `inherit-parent` | Omit `model`. |
| The `pstack-models.mdc` rule | Codex does not load it. Use the skill's default and map it with these rows. `setup-pstack` has nothing to write, so say so and stop. Never put its role lines in `AGENTS.md`. |

## Paths

| Cursor | Codex |
| --- | --- |
| `.cursor/skills/` | `.agents/skills/` in the repository, or `.codex/skills/` |
| `~/.cursor/skills/` | `~/.agents/skills/` |
| `~/.cursor/plugins/`, `.cursor-plugin/plugin.json` | `~/.codex/plugins/cache/`, root `plugin.json` |
| `.cursor/rules/*.mdc`, always-applied rules | `AGENTS.md`. Codex never reads `.mdc` files. |
| Transcripts in `~/.cursor/projects/<slug>/agent-transcripts/` | `~/.codex/sessions/<yyyy>/<mm>/<dd>/rollout-<time>-<id>.jsonl`. All workspaces share this tree, so the newest files often belong to other workspaces. Line 1 of each file is `session_meta`. First read line 1 of every rollout file and keep the files whose `payload.cwd` is this workspace or a folder in it and whose `payload.source` has no `subagent`. The newest file left is the current session. Never cut the list with `head`, `tail`, or a count before this filter. |

## Cursor-only features

Automations, Bugbot, Cursor cloud agents, and Cursor's pull request tool have no Codex equivalent. Say so, skip that step, and continue.
