import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { CustomProviderInput, YedoguEngine } from "../agents/orchestrator.js";
import { calculateCvss31 } from "../tools/findings.js";
import { formatFriendlyError } from "../providers/errors.js";
import { probeCustomEndpointModels } from "../providers/registry.js";
import { renderWarRoomHtml } from "../web/ui.js";
import { getWebTuiCssBundle } from "../web/assets.js";
import type { ChatAttachmentInput, HarnessEvent, ReasoningEffort } from "../types.js";

function runPickerCmd(
  cmd: string,
  args: string[],
  timeoutMs = 120000,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        const execErr = err as NodeJS.ErrnoException & { code?: number | string };
        if (execErr.code === "ENOENT") {
          reject(err);
          return;
        }
        resolve({
          stdout: String(stdout || "").trim(),
          stderr: String(stderr || "").trim(),
          code: typeof execErr.code === "number" ? execErr.code : 1,
        });
        return;
      }
      resolve({
        stdout: String(stdout || "").trim(),
        stderr: String(stderr || "").trim(),
        code: 0,
      });
    });
  });
}

function buildWin32FolderPickerScript(initialPath: string): string {
  const escaped = initialPath.replace(/'/g, "''");
  return [
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    `$initialPath = '${escaped}'`,
    "$selected = $null",
    "try {",
    "  $cs = @'",
    "using System;",
    "using System.Runtime.InteropServices;",
    "public static class YedoguFolderPicker {",
    '  [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();',
    "  [ComImport, Guid(\"DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7\")] private class FileOpenDialogRCW {}",
    "  [ComImport, Guid(\"42f85136-db7e-439c-85f1-e4075d135fc8\"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]",
    "  private interface IFileOpenDialog {",
    "    [PreserveSig] int Show(IntPtr parent);",
    "    void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);",
    "    void SetFileTypeIndex(uint iFileType);",
    "    void GetFileTypeIndex(out uint piFileType);",
    "    void Advise(IntPtr pfde, out uint pdwCookie);",
    "    void Unadvise(uint dwCookie);",
    "    void SetOptions(uint fos);",
    "    void GetOptions(out uint pfos);",
    "    void SetDefaultFolder(IShellItem psi);",
    "    void SetFolder(IShellItem psi);",
    "    void GetFolder(out IShellItem ppsi);",
    "    void GetCurrentSelection(out IShellItem ppsi);",
    "    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);",
    "    void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);",
    "    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);",
    "    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);",
    "    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);",
    "    void GetResult(out IShellItem ppsi);",
    "  }",
    "  [ComImport, Guid(\"43826d1e-e718-42ee-bc55-a1e261c37bfe\"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]",
    "  private interface IShellItem {",
    "    void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);",
    "    void GetParent(out IShellItem ppsi);",
    "    void GetDisplayName(uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);",
    "    void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);",
    "    void Compare(IShellItem psi, uint hint, out int piOrder);",
    "  }",
    '  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = true)]',
    "  private static extern int SHCreateItemFromParsingName(string pszPath, IntPtr pbc, ref Guid riid, out IShellItem ppv);",
    "  public static string Pick(string initialPath) {",
    "    var dlg = (IFileOpenDialog)new FileOpenDialogRCW();",
    "    uint opts; dlg.GetOptions(out opts);",
    "    dlg.SetOptions(opts | 0x20 | 0x40); // FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM",
    '    dlg.SetTitle("Select Project Folder");',
    "    if (!string.IsNullOrWhiteSpace(initialPath)) {",
    '      Guid iid = new Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe");',
    "      IShellItem item;",
    "      if (SHCreateItemFromParsingName(initialPath, IntPtr.Zero, ref iid, out item) == 0 && item != null) {",
    "        dlg.SetFolder(item);",
    "      }",
    "    }",
    "    int hr = dlg.Show(GetForegroundWindow());",
    "    if (hr != 0) return null;",
    "    IShellItem result;",
    "    dlg.GetResult(out result);",
    "    if (result == null) return null;",
    "    string path;",
    "    result.GetDisplayName(0x80058000, out path); // SIGDN_FILESYSPATH",
    "    return path;",
    "  }",
    "}",
    "'@",
    "  Add-Type -TypeDefinition $cs -ErrorAction Stop | Out-Null",
    "  $selected = [YedoguFolderPicker]::Pick($initialPath)",
    "} catch {",
    "  Add-Type -AssemblyName System.Windows.Forms",
    "  Add-Type -AssemblyName System.Drawing",
    "  $owner = New-Object System.Windows.Forms.Form",
    "  $owner.Opacity = 0",
    "  $owner.ShowInTaskbar = $false",
    "  $owner.TopMost = $true",
    "  $owner.StartPosition = 'Manual'",
    "  $owner.Location = New-Object System.Drawing.Point(-32000, -32000)",
    "  $owner.Show()",
    "  $owner.Activate()",
    "  $dlg = New-Object System.Windows.Forms.FolderBrowserDialog",
    "  $dlg.Description = 'Select Project Folder'",
    "  $dlg.ShowNewFolderButton = $true",
    "  if (Test-Path -LiteralPath $initialPath) { $dlg.SelectedPath = $initialPath }",
    "  if ($dlg.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { $selected = $dlg.SelectedPath }",
    "  $dlg.Dispose()",
    "  $owner.Dispose()",
    "}",
    "if ($selected) { Write-Output $selected }",
  ].join("\n");
}

async function pickNativeFolder(initialPath: string): Promise<string | null> {
  if (process.platform === "win32") {
    const psScript = buildWin32FolderPickerScript(initialPath);
    const encoded = Buffer.from(psScript, "utf16le").toString("base64");
    const res = await runPickerCmd("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-STA",
      "-EncodedCommand",
      encoded,
    ]);
    if (res.code !== 0 && res.stderr) {
      throw new Error(res.stderr);
    }
    return res.stdout ? res.stdout : null;
  }

  if (process.platform === "darwin") {
    const escaped = initialPath.replace(/"/g, '\\"');
    const res = await runPickerCmd("osascript", [
      "-e",
      `POSIX path of (choose folder with prompt "Select Project Folder" default location POSIX file "${escaped}")`,
    ]);
    return res.code === 0 && res.stdout ? res.stdout.replace(/\/+$/, "") || "/" : null;
  }

  try {
    const zen = await runPickerCmd("zenity", [
      "--file-selection",
      "--directory",
      "--title=Select Project Folder",
      `--filename=${initialPath.replace(/\/?$/, "/")}`,
    ]);
    if (zen.code === 0 && zen.stdout) return zen.stdout;
    return null;
  } catch {
    const kd = await runPickerCmd("kdialog", ["--getexistingdirectory", initialPath]);
    return kd.code === 0 && kd.stdout ? kd.stdout : null;
  }
}

function readJsonBody(req: http.IncomingMessage): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk: Buffer) => {
      raw += chunk.toString("utf8");
      if (raw.length > 5 * 1024 * 1024) {
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  });
  res.end(body);
}

export class YedoguDaemon {
  private server: http.Server | null = null;
  private sseClients = new Set<http.ServerResponse>();
  public url = "";
  public port = 0;

  constructor(private readonly engine: YedoguEngine) {
    this.engine.on("event", (evt: HarnessEvent) => {
      this.broadcast(evt);
    });
  }

  private broadcast(evt: HarnessEvent): void {
    const payload = `event: ${evt.type}\ndata: ${JSON.stringify(evt)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(payload);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  public async start(preferredPort = 0, hostname = "127.0.0.1"): Promise<string> {
    if (this.server && this.url) return this.url;

    this.server = http.createServer(async (req, res) => {
      try {
        await this.handleRequest(req, res);
      } catch (err) {
        sendJson(res, 500, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(preferredPort, hostname, () => {
        const addr = this.server!.address() as AddressInfo;
        this.port = addr.port;
        this.url = `http://${hostname === "0.0.0.0" ? "127.0.0.1" : hostname}:${addr.port}`;
        this.engine.daemonUrl = this.url;
        resolve();
      });
    });

    return this.url;
  }

  public async stop(): Promise<void> {
    await this.engine.channels.stopAll().catch(() => {});
    for (const c of this.sseClients) {
      try {
        c.end();
      } catch {
        // ignore
      }
    }
    this.sseClients.clear();
    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
      this.server = null;
    }
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const method = (req.method || "GET").toUpperCase();
    const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    const pathname = parsedUrl.pathname;

    if (method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      });
      res.end();
      return;
    }

    // Serve the Official WebTUI CSS + Plugins + Themes Bundle
    if (method === "GET" && pathname === "/assets/webtui.css") {
      const css = getWebTuiCssBundle();
      res.writeHead(200, {
        "Content-Type": "text/css; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      });
      res.end(css);
      return;
    }

    // Serve the Browser War-Room UI
    if (method === "GET" && (pathname === "/" || pathname === "/index.html")) {
      const html = renderWarRoomHtml(this.engine.session.id);
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(html);
      return;
    }

    // SSE Live Event Stream
    if (method === "GET" && pathname === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      res.write(`event: connected\ndata: ${JSON.stringify({ sessionId: this.engine.session.id })}\n\n`);
      this.sseClients.add(res);
      const keepAlive = setInterval(() => {
        try {
          res.write(": ping\n\n");
        } catch {
          clearInterval(keepAlive);
          this.sseClients.delete(res);
        }
      }, 15000);
      req.on("close", () => {
        clearInterval(keepAlive);
        this.sseClients.delete(res);
      });
      return;
    }

    // Health
    if (method === "GET" && pathname === "/api/health") {
      sendJson(res, 200, { ok: true, name: "yedogu", version: "1.0.0", sessionId: this.engine.session.id });
      return;
    }

    // Full State Snapshot
    if (method === "GET" && pathname === "/api/state") {
      const snap = await this.engine.getSnapshot();
      sendJson(res, 200, snap);
      return;
    }

    // Chat prompt
    if (method === "POST" && pathname === "/api/chat") {
      const body = await readJsonBody(req);
      const message = String(body.message || "").trim();
      const rawAtts = Array.isArray(body.attachments) ? body.attachments : [];
      const attachments: ChatAttachmentInput[] = rawAtts
        .filter((a: any) => a && typeof a.name === "string" && typeof a.content === "string")
        .slice(0, 8)
        .map((a: any) => ({
          name: String(a.name).slice(0, 200),
          mimeType: String(a.mimeType || "application/octet-stream").slice(0, 120),
          size: Number(a.size || 0),
          content: String(a.content),
          encoding: a.encoding === "base64" ? "base64" : "utf8",
        }));
      if (!message && attachments.length === 0) return sendJson(res, 400, { error: "Missing message" });
      const agentId = typeof body.agentId === "string" ? body.agentId : undefined;
      // Fire asynchronously so browser gets immediate ACK and streams via SSE
      this.engine.sendPrompt(message, agentId, undefined, attachments).catch((err) => {
        this.engine.emitEvent("system.notice", {
          level: "error",
          message: formatFriendlyError(err),
        });
      });
      sendJson(res, 202, { accepted: true });
      return;
    }

    // Abort active generation
    if (method === "POST" && pathname === "/api/abort") {
      sendJson(res, 200, { aborted: this.engine.abortActive() });
      return;
    }

    // Update theme (synced between Terminal TUI and WebTUI Browser War-Room)
    if (method === "POST" && pathname === "/api/theme") {
      const body = await readJsonBody(req);
      const theme = String(body.theme || "claude").trim();
      sendJson(res, 200, { theme: this.engine.setTheme(theme) });
      return;
    }

    // Launch Parallel Swarm
    if (method === "POST" && pathname === "/api/swarm") {
      const body = await readJsonBody(req);
      const tasks = Array.isArray(body.tasks) ? body.tasks : [];
      if (tasks.length === 0) return sendJson(res, 400, { error: "Provide tasks: [{agent, objective}]" });
      this.engine
        .runSwarm(tasks)
        .then((summary) => {
          this.engine.emitEvent("system.notice", { level: "info", message: `Swarm completed (${tasks.length} workers).` });
          this.engine.session.messages.push({
            id: `msg_sw_${Date.now().toString(36)}`,
            role: "assistant",
            agentId: "commander",
            content: summary,
            timestamp: new Date().toISOString(),
          });
          this.engine.persist();
          this.engine.emitEvent("session.updated", { swarmCompleted: true });
        })
        .catch((err) => {
          this.engine.emitEvent("system.notice", {
            level: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        });
      sendJson(res, 202, { accepted: true, workers: tasks.length });
      return;
    }

    // Switch Active Agent
    if (method === "POST" && pathname === "/api/agent") {
      const body = await readJsonBody(req);
      const agent = this.engine.setActiveAgent(String(body.agentId || "commander"));
      sendJson(res, 200, { agent });
      return;
    }

    // Set Global or Per-Agent Model and/or Reasoning Effort
    if (method === "POST" && pathname === "/api/model") {
      const body = await readJsonBody(req);
      const agentId = typeof body.agentId === "string" && body.agentId ? body.agentId : undefined;
      const model = typeof body.model === "string" && body.model.trim()
        ? this.engine.setModel(body.model, agentId)
        : this.engine.session.activeModel;
      const reasoningEffort = typeof body.reasoningEffort === "string" && body.reasoningEffort
        ? this.engine.setReasoningEffort(body.reasoningEffort as ReasoningEffort)
        : (this.engine.session.reasoningEffort || this.engine.config.reasoningEffort || "medium");
      sendJson(res, 200, { model, reasoningEffort, agentId: agentId || null });
      return;
    }

    // Connect Provider Credentials
    if (method === "POST" && pathname === "/api/providers/connect") {
      const body = await readJsonBody(req);
      this.engine.connectProvider(
        String(body.providerId || ""),
        String(body.apiKey || ""),
        typeof body.baseUrl === "string" ? body.baseUrl : undefined,
      );
      const pid = String(body.providerId || "").trim().toLowerCase();
      await this.engine.refreshProviderModels(pid).catch(() => {});
      const updated = this.engine.getProviders().find((p) => p.id === pid);
      sendJson(res, 200, { provider: updated ? { ...updated, apiKey: "••••", connected: true } : null });
      return;
    }

    // Disconnect Provider Credentials
    if (method === "POST" && pathname === "/api/providers/disconnect") {
      const body = await readJsonBody(req);
      const pid = String(body.providerId || "").trim().toLowerCase();
      const result = this.engine.disconnectProvider(pid, {
        removeCliAuth: Boolean(body.removeCliAuth),
      });
      sendJson(res, 200, {
        providerId: pid,
        removedConfig: result.removedConfig,
        removedCliAuth: result.removedCliAuth,
        stillConnectedViaEnv: result.stillConnectedViaEnv,
      });
      return;
    }

    // Refresh Live Models for Connected Providers
    if (method === "POST" && pathname === "/api/providers/refresh") {
      const body = await readJsonBody(req);
      const pid = typeof body.providerId === "string" && body.providerId ? body.providerId : undefined;
      const results = await this.engine.refreshProviderModels(pid);
      sendJson(res, 200, { refreshed: results });
      return;
    }

    // Add or Edit Custom Provider
    if ((method === "POST" || method === "PATCH") && pathname === "/api/providers/custom") {
      const body = await readJsonBody(req);
      try {
        const fields: Partial<Omit<CustomProviderInput, "id">> = {
          name: body.name === undefined ? undefined : String(body.name),
          protocol: body.protocol,
          baseUrl: body.baseUrl === undefined ? undefined : String(body.baseUrl),
          apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
          defaultModel: body.defaultModel === undefined ? undefined : String(body.defaultModel),
          models: body.models,
        };
        const id = String(body.id || "");
        const provider = method === "PATCH"
          ? this.engine.updateCustomProvider(id, fields)
          : this.engine.addCustomProvider({
              ...fields,
              id,
              name: fields.name ?? "",
              protocol: fields.protocol ?? "openai",
              baseUrl: fields.baseUrl ?? "",
              defaultModel: fields.defaultModel ?? "default",
            });
        sendJson(res, 200, { provider: { ...provider, apiKey: provider.apiKey ? "••••" : undefined } });
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    // Probe Custom Provider Endpoint for Live Available Models
    if (method === "POST" && pathname === "/api/providers/probe") {
      const body = await readJsonBody(req);
      const protocol = body.protocol === "anthropic" || body.protocol === "gemini" ? body.protocol : "openai";
      const baseUrl = String(body.baseUrl || "").trim();
      if (!baseUrl) {
        sendJson(res, 400, { ok: false, models: [], error: "Missing endpoint URL" });
        return;
      }
      const apiKey = typeof body.apiKey === "string" ? body.apiKey : undefined;
      const probed = await probeCustomEndpointModels({ protocol, baseUrl, apiKey });
      sendJson(res, 200, { ok: probed.live, models: probed.models, error: probed.error });
      return;
    }

    // Delete Custom Provider
    if (method === "DELETE" && pathname.startsWith("/api/providers/custom/")) {
      const id = decodeURIComponent(pathname.slice("/api/providers/custom/".length)).trim().toLowerCase();
      if (!id) {
        sendJson(res, 400, { error: "Missing custom provider ID" });
        return;
      }
      const deleted = this.engine.deleteCustomProvider(id);
      if (!deleted) {
        sendJson(res, 404, { error: `Custom provider "${id}" was not found.` });
        return;
      }
      sendJson(res, 200, { deleted: true, id });
      return;
    }

    // Update Scope
    if (method === "POST" && pathname === "/api/scope") {
      const body = await readJsonBody(req);
      if (body.action === "add" && body.rule) {
        const scope = this.engine.addScopeRule(body.kind === "deny" ? "deny" : "allow", String(body.rule));
        return sendJson(res, 200, { scope });
      }
      if (body.action === "remove" && body.rule) {
        const scope = this.engine.removeScopeRule(body.kind === "deny" ? "deny" : "allow", String(body.rule));
        return sendJson(res, 200, { scope });
      }
      const scope = this.engine.updateScope({
        mode: body.mode === "enforced" ? "enforced" : body.mode === "advisory" ? "advisory" : undefined,
        engagementName: typeof body.engagementName === "string" ? body.engagementName : undefined,
      });
      sendJson(res, 200, { scope });
      return;
    }

    // HTTP Forge Send
    if (method === "POST" && pathname === "/api/http/send") {
      const body = await readJsonBody(req);
      const result = await this.engine.runDirectHttp({
        method: String(body.method || "GET"),
        url: String(body.url || ""),
        headers: (body.headers as Record<string, string>) || {},
        body: typeof body.body === "string" && body.body.length > 0 ? body.body : undefined,
        followRedirects: body.followRedirects !== false,
      });
      sendJson(res, 200, result);
      return;
    }

    // Binary Triage
    if (method === "POST" && pathname === "/api/re/triage") {
      const body = await readJsonBody(req);
      const summary = this.engine.runDirectBinaryTriage(String(body.path || ""));
      sendJson(res, 200, { artifact: summary });
      return;
    }

    // JS Recon
    if (method === "POST" && pathname === "/api/re/js-recon") {
      const body = await readJsonBody(req);
      const result = this.engine.runDirectJsRecon(String(body.path || this.engine.session.workspace));
      sendJson(res, 200, { recon: result });
      return;
    }

    // Findings CRUD & CVSS
    if (method === "POST" && pathname === "/api/findings") {
      const body = await readJsonBody(req);
      const finding = this.engine.addDirectFinding({
        title: String(body.title || "Untitled Finding"),
        severity: body.severity,
        cvssVector: body.cvssVector,
        target: String(body.target || this.engine.session.workspace),
        category: body.category,
        summary: String(body.summary || ""),
        impact: String(body.impact || ""),
        reproduction: String(body.reproduction || ""),
        remediation: body.remediation,
        evidenceIds: Array.isArray(body.evidenceIds) ? body.evidenceIds : [],
      });
      sendJson(res, 201, { finding });
      return;
    }

    if (method === "PATCH" && pathname.startsWith("/api/findings/")) {
      const id = decodeURIComponent(pathname.slice("/api/findings/".length));
      const body = await readJsonBody(req);
      const finding = this.engine.updateFindingStatus(id, body);
      sendJson(res, 200, { finding });
      return;
    }

    if (method === "POST" && pathname === "/api/cvss") {
      const body = await readJsonBody(req);
      const result = calculateCvss31(String(body.vector || ""));
      sendJson(res, 200, { result });
      return;
    }

    // Export Report
    if (method === "GET" && pathname === "/api/report") {
      const fmt = (parsedUrl.searchParams.get("format") as "hackerone" | "bugcrowd" | "redteam") || "redteam";
      const markdown = this.engine.getReport(fmt);
      sendJson(res, 200, { format: fmt, markdown });
      return;
    }

    // Browse local directories for project folder picker
    if (method === "GET" && pathname === "/api/fs/browse") {
      const rawPath = parsedUrl.searchParams.get("path");
      const target = path.resolve(rawPath || this.engine.session.workspace);
      if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
        return sendJson(res, 400, { error: `Not a directory: ${target}` });
      }
      const entries: Array<{ name: string; path: string }> = [];
      try {
        const dirents = fs.readdirSync(target, { withFileTypes: true });
        for (const d of dirents) {
          if (d.isDirectory()) {
            entries.push({ name: d.name, path: path.join(target, d.name) });
          }
        }
        entries.sort((a, b) => a.name.localeCompare(b.name));
      } catch (err) {
        return sendJson(res, 403, { error: err instanceof Error ? err.message : String(err) });
      }
      const parentDir = path.dirname(target);
      sendJson(res, 200, {
        current: target,
        parent: parentDir !== target ? parentDir : null,
        home: os.homedir(),
        workspace: this.engine.session.workspace,
        entries: entries.slice(0, 200),
      });
      return;
    }

    // Native OS folder picker dialog
    if (method === "POST" && pathname === "/api/fs/pick-folder") {
      const body = await readJsonBody(req);
      const rawInit = typeof body.initialPath === "string" && body.initialPath.trim()
        ? path.resolve(body.initialPath.trim())
        : this.engine.session.workspace;
      const initialPath = fs.existsSync(rawInit) && fs.statSync(rawInit).isDirectory()
        ? rawInit
        : os.homedir();

      try {
        const picked = await pickNativeFolder(initialPath);
        sendJson(res, 200, { path: picked, cancelled: !picked });
      } catch (err) {
        sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    // Projects CRUD & Clear Chats
    if (method === "POST" && pathname === "/api/projects") {
      const body = await readJsonBody(req);
      try {
        const result = this.engine.createProject({
          name: typeof body.name === "string" ? body.name : undefined,
          folder: String(body.folder || ""),
        });
        sendJson(res, 201, result);
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    if (pathname.startsWith("/api/projects/")) {
      const tail = pathname.slice("/api/projects/".length);
      const [rawId, action] = tail.split("/");
      const id = decodeURIComponent(rawId || "");

      if (method === "PATCH" && id && !action) {
        const body = await readJsonBody(req);
        try {
          const project = this.engine.updateProject(id, {
            name: typeof body.name === "string" ? body.name : undefined,
            folder: typeof body.folder === "string" ? body.folder : undefined,
          });
          sendJson(res, 200, { project });
        } catch (err) {
          sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
        }
        return;
      }

      if (method === "POST" && id && action === "clear-chats") {
        try {
          const result = this.engine.clearProjectChats(id);
          sendJson(res, 200, result);
        } catch (err) {
          sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
        }
        return;
      }

      if (method === "DELETE" && id && !action) {
        try {
          const result = this.engine.deleteProject(id);
          sendJson(res, 200, result);
        } catch (err) {
          sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
        }
        return;
      }
    }

    // Session Switch / New / Rename / Pin / Delete
    if (method === "POST" && pathname === "/api/session/new") {
      const body = await readJsonBody(req);
      const session = this.engine.newSession(
        typeof body.name === "string" ? body.name : undefined,
        typeof body.projectId === "string" ? body.projectId : undefined,
      );
      sendJson(res, 200, { session });
      return;
    }

    if (method === "POST" && pathname === "/api/session/switch") {
      const body = await readJsonBody(req);
      const session = this.engine.switchSession(String(body.sessionId || ""));
      sendJson(res, 200, { session });
      return;
    }

    if (pathname.startsWith("/api/session/")) {
      const id = decodeURIComponent(pathname.slice("/api/session/".length));
      if (id && id !== "new" && id !== "switch") {
        if (method === "PATCH") {
          const body = await readJsonBody(req);
          try {
            const session = this.engine.updateSession(id, {
              name: typeof body.name === "string" ? body.name : undefined,
              pinned: typeof body.pinned === "boolean" ? body.pinned : undefined,
            });
            sendJson(res, 200, { session });
          } catch (err) {
            sendJson(res, 404, { error: err instanceof Error ? err.message : String(err) });
          }
          return;
        }
        if (method === "DELETE") {
          const result = this.engine.deleteSessionById(id);
          sendJson(res, 200, result);
          return;
        }
      }
    }

    if (method === "POST" && pathname === "/api/mcp/connect") {
      const body = await readJsonBody(req);
      const tools = await this.engine.connectMcpServer(String(body.name || ""));
      sendJson(res, 200, { connected: true, tools });
      return;
    }

    // Messaging Channels / Remote Bots (Telegram, Discord, Slack, Generic Webhook)
    if (method === "GET" && pathname === "/api/channels") {
      sendJson(res, 200, { channels: this.engine.channels.getPublicViews() });
      return;
    }

    if (method === "POST" && pathname === "/api/channels") {
      const body = await readJsonBody(req);
      const created = this.engine.channels.upsertChannel({
        id: typeof body.id === "string" && body.id.trim() ? body.id : undefined,
        name: typeof body.name === "string" ? body.name : undefined,
        platform: body.platform,
        token: typeof body.token === "string" ? body.token : undefined,
        appToken: typeof body.appToken === "string" ? body.appToken : undefined,
        callbackUrl: typeof body.callbackUrl === "string" ? body.callbackUrl : undefined,
        defaultAgent: typeof body.defaultAgent === "string" ? body.defaultAgent : undefined,
        allowedUsers: Array.isArray(body.allowedUsers) ? body.allowedUsers.map(String) : undefined,
        allowedChats: Array.isArray(body.allowedChats) ? body.allowedChats.map(String) : undefined,
        allowAll: typeof body.allowAll === "boolean" ? body.allowAll : undefined,
        requireMentionInGroups:
          typeof body.requireMentionInGroups === "boolean" ? body.requireMentionInGroups : undefined,
        autoStart: typeof body.autoStart === "boolean" ? body.autoStart : undefined,
      });

      const rawCfg = this.engine.channels.getConfig(created.id);
      let channelView = created;
      if (body.connectNow !== false) {
        channelView = await this.engine.channels.startChannel(created.id);
      }

      sendJson(res, 201, {
        channel: channelView,
        // Expose generated webhook secret once on creation so operator can configure their bridge
        webhookSecret: created.platform === "webhook" ? rawCfg?.token : undefined,
      });
      return;
    }

    // Inbound Generic Webhook Bridge: POST /api/channels/webhook/:id
    if (method === "POST" && pathname.startsWith("/api/channels/webhook/")) {
      const id = decodeURIComponent(pathname.slice("/api/channels/webhook/".length));
      const body = await readJsonBody(req);
      const result = await this.engine.channels.handleWebhookRequest(
        id,
        req.headers as Record<string, string | string[] | undefined>,
        body,
      );
      sendJson(res, result.statusCode, result.payload);
      return;
    }

    if (pathname.startsWith("/api/channels/")) {
      const tail = pathname.slice("/api/channels/".length);
      const [rawId, action] = tail.split("/");
      const id = decodeURIComponent(rawId || "");

      if (method === "DELETE" && id && !action) {
        const deleted = await this.engine.channels.deleteChannel(id);
        if (!deleted) return sendJson(res, 404, { error: `Channel not found: ${id}` });
        sendJson(res, 200, { deleted: true, id });
        return;
      }

      if (method === "POST" && id && action === "start") {
        const channel = await this.engine.channels.startChannel(id);
        sendJson(res, 200, { channel });
        return;
      }

      if (method === "POST" && id && action === "stop") {
        const channel = await this.engine.channels.stopChannel(id);
        if (!channel) return sendJson(res, 404, { error: `Channel not found: ${id}` });
        sendJson(res, 200, { channel });
        return;
      }

      if (method === "POST" && id && action === "pair-code") {
        const pairingCode = this.engine.channels.rotatePairingCode(id);
        sendJson(res, 200, { id, pairingCode });
        return;
      }

      if (method === "POST" && id && action === "access") {
        const body = await readJsonBody(req);
        const channel = this.engine.channels.updateAccessControl(id, {
          addUser: typeof body.addUser === "string" ? body.addUser : undefined,
          removeUser: typeof body.removeUser === "string" ? body.removeUser : undefined,
          addChat: typeof body.addChat === "string" ? body.addChat : undefined,
          removeChat: typeof body.removeChat === "string" ? body.removeChat : undefined,
          allowAll: typeof body.allowAll === "boolean" ? body.allowAll : undefined,
          requireMentionInGroups:
            typeof body.requireMentionInGroups === "boolean" ? body.requireMentionInGroups : undefined,
          defaultAgent: typeof body.defaultAgent === "string" ? body.defaultAgent : undefined,
        });
        sendJson(res, 200, { channel });
        return;
      }
    }

    sendJson(res, 404, { error: `Not found: ${method} ${pathname}` });
  }
}
