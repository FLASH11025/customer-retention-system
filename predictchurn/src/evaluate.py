"""
evaluate.py
===========
Model evaluation utilities for the PredictChurn ML backend.

Public API
----------
evaluate, get_confusion_matrix_data, get_roc_curve_data, get_feature_importance
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)

logger = logging.getLogger(__name__)

__all__ = [
    "evaluate",
    "get_confusion_matrix_data",
    "get_roc_curve_data",
    "get_feature_importance",
]


def _to_py(val: Any) -> float:
    """Convert a numpy scalar to a native Python float."""
    if hasattr(val, "item"):
        return val.item()
    return float(val)


# ---------------------------------------------------------------------------
# 1. evaluate
# ---------------------------------------------------------------------------

def evaluate(
    model: Any,
    X_test: np.ndarray,
    y_test: np.ndarray,
    threshold: float = 0.5,
) -> dict:
    """Compute a suite of classification metrics on the test set.

    Parameters
    ----------
    model : sklearn-compatible classifier
        Must implement ``predict_proba``.
    X_test : np.ndarray
        Preprocessed test features.
    y_test : np.ndarray
        Ground-truth binary labels.
    threshold : float
        Decision threshold applied to predicted probabilities.

    Returns
    -------
    dict
        ``{"accuracy", "precision", "recall", "f1", "roc_auc",
        "support_positive", "support_negative", "threshold"}`` — all numeric
        values are native Python floats rounded to 4 decimal places.
    """
    try:
        y_prob: np.ndarray = model.predict_proba(X_test)[:, 1]
        y_pred: np.ndarray = (y_prob >= threshold).astype(int)

        metrics = {
            "accuracy": round(_to_py(accuracy_score(y_test, y_pred)), 4),
            "precision": round(_to_py(precision_score(y_test, y_pred, zero_division=0)), 4),
            "recall": round(_to_py(recall_score(y_test, y_pred, zero_division=0)), 4),
            "f1": round(_to_py(f1_score(y_test, y_pred, zero_division=0)), 4),
            "roc_auc": round(_to_py(roc_auc_score(y_test, y_prob)), 4),
            "support_positive": int(np.sum(y_test == 1)),
            "support_negative": int(np.sum(y_test == 0)),
            "threshold": float(threshold),
        }

        logger.info("Evaluation: %s", metrics)
        return metrics
    except Exception as exc:
        logger.exception("evaluate failed: %s", exc)
        raise


# ---------------------------------------------------------------------------
# 2. get_confusion_matrix_data
# ---------------------------------------------------------------------------

def get_confusion_matrix_data(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    """Return a JSON-serialisable confusion matrix.

    Parameters
    ----------
    y_true : np.ndarray
        Ground-truth binary labels.
    y_pred : np.ndarray
        Predicted binary labels.

    Returns
    -------
    dict
        ``{"matrix": [[TN, FP], [FN, TP]], "labels": ["Stay", "Leave"]}``
    """
    try:
        cm: np.ndarray = confusion_matrix(y_true, y_pred)
        tn, fp, fn, tp = cm.ravel()
        result = {
            "matrix": [[int(tn), int(fp)], [int(fn), int(tp)]],
            "labels": ["Stay", "Leave"],
        }
        logger.debug("Confusion matrix: %s", result)
        return result
    except Exception as exc:
        logger.exception("get_confusion_matrix_data failed: %s", exc)
        raise


# ---------------------------------------------------------------------------
# 3. get_roc_curve_data
# ---------------------------------------------------------------------------

def get_roc_curve_data(
    model: Any, X_test: np.ndarray, y_test: np.ndarray
) -> dict:
    """Compute and return ROC curve data as Python lists.

    Parameters
    ----------
    model : sklearn-compatible classifier
    X_test : np.ndarray
    y_test : np.ndarray

    Returns
    -------
    dict
        ``{"fpr": list[float], "tpr": list[float],
        "thresholds": list[float], "auc": float}``
    """
    try:
        y_prob: np.ndarray = model.predict_proba(X_test)[:, 1]
        fpr, tpr, thresholds = roc_curve(y_test, y_prob)
        auc_val = _to_py(roc_auc_score(y_test, y_prob))

        clean_thresholds = []
        for v in thresholds:
            fv = _to_py(v)
            if np.isinf(fv) or np.isnan(fv):
                clean_thresholds.append(1.0)
            else:
                clean_thresholds.append(round(fv, 6))

        result = {
            "fpr": [round(_to_py(v), 6) for v in fpr],
            "tpr": [round(_to_py(v), 6) for v in tpr],
            "thresholds": clean_thresholds,
            "auc": round(auc_val, 4),
        }
        logger.info("ROC curve computed: AUC=%.4f, %d points", auc_val, len(fpr))
        return result
    except Exception as exc:
        logger.exception("get_roc_curve_data failed: %s", exc)
        raise


# ---------------------------------------------------------------------------
# 4. get_feature_importance
# ---------------------------------------------------------------------------

def get_feature_importance(
    model: Any,
    feature_names: list[str],
    model_type: str,
) -> list[dict]:
    """Extract and normalise feature importances from the model.

    Parameters
    ----------
    model : sklearn-compatible estimator
        Must expose ``feature_importances_`` attribute.
    feature_names : list[str]
        Names corresponding to model input columns.
    model_type : str
        Human-readable model identifier (used for logging only).

    Returns
    -------
    list[dict]
        Up to 20 entries of ``{"feature": str, "importance": float}``
        sorted descending, with importances normalised to sum to 1.0.
    """
    try:
        importances: np.ndarray = model.feature_importances_

        total = float(importances.sum())
        if total == 0.0:
            logger.warning("All feature importances are zero for model_type=%s", model_type)
            normalised = importances.astype(float)
        else:
            normalised = importances / total

        ranked = sorted(
            zip(feature_names, normalised),
            key=lambda x: x[1],
            reverse=True,
        )[:20]

        result = [
            {"feature": name, "importance": round(_to_py(imp), 6)}
            for name, imp in ranked
        ]
        logger.info(
            "Feature importance computed for %s: top feature='%s' (%.4f)",
            model_type, result[0]["feature"] if result else "N/A",
            result[0]["importance"] if result else 0.0,
        )
        return result
    except Exception as exc:
        logger.exception("get_feature_importance failed: %s", exc)
        raise
