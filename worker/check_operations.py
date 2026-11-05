"""Read-only health gate, used by the independent scheduled monitor."""
import json
import os
from dotenv import load_dotenv


def main():
    load_dotenv()
    from tournaments import get_supabase
    from operations import readiness_report
    report = readiness_report(get_supabase())
    failed = [check['name'] for check in report['checks'] if not check['passed']]
    if 'recent_referee_success' in failed:
        latest = report.get('latest_run') or {}
        if latest.get('status') == 'failed':
            print('::error title=Evaluator failed::The latest referee run failed. Inspect Daily return tournament referee logs.')
        else:
            print('::error title=Evaluator heartbeat overdue::No successful referee execution within 3 hours. Inspect scheduling; this does not establish a Render outage.')
    if 'no_overdue_rounds' in failed:
        print('::error title=Settlement overdue::At least one closed round still needs settlement.')
    if 'no_overdue_publication' in failed:
        print('::error title=Results publication overdue::At least one tournament needs publication.')
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
