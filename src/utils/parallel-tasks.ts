import chalk from 'chalk';
import stripAnsi from 'strip-ansi';

type TaskStatus = 'pending' | 'running' | 'done' | 'failed';

interface TaskState {
  name: string;
  status: TaskStatus;
  message: string;
  startTime?: number;
  endTime?: number;
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPINNER_INTERVAL_MS = 80;

export class ParallelTaskDisplay {
  private tasks: TaskState[] = [];
  private lineCount = 0;
  private spinnerFrame = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private startTime = 0;
  private rendered = false;

  add(name: string): number {
    const index = this.tasks.length;
    this.tasks.push({ name, status: 'pending', message: '' });
    return index;
  }

  start(): void {
    this.startTime = Date.now();
    this.draw(true);
    this.timer = setInterval(() => {
      this.spinnerFrame = (this.spinnerFrame + 1) % SPINNER_FRAMES.length;
      this.draw(false);
    }, SPINNER_INTERVAL_MS);
  }

  update(index: number, status: TaskStatus, message?: string): void {
    const task = this.tasks[index];
    if (!task) return;
    if (status === 'running' && task.status === 'pending') {
      task.startTime = Date.now();
    }
    if ((status === 'done' || status === 'failed') && !task.endTime) {
      task.endTime = Date.now();
    }
    task.status = status;
    if (message !== undefined) task.message = message;
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.draw(false);
  }

  private formatTime(ms: number): string {
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  }

  private truncate(text: string, maxVisible: number): string {
    const plain = stripAnsi(text);
    if (plain.length <= maxVisible) return text;
    // Walk the original string tracking visible chars
    let visible = 0;
    let i = 0;
    while (i < text.length && visible < maxVisible - 3) {
      if (text[i] === '\x1b') {
        const end = text.indexOf('m', i);
        if (end !== -1) { i = end + 1; continue; }
      }
      visible++;
      i++;
    }
    return text.slice(0, i) + '...';
  }

  private renderLine(task: TaskState): string {
    const maxWidth = process.stdout.columns || 80;
    const elapsed = task.startTime
      ? this.formatTime((task.endTime ?? Date.now()) - task.startTime)
      : '';

    let line: string;
    switch (task.status) {
      case 'pending':
        line = `  ${chalk.dim('○')} ${chalk.dim(task.name)}${task.message ? chalk.dim(` — ${task.message}`) : ''}`;
        break;
      case 'running': {
        const spinner = chalk.cyan(SPINNER_FRAMES[this.spinnerFrame]);
        const time = elapsed ? chalk.dim(` (${elapsed})`) : '';
        line = `  ${spinner} ${task.name}${task.message ? chalk.dim(` — ${task.message}`) : ''}${time}`;
        break;
      }
      case 'done': {
        const time = elapsed ? chalk.dim(` (${elapsed})`) : '';
        line = `  ${chalk.green('✓')} ${task.name}${task.message ? chalk.dim(` — ${task.message}`) : ''}${time}`;
        break;
      }
      case 'failed':
        line = `  ${chalk.red('✗')} ${task.name}${task.message ? chalk.red(` — ${task.message}`) : ''}`;
        break;
    }

    return this.truncate(line, maxWidth - 1);
  }

  private draw(initial: boolean): void {
    const { stdout } = process;
    if (!initial && this.rendered && this.lineCount > 0) {
      stdout.write(`\x1b[${this.lineCount}A`);
    }
    stdout.write('\x1b[0J');

    const lines = this.tasks.map(t => this.renderLine(t));
    const totalElapsed = this.formatTime(Date.now() - this.startTime);
    lines.push(chalk.dim(`\n  Total: ${totalElapsed}`));

    const output = lines.join('\n');
    stdout.write(output + '\n');
    this.lineCount = output.split('\n').length;
    this.rendered = true;
  }
}
