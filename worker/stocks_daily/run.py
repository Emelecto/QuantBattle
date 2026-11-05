"""CLI entry point. Live generation, historical replay, and optional private upload."""
import argparse
import hashlib
import json
import os
import re
import uuid
import zipfile
from pathlib import Path

import pandas as pd

from worker.stocks_history.client import sha256
from worker.stocks_history.config import OUTPUT as HISTORY, ROOT
from .bundle import export_bundle, verify_bundle
from .cloud import Storage, publish_bundle, save_state
from .core import publication_window, session_plan, snapshot
from .feed import update_history
from .state import bootstrap, read_state, write_state

DEFAULT_ROOT=ROOT/'artifacts'/'stock-daily-v1'


def execute(args):
    if not re.fullmatch(r'v[1-9][0-9]*',args.revision):
        raise ValueError('Revision must be v1, v2, ...')
    root=Path(args.root).resolve()
    root.mkdir(parents=True,exist_ok=True)
    state=Path(args.state).resolve() if args.state else root/'state.zip'
    now=pd.Timestamp.now(tz='UTC')
    if args.seed_cloud:
        if not state.exists():
            bootstrap(state,args.history)
        storage=Storage()
        if storage.get('state/latest.json',optional=True) is not None:
            raise ValueError('Remote state already exists; seed will not replace it')
        save_state(storage,state,None)
        return {'status':'private_state_seeded','state_sha256':sha256(state)}
    if args.replay and (args.cloud or not args.observation_date):
        raise ValueError('Replay needs an observation date and is local-only')
    plan,calendar=session_plan(now,args.observation_date)
    if not args.replay and now>=pd.Timestamp(plan['submission_deadline']):
        if args.due_only:
            return {'status':'skipped','reason':'next-session submission deadline already passed',**plan}
        raise ValueError('A live dataset cannot be generated after its submission deadline; use --replay')
    if args.due_only:
        release,last_release=publication_window(plan)
        if now<release:
            return {'status':'skipped','reason':'before publication window',**plan}
        if now>=last_release:
            return {'status':'skipped','reason':'publication window expired; do not open a late round',**plan}
    storage=None
    previous_pointer=None
    if args.cloud:
        storage=Storage()
        remote=storage.get(f'rounds/{plan["target_date"]}/{args.revision}.json',optional=True)
        if remote:
            pointer=json.loads(remote)
            payload=storage.get(pointer['manifest'])
            if hashlib.sha256(payload).hexdigest()!=pointer['manifest_sha256']:
                raise ValueError('Remote committed manifest checksum differs')
            for name,entry in json.loads(payload)['files'].items():
                data=storage.get(pointer['manifest'].rsplit('/',1)[0]+'/'+name)
                if hashlib.sha256(data).hexdigest()!=entry['sha256']:
                    raise ValueError('Remote committed file checksum differs')
            latest=storage.get('daily/latest.json',optional=True)
            if not latest or json.loads(latest)['target_date']<=plan['target_date']:
                storage.put('daily/latest.json',remote,replace=True,content_type='application/json')
            return {'status':'already_committed',**plan}
        previous_pointer=storage.get('state/latest.json',optional=True)
        if previous_pointer is None:
            raise ValueError('Remote state is missing; run --seed-cloud once from the historical workstation')
        pointer=json.loads(previous_pointer)
        data=storage.get(pointer['key'])
        if hashlib.sha256(data).hexdigest()!=pointer['sha256']:
            raise ValueError('Remote state checksum differs')
        state.parent.mkdir(parents=True,exist_ok=True)
        state.write_bytes(data)
    destination=root/('replays' if args.replay else 'daily')/plan['target_date']/args.revision
    if destination.exists():
        manifest=verify_bundle(destination)
        if storage:
            publish_bundle(storage,destination)
            from .tournament import Repository, register_latest
            register_latest(Repository(storage))
        return {'status':'already_generated','path':str(destination),'rows':manifest['rows'],**plan}
    if not state.exists():
        if storage:
            raise ValueError('Cloud state is missing')
        bootstrap(state,args.history)
    sessions,metadata=read_state(state)
    source_quality={}
    provenance={'input_state_sha256':sha256(state)}
    if args.replay:
        events=metadata['events']
    else:
        directory=root/'_internal'/'runs'/f'{plan["observation_date"]}-{uuid.uuid4().hex}'
        sessions,events,source_quality,index=update_history(sessions,metadata,plan,calendar,directory,now,args.max_catchup)
        provenance['source_receipts_sha256']=sha256(directory/'receipts.json')
        provenance['refresh_start']=index['refresh_start']
        if storage:
            archive=directory.with_suffix('.zip')
            with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_STORED) as package:
                for path in sorted(directory.iterdir()):
                    package.write(path,arcname=path.name)
            source_key=f'sources/{sha256(archive)}.zip'
            storage.put(source_key,archive.read_bytes())
            if hashlib.sha256(storage.get(source_key)).hexdigest()!=sha256(archive):
                raise RuntimeError('Private source archive upload checksum differs')
            provenance['private_source_archive']=source_key
    live,quality=snapshot(sessions,events,plan,calendar,args.min_assets)
    quality['source_quality']=source_quality
    quality['mode']='replay' if args.replay else 'live'
    quality['limitations']=['Fixed 50-stock universe; historical survivorship/selection bias remains.',
        'Single vendor; no independent trade-by-trade reconciliation.',
        'No certification of historical point-in-time vintages.',
        'Historical prices/adjustments refreshed; intraday volumes refreshed over a recent overlap only.',
        'Source revisions do not modify already committed daily files.',
        'Permissions for redistribution/commercial use remain to be confirmed.']
    destination=export_bundle(root/('replays' if args.replay else 'daily'),live,quality,plan,now,
                              mode=quality['mode'],revision=args.revision,provenance=provenance)
    manifest=verify_bundle(destination)
    if not args.replay:
        write_state(state,sessions,events,plan['observation_date'],provenance)
        if storage:
            save_state(storage,state,previous_pointer)
            publish_bundle(storage,destination)
            from .tournament import Repository, register_latest
            register_latest(Repository(storage))
    return {'status':'generated','path':str(destination),'rows':len(live),'columns':37,
            'mode':quality['mode'],'private_cloud_upload':storage is not None,**plan}


def main():
    parser=argparse.ArgumentParser(description='Generate immutable daily stock datasets; CSV primary and Parquet optional.')
    parser.add_argument('--root',type=Path,default=DEFAULT_ROOT)
    parser.add_argument('--state',type=Path)
    parser.add_argument('--history',type=Path,default=HISTORY)
    parser.add_argument('--observation-date',help='YYYY-MM-DD; default latest completed/mature session')
    parser.add_argument('--revision',default='v1')
    parser.add_argument('--replay',action='store_true',help='Local historical reconstruction; never publish as live')
    parser.add_argument('--due-only',action='store_true',help='Skip outside the release/submission window')
    parser.add_argument('--cloud',action='store_true',help='Restore state and commit complete datasets to a private Supabase bucket')
    parser.add_argument('--seed-cloud',action='store_true',help='One-time private upload of the local historical state')
    parser.add_argument('--min-assets',type=int,default=40)
    parser.add_argument('--max-catchup',type=int,default=20)
    args=parser.parse_args()
    try:
        result=execute(args)
    except Exception as exc:
        # Never print HTTP request objects/headers or credentials in an exception.
        if isinstance(exc,(ValueError,RuntimeError,FileNotFoundError,FileExistsError)):
            parser.exit(1,f'Generation failed: {exc}\n')
        parser.exit(1,f'Generation failed: {type(exc).__name__}\n')
    print(json.dumps(result,indent=2),flush=True)


if __name__=='__main__':
    main()
