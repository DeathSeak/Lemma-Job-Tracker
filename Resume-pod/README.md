# Resume-pod

This directory contains the configurations, schemas, and instructions for the Lemma workspace pod that powers the Lemma Job Tracker app. 

It orchestrates the zero-metadata job application parsing pipeline, executes the Career Copilot agent, and logs processed applications to a local datastore table.

## Build and Import Loop

To validate and import these workspace assets to your Lemma cloud account:

```bash
# Validate configuration without modifying
lemma pod import ./Resume-pod --dry-run

# Import and deploy to Lemma Cloud
lemma pod import ./Resume-pod
```

## Pod Structure

- **`tables/applications/`**: Defines the database schema for saving and updating tracked application records.
- **`agents/copilot/`**: Configures the system instructions and task prompts for the Career Copilot AI agent.
- **`functions/save_application/`**: Houses the Python runner script (`code.py`) that handles post-generation cleanups, salving raw AI text, and writing rows to the database.
- **`workflows/process-job/`**: Connects the intake form, AI copilot, and database function nodes into a unified, secure processing pipeline.
