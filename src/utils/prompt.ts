import chalk from 'chalk';
import readline from 'readline';

export function promptInput(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(chalk.cyan(`${question} `), (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
