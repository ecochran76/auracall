import { describe, expect, it } from 'vitest';
import { createApiLogTailToolHandler } from '../src/mcp/tools/apiLogTail.js';

const logTailPayload = {
  object: 'api_log_tail',
  logPath: '/home/ecochran76/.auracall/logs/api-18080.log',
  exists: true,
  sizeBytes: 4096,
  maxBytes: 128,
  truncated: true,
  content: 'service started\nGET /status\n',
};

describe('mcp api_log_tail tool', () => {
  it('reads bounded API log tail from the local API', async () => {
    const handler = createApiLogTailToolHandler({
      fetchImpl: async (url: string | URL | Request) => {
        expect(String(url)).toBe('http://127.0.0.1:18080/v1/api/logs/tail?maxBytes=128');
        return Response.json(logTailPayload);
      },
    });

    const result = await handler({
      port: 18080,
      maxBytes: 128,
    });

    expect(result).toMatchObject({
      isError: false,
      content: [
        {
          type: 'text',
          text: 'AuraCall API log tail 127.0.0.1:18080; exists=yes; size=4096; maxBytes=128; truncated=yes; log=/home/ecochran76/.auracall/logs/api-18080.log',
        },
      ],
      structuredContent: {
        host: '127.0.0.1',
        port: 18080,
        logTail: logTailPayload,
      },
    });
  });
});
