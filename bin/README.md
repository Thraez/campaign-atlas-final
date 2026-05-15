# bin/ — double-clickable launchers

Each `.cmd` in this folder runs one project command from the repo root, no matter
where you launch it from. Just double-click in Explorer or run by absolute path
from any shell. The window stays open after the command finishes so you can read
output and errors before it closes.

See [`../COMMANDS.md`](../COMMANDS.md) for what each launcher does.

## How they work

Every launcher uses `pushd "%~dp0.."` to change to the project root (the parent
of `bin/`), runs the command, then restores your previous directory. This means
the launchers are portable — clone the repo anywhere and they keep working.

## Pinning to Desktop or taskbar

- **Desktop shortcut**: right-click a `.cmd` → *Send to* → *Desktop (create shortcut)*.
- **Taskbar**: right-click a `.cmd` → *Create shortcut*, then right-click the
  shortcut → *Properties* → prefix the *Target* field with `cmd /c ` (Windows
  refuses to pin raw `.cmd` files to the taskbar but is happy to pin a shortcut
  that wraps one).
- **Start menu**: drop a shortcut into `%APPDATA%\Microsoft\Windows\Start Menu\Programs\`.

## Adding a new launcher

Copy any existing `.cmd`, change the `call npm run <name>` line, and add a row to
`COMMANDS.md` so the doc and the folder stay in sync.
