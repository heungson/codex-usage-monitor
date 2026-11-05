# Decisions

## Claude Code limits from the Anthropic account (developer, 2026-11-03)

Owner: developer 이흥선, in the coding session, after the status line record had stayed hours old
whenever no Claude Code session was open (the status line only runs inside a session). This reverses
the app's earlier rule «uses no token, sends nothing»; the planner has not seen it yet.

- The Claude Code card and the menu bar title use `GET /api/oauth/usage` on `api.anthropic.com`
  (header `anthropic-beta: oauth-2025-04-20`), the endpoint Claude Code's `/usage` uses, with the
  access token from the Keychain item «Claude Code-credentials». Checked once by the developer on
  2026-11-04: HTTP 200 with `five_hour` and `seven_day` (`utilization`, ISO `resets_at`).
- At most one request a minute (`ULM_CLAUDE_API_INTERVAL_MS`); a failure also waits a minute.
  «새로 고침» within the minute reuses the last answer.
- Changed 2026-11-05 (developer, after the installed app showed «계정 조회 실패 · 429» while a
  session was open): a one-minute wait was not enough, the app kept being refused. Now, after a 429
  the app waits for Retry-After, or without one 2, 4, 8, 16, then 30 minutes, and a success starts
  over; the card says when it asks next. And no request is sent while the status line record is
  under a minute old: it is current already, and is shown without the old failure.
- Changed again 2026-11-05 (developer, «just fix this» on «계정 조회 실패 · 429 · 14:02:40에 다시
  물어봐요»): Anthropic answers this endpoint's 429 with «Retry-After: 0» and keeps refusing
  (anthropics/claude-code issues 30930 and 31637; Claude Code's own sessions poll it too, so the
  limit is shared). The backoff is now the least wait and only a longer Retry-After extends it.
  A 429 while the status line record can be shown is a pause, not a failure: the badge stays 정상
  and a grey line says «Anthropic이 잠시 조회를 막았어요 (429) · HH:MM:SS에 다시 물어봐요». Other
  failures still show «계정 조회 실패».
- Changed 2026-11-05 (developer, «why does it not match the actual value?», with the card at
  «5시간 71% · 리셋 오늘 17:20 (지남)» while Anthropic's page said «Current session 0%»): the record
  is written only while Claude Code draws its status line, and the account was paused by a 429, so
  the newest value was from before the reset. A window whose reset time has passed now counts 0%
  everywhere: the card (with «오늘 17:20에 리셋됨 · 새 기록을 기다려요» under it, no even-use mark),
  the menu bar title, and the 80% alert, which no longer fires again on that old value. The value
  read stays as it was; only what is shown is worked out at the time (`currentPercent` in
  `src/shared/format.ts`). A 1-point difference on a window still running (60% here, 61% on the
  page) is the record's age: it is the value when Claude Code last drew its status line.
- The login is only read. The app never uses the refresh token: renewing replaces the stored login
  and could sign Claude Code out. A login past `expiresAt` is not sent; the card says Claude Code
  renews it when run.
- Fallback: the status line record (FC-F004), with the reason on the card and the badge «계정 조회
  실패». Whichever source was updated last is shown, so a running session still shows at once.
- «마지막 갱신» is the time Anthropic answered when the values come from the account (PR-P004 named
  the hook's write time; that still holds for the record).
- The endpoint is undocumented and may change; when it does, the card falls back as above.
- Code: `src/main/claude-api.ts`. The checks never read the Keychain: `ULM_CLAUDE_CREDENTIALS` points
  at a test file and `ULM_CLAUDE_API_BASE_URL` at a local fake.

## Standalone macOS packaging (2026-11-02)

Owner: developer 이흥선 requested a standalone app in the coding session; Codex selected the
packaging implementation. `npm run package` copies the existing locally signed Electron runtime,
embeds the bundled code and a minimal manifest under `Contents/Resources/app`, then signs and verifies
the completed bundle. This follows Electron's manual packaging layout and adds no dependencies.
Output is `tmp/package/Usage Limit Monitor.app`; the installed Electron architecture is retained.
This is local packaging, with no distribution certificate or notarization. The hook stays unpacked
so Claude Code can run it through the bundled executable (FC-F003). The user installs the bundle
before applying integration so its absolute paths remain valid. Existing data locations are unchanged.

2026-10-30 · In progress: built from PRS plan «사용량 한도 모니터», published version 3 (first built
from version 1 on 2026-10-28). Issues LHS-2 to LHS-10 still say version 1 in PRS; the planner (이흥선,
also the developer) decided to build version 3. Nothing is committed yet. The plan has no design
stage and no design system (`get_design_system` v3: `designSystem: null`), so the screens follow
the wireframe's layout and elements, with the app's own CSS described under «Look».

## Local notification identity (2026-10-30)

Owner: Codex, correcting the owner's report that the warning names an app missing from macOS
Notification settings (FC-F014, FC-F015). This is a runtime fix, with no change to alert timing.

The running npm Electron bundle had only a linker ad-hoc signature (`Info.plist=not bound`, no
sealed resources). Its notification attempts returned `UNErrorDomain error 1`, which the app
interpreted as notifications being switched off. Electron 42+ requires a signed bundle for the
UNNotification API. A copied bundle with its own identifier and a full local ad-hoc signature
accepted a real notification on this machine (`show` event), whereas the original did not.

`npm start` now builds the code and uses a separate signed runtime in
`tmp/runtime/Usage Limit Monitor.app`, identifier `local.usage-limit-monitor`. The runtime is cached
and verified before reuse, and recreated when the Electron source changes. It supplies its display
name to both notification notices. It needs no signing certificate and is for local use; it does
not provide distribution signing or notarization. The npm Electron binary and existing Claude Code
settings are untouched. The once-per-window rule (FC-F014) still applies to earlier failed alerts.

## Framework: Electron + TypeScript

The plan allows Electron or Tauri (PR-P019). The owner chose «Electron / Tauri» when asked on
2026-10-28; Electron was taken because this machine has Node.js and no Rust toolchain, and Tauri
would have needed one installed first. Electron 44.10.0 was pinned rather than 45.x, which was a week
old. The renderer is plain TypeScript without a UI framework: three small screens did not need one.
Bundled with esbuild; unit tests with Vitest; the app is driven end to end with Playwright's
Electron support.

## 설정 › «로그인 시 자동 실행» (developer, 2026-11-04)

Asked for directly by the developer 이흥선 in the coding session; no PRS item. A 설정 screen, opened
by a gear icon in 사용량 현황's top bar beside «새로 고침», with one switch, «로그인 시 자동 실행».
The placement, the wording and the default (off) were chosen by Claude Code; the developer can
change them. Not put in the menu bar item's right-click menu, which the developer asked to hold only
«종료» (2026-10-30).

macOS holds the setting: the app calls Electron's `app.setLoginItemSettings` (SMAppService on
macOS 13+) and reads the state back from macOS each time the screen opens, so a change made in
System Settings › General › Login Items shows. Nothing is stored in the data folder. If macOS holds
the item for approval, the screen says so and opens that pane; if macOS ignores a change, it says
that too. Only a packaged app (`app.isPackaged`) offers the switch: from `npm start` the runtime in
`tmp/runtime/` would be registered and start at login without this code. The checks use
`ULM_FAKE_LOGIN_ITEM`, a file in place of macOS, so they never add a login item.

## «새로 고침» on the usage screen (developer, 2026-11-03)

Asked for directly by the developer; no PRS issue. A ↻ icon button in the usage screen's top bar
re-reads both local records and asks codex-resets.com for the status at once, like «다시 시도»;
the 5-minute rule for opening the screen does not apply to a click. While a read runs it shows the
spinner that was there before and ignores further clicks (`aria-disabled`, so keyboard focus stays).
The other screens have none: they fetch when they open. It cannot make Claude Code's numbers newer
than its last status line draw; only Claude Code writes that record.

## A hook whose files are gone counts as not applied (developer, 2026-11-03)

FC-F003 asks for the integration to be applied and its failures shown. A status line command that
names this app's hook but whose runtime or script is missing (the app or checkout was moved or
deleted) cannot run, so nothing is recorded and no hook error can be written either. The app now
reports it as not applied, names the missing paths on the setup screen («연동 끊김»), and «다시 연동»
replaces it with the running app's hook. The command chained after the hook stays the one saved when
the integration was first applied. Code: `missingHookFiles` in `src/main/integration.ts`.

## Answers to what the plan left open

Asked of the owner (the planner) in the coding session on 2026-10-28, because the plan marked them
undecided. Recorded here because the PRS developer MCP cannot post issue comments.

| Question                                                                                    | Issue         | Answer                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| How often the open popover refreshes, and how often a failed area retries                   | LHS-5         | Every 30 seconds while the popover is open (60 s until 2026-10-30, changed by the developer to match LHS-5). The local files are also re-read every 30 seconds in the background (LHS-3, LHS-4). |
| codex-resets.com retry backoff                                                              | LHS-7, LHS-8  | 10 s, 20 s, 40 s, then stop (3 automatic tries). «다시 시도» starts over. In PRS since LHS-7 revision 6 and LHS-8 revision 7 (2026-10-30).                                                       |
| What a history row shows                                                                    | LHS-8         | Local date and time, the type (전체 리셋 / 적립형 리셋), the first line of the announcement, and a link to the original post.                                                                    |
| New-reset notifications depend on a status that is only fetched when the reset screen opens | LHS-7, LHS-10 | Check `/api/v1/status` in the background every 15 minutes for notifications. The reset screen does not poll while open. (v3: see below; the check now feeds the screens too.)                    |
| A remote repository for LHS-1                                                               | LHS-1         | `origin` is git@github.com:heungson/codex-usage-monitor.git (owner, 2026-10-30). Not registered in PRS yet.                                                                                      |

### Version 3

Asked of the developer, 이흥선, in the coding session on 2026-10-30; they answered «1~7 모두 네가
권한 대로 해». The plan items stay open in PRS until the planner closes them.

| #   | Plan question or gap                                                                                    | Answer                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | PR-Q003 / UF-Q004: what the reset screen does when it opens (FC-F011, FC-F012)                          | Show the results already known at once (the status the usage screen has, the history last fetched in this run), fetch both areas again, keep the known values on screen with «새로 고치는 중» while the request runs.                                                                              |
| 2   | PR-Q004 / UF-Q005: how many history entries first (FC-F012)                                             | 5 first; «이력 더 보기» adds 10. Checked on 2026-10-30 against the live API that a cursor from a 5-entry page continues correctly with `limit=10` (entries 6–15 equal a single 15-entry request).                                                                                                  |
| 3   | FC-F011 «공개 API 갱신 주기(정하지 않음)»: how often the usage screen's 예정 리셋 is fetched            | One status shared by the usage screen, the reset screen and the new-reset notifications. The 15-minute background check stays; opening the usage screen fetches again when the last success is older than 5 minutes. Failures retry after 10, 20, 40 s with «다시 시도», as decided on 2026-10-28. |
| 4   | FC-F019: what «창 항상 위에 표시» changes for a menu bar popover                                        | Off: as before, the popover closes when the person clicks elsewhere. On: it stays open above other windows until the menu bar item is clicked again, and can be dragged by its top bar; once dragged it reopens where it was left.                                                                 |
| 5   | PR-Q002 / FC-Q001 / UF-Q003: keep the separate reset screen?                                            | Keep it (WF-S003), opened from the 예정 리셋 area, back to 사용량 현황.                                                                                                                                                                                                                            |
| 6   | The «Codex 전체 리셋 보기» button in the usage screen's notice about a reset that could not be notified | Removed, keeping «닫기»: FC-F008 says there is no separate button to the reset screen, and the 예정 리셋 area right below opens it.                                                                                                                                                                |
| 7   | A design-system paragraph in AGENTS.md                                                                  | Added: no design system; the tokens in `src/renderer/styles.css`.                                                                                                                                                                                                                                  |

### Version 3 issues, rewritten (2026-10-30)

The planner rewrote LHS-2 to LHS-8 for v3. In the rewrite, where this file's answers were not in
PRS, the values an AI recommended were confirmed instead: retries after 30, 60, 120 s (LHS-7,
LHS-8); the API's default page size and «리셋 시각만» per history row (LHS-8). The developer, 이흥선,
commented on both issues, and the planner corrected and confirmed them again: **LHS-7 revision 6**
and **LHS-8 revision 7** now say 10, 20, 40 s then stop; 5 entries first and 10 per «이력 더 보기»;
a row shows the local date and time, the type, the first line of the announcement and the original
post. The app was already so; no code changed for it.

- LHS-8's «화면» section still says «기본 페이지 크기 … 리셋 시각만»: PRS does not let the planner
  edit that section. Follow the 개발 항목 and 검증 항목; the developer reported the gap to PRS. No
  issue comment.

Answered by the developer, 이흥선, on 2026-10-30, the second from the planner:

- **«자동 재시도 중» on the usage cards (LHS-6 검증 10).** While the 30-second automatic re-read
  after a failure runs, a CLI card says «자동 재시도 중», with the same words and look as the reset
  areas: in the notice's retry line, and as the chip when there is no last value. «다시 시도» and
  other re-reads are not shown as automatic.
- **The 예정 리셋 area takes the keyboard itself (LHS-5 검증 11).** The planner's answer: no separate
  button; the area itself gets focus, opens with Enter or Space, and is announced as
  «Codex 전체 리셋 자세히 보기»; › stays only as a sign that cannot be pressed. Built as one button
  stretched over the whole card, under its content, rather than giving the card itself a button role:
  a button's content is read as one label, so «다시 시도» and the source link inside the area would
  have been lost to screen readers. Text in the card lets the pointer through to that button.

### Version 4 (2026-10-30)

The plan was published as v4; the planner rewrote LHS-5 (revision 5), LHS-7 (revision 7) and LHS-8
(revision 8). Built from them:

- **Menu bar title (LHS-5 개발 항목 5, PR-P026, WF-P005).** «CC 73% · CX 26% · ↻ 2일» (v5: both
  windows, «CC 92/84% · CX 12/44% · ↻ 2일») while the shared status has a scheduled reset with a time
  still ahead: days, else hours, else minutes, rounded down; under a minute «↻ 1분 미만». Worked out again every minute without a request, and removed at
  the reset time by a timer, without waiting for a request. A failed status removes it even with a
  last good value; a status being fetched again keeps it.
- **Exactly 5 minutes does not refetch (LHS-5 검증 17, LHS-7 검증 9).** This file already said «older
  than 5 minutes»; the code fetched at exactly 5 minutes. Fixed to match both.
- **A last good value under an error also stays while fetched again (PR-P027, LHS-7 개발 항목 2).**
  Before, only a loaded or empty area did; one that had failed with a last value showed 불러오는 중.

Asked of the developer, 이흥선, on 2026-10-30; the first two the planner then wrote into the issues:

- **«다시 시도» sends a new request.** Written by the planner in PRS (LHS-7 revision 8, 개발 항목 1):
  every path joins a status request already running, except «다시 시도» in an error area, which
  sends a new one because the person who pressed it needs a new result (see «Found while building
  v3»: it had shown an old failure). A late answer from the older request is dropped and does not
  overwrite the newer one.
- **A scheduled reset with no time (`scheduled_for` null).** Written by the planner in PRS (LHS-5
  revision 6, 개발 항목 5): no suffix in the menu bar, since there is no time to count down to; the
  reset is shown only in the usage screen's 예정 리셋 area.
- **The open popover refreshes every 30 s** (developer, following LHS-5 개발 항목 1; it was 60 s, see the
  table above). Its own timer's re-read is automatic, so a failed area shows «자동 재시도 중» on it too,
  as on the 30-second background re-read.

### Several Claude Code windows, one record (2026-10-30)

Seen by the developer, 이흥선, in use: with several Claude Code windows open the screen showed 5시간
57% («마지막 갱신 1분 전») for a while, then jumped to 75%. Each window's status line hook writes the
limits that window last received to the same record, stamped with the time of writing, so an idle
window wrote old, lower values over newer ones. Rule from the developer (also a comment on LHS-2):

- Each limit window (5시간, 7일) is decided on its own. With the same reset time as the record, a lower
  used percentage is an old value: that window keeps the record's value. Equal or higher: taken.
- A different reset time is a new window: taken as it is. «The same reset time» means less than 5
  minutes apart, the tolerance the limit alerts use; both now read it from `src/shared/windows.ts`.
  (The alerts had compared «5 minutes or less»; it is now strictly less than 5, as written below.)
- When no window takes a new value, the file is not written, so «마지막 갱신» does not move for old
  values. When any window does, the record gets the new update time.
- With no record, or one that cannot be read, the input is written as it is. Running the previous
  status line command and the error marker are unchanged.
- Settled here, to confirm with the developer: a window the input does not carry keeps the record's
  value (before, it was written as null). An input with no window at all still leaves the record
  untouched (LHS-2 검증 7).
- If no window has made a request lately, every value may be old; the status line cannot tell. The app
  says so as before: «Claude Code가 실행 중일 때만 갱신돼요».

Settled here without asking, because no person sees them:

- The record format between the status line hook and the Claude Code reader: `docs/claude-record.md`.
- Codex session files untouched for more than 8 days are ignored. The longest window is 7 days, so
  their limits have reset since; and one old unreadable file would otherwise hold Codex in an error
  state forever.
- Claude Code windows count as the same window for limit alerts while the reset time moves by less
  than 5 minutes, since the sources round it (`src/shared/windows.ts`, also used by the status line
  hook since 2026-10-30).
- Until v5 the menu bar showed `CC <highest %> · CX <highest %>`; since LHS-5 revision 8 it shows both
  windows (see «Version 5»). `–` is no record, `?` a value that is not current.

- v3: the scheduled reset's own fields could not be seen: the live API had `scheduled_reset: null` on
  2026-10-30. The 예정 리셋 area shows the type, the announcement time and its first line, the fields
  every reset entry has. v4: the API's own schema (`https://codex-resets.com/api/openapi.json`, read
  2026-10-30) gives `scheduled_for` (date-time or null); the area and the reset screen now show it
  when it is there, and the menu bar counts down to it.
- v3: the window settings file is `window-settings.json` in the data folder; a missing or unreadable
  file reads as off.

## Version 5 (2026-11-02)

LHS-5 revision 8 (plan v5), and two requests from the developer, 이흥선, made on 2026-10-30 and built
on 2026-11-02 in the worktree on branch `feature/menu-bar-both-windows`.

### Menu bar title with both windows (LHS-5 개발 항목 5, FC-F008, WF-P005)

- **Both windows per CLI, 5시간/7일**: «CC 92/84% · CX 12/44%», each value rounded on its own. This
  replaces «the highest window of each CLI» (v1, «Settled here without asking» above). The order is
  the screen's (shorter window first), now one function for both (`shorterFirst` in
  `src/shared/format.ts`).
- **One window recorded**: only that one, «CX 30%»; the missing window is never shown as 0.
- **Signs per CLI, unchanged**: «–» 수집 대기, «…» 불러오는 중, a trailing «?» on the last good values
  when a read failed («CC 92/84%?»). «!» for a failed read with no last value stays as before; the
  issue does not name that state.
- **Never shortened.** The app sets the whole title; when the menu bar is full, macOS hides items.
  The issue (revision 8) says so; WF-P005 still says the way to keep both windows and the suffix
  «is decided in WF-Q008» once a shortage is seen. The issue was followed.
- For the planner, not changed here: PR-P008's example separates the CLIs with «|»
  («CC 92/84% | CX 12/44%»); the issue, FC-F008 and WF-P005 say U+00B7. The app uses U+00B7.

### Quitting (developer, 2026-10-30, comment on LHS-5)

The app had no way to quit. The plan says nothing about it; this is the usual menu bar app behaviour,
decided by the developer:

- A right click or Control-click on the menu bar item opens a small menu with only «종료»; a click
  opens 사용량 현황 as before. The menu is popped up from those clicks (`popUpContextMenu`), not set
  with `setContextMenu`, with which macOS opens the menu on every click.
- ⌘Q quits while 사용량 현황 is open: the app menu now has «종료» with ⌘Q. Setting an app menu replaces
  Electron's default one, so it keeps the Edit menu for copy and paste in the popover.
- Both items call `app.quit()` instead of Electron's quit role: on macOS that role's item goes through
  the system and does nothing when clicked from code, so the checks could not drive it.

### Development display (developer, 2026-10-30; no PRS issue)

Test windows covered the developer's main display (the LG with the menu bar) and took the keyboard.
`ULM_DEV_DISPLAY=1` (development only):

- The popover and the ordinary window (`ULM_SHOW_WINDOW=1`) open at the top right of the first display
  that is not the main one (here the DELL P2417H), 8 px in from its work area, with `showInactive()`:
  the app in front stays in front. With one display they open where they always did.
- Set by `npm run dev` and by every app check (`e2e/app.ts`). `npm start` does not set it, and a
  packaged app ignores it.
- A side effect, accepted: a popover that never got the keyboard does not close when the person clicks
  elsewhere (it closes on blur); a click on the menu bar item closes it.
- The menu bar item is on every display; macOS places it, and it is left as it is.

## «주말·공휴일 제외» for the even-use mark (developer, 2026-11-05)

Asked for by the developer: a 설정 switch that leaves Saturdays, Sundays and national holidays out
when the even-use mark moves. Decided while building it and confirmed by the developer the same day:

- **Korea's holidays**, since the app and its user are Korean: public holidays, substitute holidays
  and election days from 우주항공청's 월력요항, as published by holidays-kr
  (`github.com/hyunbinseo/holidays-kr`, MIT). The dates are copied into
  `src/shared/holidays-kr.ts` for 2026 and 2027 rather than added as a package: the agent's attempt
  to install the package was refused by its permission check, and a short list in the repository is
  easy to check. It needs the next year added each year; a year not listed counts weekends only.
- **Windows of a day or longer only** (the 7일 limits). A 5시간 window that stopped on a Saturday would
  say nothing useful, so it always counts every hour.
- **How it moves**: the mark is the share of the window's working time that has passed, by local
  calendar day. It stands still on days off and moves faster on working days, reaching the end at
  the reset. A window with no working time at all has no mark.
- Off until turned on; kept with «항상 위» in `window-settings.json`. With it on, the mark's tip adds
  «주말과 공휴일에는 멈춰요.»

## Six themes from Korean crafts and painting (developer, 2026-11-05)

Asked for by the developer: «could you add more Korean cultures or traditions inspired color
themes?» No number was given; the agent chose six, each from a different craft, and the developer
confirmed them the same day:

- **색동**: the rainbow stripes of a child's hanbok sleeve, as the bars' stripes (red, yellow, green,
  blue, pink, white). Some stripes are light, so the fill has a 1-pixel dark edge to show where it
  ends; over 80% it turns to two reds. Follows the Mac.
- **청자**: Goryeo celadon, jade-green glaze with a faint crackle of crossing hairlines behind the
  cards, iron brown for warnings. Follows the Mac.
- **백자**: Joseon white porcelain, the moon jar's warm white, cobalt (청화) bars and copper red (진사)
  for warnings; large round corners. Always light.
- **자개**: 나전칠기, mother-of-pearl in black lacquer: pearl-coloured gradient bars and a pearl
  rule under the top bar. Always dark.
- **일월오봉**: the screen behind the Joseon throne, a blue sky, green peaks as each card's bottom
  rule and the bars, a red sun as the top bar's rule and warnings, a white moon as the even-use
  mark. Always dark.
- **조각보**: a wrapping cloth pieced from leftover silk, with a stitched seam inside each card and
  bars of patchwork colours (dark-edged, as 색동). Follows the Mac.
- All six pass `test/themes.test.ts`. The bar token each is measured by is the bar's main colour;
  the lighter stripes of 색동 and 조각보 are decoration inside the dark edge.

Found while capturing them: the 예정 리셋 card sometimes kept the previous scheme's background after
a light/dark switch, in 기본 too. Its `transition: background` animated the switch, and Chromium
does not run animations in the unfocused test window on the second display, so the card stayed at
the old colour. The transition is now on `:hover` only (the pointer arriving still fades in);
`e2e/look.spec.ts` checks the card matches the other cards in every theme and scheme.

## 14 more themes (developer, 2026-11-05)

Asked for by the developer: «add 15 more themes», then, while they were being built, «add just 14
more not 15». Decided while building them and confirmed by the developer the same day:

- **Which 14**: 바다, 숲, 노을, 벚꽃, 한지, 단청, 우주, 커피, 민트, 모노, 신문, 청사진, LCD, 사탕. The agent
  had drawn 15; 눈 (icy blue-white) was dropped as the closest to 바다 and 민트. Original names and
  palettes rather than named editor schemes, so nothing imitates another product.
- **One scheme by nature**: 단청, 우주 and 청사진 are always dark; 한지, 신문 and LCD always light. The
  rest follow the Mac. 한지 and 신문 use the Mac's serif fonts (AppleMyungjo for Korean), 청사진 and
  LCD the monospaced one; 벚꽃 and 사탕 the rounded one. Nothing new is bundled.
- **Every colour token per theme**: each block sets all of them, so no colour leaks from 기본's
  translucent ones. Hover, sunken, tinted backgrounds and the grey of values that are not current
  are mixes of the theme's own surface and text.
- **Contrast is measured, not judged**: `test/themes.test.ts` reads each theme's tokens from
  styles.css and checks text, secondary text, links, warnings and errors at 4.5:1 on panel and
  window, bars and the even-use mark at 3:1 on the panel, button text and the hover tip at 4.5:1.
  It found the earlier themes short in two places, fixed here: the primary button's text was
  always white, unreadable on 고대비 dark's yellow and weak on 픽셀 dark, 네온 and 파스텔 (a new
  `--on-accent` token now sets it per theme); and 파스텔 light's bars were 1.8–2.8:1 on white (now
  #8b5cf6, #ec4899, #ea580c).
- **Picker**: twenty options no longer fit two columns with notes; it is three columns of swatch and
  name, the short note in the tooltip.

## 테마 on the 설정 screen (developer, 2026-11-05)

Asked for by the developer: «can you make it use pixel art style?», then, while it was being built,
«just add it as one of themes that the users can choose» and «add 4 more themes». Decided while
building it and confirmed by the developer the same day:

- **Six themes**: 기본 (the look the app had, still the first state), 픽셀 (asked for), and four the
  agent chose to differ from each other: 터미널 (green phosphor, monospaced), 파스텔 (rounded, soft
  lavender and pink), 네온 (dark synthwave, glowing bars) and 고대비 (black and white, 2-pixel
  outlines, larger type, for reading at a glance).
- **Light and dark**: 터미널 and 네온 are always dark, since that is what they are; the others follow
  the Mac's setting. Every theme but 기본 is opaque; 기본 keeps the macOS popover material.
- **픽셀's font**: Galmuri11 (Lee Minseo, SIL OFL 1.1; `galmuri@2.40.3` on npm, fetched from
  jsDelivr), regular and bold, bundled in `src/renderer/fonts/` with its licence (about 670 KB). It
  covers all Hangul syllables and is drawn at its own 12-pixel size, or 24 for the big figures, so
  glyphs stay on the pixel grid. Bars are blocks, outlines 2 pixels, shadows hard. Light is paper
  and ink; dark uses the Sweetie 16 palette (GrafxKid).
- **How it is built**: `<html data-theme>` names the theme; each theme is a block of tokens and a few
  rules in `styles.css` under `:root[data-theme='…']`. Outlines are box-shadows, not borders, so no
  box changes size (the 예정 리셋 button must keep covering its card exactly).
- **Picker**: a radio group of six with a small preview each, two columns; kept in
  `window-settings.json` beside «항상 위» and «주말·공휴일 제외». A file without a theme, or naming one
  this version lacks, reads as 기본.
- The menu bar title is drawn by macOS and stays as it is in every theme.

## Freshness, an even-use mark and a translucent popover (developer, 2026-11-05)

The developer asked for a better design after looking at similar apps. A first version adopted
several ideas from CodexBar (`github.com/steipete/CodexBar`) and Usage4Claude
(`github.com/f-is-h/usage4claude`), committed as e357a84. After using it the developer found it
worse and had the CodexBar style removed the same day: the live two-bar menu bar meter (the static
tray icon is back), the pace line («… 소진 예상», «리셋까지 충분») and the countdown-first reset line
(back to «리셋 오늘 12:46 (2시간 14분 뒤)»). What stays:

- **Freshness in the header**: «마지막 갱신 3분 전 · Anthropic 계정» or «· 상태 표시줄 기록» under the
  Claude Code title, «가장 최근 Codex 기록 10분 전» under Codex, the full time in the tooltip; the
  separate meta block at the bottom of each card is gone. The words «마지막 갱신» stay (PR-P004).
- **Even-use mark** (Usage4Claude's pace guide): a thin mark on each bar where the bar would be if
  the window were spent evenly until its reset. Code: `src/shared/pace.ts`. The mark alone was not
  understood. A one-line legend under the CLI cards was tried first; the developer had it replaced
  the same day by a tip shown while the pointer is over the mark. Its wording, as the developer asked, says that the mark moves with time and what it means when the bar passes it: «시간이 흐를수록 이 표시는 오른쪽으로 움직여 리셋 시각에 끝에 이르러요. 지금은 N%예요. 사용량 막대가 이 표시를 앞서면 리셋 전에 한도에 닿을 수 있어요.» (the developer's draft, reworded and chosen by the developer) The area that shows it is wider than the mark;
  screen readers get the same text as the mark's label.
- **Translucent popover**: the window has macOS's `popover` vibrancy, kept active while pinned. The
  page, the top bar and the cards are tinted over it rather than clear (light cards 86% white, dark
  cards `#3a3a3c` at 72%), so text contrast stays close to the opaque values whatever is behind the
  window. The top bar blurs what scrolls beneath it.
- Kept from before: the cards, the two-colour rule at 80% (no red step), the one-screen fit.

## Look (v3, revised 2026-10-30)

The plan stops at the wireframe; the look is ours. First chosen by the coding agent when the developer
found the v1 screens too plain (a macOS menu bar look, the wireframe's layout and elements unchanged).
Revised the same day after the developer read the captures and named six problems (below). Before
and after: `tmp/screens-before/` and `tmp/screens/` (`e2e/look.spec.ts`).

- **Fit (revised).** With the usual data (both CLIs with both windows, a scheduled reset) the usage
  screen fits the popover's 600-pixel test height with no scrollbar; `e2e/look.spec.ts` checks it.
  Done by spacing, not by a larger window: 40 px top bar, 8 px between cards, cards padded 10×12 px,
  16 px figures, 5 px bars, the scheduled reset's due time on the same line as its type and the
  announcement on one line cut with «…» (the full text is in its tooltip). The reset screen with 5
  history rows fits too, so its source line at the bottom is never cut.
- **Order (revised).** Every CLI lists the shorter window first: 5시간, then 7일. The issues do not
  fix an order (LHS-5 lists Claude Code as «5시간·7일»; Codex as «각 시간 창»), so this one was free.
- **Warning colour (revised).** Two colours only: from the limit alert threshold (80%, LHS-9) up the
  figure and the bar take the warning colour, below it the usual one. The screen and the alerts share
  the same rule on the raw percentage (`src/shared/limits.ts`), so a window shown as «80%» after
  rounding but at 79.6% is not coloured, as it is not alerted. The red step at 100% is gone.
- **Less repetition (revised).** In the reset status, a row named «최근 전체 리셋» or «예정된 전체 리셋»
  no longer repeats «전체 리셋» beside its date; another type («적립형 리셋») is still shown. History
  rows keep their type chip: LHS-8 requires the type on every row. The usual «정상» status is a small
  green dot and grey text instead of a green chip; the label stays (LHS-6).
- **Font.** The macOS system font (SF Pro; Apple SD Gothic Neo for Korean). Korean wraps between
  words (`word-break: keep-all`); file paths still break anywhere. All figures use tabular numbers
  (revised: the whole page, not only the percentage), so times and percentages line up.
- **Sizes.** 15 px semibold screen title, 13 px semibold card titles and body, 12 px secondary, 11 px
  captions and chips, 16 px semibold figures (was 18 px) for the used percentage.
- **Spacing.** A 4-pixel grid; cards 10 px radius, controls 6 px, as macOS uses.
- **Colour and contrast.** macOS system colours, light and dark following the system setting
  (`prefers-color-scheme`; the window background follows `nativeTheme`). Text at least 4.5:1 on its
  background (light secondary text `#5f5f64`: 6.2:1; dark `#a1a1a6`: 6.0:1); the link blue is a darker
  `#0068da` in light mode because the system blue is 4.0:1 on white. Bars, as graphics, at least 3:1
  (revised): the light warning bar is `#c76a00` (3.8:1; the earlier `#f08c00` was 2.5:1); dark keeps
  `#ff9f0a` (6.8:1).
- **Cards and tables.** White (dark: `#2c2c2e`) cards with a hairline edge instead of borders; the
  reset status is a label/value list with hairline separators; history rows put the type and
  «원문 공지» on the date line to keep each entry to two lines.
- **Controls.** macOS push buttons (24 px, hairline shadow), one filled button per screen
  («연동 적용»), a 26×15 macOS-style switch with its short label «항상 위» (screen readers hear
  «창 항상 위에 표시»), a chevron icon button for back; the 예정 리셋 area is one button with › as a sign.
- **States (revised).** A shimmer skeleton for 불러오는 중 (still when the system reduces motion),
  tinted notices for warnings and errors, and «새로 고치는 중» while known values are fetched again.
  Values not current keep their text at full contrast (dimming them to 55% left 2.4:1); their bars
  and figures turn grey, beside the «최신 정보 아님» chip and the notice.

## Found while building

- A Codex session file made unreadable kept showing as current: the reader cached files by size and
  modification time, and `chmod` changes neither. It now checks read access on every scan
  (LHS-4 검증 4).
- Error notices with a long file path widened the 360-pixel popover past its edge; they now wrap.
  Raw messages such as `EACCES: permission denied, access '…'` were replaced by
  «…에 쓸 권한이 없어요», keeping the path the person needs.
- The notice that a limit alert could not be shown had no way to close it; it now has «닫기».

Found by the owner on the running app, 2026-10-28 («it doesn't even work well», with a capture):

- A notice that Codex's 7-day limit had reached 82% (14:26, notifications off) stayed after the
  15:29 global reset had brought Codex to 0%. The notice now belongs to its window and goes when that
  window resets.
- A new Codex reset was refused by macOS five times and the app said nothing. The popover now says
  so, with «Codex 전체 리셋 보기», and keeps quiet once closed; the reset is still notified once
  macOS allows it.
- «시스템 설정 › 알림에서 이 앱의 알림» named nothing the person could find: run from source the
  app is listed as «Electron». The notices now name it.
- The popover was a fixed 600 pixels tall and a third of it was empty. It now takes its page's
  height, up to the screen.
- The instance left running after the checks used a temporary Claude Code settings file, so
  «연동 적용» could not have reached `~/.claude/settings.json` and Claude Code showed 수집 대기 for
  good. It was restarted with the real paths.

Found while building v3 (2026-10-30):

- The staged v1 code did not pass `npm run lint` (`e2e/screens.spec.ts`: `prefer-const`), although
  `docs/verification.md` said it was clean. Fixed with the v3 change to that test.
- «다시 시도» while an automatic retry was still waiting for its answer joined that retry instead of
  sending a new request, so it showed the old failure. It now always sends a new request (unit test
  in `test/resets.test.ts`).
- The live check first matched the card title «Codex 예정 리셋» and passed while the area was still
  loading; it now waits for the area's settled content.

## Not decided, for the planner

- When the last Claude Code record is older than a window's reset time, the menu bar and usage card
  still show the old percentage as if current (seen 2026-11-03: «CC 35/100%» after both windows had
  reset at 17:10 and 21:00 the day before). The plan does not say what to show then: «?», «–», 0%, or
  the value with a note. Asked by the developer on 2026-11-03 to be raised with the planner as an
  issue comment. Not implemented.

- After a Codex global reset is announced, the Codex card still shows the last session record, which
  can predate the reset (seen on 2026-10-28: 44% from a record 22 hours old, after a reset announced
  that day). The plan has no rule for this. A possible rule: when a reset announcement is newer than
  the record, say so on the Codex card. Not implemented.
- The plan fixes the limit alert at 80% (LHS-9). The PRD speaks of «정해둔 비율», which suggests a
  setting; there is none yet.

## Verified / not verified

See `docs/verification.md`.
