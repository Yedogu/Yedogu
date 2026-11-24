import type {
  AgentDefinition,
  BinaryArtifactSummary,
  ChannelPublicView,
  FindingRecord,
  HttpCapture,
  ProviderConfig,
  ScopeConfig,
  SessionData,
} from "../types.js";
import type { JsReconResult } from "../tools/jsRecon.js";
import { isProviderConnected } from "../providers/registry.js";
import {
  ANSI,
  PALETTE,
  badge,
  c,
  formatTokens,
  getActiveTheme,
  kbd,
  padVisible,
  renderMiniGauge,
  renderThemeSwatch,
  rule,
  shortenPath,
  termWidth,
  truncatePlain,
  visibleLength,
} from "./theme.js";
import {
  renderCallout,
  renderCheckGrid,
  renderEndpointLine,
  renderGraphFrame,
  renderMeter,
  renderRankList,
  renderScoreDots,
  renderSectionHeader,
  renderSeverityStack,
  renderSpecRows,
  renderStatRow,
  renderTree,
  renderUptimeStrip,
} from "./components.js";

export { ANSI, PALETTE, c };

/**
 * Calm, airy editorial welcome banner using mdxcn GraphFrame + GraphSpec + GraphUptime.
 * Keeps visual noise low while surfacing essential live engagement context at a glance.
 */
export function renderBanner(
  session: SessionData,
  agent: AgentDefinition,
  providers: ProviderConfig[],
  daemonUrl: string,
  channels: ChannelPublicView[] = [],
): string {
  const connected = providers.filter(isProviderConnected).map((p) => p.id);
  const effectiveModel = session.agentModels[agent.id] || session.activeModel;
  const crit = session.findings.filter((f) => f.severity === "critical").length;
  const high = session.findings.filter((f) => f.severity === "high").length;
  const med = session.findings.filter((f) => f.severity === "medium").length;
  const theme = getActiveTheme();

  const scopeBadge =
    session.scope.mode === "enforced"
      ? c(PALETTE.success, "● enforced")
      : c(PALETTE.warning, "○ advisory");

  const findingsSummary =
    session.findings.length === 0
      ? c(PALETTE.muted, "0 findings")
      : `${c(PALETTE.danger + PALETTE.bold, `${crit}C`)} ${c(PALETTE.warning + PALETTE.bold, `${high}H`)} ${c(PALETTE.secondary, `${med}M`)}`;

  const providerUptime = renderUptimeStrip(
    providers.map((p) => (isProviderConnected(p) ? "ok" : "empty")),
  );
  const connectedVal = connected.length
    ? `${c(PALETTE.success, connected.slice(0, 3).join(", "))}${connected.length > 3 ? c(PALETTE.muted, ` +${connected.length - 3}`) : ""}  ${providerUptime}`
    : `${c(PALETTE.warning, "none (/connect)")}  ${providerUptime}`;

  const cardWidth = termWidth(80, 58);
  const specWidth = Math.max(44, cardWidth - 6);

  const specRows = [
    {
      label: "Agent",
      value: `${c(PALETTE.accent + PALETTE.bold, `@${agent.id}`)} ${c(PALETTE.muted, `· ${truncatePlain(agent.title, 30)}`)}`,
    },
    {
      label: "Model",
      value: `${c(PALETTE.text, truncatePlain(effectiveModel, 34))} ${c(PALETTE.muted, `· ${theme.id}`)}`,
    },
    {
      label: "Providers",
      value: connectedVal,
    },
    {
      label: "Scope",
      value: `${scopeBadge} ${c(PALETTE.muted, `(${session.scope.allow.length}a/${session.scope.deny.length}d)`)} ${c(PALETTE.border, "╎")} ${findingsSummary}`,
    },
    {
      label: "War-Room",
      value: `${c(PALETTE.info, daemonUrl)} ${c(PALETTE.muted, "(/browser)")}`,
    },
  ];

  if (channels.length > 0) {
    const live = channels.filter((ch) => ch.status.state === "connected");
    specRows.push({
      label: "Channels",
      value: live.length
        ? c(PALETTE.success, `● ${live.map((ch) => ch.status.botUsername || ch.platform).join(", ")}`)
        : c(PALETTE.muted, `○ ${channels.length} configured (/channels)`),
    });
  }

  const cardLines: string[] = [
    `${c(PALETTE.text + PALETTE.bold, "Offensive Security & Reverse Engineering Harness")}  ${renderThemeSwatch(theme)}`,
    c(PALETTE.muted, shortenPath(session.workspace, specWidth)),
    "",
    ...renderSpecRows(specRows, specWidth),
  ];

  const frame = renderGraphFrame(cardLines, {
    title: "YEDOGU v1.0.0",
    rightMeta: c(PALETTE.muted, session.id),
    footer: c(PALETTE.muted, "^K palette · ^P model · ^G agent · ^T theme · ^B browser"),
    frame: "box",
    width: cardWidth,
    indent: "  ",
  });

  const hint = connected.length
    ? `  ${c(PALETTE.muted, "Type")} ${c(PALETTE.text, "/")} ${c(PALETTE.muted, "commands ·")} ${c(PALETTE.text, "@")} ${c(PALETTE.muted, "route agent ·")} ${c(PALETTE.text, "?")} ${c(PALETTE.muted, "keys ·")} ${c(PALETTE.text, "Ctrl+K")} ${c(PALETTE.muted, "palette")}`
    : `  ${c(PALETTE.accentSoft, "Tip:")} ${c(PALETTE.secondary, "Run")} ${c(PALETTE.text, "/connect")} ${c(PALETTE.secondary, "or press")} ${c(PALETTE.text, "Ctrl+K")} ${c(PALETTE.secondary, "to add an API key.")}`;

  return `\n${frame}\n\n${hint}\n`;
}

/**
 * Calm, single-line context bar printed above the minimal composer.
 */
export function renderContextBar(session: SessionData): string {
  const effectiveModel = session.agentModels[session.activeAgent] || session.activeModel;
  const shortModel = truncatePlain(effectiveModel, 28);
  const scopeDot =
    session.scope.mode === "enforced"
      ? c(PALETTE.success, "● enforced")
      : c(PALETTE.muted, "○ advisory");
  const totalTok = session.totalInputTokens + session.totalOutputTokens;

  const parts = [
    c(PALETTE.accent + PALETTE.bold, `@${session.activeAgent}`),
    c(PALETTE.secondary, shortModel),
    scopeDot,
  ];
  if (session.findings.length > 0) {
    parts.push(c(PALETTE.warning, `⚑ ${session.findings.length}`));
  }
  if (totalTok > 0) {
    parts.push(`${renderMiniGauge(totalTok)} ${c(PALETTE.muted, `${formatTokens(totalTok)}`)}`);
  }

  const sep = c(PALETTE.border, " · ");
  const width = termWidth(80, 58);
  return `\n  ${rule(width, undefined, true)}\n  ${parts.join(sep)}\n`;
}

/**
 * Ultra-quiet single-line shortcut bar drawn below the prompt when idle.
 */
export function renderComposerFooter(): string {
  const width = termWidth(80, 58);
  const items = [
    `${c(PALETTE.secondary, "^K")} ${c(PALETTE.muted, "palette")}`,
    `${c(PALETTE.secondary, "^P")} ${c(PALETTE.muted, "model")}`,
    `${c(PALETTE.secondary, "^G")} ${c(PALETTE.muted, "agent")}`,
    `${c(PALETTE.secondary, "^T")} ${c(PALETTE.muted, "theme")}`,
    `${c(PALETTE.secondary, "^O")} ${c(PALETTE.muted, "sessions")}`,
    `${c(PALETTE.secondary, "/")} ${c(PALETTE.muted, "commands")}`,
    `${c(PALETTE.secondary, "@")} ${c(PALETTE.muted, "route")}`,
  ];
  const sep = "  ";
  let line = "";
  for (const item of items) {
    const candidate = line ? `${line}${sep}${item}` : item;
    if (visibleLength(candidate) > width) break;
    line = candidate;
  }
  return `  ${line}`;
}

/**
 * Clean, uncluttered prompt glyph.
 */
export function renderPromptString(_session: SessionData): string {
  return `  ${c(PALETTE.accent + PALETTE.bold, "❯")} `;
}

/**
 * Formats compact tool call arguments: ToolName(key=value)
 */
export function formatToolArgsCompact(args: Record<string, unknown>, maxLen = 64): string {
  const entries = Object.entries(args || {}).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (entries.length === 0) return "";
  const formatted = entries
    .slice(0, 3)
    .map(([k, v]) => {
      const raw = typeof v === "string" ? v : JSON.stringify(v);
      const val = truncatePlain(raw.replace(/\s+/g, " ").trim(), 34);
      return entries.length === 1 ? val : `${k}=${val}`;
    })
    .join(", ");
  return truncatePlain(formatted, maxLen);
}

/**
 * mdxcn Terminal-style structured tool call header:
 *   01 $ http_forge(https://api.target.example/v2)
 */
export function renderToolStart(name: string, args: Record<string, unknown>, stepNum?: number): string {
  const compact = formatToolArgsCompact(args);
  const stepTag = stepNum !== undefined ? `${c(PALETTE.muted, String(stepNum).padStart(2, "0"))} ` : "";
  const argPart = compact ? `${c(PALETTE.muted, "(")}${c(PALETTE.secondary, compact)}${c(PALETTE.muted, ")")}` : "";
  return `\n  ${stepTag}${c(PALETTE.accent, "$")} ${c(PALETTE.text + PALETTE.bold, name)}${argPart}\n`;
}

export function renderToolDone(
  name: string,
  ok: boolean,
  durationMs: number,
  output?: string,
): string {
  const firstLine = (output || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  const summary = firstLine
    ? truncatePlain(firstLine, termWidth(82, 56) - 24)
    : ok
      ? "completed"
      : `${name} failed`;
  const icon = ok ? c(PALETTE.success, "✓") : c(PALETTE.danger, "×");
  const timing = c(PALETTE.muted, `${durationMs}ms`);
  return `    ${c(PALETTE.border, "⎿")}  ${icon} ${c(ok ? PALETTE.secondary : PALETTE.danger, summary)} ${timing}\n`;
}

/**
 * Clean Providers list with mdxcn GraphUptime health strip in the header.
 */
export function renderProvidersTable(providers: ProviderConfig[]): string {
  const w = termWidth(80, 60);
  const uptime = renderUptimeStrip(providers.map((p) => (isProviderConnected(p) ? "ok" : "empty")));
  const lines: string[] = [
    "",
    ...renderSectionHeader("Providers", uptime, w),
  ];
  for (const p of providers) {
    const status = isProviderConnected(p)
      ? c(PALETTE.success, `● ${p.authSource || "connected"}`)
      : c(PALETTE.muted, "○ off");
    lines.push(
      `  ${padVisible(c(PALETTE.text + PALETTE.bold, p.id), 13)}` +
        `${padVisible(c(PALETTE.secondary, truncatePlain(p.name, 25)), 27)}` +
        `${padVisible(status, 18)}` +
        `${c(PALETTE.muted, truncatePlain(p.defaultModel, 22))}`,
    );
  }
  lines.push(`  ${rule(w, undefined, true)}`);
  lines.push(
    `  ${c(PALETTE.muted, "/connect <provider> <key>")}  ${c(PALETTE.border, "·")}  ${c(PALETTE.muted, "/model <provider/model>")}`,
  );
  lines.push("");
  return lines.join("\n");
}

/**
 * Spacious Specialist Agents roster without heavy borders.
 */
export function renderAgentsTable(agents: AgentDefinition[], session: SessionData): string {
  const w = termWidth(80, 60);
  const lines: string[] = [
    "",
    ...renderSectionHeader("Specialist Agents", c(PALETTE.muted, `${agents.length} specialists`), w),
  ];
  for (const a of agents) {
    const isActive = session.activeAgent === a.id;
    const marker = isActive ? c(PALETTE.accent + PALETTE.bold, "▸") : c(PALETTE.border, "·");
    const pinned = session.agentModels[a.id]
      ? c(PALETTE.info, truncatePlain(session.agentModels[a.id], 26))
      : c(PALETTE.muted, truncatePlain(session.activeModel, 26));

    lines.push(
      `  ${marker} ${padVisible(c(isActive ? PALETTE.accent + PALETTE.bold : PALETTE.text + PALETTE.bold, `@${a.id}`), 16)}` +
        `${padVisible(c(PALETTE.secondary, truncatePlain(a.title, 30)), 32)}` +
        `${pinned}`,
    );
    lines.push(`    ${c(PALETTE.muted, truncatePlain(a.description, w - 4))}`);
  }
  lines.push(`  ${rule(w, undefined, true)}`);
  lines.push(
    `  ${c(PALETTE.muted, "/agent <id>")}  ${c(PALETTE.border, "·")}  ${c(PALETTE.muted, "@reverser <prompt>")}  ${c(PALETTE.border, "·")}  ${c(PALETTE.muted, "/model <p/m> --agent <id>")}`,
  );
  lines.push("");
  return lines.join("\n");
}

/**
 * Clean Session Status view using mdxcn GraphFrame (rule mode) + GraphStat + GraphSpec + GraphMeter.
 */
export function renderStatusTerminal(
  session: SessionData,
  effectiveModel: string,
  daemonUrl: string,
): string {
  const w = termWidth(78, 58);
  const totalTok = session.totalInputTokens + session.totalOutputTokens;
  const pct = Math.min(99, Math.round((totalTok / 200_000) * 100));
  const theme = getActiveTheme();

  const statLine = renderStatRow(
    [
      { label: "msgs", value: String(session.messages.length) },
      { label: "http", value: String(session.httpHistory.length) },
      { label: "bins", value: String(session.artifacts.length) },
      {
        label: "findings",
        value: String(session.findings.length),
        color: session.findings.length > 0 ? PALETTE.warning : PALETTE.text,
      },
    ],
    "",
  );

  const specLines = renderSpecRows(
    [
      { label: "Workspace", value: shortenPath(session.workspace, 48), color: PALETTE.text },
      { label: "Agent", value: `@${session.activeAgent}`, color: PALETTE.accent + PALETTE.bold },
      { label: "Model", value: effectiveModel, color: PALETTE.text },
      { label: "Theme", value: `${c(PALETTE.text, theme.name)} ${renderThemeSwatch(theme)}` },
      {
        label: "Scope",
        value:
          session.scope.mode === "enforced"
            ? c(PALETTE.success, `● enforced (${session.scope.allow.length}a/${session.scope.deny.length}d)`)
            : c(PALETTE.warning, `○ advisory (${session.scope.allow.length}a/${session.scope.deny.length}d)`),
      },
      { label: "War-Room", value: daemonUrl, color: PALETTE.info },
      {
        label: "Context",
        value: `${renderMeter(totalTok, 200_000, 10, 160_000, 110_000)} ${c(PALETTE.secondary, `${formatTokens(totalTok)} (${pct}%)`)}`,
      },
    ],
    w - 2,
  );

  return (
    "\n" +
    renderGraphFrame([statLine, "", ...specLines], {
      title: "SESSION STATUS",
      rightMeta: c(PALETTE.info, session.id),
      frame: "rule",
      width: w,
    }) +
    "\n\n"
  );
}

/**
 * Clean Scope & ROE view using mdxcn GraphTree (`scope://roe`).
 */
export function renderScopeTerminal(scope: ScopeConfig): string {
  const w = termWidth(76, 56);
  const modePill =
    scope.mode === "enforced"
      ? badge("ENFORCED", PALETTE.success + PALETTE.bold)
      : badge("ADVISORY", PALETTE.warning + PALETTE.bold);

  const treeLines = renderTree("scope://roe", [
    {
      label: "allow/",
      tag: `(${scope.allow.length})`,
      color: PALETTE.success,
      children: scope.allow.length
        ? scope.allow.map((r) => c(PALETTE.text, r))
        : [c(PALETTE.muted, "(none — add targets with /scope add)")],
    },
    {
      label: "deny/",
      tag: `(${scope.deny.length})`,
      color: PALETTE.danger,
      children: scope.deny.length
        ? scope.deny.map((r) => c(PALETTE.danger, r))
        : [c(PALETTE.muted, "(none)")],
    },
  ]);

  return [
    "",
    ...renderSectionHeader("Scope & Rules of Engagement", modePill, w),
    ...treeLines,
    `  ${rule(w, undefined, true)}`,
    `  ${c(PALETTE.muted, "/scope add *.target.com  ·  /scope deny admin.target.com  ·  /scope enforced")}`,
    "",
  ].join("\n");
}

/**
 * Clean HTTP Forge response summary using mdxcn Endpoint + GraphSpec + GraphCheck.
 */
export function renderHttpCaptureTerminal(capture: HttpCapture, blockedReason?: string): string {
  if (blockedReason) {
    return ["", ...renderCallout("danger", "SCOPE BLOCKED", [blockedReason]), ""].join("\n");
  }

  const w = termWidth(78, 58);
  const statusCol = capture.status >= 500 ? PALETTE.danger : capture.status >= 400 ? PALETTE.warning : PALETTE.success;
  const headerLines = [
    "",
    renderEndpointLine(
      capture.method,
      truncatePlain(capture.url, w - 26),
      `${capture.status} ${capture.statusText} · ${capture.durationMs}ms`,
      statusCol,
    ),
    `  ${rule(w, undefined, true)}`,
    ...renderSpecRows(
      [
        { label: "Capture ID", value: capture.id, color: PALETTE.accent },
        { label: "SHA-256", value: capture.bodySha256.slice(0, 32), color: PALETTE.info },
      ],
      w,
      "  ",
    ),
  ];

  const checkItems = [
    ...capture.securityHeaders.present.map((h) => ({ label: h, state: "pass" as const })),
    ...capture.securityHeaders.missing.map((h) => ({ label: h, state: "fail" as const })),
  ];
  if (checkItems.length > 0) {
    headerLines.push("");
    headerLines.push(`  ${c(PALETTE.muted, "Security Headers")}`);
    headerLines.push(...renderCheckGrid(checkItems, w));
  }

  const preview = capture.responseBody.replace(/\s+/g, " ").trim();
  if (preview) {
    headerLines.push("");
    headerLines.push(`  ${c(PALETTE.border, "⎿")}  ${c(PALETTE.secondary, truncatePlain(preview, w - 6))}`);
  }
  headerLines.push("");
  return headerLines.join("\n");
}

/**
 * Clean Binary Triage view using mdxcn GraphSpec + GraphCheck + Callout + GraphMeter entropy bars.
 */
export function renderBinaryTriageTerminal(art: BinaryArtifactSummary): string {
  const w = termWidth(80, 60);
  const entColor = art.entropy > 7.1 ? PALETTE.danger : PALETTE.success;

  const lines: string[] = [
    "",
    ...renderSectionHeader(
      "Binary Triage",
      `${c(PALETTE.accent + PALETTE.bold, art.format)} ${c(PALETTE.muted, `· ${art.architecture}`)}`,
      w,
    ),
    ...renderSpecRows(
      [
        { label: "Path", value: shortenPath(art.path, w - 16), color: PALETTE.text },
        { label: "SHA-256", value: art.sha256.slice(0, 40), color: PALETTE.info },
        {
          label: "Size / Entropy",
          value: `${c(PALETTE.text, `${art.sizeBytes.toLocaleString()} B`)}  ${renderMeter(art.entropy, 8, 8, 7.1, 6.2)} ${c(entColor, art.entropy.toFixed(2))}`,
        },
      ],
      w,
      "  ",
    ),
  ];

  const mits = Object.entries(art.mitigations);
  if (mits.length) {
    lines.push("");
    lines.push(`  ${c(PALETTE.muted, "Exploit Mitigations")}`);
    lines.push(
      ...renderCheckGrid(
        mits.map(([k, v]) => ({
          label: k,
          state: v ? ("pass" as const) : ("fail" as const),
          note: v ? "ON" : "OFF",
        })),
        w,
      ),
    );
  }

  if (art.highlights.length) {
    lines.push("");
    lines.push(...renderCallout("warning", "Triage Highlights", art.highlights.map((h) => truncatePlain(h, w - 6))));
  }

  if (art.sections.length) {
    lines.push("");
    lines.push(`  ${c(PALETTE.muted, "Sections (Entropy 0–8)")}`);
    for (const s of art.sections.slice(0, 12)) {
      const sCol = s.entropy > 7.1 ? PALETTE.danger : s.entropy > 6.2 ? PALETTE.warning : PALETTE.secondary;
      lines.push(
        `  ${padVisible(c(PALETTE.text + PALETTE.bold, truncatePlain(s.name, 13)), 14)}` +
          `${padVisible(c(PALETTE.muted, s.virtualAddress || "-"), 12)}` +
          `${padVisible(c(PALETTE.secondary, `${s.size.toLocaleString()} B`), 13, "right")}  ` +
          `${padVisible(c(PALETTE.muted, s.flags || "---"), 5)} ` +
          `${renderMeter(s.entropy, 8, 8, 7.1, 6.2)} ${c(sCol, s.entropy.toFixed(2))}`,
      );
    }
  }

  if (art.interestingStrings.length) {
    lines.push("");
    lines.push(`  ${c(PALETTE.muted, `Interesting Strings (${art.interestingStrings.length})`)}`);
    for (const str of art.interestingStrings.slice(0, 8)) {
      lines.push(`  ${c(PALETTE.border, "·")} ${c(PALETTE.secondary, truncatePlain(str, w - 4))}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * Clean JS Recon view using mdxcn GraphStat + Callout + GraphTree + GraphRank.
 */
export function renderJsReconTerminal(res: JsReconResult, target: string): string {
  const w = termWidth(80, 60);
  const kb = res.bytesScanned >= 1024 ? `${(res.bytesScanned / 1024).toFixed(1)} KB` : `${res.bytesScanned} B`;

  const lines: string[] = [
    "",
    ...renderSectionHeader("JS Surface Recon", c(PALETTE.muted, shortenPath(target, 34)), w),
    renderStatRow([
      { label: "files", value: String(res.filesScanned), color: PALETTE.accent },
      { label: "", value: kb },
      { label: "secrets", value: String(res.secrets.length), color: res.secrets.length ? PALETTE.danger : PALETTE.success },
      { label: "routes", value: String(res.endpoints.length), color: PALETTE.info },
      { label: "sinks", value: String(res.dangerousSinks.length), color: res.dangerousSinks.length ? PALETTE.warning : PALETTE.text },
    ]),
  ];

  if (res.secrets.length) {
    lines.push("");
    lines.push(
      ...renderCallout(
        "danger",
        `Redacted Secrets (${res.secrets.length})`,
        res.secrets.slice(0, 8).map(
          (s) => `${c(PALETTE.warning, `[${s.type}]`)} ${c(PALETTE.secondary, s.file)} ${c(PALETTE.muted, "→")} ${c(PALETTE.text, s.preview)}`,
        ),
      ),
    );
  }

  if (res.endpoints.length) {
    const groupsMap = new Map<string, string[]>();
    for (const ep of res.endpoints.slice(0, 32)) {
      const m = ep.match(/^(\/[^/\s?]+|https?:\/\/[^/]+|wss?:\/\/[^/]+)/);
      const key = m ? m[1] : "/";
      const arr = groupsMap.get(key) || [];
      arr.push(c(PALETTE.text, truncatePlain(ep, w - 12)));
      groupsMap.set(key, arr);
    }
    const groups = [...groupsMap.entries()].slice(0, 6).map(([label, children]) => ({
      label,
      tag: `(${children.length})`,
      children: children.slice(0, 5),
    }));
    lines.push("");
    lines.push(...renderTree("surface://endpoints", groups));
  }

  if (res.dangerousSinks.length) {
    const topSinks = [...res.dangerousSinks]
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
      .map((d) => ({ label: `${d.sink} (${d.file})`, count: d.count }));
    lines.push("");
    lines.push(`  ${c(PALETTE.muted, "Top Dangerous Sinks")}`);
    lines.push(...renderRankList(topSinks, w));
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * Clean Findings Ledger with mdxcn GraphStack severity bar + GraphScore CVSS dot-meters.
 */
export function renderFindingsTerminal(findings: FindingRecord[]): string {
  if (findings.length === 0) {
    return `\n  ${c(PALETTE.muted, "No findings recorded yet. Agents log validated findings automatically, or add them in /browser.")}\n\n`;
  }
  const sevStyle: Record<string, string> = {
    critical: PALETTE.danger + PALETTE.bold,
    high: PALETTE.warning + PALETTE.bold,
    medium: PALETTE.accentSoft,
    low: PALETTE.info,
    info: PALETTE.muted,
  };
  const counts = {
    critical: findings.filter((f) => f.severity === "critical").length,
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
    info: findings.filter((f) => f.severity === "info").length,
  };
  const w = termWidth(80, 60);
  const lines = [
    "",
    ...renderSectionHeader("Findings Ledger", c(PALETTE.muted, `${findings.length} recorded`), w),
    renderSeverityStack(counts, 26),
    "",
  ];
  for (const f of findings) {
    const b = padVisible(c(sevStyle[f.severity] || PALETTE.text, f.severity.toUpperCase()), 9);
    const cvssPart = f.cvssScore !== undefined ? `  ${renderScoreDots(f.cvssScore, 10, f.severity)}` : "";
    lines.push(
      `  ${b} ${c(PALETTE.info, f.id)}  ${c(PALETTE.text + PALETTE.bold, truncatePlain(f.title, w - 28))}`,
    );
    lines.push(
      `            ${c(PALETTE.muted, `${truncatePlain(f.target, 28)} · @${f.agentId} · ${f.status}`)}${cvssPart}`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * Focused mdxcn GraphFrame finding inspection card with GraphScore + GraphSpec + Callout.
 */
export function renderFindingDetailCard(f: FindingRecord): string {
  const sevColor =
    f.severity === "critical"
      ? PALETTE.danger
      : f.severity === "high"
        ? PALETTE.warning
        : f.severity === "medium"
          ? PALETTE.accentSoft
          : PALETTE.info;

  const w = termWidth(80, 60);
  const innerMax = w - 6;
  const wrap = (text: string, maxLen: number): string[] => {
    const words = (text || "—").replace(/\s+/g, " ").trim().split(" ");
    const out: string[] = [];
    let cur = "";
    for (const word of words) {
      if (!cur) cur = word;
      else if (cur.length + 1 + word.length <= maxLen) cur += ` ${word}`;
      else {
        out.push(cur);
        cur = word;
      }
    }
    if (cur) out.push(cur);
    return out;
  };

  const scoreLine = f.cvssScore !== undefined ? `  ${renderScoreDots(f.cvssScore, 10, f.severity)}` : "";
  const lines: string[] = [
    `${badge(f.severity.toUpperCase(), sevColor + PALETTE.bold)}${scoreLine}`,
    c(PALETTE.text + PALETTE.bold, truncatePlain(f.title, innerMax)),
    "",
    ...renderSpecRows(
      [
        { label: "Target", value: truncatePlain(f.target, innerMax - 12), color: PALETTE.info },
        { label: "Agent", value: `@${f.agentId}`, color: PALETTE.accent },
        { label: "Status", value: f.status.toUpperCase(), color: PALETTE.secondary },
        ...(f.cvssVector ? [{ label: "Vector", value: truncatePlain(f.cvssVector, innerMax - 12), color: PALETTE.muted }] : []),
      ],
      innerMax,
    ),
    "",
    c(PALETTE.accentSoft + PALETTE.bold, "Summary"),
    ...wrap(f.summary, innerMax).map((l) => c(PALETTE.secondary, l)),
  ];

  if (f.impact) {
    lines.push("");
    lines.push(...renderCallout("warning", "Proven Impact", wrap(f.impact, innerMax - 4), ""));
  }
  if (f.reproduction) {
    lines.push("");
    lines.push(c(PALETTE.accentSoft + PALETTE.bold, "Reproduction"));
    for (const l of wrap(f.reproduction, innerMax)) lines.push(c(PALETTE.text, l));
  }
  if (f.remediation) {
    lines.push("");
    lines.push(c(PALETTE.accentSoft + PALETTE.bold, "Remediation"));
    for (const l of wrap(f.remediation, innerMax)) lines.push(c(PALETTE.muted, l));
  }

  return (
    "\n" +
    renderGraphFrame(lines, {
      title: f.id,
      rightMeta: c(PALETTE.muted, f.category || "finding"),
      footer: c(PALETTE.muted, "run /report to export sanitized submission"),
      frame: "box",
      width: w,
    }) +
    "\n"
  );
}

/**
 * Clean Messaging Channels list with mdxcn GraphUptime header strip.
 */
export function renderChannelsTable(
  channels: ChannelPublicView[],
  daemonUrl: string,
): string {
  const w = termWidth(80, 60);
  const uptime = channels.length
    ? renderUptimeStrip(
        channels.map((ch) =>
          ch.status.state === "connected"
            ? "ok"
            : ch.status.state === "error"
              ? "down"
              : ch.status.state === "connecting"
                ? "degraded"
                : "empty",
        ),
      )
    : c(PALETTE.muted, "0 connected");

  const lines: string[] = [
    "",
    ...renderSectionHeader("Messaging Channels & Bots", uptime, w),
  ];

  if (channels.length === 0) {
    lines.push(
      `  ${c(PALETTE.muted, "No bots connected yet. Run /channels to connect Telegram, Discord, Slack, or Webhook.")}`,
    );
  } else {
    for (const ch of channels) {
      const st =
        ch.status.state === "connected"
          ? c(PALETTE.success, "● live")
          : ch.status.state === "connecting"
            ? c(PALETTE.warning, "◐ sync")
            : ch.status.state === "error"
              ? c(PALETTE.danger, "× err")
              : c(PALETTE.muted, "○ off");
      const handle = ch.status.botUsername ? c(PALETTE.info, ch.status.botUsername) : c(PALETTE.muted, ch.tokenPreview);
      const authSummary = ch.allowAll
        ? c(PALETTE.warning, "allow-all")
        : ch.allowedUsers.length + ch.allowedChats.length > 0
          ? c(PALETTE.success, `${ch.allowedUsers.length}u/${ch.allowedChats.length}c`)
          : ch.pairingCode
            ? c(PALETTE.accent, `/pair ${ch.pairingCode}`)
            : c(PALETTE.muted, "locked");

      lines.push(
        `  ${padVisible(c(PALETTE.text + PALETTE.bold, ch.id), 13)}` +
          `${padVisible(c(PALETTE.accentSoft, ch.platform), 10)}` +
          `${padVisible(st, 10)}` +
          `${padVisible(truncatePlain(handle, 24), 23)}` +
          `${authSummary}`,
      );
      if (ch.platform === "webhook" && ch.status.webhookPath) {
        lines.push(`    ${c(PALETTE.muted, `Endpoint: ${daemonUrl}${ch.status.webhookPath}`)}`);
      }
      if (ch.status.lastError) {
        lines.push(`    ${c(PALETTE.danger, `Last error: ${ch.status.lastError}`)}`);
      }
    }
  }

  lines.push(`  ${rule(w, undefined, true)}`);
  lines.push(
    `  ${c(PALETTE.muted, "/channels add telegram <token>")}  ${c(PALETTE.border, "·")}  ${c(PALETTE.muted, "/channels start|stop|allow|pair|rm <id>")}`,
  );
  lines.push("");
  return lines.join("\n");
}

/**
 * mdxcn GraphFrame post-connect completion card with `① ② ③` next steps.
 */
export function renderChannelConnectedCard(
  ch: ChannelPublicView,
  daemonUrl: string,
  webhookSecret?: string,
): string {
  const w = termWidth(78, 56);
  const inner = w - 6;
  const handle = ch.status.botUsername || ch.name;

  const lines: string[] = [
    `${badge("LIVE", PALETTE.success + PALETTE.bold)}  ${c(PALETTE.text + PALETTE.bold, handle)} ${c(PALETTE.muted, `· id:${ch.id}`)}`,
    "",
  ];

  if (ch.platform === "webhook") {
    const endpoint = `${daemonUrl}/api/channels/webhook/${ch.id}`;
    lines.push(`${c(PALETTE.accent + PALETTE.bold, "①")} ${c(PALETTE.secondary, "POST JSON to")} ${c(PALETTE.info, truncatePlain(endpoint, inner - 16))}`);
    if (webhookSecret) {
      lines.push(`${c(PALETTE.accent + PALETTE.bold, "②")} ${c(PALETTE.secondary, "Header:")} ${c(PALETTE.warning, `Authorization: Bearer ${webhookSecret}`)}`);
    }
    if (ch.pairingCode) {
      lines.push(`${c(PALETTE.accent + PALETTE.bold, "③")} ${c(PALETTE.secondary, "First send")} ${c(PALETTE.info + PALETTE.bold, `/pair ${ch.pairingCode}`)} ${c(PALETTE.secondary, "in JSON {\"text\":...} to authorize")}`);
    }
  } else {
    const appName =
      ch.platform === "telegram" ? "Telegram" : ch.platform === "discord" ? "Discord" : "Slack";
    lines.push(`${c(PALETTE.accent + PALETTE.bold, "①")} ${c(PALETTE.secondary, `Open ${appName} and DM`)} ${c(PALETTE.info + PALETTE.bold, handle)}`);
    if (ch.pairingCode) {
      lines.push(`${c(PALETTE.accent + PALETTE.bold, "②")} ${c(PALETTE.secondary, "Send")} ${c(PALETTE.accent + PALETTE.bold, `/pair ${ch.pairingCode}`)} ${c(PALETTE.secondary, "to unlock your account")}`);
    } else {
      lines.push(`${c(PALETTE.accent + PALETTE.bold, "②")} ${c(PALETTE.secondary, "Allowlist already configured — ready to chat")}`);
    }
    lines.push(`${c(PALETTE.accent + PALETTE.bold, "③")} ${c(PALETTE.secondary, "Text anything to the AI (or")} ${c(PALETTE.text, "@recon")} ${c(PALETTE.secondary, "/")} ${c(PALETTE.text, "/status")} ${c(PALETTE.secondary, "/")} ${c(PALETTE.text, "/agent")}${c(PALETTE.secondary, ")")}`);
  }

  return (
    "\n" +
    renderGraphFrame(lines, {
      title: `CONNECTED · ${ch.platform.toUpperCase()}`,
      rightMeta: c(PALETTE.success, "✓ ready"),
      footer: c(PALETTE.muted, "run /channels anytime to manage or pause"),
      frame: "box",
      width: w,
    }) +
    "\n"
  );
}

/**
 * Clean Help & Keybindings view using mdxcn GraphFrame (Keys) + uncluttered command groups.
 */
export function renderHelpText(): string {
  const w = termWidth(80, 60);
  const row = (cmd: string, desc: string) =>
    `  ${padVisible(c(PALETTE.text, cmd), 28)} ${c(PALETTE.secondary, desc)}`;

  const shortcutsCard = renderGraphFrame(
    [
      `${kbd("Ctrl+K")} ${padVisible(c(PALETTE.secondary, "Command Palette"), 20)}  ${kbd("Ctrl+P")} ${c(PALETTE.secondary, "Model Picker (Tab pins)")}`,
      `${kbd("Ctrl+G")} ${padVisible(c(PALETTE.secondary, "Switch @Agent"), 20)}  ${kbd("Ctrl+T")} ${c(PALETTE.secondary, "Live Color Theme")}`,
      `${kbd("Ctrl+O")} ${padVisible(c(PALETTE.secondary, "Session Switcher"), 20)}  ${kbd("Ctrl+B")} ${c(PALETTE.secondary, "Open WebTUI War-Room")}`,
      `${kbd("  /   ")} ${padVisible(c(PALETTE.secondary, "Slash Popover"), 20)}  ${kbd("  @   ")} ${c(PALETTE.secondary, "Agent Mention Popover")}`,
      `${kbd("Ctrl+L")} ${padVisible(c(PALETTE.secondary, "Clear & Redraw"), 20)}  ${kbd(" Esc  ")} ${c(PALETTE.secondary, "Close Pop-up / Clear")}`,
    ],
    {
      title: "KEYBINDINGS",
      rightMeta: c(PALETTE.muted, "press ? anytime"),
      frame: "box",
      width: w,
    },
  );

  return [
    "",
    shortcutsCard,
    "",
    ...renderSectionHeader("Slash Commands", c(PALETTE.muted, "⊞ opens pop-up"), w),
    `  ${c(PALETTE.accent, "Workspace")}`,
    row("/browser", "Open live-synced WebTUI Browser War-Room"),
    row("/channels [add|start|stop]", "⊞ Connect Telegram, Discord, Slack & Webhook bots"),
    row("/model [p/m] [--agent id]", "⊞ Switch model or pin per specialist agent"),
    row("/agent [id]", "⊞ Switch specialist security agent"),
    row("/theme [name]", "⊞ Switch terminal & War-Room color theme"),
    row("/providers  |  /connect", "⊞ View providers or enter API key securely"),
    "",
    `  ${c(PALETTE.accent, "Security & Recon")}`,
    row("/scope [add|deny|enforced]", "⊞ Manage authorized target scope & ROE"),
    row("/swarm <objective>", "Run parallel @recon + @web-hunter + @reverser"),
    row("/re <filePath>", "Static binary / APK / IPA / ASAR triage"),
    row("/js [path]", "Scan JS bundles for endpoints, sinks & secrets"),
    row("/http [METHOD] <URL>", "Send scope-checked HTTP Forge request"),
    row("/findings  |  /report", "⊞ Inspect findings ledger or export report"),
    row("/mcp [list|connect|add]", "Manage REA & external MCP servers"),
    "",
    `  ${c(PALETTE.accent, "Session")}`,
    row("/sessions  /new  /compact", "⊞ Switch/create sessions or compact context"),
    row("/status  /clear  /exit", "Telemetry, clear messages, or quit"),
    `  ${rule(w, undefined, true)}`,
    "",
  ].join("\n");
}
