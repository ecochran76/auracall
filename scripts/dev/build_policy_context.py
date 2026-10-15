"""Reviewed AuraCall read-only governance profile; no inferred applicability."""
import argparse
import hashlib
import json
from pathlib import Path

SELECTED = (
    '0001-policy-management.md', '0002-policy-upgrade-management.md',
    '0003-policy-adoption-feedback-loop.md', '0004-notes-and-memories.md',
    '0005-planning-discipline.md', '0017-turn-closeout.md',
    '0018-validation-and-handoff.md', '0021-graph-backed-memory-usage.md',
    '0023-goal-execution-governance.md', '0024-policy-harvest-loop.md',
    '0030-model-selection-and-calibration.md', '0035-policy-context-pilot.md',
)

def build(root):
    policies = sorted((root / 'docs/dev/policies').rglob('*.md'))
    paths = [root / 'AGENTS.md', *policies]
    sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
    inventory = [{'path': str(path.relative_to(root)), 'sha256': sha(path)} for path in paths]
    sources, citations = [], []
    for path in [root / 'AGENTS.md', *(root / 'docs/dev/policies' / name for name in SELECTED)]:
        headings = [line[2:] for line in path.read_text().splitlines() if line.startswith('# ')]
        if not headings:
            raise ValueError(f'No canonical heading: {path}')
        selectors = [{'heading_path': [heading]} for heading in headings]
        relative = str(path.relative_to(root))
        sources.append({'path': relative, 'sha256': sha(path), 'sections': selectors})
        citations.extend({'path': relative, **selector} for selector in selectors)
    fallback = [item['path'] for item in inventory]
    return {'schema_version': 1, 'governance_inventory': inventory,
            'fallback_paths': fallback, 'profiles': [{
                'id': 'policy-investigation',
                'scope': 'Single-agent read-only governance investigation; excludes implementation, browser/provider activity, release, integration and autonomous goal resumption.',
                'task_kinds': ['investigation'], 'sources': sources,
                'fallback_paths': fallback,
                'reread_triggers': ['Scope exceeds read-only governance investigation',
                    'Canonical source, inventory, configuration or current action facts change',
                    'Exact consumed packet is lost'],
                'decision_packet': {'schema_version': 1, 'obligations': [{
                    'id': 'gate.canonical-investigation', 'kind': 'required_gate',
                    'statement': 'Consume and apply every selected canonical section within its conditions; read other task-triggered policies directly when scope expands. This profile grants no effect authority.',
                    'citations': citations}], 'precedence': [], 'conflicts': []}}]}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=Path('.'))
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    root = args.root.resolve()
    target = root / '.governance/policy-context.json'
    data = json.dumps(build(root), indent=2) + '\n'
    if args.check:
        if not target.exists() or target.read_text() != data:
            raise SystemExit('Policy manifest drift; review applicability before rebuilding')
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(data)
    print(json.dumps({'status': 'current', 'profiles': 1}))
