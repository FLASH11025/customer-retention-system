<div align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&height=140&text=PredictChurn&desc=Customer%20Churn%20Intelligence&animation=fadeIn" width="100%"/>

  # PredictChurn

  > Detect customer churn early, explain why it happens with SHAP, and trigger retention actions.

  [![Next.js](https://img.shields.io/badge/Next.js_14-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
  [![XGBoost](https://img.shields.io/badge/XGBoost_3.x-EB5424?style=for-the-badge&logo=xgboost&logoColor=white)](https://xgboost.readthedocs.io/)
  [![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
  [![ROC-AUC](https://img.shields.io/badge/ROC--AUC-0.843-success?style=for-the-badge)](https://github.com/FLASH11025/customer-retention-system)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

  <br><br>
  <img src="docs/screenshots/01_overview.png" alt="PredictChurn Hero" width="90%"/>
</div>

---

### 💡 Why PredictChurn

Customer attrition quietly bleeds recurring revenue before account managers spot warning signs. PredictChurn bridges production machine learning with customer success operations by predicting churn probability and quantifying exact revenue exposure. Teams receive explainable local SHAP drivers and targeted retention playbooks to intervene before customers leave.

---

### ✨ Key Features

- **Automated CSV Ingestion (`/upload`):** In-browser header validation with dual-mode support for model retraining or cohort scoring.
- **Data Health & SMOTE Audit (`/data-health`):** Transparent record auditing, missing-value imputation, and synthetic oversampling for class balance.
- **Dynamic Threshold Calibration (`/model`):** Real-time client-side confusion matrix, ROC curve, and F1 recalculation across decision thresholds.
- **Executive Risk Radar (`/radar`):** Financial exposure tracking with live revenue-at-risk aggregation and risk-tier segmentation.
- **Customer Intelligence Table (`/customers`):** Searchable, filterable account roster with risk badges and full CRM-ready CSV export.
- **Explainable SHAP Dossiers (`/customers/[id]`):** Local TreeSHAP attribution translating raw feature weights into clear root-cause sentences.
- **Interactive What-If Simulator (`/simulator`):** Real-time single-account scenario testing with immediate probability feedback.
- **Actionable Retention Playbook (`/playbook`):** Kanban workspace organizing accounts into intervention tiers with revenue at stake.

---

### 📸 Screenshots Gallery

<table>
  <tr>
    <td width="50%">
      <img src="docs/screenshots/01_overview.png" alt="Overview"><br>
      <b>Overview & Conversion Hub</b> (<code>/</code>)
    </td>
    <td width="50%">
      <img src="docs/screenshots/02_upload.png" alt="Upload"><br>
      <b>Dataset Ingestion & Validation</b> (<code>/upload</code>)
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="docs/screenshots/03_data_health.png" alt="Data Health"><br>
      <b>Data Health & SMOTE Audit</b> (<code>/data-health</code>)
    </td>
    <td width="50%">
      <img src="docs/screenshots/04_model_evaluation.png" alt="Model Evaluation"><br>
      <b>Model Evaluation & Threshold Slider</b> (<code>/model</code>)
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="docs/screenshots/05_risk_radar.png" alt="Risk Radar"><br>
      <b>Executive Risk Radar</b> (<code>/radar</code>)
    </td>
    <td width="50%">
      <img src="docs/screenshots/06_customer_intelligence.png" alt="Customer Intelligence"><br>
      <b>Customer Intelligence Table</b> (<code>/customers</code>)
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="docs/screenshots/07_customer_detail.png" alt="Customer Detail"><br>
      <b>SHAP Customer Deep-Dive</b> (<code>/customers/[id]</code>)
    </td>
    <td width="50%">
      <img src="docs/screenshots/08_simulator.png" alt="Simulator"><br>
      <b>What-If Risk Simulator</b> (<code>/simulator</code>)
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="docs/screenshots/09_retention_playbook.png" alt="Playbook"><br>
      <b>Retention Kanban Playbook</b> (<code>/playbook</code>)
    </td>
    <td width="50%">
      <img src="docs/screenshots/10_settings.png" alt="Settings"><br>
      <b>Settings & Data Export</b> (<code>/settings</code>)
    </td>
  </tr>
</table>

---

### 🧠 How It Works

```mermaid
flowchart LR
  A[CSV Upload] --> B[Data Cleaning]
  B --> C[SMOTE Balancing]
  C --> D[XGBoost Pipeline]
  D --> E[SHAP TreeExplainer]
  E --> F[Risk Radar & Table]
  F --> G[Retention Playbook]
```

<details>
<summary><b>Detailed Pipeline Specifications</b></summary>
<br>

- **Preprocessing & Balancing:** Median imputation for blank numeric charges, string quote-stripping, and SMOTE synthesis to correct the initial 73.5% Stay vs 26.5% Churn class imbalance.
- **Model Training:** Stratified K-Fold XGBoost Classifier reaching 0.843 ROC-AUC and 77.29% accuracy on held-out test records.
- **SHAP Attribution:** Local TreeSHAP decomposes predictions into marginal feature effects ($\phi_i$), mapped to human-readable drivers and prescriptive retention actions.
- **Financial Risk Modeling:** Aggregates exposure using $\sum (\text{MonthlyCharges} \times 12)$ for all accounts crossing the active decision threshold.
</details>

---

### 🧰 Tech Stack

<div align="center">
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nextjs/nextjs-original.svg" width="45" height="45" alt="Next.js" />&nbsp;&nbsp;&nbsp;&nbsp;
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg" width="45" height="45" alt="TypeScript" />&nbsp;&nbsp;&nbsp;&nbsp;
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg" width="45" height="45" alt="React" />&nbsp;&nbsp;&nbsp;&nbsp;
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/tailwindcss/tailwindcss-original.svg" width="45" height="45" alt="Tailwind" />&nbsp;&nbsp;&nbsp;&nbsp;
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg" width="45" height="45" alt="Python" />&nbsp;&nbsp;&nbsp;&nbsp;
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/fastapi/fastapi-original.svg" width="45" height="45" alt="FastAPI" />&nbsp;&nbsp;&nbsp;&nbsp;
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/scikitlearn/scikitlearn-original.svg" width="45" height="45" alt="Scikit-Learn" />
</div>

<br>

| Layer | Technologies |
|---|---|
| **Frontend** | Next.js 14 (App Router), TypeScript (Strict), Tailwind CSS ("Signal" Theme), Zustand |
| **Backend & ML** | Python 3.10+, FastAPI, Uvicorn, XGBoost 3.x, SHAP 0.54, Imbalanced-Learn (SMOTE), Scikit-Learn |
| **Testing & Tooling** | Vitest (16 unit tests), ESLint, Puppeteer-Core |

```yaml
dataset: "IBM Telco Customer Churn (OpenML #42178)"
records: "7,043 customers, 20 feature columns"
model: "XGBoost Classifier + SMOTE + TreeSHAP"
metrics: "ROC-AUC 0.843 | Accuracy 77.29% | F1 0.618"
design_system: "Signal (Paper #F4F1EA, Night Desk #0E0F0C)"
```

---

### 🏗️ Architecture

```
customer-retention-system/
├── app/                  # Next.js App Router (10 views, layouts, error boundaries)
├── components/           # Reusable UI primitives & Signal layout components
├── lib/                  # Typed API client, Zustand store, CSV parser & metrics
├── predictchurn/         # FastAPI application, XGBoost pipeline & SHAP explainer
│   ├── api.py            # REST endpoints (/train, /predict, /predict-one, /metrics)
│   ├── churn_model.py    # Training logic, SMOTE oversampling & TreeSHAP
│   └── data/             # Training and evaluation CSV datasets
├── tests/                # Vitest unit test suite (16 tests)
└── docs/screenshots/     # High-resolution application screenshots
```

---

### 🚀 Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/FLASH11025/customer-retention-system.git
cd customer-retention-system

# 2. Start the Python Backend
cd predictchurn
pip install -r requirements.txt
python train.py data/telco_training.csv
python -m uvicorn api:app --host 0.0.0.0 --port 8000

# 3. Start the Next.js Frontend (in a new terminal at project root)
cd ..
cp .env.local.example .env.local
npm install
npm run build && npm start -- -p 3000
```

Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

### 🧪 Testing

```bash
npm test -- --run    # Run 16 Vitest unit tests (CSV, metrics, formatting)
npm run typecheck    # Strict TypeScript type safety validation
npm run lint         # ESLint code standards check
```

---

### 🗺️ Roadmap

- [ ] Docker & Docker-Compose one-command containerization
- [ ] Role-based access control (RBAC) & OAuth2 user authentication
- [ ] Bi-directional webhooks for HubSpot and Salesforce CRM synchronization
- [ ] Automated recurring model retraining with data drift monitoring

---

### 🤝 Contributing

Contributions are welcome! Please fork this repository, create a descriptive feature branch (`git checkout -b feat/your-feature`), commit your changes, and open a Pull Request.

---

### 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.

---

### 📬 Contact

<div align="center">
  <a href="https://github.com/FLASH11025"><img src="https://img.shields.io/badge/GitHub-FLASH11025-181717?style=for-the-badge&logo=github" alt="GitHub" /></a>&nbsp;&nbsp;
  <a href="https://linkedin.com/in/YOUR_LINKEDIN"><img src="https://img.shields.io/badge/LinkedIn-Connect-0A66C2?style=for-the-badge&logo=linkedin" alt="LinkedIn" /></a>&nbsp;&nbsp;
  <a href="mailto:your.email@example.com"><img src="https://img.shields.io/badge/Email-Contact_Me-EA4335?style=for-the-badge&logo=gmail" alt="Email" /></a>
</div>

<br>

<div align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&height=100&section=footer" width="100%"/>
</div>
