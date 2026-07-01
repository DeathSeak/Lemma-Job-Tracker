<h1 align="center">Lemma Job Tracker</h1>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT" />&nbsp;
  <img src="https://img.shields.io/badge/Frontend-React-61DAFB?logo=react&logoColor=black" alt="Frontend: React" />&nbsp;
  <img src="https://img.shields.io/badge/Backend-Rust-000000?logo=rust&logoColor=white" alt="Backend: Rust" />&nbsp;
  <img src="https://img.shields.io/badge/Language-TypeScript-3178C6?logo=typescript&logoColor=white" alt="Language: TypeScript" />&nbsp;
  <img src="https://img.shields.io/badge/Build-Vite-646CFF?logo=vite&logoColor=white" alt="Build: Vite" />
</p>

A privacy-first, zero-knowledge AI job application tracking and preparation pipeline. Built for the "Ship To Get Hired" hackathon by GAPPY AI.

Lemma Job Tracker transforms the tedious job application process into an automated, highly-polished command center. It ingests job descriptions, tailors your resume, drafts outreach emails, and even runs you through voice-analyzed mock interviews—all while keeping your data private and secure.

---

## Features

- **Privacy-First AI Ingestion**: Drop in a job URL or paste text directly. The AI pipeline analyzes the role and cross-references it with your master resume.
- **Tailored Application Assets**: Instantly generates perfectly tailored Markdown/PDF resumes and highly targeted recruiter outreach emails based on the specific job description.
- **Voice AI Mock Interview Coach**:
  - Generates custom interview questions based on the job requirements.
  - Built-in Voice AI practice mode with speech-to-text.
  - **Live STAR Analysis**: Analyzes your spoken response in real-time for Situation, Task, Action, Result methodology.
  - **Pacing & Filler Detection**: Detects filler words (um, uh, literally) and grades your response length.
- **Kanban Board**: Track your applications (Scouted -> Applied -> Interviewing -> Accepted -> Rejected) with drag-and-drop physics.
- **Executive Analytics Ribbon**: A minimal, real-time dashboard displaying your interview metrics, application counts, and overall success rate.
- **Zero-Knowledge Architecture**: Engineered securely with a Rust backend and `lemma` AI daemon.

---

## Tech Stack

- **Frontend**: React, TypeScript, Vite, CSS
- **Backend**: Rust
- **AI/Processing**: `lemma` daemon integration
- **Voice**: Web Speech API

---

## Getting Started

### Prerequisites

- Node.js (v18+)
- `pnpm / npm`
- Rust / Cargo

### Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/DeathSeak/Lemma-Job-Tracker.git
   cd Lemma-Job-Tracker
   ```

2. **Install & Bootstrap Lemma CLI:**

   - **Windows:** Run the local helper bootstrap script in an administrator PowerShell window to automatically configure `uv` and the `lemma-terminal` CLI:

     ```powershell
     powershell -ExecutionPolicy Bypass -File .\install_lemma.ps1
     ```

   - **macOS/Linux:** Make the local helper bootstrap script executable and run it to automatically configure `uv` and the `lemma-terminal` CLI:

     ```bash
     chmod +x ./install_lemma.sh
     ./install_lemma.sh
     ```

3. **Configure & Authenticate Lemma CLI:**

   First, visit [Lemma](https://lemma.work) to create your account and set up a cloud pod. You can also read the [Lemma Documentation](https://lemma.work/docs) to understand how the workspace platform works.

   Once you have your cloud pod ready, authenticate your local CLI with your cloud account and configure agent skills:

   ```bash
   # Log in to authenticate with lemma.work
   lemma auth login

   # Import the Resume-pod configuration (tables, functions, workflows) to the cloud
   lemma pod import ./Resume-pod
   ```

4. **Start the Lemma Daemon:**

   Now, start the daemon to connect your workspace pod:

   ```bash
   lemma daemon start
   ```

5. **Run the Rust Backend:**

   Open a new terminal window and start the backend using:

   ```bash
   # In the root directory
   cargo run
   ```

6. **Run the Frontend:**

   ```bash
   cd frontend
   pnpm install
   pnpm run dev
   ```

7. **Open your browser:**
   Navigate to `http://localhost:5173` (or the port specified by Vite) and start applying!

---
