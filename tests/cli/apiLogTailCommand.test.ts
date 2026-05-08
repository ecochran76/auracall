import { describe, expect, it } from 'vitest';
import {
  type ApiLogTailResponse,
  formatApiLogTailCliSummary,
  readApiLogTailForCli,
} from '../../src/cli/apiLogTailCommand.js';

const logTailPayload: ApiLogTailResponse = {
  object: 'api_log_tail',
  logPath: '/home/ecochran76/.auracall/logs/api-18080.log',
  exists: true,
  sizeBytes: 2048,
  maxBytes: 64,
  truncated: true,
  content: 'line one\nline two\n',
};

describe('api log tail command helpers', () => {
  it('reads bounded API log tail from the local API', async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      expect(String(url)).toBe('http://127.0.0.1:18080/v1/api/logs/tail?maxBytes=64');
      return Response.json(logTailPayload);
    };

    const summary = await readApiLogTailForCli({
      port: 18080,
      maxBytes: 64,
    }, fetchImpl);

    expect(summary).toEqual({
      host: '127.0.0.1',
      port: 18080,
      logTail: logTailPayload,
    });
  });

  it('formats compact operator output without adding an extra trailing blank line', () => {
    expect(formatApiLogTailCliSummary({
      host: '127.0.0.1',
      port: 18080,
      logTail: logTailPayload,
    })).toBe([
      'AuraCall API log tail (127.0.0.1:18080)',
      'Log: /home/ecochran76/.auracall/logs/api-18080.log',
      'Exists: yes size=2048 maxBytes=64 truncated=yes',
      'line one',
      'line two',
    ].join('\n'));
  });
});
