"""Idempotent referee/publication tick, scheduled at :00 and :30 UTC in Actions."""
from __future__ import annotations

import json
import logging
import os

from dotenv import load_dotenv
load_dotenv()
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

if __name__ == '__main__':
    if os.environ.get('ML_DAILY_TOURNAMENTS_ENABLED', '').lower() != 'true':
        raise SystemExit('Daily real tournaments are disabled')
    from tournaments import get_supabase
    from weekly_engine import run_tick
    print(json.dumps(run_tick(get_supabase())))
