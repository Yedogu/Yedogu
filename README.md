<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./logos/yedogunamelogo-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="./logos/yedogunamelogo.png">
  <img alt="YEDOGU" src="./logos/yedogunamelogo.png" width="420">
</picture>

<h3>Offensive Security &amp; Reverse Engineering AI Harness</h3>

<p>
  <strong>Terminal-first. Live <code>/browser</code> War-Room. Universal Multi-Provider. 8 Specialist Security Agents.</strong>
</p>

<p>
  <img src="https://img.shields.io/badge/Node.js-%3E%3D20-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js >= 20">
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Agents-8_Specialists-22c55e?style=flat-square" alt="8 Specialist Agents">
  <img src="https://img.shields.io/badge/MCP-Native_Bridge-111827?style=flat-square" alt="MCP Bridge">
  <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="MIT License">
</p>

</div>

---

**YEDOGU** is a purpose-built AI harness engineered specifically for hackers, bug bounty hunters, red teamers, exploit developers, and reverse engineers.

## Core Capabilities

### Terminal-First Tactical TUI + Instant `/browser` Handoff
- Launch straight into the terminal (`yedogu`).
- Type **`/browser`** anytime inside a live session to open the real-time SSE-synced **Browser War-Room** (**Console & Swarm**, **HTTP Forge / Repeater**, **RE & JS Recon Workbench**, **Findings & Report Studio**, **Provider & Scope Matrix**) tied to the exact same session.

### Universal Multi-Provider Router (Per-Agent Model Pinning)
- Native streaming + tool-calling adapters for **OpenAI / Codex**, **Anthropic / Claude**, **Google Gemini**, **OpenRouter**, **DeepSeek**, **xAI (Grok)**, **Groq**, **Mistral**, **Ollama**, **LM Studio**, and **Custom OpenAI/Anthropic/Gemini Endpoints**.
- Automatic credential discovery from environment variables, Codex CLI (`~/.codex/auth.json`), Claude Code (`~/.claude/.credentials.json`), and OpenCode auth.
- Pin different models to different specialist agents (e.g., `anthropic/claude-opus-4-6` on `@reverser`, `openai/gpt-5-codex` on `@exploit-dev`, `gemini/gemini-2.5-pro` on `@recon`).

### 8 Specialist Security Agents + Parallel Swarm Dispatch

| Agent | Specialty |
| :--- | :--- |
| `@commander` | Red-Team & Research Lead — orchestrates attack trees & parallel swarms |
| `@recon` | OSINT, JS Bundle / Source-Map & Attack Surface Mapper |
| `@web-hunter` | WAPT, Bug Bounty & API Exploitation Specialist |
| `@reverser` | Native PE/ELF/Mach-O, APK/IPA, ASAR & REA MCP Reverse Engineer |
| `@exploit-dev` | SAST, Variant Analysis, Patch Diffing & PoC Builder |
| `@cloud-iam` | AWS/GCP/Azure IAM, Entra/Okta, CI/CD & K8s Specialist |
| `@web3-auditor` | Solidity / Rust / Solana Smart Contract & DeFi Auditor |
| `@triage-report` | 7-Question Validation Gate, CVSS 3.1 & Sanitized Report Writer |

### Messaging Channels & Remote Bots (`/channels`)
- Connect your own **Telegram Bot** (native Bot API long-polling), **Discord Bot** (Gateway v10 WebSocket), **Slack Bot** (Socket Mode), or **Generic Webhook Bridge** (`/api/channels/webhook/:id` for WhatsApp bridges, Matrix, n8n, iOS Shortcuts, or custom scripts) — with zero ngrok/tunneling required for Telegram, Discord, and Slack.
- Text the AI directly from your phone or chat app, route one-shot specialist tasks (`@recon`, `@web-hunter`, `@reverser`), and control sessions remotely (`/status`, `/agent`, `/model`, `/findings`, `/new`, `/abort`).
- **Deny-by-default security** with one-time `/pair <CODE>` self-authorization and user/chat allowlists, plus live sync to your Terminal TUI and Browser War-Room.

### Security-Native Tool Suite & ROE Guardrails
- **Scope & ROE Engine (`/scope`)**: Wildcard domain, CIDR, and explicit deny rules enforced at the HTTP layer.
- **HTTP Forge (`http_forge` / `/http`)**: Repeater with latency, SHA-256 response hashes, and security header auditing.
- **Binary Triage (`binary_triage` / `/re`)**: Pure-TypeScript PE32+/ELF/Mach-O/ZIP/APK/IPA/ASAR parser (entropy, ASLR/DEP/CFG/PIE mitigations, Bun overlay detection, strings).
- **JS Bundle Recon (`js_recon` / `/js`)**: Extracts API endpoints, GraphQL ops, WebSockets, DOM sinks, and 14+ secret classes.
- **MCP Bridge (`/mcp`)**: Native JSON-RPC stdio client pre-wired for **REA** (`rea-agents`) and custom security MCP servers.
- **Finding & Evidence Ledger (`/findings`, `/report`)**: CVSS 3.1 calculator, automatic cookie/token/API-key redaction, and 1-click HackerOne, Bugcrowd, and Enterprise Red-Team Markdown exports.

---

## Quick Start

```bash
git clone https://github.com/swarnimbandekar/Yedogu.git
cd Yedogu
npm install
npm run build

# Start Terminal-First Tactical TUI
npm start

# Or install globally in PATH
npm link
yedogu
```

### Inside YEDOGU

```text
/providers                                           # Inspect connected providers (Codex, Claude, Gemini, Ollama...)
/connect anthropic sk-ant-...                        # Or /connect openai sk-... or /connect gemini AIza...
/model openai/gpt-5-codex                            # Switch default model
/model anthropic/claude-opus-4-6 --agent reverser    # Pin model per agent
/scope add *.target.com                              # Set authorized scope
/scope enforced                                      # Lock out-of-scope HTTP requests
/re /path/to/binary                                  # Instant binary triage
/channels                                            # Connect Telegram, Discord, Slack, or Webhook bots
/browser                                             # Open live-synced Browser War-Room UI
```

---

## Project Structure

```text
Yedogu/
├── bin/          # CLI entrypoint (yedogu)
├── src/
│   ├── agents/   # 8 specialist security agents & swarm dispatch
│   ├── channels/ # Telegram, Discord, Slack & Webhook bridges
│   ├── config/   # Configuration & credential discovery
│   ├── providers/# Universal multi-provider LLM router
│   ├── scope/    # Scope & Rules-of-Engagement (ROE) guardrails
│   ├── server/   # SSE-synced Browser War-Room backend
│   ├── tools/    # HTTP Forge, Binary Triage, JS Recon, MCP Bridge, Ledger
│   ├── tui/      # Terminal-first Tactical TUI
│   └── web/      # Browser War-Room frontend
├── tests/        # Smoke & integration tests
└── logos/        # Transparent brand assets
```

---

<div align="center">

<img src="./logos/yedogulogo.png" alt="YEDOGU Icon" width="56">

<p><sub>Built for authorized offensive security research, bug bounty hunting, and reverse engineering.</sub></p>

</div>
