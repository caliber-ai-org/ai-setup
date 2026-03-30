import fs from 'fs';
import path from 'path';
import { appendPreCommitBlock, appendLearningsBlock } from '../pre-commit-block.js';
import { buildSkillContent } from '../../lib/builtin-skills.js';

interface OpencodeConfig {
  agentsMd: string;
  skills?: Array<{ name: string; description: string; content: string }>;
}

export function writeOpencodeConfig(
  config: OpencodeConfig,
  agentsMdAlreadyWritten = false,
): string[] {
  const written: string[] = [];

  if (!agentsMdAlreadyWritten) {
    fs.writeFileSync(
      'AGENTS.md',
      appendLearningsBlock(appendPreCommitBlock(config.agentsMd, 'codex')),
    );
    written.push('AGENTS.md');
  }

  if (config.skills?.length) {
    for (const skill of config.skills) {
      const skillDir = path.join('.opencode', 'skills', skill.name);
      if (!fs.existsSync(skillDir)) fs.mkdirSync(skillDir, { recursive: true });
      const skillPath = path.join(skillDir, 'SKILL.md');
      fs.writeFileSync(skillPath, buildSkillContent(skill));
      written.push(skillPath);
    }
  }

  return written;
}
