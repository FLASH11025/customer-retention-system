"""
predict.py
==========
Batch and single-record churn prediction utilities for the PredictChurn
ML backend.

Public API
----------
format_risk_level, predict_batch, predict_single
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

__all__ = ["format_risk_level", "predict_batch", "predict_single"]


# ---------------------------------------------------------------------------
# 1. format_risk_level
# ---------------------------------------------------------------------------

def format_risk_level(prob: float) -> str:
    """Map a churn probability to a categorical risk tier.

    Parameters
    ----------
    prob : float
        Churn probability in [0.0, 1.0].

    Returns
    -------
    str
        ``"Low"`` (prob < 0.30), ``"Medium"`` (0.30 ≤ prob < 0.60), or
        ``"High"`` (prob ≥ 0.60).
    """
    if prob < 0.30:
        return "Low"
    elif prob < 0.60:
        return "Medium"
    else:
        return "High"


# ---------------------------------------------------------------------------
# 2. predict_batch
# ---------------------------------------------------------------------------

def predict_batch(
    model: Any,
    X: np.ndarray,
    customer_ids: list[str],
    shap_explainer: Any,
    feature_names: list[str],
    X_raw_df: pd.DataFrame,
    threshold: float = 0.5,
) -> list[dict]:
    """Run batch churn prediction with SHAP explanations.

    Parameters
    ----------
    model : sklearn-compatible classifier
    X : np.ndarray
        Preprocessed feature matrix aligned with *customer_ids*.
    customer_ids : list[str]
        Customer identifier for each row.
    shap_explainer : shap.TreeExplainer
        Pre-built SHAP explainer.
    feature_names : list[str]
        Feature names corresponding to columns of *X*.
    X_raw_df : pd.DataFrame
        Original (un-transformed) feature frame used to embed raw values in
        human-readable explanations.
    threshold : float
        Decision threshold for the churn label. Default 0.5.

    Returns
    -------
    list[dict]
        One dict per customer with keys:
        ``customer_id, churn_probability, prediction, risk_level,
        top_reasons, raw_shap_values, retention_action``.
    """
    try:
        from src.explainability import compute_shap_values, get_top_reasons, get_retention_action

        probabilities: np.ndarray = model.predict_proba(X)[:, 1]

        # Compute SHAP values for all rows at once
        shap_vals: np.ndarray = compute_shap_values(shap_explainer, X)

        results: list[dict] = []

        for i, (cid, prob) in enumerate(zip(customer_ids, probabilities)):
            prob_f = float(prob)
            churn_prob_pct = round(prob_f * 100, 1)
            prediction = "LEAVE" if prob_f >= threshold else "STAY"
            risk_level = format_risk_level(prob_f)

            # Raw df row for readable value embedding
            if X_raw_df is not None and i < len(X_raw_df):
                raw_row: Optional[pd.Series] = X_raw_df.iloc[i]
            else:
                raw_row = None

            shap_row: np.ndarray = shap_vals[i]

            top_reasons, top_feat_names = get_top_reasons(
                shap_row, feature_names, raw_row, n=3
            )

            retention_action = get_retention_action(top_feat_names)

            raw_shap: dict[str, float] = {
                fname: round(float(sv), 6)
                for fname, sv in zip(feature_names, shap_row)
            }

            rec: dict = {
                "customer_id": str(cid),
                "churn_probability": churn_prob_pct,
                "prediction": prediction,
                "risk_level": risk_level,
                "top_reasons": top_reasons,
                "raw_shap_values": raw_shap,
                "retention_action": retention_action,
            }
            if raw_row is not None:
                for col in raw_row.index:
                    if col not in rec:
                        val = raw_row[col]
                        if hasattr(val, "item"):
                            val = val.item()
                        rec[col] = val

            results.append(rec)

        logger.info(
            "predict_batch: %d customers, %d predicted LEAVE (threshold=%.2f)",
            len(results),
            sum(1 for r in results if r["prediction"] == "LEAVE"),
            threshold,
        )
        return results
    except Exception as exc:
        logger.exception("predict_batch failed: %s", exc)
        raise


# ---------------------------------------------------------------------------
# 3. predict_single
# ---------------------------------------------------------------------------

def predict_single(
    model: Any,
    preprocessor: Any,
    customer_data: dict,
    shap_explainer: Any,
    feature_names: list[str],
    threshold: float = 0.5,
) -> dict:
    """Run churn prediction for a single customer record.

    Parameters
    ----------
    model : sklearn-compatible classifier
    preprocessor : ColumnTransformer
        Fitted feature transformer.
    customer_data : dict
        Raw customer fields (all :data:`~src.data_loader.REQUIRED_COLS_PREDICT`
        fields except ``customer_id`` are required).
    shap_explainer : shap.TreeExplainer
    feature_names : list[str]
    threshold : float

    Returns
    -------
    dict
        Same structure as one element from :func:`predict_batch`.
    """
    try:
        df_single = pd.DataFrame([customer_data])

        # Ensure customer_id is present (use placeholder if missing)
        if "customer_id" not in df_single.columns:
            df_single["customer_id"] = "SINGLE_QUERY"

        X_transformed = preprocessor.transform(
            df_single[
                [c for c in df_single.columns if c not in ("customer_id", "churned")]
            ]
        )

        customer_ids = df_single["customer_id"].tolist()

        results = predict_batch(
            model=model,
            X=X_transformed,
            customer_ids=customer_ids,
            shap_explainer=shap_explainer,
            feature_names=feature_names,
            X_raw_df=df_single,
            threshold=threshold,
        )

        logger.info(
            "predict_single: customer=%s, prediction=%s, prob=%.1f%%",
            customer_ids[0],
            results[0]["prediction"],
            results[0]["churn_probability"],
        )
        return results[0]
    except Exception as exc:
        logger.exception("predict_single failed: %s", exc)
        raise
