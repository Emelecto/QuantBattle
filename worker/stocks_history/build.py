"""Build and audit train/validation from immutable local market-data responses."""
import argparse
import csv
import importlib.metadata
import json
import platform
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from .client import download, fetch_actions, fetch_auctions, fetch_spin_adjustments, now, sha256
from .config import (ASOF, FEATURES, FIRST_TARGET, GROUPS, METADATA, OUTPUT,
                     RAW_END, RAW_START, REVIEWED_CONTINUITIES, REVIEWED_TRANSITIONS, ROOT, SYMBOLS, TARGET, TRAIN_END,
                     VALIDATION_START, VERSION)
from .pipeline import (calendar, daily_prices, labeled_rows, load_bars,
                       make_daily, make_features, split_rows)


def write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False,
                                    default=str), encoding='utf-8')


def transitions(schedule, action_data=None, raw_by_symbol=None, spin_by_symbol=None):
    events = {symbol: set() for symbol in SYMBOLS}
    for event in REVIEWED_TRANSITIONS:
        events[event['ticker']].add(event['date'])
    action_data = fetch_actions() if action_data is None else action_data
    for page in action_data.get('pages', []):
        for kind, rows in page['payload'].get('corporate_actions', {}).items():
            for row in rows:
                affected = None
                if kind == 'spin_offs':
                    affected = row.get('source_symbol')
                elif kind in ['cash_mergers', 'stock_mergers', 'stock_and_cash_mergers']:
                    affected = row.get('acquiree_symbol')
                elif kind in ['reorganizations']:
                    affected = row.get('symbol')
                elif kind == 'name_changes' and row.get('old_symbol') == row.get('new_symbol') and row.get('old_cusip') != row.get('new_cusip'):
                    reviewed = any(item['ticker'] == row.get('new_symbol')
                                   and item['provider_process_date'] == row.get('process_date')
                                   and item['old_cusip'] == row.get('old_cusip')
                                   and item['new_cusip'] == row.get('new_cusip')
                                   for item in REVIEWED_CONTINUITIES)
                    if reviewed:
                        continue
                    affected = row.get('new_symbol')
                if affected in events:
                    date = row.get('ex_date') or row.get('effective_date') or row.get('process_date')
                    if date and RAW_START <= date <= str(schedule.index[-1].date()):
                        events[affected].add(date)
    spin_bars = {symbol: [] for symbol in SYMBOLS + ['SPY']}
    files = sorted((OUTPUT / '_internal' / 'spin_adjustment_pages').glob('*.json')) if spin_by_symbol is None else []
    if spin_by_symbol is None and not files:
        raise ValueError('Spin-off adjustment audit not downloaded')
    for path in files:
        record = json.loads(path.read_text())
        for symbol, rows in (record['payload'].get('bars') or {}).items():
            spin_bars[symbol].extend(rows)
    if files and record['payload'].get('next_page_token'):
        raise ValueError('Incomplete spin-off adjustment audit')
    for symbol in SYMBOLS:
        raw = raw_by_symbol[symbol] if raw_by_symbol is not None else daily_prices(load_bars(symbol, 'daily_raw'), schedule)
        if spin_by_symbol is None:
            frame = pd.DataFrame(spin_bars[symbol]).rename(columns={'t': 'timestamp', 'c': 'close'})
            frame['timestamp'] = pd.to_datetime(frame.timestamp, utc=True)
            adjusted = daily_prices(frame, schedule)
        else:
            adjusted = spin_by_symbol[symbol]
        factor = raw.close / adjusted.close
        # Provider rounding can cause small residual changes; mechanical
        # adjustment transitions of 0.1% or more trigger a conservative embargo.
        changes = factor.pct_change(fill_method=None).abs() > 0.001
        for date in factor.index[changes]:
            events[symbol].add(str(date.date()))
    return {symbol: sorted(dates) for symbol, dates in events.items()}


def definitions():
    details = {}
    def add(name, formula, lookback, unit='decimal'):
        details[name] = {'formula': formula, 'lookback_sessions': lookback,
                         'unit': unit, 'available_at': 'observation session close'}
    for n in [1, 2, 5, 10, 20, 60, 120, 200]:
        add(f'return_{n}d', f'C[t] / C[t-{n}] - 1; all {n+1} closes required', n)
    for n in [5, 20, 60]:
        add(f'volatility_{n}d', f'sample_std(r[t-{n-1}:t], ddof=1); not annualized', n)
    for n in [5, 20, 50, 200]:
        add(f'distance_sma_{n}d', f'C[t] / mean(C[t-{n-1}:t]) - 1', n-1)
    add('rsi_14d', 'Wilder: seed mean of first 14 gains/losses, then (13*previous+current)/14; gain/(gain+loss); flat=0.5; restart after missing close or known corporate transition', 'recursive', '0..1')
    for n in [5, 20]:
        add(f'relative_volume_{n}d', f'V[t] / mean(V[t-{n}:t-1]); excludes current session from denominator', n, 'ratio')
    add('volume_change_1d', 'V[t]/V[t-1]-1', 1)
    add('log_dollar_volume_20d', 'ln(1+mean(raw_C * raw_RTH_volume over t-19:t))', 19, 'log USD proxy')
    add('intraday_range', '(H[t]-L[t])/C[t]', 0)
    add('intraday_return', 'C[t]/O[t]-1', 0)
    add('overnight_gap', 'O[t]/C[t-1]-1', 1)
    add('close_position', '(C[t]-L[t])/(H[t]-L[t]); undefined if H=L => row excluded', 0, '0..1')
    add('drawdown_60d', 'C[t]/max(C[t-59:t])-1', 59)
    for n in [1, 5, 20]:
        add(f'market_return_{n}d', f'SPY_C[t]/SPY_C[t-{n}]-1; contiguous observations required', n)
    add('market_volatility_20d', 'sample_std(SPY_r[t-19:t], ddof=1); not annualized', 20)
    add('excess_return_20d', 'return_20d - market_return_20d', 20)
    add('beta_60d', 'sample_cov(r,SPY_r,60,ddof=1)/sample_var(SPY_r,60,ddof=1)', 60, 'ratio')
    add('correlation_market_60d', 'Pearson correlation(r,SPY_r) over last 60 returns', 60, '-1..1')
    assert set(details) == set(FEATURES)
    return {
        'version': VERSION, 'ordered_features': FEATURES,
        'notation': 't=observation date; O,H,L,C=provider daily OHLC adjusted for splits only; V=split-adjusted regular-session half-hour volume; r=C/C.shift(1)-1',
        'session_timezone': 'America/New_York',
        'volume_convention': 'Sum eligible SIP 30Min bars inside [official open,official close), plus actual closing auction trades (condition 6) reported at/after close and associated with that session. Never add official-close reference messages (condition M). Collapse auction prints matching exact timestamp/price/quantity/condition even if venue code differs (observed mirrored source records); original responses retained. Earlier auction prints not added twice. Missing auction evidence or reconstructed volume > provider daily volume+1 => volume undefined. Not total consolidated daily volume.',
        'price_convention': 'Alpaca 1Day SIP trade-condition eligible OHLC; daily close can include closing print absent from the last intraday interval. Not guaranteed primary-exchange auction price or executable fill.',
        'split_factor': 'Segment the adjusted-volume/raw-volume ratio at jumps >0.0001; infer each constant factor from sum(adjusted volumes)/sum(raw volumes), rationalized denominator<=1000000. Validate daily OHLC to USD 0.00501 plus propagated volume-rounding uncertainty, and volumes within 1.01 shares plus propagated uncertainty. Divide raw prices and multiply raw intraday volume by factor; avoids cent rounding in provider adjusted OHLC. Legacy provider split adjustments can encode non-integer corporate distributions.',
        'adjustment_invariance': 'Future splits rescale earlier prices and volumes reciprocally. Features use scale-invariant price/volume ratios or raw price*raw volume; no absolute adjusted-price feature. Source revisions/rounding remain a limitation.',
        'dividends': 'No cash-dividend adjustment; not total returns.',
        'missing_policy': 'Calendar reindex; no fill; require all relevant observations; exclude rows with any undefined feature/target.',
        'corporate_transitions': 'Embargo observation windows touching a known spin-off or security transition for 201 sessions including event; embargo preceding observation when target is event day. Also detect >=0.1% daily spin-off adjustment-factor changes. Provider event history is not guaranteed complete.',
        'reviewed_transition_sources': REVIEWED_TRANSITIONS,
        'reviewed_identity_continuities': REVIEWED_CONTINUITIES,
        'transforms': 'No learned normalization, clipping, bins or encrypted feature projection; float64 in both partitions.',
        'features': details,
        'target': {'name': TARGET, 'formula': 'raw_daily_close[next_exchange_session]/raw_daily_open[next_exchange_session]-1',
                   'unit': 'decimal; 0.01=+1%', 'costs': 'No fees, spread, slippage, borrow fees or dividends'},
    }


def validate(train, validation, schedule):
    expected = METADATA + FEATURES + [TARGET]
    combined = pd.concat([train, validation], ignore_index=True)
    checks = {
        'columns_exactly_38': list(combined.columns) == expected and len(expected) == 38,
        'all_50_symbols_in_both': set(train.ticker) == set(SYMBOLS) == set(validation.ticker),
        'unique_ids': not combined.id.duplicated().any(),
        'unique_instrument_observation': not combined.duplicated(['asset_id', 'date']).any(),
        'finite_all_33_numeric_columns': bool(np.isfinite(combined[FEATURES + [TARGET]]).all().all()),
        'no_missing_values': not combined.isna().any().any(),
        'chronological_target_split': bool(train.target_date.max() < validation.target_date.min()),
        'no_cross_partition_observation_dates': not bool(set(train.date) & set(validation.date)),
        'no_cross_partition_ids': not bool(set(train.id) & set(validation.id)),
        'train_targets_not_after_boundary': bool((train.target_date <= pd.Timestamp(TRAIN_END)).all()),
        'validation_targets_not_before_boundary': bool((validation.target_date >= pd.Timestamp(VALIDATION_START)).all()),
        'targets_inside_requested_dates': bool(combined.target_date.between(pd.Timestamp(FIRST_TARGET), pd.Timestamp(RAW_END)).all()),
        'rsi_in_unit_interval': bool(combined.rsi_14d.between(0, 1).all()),
        'close_position_in_unit_interval': bool(combined.close_position.between(-1e-9, 1+1e-9).all()),
        'volatility_nonnegative': bool((combined[[name for name in FEATURES if 'volatility' in name]] >= 0).all().all()),
        'drawdown_nonpositive': bool((combined.drawdown_60d <= 1e-9).all()),
        'correlation_valid': bool(combined.correlation_market_60d.between(-1.00000001, 1.00000001).all()),
    }
    following = pd.Series(schedule.index, index=schedule.index).shift(-1)
    checks['target_is_next_exchange_session'] = bool((combined.date.map(following) == combined.target_date).all())
    if not all(checks.values()):
        raise ValueError(f'Validation failed: {[key for key,value in checks.items() if not value]}')
    return checks


def write_parquet(frame, path):
    table = pa.Table.from_pandas(frame, preserve_index=False)
    for name in ['date', 'target_date']:
        index = table.schema.get_field_index(name)
        table = table.set_column(index, name, table.column(name).cast(pa.date32()))
    pq.write_table(table, path, compression='zstd', version='2.6')


def generate():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    internal = OUTPUT / '_internal'
    schedule = calendar()
    schedule.to_parquet(internal / 'session_calendar.parquet', compression='zstd')
    blocked = transitions(schedule)
    market, market_quality = make_daily('SPY', schedule)
    market.to_parquet(internal / 'SPY_sessions.parquet', compression='zstd')
    frames, per_symbol = [], {}
    for symbol in SYMBOLS:
        daily, quality = make_daily(symbol, schedule)
        daily.to_parquet(internal / f'{symbol}_sessions.parquet', compression='zstd')
        features = make_features(daily, market, reset_dates=blocked[symbol])
        rows, exclusions = labeled_rows(symbol, features, daily, blocked[symbol])
        quality.update(exclusions)
        quality['final_rows'] = len(rows)
        quality['retained_target_start'] = str(rows.target_date.min().date())
        quality['retained_target_end'] = str(rows.target_date.max().date())
        per_symbol[symbol] = quality
        frames.append(rows)
        print(f'built {symbol:5s} rows={len(rows)} exclusions={exclusions["excluded_rows"]}', flush=True)
    train, validation = split_rows(pd.concat(frames, ignore_index=True))
    checks = validate(train, validation, schedule)
    checks['exclusion_accounting_balances'] = all(
        item['candidate_rows'] == item['final_rows'] + item['excluded_rows']
        and item['excluded_rows'] == sum(item['exclusion_reasons_disjoint'].values())
        for item in per_symbol.values())
    if not checks['exclusion_accounting_balances']:
        raise ValueError('Excluded-row accounting is inconsistent')
    source_target_errors = []
    for symbol, rows in pd.concat([train, validation]).groupby('ticker'):
        source = daily_prices(load_bars(symbol, 'daily_raw'), schedule)
        reference = source.close / source.open - 1
        expected = rows.target_date.map(reference)
        source_target_errors.append(float(np.max(np.abs(rows[TARGET].to_numpy() - expected.to_numpy()))))
    checks['all_labels_match_source_session_ohlc'] = max(source_target_errors) < 1e-12
    if not checks['all_labels_match_source_session_ohlc']:
        raise ValueError('A target differs from its source session')
    write_parquet(train, OUTPUT / 'train.parquet')
    write_parquet(validation, OUTPUT / 'validation.parquet')
    # Validate exported bytes through a fresh reader, not just the in-memory frame.
    for name, original in [('train', train), ('validation', validation)]:
        recovered = pd.read_parquet(OUTPUT / f'{name}.parquet')
        for field in ['date', 'target_date']:
            recovered[field] = pd.to_datetime(recovered[field])
        pd.testing.assert_frame_equal(original.reset_index(drop=True), recovered, check_dtype=False)
    checks['parquet_roundtrip_exact'] = True
    write_json(OUTPUT / 'feature_definitions.json', definitions())
    with (OUTPUT / 'universe.csv').open('w', newline='', encoding='utf-8') as stream:
        writer = csv.DictWriter(stream, fieldnames=['asset_id','ticker','group','symbol_asof','role','history_identity'])
        writer.writeheader()
        for group, symbols in GROUPS.items():
            for symbol in symbols.split():
                writer.writerow({'asset_id': f'QB-US-{symbol}', 'ticker': symbol, 'group': group,
                                 'symbol_asof': ASOF, 'role': 'prediction',
                                 'history_identity': 'provider asof mapping; local asset_id is not a permanent exchange identifier'})
    combined = pd.concat([train, validation], ignore_index=True)
    statistics = combined[FEATURES + [TARGET]].describe(percentiles=[.01,.5,.99]).to_dict()
    extremes = combined.loc[combined[TARGET].abs() > .20, ['ticker','date','target_date',TARGET]].to_dict('records')
    quality = {'version': VERSION, 'created_at': now(), 'status': 'generated_for_local_review',
               'candidate_rows': sum(item['candidate_rows'] for item in per_symbol.values()),
               'retained_rows': len(combined),
               'excluded_rows': sum(item['excluded_rows'] for item in per_symbol.values()),
               'exclusion_reasons_disjoint': {
                   reason: sum(item['exclusion_reasons_disjoint'][reason] for item in per_symbol.values())
                   for reason in ['source_gap_or_undefined_outside_embargo', 'corporate_transition_embargo']},
               'checks': checks, 'expected_source_sessions': len(schedule), 'market': market_quality,
               'per_symbol': per_symbol, 'statistics': statistics, 'target_abs_above_20pct_retained_for_review': extremes,
               'large_price_move_review': [
                   {'ticker':'ORCL','date':'2025-09-10','treatment':'Retained; no automatic outlier clipping.',
                    'context':'Issuer published quarterly results on 2025-09-09. Context supports investigating a market move; it is not independent verification of the exact price.',
                    'source':'https://investor.oracle.com/investor-news/news-details/2025/Oracle-Announces-Fiscal-Year-2026-First-Quarter-Financial-Results/default.aspx'},
                   {'ticker':'HON','date':'2026-06-29','treatment':'Excluded by corporate-transition embargo; original observations retained internally.',
                    'source':'Alpaca corporate-actions response and stored split/spin-off adjustment audit'}],
               'limitations': ['Fixed present-day universe: survivorship and selection bias.',
                               'Corrected historical data downloaded now; not certified point-in-time vintages.',
                               'One provider; independent vendor reconciliation not performed.',
                               'RTH volume is reconstructed from intraday aggregates plus reported closing trades; not a full independent trade-by-trade reconciliation.',
                               'Corporate actions may be incomplete; embargo policy is conservative, not proof all events are resolved.',
                               'Public historical validation is not a blind tournament or evidence of future profits.',
                               'Redistribution and institutional/commercial permissions remain unconfirmed; no upload performed.']}
    write_json(OUTPUT / 'quality_report.json', quality)
    def summary(frame):
        return {'rows': len(frame), 'columns': len(frame.columns), 'symbols': int(frame.ticker.nunique()),
                'observation_start': str(frame.date.min().date()), 'observation_end': str(frame.date.max().date()),
                'target_start': str(frame.target_date.min().date()), 'target_end': str(frame.target_date.max().date()),
                'per_symbol_rows': frame.groupby('ticker').size().astype(int).to_dict()}
    packages = {name: importlib.metadata.version(name) for name in ['pandas','numpy','pyarrow','requests','exchange-calendars']}
    receipts = []
    for path in sorted(internal.rglob('*.receipt.json')):
        if path.parent.name not in ['raw', 'daily_raw', 'daily_split', 'auction_pages']:
            continue
        receipts.append({'path': str(path.relative_to(OUTPUT)).replace('\\','/'), 'sha256': sha256(path),
                         'response_sha256': json.loads(path.read_text())['sha256']})
    sources = {'receipts': receipts,
               'corporate_actions_sha256': sha256(internal / 'corporate_actions.json'),
               'spin_pages': [{'path': str(p.relative_to(OUTPUT)).replace('\\','/'), 'sha256': sha256(p)}
                              for p in sorted((internal/'spin_adjustment_pages').glob('*.json'))]}
    write_json(internal / 'source_index.json', sources)
    source_files = sorted((ROOT/'worker'/'stocks_history').glob('*.py'))
    manifest = {'dataset_version': VERSION, 'created_at': now(), 'publication_status': 'LOCAL_REVIEW_ONLY',
                'source': 'Alpaca SIP historical market data', 'download_start': RAW_START, 'download_end': RAW_END,
                'source_payload_storage': 'Received JSON parsed and compact-serialized locally; receipt hashes cover saved payload files, not original HTTP wire bytes. Authentication headers are never stored.',
                'symbol_asof': ASOF, 'context_symbols': ['SPY'], 'features': FEATURES, 'target': TARGET, 'column_order': METADATA+FEATURES+[TARGET],
                'train': summary(train), 'validation': summary(validation), 'calendar': 'XNYS / America/New_York',
                'license_status': 'Account access verified; redistribution/commercial rights not verified.',
                'runtime': {'python': platform.python_version(), 'packages': packages},
                'calendar_sha256': sha256(internal / 'session_calendar.parquet'),
                'source_index_sha256': sha256(internal/'source_index.json'),
                'generator_sha256': {str(p.relative_to(ROOT)).replace('\\','/'): sha256(p) for p in source_files}}
    readme = make_readme(manifest, quality)
    readme += '\n## Vista previa real de entrenamiento\n\n'
    readme += '| Fecha de información | Acción | Retorno 20 sesiones | Volatilidad diaria 20 sesiones | Fecha objetivo | Retorno objetivo |\n'
    readme += '|---|---|---:|---:|---|---:|\n'
    for row in train.head(6).to_dict('records'):
        readme += f'| {row["date"]:%Y-%m-%d} | {row["ticker"]} | {row["return_20d"]:.4%} | {row["volatility_20d"]:.4%} | {row["target_date"]:%Y-%m-%d} | {row[TARGET]:.4%} |\n'
    readme += '\nPorcentajes sólo para esta vista previa; los archivos almacenan valores decimales float64.\n'
    (OUTPUT / 'README.md').write_text(readme, encoding='utf-8')
    names = ['train.parquet','validation.parquet','README.md','feature_definitions.json','universe.csv','quality_report.json']
    manifest['files'] = {name: {'sha256': sha256(OUTPUT/name), 'bytes': (OUTPUT/name).stat().st_size} for name in names}
    write_json(OUTPUT/'manifest.json', manifest)
    archive = OUTPUT / 'quantbattle-stock-history-v1.zip'
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as package:
        for name in names + ['manifest.json']:
            package.write(OUTPUT/name, arcname=name)
    print(json.dumps({'train':manifest['train'],'validation':manifest['validation'],
                      'archive_bytes':archive.stat().st_size,'checks':checks},indent=2),flush=True)


def make_readme(manifest, quality):
    train, validation = manifest['train'], manifest['validation']
    passed = sum(quality['checks'].values())
    return f'''# QuantBattle — histórico de acciones v1

Estado: generado para revisión local. No publicado en la plataforma. Los permisos de redistribución y uso comercial siguen sin verificarse.

## Archivos

| Archivo | Filas | Acciones | Fechas objetivo |
|---|---:|---:|---|
| train.parquet | {train['rows']:,} | {train['symbols']} | {train['target_start']} a {train['target_end']} |
| validation.parquet | {validation['rows']:,} | {validation['symbols']} | {validation['target_start']} a {validation['target_end']} |

Cada archivo tiene 38 columnas: id, asset_id, ticker, date, target_date, 32 variables float64 y target_return_oc_1d. Las fechas se almacenan como Parquet date32. Los identificadores y fechas están visibles; las variables no están encriptadas ni discretizadas.

Cada fila usa información hasta el cierre de date para predecir apertura→cierre de target_date, la siguiente sesión bursátil. El objetivo decimal 0.01 significa +1%. Ambos archivos incluyen el objetivo histórico. Entrenar en train y evaluar en validation; no ajustar normalizadores con ambos archivos. La separación se hace por target_date, manteniendo todas las acciones de una fecha en el mismo archivo.

## Datos y convenciones

Fuente: Alpaca SIP, USD, consulta de símbolos con asof={ASOF}. Histórico fuente {RAW_START} a {RAW_END}; 2016 aporta calentamiento. Las 50 acciones exactas aparecen en universe.csv. SPY sólo aporta contexto y no añade filas de predicción. Los asset_id son identificadores locales de QuantBattle, no identificadores permanentes de bolsa.

OHLC: velas diarias oficiales del proveedor con sus reglas de elegibilidad de operaciones. No garantizan el precio de subasta de la bolsa principal ni un precio de ejecución. Utilizamos esos precios para conservar el cierre de la sesión, que puede diferir del cierre de la última media hora anterior a las 16:00.

Volumen: suma de velas SIP de 30 minutos dentro de [apertura oficial, cierre oficial), más las operaciones reales de subasta de cierre (condición 6) reportadas al cierre o después y asociadas a esa sesión. Se colapsan mensajes con idénticos timestamp/precio/cantidad/condición aunque difiera el código de mercado: se encontraron impresiones reflejadas que, sumadas dos veces, superaban el total diario. No se suman referencias de cierre (M) ni subastas ya incluidas antes del cierre. Se respeta el calendario XNYS y sus cierres anticipados. Sin evidencia de subasta o si el volumen reconstruido supera el total diario más una acción, el volumen queda indefinido. No es el volumen diario consolidado del proveedor, que puede incorporar operaciones fuera de sesión, ni una reconciliación independiente operación por operación.

Para variables de precio se ajustan splits, sin dividendos. Los factores se contrastan contra OHLC diarios ajustados; el volumen se transforma a las mismas unidades de acciones. El objetivo usa apertura y cierre diarios brutos de la sesión futura. Las fórmulas y casos límite completos están en feature_definitions.json.

## Calidad y exclusiones

{passed} controles automáticos superados, incluido el ciclo escritura/lectura Parquet. quality_report.json registra cobertura, faltantes, exclusiones por acción, cambios de ajuste, distribuciones y retornos extremos retenidos para revisión. No se rellenan huecos ni se borran automáticamente pérdidas reales. Las filas con variables indefinidas se excluyen.

Se ponen en cuarentena ventanas de 201 sesiones que toquen escisiones/transiciones identificadas, y la observación previa si el evento cae en su objetivo. La API de acciones corporativas puede omitir eventos antiguos: también se contrastan factores de ajuste por escisiones. Esta revisión no certifica un historial de eventos completo.

Limitaciones: universo fijo de empresas actuales (sesgo de supervivencia/selección); datos históricos corregidos descargados ahora (sin certificación de versiones disponibles entonces); sin reconciliación con otro proveedor; cambios de referencia empresarial resueltos según mapeo del proveedor; volumen intradiario aproximado; costes de trading excluidos. La validación histórica visible no sustituye evaluación prospectiva ni demuestra rentabilidad futura.

## Integridad y reproducción

manifest.json contiene hashes SHA-256, conteos, orden de columnas, versión y dependencias. El ZIP contiene exclusivamente los siete archivos de entrega, sin credenciales ni caché de origen. Las respuestas, recibos de descarga, calendario y sesiones normalizadas se conservan aparte en _internal/ para auditoría local; no forman parte del paquete.

Generador: worker/stocks_history. Reproducción desde la raíz del proyecto:

```powershell
.\\.venv-stocks\\Scripts\\python.exe -m worker.stocks_history.build
```

El generador reutiliza respuestas verificadas y sólo consulta la API de datos históricos. No envía órdenes ni cambia el torneo cripto existente. Las claves se leen del archivo local ignorado worker/credentials/.env y nunca se incorporan al paquete.

Fuentes: https://docs.alpaca.markets/us/reference/stockbars ; https://docs.alpaca.markets/us/docs/market-data-faq ; https://docs.alpaca.markets/us/reference/corporateactions-1 ; https://www.nyse.com/markets/hours-calendars
'''


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--from-cache', action='store_true', help='Build only after all downloads are complete')
    args = parser.parse_args()
    if not args.from_cache:
        download()
        fetch_spin_adjustments()
        fetch_auctions()
    generate()
