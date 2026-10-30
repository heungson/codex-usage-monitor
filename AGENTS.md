# Rules for agents working in this repository

This is the only rules file. `CLAUDE.md` and any other agent's entry file only point here; never
copy rules into them, because two copies drift apart.

The product is planned in PRS, plan «사용량 한도 모니터» (published version 1). Issues reach a coding
agent through the PRS developer MCP (`.mcp.json`, server `prs-developer`). Cite item ids from the
plan (FC-F…, WF-S…, PR-P…) in code comments where a rule comes from the plan, and in commit messages.

## Rules

- Never write that something was checked unless you ran it. When you did, keep the command and its
  result: in the commit message, in `docs/`, or in the PRS verification note.
- Ask the developer before every commit, push and data migration, each time. Show the staged
  summary and the commit message first.
- Put the feature item ids (FC-F…) a commit implements in its message.
- Do not decide what the plan leaves undecided («정해지지 않음», «아직 부족한 정보»). Ask the
  developer, who takes it to the planner as an issue comment. Record the answer and who gave it in
  `docs/decisions.md`.
- Temporary files go in `tmp/` and are never committed.
- Paths in documents are relative to the repository root.
- Write down why a change was made, in the commit message or in `docs/`.
- When code changes, update the documents listed below in the same commit.
- After implementing an issue, check each of its 검증 items yourself the way this file says, and
  record each result in PRS with the developer MCP's `record_verification`: O for passed, X for
  failed, - for not checked, with a note saying what was run or why it could not be. Never record O
  for something you did not check.

## Where documents live

| Document                | What it holds                                                                          | Update it when                                    |
| ----------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `README.md`             | What the app is, how to install, run, build, lint and test                             | a command, a requirement or the framework changes |
| `docs/decisions.md`     | Decisions with their date and owner: the framework, answers to what the plan left open | a decision is made or reversed                    |
| `docs/claude-record.md` | The file the status line hook writes and the reader reads                              | that format or its location changes               |
| `docs/verification.md`  | How each issue's 검증 items are checked, and the latest results                        | checks are added or results change                |
| `AGENTS.md`             | These rules                                                                            | a rule changes                                    |

Code comments say why, and cite the plan item they implement.

## How results are checked

Run all of these before saying an issue is done; each must pass.

```sh
npm run typecheck
npm run lint
npm run format:check
npm test            # unit tests (builds first)
npm run test:e2e    # drives the built Electron app with Playwright
```

- `npm test` covers the rules: readers, collector states, the status line hook, the settings
  rollback, the reset API client and backoff, both alert rules, the guard hook.
- `npm run test:e2e` launches the real app (`ULM_SHOW_WINDOW=1` shows the popover as a window)
  against temporary folders and a local fake of codex-resets.com, clicks through every screen and
  state, and saves a capture of every viewport in `tmp/e2e-shots/`. Open and read the captures; a
  passing assertion is not a look at the screen.
- `ULM_LIVE=1 npx playwright test e2e/live.spec.ts` reads this machine's `~/.codex/sessions` and the
  live codex-resets.com, without touching `~/.claude/settings.json`.
- Opening the popover from the menu bar needs a real click on the menu bar item. Check that by hand
  (`npm start`) when the tray or window placement changes, and say in the PRS note if you did not.

Environment variables that point the app at test folders are listed in `README.md`.

Never point a check at the real `~/.claude/settings.json`: set `ULM_CLAUDE_SETTINGS` to a temporary
file. Applying the integration to the developer's own settings is their decision, made in the app.
