import fs from 'fs';
import chalk from 'chalk';
import { BUILTIN_SKILLS, buildSkillContent } from '../lib/builtin-skills.js';
import { detectPlatforms } from '../scanner/index.js';

const PLATFORM_SKILL_DIRS: Record<string, string> = {
  claude: '.claude/skills',
  cursor: '.cursor/skills',
  codex: '.agents/skills',
};

export async function bootstrapCommand(): Promise<void> {
  const platforms = detectPlatforms();
  const detected: string[] = [];
  if (platforms.claude) detected.push('claude');
  if (platforms.cursor) detected.push('cursor');
  if (platforms.codex) detected.push('codex');

  // If no platforms detected, default to claude (most common)
  if (detected.length === 0) detected.push('claude');

  const written: string[] = [];

  for (const platform of detected) {
    const skillsDir = PLATFORM_SKILL_DIRS[platform];
    if (!skillsDir) continue;

    for (const skill of BUILTIN_SKILLS) {
      const skillDir = `${skillsDir}/${skill.name}`;
      const skillPath = `${skillDir}/SKILL.md`;

      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(skillPath, buildSkillContent(skill));
      written.push(skillPath);
    }
  }

  if (written.length === 0) {
    console.log(chalk.yellow('No skills were written.'));
    return;
  }

  console.log(chalk.bold.green('\n  Caliber skills installed!\n'));

  for (const file of written) {
    console.log(`  ${chalk.green('✓')} ${file}`);
  }

  console.log(chalk.dim('\n  Your agent can now run /setup-caliber to complete the setup.'));
  console.log(chalk.dim('  Just tell your agent: "Run /setup-caliber"\n'));
}
