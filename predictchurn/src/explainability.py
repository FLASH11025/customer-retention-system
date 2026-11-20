"""
explainability.py
=================
SHAP-based explainability utilities for the PredictChurn ML backend.

Public API
----------
build_explainer, compute_shap_values, format_feature_reason,
get_top_reasons, get_retention_action, get_global_importance
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import numpy as np
import pandas as pd
import shap  # type: ignore[import-untyped]

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Human-readable feature name mapping (numeric features)
# ---------------------------------------------------------------------------

FEATURE_HUMAN_NAMES: dict[str, str] = {
    "account_age_months": "Account age",
    "monthly_charges": "Monthly charges",
    "annual_spend": "Annual spend",
    "logins_last_30d": "Logins last 30 days",
    "days_since_last_login": "Days since last login",
    "support_tickets_total": "Total support tickets",
    "unresolved_tickets": "Unresolved tickets",
    "late_payments_count": "Late payments",
    "feature_usage_score": "Feature usage score",
}

__all__ = [
    "FEATURE_HUMAN_NAMES",
    "build_explainer",
    "compute_shap_values",
    "format_feature_reason",
    "get_top_reasons",
    "get_retention_action",
    "get_global_importance",
]


# ---------------------------------------------------------------------------
# 1. build_explainer
# ---------------------------------------------------------------------------

def build_explainer(model: Any, X_background: np.ndarray) -> shap.TreeExplainer:
    """Create a SHAP TreeExplainer for *model*.

    Parameters
    ----------
    model : tree-based sklearn-compatible estimator
    X_background : np.ndarray
        Background dataset (used for baseline expectations). A sample of
        training data is typical.

    Returns
    -------
    shap.TreeExplainer
    """
    try:
        explainer = shap.TreeExplainer(model)
        logger.info("Built SHAP TreeExplainer (background shape=%s)", X_background.shape)
        return explainer
    except Exception as exc:
        logger.exception("build_explainer failed: %s", exc)
        raise


# ---------------------------------------------------------------------------
# 2. compute_shap_values
# ---------------------------------------------------------------------------

def compute_shap_values(
    explainer: shap.TreeExplainer,
    X: np.ndarray,
) -> np.ndarray:
    """Compute SHAP values for *X*.

    For binary classification, ``shap_values`` may return a list of two
    arrays (one per class).  This function always returns the array for
    the **positive class** (index 1).

    Parameters
    ----------
    explainer : shap.TreeExplainer
    X : np.ndarray
        Feature matrix.

    Returns
    -------
    np.ndarray
        Shape ``(n_samples, n_features)`` — SHAP values for the churn class.
    """
    try:
        raw = explainer.shap_values(X)

        if isinstance(raw, list):
            # Binary classification: list[array_neg, array_pos]
            values = raw[1] if len(raw) > 1 else raw[0]
        else:
            # Some versions return a single 2D array already
            values = raw

        # Guard: ensure 2D
        if values.ndim == 1:
            values = values.reshape(1, -1)

        logger.info("compute_shap_values: output shape %s", values.shape)
        return values
    except Exception as exc:
        logger.exception("compute_shap_values failed: %s", exc)
        raise


# ---------------------------------------------------------------------------
# 3. format_feature_reason
# ---------------------------------------------------------------------------

def format_feature_reason(
    feature_name: str,
    shap_val: float,
    raw_value: Optional[float],
) -> str:
    """Produce a human-readable explanation string for a single feature.

    Parameters
    ----------
    feature_name : str
        Feature name after preprocessing (e.g. ``"logins_last_30d"``,
        ``"plan_type_Pro"``, ``"contract_type_Yearly"``).
    shap_val : float
        SHAP value for this feature and customer.
    raw_value : float or None
        Original (un-transformed) value for numeric features; ``None`` for
        OHE-encoded features where the raw level is embedded in the name.

    Returns
    -------
    str
        Readable explanation with percentage risk delta, e.g.
        ``"Logged in 0 times in last 30 days (+0% risk)"``.
    """
    try:
        pct = int(round(abs(shap_val) * 100, 0))
        sign = "+" if shap_val > 0 else "-"
        risk_str = f"({sign}{pct}% risk)"

        # ------------------------------------------------------------------
        # OHE features: name contains underscore and not a pure numeric col
        # ------------------------------------------------------------------
        if feature_name not in FEATURE_HUMAN_NAMES and "_" in feature_name:
            # e.g. "plan_type_Pro", "contract_type_Yearly", "payment_method_UPI"
            parts = feature_name.split("_")

            # Reconstruct base column name by matching against known prefixes
            known_cat_bases = [
                "plan_type",
                "contract_type",
                "payment_method",
            ]
            base_col = None
            level = None
            for cat in known_cat_bases:
                if feature_name.startswith(cat + "_"):
                    base_col = cat
                    level = feature_name[len(cat) + 1:]
                    break

            if base_col == "plan_type" and level:
                return f"Plan type: {level} {risk_str}"
            elif base_col == "contract_type" and level:
                return f"{level} contract {risk_str}"
            elif base_col == "payment_method" and level:
                return f"Payment via {level} {risk_str}"
            else:
                # Generic OHE fallback
                return f"{feature_name.replace('_', ' ').title()} {risk_str}"

        # ------------------------------------------------------------------
        # Numeric features
        # ------------------------------------------------------------------
        val_str: str
        if raw_value is not None:
            if feature_name == "logins_last_30d":
                val_int = int(round(raw_value))
                return f"Logged in {val_int} times in last 30 days {risk_str}"
            elif feature_name == "account_age_months":
                val_int = int(round(raw_value))
                return f"Account age of {val_int} months {risk_str}"
            elif feature_name == "unresolved_tickets":
                val_int = int(round(raw_value))
                return f"{val_int} unresolved support tickets {risk_str}"
            elif feature_name == "days_since_last_login":
                val_int = int(round(raw_value))
                return f"Last login {val_int} days ago {risk_str}"
            elif feature_name == "monthly_charges":
                val_int = int(round(raw_value))
                return f"Monthly charges of ${val_int} {risk_str}"
            elif feature_name == "annual_spend":
                val_int = int(round(raw_value))
                return f"Annual spend of ${val_int} {risk_str}"
            elif feature_name == "feature_usage_score":
                val_f = round(float(raw_value), 1)
                return f"Feature usage score of {val_f}/100 {risk_str}"
            elif feature_name == "late_payments_count":
                val_int = int(round(raw_value))
                return f"{val_int} late payments {risk_str}"
            elif feature_name == "support_tickets_total":
                val_int = int(round(raw_value))
                return f"{val_int} total support tickets {risk_str}"
            else:
                human = FEATURE_HUMAN_NAMES.get(feature_name, feature_name.replace("_", " ").title())
                return f"{human}: {raw_value} {risk_str}"
        else:
            # No raw value available
            human = FEATURE_HUMAN_NAMES.get(
                feature_name, feature_name.replace("_", " ").title()
            )
            return f"{human} {risk_str}"

    except Exception as exc:
        logger.warning("format_feature_reason failed for '%s': %s", feature_name, exc)
        return f"{feature_name} ({'+' if shap_val > 0 else '-'}{int(round(abs(shap_val)*100))}% risk)"


# ---------------------------------------------------------------------------
# 4. get_top_reasons
# ---------------------------------------------------------------------------

def get_top_reasons(
    shap_values_row: np.ndarray,
    feature_names: list[str],
    X_raw_row: Optional[pd.Series],
    n: int = 3,
) -> tuple[list[str], list[str]]:
    """Extract the top *n* most influential features for a single customer.

    Parameters
    ----------
    shap_values_row : np.ndarray
        1-D SHAP values for one customer.
    feature_names : list[str]
        Feature names aligned with *shap_values_row*.
    X_raw_row : pd.Series or None
        Row from the *original* (un-transformed) DataFrame so raw feature
        values can be embedded in the readable explanation.
    n : int
        Number of top reasons to return.

    Returns
    -------
    readable_reasons : list[str]
        Human-readable explanation strings.
    raw_feature_names : list[str]
        Corresponding feature name keys.
    """
    try:
        # Sort by absolute SHAP value descending
        indices = np.argsort(np.abs(shap_values_row))[::-1][:n]

        readable_reasons: list[str] = []
        raw_feature_names: list[str] = []

        for idx in indices:
            fname = feature_names[idx]
            sv = float(shap_values_row[idx])

            # Look up raw value from original row if available
            raw_val: Optional[float] = None
            if X_raw_row is not None:
                # The raw series is indexed by original column names
                # OHE features have format base_col_level
                known_cat_bases = ["plan_type", "contract_type", "payment_method"]
                is_ohe = any(fname.startswith(cat + "_") for cat in known_cat_bases)
                if not is_ohe and fname in X_raw_row.index:
                    try:
                        raw_val = float(X_raw_row[fname])
                    except (ValueError, TypeError):
                        raw_val = None

            reason = format_feature_reason(fname, sv, raw_val)
            readable_reasons.append(reason)
            raw_feature_names.append(fname)

        return readable_reasons, raw_feature_names
    except Exception as exc:
        logger.exception("get_top_reasons failed: %s", exc)
        raise


# ---------------------------------------------------------------------------
# 5. get_retention_action
# ---------------------------------------------------------------------------

def get_retention_action(top_feature_names: list[str]) -> str:
    """Map the most influential feature to a concrete retention action.

    Parameters
    ----------
    top_feature_names : list[str]
        Feature names sorted by importance (most important first).

    Returns
    -------
    str
        A single recommended action for the customer success team.
    """
    try:
        action_map: list[tuple[list[str], str]] = [
            (
                ["unresolved_tickets"],
                "Escalate open support tickets immediately",
            ),
            (
                ["logins_last_30d", "days_since_last_login"],
                "Send personalized re-engagement email with feature highlights",
            ),
            (
                ["late_payments_count"],
                "Offer payment plan or billing assistance",
            ),
            (
                ["feature_usage_score"],
                "Schedule product walkthrough or training session",
            ),
            (
                ["monthly_charges"],
                "Offer a loyalty discount or plan downgrade option",
            ),
            (
                ["contract_type", "contract_type_Yearly", "contract_type_Monthly"],
                "Incentivize switch to annual contract with a discount",
            ),
            (
                ["plan_type", "plan_type_Pro", "plan_type_Enterprise", "plan_type_Basic"],
                "Review plan fit and suggest upgrade/downgrade",
            ),
        ]

        default_action = "Assign to customer success manager for check-in call"

        for feature in top_feature_names:
            for keywords, action in action_map:
                if feature in keywords:
                    logger.debug("Retention action matched '%s' → '%s'", feature, action)
                    return action

        logger.debug("Retention action: using default for features=%s", top_feature_names)
        return default_action
    except Exception as exc:
        logger.warning("get_retention_action failed: %s", exc)
        return "Assign to customer success manager for check-in call"


# ---------------------------------------------------------------------------
# 6. get_global_importance
# ---------------------------------------------------------------------------

def get_global_importance(
    shap_values: np.ndarray,
    feature_names: list[str],
) -> list[dict]:
    """Compute global feature importance as mean absolute SHAP values.

    Parameters
    ----------
    shap_values : np.ndarray
        Shape ``(n_samples, n_features)`` — SHAP values for the churn class.
    feature_names : list[str]
        Names aligned with feature columns.

    Returns
    -------
    list[dict]
        ``[{"feature": str, "mean_abs_shap": float}, ...]`` sorted descending.
    """
    try:
        mean_abs = np.abs(shap_values).mean(axis=0)  # shape (n_features,)

        result = sorted(
            [
                {"feature": name, "mean_abs_shap": round(float(val), 6)}
                for name, val in zip(feature_names, mean_abs)
            ],
            key=lambda x: x["mean_abs_shap"],
            reverse=True,
        )
        logger.info(
            "Global SHAP importance computed: top feature='%s' (%.4f)",
            result[0]["feature"] if result else "N/A",
            result[0]["mean_abs_shap"] if result else 0.0,
        )
        return result
    except Exception as exc:
        logger.exception("get_global_importance failed: %s", exc)
        raise
