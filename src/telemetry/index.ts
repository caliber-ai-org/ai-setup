import { PostHog } from 'posthog-node';
import chalk from 'chalk';
import {
  getMachineId,
  getGitEmailInfo,
  getRepoHash,
  isTelemetryDisabled,
  wasNoticeShown,
  markNoticeShown,
} from './config.js';

const POSTHOG_KEY = 'phc_XXrV0pSX4s2QVxVoOaeuyXDvtlRwPAjovt1ttMGVMPp';

let client: PostHog | null = null;
let distinctId: string | null = null;
let superProperties: Record<string, unknown> = {};

export function initTelemetry(): void {
  if (isTelemetryDisabled()) return;

  const machineId = getMachineId();
  distinctId = machineId;

  client = new PostHog(POSTHOG_KEY, {
    host: 'https://us.i.posthog.com',
    flushAt: 20,
    flushInterval: 10000,
  });

  if (!wasNoticeShown()) {
    console.log(
      chalk.dim('  Caliber telemetry is enabled. Thank you for helping improve the product!') +
      '\n' +
      chalk.dim('  Disable with --no-traces or CALIBER_TELEMETRY_DISABLED=1\n')
    );
    markNoticeShown();
  }

  const { hash: gitEmailHash, domain: emailDomain } = getGitEmailInfo();
  const repoHash = getRepoHash();

  superProperties = {
    ...(repoHash ? { repo_hash: repoHash } : {}),
    ...(emailDomain ? { email_domain: emailDomain } : {}),
  };

  client.identify({
    distinctId: machineId,
    properties: {
      ...(gitEmailHash ? { git_email_hash: gitEmailHash } : {}),
      ...(emailDomain ? { email_domain: emailDomain } : {}),
    },
  });
}

export function trackEvent(name: string, properties?: Record<string, unknown>): void {
  if (!client || !distinctId || isTelemetryDisabled()) return;
  client.capture({
    distinctId,
    event: name,
    properties: { ...superProperties, ...properties },
  });
}

export async function flushTelemetry(): Promise<void> {
  if (!client) return;
  try {
    await client.shutdown();
  } catch {
    // never throw — fire-and-forget
  }
  client = null;
}
