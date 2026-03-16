import chalk from 'chalk';
import type { Ora } from 'ora';

export const GENERATION_MESSAGES = [
  'Analyzing your project structure and dependencies...',
  'Mapping out build commands and test workflows...',
  'Reviewing coding patterns and conventions...',
  'Extracting architecture and key file references...',
  'Designing skills tailored to your codebase...',
  'Writing concise, grounded config content...',
  'Optimizing settings for your development workflow...',
  'Building coding guidelines from your project style...',
  'Cross-referencing project files for accuracy...',
  'Assembling your complete agent configuration...',
];

export const REFINE_MESSAGES = [
  'Applying your feedback to the configuration...',
  'Adjusting coding guidelines...',
  'Rebalancing permissions and tool settings...',
  'Refining skills and workflows...',
  'Updating rules to match your preferences...',
  'Finalizing the revised setup...',
];

export class SpinnerMessages {
  private spinner: Ora;
  private messages: string[];
  private index = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private elapsedTimer: ReturnType<typeof setInterval> | null = null;
  private startTime = 0;
  private showElapsedTime: boolean;
  private currentBaseMessage = '';

  constructor(spinner: Ora, messages: string[], options?: { showElapsedTime?: boolean }) {
    this.spinner = spinner;
    this.messages = messages;
    this.showElapsedTime = options?.showElapsedTime ?? false;
  }

  private formatElapsed(): string {
    const seconds = Math.floor((Date.now() - this.startTime) / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  private updateSpinnerText(): void {
    this.spinner.text = this.currentBaseMessage;
  }

  start(): void {
    this.index = 0;
    this.startTime = Date.now();
    this.currentBaseMessage = this.messages[0];
    this.updateSpinnerText();
    if (this.showElapsedTime) {
      this.spinner.suffixText = chalk.dim(`(${this.formatElapsed()})`);
      this.elapsedTimer = setInterval(() => {
        this.spinner.suffixText = chalk.dim(`(${this.formatElapsed()})`);
      }, 1000);
    }
    this.timer = setInterval(() => {
      this.index = (this.index + 1) % this.messages.length;
      this.currentBaseMessage = this.messages[this.index];
      this.updateSpinnerText();
    }, 3000);
  }

  handleServerStatus(status: string): void {
    this.currentBaseMessage = status;
    this.updateSpinnerText();
    // Reset the timer so the server status displays for a full interval
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = setInterval(() => {
        this.index = (this.index + 1) % this.messages.length;
        this.currentBaseMessage = this.messages[this.index];
        this.updateSpinnerText();
      }, 3000);
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.elapsedTimer) {
      clearInterval(this.elapsedTimer);
      this.elapsedTimer = null;
    }
    this.spinner.suffixText = '';
  }
}
