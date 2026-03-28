import { describe, it, expect } from 'vitest';
import { sanitizeSecrets, sanitizePath, assertPathWithinDir } from '../sanitize.js';

describe('sanitizeSecrets', () => {
  describe('known prefix patterns', () => {
    it('redacts AWS access key IDs', () => {
      expect(sanitizeSecrets('key is AKIAIOSFODNN7EXAMPLE')).toBe('key is [REDACTED]');
    });

    it('redacts AWS secret key assignments', () => {
      expect(
        sanitizeSecrets('aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'),
      ).toBe('[REDACTED]');
    });

    it('redacts GitHub personal access tokens', () => {
      expect(sanitizeSecrets('token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijkl')).toBe(
        'token: [REDACTED]',
      );
    });

    it('redacts GitHub fine-grained PATs', () => {
      expect(sanitizeSecrets('github_pat_ABCDEFGHIJKLMNOPQRSTUV')).toBe('[REDACTED]');
    });

    it('redacts Stripe live keys', () => {
      expect(sanitizeSecrets('sk_live_ABCDEFGHIJKLMNOPQRSTx')).toBe('[REDACTED]');
    });

    it('redacts Stripe test keys', () => {
      expect(sanitizeSecrets('sk_test_ABCDEFGHIJKLMNOPQRSTx')).toBe('[REDACTED]');
    });

    it('redacts Slack bot tokens', () => {
      expect(sanitizeSecrets('xoxb-1234567890-abcdefghij')).toBe('[REDACTED]');
    });

    it('redacts Slack user tokens', () => {
      expect(sanitizeSecrets('xoxp-1234567890-abcdefghij')).toBe('[REDACTED]');
    });

    it('redacts JWTs', () => {
      const jwt =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6Ik.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      expect(sanitizeSecrets(`Authorization: ${jwt}`)).toBe('Authorization: [REDACTED]');
    });

    it('redacts OpenAI keys', () => {
      expect(sanitizeSecrets('sk-proj-ABCDEFGHIJKLMNOPQRSTx')).toBe('[REDACTED]');
    });

    it('redacts Anthropic keys', () => {
      expect(sanitizeSecrets('sk-ant-api03-ABCDEFGHIJKLMNOPQRST')).toBe('[REDACTED]');
    });

    it('redacts Google API keys', () => {
      expect(sanitizeSecrets('AIzaSyB-ABCDEFGHIJKLMNOPQRSTUVWXYZ12345')).toBe('[REDACTED]');
    });

    it('redacts Bearer tokens', () => {
      expect(sanitizeSecrets('Authorization: Bearer eyABCDEFGHIJKLMNOPQRS')).toBe(
        'Authorization: [REDACTED]',
      );
    });

    it('redacts PEM private keys', () => {
      const pem =
        '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----';
      expect(sanitizeSecrets(`key: ${pem}`)).toBe('key: [REDACTED]');
    });

    it('redacts RSA private keys', () => {
      const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIBogIBAAJBAK\n-----END RSA PRIVATE KEY-----';
      expect(sanitizeSecrets(pem)).toBe('[REDACTED]');
    });
  });

  describe('contextual patterns', () => {
    it('redacts api_key assignments', () => {
      expect(sanitizeSecrets('api_key = "my-secret-key-value"')).toBe('api_key = "[REDACTED]"');
    });

    it('redacts password assignments', () => {
      expect(sanitizeSecrets('password: super_secret_123')).toBe('password: [REDACTED]');
    });

    it('redacts token assignments', () => {
      expect(sanitizeSecrets('token=abcdefghijklmnop')).toBe('token=[REDACTED]');
    });

    it('redacts credential assignments', () => {
      expect(sanitizeSecrets("credential = 'long-credential-val'")).toBe(
        "credential = '[REDACTED]'",
      );
    });

    it('redacts secret_key assignments', () => {
      expect(sanitizeSecrets('secret_key: my_long_secret_value')).toBe('secret_key: [REDACTED]');
    });
  });

  describe('edge cases', () => {
    it('returns empty string unchanged', () => {
      expect(sanitizeSecrets('')).toBe('');
    });

    it('preserves normal text without secrets', () => {
      const text = 'Please use pnpm instead of npm for installing dependencies';
      expect(sanitizeSecrets(text)).toBe(text);
    });

    it('handles multiple secrets in one string', () => {
      const text = 'Use AKIAIOSFODNN7EXAMPLE and sk_live_ABCDEFGHIJKLMNOPQRSTx';
      expect(sanitizeSecrets(text)).toBe('Use [REDACTED] and [REDACTED]');
    });

    it('preserves surrounding text when redacting', () => {
      const text = 'Set the key ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijkl in your config';
      expect(sanitizeSecrets(text)).toBe('Set the key [REDACTED] in your config');
    });

    it('does not redact short values in contextual patterns', () => {
      expect(sanitizeSecrets('token = abc')).toBe('token = abc');
    });

    it('does not false-positive on words containing key substrings', () => {
      const text = 'the authentication flow requires a valid session';
      expect(sanitizeSecrets(text)).toBe(text);
    });

    it('redacts database connection strings', () => {
      expect(sanitizeSecrets('postgresql://admin:s3cret@db.host:5432/mydb')).toBe('[REDACTED]');
      expect(sanitizeSecrets('mongodb+srv://user:pass@cluster.mongodb.net/db')).toBe('[REDACTED]');
      expect(sanitizeSecrets('mysql://root:password@localhost/app')).toBe('[REDACTED]');
    });

    it('redacts DATABASE_URL assignments', () => {
      expect(sanitizeSecrets('database_url=postgresql://u:p@host/db')).toBe(
        'database_url=[REDACTED]',
      );
    });

    it('redacts GitLab PATs', () => {
      expect(sanitizeSecrets('glpat-ABCDEFGHIJKLMNOPQRSTx')).toBe('[REDACTED]');
    });
  });
});

describe('sanitizePath', () => {
  it('returns clean path components unchanged', () => {
    expect(sanitizePath('my-skill')).toBe('my-skill');
    expect(sanitizePath('rule_name.mdc')).toBe('rule_name.mdc');
  });

  it('strips directory traversal sequences', () => {
    expect(sanitizePath('../../etc/passwd')).toBe('etc-passwd');
    expect(sanitizePath('../.ssh/keys')).toBe('.ssh-keys');
  });

  it('replaces path separators with dashes', () => {
    expect(sanitizePath('foo/bar')).toBe('foo-bar');
    expect(sanitizePath('foo\\bar')).toBe('foo-bar');
  });

  it('throws on empty result', () => {
    expect(() => sanitizePath('..')).toThrow('Invalid path component');
    expect(() => sanitizePath('/')).toThrow('Invalid path component');
    expect(() => sanitizePath('../..')).toThrow('Invalid path component');
  });
});

describe('assertPathWithinDir', () => {
  it('allows paths within the directory', () => {
    expect(() => assertPathWithinDir('.claude/skills/test/SKILL.md', '/project')).not.toThrow();
    expect(() => assertPathWithinDir('CLAUDE.md', '/project')).not.toThrow();
  });

  it('rejects paths that escape the directory', () => {
    expect(() => assertPathWithinDir('../../etc/passwd', '/project')).toThrow('Path traversal');
    expect(() => assertPathWithinDir('../sibling/file', '/project')).toThrow('Path traversal');
  });
});
