"""
predict.py
==========
CLI entry point for running churn predictions on a CSV file.
Usage:
    python predict.py predictchurn/data/telco_to_predict.csv
    python predict.py --data data/telco_to_predict.csv --threshold 0.5
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

ROOT = Path(__file__).parent.resolve()
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import pandas as pd
from churn_model import ChurnModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("predictchurn.predict_cli")

MODELS_DIR = ROOT / "models"


def resolve_path(p_str: str) -> Path | None:
    """Resolve file path across current working dir and package root."""
    p = Path(p_str)
    if p.exists():
        return p
    if (ROOT / p_str).exists():
        return ROOT / p_str
    if p_str.startswith("predictchurn/"):
        stripped = p_str[len("predictchurn/"):]
        if (ROOT / stripped).exists():
            return ROOT / stripped
        if Path(stripped).exists():
            return Path(stripped)
    return None


def main():
    parser = argparse.ArgumentParser(description="Predict Churn on Customer Data")
    parser.add_argument(
        "data_pos",
        nargs="?",
        default=None,
        help="Path to CSV file without churned column (positional)",
    )
    parser.add_argument(
        "--data",
        type=str,
        default=None,
        help="Path to CSV file without churned column",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.5,
        help="Classification threshold",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=str(ROOT / "data" / "predictions_output.csv"),
        help="Path to save predictions CSV",
    )
    args = parser.parse_args()

    target_str = args.data_pos or args.data or str(ROOT / "data" / "telco_to_predict.csv")
    data_path = resolve_path(target_str)

    if not data_path or not data_path.exists():
        logger.error("Dataset not found at '%s'", target_str)
        sys.exit(1)

    model = ChurnModel()
    if not model.load(MODELS_DIR):
        logger.error("No model found in %s. Please train first.", MODELS_DIR)
        sys.exit(1)

    logger.info("Predicting on %s with threshold=%.2f...", data_path, args.threshold)
    df = pd.read_csv(data_path)
    res = model.predict(df, threshold=args.threshold)

    out_df = pd.DataFrame(res["predictions"])
    out_df.to_csv(args.output, index=False)

    print("\n" + "=" * 60)
    print("          BATCH PREDICTION SUMMARY")
    print("=" * 60)
    summary = res["summary"]
    print(f"Total Customers Scored:  {summary['total_customers']}")
    print(f"Predicted to Churn:      {summary['predicted_to_leave']}")
    print(f"Average Churn Risk:      {summary['avg_churn_risk_pct']:.1f}%")
    print(f"High Risk Customers:     {summary['high_risk']}")
    print(f"Revenue at Risk (12mo):  ${summary['revenue_at_risk']:,.2f}")
    print(f"Output File:             {args.output}")
    print("=" * 60)

    # Sort descending by churn probability to extract top at-risk
    top_at_risk = sorted(
        res["predictions"], key=lambda x: x["churn_probability_pct"], reverse=True
    )[:5]

    print("\n" + "-" * 60)
    print("           TOP 5 AT-RISK CUSTOMERS")
    print("-" * 60)
    for rank, cust in enumerate(top_at_risk, 1):
        print(f"#{rank} Customer: {cust['customer_id']}")
        print(f"   Prediction:         {cust['prediction']} ({cust['churn_probability_pct']}% churn probability | {cust['risk_level']} Risk)")
        print(f"   Annual Value:       ${cust['annual_spend']:,.2f} (Monthly: ${cust.get('MonthlyCharges', 0):.2f})")
        print(f"   Contract & Service: {cust.get('Contract', 'N/A')} | {cust.get('InternetService', 'N/A')} internet | Tenure: {cust.get('tenure', 0)} mos")
        print(f"   Prescribed Action:  {cust['suggested_action']}")
        print("   Key SHAP Drivers:")
        for r in cust["top_reasons"]:
            print(f"     - {r}")
        print("-" * 60)
    print()


if __name__ == "__main__":
    main()
