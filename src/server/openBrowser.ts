import { spawn } from "node:child_process";

export function openInBrowser(url: string): { launched: boolean; method: string; error?: string } {
  try {
    if (process.platform === "win32") {
      const child = spawn("cmd.exe", ["/c", "start", "", url], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      child.unref();
      return { launched: true, method: "cmd /c start" };
    }

    if (process.platform === "darwin") {
      const child = spawn("open", [url], { detached: true, stdio: "ignore" });
      child.unref();
      return { launched: true, method: "open" };
    }

    const child = spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
    child.unref();
    return { launched: true, method: "xdg-open" };
  } catch (err) {
    return {
      launched: false,
      method: process.platform,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
