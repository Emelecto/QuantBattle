"""Read-only health gate, used by the independent scheduled monitor."""
import json
import os
from dotenv import load_dotenv


def main():
    load_dotenv()
    from tournaments import get_supabase
    from operations import readiness_report
    report = readiness_report(get_supabase())
    expected_sha = os.environ.get('GITHUB_SHA')
    if expected_sha:
        current = (report.get('latest_run') or {}).get('commit_sha') == expected_sha
        report['checks'].append({'name': 'referee_matches_monitored_commit', 'passed': current})
        if not current:
            report['status'] = 'attention'
    print(json.dumps(report))
    return 0 if report['status'] == 'ok' else 1


if __name__ == '__main__':
    raise SystemExit(main())
