import fs from "node:fs";
import path from "node:path";

export function fsRead(
  workspace: string,
  filePath: string,
  startLine = 1,
  endLine?: number,
): string {
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(workspace, filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`File not found: ${abs}`);
  }
  const stat = fs.statSync(abs);
  if (stat.isDirectory()) {
    const entries = fs.readdirSync(abs, { withFileTypes: true }).slice(0, 200);
    return entries.map((e) => `${e.isDirectory() ? "[DIR] " : "[FILE]"} ${e.name}`).join("\n");
  }
  const content = fs.readFileSync(abs, "utf8");
  const lines = content.split(/\r?\n/);
  const s = Math.max(1, startLine);
  const e = Math.min(lines.length, endLine ?? s + 300);
  const slice = lines.slice(s - 1, e);
  return `File: ${abs} (lines ${s}-${e} of ${lines.length})\n` +
    slice.map((line, i) => `${String(s + i).padStart(5, " ")} | ${line}`).join("\n");
}

export function fsWrite(workspace: string, filePath: string, content: string): string {
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(workspace, filePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
  return `Wrote ${Buffer.byteLength(content, "utf8")} bytes to ${abs}`;
}

export interface FsEditResult {
  absPath: string;
  relativePath: string;
  added: number;
  removed: number;
  patch: string;
}

export function fsEdit(
  workspace: string,
  filePath: string,
  oldText: string,
  newText: string,
  replaceAll = false,
): FsEditResult {
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(workspace, filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`File not found: ${abs}`);
  }
  const original = fs.readFileSync(abs, "utf8");
  if (!oldText) {
    throw new Error("oldText cannot be empty");
  }
  const idx = original.indexOf(oldText);
  if (idx === -1) {
    throw new Error(`oldText not found in ${abs}`);
  }
  const updated = replaceAll
    ? original.split(oldText).join(newText)
    : original.slice(0, idx) + newText + original.slice(idx + oldText.length);

  fs.writeFileSync(abs, updated, "utf8");

  const rel = path.relative(workspace, abs) || abs;
  const oldLines = oldText.split(/\r?\n/);
  const newLines = newText.split(/\r?\n/);
  const beforeLines = original.slice(0, idx).split(/\r?\n/);
  const startLine = Math.max(1, beforeLines.length);

  const hunkHeader = `@@ -${startLine},${oldLines.length} +${startLine},${newLines.length} @@`;
  const patchLines = [
    `--- a/${rel}`,
    `+++ b/${rel}`,
    hunkHeader,
    ...oldLines.map((l) => `-${l}`),
    ...newLines.map((l) => `+${l}`),
  ];

  return {
    absPath: abs,
    relativePath: rel,
    added: newLines.length,
    removed: oldLines.length,
    patch: patchLines.join("\n"),
  };
}

export function fsGrep(
  workspace: string,
  pattern: string,
  targetPath = ".",
  maxMatches = 80,
): string {
  const root = path.isAbsolute(targetPath) ? targetPath : path.resolve(workspace, targetPath);
  if (!fs.existsSync(root)) {
    throw new Error(`Path not found: ${root}`);
  }

  let rx: RegExp;
  try {
    rx = new RegExp(pattern, "i");
  } catch {
    rx = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  }

  const results: string[] = [];
  const queue = [root];

  while (queue.length > 0 && results.length < maxMatches) {
    const current = queue.shift()!;
    let stat: fs.Stats;
    try {
      stat = fs.statSync(current);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      let ents: fs.Dirent[];
      try {
        ents = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const ent of ents) {
        if (ent.name === "node_modules" || ent.name === ".git" || ent.name === "dist") continue;
        queue.push(path.join(current, ent.name));
      }
    } else if (stat.isFile() && stat.size < 4 * 1024 * 1024) {
      let text: string;
      try {
        text = fs.readFileSync(current, "utf8");
      } catch {
        continue;
      }
      if (text.includes("\0")) continue; // skip binary
      const lines = text.split(/\r?\n/);
      const rel = path.relative(workspace, current) || current;
      for (let i = 0; i < lines.length && results.length < maxMatches; i++) {
        if (rx.test(lines[i])) {
          results.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
        }
      }
    }
  }

  if (results.length === 0) return `No matches for /${pattern}/ in ${root}`;
  return results.join("\n");
}

export function fsGlob(workspace: string, substring = "", maxFiles = 150): string {
  const root = path.resolve(workspace);
  const out: string[] = [];
  const queue = [root];
  const needle = substring.toLowerCase().replace(/\*/g, "");

  while (queue.length > 0 && out.length < maxFiles) {
    const dir = queue.shift()!;
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of ents) {
      if (out.length >= maxFiles) break;
      if (ent.name === "node_modules" || ent.name === ".git") continue;
      const full = path.join(dir, ent.name);
      const rel = path.relative(root, full);
      if (ent.isDirectory()) {
        queue.push(full);
      } else if (!needle || rel.toLowerCase().includes(needle)) {
        out.push(rel);
      }
    }
  }
  return out.length ? out.join("\n") : `No files matched "${substring}" in ${root}`;
}
