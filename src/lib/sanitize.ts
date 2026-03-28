import path from 'path';

export function sanitizePath(component: string): string {
  const cleaned = component
    .replace(/\.\./g, '')
    .replace(/[/\\]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!cleaned) {
    throw new Error(`Invalid path component: ${component}`);
  }
  return cleaned;
}

export function assertPathWithinDir(filePath: string, baseDir: string): void {
  const resolved = path.resolve(baseDir, filePath);
  const resolvedBase = path.resolve(baseDir);
  if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
    throw new Error(`Path traversal detected: ${filePath} escapes ${baseDir}`);
  }
}

const KNOWN_PREFIX_PATTERNS: [RegExp, string][] = [
  // Anthropic (before generic sk- pattern)
  [/sk-ant-[A-Za-z0-9_-]{20,}/g, '[REDACTED]'],
  // AWS access key IDs
  [/AKIA[0-9A-Z]{16}/g, '[REDACTED]'],
  // AWS secret keys in assignments
  [/(?:aws)?_?secret_?(?:access)?_?key\s*[:=]\s*['"]?[A-Za-z0-9/+=]{40}['"]?/gi, '[REDACTED]'],
  // GitHub tokens (PAT, OAuth, server, app install, fine-grained)
  [/gh[pousr]_[A-Za-z0-9_]{36,}/g, '[REDACTED]'],
  [/github_pat_[A-Za-z0-9_]{22,}/g, '[REDACTED]'],
  // Stripe keys
  [/[sr]k_(live|test)_[A-Za-z0-9]{20,}/g, '[REDACTED]'],
  // Slack tokens
  [/xox[bpsar]-[A-Za-z0-9-]{10,}/g, '[REDACTED]'],
  // JWTs (3-segment base64url)
  [/eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, '[REDACTED]'],
  // OpenAI keys (after sk-ant- to avoid false match)
  [/sk-[A-Za-z0-9-]{20,}/g, '[REDACTED]'],
  // Google API keys
  [/AIza[A-Za-z0-9_-]{35}/g, '[REDACTED]'],
  // Bearer tokens
  [/[Bb]earer\s+[A-Za-z0-9_\-.]{20,}/g, '[REDACTED]'],
  // PEM private keys
  [/-----BEGIN[A-Z ]+KEY-----[\s\S]+?-----END[A-Z ]+KEY-----/g, '[REDACTED]'],
  // Database connection strings with credentials
  [/(postgresql|mysql|mongodb(\+srv)?|redis|amqp):\/\/[^@\s]+:[^@\s]+@[^\s'"]+/g, '[REDACTED]'],
  // GitLab tokens
  [/glpat-[a-zA-Z0-9_-]{20,}/g, '[REDACTED]'],
];

const SENSITIVE_ASSIGNMENT =
  /(?:api[_-]?key|secret[_-]?key|password|token|credential|auth[_-]?token|private[_-]?key|database[_-]?url|connection[_-]?string)\s*[:=]\s*['"]?([^\s'"]{8,500})['"]?/gi;

export function sanitizeSecrets(text: string): string {
  let result = text;

  for (const [pattern, replacement] of KNOWN_PREFIX_PATTERNS) {
    result = result.replace(pattern, replacement);
  }

  result = result.replace(SENSITIVE_ASSIGNMENT, (match, value: string) =>
    match.replace(value, '[REDACTED]'),
  );

  return result;
}
