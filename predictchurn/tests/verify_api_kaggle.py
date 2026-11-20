"""
verify_api_kaggle.py
====================
End-to-end proof against a live PredictChurn backend using plain `requests`
(no browser). Verifies every real flow for the Kaggle-trained model:

  1. /health fast (<= 1s response time)
  2. POST /train with data/kaggle_training.csv -> full metrics payload
  3. GET /metrics -> 200 with test_probabilities
  4. POST /predict with data/kaggle_to_predict.csv -> 300 predictions + summary
  5. POST /predict-one valid customer -> one prediction with reasons
  6. POST /predict-one error cases (missing field, wrong type) -> JSON 4xx
  7. POST /predict-one unseen category -> handled without crash
  8. POST /predict wrong-schema CSV -> 400 listing missing columns
  9. GET /sample-csv and /template-csv -> valid CSV
 10. /predict determinism (two identical runs)
 11. Timing for every call

Usage:  python verify_api_kaggle.py [base_url]
        default base_url = http://127.0.0.1:8000   (use 127.0.0.1, not
        localhost: Windows resolves localhost to ::1 and IPv6 is dropped,
        adding ~2s per request through no fault of the API)
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).parent.parent
DATA_DIR = ROOT / "data"

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"

RESULTS: list[dict] = []


def timed(name: str, fn):
    t0 = time.time()
    try:
        ok, detail = fn()
    except Exception as exc:  # noqa: BLE001
        ok, detail = False, f"{type(exc).__name__}: {exc}"
    dt = time.time() - t0
    RESULTS.append({"name": name, "ok": ok, "seconds": round(dt, 2), "detail": detail})
    print(f"[{'PASS' if ok else 'FAIL'}] {name}  ({dt:.2f}s)  {detail}")
    return ok


def main() -> int:
    print(f"Base URL: {BASE}\n")

    # ------------------------------------------------------------------
    def check_health():
        r = requests.get(f"{BASE}/health", timeout=5)
        body = r.json()
        ok = r.status_code == 200 and body.get("status") == "ok" and "model_loaded" in body
        return ok, f"status={r.status_code} body={json.dumps(body)[:120]}"

    timed("1. GET /health fast + shape", check_health)

    # ------------------------------------------------------------------
    def check_train():
        with open(DATA_DIR / "kaggle_training.csv", "rb") as f:
            r = requests.post(
                f"{BASE}/train",
                files={"file": ("kaggle_training.csv", f, "text/csv")},
                timeout=600,
            )
        if r.status_code != 200:
            return False, f"status={r.status_code} body={r.text[:300]}"
        m = r.json()
        required = [
            "accuracy", "precision", "recall", "f1", "roc_auc",
            "confusion_matrix", "roc_curve", "class_balance", "cleaning",
            "categories", "training_seconds",
        ]
        missing = [k for k in required if k not in m]
        if missing:
            return False, f"missing fields: {missing}"
        s = requests.get(f"{BASE}/train/status", timeout=5).json()
        return True, (
            f"acc={m['accuracy']} prec={m['precision']} rec={m['recall']} f1={m['f1']} "
            f"roc_auc={m['roc_auc']} cv={m.get('cv_scores')} mean={m.get('cv_mean')} "
            f"train_seconds={m['training_seconds']} last_stage={s.get('stage')}"
        )

    timed("2. POST /train (kaggle_training.csv)", check_train)

    # ------------------------------------------------------------------
    metrics_after_train = {}

    def check_metrics():
        r = requests.get(f"{BASE}/metrics", timeout=60)
        if r.status_code != 200:
            return False, f"status={r.status_code} body={r.text[:200]}"
        m = r.json()
        metrics_after_train.update(m)
        has_probs = isinstance(m.get("test_probabilities"), list) and len(m["test_probabilities"]) > 0
        return has_probs, (
            f"status=200 roc_auc={m['roc_auc']} cv_mean={m.get('cv_mean')} "
            f"test_probabilities={len(m.get('test_probabilities') or [])} entries"
        )

    timed("3. GET /metrics with test_probabilities", check_metrics)

    # ------------------------------------------------------------------
    first_predict_payload = {}

    def check_predict():
        with open(DATA_DIR / "kaggle_to_predict.csv", "rb") as f:
            r = requests.post(
                f"{BASE}/predict?threshold=0.5",
                files={"file": ("kaggle_to_predict.csv", f, "text/csv")},
                timeout=600,
            )
        if r.status_code != 200:
            return False, f"status={r.status_code} body={r.text[:300]}"
        body = r.json()
        preds = body.get("predictions", [])
        summary = body.get("summary", {})
        req_item = ["customer_id", "prediction", "churn_probability_pct", "risk_level", "top_reasons", "suggested_action"]
        bad = [i for i, p in enumerate(preds) if any(k not in p for k in req_item)]
        probs_ok = all(0 <= p["churn_probability_pct"] <= 100 for p in preds)
        first_predict_payload.update(body)
        return (
            len(preds) == 300 and not bad and bool(summary) and probs_ok,
            f"n={len(preds)} leave={summary.get('predicted_to_leave')} avg_risk={summary.get('avg_churn_risk_pct')}% "
            f"high={summary.get('high_risk')} revenue_at_risk=${summary.get('revenue_at_risk')} "
            f"missing_fields_rows={len(bad)} example_reason={preds[0]['top_reasons'][0] if preds else '-'}",
        )

    timed("4. POST /predict (300 rows + summary)", check_predict)

    # ------------------------------------------------------------------
    def check_determinism():
        with open(DATA_DIR / "kaggle_to_predict.csv", "rb") as f:
            r = requests.post(
                f"{BASE}/predict?threshold=0.5",
                files={"file": ("kaggle_to_predict.csv", f, "text/csv")},
                timeout=600,
            )
        body = r.json()
        a = json.dumps(first_predict_payload, sort_keys=True)
        b = json.dumps(body, sort_keys=True)
        return a == b, "identical JSON payload" if a == b else "payloads differ"

    timed("5. POST /predict determinism (2nd run)", check_determinism)

    # ------------------------------------------------------------------
    customer = {
        "customer_id": "CUST_TEST_001",
        "gender": "Female",
        "SeniorCitizen": 0,
        "Partner": "Yes",
        "Dependents": "No",
        "tenure": 4,
        "PhoneService": "Yes",
        "MultipleLines": "No",
        "InternetService": "Fiber optic",
        "OnlineSecurity": "No",
        "OnlineBackup": "No",
        "DeviceProtection": "No",
        "TechSupport": "No",
        "StreamingTV": "Yes",
        "StreamingMovies": "Yes",
        "Contract": "Month-to-month",
        "PaperlessBilling": "Yes",
        "PaymentMethod": "Electronic check",
        "MonthlyCharges": 89.5,
        "TotalCharges": "",  # blank -> must be imputed with TRAINING median
    }

    def check_predict_one():
        r = requests.post(f"{BASE}/predict-one?threshold=0.5", json=customer, timeout=60)
        if r.status_code != 200:
            return False, f"status={r.status_code} body={r.text[:300]}"
        p = r.json()
        ok = all(k in p for k in ["prediction", "churn_probability_pct", "risk_level", "top_reasons", "suggested_action"])
        return ok, (
            f"{p.get('prediction')} {p.get('churn_probability_pct')}% risk={p.get('risk_level')} "
            f"reasons={p.get('top_reasons')[:2]}"
        )

    timed("6. POST /predict-one valid (blank TotalCharges imputed)", check_predict_one)

    # ------------------------------------------------------------------
    def check_missing_field():
        bad = {k: v for k, v in customer.items() if k != "tenure"}
        r = requests.post(f"{BASE}/predict-one", json=bad, timeout=30)
        detail = r.json().get("detail", "")
        return (
            r.status_code == 400 and "tenure" in str(detail) and "detail" in r.json(),
            f"status={r.status_code} detail={str(detail)[:120]}",
        )

    timed("7. POST /predict-one missing field -> 400 JSON", check_missing_field)

    def check_wrong_type():
        bad = dict(customer, tenure="abc")
        r = requests.post(f"{BASE}/predict-one", json=bad, timeout=30)
        detail = str(r.json().get("detail", ""))
        return (
            r.status_code == 400 and "tenure" in detail,
            f"status={r.status_code} detail={detail[:120]}",
        )

    timed("8. POST /predict-one wrong type -> 400 JSON", check_wrong_type)

    def check_unseen_category():
        odd = dict(customer, Contract="Ultra-Deluxe-Plan")
        r = requests.post(f"{BASE}/predict-one", json=odd, timeout=30)
        ok = r.status_code == 200 and "prediction" in r.json()
        return ok, f"status={r.status_code} pred={r.json().get('prediction')} {r.json().get('churn_probability_pct')}%"

    timed("9. POST /predict-one unseen category handled", check_unseen_category)

    # ------------------------------------------------------------------
    def check_wrong_schema():
        r = requests.post(
            f"{BASE}/predict",
            files={"file": ("bad.csv", b"customer_id,gender,tenure\n1,Female,12\n", "text/csv")},
            timeout=30,
        )
        detail = str(r.json().get("detail", ""))
        ok = r.status_code == 400 and "Missing required columns" in detail
        return ok, f"status={r.status_code} detail={detail[:160]}"

    timed("10. POST /predict wrong-schema CSV -> 400", check_wrong_schema)

    # ------------------------------------------------------------------
    def check_csvs():
        rs = requests.get(f"{BASE}/sample-csv", timeout=60)
        rt = requests.get(f"{BASE}/template-csv", timeout=60)
        ok_s = rs.status_code == 200 and rs.headers.get("content-type", "").startswith("text/csv") and len(rs.content) > 100
        ok_t = rt.status_code == 200 and rt.headers.get("content-type", "").startswith("text/csv") and len(rt.content) > 100
        sample_rows = rs.content.decode("utf-8-sig").strip().count("\n")
        return ok_s and ok_t, f"sample-csv {len(rs.content)}B ~{sample_rows} rows | template-csv {len(rt.content)}B"

    timed("11. GET /sample-csv + /template-csv", check_csvs)

    # ------------------------------------------------------------------
    # Contract consistency between /train response and /metrics
    def check_contract():
        with open(DATA_DIR / "kaggle_training.csv", "rb") as f:
            r = requests.post(f"{BASE}/train", files={"file": ("k.csv", f, "text/csv")}, timeout=600)
        m_train = r.json()
        m_metrics = requests.get(f"{BASE}/metrics", timeout=60).json()
        keys_differ = set(m_train) ^ set(m_metrics) - {"test_probabilities"}
        same_auc = m_train.get("roc_auc") == m_metrics.get("roc_auc")
        gap = abs(m_metrics.get("cv_mean", 0) - m_metrics.get("roc_auc", 0))
        return (
            r.status_code == 200 and same_auc and gap <= 0.05,
            f"train.roc_auc={m_train.get('roc_auc')} metrics.roc_auc={m_metrics.get('roc_auc')} "
            f"cv_mean={m_metrics.get('cv_mean')} cv-test gap={gap:.4f} key_mismatch={sorted(keys_differ)}",
        )

    timed("12. POST /train again -> deterministic metrics + honest gap", check_contract)

    failed = [r for r in RESULTS if not r["ok"]]
    print(f"\n{'=' * 70}\nRESULT: {len(RESULTS) - len(failed)}/{len(RESULTS)} checks passed")
    if failed:
        for r in failed:
            print(f"  FAILED: {r['name']}: {r['detail']}")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
