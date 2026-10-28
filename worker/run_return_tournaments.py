"""Idempotent referee/publication tick, scheduled at :00 and :30 UTC in Actions."""
from __future__ import annotations

import json
import logging
import os
import argparse
import uuid
from datetime import datetime, timezone

from dotenv import load_dotenv
load_dotenv()
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true', help='Read-only configuration and schema check')
    args = parser.parse_args()
    from operations import validate_configuration, start_run, finish_run
    validate_configuration()
    from tournaments import get_supabase
    from weekly_engine import run_tick
    sb = get_supabase()
    if args.check:
        for table in ('operation_runs', 'ml_return_weeks', 'ml_return_rounds', 'ml_return_submissions'):
            sb.table(table).select('id').limit(1).execute()
        print(json.dumps({'configuration': 'ok', 'schema': 'ok', 'writes': 0}))
        return
    run_id = os.environ.get('GITHUB_RUN_ID', uuid.uuid4().hex) + '-' + os.environ.get('GITHUB_RUN_ATTEMPT', '1')
    start_run(sb, run_id, os.environ.get('GITHUB_SHA'), datetime.now(timezone.utc))
    try:
        counts = run_tick(sb, allow_create=os.environ.get('ML_DAILY_TOURNAMENTS_CREATE_ENABLED', 'true').lower() == 'true')
        finish_run(sb, run_id, 'success', counts)
        print(json.dumps(counts))
    except Exception:
        finish_run(sb, run_id, 'failed')
        raise


if __name__ == '__main__':
    main()
