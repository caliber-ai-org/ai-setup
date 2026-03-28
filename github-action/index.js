const { execFileSync } = require('child_process');
const https = require('https');

const VALID_AGENTS = new Set(['claude', 'cursor', 'codex', 'github-copilot']);

const MANAGED_FILES = ['CLAUDE.md', 'AGENTS.md', '.cursorrules', '.cursor/', '.claude/', '.github/copilot-instructions.md', '.github/instructions/', 'CALIBER_LEARNINGS.md'];
const CALIBER_PKG = '@rely-ai/caliber@latest';

// --- GitHub Actions helpers (no @actions/core dependency) ---

function getInput(name) {
  return process.env[`INPUT_${name.toUpperCase().replace(/-/g, '_')}`] || '';
}

function setOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    require('fs').appendFileSync(outputFile, `${name}=${value}\n`);
  }
}

function setFailed(message) {
  console.error(`::error::${message}`);
  process.exitCode = 1;
}

// --- GitHub API helper ---

function githubApi(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'User-Agent': 'caliber-action',
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// --- Comment formatting ---

const COMMENT_MARKER = '<!-- caliber-score -->';

function gradeEmoji(grade) {
  const map = { A: '\u2705', B: '\u2705', C: '\u26A0\uFE0F', D: '\u274C', F: '\u274C' };
  return map[grade] || '\u2753';
}

function buildComment(result, baseResult, agent) {
  const lines = [COMMENT_MARKER];
  lines.push(`## ${gradeEmoji(result.grade)} Caliber Score: ${result.score}/100 (${result.grade})`);
  lines.push('');

  if (baseResult) {
    const delta = result.score - baseResult.score;
    const sign = delta > 0 ? '+' : '';
    const icon = delta > 0 ? '\u2B06\uFE0F' : delta < 0 ? '\u2B07\uFE0F' : '\u27A1\uFE0F';
    lines.push(`${icon} **${sign}${delta}** from base branch (${baseResult.score}/100)`);
    lines.push('');
  }

  lines.push(`**Agent:** ${agent}`);
  lines.push('');

  const failing = (result.checks || []).filter((c) => !c.passed);
  if (failing.length > 0) {
    lines.push('### Failing Checks');
    lines.push('');
    lines.push('| Check | Points | Suggestion |');
    lines.push('|-------|--------|------------|');
    for (const check of failing) {
      const suggestion = check.suggestion || check.detail || '';
      lines.push(`| ${check.name || check.id} | ${check.earned}/${check.max} | ${suggestion} |`);
    }
    lines.push('');
  }

  const passing = (result.checks || []).filter((c) => c.passed);
  if (passing.length > 0) {
    lines.push(`<details><summary>\u2705 ${passing.length} passing checks</summary>`);
    lines.push('');
    for (const check of passing) {
      lines.push(`- **${check.name || check.id}**: ${check.earned}/${check.max}`);
    }
    lines.push('</details>');
    lines.push('');
  }

  lines.push('---');
  lines.push('*Powered by [Caliber](https://github.com/caliber-ai-org/ai-setup)*');
  return lines.join('\n');
}

// --- Agent format detection ---

function detectAgentFormats(changedFiles) {
  const formats = [];
  const joined = changedFiles.join(' ');
  if (joined.includes('CLAUDE.md') || joined.includes('.claude/')) formats.push({ name: 'Claude Code', file: 'CLAUDE.md', status: 'updated' });
  if (joined.includes('.cursor/') || joined.includes('.cursorrules')) formats.push({ name: 'Cursor', file: '.cursor/rules/', status: 'updated' });
  if (joined.includes('copilot-instructions') || joined.includes('.github/instructions/')) formats.push({ name: 'Copilot', file: '.github/copilot-instructions.md', status: 'updated' });
  if (joined.includes('AGENTS.md') || joined.includes('.agents/')) formats.push({ name: 'Codex', file: 'AGENTS.md', status: 'updated' });
  return formats;
}

// --- Sync mode ---

async function runSync(token) {
  const branchPrefix = getInput('sync-branch-prefix') || 'caliber/sync';
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) {
    setFailed('GITHUB_REPOSITORY not set');
    return;
  }

  // Determine default branch from the event payload or API, not GITHUB_REF_NAME (which is the current ref)
  let defaultBranch = 'main';
  try {
    const repoInfo = await githubApi('GET', `/repos/${repo}`, null, token);
    if (repoInfo.data && repoInfo.data.default_branch) {
      defaultBranch = repoInfo.data.default_branch;
    }
  } catch { /* fall back to 'main' */ }

  // Ensure we're on the default branch for sync mode
  try {
    execFileSync('git', ['checkout', defaultBranch], { stdio: 'pipe' });
  } catch {
    console.log(`Warning: Could not checkout ${defaultBranch}`);
  }

  // Run caliber refresh
  try {
    execFileSync('npx', ['--yes', CALIBER_PKG, 'refresh', '--quiet'], {
      encoding: 'utf-8',
      timeout: 300000,
      env: { ...process.env, CALIBER_SKIP_UPDATE_CHECK: '1' },
    });
  } catch (err) {
    console.log(`Refresh failed: ${err.message}`);
    return;
  }

  const changes = execFileSync('git', ['diff', '--name-only'], { encoding: 'utf-8' }).trim();
  if (!changes) {
    console.log('No config changes detected — all agent formats are up to date.');
    return;
  }

  const changedFiles = changes.split('\n').filter(Boolean);
  const formats = detectAgentFormats(changedFiles);
  const date = new Date().toISOString().slice(0, 10);
  const syncBranch = `${branchPrefix}-${date}`;

  // Configure git
  execFileSync('git', ['config', 'user.name', 'caliber[bot]']);
  execFileSync('git', ['config', 'user.email', 'caliber-bot@users.noreply.github.com']);

  // Create sync branch from current state (carries uncommitted refresh changes)
  try {
    execFileSync('git', ['branch', '-D', syncBranch], { stdio: 'pipe' });
  } catch { /* branch may not exist locally */ }
  execFileSync('git', ['checkout', '-b', syncBranch]);

  try {
    execFileSync('git', ['add', ...MANAGED_FILES], { stdio: 'pipe' });
  } catch { /* some files may not exist */ }

  // Check if there's anything staged to commit
  const staged = execFileSync('git', ['diff', '--cached', '--name-only'], { encoding: 'utf-8' }).trim();
  if (!staged) {
    console.log('No config files to commit after staging.');
    return;
  }

  const formatNames = formats.map(f => f.name).join(', ') || 'agent configs';
  execFileSync('git', ['commit', '-m', `[caliber] sync ${formatNames}`]);

  try {
    execFileSync('git', ['push', '--force', 'origin', syncBranch]);
  } catch (err) {
    console.log(`Failed to push sync branch: ${err.message}`);
    return;
  }

  // Check for existing open sync PR
  if (token) {
    try {
      const existingPRs = await githubApi('GET', `/repos/${repo}/pulls?head=${repo.split('/')[0]}:${syncBranch}&state=open`, null, token);
      if (existingPRs.data && existingPRs.data.length > 0) {
        const prUrl = existingPRs.data[0].html_url;
        console.log(`Updated existing sync PR: ${prUrl}`);
        setOutput('sync-pr', prUrl);
        return;
      }
    } catch { /* continue to create new PR */ }

    // Create new PR
    const body = formats.length > 0
      ? `Caliber automatically synced the following agent configs with latest code changes:\n\n${formats.map(f => `- **${f.name}** (\`${f.file}\`)`).join('\n')}\n\nMerge this PR to keep all AI agents up to date with the codebase.`
      : 'Caliber refreshed agent configuration files.';

    try {
      const pr = await githubApi('POST', `/repos/${repo}/pulls`, {
        title: `[caliber] Sync agent configs (${date})`,
        body,
        head: syncBranch,
        base: defaultBranch,
      }, token);

      if (pr.data && pr.data.html_url) {
        console.log(`Created sync PR: ${pr.data.html_url}`);
        setOutput('sync-pr', pr.data.html_url);
      }
    } catch (err) {
      console.log(`Failed to create PR: ${err.message}`);
    }
  }
}

// --- Main ---

async function run() {
  const mode = getInput('mode') || 'score';

  if (mode === 'sync') {
    const token = getInput('github-token');
    await runSync(token);
    return;
  }

  const agent = getInput('agent') || 'claude';
  if (!VALID_AGENTS.has(agent)) {
    setFailed(`Invalid agent "${agent}". Must be one of: ${[...VALID_AGENTS].join(', ')}`);
    return;
  }
  const failBelow = parseInt(getInput('fail-below') || '0', 10);
  const shouldComment = getInput('comment') !== 'false';
  const autoRefresh = getInput('auto-refresh') === 'true';
  const token = getInput('github-token');

  // Run caliber score
  let resultJson;
  try {
    const output = execFileSync('npx', ['--yes', CALIBER_PKG, 'score', '--json', '--quiet', '--agent', agent], {
      encoding: 'utf-8',
      timeout: 120000,
      env: { ...process.env, CALIBER_SKIP_UPDATE_CHECK: '1' },
    });
    resultJson = JSON.parse(output.trim());
  } catch (err) {
    setFailed(`Failed to run caliber score: ${err.message}`);
    return;
  }

  const score = resultJson.score;
  const grade = resultJson.grade;

  console.log(`Score: ${score}/100 (${grade})`);
  setOutput('score', score);
  setOutput('grade', grade);

  // Compare against base branch if on a PR
  let baseResult = null;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  let prNumber = null;
  let repo = null;

  if (eventPath) {
    try {
      const event = JSON.parse(require('fs').readFileSync(eventPath, 'utf-8'));
      prNumber = event.pull_request?.number || null;
      repo = process.env.GITHUB_REPOSITORY;

      if (prNumber) {
        const baseBranch = event.pull_request?.base?.ref;
        if (baseBranch) {
          try {
            if (!/^[\w\.\-\/]+$/.test(baseBranch)) throw new Error('Invalid base branch name');
            const baseOutput = execFileSync(
              'npx', ['--yes', CALIBER_PKG, 'score', '--json', '--quiet', '--agent', agent, '--compare', `origin/${baseBranch}`],
              { encoding: 'utf-8', timeout: 120000, env: { ...process.env, CALIBER_SKIP_UPDATE_CHECK: '1' } },
            );
            const parsed = JSON.parse(baseOutput.trim());
            baseResult = parsed.base || null;
          } catch {
            console.log('Could not compute base branch score — skipping comparison.');
          }
        }
      }
    } catch {
      // Not a PR event
    }
  }

  if (baseResult) {
    const delta = score - baseResult.score;
    const sign = delta > 0 ? '+' : '';
    console.log(`Delta: ${sign}${delta} from base (${baseResult.score}/100)`);
    setOutput('delta', `${delta}`);
  }

  // Post PR comment
  if (shouldComment && prNumber && repo && token) {
    const commentBody = buildComment(resultJson, baseResult, agent);
    const commentsPath = `/repos/${repo}/issues/${prNumber}/comments`;

    try {
      // Find existing comment
      const existing = await githubApi('GET', `${commentsPath}?per_page=100`, null, token);
      const prev = (existing.data || []).find((c) => c.body && c.body.includes(COMMENT_MARKER));

      if (prev) {
        await githubApi('PATCH', `/repos/${repo}/issues/comments/${prev.id}`, { body: commentBody }, token);
        console.log('Updated existing PR comment.');
      } else {
        await githubApi('POST', commentsPath, { body: commentBody }, token);
        console.log('Posted PR comment.');
      }
    } catch (err) {
      console.log(`Warning: Could not post PR comment: ${err.message}`);
    }
  }

  // Auto-refresh
  if (autoRefresh) {
    try {
      execFileSync('npx', ['--yes', CALIBER_PKG, 'refresh', '--quiet'], {
        encoding: 'utf-8',
        timeout: 300000,
        env: { ...process.env, CALIBER_SKIP_UPDATE_CHECK: '1' },
      });

      const changes = execFileSync('git', ['diff', '--name-only'], { encoding: 'utf-8' }).trim();
      if (changes) {
        const changedFiles = changes.split('\n').filter(Boolean);
        const formats = detectAgentFormats(changedFiles);
        const formatNames = formats.map(f => f.name).join(', ') || 'agent configs';

        execFileSync('git', ['config', 'user.name', 'caliber[bot]']);
        execFileSync('git', ['config', 'user.email', 'caliber-bot@users.noreply.github.com']);
        try {
          execFileSync('git', ['add', ...MANAGED_FILES], { stdio: 'pipe' });
        } catch { /* some files may not exist */ }
        execFileSync('git', ['commit', '-m', `[caliber] sync ${formatNames}`]);
        execFileSync('git', ['push']);
        console.log(`Synced ${formats.length} agent format${formats.length === 1 ? '' : 's'}: ${formatNames}`);
      } else {
        console.log('No config changes to commit.');
      }
    } catch (err) {
      console.log(`Warning: Auto-refresh failed: ${err.message}`);
    }
  }

  // Fail if below threshold
  if (failBelow > 0 && score < failBelow) {
    setFailed(`Score ${score}/100 is below the minimum threshold of ${failBelow}.`);
  }
}

run().catch((err) => {
  setFailed(`Unexpected error: ${err.message}`);
});
