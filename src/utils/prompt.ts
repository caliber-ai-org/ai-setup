import input from '@inquirer/input';

export async function promptInput(question: string): Promise<string> {
  if (!process.stdin.isTTY) return '';
  try {
    const answer = await input({ message: question });
    return answer.trim();
  } catch {
    return '';
  }
}
