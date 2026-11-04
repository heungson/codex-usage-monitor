# Verification

## Fewer Anthropic usage requests (2026-11-05)

No PRS issue; asked for by the developer after the installed app showed «계정 조회 실패» with
«Anthropic이 요청이 너무 잦다고 했어요 (429)». The PRS MCP servers did not connect, so no
`record_verification` entry was written. The live endpoint was not called from this session.

- `npm run typecheck`, `npm run lint`: passed. `npm run format:check`: only the ignored
  `.claude/settings.local.json` flagged, as before.
- `npm test`: 116 passed. New in `test/claude-api.test.ts`: 2, 4, 8, 16, 30, 30 minutes between
  429s and a fresh start after a success; Retry-After honoured but never under the interval;
  no request while the record is under a minute old, shown without the old failure; Retry-After
  in seconds and as a date.
- `npm run test:e2e`: 40 passed, 2 skipped, 1 failed: `e2e/dev-display.spec.ts` (macOS's front
  app changed while the developer was using the Mac); it passed when run again on its own.
- Not checked: that Anthropic stops answering 429 with the installed app over a day.

## Claude Code limits from the Anthropic account (2026-11-04)

No PRS issue; the developer's decision (`docs/decisions.md`). The PRS MCP servers did not connect,
so no `record_verification` entry was written.

- Live endpoint: run once by the developer with a probe script outside the repository (the agent's
  own attempt to read the Keychain was refused by its permission check): HTTP 200 with
  `five_hour.utilization` 10, `seven_day.utilization` 36 and ISO `resets_at` for each.
- `npm run typecheck`, `npm run lint`: passed. `npm run format:check`: only the ignored
  `.claude/settings.local.json` flagged.
- `npm test`: 112 passed. New `test/claude-api.test.ts`: request URL and headers, mapping of both
  windows, an expired login sends nothing, 401/429/500/offline/no-limits answers are explained, one
  request per interval including failures, a newer record wins, a broken record does not hide the
  account answer, no login with no record is 수집 대기 and with a record is plain record mode, the
  login file shape.
- `npm run test:e2e`: 41 passed, 2 skipped. New in `e2e/usage.spec.ts`: against a local fake of the
  endpoint the card and menu bar show the account's 10/36% over a 20-hour-old 35/100% record, with
  the token sent as `Bearer`; after the fake answers 401 the card shows the record with «계정 조회
  실패» and the reason. Every check sets `ULM_CLAUDE_CREDENTIALS` to a test file and
  `ULM_CLAUDE_API_BASE_URL` to a local address, so none reads the real Keychain or asks Anthropic.
  The first full run failed the look checks' one-screen rule because the new footer line wrapped;
  it was shortened and `e2e/look.spec.ts` passed. `tmp/e2e-shots/usage-claude-account-1.png`,
  `usage-claude-account-refused-1.png` and `tmp/screens/light-usage-pin-off-1.png` were opened.
- `npm run test:package`: passed.
- Not checked: the installed app against the real Keychain and Anthropic (left to the developer
  after installing), how long Claude Code's login lasts before it expires.

## 설정 › «로그인 시 자동 실행» (2026-11-04)

No PRS issue; asked for by the developer. The PRS MCP servers did not connect, so no
`record_verification` entry was written.

- `npm run typecheck`, `npm run lint`: passed. `npm run format:check`: only the ignored
  `.claude/settings.local.json` flagged, as before.
- `npm test`: 100 passed. New `test/login-item.test.ts` (6): not offered from source; off at
  first, on and off; re-read from macOS each time; approval wait is not an error; a change macOS
  ignores or throws on is reported, and cleared by the next success.
- `npm run test:e2e`: 39 passed, 2 skipped, 1 failed. New `e2e/settings.spec.ts` (3) passed: the
  gear opens 설정, the switch turns on and off and is read back after a restart; the approval
  notice opens `x-apple.systempreferences:com.apple.LoginItems-Settings.extension`; with no
  backend the switch is disabled. The failure is `e2e/look.spec.ts` «three screens»: the usage
  screen is a few pixels over 600 px at some times of day, so `fitsWithoutScrolling` fails. It fails
  without this change too (unchanged code, light: 2 of 3 runs failed; with it: 1 of 3).
- Captures opened: `tmp/screens/dark-settings-pin-off-1.png`, `tmp/e2e-shots/settings-on-1.png`,
  `settings-approval-1.png`, `settings-unsupported-1.png`, `tmp/screens/*-usage-pin-off-1.png`
  (gear left of «항상 위», readable in both themes).
- Not checked: the real macOS login item from an installed app (`npm run package`, turn it on,
  sign out and in), a physical menu bar click.

## «새로 고침» button (2026-11-03)

No PRS issue; asked for by the developer. The PRS MCP servers did not connect, so no
`record_verification` entry was written.

- `npm run typecheck`, `npm run lint`: passed. `npm run format:check`: only the ignored
  `.claude/settings.local.json` flagged, as before.
- `npm test`: 94 passed (no unit change; the renderer has no unit tests).
- `npm run test:e2e`: 37 passed, 2 skipped. New in `e2e/usage.spec.ts`: with hour-long read and
  check intervals, a click shows new Claude Code and Codex values within 3 s and sends one status
  request; the setup screen has no such button. `tmp/screens/light-usage-pin-on-1.png` and
  `dark-usage-pin-off-1.png` were opened: the icon sits left of «항상 위» and reads in both themes.
- Not checked: the installed app with this change, a physical menu bar click.

## A hook from a moved install (2026-11-03)

Found by the developer: the menu bar showed «CC 35/100%» from 2026-11-02 15:13 on. The status line
command in `~/.claude/settings.json` still named the checkout's old folder
(`~/Laboratory/usage-limit-monitor`), which no longer exists, so the hook failed on every draw and the
record stopped changing. The app counted any command containing `statusline-hook.js` and `--home` as
applied, so it showed «연동됨». No PRS issue; the PRS MCP servers did not connect in this session, so
no `record_verification` entry was written.

- Before changing the real settings, the installed app's hook was run against a scratch folder with
  a sample input; it wrote the record (exit 0). With the developer's approval the `statusLine`
  command was then pointed at `~/Applications/Usage Limit Monitor.app` (only that line changed;
  backup kept outside the repository). Claude Code's next draw wrote the real record
  (`updatedAt` 2026-11-03T00:34:51Z).
- `npm run typecheck`, `npm run lint`: passed. `npm run format:check`: only
  `.claude/settings.local.json` flagged, a file ignored by the developer's global gitignore and not
  part of this change.
- `npm test`: 94 passed (new in `test/integration.test.ts`: missing hook files are named, quotes
  included; a hook from a moved install is not applied, and applying again replaces it while still
  chaining the person's own command).
- `npm run test:e2e`: 36 passed, 2 skipped (live data and the package check). New in
  `e2e/screens.spec.ts`: the setup screen shows «연동 끊김» and the missing paths, «다시 연동»
  replaces the hook, and a status line draw then shows on the usage screen.
  `tmp/e2e-shots/setup-broken-1.png` and `setup-repaired-1.png` were opened and read.
- Not checked: a physical click on the menu bar item, and the packaged app with this change (the
  installed copy predates it).

## Standalone macOS package (2026-11-02)

Requested directly by the developer, without a supplied PRS issue. The PRS developer MCP is not
available in this session, so no `record_verification` entry was written.

- `npm run test:package`: passed (1 test). Built the arm64 bundle, copied it to a differently named
  folder under `tmp/`, verified its signature with `codesign --verify --deep --strict`, launched
  without a project argument and with a different working directory, and confirmed `app.isPackaged`
  and the embedded app path. Opened all three screens, applied integration to temporary settings,
  ran the embedded hook through the saved shell command, and observed 33% on the Claude usage card.
- `npm run typecheck`, `npm run lint`, `npm run format:check`: passed.
- `npm test`: 92 passed. Existing Vite configuration warning remains.
- `npm run test:e2e`: 34 passed, 1 failed, 2 skipped (live data and the separately run package check).
  The failure is the dark usage screen's no-scroll assertion described below; the full suite is
  therefore not green. Generated captures in `tmp/screens/` and `tmp/e2e-shots/` were opened and
  visually reviewed using contact sheets in `tmp/review-*.jpg` and `tmp/review-extra-*.jpg`.
- `git diff --check`: passed.
- Initial package checks exposed a missing test input argument and Electron treating its original
  executable name as development mode. Both were fixed; the executable and `CFBundleExecutable`
  now use the app's name. A sandboxed attempt could not bind the local fake API (`EPERM`); the
  successful check ran outside that sandbox.

The packaged usage capture in `tmp/e2e-shots/packaged-usage-1.png` was opened and visually inspected.
The existing dark usage capture shows its footer wrapping and scrolling at the 360 × 600 test
viewport; the existing `three screens, dark` no-scroll assertion also failed on a targeted rerun
(`npx playwright test e2e/look.spec.ts --grep 'three screens, dark'`). No renderer code changed in
this packaging task. Real notification banners, Finder double-click, and a physical menu-bar click
were not checked. Real Claude settings were not used by the checks.

## Version 5: both windows in the title, quitting, development display (2026-11-02)

LHS-5 revision 8 (plan v5) and the developer's two requests in `docs/decisions.md` «Version 5», on
the working tree before commit, branch `feature/menu-bar-both-windows` from 6d64bce. Recorded in PRS
for LHS-5 검증 12–16 and 18–23, the checks whose result the title change can affect (17, the 5-minute
rule, does not touch the title): 10 O, 23 «-».

| Run                 | Command                                                     | Result on 2026-11-02                                                                                                                                                                  |
| ------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Types, lint, format | `npm run typecheck`, `npm run lint`, `npm run format:check` | clean                                                                                                                                                                                 |
| Unit tests          | `npm test`                                                  | 92 passed (new: 검증 19–21 in `test/format.test.ts`; `test/menu-bar-title.test.ts` now starts from both windows)                                                                      |
| App checks          | `npm run test:e2e` (every launch sets `ULM_DEV_DISPLAY=1`)  | 35 passed, 1 skipped (the live check). New: 검증 19–21 and 22 on the real Tray; `e2e/quit.spec.ts`; `e2e/dev-display.spec.ts`. `lsappinfo front` was Ghostty before and after the run |
| Live data           | `ULM_LIVE=1 npx playwright test e2e/live.spec.ts`           | passed; the live API had no scheduled reset                                                                                                                                           |

**The window on the DELL, without the keyboard.** `e2e/dev-display.spec.ts` asks Electron where the
window is (`screen.getDisplayMatching`), whether it has the keyboard (`isFocused`,
`getFocusedWindow`), and macOS which application is in front (`lsappinfo front`) before and after.
With the variable on: the window on «DELL P2417H» at (3272, 39), not focused, the front application
unchanged, for the ordinary window and for the popover opened by a click on the item. The same probe
with `ULM_DEV_DISPLAY=0`, three times: «LG QHD», focused, Electron in front. A capture of the DELL
showed the usage screen at its top right over the other windows; it was deleted because it also caught
the developer's chat window. In 1 of 7 early runs with the variable on, the front application changed;
it did not happen again in the next 4 runs or the 2 full suites, and the cause was not found.

**The real menu bar (LHS-5 검증 23).** `tmp/menubar-probe/` (outside the repository): the app with
92/84, 12/44 and a scheduled reset; `screencapture` of the menu bar; then another Electron process
with 8 wide items. With room: «CC 92/84% · CX 12/44% · ↻ 2일», 231 pt. Crowded: macOS hid 6 of the
other items; ours kept its text, width and size. Started after the other items, ours was still shown
and macOS hid another. Ours being hidden by macOS was not seen.

**Quitting.** `e2e/quit.spec.ts` records the menu the item would pop up (the native menu cannot be
clicked from a script): a right click and a Control-click each give one menu with only «종료» and leave
the popover closed; a plain click opens 사용량 현황 with no menu; «종료» ends the app. The app menu has
«종료» with `Command+Q`, and clicking it ends the app.

Not verified:

- A real right click or Control-click on the menu bar item, and a real ⌘Q keystroke. A script would
  have had to click or type on the developer's screen; a mistaken ⌘Q would have quit the app in front.
- `npm run dev` and `npm start` by hand: both use the real data folder and Claude Code settings. The
  popover's placement with the variable was checked with a click emitted on the Tray, and that it
  does not close on a click elsewhere until clicked into was not checked.
- 검증 14, 18 and the «…» sign of 21 were checked in unit tests only.

## Several Claude Code windows, one record (2026-10-30)

On the working tree after af45e7d (LHS-2, revision 4).

| Run        | Command                                                                            | Result on 2026-10-30                                                                                                                                                                                                                        |
| ---------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hook cases | `npm test` (`test/statusline-hook.test.ts`, the built hook run as a process)       | lower ignored, file unchanged; equal or higher taken with a new time; new reset time taken; 4 min 59 s apart is the same window, 5 min a new one; one window old beside a newer one; previous command still runs; no record; damaged record |
| Real hook  | this Mac's npm Electron with `ELECTRON_RUN_AS_NODE=1`, `--home` a temporary folder | 75% / 40%, then 57% / 38% with the same reset times: same SHA-1 and modification time; then 57% / 45%: 5-hour kept at 75%, 7-day 45%, new `updatedAt`                                                                                       |

## Local notification identity (2026-10-30)

The owner reported that the warning pointed to an absent «Electron» entry. Diagnosis:

- `codesign -dv --verbose=2 node_modules/electron/dist/Electron.app`: linker ad-hoc signature,
  `Info.plist=not bound`, no sealed resources.
- The running app's notification log recorded `UNErrorDomain error 1` at 16:18 and 17:04 KST.
- `ditto` copied the npm runtime to `tmp/notification-probe/Usage Limit Monitor.app`; PlistBuddy
  gave it a separate probe identifier and display name; `codesign --force --deep --sign -` signed
  the copy and `codesign --verify --deep --strict` passed.
- Running `tmp/notification-probe/probe.cjs` with the signed runtime emitted `PROBE: shown` for a
  real notification. This confirms acceptance by macOS; the banner was not visually checked.

Implementation checks:

| Command / check                                                                                                                                | Result                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`, `npm run lint`, `npm run format:check`                                                                                    | Passed                                                                                                                                                                    |
| `npm test`                                                                                                                                     | 90 passed                                                                                                                                                                 |
| `npm run test:e2e`                                                                                                                             | 28 passed, 1 skipped, 2 failed: light/dark usage screen exceeds the 600 px test viewport                                                                                  |
| Unchanged `af45e7d`, extracted into `tmp/notification-baseline/`; build, then `playwright test e2e/look.spec.ts --grep 'three screens, light'` | Same viewport assertion failed at `e2e/look.spec.ts:61`; unrelated layout failure left unchanged                                                                          |
| `node --input-type=module -e 'import { prepareRuntime } from "./scripts/macos-runtime.mjs"; console.log(prepareRuntime());'`                   | Created the runtime; subsequent `npm start` reused it                                                                                                                     |
| `codesign -dv --verbose=2 'tmp/runtime/Usage Limit Monitor.app'`                                                                               | Identifier `local.usage-limit-monitor`, bound Info.plist, sealed resources                                                                                                |
| Final runtime running `tmp/notification-probe/probe.cjs`                                                                                       | `PROBE: shown`; request accepted, banner not verified                                                                                                                     |
| System Settings › Notifications, inspected through computer use                                                                                | «Usage Limit Monitor» exists; opened its controls and confirmed notification switch is off; left the switch unchanged                                                     |
| `node tmp/signed-runtime-check.cjs`                                                                                                            | Passed: signed runtime renders usage, loads preload, reads the isolated fixture, and reports the expected executable path                                                 |
| `npm start > tmp/start-signed.log 2>&1` after stopping the old monitor                                                                         | Running from the signed runtime; renderer subprocess present. A sandbox-extension diagnostic about the helper's Resources path was logged; the renderer smoke test passed |

Inspected `tmp/signed-runtime-window.png`, the updated `usage-alert-denied-1.png` naming
«Usage Limit Monitor», and the capture contact sheets `tmp/notification-qa-1.jpg` through `-6.jpg`.
The two viewport failures prevent an all-green suite; this change does not claim otherwise.
The live API check remains skipped, and a visible notification banner remains unverified while
notification permission is off. No Claude Code settings, alert history or other app preferences
were edited. The app must wait for subsequent limit windows rather than replaying old attempts.

## Look revised (2026-10-30)

The design changes in `docs/decisions.md` «Look», on the working tree after 2ae8ca4. Captures before:
`ULM_SHOTS_DIR=tmp/screens-before npx playwright test e2e/look.spec.ts` on the unchanged code (the
usage screen did not fit 600 px in either theme); after: `tmp/screens/`, same states, 38 files each.

| Run                 | Command                                                     | Result on 2026-10-30                                                                                           |
| ------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Types, lint, format | `npm run typecheck`, `npm run lint`, `npm run format:check` | clean                                                                                                          |
| Unit tests          | `npm test`                                                  | 82 passed (new: the warning colour's 80% boundary is the alert threshold)                                      |
| App checks          | `npm run test:e2e`                                          | 30 passed, 1 skipped (new: usage screen fits 600 px in light and dark; only 84% is coloured; 5시간 before 7일) |

## Version 4 (2026-10-30)

LHS-5 revision 5, LHS-7 revision 7 and LHS-8 revision 8 (plan v4), on the working tree after
95f1ba5. Recorded in PRS for the checks that are new or changed: LHS-5 검증 12–18, LHS-7 검증 3, 6,
8–11, LHS-8 검증 1, 2, 4, 7.

| Run                    | Command                                                     | Result on 2026-10-30                                                                                                                           |
| ---------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Types, lint, format    | `npm run typecheck`, `npm run lint`, `npm run format:check` | clean                                                                                                                                          |
| Unit tests             | `npm test`                                                  | 81 passed (new `test/menu-bar-title.test.ts`: wording, no suffix, held check, reset time, new time, 5-minute boundary, shared request, 15 min) |
| App checks             | `npm run test:e2e`                                          | 27 passed, 1 skipped (new: the menu bar title read back from the real Tray with `getTitle()`; 18 history entries, 5 + 10 + 3)                  |
| Live data              | `ULM_LIVE=1 npx playwright test e2e/live.spec.ts`           | passed; the live API had no scheduled reset                                                                                                    |
| The menu bar, captured | `tmp/probe/menubar.pw.ts` then `screencapture`              | the menu bar item read «CC 73% · CX 26% · ↻ 2일» (`tmp/menubar.png`)                                                                           |

Not verified: the minute-by-minute recompute and the removal at the reset time were checked with fake
timers and, in the app, with a reset 6 s away; a whole day was not waited out.

Then (same day, LHS-5 revision 6, LHS-7 revision 8): the open popover's own refresh went from 60 s to
30 s. A new app check pushes the background re-read out to an hour, so only that timer can read: a
changed record, a read failure and the recovery each showed within 35 s with no click. Both issues
were recorded again in full on their new revisions, from the run below.

| Run                 | Command                                                     | Result on 2026-10-30 |
| ------------------- | ----------------------------------------------------------- | -------------------- |
| Types, lint, format | `npm run typecheck`, `npm run lint`, `npm run format:check` | clean                |
| Unit tests          | `npm test`                                                  | 81 passed            |
| App checks          | `npm run test:e2e`                                          | 28 passed, 1 skipped |

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
