# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |

We only support the latest published version of `@rely-ai/caliber`. Please upgrade before reporting.

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly.

**Do not open a public issue.** Instead, email **security@rely.ai** with:

- Description of the vulnerability
- Steps to reproduce
- Impact assessment (what an attacker could do)
- Your suggested fix, if any

We will acknowledge your report within **48 hours** and aim to release a fix within **7 days** for critical issues.

## Scope

The following are in scope:

- The `@rely-ai/caliber` npm package
- The CLI commands and their behavior
- File handling (backups, config writes, lock files)
- LLM provider credential handling (`~/.caliber/config.json`)

The following are **out of scope**:

- Third-party LLM provider APIs (Anthropic, OpenAI, Vertex AI)
- MCP servers discovered/installed by caliber (report to their maintainers)
- Your own API keys or credentials

## Design Principles

- API keys are stored in `~/.caliber/config.json` with `0600` permissions — never in project files
- No credentials are transmitted to any service other than the configured LLM provider
- Secret scanning and push protection are enabled on this repository
