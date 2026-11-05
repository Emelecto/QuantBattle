from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'artifacts' / 'stock-dataset-v1'
CREDENTIALS = ROOT / 'worker' / 'credentials' / '.env'
VERSION = 'stocks-oc-v1.0.0'
RAW_START = '2016-01-04'
RAW_END = '2026-10-30'
ASOF = '2026-11-04'
FIRST_TARGET = '2017-01-04'
TRAIN_END = '2023-12-29'
VALIDATION_START = '2024-01-02'
GROUPS = {
    'technology': 'AAPL MSFT NVDA AVGO ORCL IBM CSCO ADBE CRM QCOM TXN INTC',
    'finance': 'JPM BAC WFC C GS MS V MA',
    'health': 'JNJ UNH MRK ABBV AMGN GILD MDT TMO',
    'consumer': 'AMZN WMT COST HD MCD NKE PG KO',
    'industry': 'CAT DE HON UNP UPS',
    'energy': 'XOM CVX COP',
    'utilities': 'NEE DUK',
    'digital_platforms': 'GOOGL META',
    'materials': 'ECL APD',
}
SYMBOLS = [symbol for group in GROUPS.values() for symbol in group.split()]
METADATA = ['id', 'asset_id', 'ticker', 'date', 'target_date']
FEATURES = (
    [f'return_{n}d' for n in [1, 2, 5, 10, 20, 60, 120, 200]]
    + [f'volatility_{n}d' for n in [5, 20, 60]]
    + [f'distance_sma_{n}d' for n in [5, 20, 50, 200]]
    + ['rsi_14d', 'relative_volume_5d', 'relative_volume_20d',
       'volume_change_1d', 'log_dollar_volume_20d', 'intraday_range',
       'intraday_return', 'overnight_gap', 'close_position', 'drawdown_60d',
       'market_return_1d', 'market_return_5d', 'market_return_20d',
       'market_volatility_20d', 'excess_return_20d', 'beta_60d',
       'correlation_market_60d']
)
TARGET = 'target_return_oc_1d'
REVIEWED_TRANSITIONS = [
    {'ticker': 'APD', 'date': '2016-10-03', 'event': 'Versum spin-off',
     'source': 'https://www.sec.gov/Archives/edgar/data/2969/000119312516731580/d184846dex991.htm'},
    {'ticker': 'HON', 'date': '2016-10-03', 'event': 'AdvanSix ex-distribution',
     'source': 'https://www.miaxglobal.com/sites/default/files/alert-files/HON_Distribution_39740.pdf'},
    {'ticker': 'HON', 'date': '2018-10-01', 'event': 'Garrett spin-off',
     'source': 'https://investor.honeywell.com/static-files/7e88fe1f-ed80-4d0a-8819-94addc1ffc0f'},
    {'ticker': 'HON', 'date': '2018-10-29', 'event': 'Resideo spin-off',
     'source': 'https://www.sec.gov/Archives/edgar/data/773840/000119312518309906/d646107d8k.htm'},
    {'ticker': 'MRK', 'date': '2021-06-03', 'event': 'Organon first regular-way session',
     'source': 'https://www.merck.com/news/merck-announces-completion-of-organon-co-spinoff/'},
    {'ticker': 'IBM', 'date': '2021-11-04', 'event': 'Kyndryl first post-distribution session',
     'source': 'https://www.kyndryl.com/in/en/about-us/news/2021/11/2021-11-04-Kyndryl-Completes-Separation-from-IBM'},
]
REVIEWED_CONTINUITIES = [
    {'ticker': 'XOM', 'provider_process_date': '2026-07-02',
     'old_cusip': '30231G102', 'new_cusip': '30233Q108',
     'treatment': 'Preserve history: one-for-one holding-company redomiciliation, same ownership percentages.',
     'source': 'https://investor.exxonmobil.com/sec-filings/all-sec-filings/content/0001193125-26-291986/d70995d8k.htm'},
]
assert len(SYMBOLS) == 50 and len(set(SYMBOLS)) == 50
assert len(FEATURES) == 32
