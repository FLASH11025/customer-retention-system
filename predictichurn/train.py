"""
PredictiChurn – Standalone Training Script
==========================================
Runs Phases 2-4 of the pipeline end-to-end:
  Phase 2  →  Data cleaning, encoding, scaling
  Phase 3  →  SMOTE + XGBoost training + evaluation
  Phase 4  →  SHAP explainability + plots

Outputs:
  backend/model.pkl
  backend/preprocessor.pkl
  data/class_balance.png
  data/roc_curve.png
  data/confusion_matrix.png
  data/shap_beeswarm.png
  data/shap_waterfall.png
"""

from __future__ import annotations

import warnings
warnings.filterwarnings("ignore")

import sys
import time
from pathlib import Path

import joblib
import matplotlib
matplotlib.use("Agg")  # non-interactive backend (no display needed)
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
import shap

from imblearn.over_sampling import SMOTE
from sklearn.compose import ColumnTransformer
from sklearn.metrics import (
    ConfusionMatrixDisplay,
    classification_report,
    confusion_matrix,
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from xgboost import XGBClassifier

# ─── Paths ────────────────────────────────────────────────────────────────────
ROOT        = Path(__file__).parent
DATA_PATH   = ROOT / "data" / "WA_Fn-UseC_-Telco-Customer-Churn.csv"
BACKEND_DIR = ROOT / "backend"
DATA_DIR    = ROOT / "data"

BACKEND_DIR.mkdir(exist_ok=True)


def section(title: str):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")


# ──────────────────────────────────────────────────────────────────────────────
# PHASE 2 – Data Cleaning & Preprocessing
# ──────────────────────────────────────────────────────────────────────────────
section("PHASE 2 – Data Cleaning & Preprocessing")

if not DATA_PATH.exists():
    sys.exit(
        f"[ERR]  Dataset not found at {DATA_PATH}\n"
        "    Download from: https://www.kaggle.com/datasets/blastchar/telco-customer-churn\n"
        "    Place CSV in data/ then re-run."
    )

df = pd.read_csv(DATA_PATH)
print(f"[OK] Loaded {df.shape[0]:,} rows x {df.shape[1]} columns")

# ── Drop useless ID column ────────────────────────────────────────────────────
df.drop(columns=["customerID"], inplace=True)
print("    Dropped 'customerID'")

# ── Fix TotalCharges (stored as string, blanks → 0) ──────────────────────────
df["TotalCharges"] = pd.to_numeric(
    df["TotalCharges"].str.strip(), errors="coerce"
).fillna(0.0)
print(f"    TotalCharges fixed  → dtype: {df['TotalCharges'].dtype}")

# ── Target encoding ──────────────────────────────────────────────────────────
df["Churn"] = df["Churn"].map({"Yes": 1, "No": 0})
print(f"    Churn distribution:\n{df['Churn'].value_counts().to_string()}")

# ── Feature / target split ───────────────────────────────────────────────────
X = df.drop(columns=["Churn"])
y = df["Churn"]

NUMERIC_COLS = ["tenure", "MonthlyCharges", "TotalCharges"]
BINARY_COLS  = ["SeniorCitizen"]
CAT_COLS     = [c for c in X.columns if c not in NUMERIC_COLS + BINARY_COLS]

print(f"\n    Numeric  ({len(NUMERIC_COLS)}): {NUMERIC_COLS}")
print(f"    Binary   ({len(BINARY_COLS)}): {BINARY_COLS}")
print(f"    Categoric({len(CAT_COLS)}): {CAT_COLS}")

# ── Build preprocessor ───────────────────────────────────────────────────────
preprocessor = ColumnTransformer(
    transformers=[
        ("num", StandardScaler(),                                       NUMERIC_COLS),
        ("bin", "passthrough",                                          BINARY_COLS),
        ("cat", OneHotEncoder(drop="first", sparse_output=False,
                              handle_unknown="ignore"),                 CAT_COLS),
    ],
    verbose_feature_names_out=False,
)

# ── Train / test split ───────────────────────────────────────────────────────
X_train_raw, X_test_raw, y_train, y_test = train_test_split(
    X, y, test_size=0.20, random_state=42, stratify=y
)
print(f"\n    Train : {X_train_raw.shape[0]:,} rows  |  churn rate: {y_train.mean():.1%}")
print(f"    Test  : {X_test_raw.shape[0]:,} rows  |  churn rate: {y_test.mean():.1%}")

# ── Fit preprocessor ────────────────────────────────────────────────────────
X_train = preprocessor.fit_transform(X_train_raw)
X_test  = preprocessor.transform(X_test_raw)
feature_names = preprocessor.get_feature_names_out().tolist()
print(f"\n    Feature count after encoding: {len(feature_names)}")

# ── Persist preprocessor ────────────────────────────────────────────────────
PREPROCESSOR_PATH = BACKEND_DIR / "preprocessor.pkl"
joblib.dump(preprocessor, PREPROCESSOR_PATH)
print(f"    [SAVED]  preprocessor.pkl saved → {PREPROCESSOR_PATH}")


# ──────────────────────────────────────────────────────────────────────────────
# PHASE 3 – SMOTE + XGBoost Training
# ──────────────────────────────────────────────────────────────────────────────
section("PHASE 3 – Handling Imbalance & Model Training")

# ── SMOTE (training set only) ────────────────────────────────────────────────
smote = SMOTE(random_state=42)
X_train_sm, y_train_sm = smote.fit_resample(X_train, y_train)

before_counts = dict(zip(*np.unique(y_train,    return_counts=True)))
after_counts  = dict(zip(*np.unique(y_train_sm, return_counts=True)))
print(f"    SMOTE  Before → No Churn: {before_counts[0]:,}  Churn: {before_counts[1]:,}")
print(f"    SMOTE  After  → No Churn: {after_counts[0]:,}  Churn: {after_counts[1]:,}")

# ── Class balance plot ───────────────────────────────────────────────────────
fig, axes = plt.subplots(1, 2, figsize=(10, 4))
for ax, counts, title in [
    (axes[0], before_counts, "Before SMOTE"),
    (axes[1], after_counts,  "After SMOTE"),
]:
    ax.pie(
        [counts[0], counts[1]],
        labels=["No Churn", "Churn"],
        autopct="%1.1f%%",
        colors=["#3b82f6", "#ef4444"],
        startangle=90,
    )
    ax.set_title(title)
plt.suptitle("Class Distribution", fontsize=14, fontweight="bold")
plt.tight_layout()
balance_path = DATA_DIR / "class_balance.png"
plt.savefig(balance_path, dpi=120)
plt.close()
print(f"    [PLOT]  class_balance.png saved")

# ── XGBoost training ─────────────────────────────────────────────────────────
print("\n    Training XGBClassifier …")
t0 = time.time()

model = XGBClassifier(
    n_estimators=300,
    max_depth=5,
    learning_rate=0.05,
    subsample=0.8,
    colsample_bytree=0.8,
    gamma=1,
    min_child_weight=5,
    eval_metric="logloss",
    random_state=42,
    n_jobs=-1,
    verbosity=0,
)

model.fit(
    X_train_sm, y_train_sm,
    eval_set=[(X_test, y_test)],
    verbose=False,
)
print(f"    [OK]  Training complete in {time.time()-t0:.1f}s")

# ── Evaluation ───────────────────────────────────────────────────────────────
y_pred      = model.predict(X_test)
y_pred_prob = model.predict_proba(X_test)[:, 1]

print("\n    === Classification Report ===")
print(classification_report(y_test, y_pred, target_names=["No Churn", "Churn"]))

roc_auc = roc_auc_score(y_test, y_pred_prob)
print(f"    ROC-AUC Score : {roc_auc:.4f}")

# ── Cross-validation ─────────────────────────────────────────────────────────
print("\n    Running 5-fold cross-validation …")
cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
recall_cv = cross_val_score(model, X_train_sm, y_train_sm, scoring="recall",  cv=cv, n_jobs=-1)
roc_cv    = cross_val_score(model, X_train_sm, y_train_sm, scoring="roc_auc", cv=cv, n_jobs=-1)
print(f"    CV Recall  : {recall_cv.mean():.4f} ± {recall_cv.std():.4f}")
print(f"    CV ROC-AUC : {roc_cv.mean():.4f}  ± {roc_cv.std():.4f}")

# ── ROC Curve ────────────────────────────────────────────────────────────────
fpr, tpr, _ = roc_curve(y_test, y_pred_prob)
plt.figure(figsize=(7, 5))
plt.plot(fpr, tpr, color="#ef4444", lw=2, label=f"ROC (AUC = {roc_auc:.3f})")
plt.plot([0, 1], [0, 1], "k--", lw=1)
plt.xlabel("False Positive Rate")
plt.ylabel("True Positive Rate (Recall)")
plt.title("ROC Curve – PredictiChurn")
plt.legend(loc="lower right")
plt.tight_layout()
plt.savefig(DATA_DIR / "roc_curve.png", dpi=120)
plt.close()
print("    [PLOT]  roc_curve.png saved")

# ── Confusion Matrix ─────────────────────────────────────────────────────────
cm   = confusion_matrix(y_test, y_pred)
disp = ConfusionMatrixDisplay(cm, display_labels=["No Churn", "Churn"])
fig, ax = plt.subplots(figsize=(5, 4))
disp.plot(ax=ax, cmap="Blues", colorbar=False)
ax.set_title("Confusion Matrix – PredictiChurn")
plt.tight_layout()
plt.savefig(DATA_DIR / "confusion_matrix.png", dpi=120)
plt.close()
print("    [PLOT]  confusion_matrix.png saved")

# ── Persist model ────────────────────────────────────────────────────────────
MODEL_PATH = BACKEND_DIR / "model.pkl"
joblib.dump(model, MODEL_PATH)
print(f"\n    [SAVED]  model.pkl saved → {MODEL_PATH}")


# ──────────────────────────────────────────────────────────────────────────────
# PHASE 4 – SHAP Explainability
# ──────────────────────────────────────────────────────────────────────────────
section("PHASE 4 – Model Explainability (SHAP)")

print("    Initialising TreeExplainer …")
explainer   = shap.TreeExplainer(model)
shap_values = explainer.shap_values(X_test)
print(f"    SHAP values shape: {shap_values.shape}")

# ── Beeswarm (global importance) ─────────────────────────────────────────────
X_test_df = pd.DataFrame(X_test, columns=feature_names)
plt.figure(figsize=(10, 7))
shap.summary_plot(shap_values, X_test_df, plot_type="beeswarm", show=False)
plt.title("SHAP Beeswarm – Global Feature Importance", fontsize=14)
plt.tight_layout()
plt.savefig(DATA_DIR / "shap_beeswarm.png", dpi=120, bbox_inches="tight")
plt.close()
print("    [PLOT]  shap_beeswarm.png saved")

# ── Single-row waterfall (first churner in test set) ─────────────────────────
churner_idx = int(np.where(y_test.values == 1)[0][0])
sv_row      = shap_values[churner_idx]
abs_sv      = np.abs(sv_row)
top3_idx    = np.argsort(abs_sv)[::-1][:3]

print(f"\n    Demonstrating on test index {churner_idx}")
print(f"    Predicted probability : {y_pred_prob[churner_idx]:.4f}")
print(f"    Actual label          : {y_test.iloc[churner_idx]}")
print("\n    --- Top 3 SHAP Factors ---")
for rank, idx in enumerate(top3_idx, start=1):
    direction = "increases" if sv_row[idx] > 0 else "decreases"
    print(f"      #{rank}  {feature_names[idx]:<40s}  SHAP={sv_row[idx]:+.4f}  ({direction} churn risk)")

explanation = shap.Explanation(
    values        = shap_values[churner_idx],
    base_values   = float(explainer.expected_value),
    data          = X_test[churner_idx],
    feature_names = feature_names,
)
shap.plots.waterfall(explanation, max_display=10, show=False)
plt.title(f"SHAP Waterfall – Test Sample #{churner_idx}", fontsize=13)
plt.tight_layout()
plt.savefig(DATA_DIR / "shap_waterfall.png", dpi=120, bbox_inches="tight")
plt.close()
print("    [PLOT]  shap_waterfall.png saved")


# ──────────────────────────────────────────────────────────────────────────────
# Summary
# ──────────────────────────────────────────────────────────────────────────────
section("TRAINING COMPLETE [OK]")
print(f"  model.pkl         → {MODEL_PATH}")
print(f"  preprocessor.pkl  → {PREPROCESSOR_PATH}")
print(f"  ROC-AUC           → {roc_auc:.4f}")
print(f"  CV Recall         → {recall_cv.mean():.4f}")
print()
print("  Next steps:")
print("    Terminal 1 → uvicorn backend.main:app --reload")
print("    Terminal 2 → streamlit run frontend/app.py")
print()
