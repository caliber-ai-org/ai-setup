import chalk from 'chalk';
import readline from 'readline';

export function promptInput(question: string): Promise<string> {
  // readline hangs indefinitely in non-TTY contexts (git hooks, CI, subprocess pipes)
  if (!process.stdin.isTTY) return Promise.resolve('');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(chalk.cyan(`${question} `), (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
