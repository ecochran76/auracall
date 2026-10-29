import vm from 'node:vm';
import {expect, test} from 'vitest';
import {remoteViewEmbedScript} from '../src/http/remoteViewEmbedScript.js';

test('desktop embed delegates clipboard access to the exact viewer frame', () => {
  const document = {createElement: () => ({append() {}, setAttribute() {}, dataset: {}})};
  const window: Record<string, any> = {addEventListener() {}};
  vm.runInNewContext(remoteViewEmbedScript, {window, document, URL, setTimeout() {return 1;}, clearTimeout() {}});
  const viewer = window.RemoteViewEmbed.mount({append() {}}, {
    url: 'https://viewer.test/embed/11111111-1111-4111-8111-111111111111',
  });
  expect(viewer.frame.allow).toBe('fullscreen; clipboard-read; clipboard-write');
  expect(viewer.frame.src).toBe('https://viewer.test/embed/11111111-1111-4111-8111-111111111111');
  expect(viewer.frame.referrerPolicy).toBe('no-referrer');
});
