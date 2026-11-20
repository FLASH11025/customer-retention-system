# PredictChurn

A production-grade **customer churn intelligence** web application built with:

- 🐍 **Backend:** Python · FastAPI · XGBoost · SHAP · SMOTE
- ⚡ **Frontend:** Next.js 14 (App Router) · TypeScript · Tailwind CSS · Zustand
- 📊 **Dataset:** IBM Telco Customer Churn (7,043 customers, OpenML ID 42178)

---

## Features

- Train an XGBoost model on your own CSV or the included Telco dataset
- Batch predictions with risk scoring (Low / Medium / High)
- SHAP-based explanations — real reasons per customer, not generic labels
- Retention action recommendations per feature value
- Threshold slider that recalculates precision/recall/F1 live in the browser
- ROC curve, confusion matrix, cleaning audit, class balance report
- What-if Simulator — adjust any of 19 customer attributes, see churn probability change in real time
- Kanban Playbook grouped by risk tier
- Zero hardcoded/mock data — every number comes from the backend

---

## Trained Model Metrics (Telco dataset)

| Metric | Value |
|---|---|
| Algorithm | XGBoost |
| Accuracy | 77.29% |
| Precision | 55.82% |
| Recall | 69.25% |
| F1 Score | 0.618 |
| ROC-AUC | **0.843** |
| Churn Rate | 26.54% |

---

## Quick Start

### 1. Backend

```bash
cd predictchurn
pip install -r requirements.txt

# Download and prepare the dataset, then train
python train.py data/telco_training.csv

# Or upload a CSV via the web UI

# Start the API server
uvicorn api:app --host 0.0.0.0 --port 8000
```

> **Note:** `telco_training.csv` and `bundle.pkl` are excluded from git (large files).  
> Download the dataset with:
> ```python
> from sklearn.datasets import fetch_openml
> d = fetch_openml(data_id=42178, as_frame=True)
> d.frame.to_csv('predictchurn/data/raw_telco.csv', index=False)
> ```
> Then run `python predictchurn/train.py predictchurn/data/raw_telco.csv`.

### 2. Frontend

```bash
# From the project root
npm install
cp .env.local.example .env.local   # set NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev        # development
npm start -- -p 3000   # production build
```

### 3. Open

```
http://localhost:3000
```

---

## Project Structure

```
project ml/
├── predictchurn/           # Python backend
│   ├── api.py              # FastAPI app (4 endpoints)
│   ├── churn_model.py      # XGBoost pipeline + SHAP
│   ├── train.py            # CLI training script
│   ├── predict.py          # CLI batch prediction script
│   ├── requirements.txt
│   ├── data/
│   │   ├── telco_to_predict.csv      # 300-row prediction sample
│   │   └── telco_sample_training.csv # 300-row training sample
│   └── models/             # bundle.pkl saved here after training
│
├── app/                    # Next.js App Router
│   ├── (marketing)/        # Landing / Overview page
│   └── (app)/              # All 9 app pages
│       ├── upload/
│       ├── model/
│       ├── radar/
│       ├── customers/
│       ├── data-health/
│       ├── simulator/
│       ├── playbook/
│       └── settings/
│
├── components/             # Reusable UI components
├── lib/                    # API client, Zustand store, CSV utils, formatters
├── tests/                  # Vitest unit tests (16 tests)
└── tailwind.config.ts      # Signal design tokens
```

---

## CSV Schema (Telco)

**Training CSV** must include these 21 columns:

| Column | Type | Notes |
|---|---|---|
| `customer_id` | string | Auto-generated if missing |
| `Contract` | categorical | Month-to-month, One year, Two year |
| `PaymentMethod` | categorical | Electronic check, Credit card, etc. |
| `InternetService` | categorical | DSL, Fiber optic, No |
| `gender` | categorical | Male, Female |
| `SeniorCitizen` | 0 or 1 | |
| `Partner` | Yes / No | |
| `Dependents` | Yes / No | |
| `PhoneService` | Yes / No | |
| `MultipleLines` | Yes / No | |
| `OnlineSecurity` | Yes / No | |
| `OnlineBackup` | Yes / No | |
| `DeviceProtection` | Yes / No | |
| `TechSupport` | Yes / No | |
| `StreamingTV` | Yes / No | |
| `StreamingMovies` | Yes / No | |
| `PaperlessBilling` | Yes / No | |
| `tenure` | integer | Months as customer |
| `MonthlyCharges` | float | |
| `TotalCharges` | float | Blanks OK — imputed with median |
| `churned` | 0 or 1 | **Training only** |

---

## Tech Stack

| Layer | Technology |
|---|---|
| ML | XGBoost 3.x, SHAP, imbalanced-learn (SMOTE), scikit-learn |
| API | FastAPI, Uvicorn, Python-multipart |
| Frontend | Next.js 14 App Router, React 18, TypeScript 5 |
| Styling | Tailwind CSS, CSS custom properties |
| State | Zustand + sessionStorage persistence |
| Testing | Vitest (16 tests — CSV, metrics math, formatters) |
| Fonts | Instrument Serif, Geist, JetBrains Mono |

---

## License

MIT
