# 사용량 한도 모니터 (Usage Limit Monitor)

A macOS menu bar app for developers who use both the Claude Code CLI and the Codex CLI. It shows
how much of each tool's usage limit windows (5 hours, 7 days) is used and when each resets, warns
with a macOS notification at 80%, and shows Codex global reset news from
[codex-resets.com](https://codex-resets.com).

It reads only files on this Mac and the codex-resets.com public API. It uses no token and sends
nothing about you anywhere.

- **Claude Code**: Claude Code passes `rate_limits.five_hour` / `rate_limits.seven_day` to its
  status line command. «Claude Code 연동 안내 › 연동 적용» makes this app's hook the status line
  command; the hook records the limits and then runs your previous status line command, so your
  status line looks the same. Values update only while Claude Code runs.
- **Codex**: read from the `rate_limits` events in `~/.codex/sessions/**/*.jsonl`.
- **Codex global resets**: `GET /api/v1/status` and `GET /api/v1/resets` on codex-resets.com.
  Data from codex-resets.com. The usage screen shows the next scheduled reset; clicking that area
  opens the full status and history.
- **창 항상 위에 표시**: the switch right of every screen's title. On, the popover stays open above
  other windows and can be dragged by its top bar; the choice is kept in
  `~/Library/Application Support/usage-limit-monitor/window-settings.json`.

Planned in PRS (plan «사용량 한도 모니터», version 3). Decisions: `docs/decisions.md`.

## Requirements

- macOS, Node.js 24 or newer, npm 11 or newer.

## Commands

```sh
npm install          # also downloads the Electron binary (install-electron)
npm start            # builds and runs the app; it appears in the menu bar
npm run build        # bundles into dist/
npm run typecheck
npm run lint
npm run format:check
npm test             # unit tests
npm run test:e2e     # drives the built app with Playwright; captures in tmp/e2e-shots/ and tmp/screens/
```

`npm start` creates a locally signed runtime at `tmp/runtime/Usage Limit Monitor.app` and runs the
code from this folder. It reuses the runtime until Electron changes or its signature fails verification.
Newly applied status line integrations point at that runtime and `dist/hook/statusline-hook.js`, so
keep this folder (including `tmp/runtime/`) in place while the integration is applied. Existing
integrations keep their previous runtime path. This is a local development bundle, not a notarized
distribution build.

## macOS notifications

Run with `npm start`, rather than `npx electron .`. Electron 42 and newer require a signed macOS
app bundle for notifications. The npm Electron binary's linker signature does not bind its bundle
identity, which can cause `UNErrorDomain error 1` before an entry appears in Notification settings.
`npm start` signs a separate copy with a stable bundle identifier; it leaves the npm binary alone.

After the first notification request, look for **Usage Limit Monitor** in **System Settings ›
Notifications** and allow notifications if macOS asks. An alert already attempted for the current
usage window is not replayed; alerts resume for subsequent windows, as usual (FC-F014).

## Undoing the Claude Code integration

The app saves your previous status line in
`~/Library/Application Support/usage-limit-monitor/statusline-integration.json`
(`previousStatusLine`) and a copy of your settings file next to it
(`claude-settings.backup.json`). To undo, put `previousStatusLine` back as `statusLine` in
`~/.claude/settings.json`, or remove `statusLine` if it was `null`.

## Environment variables

Used by the checks to point the app at temporary folders. Normal use needs none.

| Variable                    | Meaning                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `ULM_HOME`                  | App data folder (default `~/Library/Application Support/usage-limit-monitor`)                          |
| `ULM_CLAUDE_SETTINGS`       | Claude Code settings file (default `~/.claude/settings.json`)                                          |
| `ULM_CODEX_SESSIONS`        | Codex sessions folder (default `~/.codex/sessions`)                                                    |
| `ULM_RESETS_BASE_URL`       | Reset API origin (default `https://codex-resets.com`)                                                  |
| `ULM_SHOW_WINDOW=1`         | Show the popover as an ordinary window at start                                                        |
| `ULM_READ_INTERVAL_MS`      | Local re-read interval (default 30000)                                                                 |
| `ULM_READ_DELAY_MS`         | Hold every local read this long (shows the loading state)                                              |
| `ULM_RESET_CHECK_MS`        | Background reset check interval (default 900000)                                                       |
| `ULM_RESET_RETRY_MS`        | Reset API retry delays, comma separated (default `10000,20000,40000`)                                  |
| `ULM_FAKE_NOTIFY`           | `shown`, `denied` or `failed`: log notifications to `<data>/notifications.log` instead of showing them |
| `ULM_FAKE_NOTIFY_FILE`      | A file whose content overrides `ULM_FAKE_NOTIFY` on every notification                                 |
| `ULM_NOTIFICATION_APP_NAME` | Notification settings display name; `npm start` sets it to `Usage Limit Monitor`                       |
| `ULM_SHOTS_DIR`             | Folder for the captures of `e2e/look.spec.ts` (default `tmp/screens`, e.g. `tmp/screens-before`)       |

## Layout

```
src/main/       Electron main process: collectors, readers, integration, alerts, reset API
src/hook/       The status line hook Claude Code runs
src/preload/    The bridge the popover page uses
src/renderer/   The popover page: 사용량 현황, Claude Code 연동 안내, Codex 전체 리셋; styles.css holds the look's tokens
src/shared/     Types, the Claude record format, Korean time wording
test/           Unit tests (Vitest)
e2e/            App checks (Playwright + Electron), a fake codex-resets.com, light/dark captures (look.spec.ts)
scripts/        Build and icon scripts
```
