import { z } from 'zod';
import { AURACALL_STEP_OUTPUT_CONTRACT_VERSION } from '../runtime/stepOutputContract.js';
import { TaskRunSpecSchema } from '../teams/schema.js';

export const consultInputSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required.'),
  files: z.array(z.string()).default([]),
  model: z.string().optional(),
  models: z.array(z.string()).optional(),
  engine: z.enum(['api', 'browser']).optional(),
  browserModelLabel: z.string().optional(),
  search: z.boolean().optional(),
  slug: z.string().optional(),
});

export type ConsultInput = z.infer<typeof consultInputSchema>;

export const sessionsInputSchema = z.object({
  id: z.string().optional(),
  hours: z.number().optional(),
  limit: z.number().optional(),
  includeAll: z.boolean().optional(),
  detail: z.boolean().optional(),
});

export type SessionsInput = z.infer<typeof sessionsInputSchema>;

export const teamRunInputSchema = z.object({
  teamId: z.string().min(1).optional(),
  objective: z.string().min(1).optional(),
  title: z.string().min(1).nullable().optional(),
  promptAppend: z.string().min(1).nullable().optional(),
  structuredContext: z.record(z.string(), z.unknown()).nullable().optional(),
  responseFormat: z.enum(['text', 'markdown', 'json']).optional(),
  outputContract: z.literal(AURACALL_STEP_OUTPUT_CONTRACT_VERSION).nullable().optional(),
  maxTurns: z.number().int().positive().nullable().optional(),
  localActionPolicy: z
    .object({
      allowedShellCommands: z.array(z.string().min(1)).optional(),
      allowedCwdRoots: z.array(z.string().min(1)).optional(),
      mode: z.enum(['allowed', 'approval-required']).optional(),
    })
    .nullable()
    .optional(),
  taskRunSpec: TaskRunSpecSchema.optional(),
}).superRefine((value, ctx) => {
  if (!value.taskRunSpec) {
    if (!value.teamId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'teamId is required when taskRunSpec is not provided',
        path: ['teamId'],
      });
    }
    if (!value.objective) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'objective is required when taskRunSpec is not provided',
        path: ['objective'],
      });
    }
    return;
  }

  if (value.teamId && value.teamId.trim() !== value.taskRunSpec.teamId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'teamId must match taskRunSpec.teamId when both are provided',
      path: ['teamId'],
    });
  }

  const compactAssignmentFieldNames = [
    'objective',
    'title',
    'promptAppend',
    'structuredContext',
    'responseFormat',
    'outputContract',
    'maxTurns',
    'localActionPolicy',
  ] as const;
  const conflictingFields = compactAssignmentFieldNames.filter((field) => value[field] !== undefined);
  if (conflictingFields.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `taskRunSpec cannot be combined with compact assignment fields: ${conflictingFields.join(', ')}`,
      path: ['taskRunSpec'],
    });
  }
});

export type TeamRunInput = z.infer<typeof teamRunInputSchema>;
