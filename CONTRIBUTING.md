# Contributing to Yedogu

Thanks for taking the time to contribute to Yedogu. Whether you are fixing a bug, adding a provider adapter, tuning a security agent prompt, or building a new recon/reverse-engineering tool, contributions are welcome.

## Getting Started

1. Fork the repository on GitHub: https://github.com/Yedogu/Yedogu
2. Clone your fork locally:
   ```bash
   git clone https://github.com/<your-username>/Yedogu.git
   cd Yedogu
   npm install
   ```
3. Build and run the test suite to verify your setup:
   ```bash
   npm run build
   npm test
   ```

## Development Workflow

- **Create a branch** for your change:
  ```bash
  git checkout -b feat/your-feature-name
  # or
  git checkout -b fix/issue-description
  ```
- **Run type checks and tests** before opening a pull request:
  ```bash
  npm run typecheck
  npm test
  ```
- **Interactive testing**:
  ```bash
  npm run dev
  ```

## Where to Contribute

- **Providers (`src/providers/`)** - Add or improve model adapters, streaming parsers, and credential discovery.
- **Specialist Agents (`src/agents/`)** - Refine system prompts, routing, and swarm orchestration across the 8 security roles (`@commander`, `@recon`, `@web-hunter`, `@reverser`, `@exploit-dev`, `@cloud-iam`, `@web3-auditor`, `@triage-report`).
- **Security Tools (`src/tools/`)** - Extend HTTP Forge, Binary Triage, JS Recon, MCP Bridge, or the Findings & CVSS Ledger.
- **Messaging Channels (`src/channels/`)** - Improve Telegram, Discord, Slack, or Webhook bridges and pairing controls.
- **TUI & Browser War-Room (`src/tui/`, `src/web/`, `src/server/`)** - UI improvements, slash commands, and real-time session sync.

## Guidelines

- **Zero leaked credentials**: Never commit real API keys, tokens, session cookies, or target-specific data. If a test requires a synthetic token format (such as Slack or AWS patterns), construct it dynamically in the test so secret scanners are not triggered.
- **Respect scope & ROE guardrails**: Any new network or HTTP-capable tool must check scope permissions through `src/scope/guard.ts` before sending requests.
- **Keep dependencies minimal**: Yedogu aims to stay fast and lightweight (`Node.js >= 20`, pure TypeScript where possible).
- **Write tests**: Add or update tests in `tests/smoke.test.ts` for new tools, parsers, providers, or scope rules.

## Submitting a Pull Request

1. Push your branch to your fork:
   ```bash
   git push origin feat/your-feature-name
   ```
2. Open a Pull Request against the `main` branch of `Yedogu/Yedogu`.
3. Include a clear description of what changed and how to test it (screenshots or terminal output are helpful for TUI and `/browser` War-Room changes).

## Reporting Bugs & Security Issues

- For bug reports or feature requests, open an issue on GitHub with steps to reproduce.
- Please do not include sensitive target data or unredacted traffic captures in public issues.
