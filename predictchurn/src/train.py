"""
train.py
========
Model training, hyperparameter search, and artifact persistence for the
PredictChurn ML backend.

Public API
----------
train_model, save_artifacts, load_artifacts
"""

from __future__ import annotations

import logging
import joblib
import numpy as np
import pandas as pd
from datetime import datetime
from pathlib import Path
from typing import Any

from sklearn.compose import ColumnTransformer
from sklearn.model_selection import RandomizedSearchCV, StratifiedKFold

logger = logging.getLogger(__name__)

MODELS_DIR: Path = Path(__file__).parent.parent / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

__all__ = ["train_model", "save_artifacts", "load_artifacts"]


# ---------------------------------------------------------------------------
# 1. train_model
# ---------------------------------------------------------------------------

def train_model(
    X_train: np.ndarray,
    y_train: np.ndarray,
) -> tuple[Any, str]:
    """Fit a classifier with cross-validated hyperparameter search.

    Attempts XGBoost → LightGBM → RandomForest in order of preference.
    SMOTE is applied to the training data before the search to handle
    class imbalance.

    Parameters
    ----------
    X_train : np.ndarray
        Preprocessed feature matrix.
    y_train : np.ndarray
        Binary target vector (0/1).

    Returns
    -------
    best_model : sklearn-compatible estimator
        The model fitted on the SMOTE-resampled training data with the
        best hyperparameters found by :class:`~sklearn.model_selection.RandomizedSearchCV`.
    model_type : str
        Human-readable identifier (``"XGBoost"``, ``"LightGBM"``, or
        ``"RandomForest"``).
    """
    try:
        from imblearn.over_sampling import SMOTE  # type: ignore[import-untyped]

        smote = SMOTE(random_state=42)
        X_res, y_res = smote.fit_resample(X_train, y_train)
        logger.info(
            "SMOTE resampled: %d → %d samples (class dist: %s)",
            len(y_train), len(y_res),
            dict(zip(*np.unique(y_res, return_counts=True))),
        )
    except Exception as exc:
        logger.warning("SMOTE failed (%s). Proceeding without resampling.", exc)
        X_res, y_res = X_train, y_train

    cv = StratifiedKFold(n_splits=3, shuffle=True, random_state=42)

    # ------------------------------------------------------------------
    # Attempt 1: XGBoost
    # ------------------------------------------------------------------
    try:
        from xgboost import XGBClassifier  # type: ignore[import-untyped]

        xgb_param_dist = {
            "n_estimators": [100, 200, 300],
            "max_depth": [3, 4, 5, 6],
            "learning_rate": [0.01, 0.05, 0.1],
            "subsample": [0.7, 0.8, 1.0],
            "colsample_bytree": [0.7, 0.8, 1.0],
            "gamma": [0, 1, 5],
            "min_child_weight": [1, 3, 5],
        }

        xgb_base = XGBClassifier(
            eval_metric="logloss",
            verbosity=0,
            random_state=42,
            use_label_encoder=False,
        )

        xgb_search = RandomizedSearchCV(
            estimator=xgb_base,
            param_distributions=xgb_param_dist,
            n_iter=20,
            cv=cv,
            scoring="roc_auc",
            n_jobs=-1,
            random_state=42,
            verbose=0,
        )
        xgb_search.fit(X_res, y_res)
        best_model = xgb_search.best_estimator_
        logger.info(
            "XGBoost trained. Best CV ROC-AUC=%.4f, params=%s",
            xgb_search.best_score_,
            xgb_search.best_params_,
        )
        return best_model, "XGBoost"

    except ImportError:
        logger.warning("XGBoost not available. Trying LightGBM.")
    except Exception as exc:
        logger.warning("XGBoost training failed (%s). Trying LightGBM.", exc)

    # ------------------------------------------------------------------
    # Attempt 2: LightGBM
    # ------------------------------------------------------------------
    try:
        from lightgbm import LGBMClassifier  # type: ignore[import-untyped]

        lgbm_param_dist = {
            "n_estimators": [100, 200, 300],
            "max_depth": [3, 4, 5, 6],
            "learning_rate": [0.01, 0.05, 0.1],
            "subsample": [0.7, 0.8, 1.0],
            "colsample_bytree": [0.7, 0.8, 1.0],
            "min_child_samples": [10, 20, 30],
            "num_leaves": [31, 63, 127],
        }

        lgbm_base = LGBMClassifier(random_state=42, verbose=-1)

        lgbm_search = RandomizedSearchCV(
            estimator=lgbm_base,
            param_distributions=lgbm_param_dist,
            n_iter=20,
            cv=cv,
            scoring="roc_auc",
            n_jobs=-1,
            random_state=42,
            verbose=0,
        )
        lgbm_search.fit(X_res, y_res)
        best_model = lgbm_search.best_estimator_
        logger.info(
            "LightGBM trained. Best CV ROC-AUC=%.4f, params=%s",
            lgbm_search.best_score_,
            lgbm_search.best_params_,
        )
        return best_model, "LightGBM"

    except ImportError:
        logger.warning("LightGBM not available. Falling back to RandomForest.")
    except Exception as exc:
        logger.warning("LightGBM training failed (%s). Falling back to RandomForest.", exc)

    # ------------------------------------------------------------------
    # Fallback: RandomForest
    # ------------------------------------------------------------------
    from sklearn.ensemble import RandomForestClassifier

    rf_param_dist = {
        "n_estimators": [100, 200, 300],
        "max_depth": [None, 5, 10, 20],
        "min_samples_split": [2, 5, 10],
        "min_samples_leaf": [1, 2, 4],
        "max_features": ["sqrt", "log2", 0.5],
    }

    rf_base = RandomForestClassifier(random_state=42, n_jobs=-1)

    rf_search = RandomizedSearchCV(
        estimator=rf_base,
        param_distributions=rf_param_dist,
        n_iter=20,
        cv=cv,
        scoring="roc_auc",
        n_jobs=-1,
        random_state=42,
        verbose=0,
    )
    rf_search.fit(X_res, y_res)
    best_model = rf_search.best_estimator_
    logger.info(
        "RandomForest trained. Best CV ROC-AUC=%.4f, params=%s",
        rf_search.best_score_,
        rf_search.best_params_,
    )
    return best_model, "RandomForest"


# ---------------------------------------------------------------------------
# 2. save_artifacts
# ---------------------------------------------------------------------------

def save_artifacts(
    model: Any,
    preprocessor: ColumnTransformer,
    feature_names: list[str],
    categories: dict[str, list[str]],
    model_type: str,
    churn_rate: float,
    n_train: int,
    n_test: int,
) -> None:
    """Persist all model artifacts to :data:`MODELS_DIR`.

    Files written
    -------------
    * ``model.pkl`` — trained estimator
    * ``preprocessor.pkl`` — fitted ColumnTransformer
    * ``feature_names.pkl`` — list of feature name strings
    * ``categories.pkl`` — dict of categorical column → sorted unique values
    * ``training_meta.pkl`` — metadata dict

    Parameters
    ----------
    model : Any
        Fitted sklearn-compatible estimator.
    preprocessor : ColumnTransformer
        Fitted feature transformer.
    feature_names : list[str]
        Feature names after preprocessing.
    categories : dict[str, list[str]]
        Category values per categorical column.
    model_type : str
        Identifier string (e.g. ``"XGBoost"``).
    churn_rate : float
        Observed churn rate in the full training set.
    n_train : int
        Number of training samples.
    n_test : int
        Number of test samples.
    """
    try:
        training_meta = {
            "model_type": model_type,
            "churn_rate": float(churn_rate),
            "training_date": datetime.now().isoformat(),
            "n_train": int(n_train),
            "n_test": int(n_test),
        }

        artifacts = {
            "model.pkl": model,
            "preprocessor.pkl": preprocessor,
            "feature_names.pkl": feature_names,
            "categories.pkl": categories,
            "training_meta.pkl": training_meta,
        }

        for filename, obj in artifacts.items():
            path = MODELS_DIR / filename
            joblib.dump(obj, path)
            logger.info("Saved artifact: %s", path)

        logger.info("All artifacts saved to %s", MODELS_DIR)
    except Exception as exc:
        logger.exception("save_artifacts failed: %s", exc)
        raise


# ---------------------------------------------------------------------------
# 3. load_artifacts
# ---------------------------------------------------------------------------

def load_artifacts() -> dict | None:
    """Load all persisted artifacts from :data:`MODELS_DIR`.

    Returns
    -------
    dict or None
        ``{"model": ..., "preprocessor": ..., "feature_names": [...],
        "categories": {...}, "meta": {...}}`` when all artifacts are present,
        otherwise ``None``.
    """
    try:
        required_files = [
            "model.pkl",
            "preprocessor.pkl",
            "feature_names.pkl",
            "categories.pkl",
            "training_meta.pkl",
        ]

        for filename in required_files:
            path = MODELS_DIR / filename
            if not path.exists():
                logger.warning("Artifact missing: %s", path)
                return None

        result = {
            "model": joblib.load(MODELS_DIR / "model.pkl"),
            "preprocessor": joblib.load(MODELS_DIR / "preprocessor.pkl"),
            "feature_names": joblib.load(MODELS_DIR / "feature_names.pkl"),
            "categories": joblib.load(MODELS_DIR / "categories.pkl"),
            "meta": joblib.load(MODELS_DIR / "training_meta.pkl"),
        }

        # Optionally load X_sample if it exists
        x_sample_path = MODELS_DIR / "X_sample.pkl"
        if x_sample_path.exists():
            result["X_sample"] = joblib.load(x_sample_path)

        logger.info("All artifacts loaded from %s", MODELS_DIR)
        return result
    except Exception as exc:
        logger.exception("load_artifacts failed: %s", exc)
        return None
