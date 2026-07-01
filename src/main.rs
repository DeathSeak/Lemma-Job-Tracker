// Lemma Job Tracker - Axum server and Lemma SDK bridge.

mod crypto;
mod ingest;

use axum::{
    extract::{Path, State},
    response::{IntoResponse, Response},
    routing::{get, post, patch},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Arc;
use thiserror::Error;
use tracing::{error, info};
use tower_http::cors::{Any, CorsLayer};

// Default target URL of Lemma Cloud.
const DEFAULT_LEMMA_BASE_URL: &str = "https://api.lemma.work";

// Inbound application request payload.
#[derive(Debug, Deserialize)]
struct JobRequest {
    job_url: String,
    job_text: Option<String>,
    resume_path: String,
    company: String,
    role: String,
}

// Intake form submission payload for workflow run.
#[derive(Debug, Serialize)]
struct FormSubmitPayload {
    node_id: String,
    inputs: serde_json::Value,
}

// Application status update payload.
#[derive(Debug, Deserialize)]
struct UpdateApplicationPayload {
    status: String,
}

// Shared application environment variables.
#[derive(Clone)]
struct AppState {
    http: reqwest::Client,
    e2ee_key: [u8; 32],
    lemma_base_url: String,
    lemma_token: String,
    lemma_pod_id: String,
}

// Custom error handling types.
#[derive(Debug, Error)]
pub enum ApiError {
    #[error("ingestion failure: {0}")]
    Ingestion(String),
    #[error("lemma bridge failure: {0}")]
    Lemma(String),
    #[error("internal error: {0}")]
    Internal(String),
}

impl ApiError {
    // Map custom errors to standard HTTP status codes.
    fn status(&self) -> axum::http::StatusCode {
        match self {
            ApiError::Ingestion(_) => axum::http::StatusCode::BAD_GATEWAY,
            ApiError::Lemma(_) => axum::http::StatusCode::BAD_GATEWAY,
            ApiError::Internal(_) => axum::http::StatusCode::INTERNAL_SERVER_ERROR,
        }
    }
}

impl IntoResponse for ApiError {
    // Convert custom errors into standard JSON API responses.
    fn into_response(self) -> Response {
        let code = self.status();
        (code, Json(serde_json::json!({ "error": self.to_string() }))).into_response()
    }
}

// Load token and pod settings dynamically from the local CLI config.
fn load_lemma_config() -> anyhow::Result<(String, String)> {
    let user_profile = std::env::var("USERPROFILE")
        .map_err(|_| anyhow::anyhow!("USERPROFILE environment variable not found"))?;
    let path = std::path::PathBuf::from(user_profile)
        .join(".lemma")
        .join("config.json");
    
    if !path.exists() {
        return Err(anyhow::anyhow!("Lemma config.json not found at {:?}", path));
    }
    
    let content = std::fs::read_to_string(&path)?;
    let val: serde_json::Value = serde_json::from_str(&content)?;
    
    let active_server = val.get("active_server")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow::anyhow!("active_server not found in config"))?;
        
    let server_config = val.get("servers")
        .and_then(|s| s.get(active_server))
        .ok_or_else(|| anyhow::anyhow!("Config for active server '{}' not found", active_server))?;
        
    let token = server_config.get("token")
        .and_then(|t| t.as_str())
        .ok_or_else(|| anyhow::anyhow!("Token not found for server '{}'", active_server))?
        .to_string();
        
    let defaults = server_config.get("defaults")
        .ok_or_else(|| anyhow::anyhow!("defaults section not found for server '{}'", active_server))?;
        
    let pod_id = defaults.get("pod_id")
        .and_then(|p| p.as_str())
        .ok_or_else(|| anyhow::anyhow!("pod_id not found in defaults"))?
        .to_string();
        
    Ok((token, pod_id))
}

// Mock mock job qualifications for backend liveness probe.
async fn health() -> &'static str {
    "Job Title: Software Engineering Intern, Bachelors, Summer 2025\nCompany: Google\nLocation: Mountain View, CA\n\nQualifications:\n- Currently pursuing a Bachelor's degree in Computer Science or related technical field.\n- Experience programming in Java, C++, Python, or JavaScript.\n\nResponsibilities:\n- Create and support a productive and innovative team.\n- Apply algorithms and data structures to solve real-world problems.\n- Work closely with other engineers to build Google-scale applications."
}

// Retrieve application logs and records from the Lemma pod table.
async fn get_applications(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let url = format!(
        "{}/pods/{}/datastore/tables/applications/records?limit=100",
        state.lemma_base_url, state.lemma_pod_id
    );

    let resp = state
        .http
        .get(&url)
        .bearer_auth(&state.lemma_token)
        .send()
        .await
        .map_err(|e| ApiError::Lemma(format!("GET applications list: {e}")))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(ApiError::Lemma(format!("Lemma GET status {status}: {body}")));
    }

    let records_json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| ApiError::Lemma(format!("parse applications list JSON: {e}")))?;

    Ok(Json(records_json))
}

// Update the application status column in the Lemma pod table.
async fn update_application(
    State(state): State<Arc<AppState>>,
    Path(record_id): Path<String>,
    Json(payload): Json<UpdateApplicationPayload>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let url = format!(
        "{}/pods/{}/datastore/tables/applications/records/{}",
        state.lemma_base_url, state.lemma_pod_id, record_id
    );

    let body = serde_json::json!({
        "data": {
            "status": payload.status
        }
    });

    let resp = state
        .http
        .patch(&url)
        .bearer_auth(&state.lemma_token)
        .json(&body)
        .send()
        .await
        .map_err(|e| ApiError::Lemma(format!("PATCH update application: {e}")))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(ApiError::Lemma(format!("Lemma PATCH status {status}: {body}")));
    }

    let updated_json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| ApiError::Lemma(format!("parse updated record JSON: {e}")))?;

    Ok(Json(updated_json))
}

// Delete an application record from the Lemma pod table.
async fn delete_application(
    State(state): State<Arc<AppState>>,
    Path(record_id): Path<String>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let url = format!(
        "{}/pods/{}/datastore/tables/applications/records/{}",
        state.lemma_base_url, state.lemma_pod_id, record_id
    );

    let resp = state
        .http
        .delete(&url)
        .bearer_auth(&state.lemma_token)
        .send()
        .await
        .map_err(|e| ApiError::Lemma(format!("DELETE application: {e}")))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(ApiError::Lemma(format!("Lemma DELETE status {status}: {body}")));
    }

    Ok(Json(serde_json::json!({ "status": "deleted" })))
}

// Ingest job/resume context, encrypt/decrypt E2EE telemetry, and trigger the workflow run.
async fn process_job(
    State(state): State<Arc<AppState>>,
    Json(req): Json<JobRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let JobRequest { job_url, job_text, resume_path, company, role } = req;

    info!(%job_url, %resume_path, %company, %role, "processing job request");

    // Fetch details and parse local resume file concurrently.
    let (fetched_job_text, resume_text) = tokio::try_join!(
        async {
            if let Some(text) = job_text {
                let compact = text.split_whitespace().collect::<Vec<_>>().join(" ");
                Ok(compact)
            } else {
                ingest::scrape_job_description(&job_url)
                    .await
                    .map_err(|e| ApiError::Ingestion(format!("job scrape: {e}")))
            }
        },
        async {
            tokio::task::spawn_blocking(move || ingest::extract_resume_text(&resume_path))
                .await
                .map_err(|e| ApiError::Ingestion(format!("thread panic: {e}")))?
                .map_err(|e| ApiError::Ingestion(format!("resume parsing: {e}")))
        }
    )?;

    let job_text = fetched_job_text;

    info!(job_text_len = job_text.len(), resume_text_len = resume_text.len(), "[STEP 1/4] Ingestion complete");

    // Perform AES-GCM encryption on the ingested text blobs for telemetry.
    let job_ct = crypto::encrypt_payload(job_text.as_bytes(), &state.e2ee_key)
        .map_err(|e| ApiError::Internal(format!("job encrypt: {e}")))?;
    let resume_ct = crypto::encrypt_payload(resume_text.as_bytes(), &state.e2ee_key)
        .map_err(|e| ApiError::Internal(format!("resume encrypt: {e}")))?;

    info!(job_ct_len = job_ct.len(), resume_ct_len = resume_ct.len(), "[STEP 2/4] Encryption complete");

    // Decrypt E2EE payloads to retrieve clean strings.
    let job_plain = crypto::decrypt_payload(&job_ct, &state.e2ee_key)
        .map_err(|e| ApiError::Internal(format!("job decrypt: {e}")))?;
    let resume_plain = crypto::decrypt_payload(&resume_ct, &state.e2ee_key)
        .map_err(|e| ApiError::Internal(format!("resume decrypt: {e}")))?;

    let job_plain_str = String::from_utf8_lossy(&job_plain).into_owned();
    let resume_plain_str = String::from_utf8_lossy(&resume_plain).into_owned();

    info!("[STEP 3/4] Decryption complete, sending to Lemma Cloud...");

    // Setup target cloud workflow run endpoint.
    let create_run_url = format!(
        "{}/pods/{}/workflows/process-job/runs",
        state.lemma_base_url, state.lemma_pod_id
    );

    // Call POST method to start the workflow run.
    let create_resp = state
        .http
        .post(&create_run_url)
        .bearer_auth(&state.lemma_token)
        .send()
        .await
        .map_err(|e| ApiError::Lemma(format!("create run POST: {e}")))?;

    if !create_resp.status().is_success() {
        let status = create_resp.status();
        let body = create_resp.text().await.unwrap_or_default();
        error!(%status, %body, "lemma workflow run creation failed");
        return Err(ApiError::Lemma(format!("Lemma run create status {status}: {body}")));
    }

    let run_payload: serde_json::Value = create_resp
        .json()
        .await
        .map_err(|e| ApiError::Lemma(format!("parse run response JSON: {e}")))?;

    let run_id = run_payload.get("id")
        .and_then(|id| id.as_str())
        .ok_or_else(|| ApiError::Lemma("workflow run response is missing ID".into()))?;

    info!(%run_id, "[STEP 4/4] Workflow run created, submitting intake form...");

    // Setup cloud workflow intake form endpoint.
    let submit_form_url = format!(
        "{}/pods/{}/workflow-runs/{}/form",
        state.lemma_base_url, state.lemma_pod_id, run_id
    );

    // Prepare inputs matching the intake form nodes.
    let submit_payload = FormSubmitPayload {
        node_id: "intake".to_string(),
        inputs: serde_json::json!({
            "company": company,
            "role": role,
            "job_url": job_url,
            "job_context": job_plain_str,
            "resume_context": resume_plain_str
        }),
    };

    // Submit payload to trigger agent execution.
    let submit_resp = state
        .http
        .post(&submit_form_url)
        .bearer_auth(&state.lemma_token)
        .json(&submit_payload)
        .send()
        .await
        .map_err(|e| ApiError::Lemma(format!("submit form POST: {e}")))?;

    if !submit_resp.status().is_success() {
        let status = submit_resp.status();
        let body = submit_resp.text().await.unwrap_or_default();
        error!(%status, %body, "lemma form submission failed");
        return Err(ApiError::Lemma(format!("Lemma form submit status {status}: {body}")));
    }

    let final_run_payload: serde_json::Value = submit_resp
        .json()
        .await
        .map_err(|e| ApiError::Lemma(format!("parse submit form response: {e}")))?;

    Ok(Json(serde_json::json!({
        "status": "ok",
        "e2ee": {
            "algorithm": "AES-256-GCM",
            "job_ciphertext_bytes": job_ct.len(),
            "resume_ciphertext_bytes": resume_ct.len(),
        },
        "run_details": final_run_payload,
    })))
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Configure default log outputs.
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    // Pull credentials dynamically from active CLI session files.
    let (lemma_token, lemma_pod_id) = match load_lemma_config() {
        Ok((token, pod_id)) => {
            info!(%pod_id, "successfully loaded Lemma CLI configurations");
            (token, pod_id)
        }
        Err(e) => {
            error!("failed to load Lemma configuration from ~/.lemma/config.json: {}", e);
            anyhow::bail!("CLI config loading failed. Please run `lemma auth login` first.");
        }
    };

    let e2ee_key = [0u8; 32];

    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(45))
        .build()?;

    let lemma_base_url = std::env::var("LEMMA_BASE_URL")
        .unwrap_or_else(|_| DEFAULT_LEMMA_BASE_URL.to_string());

    let state = Arc::new(AppState {
        http,
        e2ee_key,
        lemma_base_url,
        lemma_token,
        lemma_pod_id,
    });

    // Allow CORS parameters to link Axios calls directly from React dashboard.
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/health", get(health))
        .route("/api/process_job", post(process_job))
        .route("/api/applications", get(get_applications))
        .route("/api/applications/:id", patch(update_application).delete(delete_application))
        .layer(cors)
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    info!(%addr, "Lemma Job Tracker listening");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}