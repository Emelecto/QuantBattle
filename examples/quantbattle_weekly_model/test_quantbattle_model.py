"""Integrity checks for the participant model; no market performance assertions."""
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

from quantbattle_model import checked_predictions, official_score, predict_saved, read_round, train_predict


class ModelIntegrityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        rng = np.random.default_rng(27)
        self.paths = [self.root / f"{name}.parquet" for name in ("train", "validation", "live")]
        for name, path, size in zip(("train", "validation", "live"), self.paths, (180, 60, 20)):
            x = rng.normal(size=size)
            frame = pd.DataFrame({"id": [f"{name}_{i}" for i in range(size)],
                                  "era": [f"{name}_era_{i // 20}" for i in range(size)], "feature_01": x})
            if name != "live":
                frame["target"] = 0.03 * x
            frame.to_parquet(path, index=False)

    def tearDown(self):
        self.temp.cleanup()

    def test_saved_model_reproduces_ml_csv_and_rejects_other_round(self):
        output = self.root / "submission.csv"
        report = train_predict(*self.paths, output)
        repeated = self.root / "repeated.csv"
        predict_saved(Path(report["trained_model_file"]), self.paths[2], repeated)
        self.assertEqual(repeated.read_bytes(), Path(report["learned_submission_csv"]).read_bytes())
        csv = pd.read_csv(repeated)
        self.assertEqual(list(csv.columns), ["id", "prediction"])
        self.assertEqual(csv.id.tolist(), pd.read_parquet(self.paths[2]).id.tolist())
        self.assertTrue(np.isfinite(csv.prediction).all())
        self.assertTrue(csv.prediction.between(-1, 10).all())
        self.assertGreater(csv.prediction.nunique(), 1)
        live = pd.read_parquet(self.paths[2])
        live.loc[0, "feature_01"] += 1
        live.to_parquet(self.paths[2], index=False)
        with self.assertRaisesRegex(ValueError, "otro live"):
            predict_saved(Path(report["trained_model_file"]), self.paths[2], repeated)

    def test_cross_partition_ids_are_rejected(self):
        live = pd.read_parquet(self.paths[2])
        live.loc[0, "id"] = "train_0"
        live.to_parquet(self.paths[2], index=False)
        with self.assertRaisesRegex(ValueError, "disjuntos"):
            read_round(*self.paths)

    def test_live_target_is_rejected(self):
        live = pd.read_parquet(self.paths[2])
        live["target"] = 0.0
        live.to_parquet(self.paths[2], index=False)
        with self.assertRaisesRegex(ValueError, "no debe incluir target"):
            read_round(*self.paths)

    def test_nonfinite_predictions_are_rejected_before_clipping(self):
        with self.assertRaises(ValueError):
            checked_predictions([float("inf")])
        self.assertEqual(official_score(0.001, 0.002), 0.2)
        self.assertEqual(official_score(0.03, 0.03), 0.0)


if __name__ == "__main__":
    unittest.main()
