import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import path from 'node:path';

/**
 * Structured logging for the server.
 *
 * One JSON object per line, written to stdout (which PM2 captures) and appended to a daily
 * file under `LOG_DIR` (default `logs/`, git-ignored). No external service is involved: this
 * is the file-based stand-in until an error tracker is wired in, and it is what to `tail`
 * when something goes wrong on the VPS.
 *
 * Server-side only — it touches the filesystem. Route handlers reach it through `handle()`
 * in `lib/api/route.ts`, which logs every request and every unhandled exception.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const minLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel | undefined) ?? 'info';
const logDir = process.env.LOG_DIR ?? path.join(process.cwd(), 'logs');
const toStdout = process.env.LOG_STDOUT !== 'false';
const toFile = process.env.LOG_FILE !== 'false';

let stream: WriteStream | null = null;
let streamDay = '';

/** One file per calendar day, opened lazily so a read-only filesystem only breaks logging. */
function fileFor(now: Date): WriteStream | null {
  if (!toFile) return null;
  const day = now.toISOString().slice(0, 10);
  if (stream && streamDay === day) return stream;
  try {
    mkdirSync(logDir, { recursive: true });
    stream?.end();
    stream = createWriteStream(path.join(logDir, `app-${day}.log`), { flags: 'a' });
    stream.on('error', () => {
      stream = null;
    });
    streamDay = day;
    return stream;
  } catch {
    return null;
  }
}

function serialize(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

function write(level: LogLevel, msg: string, context?: Record<string, unknown>): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[minLevel]) return;
  const now = new Date();
  const entry: Record<string, unknown> = { time: now.toISOString(), level, msg };
  if (context) {
    for (const [key, value] of Object.entries(context)) entry[key] = serialize(value);
  }
  const line = JSON.stringify(entry);

  if (toStdout) {
    if (level === 'error' || level === 'warn') process.stderr.write(line + '\n');
    else process.stdout.write(line + '\n');
  }
  fileFor(now)?.write(line + '\n');
}

export const log = {
  debug: (msg: string, context?: Record<string, unknown>) => write('debug', msg, context),
  info: (msg: string, context?: Record<string, unknown>) => write('info', msg, context),
  warn: (msg: string, context?: Record<string, unknown>) => write('warn', msg, context),
  error: (msg: string, context?: Record<string, unknown>) => write('error', msg, context),
};
