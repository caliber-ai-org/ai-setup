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

/**
 * Split a SKILL.md into [frontmatterRaw, body]. Frontmatter is the block between
 * the opening `---` and the next `---` line. Returns [null, fullContent] if no
 * frontmatter present.
 *
 * Robust against:
 * - CRLF line endings (Windows contributors): normalized to LF before parsing.
 * - Missing trailing newline before/after the closing fence: regex anchors on
 *   `---` followed by either `\n` or EOF.
 */
export function splitFrontmatter(content) {
  // CRLF → LF so a Windows-saved SKILL.md parses identically to a Unix one.
  // Without this, indexOf('---\n') misses everything after a CR and the whole
  // file is treated as bodyless — the strip-paths step is never invoked.
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!normalized.startsWith('---\n')) return [null, normalized];
  // Closing fence: `---` on its own line, followed by either a newline or EOF.
  // Editors that drop the trailing newline (or open the file at EOF) used to
  // skip this branch entirely — same broken outcome as the CRLF case.
  const match = normalized.slice(4).match(/^---(?:\n|$)/m);
  if (!match) return [null, normalized];
  const fenceStart = 4 + (match.index ?? 0);
  const fenceEnd = fenceStart + match[0].length;
  return [normalized.slice(4, fenceStart - 1), normalized.slice(fenceEnd)];
}

/**
 * Strip the `paths:` key (and any indented sub-lines) from a YAML frontmatter
 * block. Knows about the minimal YAML shape used by SKILL.md: top-level keys at
 * column 0, nested array items indented with whitespace.
 */
export function stripPathsKey(frontmatter) {
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

export function renderForTarget(content, stripPaths) {
  const [fm, body] = splitFrontmatter(content);
  // No frontmatter at all → passthrough. (Don't try to strip — there's no fence.)
  if (fm === null) return content;
  if (!stripPaths) {
    // Even for passthrough, return the normalized form so a CRLF-saved source
    // doesn't show as drift on the next --check run.
    return `---\n${fm}\n---\n${body}`;
  }
  const stripped = stripPathsKey(fm);
  return `---\n${stripped}\n---\n${body}`;
}

export function listSkills(sourceDir = SOURCE_DIR) {
  if (!fs.existsSync(sourceDir)) return [];
  return fs
    .readdirSync(sourceDir)
    .filter((name) => fs.statSync(path.join(sourceDir, name)).isDirectory())
    .filter((name) => fs.existsSync(path.join(sourceDir, name, 'SKILL.md')))
    .sort();
}

function readMaybe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Line-ending-agnostic read for --check mode only.
 *
 * On Windows with `core.autocrlf=true` (the default on Windows GitHub runners),
 * git checkout converts LF in the index to CRLF in the working tree. The
 * generator always writes LF; without normalization, `--check` would report
 * every file as drift even when content is semantically equal. .gitattributes
 * pins LF for SKILL.md too, but this is defensive in case a contributor's repo
 * config doesn't honor it. Write mode uses readMaybe() directly so it actively
 * normalizes any CRLF that snuck in.
 */
function readNormalized(filePath) {
  const raw = readMaybe(filePath);
  return raw === null ? null : raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function writeIfChanged(filePath, content) {
  // Strict byte-exact compare so write mode rewrites any CRLF on disk back
  // to the canonical LF form the generator emits.
  if (readMaybe(filePath) === content) return false;
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content);
  return true;
}

/**
 * Detect orphan skill directories in each target (skills that exist in a
 * derived location but NOT in the source). Returns array of relative paths
 * for reporting. In write mode the caller deletes them; in check mode the
 * caller treats them as drift.
 */
export function findOrphans(skillNames, targets = TARGETS) {
  const sourceSet = new Set(skillNames);
  const orphans = [];
  for (const { dir } of targets) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (!fs.statSync(full).isDirectory()) continue;
      if (!sourceSet.has(name)) orphans.push(full);
    }
  }
  return orphans;
}

function removeOrphans(orphans) {
  for (const full of orphans) {
    fs.rmSync(full, { recursive: true, force: true });
  }
}

function main(argv = process.argv) {
  const checkMode = argv.includes('--check');

  const skills = listSkills();
  if (skills.length === 0) {
    // In CI, "no skills found" is a misconfiguration (likely a moved/deleted
    // source dir) and should fail loudly rather than silently passing.
    if (checkMode) {
      console.error('No skills found in skills/ — source directory missing or empty.');
      return 1;
    }
    console.error('No skills found in skills/ — nothing to generate.');
    return 0;
  }

  const drift = [];
  let written = 0;

  for (const name of skills) {
    const sourcePath = path.join(SOURCE_DIR, name, 'SKILL.md');
    const source = fs.readFileSync(sourcePath, 'utf-8');

    for (const { dir, stripPaths } of TARGETS) {
      const out = renderForTarget(source, stripPaths);
      const targetPath = path.join(dir, name, 'SKILL.md');

      if (checkMode) {
        // Use the line-ending-agnostic read so Windows autocrlf checkouts
        // don't trigger false drift.
        if (readNormalized(targetPath) !== out) {
          drift.push(path.relative(ROOT, targetPath));
        }
      } else if (writeIfChanged(targetPath, out)) {
        written++;
      }
    }
  }

  // Orphan handling: a skill removed from source/ should not linger in
  // .claude/.agents/.cursor. In write mode we delete; in check mode we
  // report — both prevent stale artifacts from outliving their source.
  const orphans = findOrphans(skills);

  if (checkMode) {
    for (const o of orphans) drift.push(path.relative(ROOT, o));
    if (drift.length > 0) {
      console.error('Skill outputs are out of sync with skills/ source:');
      for (const f of drift) console.error('  ' + f);
      console.error('\nRun: npm run build:skills');
      return 1;
    }
    console.log(`✓ ${skills.length} skills × ${TARGETS.length} targets in sync`);
    return 0;
  }

  if (orphans.length > 0) {
    removeOrphans(orphans);
    console.log(
      `Removed ${orphans.length} orphan skill director${orphans.length === 1 ? 'y' : 'ies'}`,
    );
  }
  if (written > 0) {
    console.log(`Generated ${written} skill files from skills/ → .claude/.agents/.cursor`);
  } else if (orphans.length === 0) {
    console.log(`✓ All ${skills.length * TARGETS.length} skill outputs already up to date`);
  }
  return 0;
}

// Only run main() when invoked directly (`node scripts/generate-skills.mjs`).
// When imported from a unit test, the helpers above are usable in isolation.
const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedDirectly) {
  process.exit(main());
}
