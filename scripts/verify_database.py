"""Rebuild/test an isolated local Supabase, never a linked or remote database."""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def command(args):
    result = subprocess.run(args, cwd=ROOT, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr.decode('utf-8', errors='replace')[-3000:])
    return result.stdout


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--workdir', required=True, type=Path)
    parser.add_argument('--start', action='store_true')
    parser.add_argument('--bootstrap', action='store_true')
    args = parser.parse_args()
    workdir = args.workdir.resolve()
    config = workdir / 'supabase/config.toml'
    if args.start and not config.exists():
        workdir.mkdir(parents=True, exist_ok=True)
        command(['supabase', 'init', '--workdir', str(workdir)])
    text = config.read_text(encoding='utf-8')
    project = re.search(r'^project_id = "([^"]+)"', text, re.M).group(1)
    if project not in ('quantlab-validation', 'launch-staging'):
        raise RuntimeError('Only dedicated validation projects are allowed')
    if args.start:
        for port in range(54320, 54330):
            text = text.replace(str(port), str(port + 1000))
        text = text.replace('sql_paths = ["./seed.sql"]', 'sql_paths = []')
        config.write_text(text, encoding='utf-8')
        command(['supabase', 'start', '--workdir', str(workdir), '-x',
            'studio,realtime,edge-runtime,imgproxy,logflare,vector,supavisor,inbucket,postgres-meta'])
    files = ([ROOT / 'supabase/schema.sql', *sorted((ROOT / 'supabase/migrations').glob('*.sql'))] if args.bootstrap else [])
    tests = sorted((ROOT / 'supabase/tests').glob('*.sql'))
    checked = []
    for file in [*files, *tests]:
        result = subprocess.run(['docker', 'exec', '-i', f'supabase_db_{project}', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
            input=file.read_bytes(), capture_output=True)
        if result.returncode:
            raise RuntimeError(file.name + ': ' + result.stderr.decode('utf-8', errors='replace')[-3000:])
        print(file.name + ': passed', flush=True)
        checked.append(str(file.relative_to(ROOT)).replace('\\', '/'))
    out = ROOT / 'artifacts/release/database.json'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({'checked_at': datetime.now(timezone.utc).isoformat(), 'environment': 'isolated-local-supabase',
        'commit': command(['git', 'rev-parse', 'HEAD']).decode().strip(),
        'uncommitted_changes': bool(command(['git', 'status', '--porcelain', '--untracked-files=no']).strip()),
        'checks': checked, 'passed': True}, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
