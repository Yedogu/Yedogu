<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Yedogu/Yedogu/main/logos/yedogunamelogo-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/Yedogu/Yedogu/main/logos/yedogunamelogo.png">
  <img alt="Yedogu" src="https://raw.githubusercontent.com/Yedogu/Yedogu/main/logos/yedogunamelogo.png" width="380">
</picture>

<p>
  <strong>Terminal-first, browser-extensible (<code>/browser</code>) multi-provider AI harness for offensive security and reverse engineering.</strong>
</p>

<p>
  <a href="https://www.npmjs.com/package/yedogu"><img src="https://img.shields.io/npm/v/yedogu?style=flat-square&color=cb3837&logo=npm" alt="npm version"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D20-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js >= 20">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT License"></a>
</p>

</div>

---

## Installation

**Requirements:** Node.js `>= 20.0.0`

```bash
# Install globally
npm install -g yedogu
yedogu

# Or run directly without installing
npx yedogu
```

<details>
<summary>Install from source</summary>

```bash
git clone https://github.com/Yedogu/Yedogu.git
cd Yedogu
npm install
npm run build
npm link
yedogu
```

</details>

---

## Quick Start

```text
/providers                                           # View connected providers & local runtimes
/connect anthropic sk-ant-...                        # Connect Anthropic, OpenAI, Gemini, etc.
/model openai/gpt-5-codex                            # Set default model
/model anthropic/claude-opus-4-6 --agent reverser    # Pin a specific model to an agent
/scope add *.target.com                              # Define authorized scope
/scope enforced                                      # Block out-of-scope HTTP requests
/re /path/to/binary                                  # Run binary triage
/browser                                             # Open the live-synced Browser War-Room
/channels                                            # Configure Telegram, Discord, Slack, or Webhook bots
```

---

## Features

### Terminal TUI + `/browser` War-Room
- Launch directly in your terminal (`yedogu`).
- Run `/browser` at any point to open an SSE-synced web workspace (**Console & Swarm**, **HTTP Forge**, **RE & JS Recon**, **Findings & Reports**, **Provider & Scope Matrix**) attached to the same live session.

### Multi-Provider Router
- Native streaming and tool-calling support for **OpenAI / Codex**, **Anthropic / Claude**, **Google Gemini**, **OpenRouter**, **DeepSeek**, **xAI (Grok)**, **Groq**, **Mistral**, **Ollama**, **LM Studio**, and custom OpenAI/Anthropic/Gemini-compatible endpoints.
- Automatic credential discovery from environment variables, Codex CLI (`~/.codex/auth.json`), Claude Code (`~/.claude/.credentials.json`), and OpenCode auth.
- Per-agent model pinning so each specialist runs on the model best suited to its task.

### Specialist Agents

| Agent | Focus |
| :--- | :--- |
| `@commander` | Red-team orchestration, attack trees, and parallel swarms |
| `@recon` | OSINT, JS bundle / source-map analysis, and attack surface mapping |
| `@web-hunter` | Web application, API, and bug bounty exploitation |
| `@reverser` | PE/ELF/Mach-O, APK/IPA, ASAR, and REA MCP reverse engineering |
| `@exploit-dev` | SAST, variant analysis, patch diffing, and PoC development |
| `@cloud-iam` | AWS/GCP/Azure IAM, Entra/Okta, CI/CD, and Kubernetes |
| `@web3-auditor` | Solidity, Rust, and Solana smart contract auditing |
| `@triage-report` | Validation gate, CVSS 3.1 scoring, and sanitized report generation |

### Security Tooling & ROE Guardrails
- **Scope & ROE Engine (`/scope`)**: Wildcard domain, CIDR, and deny rules enforced at the HTTP layer.
- **HTTP Forge (`http_forge` / `/http`)**: Request repeater with latency tracking, SHA-256 response hashing, and security header checks.
- **Binary Triage (`binary_triage` / `/re`)**: Pure-TypeScript PE32+/ELF/Mach-O/ZIP/APK/IPA/ASAR inspector (entropy, ASLR/DEP/CFG/PIE mitigations, strings).
- **JS Recon (`js_recon` / `/js`)**: Extracts API routes, GraphQL operations, WebSockets, DOM sinks, and secret patterns.
- **MCP Bridge (`/mcp`)**: JSON-RPC stdio client pre-wired for REA (`rea-agents`) and custom MCP servers.
- **Finding Ledger (`/findings`, `/report`)**: CVSS 3.1 scoring, automatic secret/cookie/token redaction, and Markdown export for HackerOne, Bugcrowd, and red-team reports.
- **Remote Channels (`/channels`)**: Deny-by-default Telegram, Discord, Slack, and Webhook bridges with one-time `/pair <CODE>` authorization.

---

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for architecture notes, scope guardrail requirements, and testing guidelines.

```bash
npm install
npm run typecheck
npm test
```

## License

[MIT](./LICENSE)
