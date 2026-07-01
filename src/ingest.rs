// Ingestion utilities for job description scraping and PDF/Markdown resume parsing.

use anyhow::{anyhow, Result};
use scraper::{Html, Selector};
use std::path::Path;

// Fetch a web page and extract the inner text of the body tag.
pub async fn scrape_job_description(url: &str) -> Result<String> {
    let client = reqwest::Client::builder()
        .user_agent("LemmaJobTracker/0.1 (+secure-ingestion)")
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

    // Extract body text or fall back to the raw HTML text if body tag is missing.
    let body_selector =
        Selector::parse("body").map_err(|e| anyhow!("invalid body selector: {e}"))?;

    let raw = document
        .select(&body_selector)
        .next()
        .map(|el| el.text().collect::<Vec<_>>().join(" "))
        .unwrap_or_else(|| html_text);

    // Collapse extra whitespaces and format the string.
    let compact = raw
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    Ok(compact)
}

// Read text content from a local PDF or Markdown resume file.
pub fn extract_resume_text(file_path: &str) -> Result<String> {
    if !Path::new(file_path).exists() {
        return Err(anyhow!("resume file not found: {file_path}"));
    }

    // Read directly if the file format is Markdown.
    if file_path.to_lowercase().ends_with(".md") {
        let text = std::fs::read_to_string(file_path)
            .map_err(|e| anyhow!("failed to read markdown resume {file_path}: {e}"))?;
        return Ok(text);
    }

    // Extract text from the PDF file.
    let text = pdf_extract::extract_text(file_path)
        .map_err(|e| anyhow!("pdf extraction failed for {file_path}: {e}"))?;

    Ok(text)
}