import crypto from "node:crypto";
import { redactEvidence } from "../scope/guard.js";
import type { FindingRecord, FindingSeverity, SessionData } from "../types.js";

/**
 * Computes CVSS 3.1 Base Score from a standard vector string:
 * e.g. CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
 */
export function calculateCvss31(vector: string): { score: number; severity: FindingSeverity } | null {
  const parts: Record<string, string> = {};
  for (const seg of vector.trim().toUpperCase().split("/")) {
    const [k, v] = seg.split(":");
    if (k && v) parts[k] = v;
  }

  const AV: Record<string, number> = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 };
  const AC: Record<string, number> = { L: 0.77, H: 0.44 };
  const UI: Record<string, number> = { N: 0.85, R: 0.62 };
  const CIA: Record<string, number> = { N: 0, L: 0.22, H: 0.56 };

  const scopeChanged = parts.S === "C";
  const PR_U: Record<string, number> = { N: 0.85, L: 0.62, H: 0.27 };
  const PR_C: Record<string, number> = { N: 0.85, L: 0.68, H: 0.5 };

  const av = AV[parts.AV];
  const ac = AC[parts.AC];
  const pr = scopeChanged ? PR_C[parts.PR] : PR_U[parts.PR];
  const ui = UI[parts.UI];
  const c = CIA[parts.C];
  const i = CIA[parts.I];
  const a = CIA[parts.A];

  if ([av, ac, pr, ui, c, i, a].some((v) => v === undefined)) {
    return null;
  }

  const iss = 1 - (1 - c) * (1 - i) * (1 - a);
  const impact = scopeChanged
    ? 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15)
    : 6.42 * iss;

  if (impact <= 0) return { score: 0, severity: "info" };

  const exploitability = 8.22 * av * ac * pr * ui;
  const raw = scopeChanged
    ? Math.min(1.08 * (impact + exploitability), 10)
    : Math.min(impact + exploitability, 10);
  const score = Math.ceil(raw * 10) / 10;

  let severity: FindingSeverity = "info";
  if (score >= 9.0) severity = "critical";
  else if (score >= 7.0) severity = "high";
  else if (score >= 4.0) severity = "medium";
  else if (score > 0) severity = "low";

  return { score, severity };
}

export function createFinding(
  input: {
    title: string;
    severity?: FindingSeverity;
    cvssVector?: string;
    target: string;
    category?: string;
    summary: string;
    impact: string;
    reproduction: string;
    remediation?: string;
    evidenceIds?: string[];
  },
  agentId: string,
): FindingRecord {
  const now = new Date().toISOString();
  const cvss = input.cvssVector ? calculateCvss31(input.cvssVector) : null;
  const severity: FindingSeverity = input.severity ?? cvss?.severity ?? "medium";

  return {
    id: `FND-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
    title: input.title.trim(),
    severity,
    status: "draft",
    cvssVector: input.cvssVector,
    cvssScore: cvss?.score,
    target: input.target.trim(),
    category: input.category?.trim() || "Security Vulnerability",
    agentId,
    summary: redactEvidence(input.summary.trim()),
    impact: redactEvidence(input.impact.trim()),
    reproduction: redactEvidence(input.reproduction.trim()),
    remediation: input.remediation?.trim() || "Apply least-privilege authorization and strict server-side input validation.",
    evidenceIds: input.evidenceIds ?? [],
    triageGate: {
      inScope: true,
      reproducible: true,
      realSecurityImpact: severity !== "info",
      notAlwaysRejected: true,
      twoAccountOrOobProven: false,
      evidenceRedacted: true,
      cvssJustified: Boolean(cvss),
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function exportFindingsReport(
  session: SessionData,
  format: "hackerone" | "bugcrowd" | "redteam" = "redteam",
): string {
  const findings = session.findings.filter((f) => f.status !== "rejected");
  const counts = {
    critical: findings.filter((f) => f.severity === "critical").length,
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
    info: findings.filter((f) => f.severity === "info").length,
  };

  if (format === "hackerone" && findings.length > 0) {
    return findings
      .map(
        (f) => `# ${f.title}

**Severity:** ${f.severity.toUpperCase()}${f.cvssScore !== undefined ? ` (CVSS 3.1: ${f.cvssScore} — \`${f.cvssVector}\`)` : ""}
**Asset:** \`${f.target}\`
**Weakness / Category:** ${f.category}
**Finding ID:** \`${f.id}\`

## Summary
${redactEvidence(f.summary)}

## Steps To Reproduce
${redactEvidence(f.reproduction)}

## Impact
${redactEvidence(f.impact)}

## Supporting Evidence
${f.evidenceIds.length ? f.evidenceIds.map((e) => `- \`${e}\``).join("\n") : "- Recorded in session ledger."}

## Remediation
${f.remediation}
`,
      )
      .join("\n---\n\n");
  }

  if (format === "bugcrowd" && findings.length > 0) {
    const priorityMap: Record<FindingSeverity, string> = {
      critical: "P1 (Critical)",
      high: "P2 (High)",
      medium: "P3 (Medium)",
      low: "P4 (Low)",
      info: "P5 (Informational)",
    };
    return findings
      .map(
        (f) => `# ${f.title}

> **Requested Priority:** ${priorityMap[f.severity]}${f.cvssScore !== undefined ? ` | CVSS 3.1: ${f.cvssScore} (\`${f.cvssVector}\`)` : ""}
> **Target:** \`${f.target}\` | **VRT Category:** ${f.category}

### Severity Justification
${redactEvidence(f.impact)}

### Technical Description
${redactEvidence(f.summary)}

### Proof of Concept & Reproduction Steps
${redactEvidence(f.reproduction)}

### Evidence References (Sanitized)
${f.evidenceIds.length ? f.evidenceIds.map((e) => `- \`${e}\``).join("\n") : "- Session evidence attached."}

### Recommended Fix
${f.remediation}
`,
      )
      .join("\n---\n\n");
  }

  // Enterprise Red-Team Executive Deliverable
  const lines: string[] = [
    `# Offensive Security Assessment Report — ${session.scope.engagementName}`,
    "",
    `- **Session ID:** \`${session.id}\``,
    `- **Generated:** ${new Date().toISOString()}`,
    `- **Scope Mode:** \`${session.scope.mode.toUpperCase()}\``,
    `- **Authorized Targets:** ${session.scope.allow.length ? session.scope.allow.map((s) => `\`${s}\``).join(", ") : "_Workspace / Open_"}`,
    "",
    `## Executive Finding Summary`,
    "",
    `| Critical | High | Medium | Low | Info | Total |`,
    `|:---:|:---:|:---:|:---:|:---:|:---:|`,
    `| ${counts.critical} | ${counts.high} | ${counts.medium} | ${counts.low} | ${counts.info} | **${findings.length}** |`,
    "",
  ];

  if (findings.length === 0) {
    lines.push("_No validated findings have been recorded in this session yet._");
  } else {
    for (const f of findings) {
      lines.push(`---`);
      lines.push(`## [${f.severity.toUpperCase()}] ${f.id}: ${f.title}`);
      lines.push("");
      lines.push(`- **Target:** \`${f.target}\``);
      lines.push(`- **Category:** ${f.category}`);
      lines.push(`- **Discovering Agent:** \`@${f.agentId}\``);
      if (f.cvssVector) {
        lines.push(`- **CVSS 3.1:** **${f.cvssScore ?? "?"}** (\`${f.cvssVector}\`)`);
      }
      lines.push(`- **Status:** \`${f.status}\``);
      lines.push("");
      lines.push(`### Observations & Description`);
      lines.push(redactEvidence(f.summary));
      lines.push("");
      lines.push(`### Security Impact`);
      lines.push(redactEvidence(f.impact));
      lines.push("");
      lines.push(`### Proof of Concept`);
      lines.push(redactEvidence(f.reproduction));
      lines.push("");
      lines.push(`### Recommendation`);
      lines.push(f.remediation);
      lines.push("");
    }
  }

  return lines.join("\n");
}
