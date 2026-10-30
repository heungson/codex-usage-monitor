# Decisions

2026-10-28 · In progress: the first version of every PRS issue (LHS-1 to LHS-10) is implemented;
nothing is committed yet. Built from PRS plan «사용량 한도 모니터», published version 1. The plan
has no design stage (the owner chose to build from the wireframe) and no design system, so the
screens follow the wireframe and macOS conventions.

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

| Question                                                                                    | Issue         | Answer                                                                                                                                                     |
| ------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| How often the open popover refreshes, and how often a failed area retries                   | LHS-5         | Every 60 seconds while the popover is open. The local files are still re-read every 30 seconds in the background (LHS-3, LHS-4 say so).                    |
| codex-resets.com retry backoff                                                              | LHS-7, LHS-8  | 10 s, 20 s, 40 s, then stop (3 automatic tries). «다시 시도» starts over.                                                                                  |
| What a history row shows                                                                    | LHS-8         | Local date and time, the type (전체 리셋 / 적립형 리셋), the first line of the announcement, and a link to the original post.                              |
| New-reset notifications depend on a status that is only fetched when the reset screen opens | LHS-7, LHS-10 | Check `/api/v1/status` in the background every 15 minutes for notifications. The reset screen still fetches only when opened and does not poll while open. |
| A remote repository for LHS-1                                                               | LHS-1         | Local only for now: no remote, nothing registered in PRS.                                                                                                  |

Settled here without asking, because no person sees them:

- The record format between the status line hook and the Claude Code reader: `docs/claude-record.md`.
- Codex session files untouched for more than 8 days are ignored. The longest window is 7 days, so
  their limits have reset since; and one old unreadable file would otherwise hold Codex in an error
  state forever.
- Claude Code windows count as the same window for limit alerts while the reset time moves by less
  than 5 minutes, since the sources round it.
- The menu bar shows `CC <highest %> · CX <highest %>`; `–` is no record, `?` a value that is not
  current.

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

## Not decided, for the planner

- After a Codex global reset is announced, the Codex card still shows the last session record, which
  can predate the reset (seen on 2026-10-28: 44% from a record 22 hours old, after a reset announced
  that day). The plan has no rule for this. A possible rule: when a reset announcement is newer than
  the record, say so on the Codex card. Not implemented.
- The plan fixes the limit alert at 80% (LHS-9). The PRD speaks of «정해둔 비율», which suggests a
  setting; there is none yet.

## Verified / not verified

See `docs/verification.md`.
