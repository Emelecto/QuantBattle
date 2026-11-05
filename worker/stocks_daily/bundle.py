import json
import re
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd

from worker.stocks_history.build import write_parquet
from worker.stocks_history.client import sha256
from worker.stocks_history.config import FEATURES, VERSION
from .core import COLUMNS

FILES = ['live.csv','live.parquet','submission_template.csv','quality_report.json','README.md']


def json_file(path, value):
    Path(path).write_text(json.dumps(value,indent=2,ensure_ascii=False,allow_nan=False,default=str),encoding='utf-8')


def verify_bundle(path):
    path = Path(path)
    manifest = json.loads((path/'manifest.json').read_text(encoding='utf-8'))
    if manifest['feature_contract'] != VERSION or manifest['columns'] != COLUMNS:
        raise ValueError('Bundle feature contract differs')
    if set(manifest['files']) != set(FILES):
        raise ValueError('Unexpected bundle files')
    for name,entry in manifest['files'].items():
        if sha256(path/name) != entry['sha256']:
            raise ValueError(f'Bundle checksum mismatch: {name}')
    parquet = pd.read_parquet(path/'live.parquet')
    csv = pd.read_csv(path/'live.csv',dtype={'id':str,'asset_id':str,'ticker':str},float_precision='round_trip')
    for frame in [csv,parquet]:
        if list(frame.columns) != COLUMNS or len(frame) != manifest['rows'] or frame.isna().any().any():
            raise ValueError('Invalid daily schema/rows')
        for name in ['date','target_date']:
            frame[name] = pd.to_datetime(frame[name])
    pd.testing.assert_frame_equal(csv,parquet,check_dtype=False,check_exact=True)
    if not np.isfinite(parquet[FEATURES]).all().all() or parquet.id.duplicated().any():
        raise ValueError('Invalid daily values/IDs')
    template = pd.read_csv(path/'submission_template.csv',dtype={'id':str})
    if list(template.columns) != ['id','prediction'] or template.id.tolist() != parquet.id.tolist() or not template.prediction.isna().all():
        raise ValueError('Invalid prediction template')
    quality = json.loads((path/'quality_report.json').read_text(encoding='utf-8'))
    if not all(quality['checks'].values()):
        raise ValueError('Daily quality checks failed')
    return manifest


def export_bundle(root, live, quality, plan, generated_at, mode='live', revision='v1', provenance=None):
    if not re.fullmatch(r'v[1-9][0-9]*',revision):
        raise ValueError('Revision must be v1, v2, ...')
    root=Path(root)
    destination=root/plan['target_date']/revision
    if destination.exists():
        raise FileExistsError('Bundle already exists; immutable snapshots cannot be replaced')
    destination.parent.mkdir(parents=True,exist_ok=True)
    # Move only a completely validated directory into its final name.
    with tempfile.TemporaryDirectory(prefix='.building-',dir=destination.parent) as temporary:
        staging=Path(temporary)/'bundle'
        staging.mkdir()
        csv=live.copy()
        for field in ['date','target_date']:
            csv[field]=pd.to_datetime(csv[field]).dt.strftime('%Y-%m-%d')
        csv.to_csv(staging/'live.csv',index=False,lineterminator='\n')
        write_parquet(live,staging/'live.parquet')
        pd.DataFrame({'id':live.id,'prediction':''}).to_csv(staging/'submission_template.csv',index=False,lineterminator='\n')
        json_file(staging/'quality_report.json',quality)
        (staging/'README.md').write_text(
            f'# QuantBattle — dataset diario de acciones\n\n'
            f'Información hasta: **{plan["observation_date"]}**. Sesión a predecir: **{plan["target_date"]}**.\n\n'
            f'Contiene {len(live)} acciones habilitadas y 37 columnas: cinco de identificación y 32 variables compatibles con {VERSION}. '
            f'CSV y Parquet contienen los mismos datos. Fechas ISO; retornos decimales (0.01 = +1%). '
            f'No incluye retornos futuros reales.\n\n'
            f'Entrega: completa prediction en submission_template.csv y conserva los id. '
            f'Predice apertura→cierre de la sesión objetivo. Cierre de envíos: {plan["submission_deadline"]} (UTC).\n\n'
            f'Las exclusiones están en quality_report.json. Las huellas de integridad están en manifest.json. '
            f'Modo: {mode}. Una reconstrucción histórica (replay) no es una ronda prospectiva.\n',encoding='utf-8')
        manifest={'schema_version':1,'feature_contract':VERSION,'mode':mode,'revision':revision,
                  'round_id':f'stocks-oc-{plan["target_date"]}',**plan,
                  'generated_at':pd.Timestamp(generated_at).isoformat(),'rows':len(live),
                  'columns':COLUMNS,'source':'Alpaca SIP','provenance':provenance or {},
                  'prediction_unit':'fractional_open_to_close_return',
                  'files':{name:{'sha256':sha256(staging/name),'bytes':(staging/name).stat().st_size} for name in FILES}}
        json_file(staging/'manifest.json',manifest)
        verify_bundle(staging)
        staging.rename(destination)
    return destination
