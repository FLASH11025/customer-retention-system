# PredictChurn — Kaggle Data

The model trains on the real [Telco Customer Churn dataset](https://www.kaggle.com/datasets/blastchar/telco-customer-churn) from Kaggle.

## Download from Kaggle

```powershell
# Default slug: blastchar/telco-customer-churn
python predictchurn/download_data.py

# Or any other Kaggle dataset slug:
python predictchurn/download_data.py <owner/dataset-slug>
```

- `kagglehub` can download **public** datasets without credentials. If Kaggle returns
  401/403, create a token:
  1. Go to [kaggle.com](https://www.kaggle.com), sign in, open **Settings → API**.
  2. Click **"Create New Token"** (or **"Generate New Token"**).
  3. Save the downloaded `kaggle.json` to `C:\Users\<your-username>\.kaggle\kaggle.json`,
     **or** set the environment variables `KAGGLE_USERNAME` and `KAGGLE_KEY` in the
     terminal session before running the command.
- The token file is ignored by git (`.kaggle/`, `kaggle.json` are in `.gitignore`);
  never commit it.

## CSV schemas accepted

The pipeline accepts **both** file layouts and maps them deterministically:

- **Real Telco schema** (21 columns with `churned`, 20 without): `Contract`,
  `PaymentMethod`, `InternetService`, `tenure`, `MonthlyCharges`, `TotalCharges`, ...
- **Legacy synthetic schema** (14 with `churned`, 13 without): `plan_type`,
  `contract_type`, `payment_method`, `account_age_months`, `monthly_charges`,
  `annual_spend`, `logins_last_30d`, `days_since_last_login`,
  `support_tickets_total`, `unresolved_tickets`, `late_payments_count`,
  `feature_usage_score`, ...

Legacy mapping (implemented in `predictchurn/churn_model.py` →
`_apply_legacy_schema_map`):

| legacy column      | Telco column    | value mapping                                             |
| ------------------ | --------------- | --------------------------------------------------------- |
| `account_age_months` | `tenure`       | numeric rename                                            |
| `monthly_charges`  | `MonthlyCharges`| numeric rename                                            |
| `annual_spend`     | `TotalCharges`  | numeric rename (derived `monthly × tenure` if absent)     |
| `plan_type`        | `InternetService`| Basic→No, Pro→DSL, Enterprise→Fiber optic                |
| `contract_type`    | `Contract`      | Monthly→Month-to-month, Yearly→One year                   |
| `payment_method`   | `PaymentMethod` | Bank→Bank transfer (automatic), Card→Credit card (automatic), UPI→Electronic check |

The behavioral columns are **kept as extra model features** for legacy files;
Telco files get them as constant 0.0 (model-inert). Telco categoricals missing
from a legacy file (gender, Partner, ...) are inserted as constants. Every
applied mapping step is reported in `metrics.cleaning.schema_mapping` and shown
on the Data Health page.

## Prepare the files

```powershell
python predictchurn/prepare_kaggle.py
```

Produces:
- `predictchurn/data/kaggle_training.csv` — all 7,043 rows with the `churned` column
- `predictchurn/data/kaggle_to_predict.csv` — 300-row random sample (random_state=42) without `churned`

## Train and score

```powershell
python predictchurn/train.py predictchurn/data/kaggle_training.csv
python predictchurn/predict.py predictchurn/data/kaggle_to_predict.csv
```

## Run the backend + frontend (Windows)

```powershell
# Terminal 1 — backend (NO --reload on Windows)
cd predictchurn
python -m uvicorn api:app --host 0.0.0.0 --port 8000

# Terminal 2 — frontend
npm run build    # first time or after code changes
npm start -- -p 3000
```
