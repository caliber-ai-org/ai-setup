import type { Fingerprint } from '../fingerprint/index.js';
import { getProvider, llmJsonCall, TRANSIENT_ERRORS } from '../llm/index.js';
import { getFastModel, getMaxPromptTokens } from '../llm/config.js';
import { estimateTokens } from '../llm/utils.js';
import {
  CORE_GENERATION_PROMPT,
  GENERATION_SYSTEM_PROMPT,
  SKILL_GENERATION_PROMPT,
} from './prompts.js';
import { extractAllDeps } from '../utils/dependencies.js';
import { formatSourcesForPrompt } from '../fingerprint/sources.js';

type TargetAgent = ('claude' | 'cursor' | 'codex' | 'opencode' | 'github-copilot')[];

interface GenerateCallbacks {
  onStatus: (message: string) => void;
  onComplete: (setup: Record<string, unknown>, explanation?: string) => void;
  onError: (error: string) => void;
  onContent?: (text: string) => void;
}

interface SkillTopic {
  name: string;
  description: string;
}

interface GeneratedSkill {
  name: string;
  description: string;
  content: string;
  paths?: string[];
}

const CORE_MAX_TOKENS = 16000;
const GENERATION_MAX_TOKENS = 64000;
const MODEL_MAX_OUTPUT_TOKENS = 128000;
const MAX_RETRIES = 5;

export const DEFAULT_INACTIVITY_TIMEOUT_MS = 120_000;
const DEFAULT_TOTAL_TIMEOUT_MS = 600_000;

export function parseEnvTimeout(envVar: string, defaultMs: number, minMs = 5000): number {
  const val = process.env[envVar];
  if (!val) return defaultMs;
  const parsed = parseInt(val, 10);
  if (!Number.isFinite(parsed) || parsed < minMs) return defaultMs;
  return parsed;
}

export function buildDiagnostic(
  stopReason: string | undefined,
  raw: string | undefined,
  charsReceived: number,
): string {
  if (stopReason === 'timeout_inactivity') {
    const timeoutSec = Math.round(
      parseEnvTimeout('CALIBER_STREAM_INACTIVITY_TIMEOUT_MS', DEFAULT_INACTIVITY_TIMEOUT_MS) / 1000,
    );
    if (charsReceived === 0) {
      return `Model produced no output for ${timeoutSec}s. Check your API key and model name, or increase timeout with CALIBER_STREAM_INACTIVITY_TIMEOUT_MS.`;
    }
    return `Model stopped responding for ${timeoutSec}s after producing ${charsReceived} chars. The model may be stuck. Try a different model or increase timeout with CALIBER_STREAM_INACTIVITY_TIMEOUT_MS.`;
  }

  if (stopReason === 'timeout_total') {
    const timeoutSec = Math.round(
      parseEnvTimeout('CALIBER_GENERATION_TIMEOUT_MS', DEFAULT_TOTAL_TIMEOUT_MS) / 1000,
    );
    return `Generation exceeded ${timeoutSec}s total time limit. Try a different model or increase timeout with CALIBER_GENERATION_TIMEOUT_MS.`;
  }

  if (!raw || raw.trim().length === 0) {
    return 'Model produced no output. Check your API key and model name.';
  }

  return `Model responded but output was not valid JSON. First 200 chars:\n${raw.slice(0, 200)}`;
}

function isTransientError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return TRANSIENT_ERRORS.some((e) => msg.includes(e.toLowerCase()));
}

export interface FailingCheckFix {
  action: string;
  data: Record<string, unknown>;
  instruction: string;
}

export interface FailingCheck {
  name: string;
  suggestion?: string;
  fix?: FailingCheckFix;
}

export interface PassingCheck {
  name: string;
}

export async function generateSetup(
  fingerprint: Fingerprint,
  targetAgent: TargetAgent,
  prompt?: string,
  callbacks?: GenerateCallbacks,
  failingChecks?: FailingCheck[],
  currentScore?: number,
  passingChecks?: PassingCheck[],
  options?: { skipSkills?: boolean; forceTargetedFix?: boolean },
): Promise<{
  setup: Record<string, unknown> | null;
  explanation?: string;
  raw?: string;
  stopReason?: string;
}> {
  const isTargetedFix =
    (failingChecks &&
      failingChecks.length > 0 &&
      currentScore !== undefined &&
      currentScore >= 95) ||
    options?.forceTargetedFix;

  // Targeted fix mode uses the old monolithic prompt (it needs full skill content for minimal edits)
  if (isTargetedFix) {
    return generateMonolithic(
      fingerprint,
      targetAgent,
      prompt,
      callbacks,
      failingChecks,
      currentScore,
      passingChecks,
    );
  }

  // Phase 1: Generate core docs (CLAUDE.md, AGENTS.md, cursor rules, skill topics)
  const coreResult = await generateCore(
    fingerprint,
    targetAgent,
    prompt,
    callbacks,
    failingChecks,
    currentScore,
    passingChecks,
  );

  if (!coreResult.setup) {
    return coreResult;
  }

  if (options?.skipSkills) {
    return coreResult;
  }

  // Phase 2: Generate skills in parallel using fast model
  const setup = coreResult.setup;
  const skillTopics = collectSkillTopics(setup, targetAgent, fingerprint);

  if (skillTopics.length === 0) {
    return coreResult;
  }

  if (callbacks) callbacks.onStatus(`Generating ${skillTopics.length} skills in parallel...`);

  const allDeps = extractAllDeps(process.cwd());
  const skillContext = buildSkillContext(fingerprint, setup, allDeps);
  const fastModel = getFastModel();

  const skillResults = await Promise.allSettled(
    skillTopics.map(({ platform, topic }) =>
      generateSkill(skillContext, topic, fastModel).then((skill) => ({ platform, skill })),
    ),
  );

  const { failed: failedCount } = mergeSkillResults(skillResults, setup);
  if (failedCount > 0 && callbacks) {
    callbacks.onStatus(`${failedCount} skill${failedCount === 1 ? '' : 's'} failed to generate`);
  }

  return coreResult;
}

function mergeSkillResults(
  results: PromiseSettledResult<{ platform: string; skill: GeneratedSkill }>[],
  setup: Record<string, unknown>,
): { succeeded: number; failed: number } {
  let succeeded = 0;
  let failed = 0;

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { platform, skill } = result.value;
      const platformObj = (setup[platform] ?? {}) as Record<string, unknown>;
      const skills = (platformObj.skills ?? []) as GeneratedSkill[];
      skills.push(skill);
      platformObj.skills = skills;
      setup[platform] = platformObj;

      const skillPath =
        platform === 'codex'
          ? `.agents/skills/${skill.name}/SKILL.md`
          : platform === 'opencode'
            ? `.opencode/skills/${skill.name}/SKILL.md`
            : `.${platform}/skills/${skill.name}/SKILL.md`;
      const descriptions = (setup.fileDescriptions ?? {}) as Record<string, string>;
      descriptions[skillPath] = skill.description.slice(0, 80);
      setup.fileDescriptions = descriptions;
      succeeded++;
    } else {
      failed++;
    }
  }

  return { succeeded, failed };
}

const MAX_SKILL_TOPICS = 5;

function collectSkillTopics(
  setup: Record<string, unknown>,
  targetAgent: TargetAgent,
  fingerprint: Fingerprint,
): Array<{ platform: string; topic: SkillTopic }> {
  const topics: Array<{ platform: string; topic: SkillTopic }> = [];

  for (const platform of ['claude', 'codex', 'opencode', 'cursor'] as const) {
    if (!targetAgent.includes(platform)) continue;
    const platformObj = setup[platform] as Record<string, unknown> | undefined;
    const skillTopics = platformObj?.skillTopics as SkillTopic[] | undefined;

    if (Array.isArray(skillTopics) && skillTopics.length > 0) {
      for (const topic of skillTopics) {
        topics.push({ platform, topic });
      }
    } else {
      const defaults = getDefaultSkillTopics(fingerprint);
      for (const topic of defaults) {
        topics.push({ platform, topic });
      }
    }

    // Clean up skillTopics from the setup (not part of final schema)
    if (platformObj) {
      delete platformObj.skillTopics;
    }
  }

  return topics.slice(0, MAX_SKILL_TOPICS);
}

function getDefaultSkillTopics(fingerprint: Fingerprint): SkillTopic[] {
  const topics: SkillTopic[] = [
    {
      name: 'development-workflow',
      description:
        'Development setup and common workflows. Use when starting development, running the project, or setting up the environment.',
    },
    {
      name: 'testing-guide',
      description:
        'Testing patterns and commands. Use when writing tests, running test suites, or debugging test failures.',
    },
  ];

  if (fingerprint.frameworks.length > 0) {
    topics.push({
      name: `${fingerprint.frameworks[0].toLowerCase().replace(/[^a-z0-9]/g, '-')}-patterns`,
      description: `${fingerprint.frameworks[0]} conventions and patterns. Use when working with ${fingerprint.frameworks[0]} code.`,
    });
  } else {
    topics.push({
      name: 'code-conventions',
      description:
        'Code style, patterns, and project conventions. Use when reviewing code or making architectural decisions.',
    });
  }

  return topics;
}

function buildSkillContext(
  fingerprint: Fingerprint,
  setup: Record<string, unknown>,
  allDeps: string[],
): string {
  const parts: string[] = [];

  if (fingerprint.packageName) parts.push(`Project: ${fingerprint.packageName}`);
  if (fingerprint.languages.length > 0)
    parts.push(`Languages: ${fingerprint.languages.join(', ')}`);
  if (fingerprint.frameworks.length > 0)
    parts.push(`Frameworks: ${fingerprint.frameworks.join(', ')}`);

  // Include the generated CLAUDE.md so skills are consistent
  const claude = setup.claude as Record<string, unknown> | undefined;
  const claudeMd = claude?.claudeMd as string | undefined;
  if (claudeMd) {
    parts.push(`\nProject CLAUDE.md (for context):\n${claudeMd.slice(0, 3000)}`);
  }

  // Include key file paths
  if (fingerprint.fileTree.length > 0) {
    parts.push(`\nKey files:\n${fingerprint.fileTree.slice(0, 50).join('\n')}`);
  }

  if (allDeps.length > 0) {
    parts.push(`\nDependencies: ${allDeps.join(', ')}`);
  }

  if (fingerprint.sources?.length) {
    parts.push('\nRelated Sources:');
    for (const s of fingerprint.sources) {
      parts.push(`- ${s.name} (${s.role}): ${s.description || 'related project'}`);
    }
  }

  return parts.join('\n');
}

async function generateSkill(
  context: string,
  topic: SkillTopic,
  model?: string,
): Promise<GeneratedSkill> {
  const prompt = `PROJECT CONTEXT:\n${context}\n\nSKILL TO GENERATE:\nName: ${topic.name}\nDescription: ${topic.description}\n\nGenerate the skill content following the instructions in the system prompt.`;

  const result = await llmJsonCall<GeneratedSkill>({
    system: SKILL_GENERATION_PROMPT,
    prompt,
    maxTokens: 4000,
    ...(model ? { model } : {}),
  });

  const content = result.content?.trim();
  if (!content) {
    throw new Error(`Empty skill content for ${topic.name}`);
  }

  return {
    name: result.name || topic.name,
    description: result.description || topic.description,
    content,
    ...(result.paths?.length ? { paths: result.paths } : {}),
  };
}

type GenerationResult = {
  setup: Record<string, unknown> | null;
  explanation?: string;
  raw?: string;
  stopReason?: string;
};

interface StreamGenerationConfig {
  systemPrompt: string;
  userMessage: string;
  baseMaxTokens: number;
  tokenIncrement: number;
  maxTokensCap: number;
  callbacks?: GenerateCallbacks;
}

async function streamGeneration(config: StreamGenerationConfig): Promise<GenerationResult> {
  const provider = getProvider();
  let attempt = 0;
  const inactivityTimeoutMs = parseEnvTimeout(
    'CALIBER_STREAM_INACTIVITY_TIMEOUT_MS',
    DEFAULT_INACTIVITY_TIMEOUT_MS,
  );
  const totalTimeoutMs = parseEnvTimeout('CALIBER_GENERATION_TIMEOUT_MS', DEFAULT_TOTAL_TIMEOUT_MS);

  // Wall-clock cap across all retry attempts
  let totalTimedOut = false;
  let totalResolve: ((result: GenerationResult) => void) | null = null;
  const totalTimer = setTimeout(() => {
    totalTimedOut = true;
    if (config.callbacks) config.callbacks.onError(buildDiagnostic('timeout_total', '', 0));
    if (totalResolve) {
      totalResolve({ setup: null, raw: '', stopReason: 'timeout_total' });
      totalResolve = null;
    }
  }, totalTimeoutMs);

  const attemptGeneration = async (): Promise<GenerationResult> => {
    if (totalTimedOut) {
      return { setup: null, raw: '', stopReason: 'timeout_total' };
    }

    attempt++;

    const maxTokensForAttempt = Math.min(
      config.baseMaxTokens + attempt * config.tokenIncrement,
      config.maxTokensCap,
    );

    return new Promise((resolve) => {
      totalResolve = resolve;
      let preJsonBuffer = '';
      let jsonContent = '';
      let inJson = false;
      let sentStatuses = 0;
      let stopReason: string | null = null;
      let charsReceived = 0;
      let settled = false;

      let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

      function clearInactivityTimer() {
        if (inactivityTimer) {
          clearTimeout(inactivityTimer);
          inactivityTimer = null;
        }
      }

      function resetInactivityTimer() {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
          if (settled) return;
          settled = true;
          clearInactivityTimer();
          const raw = preJsonBuffer + jsonContent;
          if (config.callbacks)
            config.callbacks.onError(buildDiagnostic('timeout_inactivity', raw, charsReceived));
          resolve({ setup: null, raw, stopReason: 'timeout_inactivity' });
        }, inactivityTimeoutMs);
      }

      resetInactivityTimer();

      provider
        .stream(
          {
            system: config.systemPrompt,
            prompt: config.userMessage,
            maxTokens: maxTokensForAttempt,
          },
          {
            onText: (text) => {
              if (settled || totalTimedOut) return;
              charsReceived += text.length;
              resetInactivityTimer();

              if (!inJson) {
                preJsonBuffer += text;
                const lines = preJsonBuffer.split('\n');
                const completedLines = lines.slice(0, -1);
                for (let i = sentStatuses; i < completedLines.length; i++) {
                  const trimmed = completedLines[i].trim();
                  if (trimmed.startsWith('STATUS:')) {
                    const status = trimmed.slice(7).trim();
                    if (status && config.callbacks) config.callbacks.onStatus(status);
                  } else if (trimmed && config.callbacks?.onContent) {
                    config.callbacks.onContent(trimmed);
                  }
                }
                sentStatuses = completedLines.length;

                const jsonStartMatch = preJsonBuffer.match(
                  /(?:^|\n)\s*(?:```json\s*\n\s*)?\{(?=\s*")/,
                );
                if (jsonStartMatch) {
                  const matchIndex = preJsonBuffer.indexOf('{', jsonStartMatch.index!);
                  inJson = true;
                  jsonContent = preJsonBuffer.slice(matchIndex);
                }
              } else {
                jsonContent += text;
              }
            },
            onEnd: (meta) => {
              clearInactivityTimer();
              if (settled || totalTimedOut) return;
              settled = true;

              stopReason = meta?.stopReason ?? null;
              let setup: Record<string, unknown> | null = null;
              let jsonToParse = (jsonContent || preJsonBuffer).replace(/```\s*$/g, '').trim();

              if (!jsonContent && preJsonBuffer) {
                const fallbackMatch = preJsonBuffer.match(
                  /(?:^|\n)\s*(?:```json\s*\n\s*)?\{(?=\s*")/,
                );
                if (fallbackMatch) {
                  const matchIndex = preJsonBuffer.indexOf('{', fallbackMatch.index!);
                  jsonToParse = preJsonBuffer
                    .slice(matchIndex)
                    .replace(/```\s*$/g, '')
                    .trim();
                }
              }

              try {
                setup = JSON.parse(jsonToParse);
              } catch {}

              if (!setup && stopReason === 'max_tokens' && attempt < MAX_RETRIES) {
                if (config.callbacks)
                  config.callbacks.onStatus(
                    'Output was truncated, retrying with higher token limit...',
                  );
                setTimeout(() => attemptGeneration().then(resolve), 1000);
                return;
              }

              let explanation: string | undefined;
              const explainMatch = preJsonBuffer.match(/EXPLAIN:\s*\n([\s\S]*?)(?=\n\s*(`{3}|\{))/);
              if (explainMatch) {
                explanation = explainMatch[1].trim();
              }

              if (setup) {
                if (config.callbacks) config.callbacks.onComplete(setup, explanation);
                resolve({ setup, explanation, stopReason: stopReason ?? undefined });
              } else {
                resolve({
                  setup: null,
                  explanation,
                  raw: preJsonBuffer,
                  stopReason: stopReason ?? undefined,
                });
              }
            },
            onError: (error) => {
              clearInactivityTimer();
              if (settled || totalTimedOut) return;

              if (isTransientError(error) && attempt < MAX_RETRIES) {
                settled = true;
                if (config.callbacks)
                  config.callbacks.onStatus('Connection interrupted, retrying...');
                setTimeout(() => attemptGeneration().then(resolve), 2000);
                return;
              }
              settled = true;
              if (config.callbacks) config.callbacks.onError(error.message);
              resolve({ setup: null, raw: error.message, stopReason: 'error' });
            },
          },
        )
        .catch((error: Error) => {
          clearInactivityTimer();
          if (settled || totalTimedOut) return;
          settled = true;
          if (config.callbacks) config.callbacks.onError(error.message);
          resolve({ setup: null, raw: error.message, stopReason: 'error' });
        });
    });
  };

  try {
    const result = await attemptGeneration();
    clearTimeout(totalTimer);
    return totalTimedOut ? { setup: null, raw: result.raw, stopReason: 'timeout_total' } : result;
  } catch (err) {
    clearTimeout(totalTimer);
    throw err;
  }
}

async function generateCore(
  fingerprint: Fingerprint,
  targetAgent: TargetAgent,
  prompt?: string,
  callbacks?: GenerateCallbacks,
  failingChecks?: FailingCheck[],
  currentScore?: number,
  passingChecks?: PassingCheck[],
): Promise<GenerationResult> {
  const userMessage = buildGeneratePrompt(
    fingerprint,
    targetAgent,
    prompt,
    failingChecks,
    currentScore,
    passingChecks,
  );
  return streamGeneration({
    systemPrompt: CORE_GENERATION_PROMPT,
    userMessage,
    baseMaxTokens: CORE_MAX_TOKENS,
    tokenIncrement: 8000,
    maxTokensCap: GENERATION_MAX_TOKENS,
    callbacks,
  });
}

async function generateMonolithic(
  fingerprint: Fingerprint,
  targetAgent: TargetAgent,
  prompt?: string,
  callbacks?: GenerateCallbacks,
  failingChecks?: FailingCheck[],
  currentScore?: number,
  passingChecks?: PassingCheck[],
): Promise<GenerationResult> {
  const userMessage = buildGeneratePrompt(
    fingerprint,
    targetAgent,
    prompt,
    failingChecks,
    currentScore,
    passingChecks,
  );
  return streamGeneration({
    systemPrompt: GENERATION_SYSTEM_PROMPT,
    userMessage,
    baseMaxTokens: GENERATION_MAX_TOKENS,
    tokenIncrement: 16000,
    maxTokensCap: MODEL_MAX_OUTPUT_TOKENS,
    callbacks,
  });
}

export async function generateSkillsForSetup(
  setup: Record<string, unknown>,
  fingerprint: Fingerprint,
  targetAgent: TargetAgent,
  onStatus?: (message: string) => void,
): Promise<number> {
  const skillTopics = collectSkillTopics(setup, targetAgent, fingerprint);
  if (skillTopics.length === 0) return 0;

  onStatus?.(`Generating ${skillTopics.length} skills...`);

  const allDeps = extractAllDeps(process.cwd());
  const skillContext = buildSkillContext(fingerprint, setup, allDeps);
  const fastModel = getFastModel();

  const skillResults = await Promise.allSettled(
    skillTopics.map(({ platform, topic }) =>
      generateSkill(skillContext, topic, fastModel).then((skill) => ({ platform, skill })),
    ),
  );

  const { succeeded, failed } = mergeSkillResults(skillResults, setup);
  if (failed > 0) onStatus?.(`${succeeded} generated, ${failed} failed`);

  return succeeded;
}

const LIMITS = {
  FILE_TREE_ENTRIES: 500,
  EXISTING_CONFIG_CHARS: 8000,
  SKILLS_MAX: 10,
  SKILL_CHARS: 3000,
  RULES_MAX: 10,
} as const;

/** Generate prompts must stay within a predictable cap (large-context models use a higher getMaxPromptTokens()). */
const BUILD_GENERATE_PROMPT_MAX_TOKENS = 120_000;
/** Room for the dynamic “Project Files” header line before measuring code payload. */
const PROJECT_FILES_HEADER_RESERVE_TOKENS = 160;

function maxCharsForCodeFileContent(
  runningJoinedLen: number,
  pathLine: string,
  budgetTokens: number,
): number {
  const maxTotalChars = budgetTokens * 4;
  const overhead = runningJoinedLen + 1 + pathLine.length + 1;
  return Math.max(0, maxTotalChars - overhead);
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + `\n... (truncated at ${maxChars} chars)`;
}

export function sampleFileTree(
  fileTree: string[],
  codeAnalysisPaths: string[],
  limit: number,
): string[] {
  if (fileTree.length <= limit) return fileTree;

  const fileTreeSet = new Set(fileTree);
  const dirs: string[] = [];
  const rootFiles: string[] = [];
  const nestedFiles: string[] = [];

  for (const entry of fileTree) {
    if (entry.endsWith('/')) {
      dirs.push(entry);
    } else if (!entry.includes('/')) {
      rootFiles.push(entry);
    } else {
      nestedFiles.push(entry);
    }
  }

  const result: string[] = [];
  const included = new Set<string>();

  function add(entry: string) {
    if (!included.has(entry)) {
      included.add(entry);
      result.push(entry);
    }
  }

  const dirBudget = Math.min(dirs.length, Math.floor(limit * 0.4));
  for (let i = 0; i < dirBudget; i++) add(dirs[i]);

  for (const f of rootFiles.slice(0, 50)) add(f);

  for (const p of codeAnalysisPaths) {
    if (result.length >= limit) break;
    if (fileTreeSet.has(p)) add(p);
  }

  for (const f of nestedFiles) {
    if (result.length >= limit) break;
    add(f);
  }

  return result.slice(0, limit);
}

export function buildGeneratePrompt(
  fingerprint: Fingerprint,
  targetAgent: TargetAgent,
  prompt?: string,
  failingChecks?: FailingCheck[],
  currentScore?: number,
  passingChecks?: PassingCheck[],
): string {
  const parts: string[] = [];
  const existing = fingerprint.existingConfigs;

  const hasExistingConfigs = !!(
    existing.claudeMd ||
    existing.claudeSettings ||
    existing.claudeSkills?.length ||
    existing.claudeRules?.length ||
    existing.readmeMd ||
    existing.agentsMd ||
    existing.cursorrules ||
    existing.cursorRules?.length
  );

  const isTargetedFix =
    failingChecks && failingChecks.length > 0 && currentScore !== undefined && currentScore >= 95;

  if (isTargetedFix) {
    parts.push(`TARGETED FIX MODE — current score: ${currentScore}/100, target: ${targetAgent}`);
    parts.push(
      `\nThe existing config is already high quality. ONLY fix these specific failing checks:\n`,
    );
    for (const check of failingChecks) {
      if (check.fix) {
        parts.push(`- **${check.name}**`);
        parts.push(`  Action: ${check.fix.instruction}`);
        if (check.fix.data && Object.keys(check.fix.data).length > 0) {
          const dataStr = Object.entries(check.fix.data)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
            .join('; ');
          parts.push(`  Data: ${dataStr}`);
        }
      } else {
        parts.push(`- ${check.name}${check.suggestion ? `: ${check.suggestion}` : ''}`);
      }
    }
    if (passingChecks && passingChecks.length > 0) {
      parts.push(`\nThese checks are currently PASSING — do NOT break them:`);
      for (const check of passingChecks) {
        parts.push(`- ${check.name}`);
      }
    }
    parts.push(`\nIMPORTANT RULES FOR TARGETED FIX:
- Return the existing CLAUDE.md and skills with MINIMAL changes — only the edits needed to fix the above checks.
- Do NOT rewrite, restructure, rephrase, or make cosmetic changes.
- Preserve the existing content as-is except for targeted fixes.
- If a skill file is not related to a failing check, return it EXACTLY as-is, character for character.
- For reference accuracy issues: DELETE non-existent paths. Do NOT replace with guessed paths.
- For concise config issues: Remove the least important lines to get under the token limit. Do NOT add new content.
- For grounding issues: Add references to the listed project directories in the appropriate sections.
- Every path or name you reference MUST exist in the project — use the file tree provided below.`);
  } else if (hasExistingConfigs) {
    parts.push(
      `Audit and improve the existing coding agent configuration for target: ${targetAgent}`,
    );
  } else {
    parts.push(`Generate an initial coding agent configuration for target: ${targetAgent}`);
  }

  if (fingerprint.gitRemoteUrl) parts.push(`\nGit remote: ${fingerprint.gitRemoteUrl}`);
  if (fingerprint.packageName) parts.push(`Package name: ${fingerprint.packageName}`);
  if (fingerprint.languages.length > 0)
    parts.push(`Languages: ${fingerprint.languages.join(', ')}`);
  if (fingerprint.frameworks.length > 0)
    parts.push(`Frameworks: ${fingerprint.frameworks.join(', ')}`);
  if (fingerprint.description) parts.push(`Project description: ${fingerprint.description}`);
  if (fingerprint.fileTree.length > 0) {
    const caPaths = fingerprint.codeAnalysis?.files.map((f) => f.path) ?? [];
    const tree = sampleFileTree(fingerprint.fileTree, caPaths, LIMITS.FILE_TREE_ENTRIES);
    parts.push(`\nFile tree (${tree.length}/${fingerprint.fileTree.length}):\n${tree.join('\n')}`);
  }

  if (existing.claudeMd)
    parts.push(
      `\nExisting CLAUDE.md:\n${truncate(existing.claudeMd, LIMITS.EXISTING_CONFIG_CHARS)}`,
    );
  if (existing.agentsMd)
    parts.push(
      `\nExisting AGENTS.md:\n${truncate(existing.agentsMd, LIMITS.EXISTING_CONFIG_CHARS)}`,
    );
  if (existing.readmeMd)
    parts.push(
      `\nExisting README.md:\n${truncate(existing.readmeMd, LIMITS.EXISTING_CONFIG_CHARS)}`,
    );

  if (existing.claudeSkills?.length) {
    parts.push('\n--- Existing Claude Skills ---');
    for (const skill of existing.claudeSkills.slice(0, LIMITS.SKILLS_MAX)) {
      parts.push(
        `\n[.claude/skills/${skill.filename}]\n${truncate(skill.content, LIMITS.SKILL_CHARS)}`,
      );
    }
    if (existing.claudeSkills.length > LIMITS.SKILLS_MAX) {
      parts.push(`\n(${existing.claudeSkills.length - LIMITS.SKILLS_MAX} more skills omitted)`);
    }
  }

  if (existing.claudeRules?.length) {
    parts.push('\n--- Existing Claude Rules ---');
    for (const rule of existing.claudeRules.slice(0, LIMITS.RULES_MAX)) {
      parts.push(
        `\n[.claude/rules/${rule.filename}]\n${truncate(rule.content, LIMITS.SKILL_CHARS)}`,
      );
    }
  }

  if (existing.cursorrules)
    parts.push(
      `\nExisting .cursorrules:\n${truncate(existing.cursorrules, LIMITS.EXISTING_CONFIG_CHARS)}`,
    );

  if (existing.cursorRules?.length) {
    parts.push('\n--- Existing Cursor Rules ---');
    for (const rule of existing.cursorRules.slice(0, LIMITS.RULES_MAX)) {
      parts.push(
        `\n[.cursor/rules/${rule.filename}]\n${truncate(rule.content, LIMITS.SKILL_CHARS)}`,
      );
    }
    if (existing.cursorRules.length > LIMITS.RULES_MAX) {
      parts.push(`\n(${existing.cursorRules.length - LIMITS.RULES_MAX} more rules omitted)`);
    }
  }

  if (existing.cursorSkills?.length) {
    parts.push('\n--- Existing Cursor Skills ---');
    for (const skill of existing.cursorSkills.slice(0, LIMITS.SKILLS_MAX)) {
      parts.push(
        `\n[.cursor/skills/${skill.name}/SKILL.md]\n${truncate(skill.content, LIMITS.SKILL_CHARS)}`,
      );
    }
    if (existing.cursorSkills.length > LIMITS.SKILLS_MAX) {
      parts.push(`\n(${existing.cursorSkills.length - LIMITS.SKILLS_MAX} more skills omitted)`);
    }
  }

  if (existing.personalLearnings) {
    parts.push(
      `\n--- Personal Learnings (developer-specific, include in generated configs) ---\n${existing.personalLearnings}`,
    );
  }

  const allDeps = extractAllDeps(process.cwd());
  if (allDeps.length > 0) {
    parts.push(`\nProject dependencies (${allDeps.length}):`);
    parts.push(allDeps.join(', '));
  }

  if (existing.includableDocs?.length) {
    parts.push('\n--- Existing Documentation Files (use @include) ---');
    parts.push('These files exist and can be referenced in CLAUDE.md using @./path:');
    for (const doc of existing.includableDocs) {
      parts.push(`- ${doc}`);
    }
  }

  if (prompt) parts.push(`\nUser instructions: ${prompt}`);

  if (fingerprint.codeAnalysis) {
    const ca = fingerprint.codeAnalysis;
    const basePrompt = parts.join('\n');
    const effectiveMaxTokens = Math.min(getMaxPromptTokens(), BUILD_GENERATE_PROMPT_MAX_TOKENS);
    const baseTokens = estimateTokens(basePrompt);
    const tokenBudgetForCode = Math.max(
      0,
      effectiveMaxTokens - baseTokens - PROJECT_FILES_HEADER_RESERVE_TOKENS,
    );

    const codeLines: string[] = [];
    let codeChars = 0;

    const introLine =
      'Study these files to extract patterns for skills. Use the exact code patterns you see here.\n';
    codeLines.push(introLine);
    let runningCodeLen = introLine.length;

    const sortedFiles = [...ca.files].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    let includedFiles = 0;
    for (const f of sortedFiles) {
      const pathLine = `[${f.path}]\n`;
      const maxContent = maxCharsForCodeFileContent(runningCodeLen, pathLine, tokenBudgetForCode);
      if (maxContent < 1) {
        if (includedFiles > 0) break;
        continue;
      }
      const content = f.content.slice(0, Math.min(f.content.length, maxContent));
      const entry = `${pathLine}${content}\n`;
      const projectedLen = runningCodeLen + 1 + entry.length;
      const projectedTokens = Math.ceil(projectedLen / 4);
      if (projectedTokens > tokenBudgetForCode) {
        if (includedFiles > 0) break;
        continue;
      }
      codeLines.push(entry);
      codeChars += content.length;
      runningCodeLen = projectedLen;
      includedFiles++;
    }

    const includedTokens = Math.ceil(codeChars / 4);
    let header: string;
    if (includedFiles < ca.files.length) {
      const pct =
        ca.totalProjectTokens > 0
          ? Math.round((includedTokens / ca.totalProjectTokens) * 100)
          : 100;
      header = `\n--- Project Files (trimmed to ~${includedTokens.toLocaleString()}/${ca.totalProjectTokens.toLocaleString()} tokens, ${pct}% of total) ---`;
    } else if (ca.truncated) {
      const pct =
        ca.totalProjectTokens > 0
          ? Math.round((ca.includedTokens / ca.totalProjectTokens) * 100)
          : 100;
      header = `\n--- Project Files (trimmed to ~${ca.includedTokens.toLocaleString()}/${ca.totalProjectTokens.toLocaleString()} tokens, ${pct}% of total) ---`;
    } else {
      header = `\n--- Project Files (${ca.files.length} files, ~${ca.includedTokens.toLocaleString()} tokens) ---`;
    }

    parts.push(header);
    parts.push(codeLines.join('\n'));
  }

  // Source context (separate mini-budget — never competes with code analysis)
  if (fingerprint.sources?.length) {
    parts.push(formatSourcesForPrompt(fingerprint.sources));
  }

  return parts.join('\n');
}
