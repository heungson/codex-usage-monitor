# Verification

## Version 3, issues rewritten (2026-10-30)

The planner rewrote LHS-2 to LHS-8 for v3, then corrected LHS-7 (revision 6) and LHS-8 (revision 7)
to the values in `docs/decisions.md`. Results are recorded in PRS with `record_verification`.

**Round 1, commit 92122b5** (LHS-2 r4, LHS-3 r3, LHS-4 r3, LHS-5 r4, LHS-6 r3, LHS-7 r4, LHS-8 r4,
LHS-10 r2): 61 O, 3 X.

- X LHS-7 검증 6: the issue said 30/60/120 s; the app retries after 10/20/40 s. The issue was wrong
  (revision 6 now says 10/20/40 s).
- X LHS-8 검증 1: the issue said the API's default page size and «리셋 시각만»; the app asks for 5 and
  shows time, type, first line, original post. The issue was wrong (revision 7 now says so).
- X LHS-6 검증 10: the usage cards never showed «자동 재시도 중». Watched for 42 s with the default
  30 s interval and reads held 8 s. Fixed in round 2.

**Round 2, working tree after 92122b5** (LHS-5 r4 and LHS-6 r3 for the checks this change touches,
LHS-7 r6 and LHS-8 r7 for every check).

| Run                     | Command                                                     | Result on 2026-10-30                                                                                                                                                                    |
| ----------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Types, lint, format     | `npm run typecheck`, `npm run lint`, `npm run format:check` | clean                                                                                                                                                                                   |
| Unit tests              | `npm test`                                                  | 70 passed (new: the automatic re-read shows 자동 재시도 중; LHS-2 검증 5 rollback after the settings file was written, `test/integration-rollback.test.ts`)                             |
| App checks              | `npm run test:e2e`                                          | 26 passed, 1 skipped (new: 자동 재시도 중 on a card; Codex first read without permission; the 예정 리셋 area by Tab, Enter and Space; history row content)                              |
| Default intervals, 30 s | `tmp/probe/intervals.pw.ts`, outside the repository         | Claude record changed → shown after 28.1 s; read failure shown after 29.6 s; recovered without a click after 30.1 s; with reads held 8 s, «자동 재시도 중» seen during the 30 s re-read |

Kept out of the repository: the 30-second script (it takes about 3½ minutes) and a probe that wrapped
`node:fs/promises` and `fetch` around one read of each reader (only the record folders were touched,
no fetch; LHS-3 검증 6, LHS-4 검증 6, round 1). `tmp/probe/` still holds them: the repository's guard
refuses `rm -rf` there, so the developer deletes it.

## Version 3, first pass (2026-10-30)

Results for PRS plan «사용량 한도 모니터» v3 on the working tree before 92122b5. Issues LHS-2 to
LHS-10 still carried v1 content in PRS then (revision 2).

| Run                 | Command                                                     | Result on 2026-10-30                                                                                                   |
| ------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Before the change   | `npm run lint` on the staged v1 code                        | 1 error (`e2e/screens.spec.ts` `prefer-const`); typecheck, format and 61 unit tests passed                             |
| Types, lint, format | `npm run typecheck`, `npm run lint`, `npm run format:check` | clean                                                                                                                  |
| Unit tests          | `npm test`                                                  | 68 passed                                                                                                              |
| App checks          | `npm run test:e2e`                                          | 23 passed, 1 skipped (the live check)                                                                                  |
| Live data           | `ULM_LIVE=1 npx playwright test e2e/live.spec.ts`           | passed: real Codex sessions read in about 0.9 s; live 예정 리셋 «예정 리셋 없음»; status, 5 history entries, then 15   |
| Captures            | `e2e/look.spec.ts` (part of `test:e2e`)                     | `tmp/screens/`: three screens × light/dark × 항상 위 off/on, plus failure states; read, and one round of fixes applied |

### Checks touched by v3

| Issue  | Check                              | Result | How                                                                                                                                                                                                                                                                                                                                                                |
| ------ | ---------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| LHS-5  | 7 (entries to the two screens)     | O      | App: the small «Claude Code 연동 안내» opens WF-S002; the 예정 리셋 area opens WF-S003 from its title, its text, and in the 결과 없음, failed and not-current states; no separate «Codex 전체 리셋» button is on the screen.                                                                                                                                       |
| LHS-5  | 1–6, 8–10                          | O      | Same app checks as v1, rerun on the v3 screen: values, loading, 수집 대기, not-current, both failed, 확인 불가, refresh and recovery.                                                                                                                                                                                                                              |
| LHS-7  | 1 (open, back, reopen, no polling) | O      | App: first open shows 불러오는 중 then the status; 5 s open with no request; reopening shows the known values with «새로 고치는 중» and then the server's new answer (결과 없음).                                                                                                                                                                                  |
| LHS-7  | 2–7                                | O      | App and unit: keyless `GET /api/v1/status` without Authorization or Cookie; loading; 결과 없음; not-current with the history kept; first failure, «자동 재시도 중», 1/2/4 s back-off stopping after 3 (10/20/40 s in unit tests), «다시 시도»; the codex-resets.com link (recorded, not opened).                                                                   |
| LHS-7  | v3: 예정 리셋 on the usage screen  | O      | App: scheduled reset shown without recent reset or average; 예정 리셋 없음; 결과 없음; failure with «다시 시도» and automatic retry; not-current after a success; the source link. Status fetched once at start and not again on reopening within 5 minutes (app); the 5-minute rule (unit).                                                                       |
| LHS-8  | 1 (list, no polling, reopen)       | O      | App: 5 entries after 불러오는 중 (`limit=5`); no request while open; reopening shows the 14 known entries, then the new answer.                                                                                                                                                                                                                                    |
| LHS-8  | 2 (cursor)                         | O      | App: «이력 더 보기» sent `cursor=5&limit=10` and showed all 14; no credentials. Live API: 5 then 10 continue correctly.                                                                                                                                                                                                                                            |
| LHS-8  | 3–6                                | O      | Same app checks as v1 with 5 entries: 결과 없음, not-current with status kept, retries stopping, first failure and «다시 시도», source link and back.                                                                                                                                                                                                              |
| LHS-10 | 3–6                                | O      | App: baseline, once per reset, held while refused; the in-app notice now has only «닫기» and the 예정 리셋 area below opens the reset screen.                                                                                                                                                                                                                      |
| LHS-10 | 1, 2                               | -      | As in v1: real macOS banners are refused for the unsigned dev build on this Mac.                                                                                                                                                                                                                                                                                   |
| LHS-2  | 1, 2, 5, 6, 9                      | O      | Same app checks as v1 on the restyled screen.                                                                                                                                                                                                                                                                                                                      |
| (none) | FC-F019 «창 항상 위에 표시»        | O / -  | App (window mode): off at first; on makes the window always on top; the same switch is on all three screens; kept after restart; off from another screen is off everywhere. Unit: file kept, unreadable file is off. **Not checked**: the popover from the menu bar (stays open on blur, drag, reopening where dragged) — needs a real click on the menu bar item. |

### Not verified in v3

- The menu bar popover itself (`npm start` and a click on the menu bar item): closing on blur with the
  switch off, staying open and being draggable with it on, reopening where it was dragged. The
  screens were driven as an ordinary window (`ULM_SHOW_WINDOW=1`).
- The scheduled reset as codex-resets.com really sends it: the live API had none on 2026-10-30; the
  fake server's shape is the same as other reset entries.
- Dark mode was captured with Playwright's colour-scheme emulation, not by switching macOS itself.

## Version 1 (2026-10-28)

2026-10-28 · Results for PRS plan «사용량 한도 모니터» v1, issues LHS-1 to LHS-10 (issue content
revision 1 for LHS-1, revision 2 for the others). The same results were recorded in PRS with
`record_verification`. Nothing is committed yet.

### What was run

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

### Not verified

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

### Defects found and fixed while checking

- A Codex session file made unreadable still showed as current (cache keyed by size and mtime).
- Long file paths in error notices overflowed the popover; raw `EACCES` messages were shown.
- The limit-alert notice could not be closed.
- macOS's «notifications not allowed» (`UNErrorDomain error 1`) was reported as a generic failure.
- A second instance pointed at another data folder was shut out by the first one's lock, and an
  instance that lost the lock kept setting up windows while quitting.
