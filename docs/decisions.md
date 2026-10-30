# Decisions

2026-10-30 · In progress: built from PRS plan «사용량 한도 모니터», published version 3 (first built
from version 1 on 2026-10-28). Issues LHS-2 to LHS-10 still say version 1 in PRS; the planner (이흥선,
also the developer) decided to build version 3. Nothing is committed yet. The plan has no design
stage and no design system (`get_design_system` v3: `designSystem: null`), so the screens follow
the wireframe's layout and elements, with the app's own CSS described under «Look».

## Framework: Electron + TypeScript

The plan allows Electron or Tauri (PR-P019). The owner chose «Electron / Tauri» when asked on
2026-10-28; Electron was taken because this machine has Node.js and no Rust toolchain, and Tauri
would have needed one installed first. Electron 44.10.0 was pinned rather than 45.x, which was a week
old. The renderer is plain TypeScript without a UI framework: three small screens did not need one.
Bundled with esbuild; unit tests with Vitest; the app is driven end to end with Playwright's
Electron support.

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

- **Menu bar title (LHS-5 개발 항목 5, PR-P026, WF-P005).** «CC 73% · CX 26% · ↻ 2일» while the shared
  status has a scheduled reset with a time still ahead: days, else hours, else minutes, rounded
  down; under a minute «↻ 1분 미만». Worked out again every minute without a request, and removed at
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

Settled here without asking, because no person sees them:

- The record format between the status line hook and the Claude Code reader: `docs/claude-record.md`.
- Codex session files untouched for more than 8 days are ignored. The longest window is 7 days, so
  their limits have reset since; and one old unreadable file would otherwise hold Codex in an error
  state forever.
- Claude Code windows count as the same window for limit alerts while the reset time moves by less
  than 5 minutes, since the sources round it.
- The menu bar shows `CC <highest %> · CX <highest %>`; `–` is no record, `?` a value that is not
  current.

- v3: the scheduled reset's own fields could not be seen: the live API had `scheduled_reset: null` on
  2026-10-30. The 예정 리셋 area shows the type, the announcement time and its first line, the fields
  every reset entry has. v4: the API's own schema (`https://codex-resets.com/api/openapi.json`, read
  2026-10-30) gives `scheduled_for` (date-time or null); the area and the reset screen now show it
  when it is there, and the menu bar counts down to it.
- v3: the window settings file is `window-settings.json` in the data folder; a missing or unreadable
  file reads as off.

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

- After a Codex global reset is announced, the Codex card still shows the last session record, which
  can predate the reset (seen on 2026-10-28: 44% from a record 22 hours old, after a reset announced
  that day). The plan has no rule for this. A possible rule: when a reset announcement is newer than
  the record, say so on the Codex card. Not implemented.
- The plan fixes the limit alert at 80% (LHS-9). The PRD speaks of «정해둔 비율», which suggests a
  setting; there is none yet.

## Verified / not verified

See `docs/verification.md`.
