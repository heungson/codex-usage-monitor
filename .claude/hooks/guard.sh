#!/bin/sh
# PreToolUse guard: blocks commands and writes that are hard to undo.
# Exit 2 blocks the tool call and shows stderr to the agent. Anything this
# script cannot read or understand is blocked, never allowed.

block() {
  echo "guard: $1" >&2
  exit 2
}

command -v jq >/dev/null 2>&1 || block "jq is not installed, so the request cannot be checked"

input=$(cat) || block "could not read the hook input"
[ -n "$input" ] || block "empty hook input"

tool=$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null) || block "hook input is not JSON"
[ -n "$tool" ] || block "hook input has no tool_name"

case "$tool" in
  Bash)
    cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null) || block "could not read the command"

    # A force push without a lease overwrites history other people may have pulled.
    if printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+push' &&
       printf '%s' "$cmd" | grep -Eq '(^|[[:space:]])(--force|-f)([[:space:]]|$)' &&
       ! printf '%s' "$cmd" | grep -q -- '--force-with-lease'; then
      block "force push without --force-with-lease"
    fi

    # Recursive forced removal is allowed only on build output folders.
    if printf '%s' "$cmd" | grep -Eq 'rm[[:space:]]+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r|-r[[:space:]]+-f|-f[[:space:]]+-r)'; then
      targets=$(printf '%s' "$cmd" | sed -E 's/.*rm[[:space:]]+(-[a-zA-Z]+[[:space:]]+)+//; s/[;&|].*//')
      [ -n "$targets" ] || block "rm -rf with no target"
      for target in $targets; do
        case "$target" in
          node_modules | node_modules/* | ./node_modules | ./node_modules/*) ;;
          dist | dist/* | ./dist | ./dist/*) ;;
          coverage | coverage/* | ./coverage | ./coverage/*) ;;
          *) block "rm -rf outside node_modules, dist or coverage: $target" ;;
        esac
      done
    fi

    # Writing a .env file through a shell redirect (.env.example is allowed).
    if printf '%s' "$cmd" | grep -Eq '>>?[[:space:]]*[^[:space:]]*\.env(\.[A-Za-z0-9_-]+)?([[:space:]]|$)' &&
       ! printf '%s' "$cmd" | grep -Eq '>>?[[:space:]]*[^[:space:]]*\.env\.example([[:space:]]|$)'; then
      block "writing a .env file"
    fi
    ;;
  Write | Edit | MultiEdit | NotebookEdit)
    path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' 2>/dev/null) || block "could not read the file path"
    [ -n "$path" ] || block "no file path in the request"
    name=$(basename "$path")
    case "$name" in
      .env.example) ;;
      .env | .env.*) block "writing $name" ;;
    esac
    ;;
esac

exit 0
