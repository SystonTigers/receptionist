import path from 'path';
import { readFile, writeFile } from 'fs/promises';
import matter from 'gray-matter';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { spawn } from 'child_process';

interface TaskIndexEntry {
  id: string;
  title: string;
  file: string;
  status: 'pending' | 'in-progress' | 'done';
  priority: 'high' | 'medium' | 'low';
}

interface TaskDetail {
  entry: TaskIndexEntry;
  content: string;
  data: Record<string, unknown>;
}

const ROOT_DIR = process.cwd();
const INDEX_PATH = path.join(ROOT_DIR, 'codex-tasks', 'index.json');

async function loadIndex(): Promise<TaskIndexEntry[]> {
  const raw = await readFile(INDEX_PATH, 'utf8');
  const parsed = JSON.parse(raw) as TaskIndexEntry[];
  return parsed;
}

async function saveIndex(entries: TaskIndexEntry[]): Promise<void> {
  const serialized = JSON.stringify(entries, null, 2) + '\n';
  await writeFile(INDEX_PATH, serialized, 'utf8');
}

async function loadTaskDetail(entry: TaskIndexEntry): Promise<TaskDetail> {
  const taskPath = path.join(ROOT_DIR, entry.file);
  const raw = await readFile(taskPath, 'utf8');
  const parsed = matter(raw);
  return {
    entry,
    content: parsed.content.trimStart() ? parsed.content.replace(/^\n*/, '') : '',
    data: parsed.data,
  };
}

function printTask(detail: TaskDetail): void {
  const { entry, data, content } = detail;
  const divider = chalk.gray('────────────────────────────────────────────');
  console.log(divider);
  console.log(chalk.bold(`Task ${entry.id}: ${entry.title}`));
  console.log(chalk.gray(`Priority: ${entry.priority} • Status: ${entry.status}`));
  console.log(chalk.gray(`File: ${entry.file}`));
  const meta = { ...data };
  delete meta.content;
  console.log(chalk.gray(`Frontmatter: ${JSON.stringify(meta, null, 2)}`));
  console.log(divider);
  console.log(content.trim() ? content.trim() : chalk.yellow('No prompt content found.'));
  console.log(divider);
}

async function updateTaskStatus(entry: TaskIndexEntry, status: TaskIndexEntry['status']): Promise<void> {
  const taskPath = path.join(ROOT_DIR, entry.file);
  const raw = await readFile(taskPath, 'utf8');
  const parsed = matter(raw);
  parsed.data.status = status;
  const nextMarkdown = matter.stringify(parsed.content.replace(/^\n*/, ''), parsed.data).trimEnd() + '\n';
  await writeFile(taskPath, nextMarkdown, 'utf8');
}

function withUpdatedStatus(entries: TaskIndexEntry[], entry: TaskIndexEntry, status: TaskIndexEntry['status']): TaskIndexEntry[] {
  return entries.map((item) => (item.id === entry.id ? { ...item, status } : item));
}

async function runCommand(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
      }
    });
    child.on('error', (err) => reject(err));
  });
}

async function runGitCommit(entry: TaskIndexEntry): Promise<void> {
  const message = `✅ Task ${entry.id} complete: ${entry.title}`;
  await runCommand('git', ['add', '.']);
  await runCommand('git', ['commit', '-m', message]);
  console.log(chalk.green(`Git commit created: ${message}`));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const headless = args.includes('--headless');

  const index = await loadIndex();
  const pending = index.find((item) => item.status === 'pending');

  if (!pending) {
    console.log(chalk.green('No pending Codex tasks found.'));
    return;
  }

  const detail = await loadTaskDetail(pending);

  if (headless) {
    printTask(detail);
    return;
  }

  printTask(detail);

  const { markInProgress } = await inquirer.prompt<{ markInProgress: boolean }>([
    {
      type: 'confirm',
      name: 'markInProgress',
      message: 'Mark this task as in progress?',
      default: true,
    },
  ]);

  if (!markInProgress) {
    console.log(chalk.yellow('Task left in pending state.'));
    return;
  }

  await updateTaskStatus(pending, 'in-progress');
  await saveIndex(withUpdatedStatus(index, pending, 'in-progress'));
  console.log(chalk.cyan(`Task ${pending.id} marked as in-progress.`));

  const { markComplete } = await inquirer.prompt<{ markComplete: boolean }>([
    {
      type: 'confirm',
      name: 'markComplete',
      message: 'Mark as complete and commit?',
      default: false,
    },
  ]);

  if (!markComplete) {
    return;
  }

  await updateTaskStatus(pending, 'done');
  await saveIndex(withUpdatedStatus(await loadIndex(), pending, 'done'));
  console.log(chalk.green(`Task ${pending.id} marked as done.`));

  try {
    await runGitCommit(pending);
  } catch (error) {
    console.error(chalk.red('Failed to create git commit automatically. Please review manually.'));
    if (error instanceof Error) {
      console.error(chalk.red(error.message));
    }
  }
}

main().catch((error) => {
  console.error(chalk.red('run-codex-task failed:'));
  if (error instanceof Error) {
    console.error(chalk.red(error.message));
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
