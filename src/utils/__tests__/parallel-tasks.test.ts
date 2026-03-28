import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ParallelTaskDisplay } from '../parallel-tasks.js';

function captureOutput(_display: ParallelTaskDisplay): () => string {
  const chunks: string[] = [];
  const writeSpy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation((chunk: string | Uint8Array) => {
      chunks.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
      return true;
    });
  Object.defineProperty(process.stdout, 'columns', {
    value: 120,
    writable: true,
    configurable: true,
  });
  return () => {
    writeSpy.mockRestore();
    return chunks.join('');
  };
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

function getLastFrame(raw: string): string {
  const frames = raw.split(/\x1b\[\d+A/);
  return stripAnsi(frames[frames.length - 1]);
}

describe('ParallelTaskDisplay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('pipeline header', () => {
    it('renders main pipeline nodes on a single line', () => {
      const display = new ParallelTaskDisplay();
      display.add('Task A', { pipelineLabel: 'A' });
      display.add('Task B', { pipelineLabel: 'B' });
      display.add('Task C', { pipelineLabel: 'C' });

      const getOutput = captureOutput(display);
      display.start();
      display.stop();
      const frame = getLastFrame(getOutput());

      expect(frame).toContain('[○ A]');
      expect(frame).toContain('→');
      expect(frame).toContain('[○ B]');
      expect(frame).toContain('[○ C]');
    });

    it('renders branch tasks on a second line with fork arrows', () => {
      const display = new ParallelTaskDisplay();
      display.add('Main', { pipelineLabel: 'Main' });
      display.add('Branch', { pipelineLabel: 'Branch', pipelineRow: 1 });
      display.add('End', { pipelineLabel: 'End' });

      const getOutput = captureOutput(display);
      display.start();
      display.stop();
      const frame = getLastFrame(getOutput());

      expect(frame).toContain('↘');
      expect(frame).toContain('[○ Branch]');
      expect(frame).toContain('↗');
    });

    it('does not render branch line when no pipelineRow=1 tasks exist', () => {
      const display = new ParallelTaskDisplay();
      display.add('A', { pipelineLabel: 'A' });
      display.add('B', { pipelineLabel: 'B' });

      const getOutput = captureOutput(display);
      display.start();
      display.stop();
      const frame = getLastFrame(getOutput());

      expect(frame).not.toContain('↘');
      expect(frame).not.toContain('↗');
    });

    it('returns no header when no tasks have pipelineLabel', () => {
      const display = new ParallelTaskDisplay();
      display.add('Plain task');

      const getOutput = captureOutput(display);
      display.start();
      display.stop();
      const frame = getLastFrame(getOutput());

      expect(frame).not.toContain('→');
      expect(frame).not.toContain('─'.repeat(10));
    });

    it('shows done icon in pipeline header when task completes', () => {
      const display = new ParallelTaskDisplay();
      const idx = display.add('Task', { pipelineLabel: 'Step' });

      const getOutput = captureOutput(display);
      display.start();
      display.update(idx, 'running');
      display.update(idx, 'done');
      display.stop();
      const frame = getLastFrame(getOutput());

      expect(frame).toContain('[✓ Step]');
    });

    it('shows failed icon in pipeline header', () => {
      const display = new ParallelTaskDisplay();
      const idx = display.add('Task', { pipelineLabel: 'Step' });

      const getOutput = captureOutput(display);
      display.start();
      display.update(idx, 'running');
      display.update(idx, 'failed');
      display.stop();
      const frame = getLastFrame(getOutput());

      expect(frame).toContain('[✗ Step]');
    });
  });

  describe('tree connectors', () => {
    it('renders ├─ for depth-1 task with a sibling after it', () => {
      const display = new ParallelTaskDisplay();
      display.add('Parent');
      display.add('Child 1', { depth: 1 });
      display.add('Child 2', { depth: 1 });

      const getOutput = captureOutput(display);
      display.start();
      display.stop();
      const frame = getLastFrame(getOutput());
      const lines = frame.split('\n').filter((l) => l.trim());

      const child1Line = lines.find((l) => l.includes('Child 1'));
      expect(child1Line).toContain('├─');
    });

    it('renders └─ for last depth-1 task', () => {
      const display = new ParallelTaskDisplay();
      display.add('Parent');
      display.add('Child 1', { depth: 1 });
      display.add('Child 2', { depth: 1 });

      const getOutput = captureOutput(display);
      display.start();
      display.stop();
      const frame = getLastFrame(getOutput());
      const lines = frame.split('\n').filter((l) => l.trim());

      const child2Line = lines.find((l) => l.includes('Child 2'));
      expect(child2Line).toContain('└─');
    });

    it('renders │  └─ for depth-2 task when parent has sibling', () => {
      const display = new ParallelTaskDisplay();
      display.add('Root');
      display.add('Branch 1', { depth: 1 });
      display.add('Sub-task', { depth: 2 });
      display.add('Branch 2', { depth: 1 });

      const getOutput = captureOutput(display);
      display.start();
      display.stop();
      const frame = getLastFrame(getOutput());
      const lines = frame.split('\n').filter((l) => l.trim());

      const subLine = lines.find((l) => l.includes('Sub-task'));
      expect(subLine).toContain('│');
      expect(subLine).toContain('└─');
    });

    it('renders space └─ for depth-2 task when parent has no sibling', () => {
      const display = new ParallelTaskDisplay();
      display.add('Root');
      display.add('Branch', { depth: 1 });
      display.add('Sub-task', { depth: 2 });
      display.add('After');

      const getOutput = captureOutput(display);
      display.start();
      display.stop();
      const frame = getLastFrame(getOutput());
      const lines = frame.split('\n').filter((l) => l.trim());

      const subLine = lines.find((l) => l.includes('Sub-task'));
      expect(subLine).toBeDefined();
      expect(subLine).toContain('└─');
      expect(subLine).not.toContain('│');
    });

    it('renders no connector for depth-0 tasks', () => {
      const display = new ParallelTaskDisplay();
      display.add('Top level');

      const getOutput = captureOutput(display);
      display.start();
      display.stop();
      const frame = getLastFrame(getOutput());
      const lines = frame.split('\n').filter((l) => l.trim());

      const topLine = lines.find((l) => l.includes('Top level'));
      expect(topLine).not.toContain('├─');
      expect(topLine).not.toContain('└─');
    });
  });

  describe('status icons', () => {
    it('shows ○ for pending tasks', () => {
      const display = new ParallelTaskDisplay();
      display.add('Pending task');

      const getOutput = captureOutput(display);
      display.start();
      display.stop();
      const frame = getLastFrame(getOutput());

      expect(frame).toContain('○');
      expect(frame).toContain('Pending task');
    });

    it('shows ✓ for done tasks', () => {
      const display = new ParallelTaskDisplay();
      const idx = display.add('Done task');

      const getOutput = captureOutput(display);
      display.start();
      display.update(idx, 'running');
      display.update(idx, 'done', 'Complete');
      display.stop();
      const frame = getLastFrame(getOutput());

      expect(frame).toContain('✓');
      expect(frame).toContain('Complete');
    });

    it('shows ✗ for failed tasks', () => {
      const display = new ParallelTaskDisplay();
      const idx = display.add('Failed task');

      const getOutput = captureOutput(display);
      display.start();
      display.update(idx, 'running');
      display.update(idx, 'failed', 'Error');
      display.stop();
      const frame = getLastFrame(getOutput());

      expect(frame).toContain('✗');
      expect(frame).toContain('Error');
    });
  });

  describe('separator line', () => {
    it('renders separator between pipeline header and task list', () => {
      const display = new ParallelTaskDisplay();
      display.add('Task', { pipelineLabel: 'Step' });

      const getOutput = captureOutput(display);
      display.start();
      display.stop();
      const frame = getLastFrame(getOutput());

      expect(frame).toContain('───');
    });
  });

  describe('update behavior', () => {
    it('sets startTime on first transition to running', () => {
      const display = new ParallelTaskDisplay();
      const idx = display.add('Task');

      const getOutput = captureOutput(display);
      display.start();
      vi.advanceTimersByTime(1000);
      display.update(idx, 'running');
      vi.advanceTimersByTime(2000);
      display.update(idx, 'done');
      display.stop();
      const frame = getLastFrame(getOutput());

      expect(frame).toContain('2s');
    });

    it('ignores update for invalid index', () => {
      const display = new ParallelTaskDisplay();
      display.add('Task');

      const getOutput = captureOutput(display);
      display.start();
      display.update(99, 'running');
      display.stop();

      expect(getLastFrame(getOutput())).toContain('Task');
    });
  });

  describe('full pipeline layout (init-like)', () => {
    it('renders the complete caliber init pipeline structure', () => {
      const display = new ParallelTaskDisplay();
      display.add('Detecting project stack', { pipelineLabel: 'Scan' });
      display.add('Generating configs', { depth: 1, pipelineLabel: 'Generate' });
      display.add('Generating skills', { depth: 2, pipelineLabel: 'Skills' });
      display.add('Searching community skills', {
        depth: 1,
        pipelineLabel: 'Search',
        pipelineRow: 1,
      });
      display.add('Validating & refining config', { pipelineLabel: 'Validate' });

      const getOutput = captureOutput(display);
      display.start();
      display.stop();
      const frame = getLastFrame(getOutput());

      // Pipeline header
      expect(frame).toContain('[○ Scan]');
      expect(frame).toContain('[○ Generate]');
      expect(frame).toContain('[○ Skills]');
      expect(frame).toContain('[○ Validate]');
      expect(frame).toContain('↘');
      expect(frame).toContain('[○ Search]');
      expect(frame).toContain('↗');

      // Tree connectors
      const lines = frame.split('\n').filter((l) => l.trim());
      const configLine = lines.find((l) => l.includes('Generating configs'));
      expect(configLine).toContain('├─');

      const skillsLine = lines.find((l) => l.includes('Generating skills'));
      expect(skillsLine).toContain('│');
      expect(skillsLine).toContain('└─');

      const searchLine = lines.find((l) => l.includes('Searching community'));
      expect(searchLine).toContain('└─');
    });
  });
});
