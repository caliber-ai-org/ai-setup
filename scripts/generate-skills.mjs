#!/usr/bin/env node
/**
 * Source-of-truth skill generator.
 *
 * Source:  skills/{name}/SKILL.md       (canonical, human-edited)
 * Outputs: .claude/skills/{name}/SKILL.md  (passthrough)
 *          .agents/skills/{name}/SKILL.md  (paths key stripped)
 *          .cursor/skills/{name}/SKILL.md  (paths key stripped)
 *
 * The `paths:` frontmatter key is Claude-specific (path-based skill triggering).
 * .agents and .cursor consumers reject it as unknown, so we strip it on emit.
 *
 * Usage:
 *   node scripts/generate-skills.mjs            # write outputs
 *   node scripts/generate-skills.mjs --check    # CI mode: exit 1 if outputs drift
 *
 * See CONTRIBUTING.md for the workflow. Edits to .claude/.agents/.cursor skills
 * directories will be overwritten on the next run — edit skills/ instead.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = path.join(ROOT, 'skills');
const TARGETS = [
  { dir: path.join(ROOT, '.claude', 'skills'), stripPaths: false, label: '.claude' },
  { dir: path.join(ROOT, '.agents', 'skills'), stripPaths: true, label: '.agents' },
  { dir: path.join(ROOT, '.cursor', 'skills'), stripPaths: true, label: '.cursor' },
];

const CHECK_MODE = process.argv.includes('--check');

/**
 * Split a SKILL.md into [frontmatterRaw, body]. Frontmatter is the block between
 * the first two `---` lines. Returns [null, fullContent] if no frontmatter present.
 */
function splitFrontmatter(content) {
  if (!content.startsWith('---\n')) return [null, content];
  const end = content.indexOf('\n---\n', 4);
  if (end === -1) return [null, content];
  return [content.slice(4, end), content.slice(end + 5)];
}

/**
 * Strip the `paths:` key (and any indented sub-lines) from a YAML frontmatter
 * block. Knows about the minimal YAML shape used by SKILL.md: top-level keys at
 * column 0, nested array items indented with whitespace.
 */
function stripPathsKey(frontmatter) {
  const out = [];
  let inPathsBlock = false;
  for (const line of frontmatter.split('\n')) {
    if (line.startsWith('paths:')) {
      inPathsBlock = true;
      continue;
    }
    if (inPathsBlock) {
      // Continue skipping while inside the indented array, OR until a new
      // top-level key appears (no leading whitespace).
      if (line === '' || /^\s/.test(line)) continue;
      inPathsBlock = false;
    }
    out.push(line);
  }
  return out.join('\n');
}

function renderForTarget(content, stripPaths) {
  if (!stripPaths) return content;
  const [fm, body] = splitFrontmatter(content);
  if (fm === null) return content;
  const stripped = stripPathsKey(fm);
  return `---\n${stripped}\n---\n${body}`;
}

function listSkills() {
  if (!fs.existsSync(SOURCE_DIR)) return [];
  return fs
    .readdirSync(SOURCE_DIR)
    .filter((name) => fs.statSync(path.join(SOURCE_DIR, name)).isDirectory())
    .filter((name) => fs.existsSync(path.join(SOURCE_DIR, name, 'SKILL.md')))
    .sort();
}

function readMaybe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function writeIfChanged(filePath, content) {
  if (readMaybe(filePath) === content) return false;
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content);
  return true;
}

function main() {
  const skills = listSkills();
  if (skills.length === 0) {
    console.error('No skills found in skills/ — nothing to generate.');
    process.exit(0);
  }

  const drift = [];
  let written = 0;

  for (const name of skills) {
    const sourcePath = path.join(SOURCE_DIR, name, 'SKILL.md');
    const source = fs.readFileSync(sourcePath, 'utf-8');

    for (const { dir, stripPaths } of TARGETS) {
      const out = renderForTarget(source, stripPaths);
      const targetPath = path.join(dir, name, 'SKILL.md');

      if (CHECK_MODE) {
        if (readMaybe(targetPath) !== out) {
          drift.push(path.relative(ROOT, targetPath));
        }
      } else if (writeIfChanged(targetPath, out)) {
        written++;
      }
    }
  }

  if (CHECK_MODE) {
    if (drift.length > 0) {
      console.error('Skill outputs are out of sync with skills/ source:');
      for (const f of drift) console.error('  ' + f);
      console.error('\nRun: npm run build:skills');
      process.exit(1);
    }
    console.log(`✓ ${skills.length} skills × ${TARGETS.length} targets in sync`);
  } else if (written > 0) {
    console.log(`Generated ${written} skill files from skills/ → .claude/.agents/.cursor`);
  } else {
    console.log(`✓ All ${skills.length * TARGETS.length} skill outputs already up to date`);
  }
}

main();
