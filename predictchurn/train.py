"""
train.py
========
CLI entry point for training the PredictChurn model.
Usage:
    python train.py predictchurn/data/telco_training.csv
    python train.py --data data/telco_training.csv
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

ROOT = Path(__file__).parent.resolve()
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import pandas as pd
from churn_model import ChurnModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("predictchurn.train_cli")

MODELS_DIR = ROOT / "models"


def resolve_path(p_str: str) -> Path | None:
    """Resolve file path across current working dir and package root."""
    p = Path(p_str)
    if p.exists():
        return p
    if (ROOT / p_str).exists():
        return ROOT / p_str
    # If path starts with predictchurn/ and we are in predictchurn directory
    if p_str.startswith("predictchurn/"):
        stripped = p_str[len("predictchurn/"):]
        if (ROOT / stripped).exists():
            return ROOT / stripped
        if Path(stripped).exists():
            return Path(stripped)
    return None


def main():
    parser = argparse.ArgumentParser(description="Train PredictChurn Model")
    parser.add_argument(
        "data_pos",
        nargs="?",
        default=None,
        help="Path to training CSV file (positional)",
    )
    parser.add_argument(
        "--data",
        type=str,
        default=None,
        help="Path to training CSV file",
    )
    args = parser.parse_args()

    target_str = args.data_pos or args.data or str(ROOT / "data" / "telco_training.csv")
    data_path = resolve_path(target_str)

    if not data_path or not data_path.exists():
        logger.error("Dataset not found at '%s'", target_str)
        sys.exit(1)

    logger.info("Loading training data from %s...", data_path)
    df = pd.read_csv(data_path)

    model = ChurnModel()
    metrics = model.train(df)
    model.save(MODELS_DIR)

    print("\n" + "=" * 50)
    print("      PREDICTCHURN MODEL TRAINING SUMMARY")
    print("=" * 50)
    print(f"Algorithm:       {metrics['algorithm']}")
    print(f"Train Rows:      {metrics['train_rows']}")
    print(f"Test Rows:       {metrics['test_rows']}")
    print(f"Base Churn Rate: {metrics['churn_rate'] * 100:.2f}%")
    print(f"Accuracy:        {metrics['accuracy']:.4f} ({metrics['accuracy'] * 100:.2f}%)")
    print(f"Precision:       {metrics['precision']:.4f} ({metrics['precision'] * 100:.2f}%)")
    print(f"Recall:          {metrics['recall']:.4f} ({metrics['recall'] * 100:.2f}%)")
    print(f"F1 Score:        {metrics['f1']:.4f}")
    print(f"ROC-AUC:         {metrics['roc_auc']:.4f}")
    print(f"CV ROC-AUC:      {metrics['cv_scores']} (mean {metrics.get('cv_mean', 0):.4f}, SMOTE inside folds)")
    print(f"Library Versions: {metrics.get('versions')}")
    print(f"Training Time:   {metrics['training_seconds']}s")
    print(f"Artifacts Saved: {MODELS_DIR}")
    print("=" * 50 + "\n")


if __name__ == "__main__":
    main()
