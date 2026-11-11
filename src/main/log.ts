import { app } from 'electron';
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

// A small rotating log in the app data folder: logs/nudge.log, then
// nudge.1.log and nudge.2.log for older entries.
//
// What may be logged: events, counts, error messages, and item titles.
// What may not: the Notion token, page content, notes.
const MAX_BYTES = 512 * 1024;
const KEEP = 2;

function logDir(): string {
  return join(app.getPath('userData'), 'logs');
}

function fileName(index: number): string {
  return join(logDir(), index === 0 ? 'nudge.log' : `nudge.${index}.log`);
}

/** Shift nudge.log -> nudge.1.log -> nudge.2.log once the current file is full. */
function rotateIfNeeded(): void {
  const current = fileName(0);
  if (!existsSync(current) || statSync(current).size < MAX_BYTES) return;
  if (existsSync(fileName(KEEP))) unlinkSync(fileName(KEEP));
  for (let i = KEEP - 1; i >= 0; i--) {
    if (existsSync(fileName(i))) renameSync(fileName(i), fileName(i + 1));
  }
}

/** Notion tokens start with "secret_" or "ntn_". Mask anything that looks like one. */
function redact(message: string): string {
  return message.replace(/\b(secret_|ntn_)[A-Za-z0-9_-]{8,}/g, '$1[redacted]');
}

export function log(message: string): void {
  const line = `${new Date().toISOString()} ${redact(message)}\n`;
  try {
    mkdirSync(logDir(), { recursive: true });
    rotateIfNeeded();
    appendFileSync(fileName(0), line);
  } catch {
    // Logging must never break the app (disk full, folder locked).
  }
  if (!app.isPackaged) process.stdout.write(line);
}
