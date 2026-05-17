import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../../src/auracallHome.js';
import {
  acceptDomDriftObservation,
  getDomDriftObservationsPath,
  listDomDriftObservations,
  recordDomDriftObservation,
} from '../../src/browser/domDriftObservations.js';
import { resolveEffectiveServiceUiLabelSet } from '../../src/services/registry.js';

describe('DOM drift observations', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    setAuracallHomeDirOverrideForTest(null);
    await Promise.all(cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })));
  });

  async function useTempAuracallHome() {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-dom-drift-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);
    return homeDir;
  }

  it('records bounded selector drift observations under runtime storage', async () => {
    const homeDir = await useTempAuracallHome();

    const observation = await recordDomDriftObservation({
      service: 'chatgpt',
      surface: 'project-create-dialog',
      action: 'confirm-create-project',
      expectedLabels: ['Create project'],
      observedLabel: 'Create workspace',
      fallbackKind: 'submit-button',
      rootSelector: '[role="dialog"]',
      url: 'https://chatgpt.com/g/g-p-example/project?tab=sources',
      title: 'ChatGPT',
      metadata: { source: 'test' },
      observedAt: '2026-05-13T12:00:00.000Z',
    });

    expect(getDomDriftObservationsPath()).toBe(path.join(homeDir, 'runtime', 'dom-drift-observations.jsonl'));
    expect(observation.object).toBe('auracall_dom_drift_observation');
    expect(observation.status).toBe('observed');
    expect(observation.url).toBe('https://chatgpt.com/g/g-p-example/project');

    const listed = await listDomDriftObservations({ service: 'chatgpt', surface: 'project-create-dialog' });
    expect(listed.object).toBe('auracall_dom_drift_observation_list');
    expect(listed.count).toBe(1);
    expect(listed.data[0]).toMatchObject({
      service: 'chatgpt',
      surface: 'project-create-dialog',
      action: 'confirm-create-project',
      expectedLabels: ['Create project'],
      observedLabel: 'Create workspace',
      fallbackKind: 'submit-button',
    });
  });

  it('returns an empty list when no observation store exists', async () => {
    await useTempAuracallHome();

    await expect(listDomDriftObservations({ limit: 10 })).resolves.toMatchObject({
      object: 'auracall_dom_drift_observation_list',
      count: 0,
      data: [],
    });
  });

  it('accepts a mapped observation into user-scoped service overrides', async () => {
    await useTempAuracallHome();
    const observation = await recordDomDriftObservation({
      service: 'chatgpt',
      surface: 'project-create-dialog',
      action: 'confirm-create-project',
      expectedLabels: ['Create project'],
      observedLabel: 'Create workspace',
      fallbackKind: 'submit-button',
      observedAt: '2026-05-13T12:00:00.000Z',
    });

    const result = await acceptDomDriftObservation(observation.id);

    expect(result).toMatchObject({
      object: 'auracall_dom_drift_observation_acceptance',
      observation: {
        id: observation.id,
        status: 'accepted',
      },
      manifestUpdate: {
        object: 'auracall_service_override_update',
        service: 'chatgpt',
        key: 'project_create_confirm_buttons',
        label: 'Create workspace',
        added: true,
      },
    });
    expect(resolveEffectiveServiceUiLabelSet('chatgpt', 'project_create_confirm_buttons', [])).toEqual(
      expect.arrayContaining(['create project', 'Create workspace']),
    );
    await expect(listDomDriftObservations({ status: 'accepted' })).resolves.toMatchObject({
      count: 1,
      data: [expect.objectContaining({ id: observation.id, status: 'accepted' })],
    });
  });
});
