import { spawn } from "node:child_process";

export interface ShellExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

export async function executeShell(
  command: string,
  cwd: string,
  timeoutMs = 60000,
): Promise<ShellExecResult> {
  const start = Date.now();
  return new Promise((resolve) => {
    const isWin = process.platform === "win32";
    const shellBin = isWin ? "powershell.exe" : "/bin/sh";
    const shellArgs = isWin ? ["-NoProfile", "-Command", command] : ["-c", command];

    const child = spawn(shellBin, shellArgs, {
      cwd,
      env: process.env,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const MAX_CAP = 128 * 1024;

    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length < MAX_CAP) stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < MAX_CAP) stderr += chunk.toString("utf8");
    });

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: code ?? (timedOut ? 124 : 1),
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        durationMs: Date.now() - start,
        timedOut,
      });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        exitCode: 1,
        stdout: stdout.trim(),
        stderr: err.message,
        durationMs: Date.now() - start,
        timedOut: false,
      });
    });
  });
}
