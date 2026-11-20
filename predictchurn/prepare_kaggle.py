"""
prepare_kaggle.py
=================
Stage the raw Kaggle Telco CSV into training/scoring files for PredictChurn.

Reuses the existing pipeline conventions (customer_id / churned / Telco schema).
No imputation or heavy cleaning happens here — that is done by
churn_model.ChurnModel.clean_and_validate at train/predict time, so that
numeric imputation can use the TRAINING-split median only.

Outputs:
    data/kaggle_training.csv    all rows, with churned column
    data/kaggle_to_predict.csv  300-row random sample (random_state=42),
                                WITHOUT the churned column
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).parent.resolve()
DATA_DIR = ROOT / "data"
RAW = DATA_DIR / "raw_kaggle.csv"
TRAIN_OUT = DATA_DIR / "kaggle_training.csv"
PREDICT_OUT = DATA_DIR / "kaggle_to_predict.csv"

SAMPLE_N = 300
RANDOM_STATE = 42


def main() -> int:
    import pandas as pd

    if not RAW.exists():
        print(f"[prepare] raw_kaggle.csv not found at {RAW}. Run download_data.py first.")
        return 1

    df = pd.read_csv(RAW)
    print(f"[prepare] Loaded raw Kaggle CSV: {df.shape[0]} rows x {df.shape[1]} cols")

    # customerID -> customer_id (keep the real Kaggle IDs)
    if "customerID" in df.columns:
        df = df.rename(columns={"customerID": "customer_id"})

    # Churn Yes/No -> churned 1/0
    if "Churn" in df.columns:
        df["churned"] = df["Churn"].map(lambda v: 1 if str(v).strip().lower() in ("yes", "1", "true") else 0)
        df = df.drop(columns=["Churn"])

    # SeniorCitizen treated as a category: 0/1 -> No/Yes
    if "SeniorCitizen" in df.columns:
        df["SeniorCitizen"] = df["SeniorCitizen"].map(lambda v: "Yes" if int(v) == 1 else "No")

    if "churned" not in df.columns:
        print("[prepare] FAILED: no churn target found in raw file")
        return 2

    # Save the full training file (TotalCharges blanks are preserved as empty
    # strings on purpose: imputation with the TRAINING-split median happens
    # inside the training pipeline, not here).
    TRAIN_OUT.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(TRAIN_OUT, index=False)
    churn_rate = df["churned"].mean()
    print(f"[prepare] Wrote {TRAIN_OUT}  ({df.shape[0]} rows, churn rate {churn_rate:.4f})")

    # 300-row scoring sample WITHOUT churned (random, fixed seed)
    sample = df.drop(columns=["churned"]).sample(n=SAMPLE_N, random_state=RANDOM_STATE)
    sample.to_csv(PREDICT_OUT, index=False)
    print(f"[prepare] Wrote {PREDICT_OUT}  ({len(sample)} rows, no churned column)")
    print("[prepare] NOTE: scoring sample rows are part of the training file;")
    print("[prepare]       model evaluation uses the held-out 20% test split only.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
