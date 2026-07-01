//! File + web ingestion pipeline.
//!
//! Both ingestors return raw text held ONLY in memory. Nothing is written to
//! disk. The caller (the axum handler) is responsible for immediately routing
//! the bytes through `crypto::encrypt_payload` to enforce the zero-metadata
//! boundary before any further handling.

use anyhow::{anyhow, Result};
use scraper::{Html, Selector};
use std::path::Path;

/// Asynchronously fetch `url` and extract the visible text of its `<body>`.
///
/// Uses a rustls-backed reqwest client (no native OpenSSL dependency) and the
/// `scraper` HTML parser. Non-2xx responses and transport failures are mapped
/// to human-readable errors so the handler can surface a clean 502.
pub async fn scrape_job_description(url: &str) -> Result<String> {
    let client = reqwest::Client::builder()
        .user_agent("AIJobCommandCentre/0.1 (+secure-ingestion)")
        .timeout(std::time::Duration::from_secs(20))
        .build()?;

    let resp = client.get(url).send().await?;

    if !resp.status().is_success() {
        return Err(anyhow!(
            "HTTP {} fetching job description from {}",
            resp.status(),
            url
        ));
    }

    let html_text = resp.text().await?;
    let document = Html::parse_document(&html_text);

    // Prefer the <body> subtree; fall back to the whole document if a page
    // omits <body> (rare, but keeps the pipeline resilient).
    let body_selector =
        Selector::parse("body").map_err(|e| anyhow!("invalid body selector: {e}"))?;

    let raw = document
        .select(&body_selector)
        .next()
        .map(|el| el.text().collect::<Vec<_>>().join(" "))
        .unwrap_or_else(|| html_text);

    // Collapse runs of whitespace so the Lemma context stays compact.
    let compact = raw
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    Ok(compact)
}

/// Synchronously extract raw text from a local PDF resume.
///
/// `pdf-extract` is a blocking crate, so callers should invoke this from
/// `tokio::task::spawn_blocking` to avoid stalling the async runtime. The
/// returned `String` lives only in the caller's stack frame.
pub fn extract_resume_text(file_path: &str) -> Result<String> {
    if !Path::new(file_path).exists() {
        return Err(anyhow!("resume file not found: {file_path}"));
    }

    // If it's a markdown file, we can just read it directly! Super fast and efficient.
    if file_path.to_lowercase().ends_with(".md") {
        let text = std::fs::read_to_string(file_path)
            .map_err(|e| anyhow!("failed to read markdown resume {file_path}: {e}"))?;
        return Ok(text);
    }

    let text = pdf_extract::extract_text(file_path)
        .map_err(|e| anyhow!("pdf extraction failed for {file_path}: {e}"))?;

    Ok(text)
}