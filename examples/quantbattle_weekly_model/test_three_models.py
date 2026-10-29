"""Only generated data in temporary directories; never use tournament files."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import numpy as np
import pandas as pd
from sklearn.exceptions import NotFittedError
from sklearn.utils.validation import check_is_fitted

from quantbattle_model import predict_saved
from three_models import MODEL_SPECS, create_model, train_one


class ThreeModelsTests(unittest.TestCase):
    def test_recipes_are_unfitted(self):
        for name in MODEL_SPECS:
            with self.subTest(model=name), self.assertRaises(NotFittedError):
                check_is_fitted(create_model(name))

    def test_describe_requires_no_round_files(self):
        result = subprocess.run([sys.executable, str(Path(__file__).with_name("three_models.py")), "describe"],
                                capture_output=True, text=True, encoding="utf-8", check=True)
        description = json.loads(result.stdout)
        self.assertEqual(description["status"], "untrained_recipes")
        self.assertEqual(set(description["models"]), {"random_forest", "rbf_svr", "mlp"})

    def test_synthetic_training_and_saved_inference_for_each_family(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            rng = np.random.default_rng(86)
            paths = []
            for part, count in (("train", 256), ("validation", 64), ("live", 16)):
                x = rng.integers(0, 5, size=(count, 8)) / 4
                frame = pd.DataFrame(x, columns=[f"feature_{i:02d}" for i in range(1, 9)])
                frame["id"] = [f"{part}_{i}" for i in range(count)]
                frame["era"] = [f"{part}_era_{i // 16}" for i in range(count)]
                if part != "live":
                    frame["target"] = 0.03 * (x[:, 0] - 0.5) + 0.01 * x[:, 1] * x[:, 2]
                path = root / f"{part}.parquet"
                frame.to_parquet(path, index=False)
                paths.append(path)
            for name in MODEL_SPECS:
                with self.subTest(model=name):
                    output = root / f"{name}.csv"
                    report = train_one(name, *paths, output)
                    self.assertEqual(report["submission_method"], name)
                    self.assertFalse(report["automatic_zero_substitution"])
                    self.assertTrue(np.isfinite(report["validation_mae"]))
                    self.assertEqual(report["rows"], {"train": 256, "validation": 64, "live": 16})
                    repeated = root / f"{name}_repeated.csv"
                    predict_saved(Path(report["model_file"]), paths[2], repeated)
                    self.assertEqual(output.read_bytes(), repeated.read_bytes())
                    csv = pd.read_csv(output)
                    self.assertEqual(list(csv), ["id", "prediction"])
                    self.assertEqual(csv.id.tolist(), pd.read_parquet(paths[2]).id.tolist())
                    self.assertTrue(np.isfinite(csv.prediction).all())
                    self.assertTrue(csv.prediction.between(-1, 10).all())
                    self.assertEqual(json.loads(output.with_suffix(".report.json").read_text(encoding="utf-8"))["model"], name)


if __name__ == "__main__":
    unittest.main()
