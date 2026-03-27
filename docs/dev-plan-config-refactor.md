# Configuration System Refactor Plan

## Current State Audit
The current configuration system involves multiple layers of definitions and manual mapping, leading to duplication and potential desynchronization.

### Issues Identified
1.  **Triple Definition:** Options are defined in three places:
    *   `CliOptions` (Commander) in `bin/auracall.ts`.
    *   `UserConfig` (JSON) in `src/config.ts`.
    *   `RunOracleOptions` (Core) in `src/oracle/types.ts`.
2.  **Manual Mapping:** `src/cli/browserDefaults.ts` contains a large `applyBrowserDefaultsFromConfig` function that manually copies values from Config to CLI options.
3.  **Inconsistent Naming:** CLI flags (`--grok-url`) don't always match config paths (`browser.grokUrl`) predictably.
4.  **Scattered Resolution:** Precedence logic (CLI > Config > Env) is repeated in multiple files (`auracall.ts`, `runOptions.ts`, `engine.ts`).

## Proposed Solution: Unified Zod Schema

We will move to a **Single Source of Truth** using a Zod schema.

### 1. `src/schema/config.ts`
Defines the canonical nested configuration structure using Zod.
```typescript
export const ConfigSchema = z.object({
  model: z.string().default('gpt-5.2-pro'),
  browser: z.object({
    headless: z.boolean().default(false),
    grokUrl: z.string().url().optional(),
    // ...
  })
});
```

### 2. `src/schema/cli.ts` (The Bridge)
Defines how CLI flags map to the schema.
```typescript
export const CLI_MAPPING: Record<string, string> = {
  '--model': 'model',
  '--browser-headless': 'browser.headless',
  '--grok-url': 'browser.grokUrl', // Custom alias support
};
```

### 3. `src/schema/resolver.ts` (The Engine)
A central configuration loader that:
1.  Loads JSON config files (System -> User -> Project).
2.  Parses CLI arguments (using Commander or minimist, driven by the CLI Mapping).
3.  Merges them in the correct order.
4.  Validates the result against `ConfigSchema`.
5.  Returns a strongly-typed configuration object.

### Benefits
*   **Type Safety:** `UserConfig` is inferred directly from the schema (`z.infer<typeof ConfigSchema>`).
*   **Documentation:** CLI help text can be generated from Zod descriptions.
*   **Consistency:** "What you can configure in JSON" matches "What you can configure via CLI" automatically.
*   **Durability:** Adding a new option requires editing only one file (`src/schema/config.ts`) and optionally adding a mapping if the CLI flag needs a custom name.

## Implementation Steps
1.  Define the full `ConfigSchema` in `src/schema/config.ts`.
2.  Create the `CLI_MAPPING` definition.
3.  Implement the `Resolver` logic.
4.  Refactor `bin/auracall.ts` to use the `Resolver` instead of manual options.
5.  Delete `src/cli/browserDefaults.ts` and legacy types.
