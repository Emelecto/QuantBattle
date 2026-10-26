"""Decrypt only a source already revealed in a final weekly result manifest.

python worker/scripts/replay_return_evidence.py --results URL --round 1 --output source.json
"""
import argparse
import base64
import json
import sys
from datetime import date
from pathlib import Path

import requests
import pandas as pd
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import weekly_protocol as p
import ml_storage

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--results', required=True)
    parser.add_argument('--round', type=int, required=True, choices=range(1, 5))
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    response = requests.get(args.results, timeout=60)
    response.raise_for_status()
    results = response.json()
    entry = next(r for r in results['rounds'] if r['ordinal'] == args.round)
    evidence = entry['evidence']
    cipher = requests.get(evidence['url'], timeout=60)
    cipher.raise_for_status()
    if p.digest(cipher.content) != evidence['sha256']:
        raise SystemExit('Source commitment mismatch')
    key = base64.b64decode(results['reproduction']['weekly_key_b64'])
    source = p.unseal(cipher.content, key, evidence['original_source_path'])
    bars = {symbol: pd.DataFrame(rows).set_index('day') for symbol, rows in source['bars'].items()}
    parts, _ = p.public_parts(bars, date.fromisoformat(source['observation_day']),
        p.round_key(key, source['round_id']), source['feature_projection'])
    for kind, frame in parts.items():
        if ml_storage.sha256_df(frame) != entry['dataset']['files'][kind]['hash']:
            raise SystemExit(f'Public dataset replay mismatch: {kind}')
    Path(args.output).write_text(json.dumps(source, ensure_ascii=False, indent=2), encoding='utf-8')
    print('Verified and decrypted the final source. Future tournament keys remain private.')
