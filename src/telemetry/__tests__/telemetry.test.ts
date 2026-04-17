import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

// Mock posthog-node before importing modules
const mockCapture = vi.fn();
const mockIdentify = vi.fn();
const mockShutdown = vi.fn().mockResolvedValue(undefined);

vi.mock('posthog-node', () => ({
  PostHog: class MockPostHog {
    capture = mockCapture;
    identify = mockIdentify;
    shutdown = mockShutdown;
  },
}));

// Mock fs for config file operations
const mockConfig: Record<string, unknown> = {};
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn((p: string) => {
        if (p.includes('config.json')) return Object.keys(mockConfig).length > 0;
        return actual.existsSync(p);
      }),
      readFileSync: vi.fn((p: string, encoding?: string) => {
        if (p.includes('config.json')) return JSON.stringify(mockConfig);
        return actual.readFileSync(p, encoding as BufferEncoding);
      }),
      writeFileSync: vi.fn(),
      mkdirSync: vi.fn(),
    },
  };
});

vi.mock('child_process', () => ({
  execSync: vi.fn().mockReturnValue('test@example.com\n'),
}));

describe('telemetry', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.resetModules();
    mockCapture.mockClear();
    mockIdentify.mockClear();
    mockShutdown.mockClear();
    savedEnv.CALIBER_TELEMETRY_DISABLED = process.env.CALIBER_TELEMETRY_DISABLED;
    savedEnv.CALIBER_TELEMETRY_ENABLED = process.env.CALIBER_TELEMETRY_ENABLED;
    delete process.env.CALIBER_TELEMETRY_DISABLED;
    delete process.env.CALIBER_TELEMETRY_ENABLED;
    for (const key of Object.keys(mockConfig)) delete mockConfig[key];
  });

  afterEach(() => {
    if (savedEnv.CALIBER_TELEMETRY_DISABLED === undefined) {
      delete process.env.CALIBER_TELEMETRY_DISABLED;
    } else {
      process.env.CALIBER_TELEMETRY_DISABLED = savedEnv.CALIBER_TELEMETRY_DISABLED;
    }
    if (savedEnv.CALIBER_TELEMETRY_ENABLED === undefined) {
      delete process.env.CALIBER_TELEMETRY_ENABLED;
    } else {
      process.env.CALIBER_TELEMETRY_ENABLED = savedEnv.CALIBER_TELEMETRY_ENABLED;
    }
  });

  describe('config', () => {
    it('getMachineId returns a UUID', async () => {
      const { getMachineId } = await import('../config.js');
      const id = getMachineId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('getGitEmailHash returns HMAC-SHA256 hash', async () => {
      const { getGitEmailHash } = await import('../config.js');
      const hash = getGitEmailHash();
      const expected = crypto.createHmac('sha256', 'caliber-telemetry-v1').update('test@example.com').digest('hex');
      expect(hash).toBe(expected);
    });

    it('isTelemetryDisabled returns true by default (opt-in)', async () => {
      const { isTelemetryDisabled } = await import('../config.js');
      expect(isTelemetryDisabled()).toBe(true);
    });

    it('isTelemetryDisabled respects CALIBER_TELEMETRY_DISABLED env var', async () => {
      process.env.CALIBER_TELEMETRY_DISABLED = '1';
      const { isTelemetryDisabled } = await import('../config.js');
      expect(isTelemetryDisabled()).toBe(true);
    });

    it('isTelemetryDisabled returns false when CALIBER_TELEMETRY_ENABLED is set', async () => {
      process.env.CALIBER_TELEMETRY_ENABLED = '1';
      const { isTelemetryDisabled } = await import('../config.js');
      expect(isTelemetryDisabled()).toBe(false);
    });

    it('CALIBER_TELEMETRY_DISABLED takes precedence over CALIBER_TELEMETRY_ENABLED', async () => {
      process.env.CALIBER_TELEMETRY_DISABLED = '1';
      process.env.CALIBER_TELEMETRY_ENABLED = '1';
      const { isTelemetryDisabled } = await import('../config.js');
      expect(isTelemetryDisabled()).toBe(true);
    });

    it('isTelemetryDisabled returns false when telemetryConsent is true in config', async () => {
      mockConfig.telemetryConsent = true;
      const { isTelemetryDisabled } = await import('../config.js');
      expect(isTelemetryDisabled()).toBe(false);
    });

    it('setTelemetryDisabled sets runtime flag', async () => {
      process.env.CALIBER_TELEMETRY_ENABLED = '1';
      const { isTelemetryDisabled, setTelemetryDisabled } = await import('../config.js');
      setTelemetryDisabled(true);
      expect(isTelemetryDisabled()).toBe(true);
      setTelemetryDisabled(false);
    });

    it('setTelemetryConsent persists consent to config', async () => {
      const fs = await import('fs');
      const { setTelemetryConsent } = await import('../config.js');
      setTelemetryConsent(true);
      expect(fs.default.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('config.json'),
        expect.stringContaining('"telemetryConsent": true'),
        expect.any(Object),
      );
    });
  });

  describe('trackEvent', () => {
    it('captures events after init when opted in', async () => {
      process.env.CALIBER_TELEMETRY_ENABLED = '1';
      const { initTelemetry, trackEvent } = await import('../index.js');
      initTelemetry();
      trackEvent('test_event', { foo: 'bar' });
      expect(mockCapture).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'test_event',
          properties: expect.objectContaining({ foo: 'bar' }),
        })
      );
    });

    it('is a no-op when not opted in (default)', async () => {
      const { initTelemetry, trackEvent } = await import('../index.js');
      initTelemetry();
      trackEvent('test_event', { foo: 'bar' });
      expect(mockCapture).not.toHaveBeenCalled();
    });

    it('is a no-op when explicitly disabled', async () => {
      process.env.CALIBER_TELEMETRY_DISABLED = '1';
      const { initTelemetry, trackEvent } = await import('../index.js');
      initTelemetry();
      trackEvent('test_event', { foo: 'bar' });
      expect(mockCapture).not.toHaveBeenCalled();
    });
  });

  describe('flushTelemetry', () => {
    it('calls shutdown on client', async () => {
      process.env.CALIBER_TELEMETRY_ENABLED = '1';
      const { initTelemetry, flushTelemetry } = await import('../index.js');
      initTelemetry();
      await flushTelemetry();
      expect(mockShutdown).toHaveBeenCalled();
    });

    it('does not throw if shutdown fails', async () => {
      process.env.CALIBER_TELEMETRY_ENABLED = '1';
      mockShutdown.mockRejectedValueOnce(new Error('network error'));
      const { initTelemetry, flushTelemetry } = await import('../index.js');
      initTelemetry();
      await expect(flushTelemetry()).resolves.toBeUndefined();
    });
  });

  describe('event helpers', () => {
    it('trackInitProviderSelected captures correct event', async () => {
      process.env.CALIBER_TELEMETRY_ENABLED = '1';
      const { initTelemetry } = await import('../index.js');
      const { trackInitProviderSelected } = await import('../events.js');
      initTelemetry();
      trackInitProviderSelected('anthropic', 'claude-sonnet-4-6');
      expect(mockCapture).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'init_provider_selected',
          properties: expect.objectContaining({ provider: 'anthropic', model: 'claude-sonnet-4-6' }),
        })
      );
    });

    it('trackScoreComputed captures correct event', async () => {
      process.env.CALIBER_TELEMETRY_ENABLED = '1';
      const { initTelemetry } = await import('../index.js');
      const { trackScoreComputed } = await import('../events.js');
      initTelemetry();
      trackScoreComputed(85, ['claude']);
      expect(mockCapture).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'score_computed',
          properties: expect.objectContaining({ score: 85, agent: ['claude'] }),
        })
      );
    });
  });
});
