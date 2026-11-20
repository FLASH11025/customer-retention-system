"""
PredictiChurn – Streamlit Frontend
====================================
Interactive dashboard for real-time churn prediction.
Run:  streamlit run frontend/app.py
"""

from __future__ import annotations

import requests
import streamlit as st

# ─── Page config ──────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="PredictiChurn",
    page_icon="📉",
    layout="wide",
    initial_sidebar_state="expanded",
)

API_URL = "http://localhost:8000/predict"

# ─── Custom CSS ───────────────────────────────────────────────────────────────
st.markdown(
    """
    <style>
    /* ── sidebar ── */
    [data-testid="stSidebar"] { background: #0f172a; }
    [data-testid="stSidebar"] * { color: #e2e8f0 !important; }

    /* ── main area card ── */
    .metric-card {
        border-radius: 16px;
        padding: 2rem;
        text-align: center;
        font-size: 3rem;
        font-weight: 800;
        letter-spacing: -1px;
    }
    .high   { background: #fef2f2; color: #dc2626; border: 2px solid #fca5a5; }
    .medium { background: #fffbeb; color: #d97706; border: 2px solid #fcd34d; }
    .low    { background: #f0fdf4; color: #16a34a; border: 2px solid #86efac; }

    /* ── factor badge ── */
    .factor-badge {
        background: #1e293b;
        color: #f1f5f9;
        border-radius: 10px;
        padding: 0.6rem 1rem;
        margin-bottom: 0.5rem;
        font-size: 0.92rem;
    }
    .increases { border-left: 4px solid #ef4444; }
    .decreases { border-left: 4px solid #22c55e; }

    /* ── header ── */
    h1 { font-size: 2.4rem !important; font-weight: 800 !important; }
    </style>
    """,
    unsafe_allow_html=True,
)

# ─── Header ───────────────────────────────────────────────────────────────────
st.title("📉 PredictiChurn")
st.caption("SaaS / Telecom Customer Churn Prediction  •  Powered by XGBoost + SHAP")
st.divider()

# ─── Sidebar – Input Form ─────────────────────────────────────────────────────
with st.sidebar:
    st.header("🔧 Customer Profile")

    # ── Numeric sliders ────────────────────────────────────────────────────────
    st.subheader("📊 Account Details")
    tenure = st.slider("Tenure (months)", min_value=0, max_value=72, value=12, step=1)
    monthly_charges = st.slider(
        "Monthly Charges ($)", min_value=0.0, max_value=120.0, value=70.0, step=0.5
    )
    total_charges = st.number_input(
        "Total Charges ($)",
        min_value=0.0,
        max_value=10000.0,
        value=float(tenure * monthly_charges),
        step=1.0,
        help="Auto-computed from tenure × monthly or enter manually.",
    )

    # ── Demographics ───────────────────────────────────────────────────────────
    st.subheader("👤 Demographics")
    gender = st.selectbox("Gender", ["Male", "Female"])
    senior_citizen = st.selectbox("Senior Citizen", [0, 1], format_func=lambda x: "Yes" if x else "No")
    partner = st.selectbox("Has Partner?", ["Yes", "No"])
    dependents = st.selectbox("Has Dependents?", ["Yes", "No"])

    # ── Services ───────────────────────────────────────────────────────────────
    st.subheader("📶 Services")
    phone_service = st.selectbox("Phone Service", ["Yes", "No"])
    multiple_lines = st.selectbox(
        "Multiple Lines", ["No", "Yes", "No phone service"]
    )
    internet_service = st.selectbox(
        "Internet Service", ["DSL", "Fiber optic", "No"]
    )

    online_security = st.selectbox(
        "Online Security", ["No", "Yes", "No internet service"]
    )
    online_backup = st.selectbox(
        "Online Backup", ["No", "Yes", "No internet service"]
    )
    device_protection = st.selectbox(
        "Device Protection", ["No", "Yes", "No internet service"]
    )
    tech_support = st.selectbox(
        "Tech Support", ["No", "Yes", "No internet service"]
    )
    streaming_tv = st.selectbox(
        "Streaming TV", ["No", "Yes", "No internet service"]
    )
    streaming_movies = st.selectbox(
        "Streaming Movies", ["No", "Yes", "No internet service"]
    )

    # ── Billing ────────────────────────────────────────────────────────────────
    st.subheader("💳 Billing")
    contract = st.selectbox(
        "Contract Type",
        ["Month-to-month", "One year", "Two year"],
    )
    paperless_billing = st.selectbox("Paperless Billing", ["Yes", "No"])
    payment_method = st.selectbox(
        "Payment Method",
        [
            "Electronic check",
            "Mailed check",
            "Bank transfer (automatic)",
            "Credit card (automatic)",
        ],
    )

    st.divider()
    predict_btn = st.button(
        "🔮 Predict Churn Risk",
        type="primary",
        use_container_width=True,
    )

# ─── Main Content ─────────────────────────────────────────────────────────────
col_result, col_factors = st.columns([1, 1], gap="large")

if predict_btn:
    payload = {
        "tenure": tenure,
        "MonthlyCharges": monthly_charges,
        "TotalCharges": total_charges,
        "SeniorCitizen": senior_citizen,
        "gender": gender,
        "Partner": partner,
        "Dependents": dependents,
        "PhoneService": phone_service,
        "PaperlessBilling": paperless_billing,
        "MultipleLines": multiple_lines,
        "InternetService": internet_service,
        "OnlineSecurity": online_security,
        "OnlineBackup": online_backup,
        "DeviceProtection": device_protection,
        "TechSupport": tech_support,
        "StreamingTV": streaming_tv,
        "StreamingMovies": streaming_movies,
        "Contract": contract,
        "PaymentMethod": payment_method,
    }

    with st.spinner("🤖 Analysing customer…"):
        try:
            resp = requests.post(API_URL, json=payload, timeout=30)
            resp.raise_for_status()
            data = resp.json()
        except requests.exceptions.ConnectionError:
            st.error(
                "❌ Cannot reach the API. "
                "Make sure the FastAPI server is running:  "
                "`uvicorn backend.main:app --reload`"
            )
            st.stop()
        except requests.exceptions.HTTPError as exc:
            st.error(f"❌ API error {exc.response.status_code}: {exc.response.text}")
            st.stop()

    prob_pct = round(data["churn_probability"] * 100, 1)
    risk = data["risk_label"].lower()          # high / medium / low
    factors = data["top_factors"]

    # ── Result card ──────────────────────────────────────────────────────────
    with col_result:
        st.subheader("🎯 Churn Risk Score")
        risk_emoji = {"high": "🔴", "medium": "🟡", "low": "🟢"}.get(risk, "⚪")
        st.markdown(
            f'<div class="metric-card {risk}">'
            f'{risk_emoji} {prob_pct}%'
            f"</div>",
            unsafe_allow_html=True,
        )
        st.markdown(
            f"**Risk Level:** {risk.upper()} &nbsp;|&nbsp; "
            f"**Prediction:** {'Will Churn ⚠️' if data['churn_prediction'] else 'Will Stay ✅'}"
        )

        # Probability gauge (simple progress bar)
        st.progress(
            data["churn_probability"],
            text=f"Churn probability: {prob_pct}%",
        )

    # ── SHAP factors ─────────────────────────────────────────────────────────
    with col_factors:
        st.subheader("🔍 Top 3 Driving Factors")
        st.caption("Based on SHAP values for this specific customer")

        for i, factor in enumerate(factors, start=1):
            direction_css = factor["direction"]   # "increases" | "decreases"
            icon = "⬆️" if direction_css == "increases" else "⬇️"
            impact_pct = round(abs(factor["impact"]) * 100, 1)

            st.markdown(
                f'<div class="factor-badge {direction_css}">'
                f"<strong>#{i} {icon} {factor['feature']}</strong><br>"
                f"{factor['description']}"
                f"</div>",
                unsafe_allow_html=True,
            )

    # ── Raw JSON (collapsible) ────────────────────────────────────────────────
    with st.expander("🗂️ Full API Response (JSON)"):
        st.json(data)

else:
    # ── Placeholder when no prediction yet ───────────────────────────────────
    with col_result:
        st.info(
            "👈 Fill in the customer profile in the sidebar "
            "and click **Predict Churn Risk** to see results."
        )
        st.markdown(
            """
            #### How it works
            1. **XGBoost** model predicts churn probability from 19 customer features.
            2. **SHAP TreeExplainer** identifies the exact features driving that score.
            3. The **FastAPI** backend serves both in real time.
            4. This **Streamlit** dashboard visualises everything.
            """
        )

    with col_factors:
        st.markdown("### 📈 Feature Importance (global)")
        st.caption(
            "The most predictive features across all customers are:\n"
            "- Contract type (Month-to-month vs annual)\n"
            "- Tenure (how long they've been a customer)\n"
            "- Monthly Charges\n"
            "- Internet Service (Fiber optic)\n"
            "- Online Security / Tech Support\n"
        )
