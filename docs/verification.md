# Verification

2026-10-28 · Results for PRS plan «사용량 한도 모니터» v1, issues LHS-1 to LHS-10 (issue content
revision 1 for LHS-1, revision 2 for the others). The same results were recorded in PRS with
`record_verification`. Nothing is committed yet.

## What was run

| Run                     | Command                                                                                         | Result on 2026-10-28                                                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Types, lint, format     | `npm run typecheck`, `npm run lint`, `npm run format:check`                                     | clean                                                                                                                                                      |
| Unit tests              | `npm test`                                                                                      | 61 passed                                                                                                                                                  |
| App checks              | `npm run test:e2e`                                                                              | 18 passed, 1 skipped (the live check)                                                                                                                      |
| Live data               | `ULM_LIVE=1 npx playwright test e2e/live.spec.ts`                                               | passed: this Mac's `~/.codex/sessions` (1.6 GB) read in about 1 s; live codex-resets.com status and history shown                                          |
| Clean copy              | a copy of the working tree without `node_modules`, `dist`, `tmp`, then only the README commands | install, build, typecheck, lint, format:check, test (58 then), test:e2e (17 then) all passed                                                               |
| Guard in a real session | `claude -p` in this folder asked to write `.env` with the Write tool                            | blocked: «guard: writing .env», no file created                                                                                                            |
| Real notification       | the app with the real notifier and a record at 86%                                              | macOS refused: `UNErrorDomain error 1` (notifications are off for this unsigned dev build); the app showed the «알림이 꺼져 있어» notice and did not retry |
| Menu bar                | `npm start` with temporary settings, then a capture of the menu bar                             | the item shows the gauge icon and «CC – · CX 44%»                                                                                                          |

App checks drive the built app (`dist/`) in Electron with Playwright, the popover shown as a window
(`ULM_SHOW_WINDOW=1`), temporary folders for every file, and `e2e/fake-resets-server.ts` in place of
codex-resets.com. A capture of every viewport of every state is in `tmp/e2e-shots/` and was read.

## Not verified

- Opening the popover by clicking the menu bar item, and its position under the item. A script click
  needs macOS Accessibility permission for the terminal, which was not granted. The popover content
  was verified as a window.
- That a macOS notification banner actually appears (LHS-9 검증 1–3, LHS-10 검증 1–2). Notifications
  are turned off for the unsigned Electron dev app on this Mac. When to send was verified with a test
  notifier that records what would be sent.
- Cloning from a registered remote (LHS-1 검증 1, 5): no remote exists, by the owner's decision, and
  nothing is committed.
- Network traffic was not captured. The claim that nothing is sent rests on the code: the hook bundle
  contains no network call, and the main bundle's only address is `https://codex-resets.com`.
- Intervals were shortened for the app checks (`ULM_READ_INTERVAL_MS=2000`, retry delays of 1–4 s).
  The default 30-second re-read and the 10/20/40-second backoff were checked with fake timers in the
  unit tests, not by waiting in the app. The popover's own 60-second refresh timer was not observed;
  values changed while open through the background re-read.
- Links open through `shell.openExternal`, which the app checks replace with a recorder; a real
  browser opening was not observed.

## Defects found and fixed while checking

- A Codex session file made unreadable still showed as current (cache keyed by size and mtime).
- Long file paths in error notices overflowed the popover; raw `EACCES` messages were shown.
- The limit-alert notice could not be closed.
- macOS's «notifications not allowed» (`UNErrorDomain error 1`) was reported as a generic failure.
- A second instance pointed at another data folder was shut out by the first one's lock, and an
  instance that lost the lock kept setting up windows while quitting.
