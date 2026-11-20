"""
PredictiChurn – FastAPI Backend
================================
POST /predict  →  Churn probability + top-3 SHAP explanations
GET  /health   →  Liveness check
"""

from __future__ import annotations

import os
import warnings
from pathlib import Path
from typing import List

import joblib
import numpy as np
import pandas as pd
import shap
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

warnings.filterwarnings("ignore")

# ─── Paths ────────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
MODEL_PATH = BASE_DIR / "model.pkl"
PREPROCESSOR_PATH = BASE_DIR / "preprocessor.pkl"

# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="PredictiChurn API",
    description="SaaS/Telecom Customer Churn Prediction with SHAP Explanations",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Lazy-load artefacts (avoids cold-start errors if files aren't ready yet) ──
_model = None
_preprocessor = None
_explainer = None


def _load_artefacts():
    global _model, _preprocessor, _explainer
    if _model is None:
        if not MODEL_PATH.exists():
            raise FileNotFoundError(
                f"model.pkl not found at {MODEL_PATH}. "
                "Run the training notebook first."
            )
        _model = joblib.load(MODEL_PATH)

    if _preprocessor is None:
        if not PREPROCESSOR_PATH.exists():
            raise FileNotFoundError(
                f"preprocessor.pkl not found at {PREPROCESSOR_PATH}. "
                "Run the training notebook first."
            )
        _preprocessor = joblib.load(PREPROCESSOR_PATH)

    if _explainer is None:
        _explainer = shap.TreeExplainer(_model)

    return _model, _preprocessor, _explainer


# ─── Pydantic Schema ──────────────────────────────────────────────────────────
class CustomerFeatures(BaseModel):
    """Raw customer features exactly as collected from the Streamlit form."""

    # Numeric
    tenure: float = Field(..., ge=0, le=120, description="Months as customer")
    MonthlyCharges: float = Field(..., ge=0, description="Monthly bill (USD)")
    TotalCharges: float = Field(..., ge=0, description="Total billed (USD)")

    # Binary yes/no services
    SeniorCitizen: int = Field(..., ge=0, le=1)
    gender: str = Field(..., pattern="^(Male|Female)$")
    Partner: str = Field(..., pattern="^(Yes|No)$")
    Dependents: str = Field(..., pattern="^(Yes|No)$")
    PhoneService: str = Field(..., pattern="^(Yes|No)$")
    PaperlessBilling: str = Field(..., pattern="^(Yes|No)$")

    # Categorical
    MultipleLines: str
    InternetService: str
    OnlineSecurity: str
    OnlineBackup: str
    DeviceProtection: str
    TechSupport: str
    StreamingTV: str
    StreamingMovies: str
    Contract: str
    PaymentMethod: str

    model_config = {"json_schema_extra": {
        "example": {
            "tenure": 12,
            "MonthlyCharges": 70.35,
            "TotalCharges": 820.50,
            "SeniorCitizen": 0,
            "gender": "Male",
            "Partner": "Yes",
            "Dependents": "No",
            "PhoneService": "Yes",
            "PaperlessBilling": "Yes",
            "MultipleLines": "No",
            "InternetService": "Fiber optic",
            "OnlineSecurity": "No",
            "OnlineBackup": "No",
            "DeviceProtection": "No",
            "TechSupport": "No",
            "StreamingTV": "Yes",
            "StreamingMovies": "Yes",
            "Contract": "Month-to-month",
            "PaymentMethod": "Electronic check",
        }
    }}


class SHAPFactor(BaseModel):
    feature: str
    impact: float
    direction: str          # "increases" | "decreases"
    description: str


class PredictionResponse(BaseModel):
    churn_probability: float
    churn_prediction: bool
    risk_label: str         # Low / Medium / High
    top_factors: List[SHAPFactor]


# ─── Helper ───────────────────────────────────────────────────────────────────
def _risk_label(prob: float) -> str:
    if prob < 0.35:
        return "Low"
    if prob < 0.65:
        return "Medium"
    return "High"


def _build_top_factors(
    shap_values: np.ndarray,
    feature_names: list,
    n: int = 3,
) -> List[SHAPFactor]:
    """Return the top-n features by absolute SHAP value."""
    abs_vals = np.abs(shap_values)
    top_idx = np.argsort(abs_vals)[::-1][:n]
    factors = []
    for idx in top_idx:
        sv = float(shap_values[idx])
        direction = "increases" if sv > 0 else "decreases"
        impact_pct = round(abs(sv) * 100, 1)
        name = feature_names[idx]
        description = (
            f"'{name}' {direction} churn risk "
            f"by ~{impact_pct}%"
        )
        factors.append(
            SHAPFactor(
                feature=name,
                impact=round(sv, 4),
                direction=direction,
                description=description,
            )
        )
    return factors


# ─── Endpoints ────────────────────────────────────────────────────────────────
@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok", "service": "PredictiChurn API v1.0"}


@app.post("/predict", response_model=PredictionResponse, tags=["prediction"])
def predict(customer: CustomerFeatures):
    try:
        model, preprocessor, explainer = _load_artefacts()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    # ── 1. Build raw dataframe ────────────────────────────────────────────────
    raw = pd.DataFrame([customer.model_dump()])

    # ── 2. Preprocess (scale + encode) ───────────────────────────────────────
    try:
        processed = preprocessor.transform(raw)
        feature_names: list = preprocessor.get_feature_names_out().tolist()
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Preprocessing error: {exc}",
        )

    # ── 3. Predict ───────────────────────────────────────────────────────────
    proba = float(model.predict_proba(processed)[0, 1])
    prediction = proba >= 0.5

    # ── 4. SHAP explanations ─────────────────────────────────────────────────
    shap_values = explainer.shap_values(processed)[0]   # shape (n_features,)
    top_factors = _build_top_factors(shap_values, feature_names, n=3)

    return PredictionResponse(
        churn_probability=round(proba, 4),
        churn_prediction=bool(prediction),
        risk_label=_risk_label(proba),
        top_factors=top_factors,
    )
