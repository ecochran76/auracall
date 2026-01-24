import { resolveConfig } from '../src/schema/resolver.js';
import { BrowserService } from '../src/browser/service/browserService.js';

async function main() {
  const urlArg = process.argv.find((arg) => arg.startsWith('--url='));
  const url = urlArg ? urlArg.split('=')[1] : undefined;
  const userConfig = await resolveConfig({}, process.cwd(), process.env);
  const browserService = BrowserService.fromConfig(userConfig);
  const target = await browserService.resolveDevToolsTarget({
    ensurePort: true,
    launchUrl: url,
  });
  if (!target.port) {
    throw new Error('Failed to start or resolve a DevTools session.');
  }
  const host = target.host ?? '127.0.0.1';
  const status = target.launched ? 'launched' : 'reused';
  console.log(`DevTools session ${status} at ${host}:${target.port}`);
}

void main();
