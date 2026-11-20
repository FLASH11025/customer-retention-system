"""
download_data.py
================
Download a churn dataset from Kaggle with kagglehub and stage it for the
PredictChurn pipeline.

Usage:
    python download_data.py                        # default: blastchar/telco-customer-churn
    python download_data.py <owner/dataset-slug>

Behavior:
    - Downloads the dataset via kagglehub (tries public access without
      credentials first).
    - Finds the first CSV inside the downloaded folder and copies it to
      predictchurn/data/raw_kaggle.csv.
    - Prints the path, shape, columns, and dtypes.
    - NEVER reads, prints, or logs any Kaggle credentials.
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).parent.resolve()
DATA_DIR = ROOT / "data"
RAW_TARGET = DATA_DIR / "raw_kaggle.csv"

DEFAULT_SLUG = "blastchar/telco-customer-churn"
DATASET_URL = "https://www.kaggle.com/datasets/blastchar/telco-customer-churn"


def find_csv(directory: Path) -> Path | None:
    """Return the first .csv file found recursively in `directory` (skip hidden)."""
    candidates = [
        p
        for p in sorted(directory.rglob("*.csv"))
        if p.is_file() and not p.name.startswith(".")
    ]
    # Prefer a CSV whose name looks like the main data file
    candidates.sort(key=lambda p: (p.name.lower() not in ("telco-customer-churn.csv",), len(p.name)))
    return candidates[0] if candidates else None


def main() -> int:
    parser = argparse.ArgumentParser(description="Download churn dataset from Kaggle")
    parser.add_argument(
        "slug",
        nargs="?",
        default=DEFAULT_SLUG,
        help=f"Kaggle dataset slug (default: {DEFAULT_SLUG})",
    )
    args = parser.parse_args()
    slug = args.slug.strip()

    print(f"[download] Kaggle dataset slug: {slug}")
    print(f"[download] Dataset URL: {DATASET_URL if slug == DEFAULT_SLUG else 'https://www.kaggle.com/datasets/' + slug}")

    try:
        import kagglehub

        path = kagglehub.dataset_download(slug)
        print(f"[download] Downloaded to: {path}")
    except Exception as exc:  # noqa: BLE001 - report exactly, never swallow
        exc_type = type(exc).__name__
        msg = str(exc)
        print(f"[download] FAILED: {exc_type}: {msg}")
        if any(
            code in msg or code in exc_type
            for code in ("401", "403", "Unauthorized", "Forbidden")
        ):
            print(
                "\n[AUTH REQUIRED] Kaggle refused the download (401/403).\n"
                "Fix by either:\n"
                "  (a) kaggle.com -> sign in -> Settings -> API -> 'Create New Token'\n"
                "      -> save kaggle.json to C:\\Users\\<your-username>\\.kaggle\\kaggle.json\n"
                "  (b) set environment variables KAGGLE_USERNAME and KAGGLE_KEY\n"
                "Then rerun this script."
            )
            return 2
        print(
            f"\n[UNREACHABLE] Kaggle could not be reached for another reason.\n"
            f"Dataset URL: {'https://www.kaggle.com/datasets/' + slug}\n"
            "Report this error to the user before substituting any other data source."
        )
        return 3

    downloaded = Path(path)
    csv_path = find_csv(downloaded)
    if csv_path is None:
        print(f"[download] FAILED: no CSV file found under {downloaded}")
        return 4

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(csv_path, RAW_TARGET)
    print(f"[download] Copied {csv_path.name} -> {RAW_TARGET}")

    import pandas as pd

    df = pd.read_csv(RAW_TARGET)
    print(f"\n[verify] Path:   {RAW_TARGET}")
    print(f"[verify] Shape:  {df.shape[0]} rows x {df.shape[1]} cols")
    print(f"[verify] Columns: {list(df.columns)}")
    print("[verify] Dtypes:")
    print(df.dtypes.to_string())
    return 0


if __name__ == "__main__":
    sys.exit(main())
