"""Private Supabase object storage; manifest-last commit. Never serves public URLs."""
import hashlib
import json
import os
import time
from pathlib import Path
from urllib.parse import quote, urlparse

import pandas as pd
import requests



class Storage:
    def __init__(self):
        self.base=os.environ.get('SUPABASE_URL','').rstrip('/')
        key=os.environ.get('SUPABASE_SERVICE_ROLE_KEY','')
        self.bucket=os.environ.get('STOCK_DAILY_BUCKET','stock-datasets-private')
        if urlparse(self.base).scheme != 'https' or not key:
            raise ValueError('Supabase HTTPS URL and server credential are required')
        self.session=requests.Session()
        self.session.headers.update({'apikey':key,'Authorization':f'Bearer {key}'})
        response=self.request('GET','/storage/v1/bucket/'+quote(self.bucket,safe=''),timeout=30)
        if response.status_code!=200 or response.json().get('public') is not False:
            raise ValueError('Stock dataset bucket must exist and be private')

    def request(self,method,path,**kwargs):
        for attempt in range(4):
            try:
                response=self.session.request(method,self.base+path,**kwargs)
            except requests.RequestException:
                if attempt==3:
                    raise RuntimeError('Private storage connection failed') from None
            else:
                if response.status_code!=429 and response.status_code<500:
                    return response
            time.sleep(min(2**attempt,8))
        raise RuntimeError('Private storage retry limit reached')

    def get(self,key,optional=False):
        response=self.request('GET','/storage/v1/object/authenticated/'+quote(self.bucket,safe='')+'/'+quote(key,safe='/'),timeout=60)
        if optional and response.status_code in [400,404]:
            try:
                error=response.json()
            except ValueError:
                error={}
            if response.status_code==404 or str(error.get('statusCode'))=='404' or error.get('code') in ['NoSuchKey','not_found']:
                return None
        if response.status_code!=200:
            raise RuntimeError(f'Private storage download rejected: HTTP {response.status_code}')
        return response.content

    def put(self,key,data,replace=False,content_type='application/octet-stream'):
        response=self.request('POST','/storage/v1/object/'+quote(self.bucket,safe='')+'/'+quote(key,safe='/'),
            data=data,headers={'Content-Type':content_type,'x-upsert':str(replace).lower()},timeout=90)
        if response.status_code in [200,201]:
            return
        if not replace and response.status_code in [400,409]:
            if self.get(key)==data:
                return
        raise RuntimeError(f'Private storage upload rejected: HTTP {response.status_code}')


def save_state(storage,path,previous_pointer):
    data=Path(path).read_bytes()
    digest=hashlib.sha256(data).hexdigest()
    key=f'state/snapshots/{digest}.zip'
    storage.put(key,data)
    if hashlib.sha256(storage.get(key)).hexdigest()!=digest:
        raise RuntimeError('Uploaded state checksum differs')
    if storage.get('state/latest.json',optional=True)!=previous_pointer:
        raise RuntimeError('Concurrent state writer detected; latest pointer not replaced')
    pointer=json.dumps({'key':key,'sha256':digest},sort_keys=True).encode()
    storage.put('state/latest.json',pointer,replace=True,content_type='application/json')
    return pointer


def publish_bundle(storage,directory,clock=None):
    # Generation-only dependencies must not be imported by the small Render API.
    from .bundle import FILES, verify_bundle
    from .core import publication_window
    clock=clock or (lambda:pd.Timestamp.now(tz='UTC'))
    directory=Path(directory)
    manifest=verify_bundle(directory)
    opening,closing=publication_window(manifest)
    if not opening<=clock()<closing:
        raise ValueError('Outside publication window (20:30-22:00 New York)')
    if manifest['mode']!='live' or clock()>=pd.Timestamp(manifest['submission_deadline']):
        raise ValueError('Replay or late bundles cannot be published as live')
    digest=hashlib.sha256((directory/'manifest.json').read_bytes()).hexdigest()
    prefix=f'daily/{manifest["target_date"]}/{manifest["revision"]}/{digest}'
    # Users/backend must discover bundles ONLY through a complete manifest.
    for name in FILES:
        content='text/csv' if name.endswith('.csv') else 'application/json' if name.endswith('.json') else 'application/octet-stream'
        storage.put(f'{prefix}/{name}',(directory/name).read_bytes(),content_type=content)
    for name,entry in manifest['files'].items():
        if hashlib.sha256(storage.get(f'{prefix}/{name}')).hexdigest()!=entry['sha256']:
            raise RuntimeError('Uploaded dataset checksum differs; round not committed')
    storage.put(f'{prefix}/manifest.json',(directory/'manifest.json').read_bytes(),content_type='application/json')
    if hashlib.sha256(storage.get(f'{prefix}/manifest.json')).hexdigest()!=digest:
        raise RuntimeError('Uploaded manifest checksum differs; round not committed')
    if clock()>=pd.Timestamp(manifest['submission_deadline']):
        raise ValueError('Deadline passed during publication')
    if clock()>=closing:
        raise ValueError('Publication window ended; round not committed')
    pointer=json.dumps({'manifest':f'{prefix}/manifest.json',
                        'manifest_sha256':hashlib.sha256((directory/'manifest.json').read_bytes()).hexdigest(),
                        'target_date':manifest['target_date'],'submission_deadline':manifest['submission_deadline']},sort_keys=True).encode()
    storage.put(f'rounds/{manifest["target_date"]}/{manifest["revision"]}.json',pointer,content_type='application/json')
    previous=storage.get('daily/latest.json',optional=True)
    if previous and json.loads(previous)['target_date']>manifest['target_date']:
        raise ValueError('Latest round cannot move backwards')
    if clock()>=pd.Timestamp(manifest['submission_deadline']):
        raise ValueError('Deadline passed before announcing latest round')
    if clock()>=closing:
        raise ValueError('Publication window ended before announcing latest round')
    storage.put('daily/latest.json',pointer,replace=True,content_type='application/json')
