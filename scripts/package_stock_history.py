"""Build the explicit participant download package, excluding private source caches."""
import argparse
import hashlib
import json
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = ('train.parquet', 'validation.parquet', 'README.md', 'feature_definitions.json',
         'universe.csv', 'quality_report.json', 'manifest.json')
TAG = 'stocks-history-v1'
BASE = f'https://github.com/Emelecto/QuantBattle/releases/download/{TAG}'


def sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def package(source, destination):
    source, destination = Path(source), Path(destination)
    original = json.loads((source / 'manifest.json').read_text(encoding='utf-8'))
    if original['dataset_version'] != 'stocks-oc-v1.0.0':
        raise ValueError('Unexpected historical feature contract')
    for name in FILES:
        if not (source / name).is_file():
            raise ValueError(f'Missing participant file: {name}')
        if name != 'manifest.json' and sha(source / name) != original['files'][name]['sha256']:
            raise ValueError(f'Historical source checksum differs: {name}')
    destination.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        shutil.copyfile(source / name, destination / name)
    readme = (destination / 'README.md').read_text(encoding='utf-8')
    readme = readme.replace('Estado: generado para revisión local. No publicado en la plataforma.',
                            'Estado: paquete de investigación publicado para descarga en QuantBattle.')
    (destination / 'README.md').write_text(readme, encoding='utf-8')
    manifest = {**original, 'publication_status': 'PUBLISHED_RESEARCH_DOWNLOAD',
                'published_at': datetime.now(timezone.utc).isoformat(),
                'release_url': 'https://github.com/Emelecto/QuantBattle/releases/tag/' + TAG,
                'original_manifest_sha256': sha(source / 'manifest.json')}
    manifest['files'] = {name: {'sha256': sha(destination / name), 'bytes': (destination / name).stat().st_size}
                         for name in FILES if name != 'manifest.json'}
    (destination / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding='utf-8')
    archive = destination / 'quantbattle-stock-history-v1.zip'
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as output:
        for name in FILES:
            output.write(destination / name, name)
    with zipfile.ZipFile(archive) as output:
        if set(output.namelist()) != set(FILES) or output.testzip() is not None:
            raise ValueError('Invalid participant archive')
    names = [*FILES, archive.name]
    hashes = {name: {'sha256': sha(destination / name), 'bytes': (destination / name).stat().st_size,
                     'url': BASE + '/' + name} for name in names}
    (destination / 'SHA256SUMS.txt').write_text(''.join(f'{hashes[name]["sha256"]}  {name}\n' for name in names), encoding='utf-8')
    return {'version': manifest['dataset_version'], 'release_url': manifest['release_url'],
            'train': {key: original['train'][key] for key in ('rows', 'columns', 'symbols', 'target_start', 'target_end')},
            'validation': {key: original['validation'][key] for key in ('rows', 'columns', 'symbols', 'target_start', 'target_end')},
            'files': hashes, 'checksums_url': BASE + '/SHA256SUMS.txt'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, default=ROOT / 'artifacts/stock-dataset-v1')
    parser.add_argument('--destination', type=Path, default=ROOT / 'artifacts/stock-daily-v1/_internal/history-release')
    parser.add_argument('--catalog', type=Path, default=ROOT / 'web/src/data/stock-history-v1.json')
    args = parser.parse_args()
    catalog = package(args.source, args.destination)
    args.catalog.parent.mkdir(parents=True, exist_ok=True)
    args.catalog.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps({'status': 'participant_package_verified', 'files': len(FILES),
                      'zip_bytes': catalog['files']['quantbattle-stock-history-v1.zip']['bytes']}))
