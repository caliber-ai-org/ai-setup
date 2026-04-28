export function quoteForWindows(arg: string): string {
  if (!arg) return '""';
  if (!/[ \t\n\v"]/.test(arg)) return arg;
  return '"' + arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1') + '"';
}

/**
 * Convert a filesystem path so it survives bash quote-removal.
 *
 * Bash on Windows (Git Bash / MSYS / WSL) interprets `\X` in a quoted string as
 * "literal X" — so a Windows path like `C:\Users\foo\caliber.cmd` becomes
 * `C:Usersfoocaliber.cmd` after quote-removal. Replacing all backslashes with
 * forward slashes (`C:/Users/foo/caliber.cmd`) sidesteps this: Git Bash and
 * Node both accept the form, the drive-letter prefix survives, and there's no
 * effect on POSIX (no backslashes to convert).
 *
 * Use this any time you embed a path into a string that will be eval'd by
 * `/bin/sh`-family shells — git hooks, hook command scripts, Claude Code hook
 * commands, etc. Plain `child_process.spawn(file, args)` does NOT need it.
 */
export function bashPath(p: string): string {
  return p.replace(/\\/g, '/');
}
