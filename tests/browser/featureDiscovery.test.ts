import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  diffBrowserFeaturesContracts,
  readBrowserFeaturesSnapshot,
  resolveBrowserFeaturesBaseline,
  writeBrowserFeaturesSnapshot,
} from '../../src/browser/featureDiscovery.js';
import type { AuracallBrowserFeaturesContract } from '../../src/browser/profileDoctor.js';

describe('featureDiscovery', () => {
  const cleanup: string[] = [];
  const originalAuracallHome = process.env.AURACALL_HOME_DIR;

  afterEach(async () => {
    process.env.AURACALL_HOME_DIR = originalAuracallHome;
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

  it('writes and resolves browser feature snapshots', async () => {
    const homeRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-feature-snapshot-'));
    cleanup.push(homeRoot);
    process.env.AURACALL_HOME_DIR = homeRoot;
    const contract: AuracallBrowserFeaturesContract = {
      contract: 'auracall.browser-features',
      version: 1,
      generatedAt: '2026-04-07T02:00:00.000Z',
      target: 'gemini',
      featureStatus: {
        target: 'gemini',
        supported: true,
        attempted: true,
        featureSignature: '{"detector":"gemini-feature-probe-v1","modes":["canvas"]}',
        detected: { detector: 'gemini-feature-probe-v1', modes: ['canvas'] },
        error: null,
        reason: null,
      },
      runtime: {
        browserTools: null,
        browserToolsError: null,
      },
    };

    const writeResult = await writeBrowserFeaturesSnapshot(contract, {
      auracallProfile: 'default',
      label: 'smoke',
    });

    expect(writeResult.snapshotPath).toContain('smoke');
    const latest = await readBrowserFeaturesSnapshot(writeResult.latestPath);
    expect(latest.target).toBe('gemini');

    const baseline = await resolveBrowserFeaturesBaseline('gemini', {
      auracallProfile: 'default',
    });
    expect(baseline.path).toBe(writeResult.latestPath);
    expect(baseline.contract.generatedAt).toBe('2026-04-07T02:00:00.000Z');
  });

  it('diffs feature modes, toggles, menu items, and upload candidates', () => {
    const baseline: AuracallBrowserFeaturesContract = {
      contract: 'auracall.browser-features',
      version: 1,
      generatedAt: '2026-04-07T02:00:00.000Z',
      target: 'gemini',
      featureStatus: {
        target: 'gemini',
        supported: true,
        attempted: true,
        featureSignature: '{"detector":"gemini-feature-probe-v1","modes":["canvas"],"toggles":{"personal intelligence":true}}',
        detected: {
          detector: 'gemini-feature-probe-v1',
          modes: ['canvas'],
          toggles: { 'personal intelligence': true },
        },
        error: null,
        reason: null,
      },
      runtime: {
        browserTools: {
          contract: 'browser-tools.doctor-report',
          version: 1,
          generatedAt: '2026-04-07T02:00:00.000Z',
          report: {
            census: {
              selectedIndex: -1,
              selectedReason: null,
              selectedTab: null,
              tabs: [],
              candidates: [],
            },
            pageProbe: null,
            uiList: {
              url: 'https://gemini.google.com/app',
              title: 'Gemini',
              totalScanned: 10,
              summary: {
                buttons: 0,
                menuItems: 1,
                switches: 1,
                inputs: 0,
                links: 0,
                dialogs: 0,
                menus: 1,
                fileInputs: 0,
                uploadCandidates: 1,
              },
              sections: {
                buttons: [],
                menuItems: [
                  {
                    tag: 'button',
                    role: 'menuitemcheckbox',
                    text: 'Canvas',
                    ariaLabel: null,
                    title: null,
                    dataTestId: null,
                    className: null,
                    href: null,
                    checked: false,
                    expanded: null,
                    disabled: false,
                    visible: true,
                    inputType: null,
                    widgetType: 'menu-item',
                    pathHint: null,
                    interactionHints: [],
                  },
                ],
                switches: [],
                inputs: [],
                links: [],
                dialogs: [],
                menus: [],
                fileInputs: [],
                uploadCandidates: [
                  {
                    tag: 'button',
                    role: null,
                    text: null,
                    ariaLabel: 'Open upload file menu',
                    title: null,
                    dataTestId: null,
                    className: null,
                    href: null,
                    checked: null,
                    expanded: null,
                    disabled: null,
                    visible: true,
                    inputType: null,
                    widgetType: 'upload-trigger',
                    pathHint: null,
                    interactionHints: [],
                  },
                ],
              },
            },
          },
        },
        browserToolsError: null,
      },
    };

    const baselineBrowserTools = baseline.runtime.browserTools!;
    const baselineUiList = baselineBrowserTools.report.uiList;
    if (!baselineUiList) {
      throw new Error('baseline browser tools UI list is required for this test');
    }
    const current: AuracallBrowserFeaturesContract = {
      ...baseline,
      generatedAt: '2026-04-07T02:05:00.000Z',
      featureStatus: {
        ...baseline.featureStatus!,
        featureSignature:
          '{"detector":"gemini-feature-probe-v1","modes":["canvas","create video"],"toggles":{"personal intelligence":false,"deep mode":true}}',
        detected: {
          detector: 'gemini-feature-probe-v1',
          modes: ['canvas', 'create video'],
          toggles: {
            'personal intelligence': false,
            'deep mode': true,
          },
        },
      },
      runtime: {
        browserTools: {
          ...baselineBrowserTools,
          report: {
            ...baselineBrowserTools.report,
            uiList: {
              ...baselineUiList,
              summary: {
                ...baselineUiList.summary,
                menuItems: 2,
                uploadCandidates: 2,
              },
              sections: {
                ...baselineUiList.sections,
                menuItems: [
                  ...baselineUiList.sections.menuItems,
                  {
                    tag: 'button',
                    role: 'menuitemcheckbox',
                    text: 'Create video',
                    ariaLabel: null,
                    title: null,
                    dataTestId: null,
                    className: null,
                    href: null,
                    checked: false,
                    expanded: null,
                    disabled: false,
                    visible: true,
                    inputType: null,
                    widgetType: 'menu-item',
                    pathHint: null,
                    interactionHints: [],
                  },
                ],
                uploadCandidates: [
                  ...baselineUiList.sections.uploadCandidates,
                  {
                    tag: 'button',
                    role: null,
                    text: null,
                    ariaLabel: null,
                    title: null,
                    dataTestId: 'hidden-local-file-upload-button',
                    className: null,
                    href: null,
                    checked: null,
                    expanded: null,
                    disabled: null,
                    visible: false,
                    inputType: null,
                    widgetType: 'upload-trigger',
                    pathHint: null,
                    interactionHints: [],
                  },
                ],
              },
            },
          },
        },
        browserToolsError: null,
      },
    };

    const diff = diffBrowserFeaturesContracts(baseline, current, {
      baselinePath: '/tmp/latest.json',
    });

    expect(diff.changed).toBe(true);
    expect(diff.changes.modes.added).toEqual(['create-video']);
    expect(diff.changes.toggles.added).toEqual({ 'deep-mode': true });
    expect(diff.changes.toggles.changed).toEqual([
      { key: 'personal-intelligence', before: true, after: false },
    ]);
    expect(diff.changes.menuItems.added).toEqual(['create-video']);
    expect(diff.changes.uploadCandidates.added).toEqual(['hidden-local-file-upload-button']);
  });
});
