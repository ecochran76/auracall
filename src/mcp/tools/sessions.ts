import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { sessionStore } from '../../sessionStore.js';
import { sessionsInputSchema } from '../types.js';

const sessionsInputShape = {
  id: z.string().optional(),
  hours: z.number().optional(),
  limit: z.number().optional(),
  includeAll: z.boolean().optional(),
  detail: z.boolean().optional(),
} satisfies z.ZodRawShape;

const sessionsOutputShape = {
  entries: z
    .array(
      z.object({
        id: z.string(),
        createdAt: z.string(),
        status: z.string(),
        model: z.string().optional(),
        mode: z.string().optional(),
      }),
    )
    .optional(),
  total: z.number().optional(),
  truncated: z.boolean().optional(),
  session: z
    .object({
      metadata: z.record(z.string(), z.any()),
      log: z.string(),
      request: z.record(z.string(), z.any()).optional(),
    })
    .optional(),
} satisfies z.ZodRawShape;

export function registerSessionsTool(server: McpServer): void {
  server.registerTool(
    'sessions',
    {
      title: 'List or fetch Aura-Call sessions',
      description:
        'List stored sessions (same defaults as `auracall status`) or, with id/slug, return a summary row. Pass detail:true to include metadata, log, and stored request for that session.',
      inputSchema: sessionsInputShape,
      outputSchema: sessionsOutputShape,
    },
    async (input: unknown) => {
      const textContent = (text: string) => [{ type: 'text' as const, text }];
      const { id, hours = 24, limit = 100, includeAll = false, detail = false } = sessionsInputSchema.parse(input);

      if (id) {
        if (!detail) {
          const metadata = await sessionStore.readSession(id);
          if (!metadata) {
            throw new Error(`Session "${id}" not found.`);
          }
          return {
            content: textContent(`${metadata.createdAt} | ${metadata.status} | ${metadata.model ?? 'n/a'} | ${metadata.id}`),
            structuredContent: {
              entries: [
                {
                  id: metadata.id,
                  createdAt: metadata.createdAt,
                  status: metadata.status,
                  model: metadata.model,
                  mode: metadata.mode,
                },
              ],
              total: 1,
              truncated: false,
            },
          };
        }
        const metadata = await sessionStore.readSession(id);
        if (!metadata) {
          throw new Error(`Session "${id}" not found.`);
        }
        const log = await sessionStore.readLog(id);
        const request = (await sessionStore.readRequest(id)) ?? undefined;
        return {
          content: textContent(log),
          structuredContent: { session: { metadata, log, request } },
        };
      }

      const metas = await sessionStore.listSessions();
      const { entries, truncated, total } = sessionStore.filterSessions(metas, { hours, includeAll, limit });
      return {
        content: [
          {
            type: 'text' as const,
            text: entries.map((entry) => `${entry.createdAt} | ${entry.status} | ${entry.model ?? 'n/a'} | ${entry.id}`).join('\n'),
          },
        ],
        structuredContent: {
          entries: entries.map((entry) => ({
            id: entry.id,
            createdAt: entry.createdAt,
            status: entry.status,
            model: entry.model,
            mode: entry.mode,
          })),
          total,
          truncated,
        },
      };
    },
  );
}
