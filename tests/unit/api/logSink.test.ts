import { afterEach, describe, expect, it, vi } from 'vitest';
import { log, setLogSink, type LogSink } from '@/lib/log';

// The log's own outputs stay quiet; only the sink is under test. Hoisted above the imports:
// lib/log.ts reads LOG_FILE once, when it loads, and would otherwise write to logs/.
vi.hoisted(() => {
  process.env.LOG_FILE = 'false';
});
vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

afterEach(() => setLogSink(undefined));

describe('the log sink (what hands each line to Sentry)', () => {
  it('receives every written line with its level, message and context', () => {
    const sink = vi.fn<LogSink>();
    setLogSink(sink);
    const err = new Error('boom');
    log.info('request', { route: 'GET /api/x', status: 200 });
    log.error('GET /api/x failed', { route: 'GET /api/x', err });
    expect(sink).toHaveBeenCalledWith('info', 'request', { route: 'GET /api/x', status: 200 });
    expect(sink).toHaveBeenCalledWith('error', 'GET /api/x failed', { route: 'GET /api/x', err });
  });

  it('is skipped below LOG_LEVEL, like the line itself', () => {
    const sink = vi.fn<LogSink>();
    setLogSink(sink);
    log.debug('noise');
    expect(sink).not.toHaveBeenCalled();
  });

  it('never turns a failing tracker into a failing request', () => {
    setLogSink(() => {
      throw new Error('tracker down');
    });
    expect(() => log.error('still logged')).not.toThrow();
  });
});
