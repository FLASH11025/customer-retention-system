"""
api.py
======
FastAPI application for PredictChurn service.

Startup design (Windows-friendly):
- No heavy ML libraries are imported at module import time; the app binds the
  port and answers /health immediately.
- bundle.pkl is loaded in a background thread during startup; /health reports
  {"status": "ok", "model_loaded": bool, "loading": bool}.
- Start with:
      python -m uvicorn api:app --host 0.0.0.0 --port 8000     (NO --reload)
"""

from __future__ import annotations

import io
import logging
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from churn_model import (
    ChurnModel,
    NUM_COLS,
    REQUIRED_COLS_PREDICT,
    REQUIRED_COLS_TRAIN,
    LEGACY_NUM_ALIASES,
    LEGACY_REQUIRED_CORE,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("predictchurn.api")

MODELS_DIR = Path(__file__).parent / "models"
DATA_DIR = Path(__file__).parent / "data"

model_instance = ChurnModel()
_model_lock = threading.Lock()

TRAIN_STAGES = ["validating", "cleaning", "balancing", "training", "evaluating", "done"]
_train_status: dict[str, Any] = {
    "stage": None,
    "running": False,
    "started_at": None,
    "finished_at": None,
    "error": None,
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load the saved model bundle in a background thread; app binds immediately."""
    def _load():
        model_instance.loading = True
        try:
            ok = model_instance.load(MODELS_DIR)
            logger.info("Model bundle load: %s (error=%s)", ok, model_instance.load_error)
        except Exception as exc:  # never crash startup
            model_instance.load_error = f"Model load failed: {exc}"
            logger.exception("Model load failed")
        finally:
            model_instance.loading = False

    threading.Thread(target=_load, name="model-loader", daemon=True).start()
    yield


app = FastAPI(
    title="PredictChurn API",
    description="Customer Churn Prediction and Explainability Service",
    version="2.1.0",
    lifespan=lifespan,
)

# CORS: explicit frontend origins (localhost and 127.0.0.1 on :3000/:3001)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# JSON error contract: every failure returns {"detail": "<specific message>"}
# ---------------------------------------------------------------------------
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    detail = exc.detail if isinstance(exc.detail, str) else JSON_of(exc.detail)
    return JSONResponse(status_code=exc.status_code, content={"detail": detail})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = []
    for err in exc.errors()[:10]:
        loc = ".".join(str(x) for x in err.get("loc", []))
        errors.append(f"{loc}: {err.get('msg')}")
    return JSONResponse(status_code=400, content={"detail": "; ".join(errors) or "Invalid request"})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": f"Internal error: {exc}"})


def JSON_of(x: Any) -> str:
    try:
        import json

        return json.dumps(x)
    except Exception:
        return str(x)


def read_csv_bytes(content: bytes):
    """Parse CSV bytes tolerating BOM and CRLF line endings."""
    pd = _pandas()
    return pd.read_csv(io.BytesIO(content), encoding="utf-8-sig")


def _pandas():
    from churn_model import _heavy

    return _heavy()["pandas"]


def ensure_model_ready() -> None:
    """Raise a clear HTTP error if the model is absent/loading/incompatible."""
    if model_instance.model is not None:
        return
    if model_instance.loading:
        raise HTTPException(status_code=503, detail="Model is loading, try again in a few seconds.")
    # Not loaded in memory: try disk once
    with _model_lock:
        if model_instance.model is None:
            ok = model_instance.load(MODELS_DIR)
            if not ok:
                raise HTTPException(status_code=409, detail=model_instance.load_error or "No model trained yet. Train a model first.")


# ---------------------------------------------------------------------------
# Meta endpoints
# ---------------------------------------------------------------------------
@app.get("/health", tags=["meta"])
def health():
    """Fast liveness check. Must not import or load the model."""
    return {
        "status": "ok",
        "model_loaded": model_instance.model is not None,
        "loading": model_instance.loading,
        "load_error": model_instance.load_error,
    }


@app.get("/", tags=["meta"])
def root():
    return {
        "service": "PredictChurn API",
        "status": "online",
        "has_model": model_instance.model is not None,
    }


@app.get("/model-status", tags=["meta"])
def model_status():
    """Check whether a trained model currently exists in memory or disk."""
    ensure_model_ready()
    metrics = model_instance.metrics or {}
    return {
        "trained": model_instance.model is not None,
        "algorithm": metrics.get("algorithm", model_instance.algorithm),
        "trained_at": metrics.get("trained_at"),
        "train_rows": metrics.get("train_rows", 0),
        "test_rows": metrics.get("test_rows", 0),
        "categories": model_instance.categories,
    }


@app.get("/metrics", tags=["meta"])
def get_metrics():
    """Return metrics and test probabilities from the active model. 404 if no model."""
    ensure_model_ready()
    if model_instance.metrics is None:
        raise HTTPException(status_code=404, detail="No model trained yet")
    return model_instance.metrics


@app.get("/train/status", tags=["training"])
def train_status():
    """Expose the current training stage for frontend staged progress."""
    return dict(_train_status)


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------
@app.post("/train", tags=["training"])
async def train(file: UploadFile = File(...)):
    """Train the model using an uploaded CSV with churned column.

    Runs the blocking pipeline in a worker thread so the event loop (and
    /health) stays responsive; stage progress is exposed on /train/status.
    """
    logger.info("Received /train upload: %s", file.filename)
    try:
        content = await file.read()
        df = read_csv_bytes(content)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not parse CSV file: {exc}")

    with _model_lock:
        if _train_status["running"]:
            raise HTTPException(status_code=409, detail="A training job is already running.")
        _train_status.update(
            {"stage": "validating", "running": True, "started_at": time.time(), "finished_at": None, "error": None}
        )
        try:
            metrics = await run_in_threadpool(
                model_instance.train, df, (lambda stage: _train_status.update({"stage": stage}))
            )
            await run_in_threadpool(model_instance.save, MODELS_DIR)
            logger.info("Training complete. Algorithm=%s, ROC-AUC=%.4f", metrics["algorithm"], metrics["roc_auc"])
            train_resp = {k: v for k, v in metrics.items() if k != "test_probabilities"}
            return train_resp
        except ValueError as ve:
            _train_status.update({"stage": "error", "running": False, "error": str(ve), "finished_at": time.time()})
            raise HTTPException(status_code=400, detail=str(ve))
        except Exception as exc:
            logger.exception("Training failed: %s", exc)
            _train_status.update({"stage": "error", "running": False, "error": str(exc), "finished_at": time.time()})
            raise HTTPException(status_code=500, detail=f"Training error: {exc}")
        finally:
            _train_status.update({"running": False, "finished_at": time.time()})


# ---------------------------------------------------------------------------
# Prediction
# ---------------------------------------------------------------------------
# Last successful batch prediction, kept so the UI can recover its scored
# cohort after a browser restart / new tab (sessionStorage-style state loss).
_LAST_PREDICTION = None  # Optional[dict]; set after every successful /predict


@app.post("/predict", tags=["prediction"])
async def predict_batch(
    file: UploadFile = File(...),
    threshold: float = Query(0.5, ge=0.0, le=1.0),
):
    """Run batch churn predictions with SHAP drivers from an uploaded CSV."""
    ensure_model_ready()
    try:
        content = await file.read()
        df = read_csv_bytes(content)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not parse CSV: {exc}")

    try:
        result = await run_in_threadpool(model_instance.predict, df, threshold)
        global _LAST_PREDICTION
        _LAST_PREDICTION = result
        return result
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as exc:
        logger.exception("Prediction failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Prediction error: {exc}")


@app.get("/predict/last", tags=["prediction"])
async def predict_last():
    """Return the most recent successful /predict result for UI recovery."""
    if _LAST_PREDICTION is None:
        raise HTTPException(
            status_code=404,
            detail="No predictions have been generated since the backend started. Score a CSV on the Upload page (Score Customers mode) to populate the Risk Radar and Customers pages.",
        )
    return _LAST_PREDICTION


def _validate_predict_one_payload(payload: dict) -> None:
    """400 with a specific message for missing fields or wrong types.

    Accepts either the real Telco schema OR the legacy synthetic schema
    (plan_type / contract_type / payment_method / account_age_months /
    monthly_charges), which ChurnModel maps deterministically before inference.
    """
    cols = set(payload.keys())
    telco_missing = [c for c in REQUIRED_COLS_PREDICT if c != "customer_id" and c not in payload]
    legacy_missing = [c for c in LEGACY_REQUIRED_CORE if c not in payload]

    if telco_missing and legacy_missing:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Missing required fields: {telco_missing}. "
                f"Alternatively send the legacy schema (plan_type, contract_type, payment_method, "
                f"account_age_months, monthly_charges); then these are still missing: {legacy_missing}."
            ),
        )

    # Type-check the numeric fields of whichever schema applies. Blank/None
    # values are MISSING -> derived or imputed with the training median.
    numeric_fields = list(NUM_COLS) if not telco_missing else list(LEGACY_NUM_ALIASES.keys())
    for col in numeric_fields:
        val = payload.get(col)
        if val is None or (isinstance(val, str) and not val.strip()):
            continue
        try:
            float(val)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f"Field '{col}' must be numeric, got: {val!r}")
    if payload.get("churned") is not None and str(payload.get("churned")).strip().lower() not in ("0", "1", "yes", "no", "true", "false"):
        raise HTTPException(status_code=400, detail=f"Field 'churned' must be 0/1 or Yes/No, got: {payload.get('churned')!r}")


@app.post("/predict-one", tags=["prediction"])
async def predict_one(
    payload: dict[str, Any],
    threshold: float = Query(0.5, ge=0.0, le=1.0),
):
    """Predict churn probability and top SHAP drivers for a single customer."""
    ensure_model_ready()
    _validate_predict_one_payload(payload)

    try:
        result = await run_in_threadpool(model_instance.predict_one, payload, threshold)
        return result
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as exc:
        logger.exception("Single prediction error: %s", exc)
        raise HTTPException(status_code=500, detail=f"Prediction failed: {exc}")


# ---------------------------------------------------------------------------
# Sample / template CSVs
# ---------------------------------------------------------------------------
def _first_existing(*paths: Path) -> Path | None:
    for p in paths:
        if p.exists():
            return p
    return None


@app.get("/sample-csv", tags=["data"])
def download_sample_csv():
    """Download a training CSV sample (300 rows with churned column)."""
    pd = _pandas()
    full_path = _first_existing(DATA_DIR / "kaggle_training.csv", DATA_DIR / "telco_training.csv")
    if full_path is None:
        raise HTTPException(
            status_code=404,
            detail="Training data not found. Run python predictchurn/download_data.py first.",
        )
    sample_path = DATA_DIR / "sample_training.csv"
    if not sample_path.exists():
        pd.read_csv(full_path).head(300).to_csv(sample_path, index=False)
    return FileResponse(sample_path, media_type="text/csv", filename="sample_training.csv")


@app.get("/template-csv", tags=["data"])
def download_template_csv():
    """Download a scoring template CSV (no churned column)."""
    template_path = _first_existing(
        DATA_DIR / "kaggle_to_predict.csv", DATA_DIR / "telco_to_predict.csv"
    )
    if template_path is None:
        raise HTTPException(
            status_code=404,
            detail="Prediction template not found. Run python predictchurn/prepare_kaggle.py first.",
        )
    return FileResponse(template_path, media_type="text/csv", filename="sample_to_predict.csv")
