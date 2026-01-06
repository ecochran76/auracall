import type { Project, Conversation } from './domain.js';
import type { BrowserProvider } from './types.js';

export function createGrokAdapter(): Pick<
  BrowserProvider,
  'listProjects' | 'listConversations' | 'capabilities'
> {
  return {
    capabilities: {
      projects: true,
      conversations: true,
    },
    async listProjects(): Promise<Project[]> {
      // TODO: Implement browser-driven listing via Grok UI.
      return [];
    },
    async listConversations(_projectId?: string): Promise<Conversation[]> {
      // TODO: Implement browser-driven listing via Grok UI.
      return [];
    },
  };
}
