#!/usr/bin/env tsx

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

type CandidateAction = 'keep' | 'merge' | 'retire';

type Candidate = {
  path: string;
  basename: string;
  action: CandidateAction;
  score: number;
  reasons: string[];
  mtime: string;
  ctime: string;
  daysSinceMtime: number;
  referenceCounts: {
    roadmap: number;
    runbook: number;
    agents: number;
  };
  contentSignals: {
    hasCurrentState: boolean;
    hasAcceptanceCriteria: boolean;
    hasNonGoals: boolean;
    hasDefinitionOfDone: boolean;
    hasPlanState: boolean;
    mentionsSuperseded: boolean;
    mentionsTemplate: boolean;
  };
  proposedPlanPath: string | null;
};

type Report = {
  generatedAt: string;
  repoRoot: string;
  authorities: {
    roadmapPath: string;
    runbookPath: string;
    plansDir: string;
  };
  summary: {
    candidateCount: number;
    keepCount: number;
    mergeCount: number;
    retireCount: number;
  };
  candidates: Candidate[];
};

const scriptDir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const repoRoot = resolve(scriptDir, '..');
const docsDevDir = join(repoRoot, 'docs', 'dev');
const plansDir = join(docsDevDir, 'plans');
const roadmapPath = join(repoRoot, 'ROADMAP.md');
const runbookPath = join(repoRoot, 'RUNBOOK.md');
const agentsPath = join(repoRoot, 'AGENTS.md');

const jsonMode = process.argv.includes('--json');

function walkMarkdownFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === 'policies' ||
        entry.name === 'notes' ||
        entry.name === 'memories' ||
        entry.name === 'legacy-archive'
      ) {
        continue;
      }
      out.push(...walkMarkdownFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(fullPath);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function isPlanCandidate(absPath: string): boolean {
  const rel = relative(repoRoot, absPath).replaceAll('\\', '/');
  const basename = rel.split('/').at(-1) ?? rel;
  if (rel.startsWith('docs/dev/plans/')) {
    return true;
  }
  return (
    basename.endsWith('-plan.md') ||
    basename.endsWith('-roadmap.md') ||
    basename.endsWith('-runbook.md') ||
    basename === 'next-execution-plan.md'
  );
}

function countMentions(haystack: string, relPath: string): number {
  const basename = relPath.split('/').at(-1) ?? relPath;
  let count = 0;
  if (haystack.includes(relPath)) {
    count += 2;
  }
  if (haystack.includes(basename)) {
    count += 1;
  }
  return count;
}

function inferSlug(basename: string): string {
  return basename
    .replace(/\.md$/i, '')
    .replace(/-(plan|roadmap|runbook)$/i, '')
    .replace(/^next-execution$/i, 'execution')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function formatDateFromIso(isoDate: string): string {
  return isoDate.slice(0, 10);
}

const roadmapText = readFileSync(roadmapPath, 'utf8');
const runbookText = readFileSync(runbookPath, 'utf8');
const agentsText = readFileSync(agentsPath, 'utf8');

const rawCandidates = walkMarkdownFiles(docsDevDir)
  .filter(isPlanCandidate)
  .map((absPath) => {
    const relPath = relative(repoRoot, absPath).replaceAll('\\', '/');
    const basename = relPath.split('/').at(-1) ?? relPath;
    const stats = statSync(absPath);
    const text = readFileSync(absPath, 'utf8');
    const referenceCounts = {
      roadmap: countMentions(roadmapText, relPath),
      runbook: countMentions(runbookText, relPath),
      agents: countMentions(agentsText, relPath),
    };
    const contentSignals = {
      hasCurrentState: /\bCurrent State\b/i.test(text),
      hasAcceptanceCriteria: /\bAcceptance Criteria\b/i.test(text),
      hasNonGoals: /\bNon-Goals\b/i.test(text),
      hasDefinitionOfDone: /\bDefinition of Done\b/i.test(text),
      hasPlanState: /\b(PLANNED|OPEN|CLOSED|CANCELLED)\b/.test(text),
      mentionsSuperseded: /\b(superseded|deprecated|historical|maintenance mode)\b/i.test(text),
      mentionsTemplate: /template/i.test(basename),
    };
    return {
      absPath,
      relPath,
      basename,
      stats,
      referenceCounts,
      contentSignals,
    };
  });

const sortedByMtime = [...rawCandidates].sort((a, b) => {
  if (b.stats.mtimeMs !== a.stats.mtimeMs) {
    return b.stats.mtimeMs - a.stats.mtimeMs;
  }
  return a.relPath.localeCompare(b.relPath);
});

const recencyRanks = new Map(sortedByMtime.map((candidate, index) => [candidate.relPath, index + 1]));
const nowMs = Date.now();

function classifyCandidate(candidate: (typeof rawCandidates)[number]): Candidate {
  const relPath = candidate.relPath;
  const isCanonical = relPath.startsWith('docs/dev/plans/');
  const rank = recencyRanks.get(relPath) ?? rawCandidates.length;
  const daysSinceMtime = Math.floor((nowMs - candidate.stats.mtimeMs) / 86_400_000);
  let score = 0;
  const reasons: string[] = [];

  if (isCanonical) {
    score += 100;
    reasons.push('already in canonical plans directory');
  } else {
    reasons.push('loose plan candidate outside canonical plans directory');
  }

  if (candidate.referenceCounts.roadmap > 0) {
    score += 35;
    reasons.push('referenced from ROADMAP.md');
  }
  if (candidate.referenceCounts.runbook > 0) {
    score += 25;
    reasons.push('referenced from RUNBOOK.md');
  }
  if (candidate.referenceCounts.agents > 0) {
    score += 10;
    reasons.push('referenced from AGENTS.md');
  }
  if (candidate.basename === 'next-execution-plan.md') {
    score += 20;
    reasons.push('active execution-board plan');
  }

  if (rank <= 5) {
    score += 20;
    reasons.push(`recent by mtime rank (${rank})`);
  } else if (rank <= 12) {
    score += 10;
    reasons.push(`still relatively recent by mtime rank (${rank})`);
  } else if (daysSinceMtime > 60) {
    reasons.push(`older by mtime (${daysSinceMtime}d)`);
  }

  if (candidate.contentSignals.hasCurrentState) {
    score += 8;
    reasons.push('contains Current State');
  }
  if (candidate.contentSignals.hasAcceptanceCriteria) {
    score += 8;
    reasons.push('contains Acceptance Criteria');
  }
  if (candidate.contentSignals.hasPlanState) {
    score += 8;
    reasons.push('contains explicit plan state');
  }
  if (candidate.contentSignals.mentionsTemplate) {
    score -= 25;
    reasons.push('looks like a template');
  }
  if (candidate.contentSignals.mentionsSuperseded && candidate.basename !== 'next-execution-plan.md') {
    score -= 15;
    reasons.push('mentions superseded or maintenance-only posture');
  }

  let action: CandidateAction;
  if (isCanonical) {
    action = 'keep';
  } else if (score >= 35) {
    action = 'merge';
  } else {
    action = 'retire';
  }

  return {
    path: relPath,
    basename: candidate.basename,
    action,
    score,
    reasons,
    mtime: new Date(candidate.stats.mtimeMs).toISOString(),
    ctime: new Date(candidate.stats.ctimeMs).toISOString(),
    daysSinceMtime,
    referenceCounts: candidate.referenceCounts,
    contentSignals: candidate.contentSignals,
    proposedPlanPath: null,
  };
}

const candidates = rawCandidates.map(classifyCandidate).sort((a, b) => {
  const actionOrder = { keep: 0, merge: 1, retire: 2 };
  if (actionOrder[a.action] !== actionOrder[b.action]) {
    return actionOrder[a.action] - actionOrder[b.action];
  }
  if (b.score !== a.score) {
    return b.score - a.score;
  }
  return a.path.localeCompare(b.path);
});

const mergeCandidates = candidates.filter((candidate) => candidate.action === 'merge');
for (const [index, candidate] of mergeCandidates.entries()) {
  const serial = String(index + 1).padStart(4, '0');
  const slug = inferSlug(candidate.basename);
  const date = formatDateFromIso(candidate.mtime);
  candidate.proposedPlanPath = `docs/dev/plans/${serial}-${date}-${slug}.md`;
}

const report: Report = {
  generatedAt: new Date().toISOString(),
  repoRoot,
  authorities: {
    roadmapPath: relative(repoRoot, roadmapPath).replaceAll('\\', '/'),
    runbookPath: relative(repoRoot, runbookPath).replaceAll('\\', '/'),
    plansDir: relative(repoRoot, plansDir).replaceAll('\\', '/'),
  },
  summary: {
    candidateCount: candidates.length,
    keepCount: candidates.filter((candidate) => candidate.action === 'keep').length,
    mergeCount: mergeCandidates.length,
    retireCount: candidates.filter((candidate) => candidate.action === 'retire').length,
  },
  candidates,
};

if (jsonMode) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

console.log('Plan library migration audit');
console.log(`Repo: ${report.repoRoot}`);
console.log(`Candidates: ${report.summary.candidateCount}`);
console.log(
  `Actions: keep=${report.summary.keepCount} merge=${report.summary.mergeCount} retire=${report.summary.retireCount}`
);

for (const candidate of candidates) {
  console.log(`\n[${candidate.action.toUpperCase()}] ${candidate.path}`);
  console.log(`  score=${candidate.score} mtime=${candidate.mtime} refs=${JSON.stringify(candidate.referenceCounts)}`);
  if (candidate.proposedPlanPath) {
    console.log(`  proposedPlanPath=${candidate.proposedPlanPath}`);
  }
  console.log(`  reasons=${candidate.reasons.join('; ')}`);
}
