export function quoteForWindows(arg: string): string {
  if (!arg) return '""';
  if (!/[ \t\n\v"]/.test(arg)) return arg;
  return '"' + arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1') + '"';
}
