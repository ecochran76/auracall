"""Validate actual AuraCall profile against canonical drift in isolated copies."""
import json
from pathlib import Path
import shutil
import tempfile
from governance_context.files import Files

root = Path(__file__).resolve().parents[2]
includes = ['AGENTS.md', 'docs/dev/policies/**/*.md']
results = {}
with tempfile.TemporaryDirectory() as temp:
    copy = Path(temp)
    shutil.copy2(root / 'AGENTS.md', copy / 'AGENTS.md')
    shutil.copytree(root / 'docs/dev/policies', copy / 'docs/dev/policies')
    shutil.copytree(root / '.governance', copy / '.governance')
    def packet(task='investigation'):
        return Files(copy, includes).policy('policy-investigation', task, include_source_text=True)
    def rejected(name, task='investigation'):
        value = packet(task)
        assert value['fallback_required'] and value['sources'] == [], name
        results[name] = 'pass'
    value = packet()
    assert value['status'] == 'current' and value['fallback_required'] is False
    results['current'] = 'pass'
    for source in value['sources']:
        assert all(section['text'] for section in source['sections'])
    goal = copy / 'docs/dev/policies/0023-goal-execution-governance.md'
    saved = goal.read_bytes()
    goal.write_bytes(saved + b'\nChanged canonical obligation.\n')
    rejected('changed_source')
    goal.write_bytes(saved)
    added = goal.parent / '0099-added.md'
    added.write_text('# Added policy\n')
    rejected('added_policy')
    added.unlink()
    goal.unlink()
    rejected('missing_policy')
    goal.write_bytes(saved)
    rejected('out_of_scope_task', 'implementation')
    assert packet()['status'] == 'current'
print(json.dumps({'status': 'pass', 'cases': results}, indent=2))
