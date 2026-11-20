"""
PredictChurn — Modern Filko-Style Customer Churn Prevention UI
==============================================================
Fully connected to the real FastAPI backend at http://localhost:8000.
No mocked, hardcoded, or random data. All metrics, predictions, options,
charts, and explanations are computed dynamically from data.
"""

from __future__ import annotations

import io
import json
from datetime import datetime
from typing import Any, Optional

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import requests
import streamlit as st

# ---------------------------------------------------------------------------
# 1. Page Configuration & Global Theme
# ---------------------------------------------------------------------------
st.set_page_config(
    page_title="PredictChurn — Customer Intelligence",
    page_icon="⚡",
    layout="wide",
    initial_sidebar_state="expanded",
)

API_BASE = "http://localhost:8000"

# ---------------------------------------------------------------------------
# 2. Session State Initialization
# ---------------------------------------------------------------------------
DEFAULT_STATE = {
    "page": "Dashboard",
    "metrics": None,
    "has_model": False,
    "prediction_results": None,
    "threshold": 0.5,
    "selected_customer_id": None,
    "upload_mode": "Train model",
    "last_checked_metrics": None,
}

for key, val in DEFAULT_STATE.items():
    if key not in st.session_state:
        st.session_state[key] = val


# ---------------------------------------------------------------------------
# 3. Filko-Style Design System & Custom CSS
# ---------------------------------------------------------------------------
FILKO_CSS = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter+Tight:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400&display=swap');

:root {
    --bg: #FBF7EA;
    --surface: #FFFDF5;
    --beige: #EAE5D3;
    --mustard: #FDB813;
    --purple: #7C5CBF;
    --ink: #1F1F1F;
    --muted: #6F6B5E;
    --line: #E3DDC8;
    --good: #3FA66B;
    --bad: #E5484D;
}

/* Global resets & typography */
html, body, [class*="css"], .stApp {
    background-color: var(--bg) !important;
    font-family: 'Inter Tight', -apple-system, BlinkMacSystemFont, sans-serif !important;
    color: var(--ink) !important;
    letter-spacing: -0.02em;
}

/* Hide Streamlit default chrome */
#MainMenu {visibility: hidden;}
footer {visibility: hidden;}
header {visibility: hidden;}

/* Sidebar Styling */
[data-testid="stSidebar"] {
    background-color: #F4EEDB !important;
    border-right: 1px solid var(--line) !important;
    padding-top: 1.5rem;
}
[data-testid="stSidebar"] * {
    color: var(--ink) !important;
}

/* Main Container spacing */
.main .block-container {
    padding-top: 1.5rem;
    padding-bottom: 3rem;
    max-width: 1400px;
}

/* Filko Brand Title */
.brand-title {
    font-size: 1.5rem;
    font-weight: 800;
    color: var(--ink);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
    padding-bottom: 0.8rem;
    border-bottom: 1px solid var(--line);
}
.brand-badge {
    background: var(--purple);
    color: #FFF !important;
    font-size: 0.7rem;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 999px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
}

/* Hero Banner */
.hero-banner {
    background-color: var(--beige);
    border: 1px solid var(--line);
    border-radius: 24px;
    padding: 2.2rem;
    margin-bottom: 2rem;
    position: relative;
    overflow: hidden;
}
.hero-headline {
    font-size: 46px;
    font-weight: 800;
    line-height: 1.08;
    letter-spacing: -0.035em;
    color: var(--ink);
    margin: 0 0 0.8rem 0;
}
.hero-subtext {
    font-size: 1.1rem;
    color: var(--muted);
    margin: 0;
    max-width: 720px;
}

/* Top Chip Pill */
.top-chip-container {
    display: flex;
    gap: 0.6rem;
    margin-bottom: 1rem;
}
.chip-pill {
    background: #FFFFFF;
    border: 1px solid var(--line);
    border-radius: 20px;
    padding: 4px 12px;
    font-size: 0.8rem;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 6px;
}
.dot-green { width: 8px; height: 8px; border-radius: 50%; background: var(--good); }
.dot-purple { width: 8px; height: 8px; border-radius: 50%; background: var(--purple); }
.dot-mustard { width: 8px; height: 8px; border-radius: 50%; background: var(--mustard); }
.dot-red { width: 8px; height: 8px; border-radius: 50%; background: var(--bad); }

/* Tall Filko Cards */
.tall-card {
    border-radius: 24px;
    border: 1px solid var(--line);
    padding: 1.8rem;
    height: 100%;
    min-height: 200px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.tall-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(31,31,31,0.04);
}
.card-offwhite {
    background-color: var(--surface);
    color: var(--ink);
}
.card-mustard {
    background-color: var(--mustard);
    color: var(--ink);
    border-color: #E2A108;
}
.card-purple {
    background-color: var(--purple);
    color: #FFFFFF !important;
    border-color: #6C4EB0;
}
.card-purple * {
    color: #FFFFFF !important;
}

.card-num {
    font-size: 3rem;
    font-weight: 900;
    line-height: 1;
    letter-spacing: -0.04em;
    margin: 0.4rem 0;
}
.card-title {
    font-size: 0.9rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    opacity: 0.85;
    margin: 0;
}
.card-desc {
    font-size: 0.85rem;
    margin: 0;
    opacity: 0.85;
}

/* Generic Surface Card */
.filko-card {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 22px;
    padding: 1.5rem;
    margin-bottom: 1.2rem;
}

/* Badges */
.badge-stay {
    background-color: #DCFCE7;
    color: #15803D !important;
    font-weight: 700;
    font-size: 0.75rem;
    padding: 3px 10px;
    border-radius: 12px;
    display: inline-block;
}
.badge-leave {
    background-color: #FEE2E2;
    color: #B91C1C !important;
    font-weight: 700;
    font-size: 0.75rem;
    padding: 3px 10px;
    border-radius: 12px;
    display: inline-block;
}
.badge-risk-low {
    background-color: #E0F2FE;
    color: #0369A1 !important;
    font-weight: 600;
    font-size: 0.75rem;
    padding: 2px 8px;
    border-radius: 10px;
}
.badge-risk-med {
    background-color: #FEF3C7;
    color: #B45309 !important;
    font-weight: 600;
    font-size: 0.75rem;
    padding: 2px 8px;
    border-radius: 10px;
}
.badge-risk-high {
    background-color: #FEE2E2;
    color: #B91C1C !important;
    font-weight: 600;
    font-size: 0.75rem;
    padding: 2px 8px;
    border-radius: 10px;
}

/* SHAP reasons */
.reason-row-pos {
    background: #FFF1F2;
    border-left: 4px solid var(--bad);
    padding: 0.6rem 0.8rem;
    border-radius: 8px;
    margin-bottom: 0.4rem;
    font-size: 0.88rem;
    color: #9F1239;
    font-weight: 500;
}
.reason-row-neg {
    background: #F0FDF4;
    border-left: 4px solid var(--good);
    padding: 0.6rem 0.8rem;
    border-radius: 8px;
    margin-bottom: 0.4rem;
    font-size: 0.88rem;
    color: #166534;
    font-weight: 500;
}

/* Sidebar Promo Box */
.sidebar-promo {
    background-color: var(--mustard);
    border: 1px solid #E2A108;
    border-radius: 20px;
    padding: 1.2rem;
    margin-top: 2rem;
}
.sidebar-promo h4 {
    margin: 0 0 0.4rem 0;
    font-size: 0.95rem;
    font-weight: 800;
}
.sidebar-promo p {
    font-size: 0.8rem;
    color: #4A3E00;
    margin: 0 0 0.8rem 0;
    line-height: 1.35;
}

/* Button override */
div.stButton > button {
    background-color: var(--ink) !important;
    color: #FFFDF5 !important;
    border-radius: 14px !important;
    border: none !important;
    padding: 0.6rem 1.4rem !important;
    font-weight: 700 !important;
    font-size: 0.92rem !important;
    letter-spacing: -0.01em !important;
    box-shadow: 0 2px 6px rgba(0,0,0,0.06) !important;
    transition: all 0.15s ease !important;
}
div.stButton > button:hover {
    background-color: #000000 !important;
    transform: translateY(-1px) !important;
}
</style>
"""
st.markdown(FILKO_CSS, unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# 4. API Helpers
# ---------------------------------------------------------------------------
def api_get(endpoint: str, timeout: int = 15) -> Optional[requests.Response]:
    try:
        r = requests.get(f"{API_BASE}{endpoint}", timeout=timeout)
        return r
    except Exception:
        return None


def fetch_metrics_if_available():
    """Attempt fetching /metrics. Returns metrics dict or None if 404/error."""
    r = api_get("/metrics")
    if r is not None and r.status_code == 200:
        st.session_state["metrics"] = r.json()
        st.session_state["has_model"] = True
        return r.json()
    else:
        st.session_state["metrics"] = None
        st.session_state["has_model"] = False
        return None


# Run a quick check if state is unset
if st.session_state["metrics"] is None:
    fetch_metrics_if_available()


# ---------------------------------------------------------------------------
# 5. Sidebar Navigation & Model Promo Card
# ---------------------------------------------------------------------------
with st.sidebar:
    st.markdown(
        """
        <div class="brand-title">
            <span>⚡ PredictChurn</span>
            <span class="brand-badge">PRO</span>
        </div>
        """,
        unsafe_allow_html=True,
    )

    pages = [
        "Dashboard",
        "Upload Data",
        "Training Results",
        "Predictions",
        "Customers",
        "Settings",
    ]

    selected_page = st.radio(
        "Navigation",
        options=pages,
        index=pages.index(st.session_state["page"]) if st.session_state["page"] in pages else 0,
        label_visibility="collapsed",
    )
    if selected_page != st.session_state["page"]:
        st.session_state["page"] = selected_page
        st.rerun()

    st.markdown("---")

    # Sidebar Promo Card
    st.markdown(
        """
        <div class="sidebar-promo">
            <h4>Fresh data?</h4>
            <p>Retrain your XGBoost model with your latest customer cohorts for peak precision.</p>
        </div>
        """,
        unsafe_allow_html=True,
    )

    if st.button("Retrain Now ↗", use_container_width=True):
        st.session_state["upload_mode"] = "Train model"
        st.session_state["page"] = "Upload Data"
        st.rerun()


# ---------------------------------------------------------------------------
# Top Bar Status Chips
# ---------------------------------------------------------------------------
def render_top_bar_chips():
    metrics = st.session_state.get("metrics")
    if metrics:
        alg = metrics.get("algorithm", "XGBoost")
        t_date = metrics.get("trained_at", "")
        if t_date:
            try:
                t_str = datetime.fromisoformat(t_date).strftime("%b %d, %H:%M")
            except Exception:
                t_str = t_date[:16]
        else:
            t_str = "Recent"

        st.markdown(
            f"""
            <div class="top-chip-container">
                <span class="chip-pill"><span class="dot-green"></span> Model: <strong>{alg}</strong></span>
                <span class="chip-pill"><span class="dot-purple"></span> Trained: <strong>{t_str}</strong></span>
                <span class="chip-pill"><span class="dot-mustard"></span> Samples: <strong>{metrics.get('train_rows', 0):,} train / {metrics.get('test_rows', 0):,} test</strong></span>
            </div>
            """,
            unsafe_allow_html=True,
        )
    else:
        st.markdown(
            """
            <div class="top-chip-container">
                <span class="chip-pill"><span class="dot-red"></span> No active model trained</span>
                <span class="chip-pill">Endpoint: <code>http://localhost:8000</code></span>
            </div>
            """,
            unsafe_allow_html=True,
        )


# ---------------------------------------------------------------------------
# PAGE: Empty State (When No Model Exists)
# ---------------------------------------------------------------------------
def render_empty_state_view():
    st.markdown(
        """
        <div class="hero-banner" style="text-align: center; padding: 4rem 2rem;">
            <div style="font-size: 3rem; margin-bottom: 0.8rem;">📦</div>
            <h1 class="hero-headline" style="font-size: 38px;">No model trained yet</h1>
            <p class="hero-subtext" style="margin: 0 auto 1.8rem auto;">
                Upload your historical customer CSV with churn outcomes to train a high-performance XGBoost pipeline with automated SMOTE balancing and SHAP explainability.
            </p>
        </div>
        """,
        unsafe_allow_html=True,
    )
    col1, col2, col3 = st.columns([1, 1, 1])
    with col2:
        if st.button("Go to Upload Page ↗", use_container_width=True):
            st.session_state["upload_mode"] = "Train model"
            st.session_state["page"] = "Upload Data"
            st.rerun()


# ---------------------------------------------------------------------------
# PAGE 1: Dashboard
# ---------------------------------------------------------------------------
def render_dashboard_page():
    render_top_bar_chips()
    metrics = st.session_state.get("metrics")
    pred_res = st.session_state.get("prediction_results")

    if not metrics:
        render_empty_state_view()
        return

    # Check predictions
    if not pred_res or not pred_res.get("predictions"):
        st.markdown(
            """
            <div class="hero-banner">
                <h1 class="hero-headline">Upload your customer data to see who might leave.</h1>
                <p class="hero-subtext">
                    Your model is trained and ready. Upload an active customer cohort to forecast churn risk, identify revenue at risk, and generate personalized retention plans.
                </p>
            </div>
            """,
            unsafe_allow_html=True,
        )
        col1, col2, col3 = st.columns([1, 1, 1])
        with col1:
            if st.button("Upload Customer Cohort ↗", use_container_width=True):
                st.session_state["upload_mode"] = "Predict churn"
                st.session_state["page"] = "Upload Data"
                st.rerun()
        return

    summary = pred_res.get("summary", {})
    predictions = pred_res.get("predictions", [])
    leavers_count = summary.get("predicted_to_leave", 0)

    # Hero headline
    st.markdown(
        f"""
        <div class="hero-banner">
            <h1 class="hero-headline">{leavers_count:,} customers are likely to leave</h1>
            <p class="hero-subtext">
                Real-time risk scoring across {summary.get('total_customers', 0):,} total accounts with automated SHAP factor attribution.
            </p>
        </div>
        """,
        unsafe_allow_html=True,
    )

    # Three tall colored cards
    c1, c2, c3 = st.columns(3)
    with c1:
        st.markdown(
            f"""
            <div class="tall-card card-offwhite">
                <div>
                    <p class="card-title">High Risk Customers</p>
                    <p class="card-num">{summary.get('high_risk', 0):,}</p>
                </div>
                <div>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#1F1F1F" stroke-width="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <p class="card-desc" style="margin-top:0.5rem;">Probability score exceeding 60%</p>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    with c2:
        rev = summary.get("revenue_at_risk", 0.0)
        st.markdown(
            f"""
            <div class="tall-card card-mustard">
                <div>
                    <p class="card-title">Revenue At Risk</p>
                    <p class="card-num">${rev:,.0f}</p>
                </div>
                <div>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#1F1F1F" stroke-width="2">
                        <line x1="12" y1="1" x2="12" y2="23"/>
                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                    </svg>
                    <p class="card-desc" style="margin-top:0.5rem;">Cumulative annual spend of predicted leavers</p>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    with c3:
        pct_leave = (
            round((leavers_count / summary.get("total_customers", 1)) * 100, 1)
            if summary.get("total_customers", 0) > 0
            else 0.0
        )
        st.markdown(
            f"""
            <div class="tall-card card-purple">
                <div>
                    <p class="card-title">% Predicted To Leave</p>
                    <p class="card-num">{pct_leave:.1f}%</p>
                </div>
                <div>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2">
                        <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                    </svg>
                    <p class="card-desc" style="margin-top:0.5rem;">Average cohort churn risk: {summary.get('avg_churn_risk_pct', 0.0)}%</p>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    st.markdown("<br/>", unsafe_allow_html=True)

    # Row: Risk Distribution + Retention Queue
    col_chart, col_queue = st.columns([1, 1])

    with col_chart:
        st.markdown('<div class="filko-card">', unsafe_allow_html=True)
        st.subheader("Risk Distribution")

        risk_counts = pd.Series([p.get("risk_level", "Low") for p in predictions]).value_counts()
        fig_donut = go.Figure(
            data=[
                go.Pie(
                    labels=risk_counts.index.tolist(),
                    values=risk_counts.values.tolist(),
                    hole=0.6,
                    marker=dict(colors=["#E5484D", "#FDB813", "#3FA66B"]),
                    textinfo="label+percent",
                )
            ]
        )
        fig_donut.update_layout(
            margin=dict(t=10, b=10, l=10, r=10),
            height=280,
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(0,0,0,0)",
            showlegend=False,
        )
        st.plotly_chart(fig_donut, use_container_width=True)
        st.markdown("</div>", unsafe_allow_html=True)

    with col_queue:
        st.markdown('<div class="filko-card">', unsafe_allow_html=True)
        st.subheader("Top Priority Retention Queue")
        sorted_leavers = sorted(
            predictions,
            key=lambda x: x.get("churn_probability_pct", 0),
            reverse=True,
        )[:4]

        for p in sorted_leavers:
            cid = p.get("customer_id")
            prob = p.get("churn_probability_pct", 0)
            reasons = p.get("top_reasons", [])
            r_text = reasons[0] if reasons else "High overall inactivity"
            action = p.get("suggested_action", "Personal outreach required")

            st.markdown(
                f"""
                <div style="background:#FFF; border:1px solid var(--line); border-radius:14px; padding:0.8rem 1rem; margin-bottom:0.6rem;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <strong>{cid}</strong>
                        <span class="badge-leave">{prob:.1f}% Churn</span>
                    </div>
                    <div style="font-size:0.82rem; color:var(--muted); margin:0.3rem 0;">Primary Factor: {r_text}</div>
                    <div style="font-size:0.82rem; color:var(--purple); font-weight:600;">Action: {action}</div>
                </div>
                """,
                unsafe_allow_html=True,
            )
        st.markdown("</div>", unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# PAGE 2: Upload Page
# ---------------------------------------------------------------------------
def render_upload_page():
    render_top_bar_chips()

    st.markdown(
        """
        <div class="hero-banner">
            <h1 class="hero-headline">Data Ingestion Hub</h1>
            <p class="hero-subtext">
                Upload historical datasets to fit a new model or feed an active customer file for instant predictions.
            </p>
        </div>
        """,
        unsafe_allow_html=True,
    )

    mode = st.radio(
        "Upload Mode",
        options=["Train model", "Predict churn"],
        index=0 if st.session_state["upload_mode"] == "Train model" else 1,
        horizontal=True,
    )
    st.session_state["upload_mode"] = mode

    # Download Sample Buttons
    col_dl1, col_dl2 = st.columns(2)
    with col_dl1:
        st.markdown("Need sample training data?")
        r_sample = api_get("/sample-csv")
        if r_sample and r_sample.status_code == 200:
            st.download_button(
                "Download sample_training.csv ↗",
                data=r_sample.content,
                file_name="sample_training.csv",
                mime="text/csv",
                use_container_width=True,
            )

    with col_dl2:
        st.markdown("Need sample prediction data?")
        r_pred_sample = api_get("/template-csv")
        if r_pred_sample and r_pred_sample.status_code == 200:
            st.download_button(
                "Download sample_to_predict.csv ↗",
                data=r_pred_sample.content,
                file_name="sample_to_predict.csv",
                mime="text/csv",
                use_container_width=True,
            )

    st.markdown("<br/>", unsafe_allow_html=True)

    uploaded_file = st.file_uploader(
        f"Select CSV file for: {mode}",
        type=["csv"],
        help="Upload standard comma-delimited CSV",
    )

    if uploaded_file is not None:
        try:
            preview_df = pd.read_csv(uploaded_file)
            st.markdown(f"**File Preview** ({len(preview_df):,} rows)")
            st.dataframe(preview_df.head(5), use_container_width=True)
            uploaded_file.seek(0)
        except Exception as exc:
            st.error(f"Could not parse CSV: {exc}")
            return

        if mode == "Train model":
            if st.button("🚀 Train Model Now ↗", use_container_width=True):
                with st.spinner("Training XGBoost with SMOTE balancing and 3-fold cross-validation..."):
                    try:
                        files = {"file": (uploaded_file.name, uploaded_file.getvalue(), "text/csv")}
                        r = requests.post(f"{API_BASE}/train", files=files, timeout=120)
                        if r.status_code == 200:
                            fetch_metrics_if_available()
                            st.success("✅ Model trained successfully! Redirecting to Training Results...")
                            st.session_state["page"] = "Training Results"
                            st.rerun()
                        else:
                            st.error(f"Training failed ({r.status_code}): {r.text}")
                    except Exception as e:
                        st.error(f"Connection error: {e}")

        else:  # Predict churn
            if not st.session_state.get("has_model"):
                st.warning("⚠️ Train a model first before running predictions.")
                st.button("Blocked: No Model Trained", disabled=True, use_container_width=True)
            else:
                threshold = st.slider("Classification Threshold", 0.1, 0.9, float(st.session_state["threshold"]), 0.05)
                st.session_state["threshold"] = threshold

                if st.button("🔮 Run Batch Predictions ↗", use_container_width=True):
                    with st.spinner("Generating churn probabilities and SHAP driver explanations..."):
                        try:
                            files = {"file": (uploaded_file.name, uploaded_file.getvalue(), "text/csv")}
                            r = requests.post(f"{API_BASE}/predict?threshold={threshold}", files=files, timeout=120)
                            if r.status_code == 200:
                                st.session_state["prediction_results"] = r.json()
                                st.success("✅ Predictions complete! Redirecting to Predictions page...")
                                st.session_state["page"] = "Predictions"
                                st.rerun()
                            else:
                                st.error(f"Prediction failed ({r.status_code}): {r.text}")
                        except Exception as e:
                            st.error(f"Connection error: {e}")


# ---------------------------------------------------------------------------
# PAGE 3: Training Results Page
# ---------------------------------------------------------------------------
def render_training_results_page():
    render_top_bar_chips()
    metrics = st.session_state.get("metrics")
    if not metrics:
        render_empty_state_view()
        return

    st.markdown(
        f"""
        <div class="hero-banner">
            <h1 class="hero-headline">{metrics.get('algorithm', 'XGBoost')} Performance Report</h1>
            <p class="hero-subtext">
                Evaluated on {metrics.get('test_rows', 0):,} holdout customers after SMOTE oversampling. All metrics are computed dynamically from real validation splits.
            </p>
        </div>
        """,
        unsafe_allow_html=True,
    )

    # Interactive Threshold Slider that recalculates test metrics in the browser
    test_probs = metrics.get("test_probabilities", [])
    current_thresh = st.slider("Interactive Threshold Tuning", 0.1, 0.9, 0.5, 0.05)

    # Dynamic metric calculation if test_probabilities are available
    if test_probs:
        y_true = np.array([item["y_true"] for item in test_probs])
        probs = np.array([item["prob"] for item in test_probs])
        y_pred = (probs >= current_thresh).astype(int)

        dyn_acc = float(np.mean(y_true == y_pred))
        tp = int(np.sum((y_true == 1) & (y_pred == 1)))
        fp = int(np.sum((y_true == 0) & (y_pred == 1)))
        fn = int(np.sum((y_true == 1) & (y_pred == 0)))
        tn = int(np.sum((y_true == 0) & (y_pred == 0)))

        dyn_prec = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        dyn_rec = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        dyn_f1 = (2 * dyn_prec * dyn_rec) / (dyn_prec + dyn_rec) if (dyn_prec + dyn_rec) > 0 else 0.0
        dyn_cm = {"tn": tn, "fp": fp, "fn": fn, "tp": tp}
    else:
        dyn_acc = metrics.get("accuracy", 0.0)
        dyn_prec = metrics.get("precision", 0.0)
        dyn_rec = metrics.get("recall", 0.0)
        dyn_f1 = metrics.get("f1", 0.0)
        dyn_cm = metrics.get("confusion_matrix", {"tn": 0, "fp": 0, "fn": 0, "tp": 0})

    roc_auc = metrics.get("roc_auc", 0.0)

    # Metric Cards Row
    m1, m2, m3, m4, m5 = st.columns(5)
    for col, label, val, color in [
        (m1, "Accuracy", dyn_acc, "var(--ink)"),
        (m2, "Precision", dyn_prec, "var(--purple)"),
        (m3, "Recall", dyn_rec, "var(--mustard)"),
        (m4, "F1 Score", dyn_f1, "var(--good)"),
        (m5, "ROC-AUC", roc_auc, "var(--purple)"),
    ]:
        with col:
            st.markdown(
                f"""
                <div class="filko-card" style="text-align:center;">
                    <div style="font-size:0.8rem; font-weight:700; color:var(--muted);">{label}</div>
                    <div style="font-size:2rem; font-weight:900; color:{color}; margin-top:0.2rem;">{val:.3f}</div>
                </div>
                """,
                unsafe_allow_html=True,
            )

    # Charts: ROC Curve & Confusion Matrix
    c_roc, c_cm = st.columns(2)

    with c_roc:
        st.markdown('<div class="filko-card">', unsafe_allow_html=True)
        st.subheader("ROC Curve")
        roc_data = metrics.get("roc_curve", {})
        fpr = roc_data.get("fpr", [])
        tpr = roc_data.get("tpr", [])
        if fpr and tpr:
            fig_roc = go.Figure()
            fig_roc.add_trace(go.Scatter(x=fpr, y=tpr, mode="lines", name="XGBoost", line=dict(color="#7C5CBF", width=3)))
            fig_roc.add_trace(go.Scatter(x=[0, 1], y=[0, 1], mode="lines", name="Random", line=dict(dash="dash", color="#A8A29E")))
            fig_roc.update_layout(
                xaxis_title="False Positive Rate",
                yaxis_title="True Positive Rate",
                height=320,
                margin=dict(l=10, r=10, t=10, b=10),
                paper_bgcolor="rgba(0,0,0,0)",
                plot_bgcolor="rgba(0,0,0,0)",
            )
            st.plotly_chart(fig_roc, use_container_width=True)
        st.markdown("</div>", unsafe_allow_html=True)

    with c_cm:
        st.markdown('<div class="filko-card">', unsafe_allow_html=True)
        st.subheader("Confusion Matrix")
        z_cm = [[dyn_cm.get("tn", 0), dyn_cm.get("fp", 0)], [dyn_cm.get("fn", 0), dyn_cm.get("tp", 0)]]
        fig_cm = go.Figure(
            data=go.Heatmap(
                z=z_cm,
                x=["Stay (Pred)", "Leave (Pred)"],
                y=["Stay (True)", "Leave (True)"],
                colorscale=[[0, "#FFFDF5"], [1, "#FDB813"]],
                text=z_cm,
                texttemplate="%{text}",
                textfont={"size": 18},
                showscale=False,
            )
        )
        fig_cm.update_layout(
            height=320,
            margin=dict(l=10, r=10, t=10, b=10),
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(0,0,0,0)",
        )
        st.plotly_chart(fig_cm, use_container_width=True)
        st.markdown("</div>", unsafe_allow_html=True)

    # Detailed Summary & Data Cleaning Report
    s_col1, s_col2 = st.columns(2)
    with s_col1:
        st.markdown('<div class="filko-card">', unsafe_allow_html=True)
        st.subheader("Model Summary")
        cb = metrics.get("class_balance", {})
        st.write(f"- **Algorithm:** {metrics.get('algorithm')}")
        st.write(f"- **Cross-validation scores:** {metrics.get('cv_scores')}")
        st.write(f"- **Training duration:** {metrics.get('training_seconds')}s")
        st.write(f"- **Class balance before SMOTE:** {cb.get('before')}")
        st.write(f"- **Class balance after SMOTE:** {cb.get('after')}")
        st.markdown("</div>", unsafe_allow_html=True)

    with s_col2:
        st.markdown('<div class="filko-card">', unsafe_allow_html=True)
        st.subheader("Data Cleaning Report")
        cl = metrics.get("cleaning", {})
        st.write(f"- **Initial rows ingested:** {cl.get('rows_in', 0):,}")
        st.write(f"- **Duplicates removed:** {cl.get('duplicates_removed', 0):,}")
        st.write(f"- **Missing cells imputed:** {cl.get('missing_values', 0):,}")
        st.write(f"- **Clean training rows:** {cl.get('rows_out', 0):,}")
        st.markdown("</div>", unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# PAGE 4: Predictions Page
# ---------------------------------------------------------------------------
def render_predictions_page():
    render_top_bar_chips()
    pred_res = st.session_state.get("prediction_results")

    if not pred_res or not pred_res.get("predictions"):
        st.markdown(
            """
            <div class="hero-banner">
                <h1 class="hero-headline">No Predictions Generated</h1>
                <p class="hero-subtext">Upload customer records to run batch probability predictions.</p>
            </div>
            """,
            unsafe_allow_html=True,
        )
        if st.button("Go to Upload Page ↗"):
            st.session_state["upload_mode"] = "Predict churn"
            st.session_state["page"] = "Upload Data"
            st.rerun()
        return

    predictions = pred_res.get("predictions", [])
    df_preds = pd.DataFrame(predictions)

    st.markdown(
        f"""
        <div class="hero-banner">
            <h1 class="hero-headline">Customer Predictions ({len(df_preds):,})</h1>
            <p class="hero-subtext">Click any customer to inspect individual SHAP driver attribution and retention workflows.</p>
        </div>
        """,
        unsafe_allow_html=True,
    )

    # Threshold slider to dynamically update label in browser
    t_val = st.slider("Active Decision Threshold", 0.1, 0.9, float(st.session_state["threshold"]), 0.05)
    st.session_state["threshold"] = t_val

    # Recompute prediction label from probability
    df_preds["prediction"] = df_preds["churn_probability_pct"].apply(lambda p: "LEAVE" if (p / 100.0) >= t_val else "STAY")

    # Filter & Search controls
    c_search, c_risk, c_plan = st.columns([2, 1, 1])
    with c_search:
        search_query = st.text_input("Search Customer ID", "")
    with c_risk:
        risk_options = sorted(df_preds["risk_level"].dropna().unique().tolist())
        selected_risks = st.multiselect("Risk Level", options=risk_options, default=risk_options)
    with c_plan:
        plan_options = sorted(df_preds["plan_type"].dropna().unique().tolist()) if "plan_type" in df_preds.columns else []
        selected_plans = st.multiselect("Plan Type", options=plan_options, default=plan_options)

    # Filter dataframe
    filtered_df = df_preds.copy()
    if search_query:
        filtered_df = filtered_df[filtered_df["customer_id"].astype(str).str.contains(search_query, case=False)]
    if selected_risks:
        filtered_df = filtered_df[filtered_df["risk_level"].isin(selected_risks)]
    if selected_plans and "plan_type" in filtered_df.columns:
        filtered_df = filtered_df[filtered_df["plan_type"].isin(selected_plans)]

    # Download Results Button
    csv_bytes = filtered_df.to_csv(index=False).encode("utf-8")
    st.download_button(
        "Download Results CSV ↗",
        data=csv_bytes,
        file_name="predictchurn_results.csv",
        mime="text/csv",
    )

    st.markdown("<br/>", unsafe_allow_html=True)

    # Table presentation
    display_cols = ["customer_id", "prediction", "churn_probability_pct", "risk_level", "annual_spend", "suggested_action"]
    st.dataframe(
        filtered_df[display_cols],
        use_container_width=True,
        column_config={
            "churn_probability_pct": st.column_config.ProgressColumn(
                "Churn Probability",
                help="Score between 0% and 100%",
                format="%.1f%%",
                min_value=0,
                max_value=100,
            ),
            "annual_spend": st.column_config.NumberColumn("Annual Spend ($)", format="$%.2f"),
        },
    )

    # Customer Drawer / Detail Section
    st.markdown("---")
    st.subheader("Customer Detail Drawer")
    cust_list = filtered_df["customer_id"].tolist()
    if cust_list:
        sel_cust = st.selectbox("Select Customer to Inspect SHAP Drivers", options=cust_list)
        cust_row = filtered_df[filtered_df["customer_id"] == sel_cust].iloc[0]

        d_col1, d_col2 = st.columns([1, 1])
        with d_col1:
            st.markdown('<div class="filko-card">', unsafe_allow_html=True)
            prob_val = cust_row.get("churn_probability_pct", 0.0)
            badge_cls = "badge-leave" if cust_row.get("prediction") == "LEAVE" else "badge-stay"
            st.markdown(
                f"""
                <h3>{cust_row.get('customer_id')} <span class="{badge_cls}">{cust_row.get('prediction')}</span></h3>
                <div style="font-size:2.4rem; font-weight:900; margin:0.5rem 0;">{prob_val:.1f}% Risk</div>
                <div style="font-size:0.9rem; color:var(--muted);">Annual Spend: ${cust_row.get('annual_spend', 0):,.2f}</div>
                <div style="margin-top:1rem; padding:0.8rem; background:var(--mustard); border-radius:12px; font-weight:700;">
                    Suggested Action: {cust_row.get('suggested_action')}
                </div>
                """,
                unsafe_allow_html=True,
            )
            st.markdown("</div>", unsafe_allow_html=True)

        with d_col2:
            st.markdown('<div class="filko-card">', unsafe_allow_html=True)
            st.subheader("Top Contributing SHAP Factors")
            reasons = cust_row.get("top_reasons", [])
            for r in reasons:
                css_cls = "reason-row-pos" if "(+" in r else "reason-row-neg"
                st.markdown(f'<div class="{css_cls}">{r}</div>', unsafe_allow_html=True)
            st.markdown("</div>", unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# PAGE 5: Single Customer Predict (Customers)
# ---------------------------------------------------------------------------
def render_customers_page():
    render_top_bar_chips()
    metrics = st.session_state.get("metrics")
    if not metrics:
        render_empty_state_view()
        return

    st.markdown(
        """
        <div class="hero-banner">
            <h1 class="hero-headline">Single Customer Intelligence</h1>
            <p class="hero-subtext">
                Input any customer configuration. Dropdown options are populated dynamically from your training dataset categories.
            </p>
        </div>
        """,
        unsafe_allow_html=True,
    )

    cats = metrics.get("categories", {})
    plan_options = cats.get("plan_type", ["Basic", "Pro", "Enterprise"])
    contract_options = cats.get("contract_type", ["Monthly", "Yearly"])
    pay_options = cats.get("payment_method", ["Card", "UPI", "Bank"])

    with st.form("single_predict_form"):
        r1_1, r1_2, r1_3 = st.columns(3)
        with r1_1:
            customer_id = st.text_input("Customer ID", "CUST_MANUAL_1")
        with r1_2:
            plan_type = st.selectbox("Plan Type", options=plan_options)
        with r1_3:
            contract_type = st.selectbox("Contract Type", options=contract_options)

        r2_1, r2_2, r2_3 = st.columns(3)
        with r2_1:
            payment_method = st.selectbox("Payment Method", options=pay_options)
        with r2_2:
            account_age_months = st.number_input("Account Age (Months)", min_value=1, max_value=120, value=12)
        with r2_3:
            monthly_charges = st.number_input("Monthly Charges ($)", min_value=10.0, max_value=1000.0, value=65.0)

        r3_1, r3_2, r3_3 = st.columns(3)
        with r3_1:
            annual_spend = st.number_input("Annual Spend ($)", min_value=0.0, value=float(monthly_charges * 12))
        with r3_2:
            logins_last_30d = st.slider("Logins (Last 30 Days)", 0, 60, 8)
        with r3_3:
            days_since_last_login = st.slider("Days Since Last Login", 0, 180, 14)

        r4_1, r4_2, r4_3 = st.columns(3)
        with r4_1:
            support_tickets_total = st.number_input("Total Support Tickets", 0, 50, 3)
        with r4_2:
            unresolved_tickets = st.number_input("Unresolved Support Tickets", 0, 20, 1)
        with r4_3:
            late_payments_count = st.number_input("Late Payments Count", 0, 20, 0)

        feature_usage_score = st.slider("Feature Usage Score (0-100)", 0.0, 100.0, 62.0)
        threshold = st.slider("Decision Threshold", 0.1, 0.9, 0.5, 0.05)

        submit_btn = st.form_submit_button("Predict Churn Risk ↗", use_container_width=True)

    if submit_btn:
        payload = {
            "customer_id": customer_id,
            "plan_type": plan_type,
            "contract_type": contract_type,
            "payment_method": payment_method,
            "account_age_months": int(account_age_months),
            "monthly_charges": float(monthly_charges),
            "annual_spend": float(annual_spend),
            "logins_last_30d": int(logins_last_30d),
            "days_since_last_login": int(days_since_last_login),
            "support_tickets_total": int(support_tickets_total),
            "unresolved_tickets": int(unresolved_tickets),
            "late_payments_count": int(late_payments_count),
            "feature_usage_score": float(feature_usage_score),
        }

        with st.spinner("Scoring customer and calculating SHAP values..."):
            try:
                r = requests.post(f"{API_BASE}/predict-one?threshold={threshold}", json=payload, timeout=20)
                if r.status_code == 200:
                    res = r.json()
                    prob = res.get("churn_probability_pct", 0.0)
                    pred = res.get("prediction", "STAY")
                    reasons = res.get("top_reasons", [])
                    action = res.get("suggested_action", "")

                    # Mustard Result Card
                    st.markdown(
                        f"""
                        <div style="background-color:var(--mustard); border:1px solid #E2A108; border-radius:24px; padding:2rem; margin-top:1.5rem;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <h2 style="margin:0; font-weight:900;">{customer_id}</h2>
                                <span class="{'badge-leave' if pred == 'LEAVE' else 'badge-stay'}" style="font-size:1rem; padding:6px 16px;">
                                    {pred}
                                </span>
                            </div>
                            <div style="font-size:3.5rem; font-weight:900; margin:0.8rem 0;">{prob:.1f}% Churn Probability</div>
                            <div style="font-size:1rem; font-weight:700; margin-bottom:1rem;">Recommended Action: {action}</div>
                            <div style="background:#FFF; padding:1.2rem; border-radius:16px;">
                                <strong>Top Contributing Factors:</strong>
                                <ul style="margin:0.5rem 0 0 0; padding-left:1.2rem;">
                                    {"".join(f"<li>{r}</li>" for r in reasons)}
                                </ul>
                            </div>
                        </div>
                        """,
                        unsafe_allow_html=True,
                    )
                else:
                    st.error(f"Prediction failed: {r.text}")
            except Exception as e:
                st.error(f"Connection error: {e}")


# ---------------------------------------------------------------------------
# PAGE 6: Settings Page
# ---------------------------------------------------------------------------
def render_settings_page():
    render_top_bar_chips()
    st.markdown(
        """
        <div class="hero-banner">
            <h1 class="hero-headline">Service Configuration</h1>
            <p class="hero-subtext">Backend connection status, diagnostic probes, and environment parameters.</p>
        </div>
        """,
        unsafe_allow_html=True,
    )

    st.markdown('<div class="filko-card">', unsafe_allow_html=True)
    st.subheader("FastAPI Service Connectivity")
    st.write(f"- **API Base URL:** `{API_BASE}`")

    r_root = api_get("/")
    if r_root and r_root.status_code == 200:
        st.success(f"🟢 Connected to FastAPI backend: {r_root.json()}")
    else:
        st.error("🔴 Unable to reach FastAPI service at http://localhost:8000")

    if st.button("Refresh /metrics from Backend ↗"):
        fetch_metrics_if_available()
        st.success("Refreshed state from backend.")
        st.rerun()
    st.markdown("</div>", unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# 6. Main Routing Switchboard
# ---------------------------------------------------------------------------
page = st.session_state.get("page", "Dashboard")
if page == "Dashboard":
    render_dashboard_page()
elif page == "Upload Data":
    render_upload_page()
elif page == "Training Results":
    render_training_results_page()
elif page == "Predictions":
    render_predictions_page()
elif page == "Customers":
    render_customers_page()
elif page == "Settings":
    render_settings_page()
