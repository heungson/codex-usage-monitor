# The Claude Code limit record

2026-10-28 · Implemented. Connects FC-F003 (상태 표시줄 연동, issue LHS-2) to FC-F004 (Claude Code 기록
읽기, issue LHS-3). The plan left this hand-off open («로컬 기록의 경로와 저장 형식, 갱신 시각 표현이
정해져 있지 않아요»); it is an internal format between two parts of this app, not something a person
sees, so it was settled here and recorded in `docs/decisions.md`.

## Where

`<data folder>/claude-rate-limits.json`. The data folder is
`~/Library/Application Support/usage-limit-monitor`, or `ULM_HOME` when set.

## What

```json
{
  "version": 1,
  "updatedAt": "2026-10-28T04:12:09.123Z",
  "fiveHour": { "usedPercentage": 23, "resetsAt": 1793163600000 },
  "sevenDay": { "usedPercentage": 61, "resetsAt": 1793600000000 }
}
```

- `updatedAt` is when the hook wrote the record, so when Claude Code last drew its status line.
  The app shows it as «마지막 갱신» and never replaces it with the time it read the file (PR-P004).
- `usedPercentage` and `resetsAt` come from `rate_limits.five_hour` / `rate_limits.seven_day` in the
  status line input (Claude Code 2.1.312). `resetsAt` is stored in epoch milliseconds; the hook
  accepts seconds, milliseconds or an ISO string from Claude Code. A window Claude Code did not send
  is `null`.

## Rules

- An input without usable limits, or one that is not JSON, leaves the record unchanged and shows
  nothing (LHS-2 검증 7, 8).
- Several Claude Code windows write the same record (2026-10-30). Each limit window is decided on its
  own: with a reset time less than 5 minutes from the record's, a lower `usedPercentage` is an old
  value and the record keeps its own; an equal or higher one, or a different reset time (a new
  window), is taken. A window the input does not carry keeps the record's value. If nothing is
  taken the file is not written and `updatedAt` stays; otherwise `updatedAt` is the new time. With
  no record, or one that cannot be read, the input is written as it is. Code:
  `mergeRecord` in `src/shared/claude-record.ts`.
- The hook writes to a temporary file and renames it over the record, so the reader never sees half
  a file. If the record exists and is not writable, the hook does not replace it: it writes
  `claude-hook-error.json` (`{ at, message }`) instead, which the 연동 안내 screen shows (LHS-2 검증 9).
  The next successful write removes it.
- The hook then runs the previous status line command saved in `statusline-integration.json` with the
  same input, so the person's status line looks as before (PR-P017).
