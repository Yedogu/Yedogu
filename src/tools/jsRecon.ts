import fs from "node:fs";
import path from "node:path";

export interface JsReconResult {
  targetPath: string;
  filesScanned: number;
  bytesScanned: number;
  endpoints: string[];
  urls: string[];
  websockets: string[];
  graphqlOps: string[];
  sourceMaps: string[];
  dangerousSinks: Array<{ file: string; sink: string; count: number }>;
  secrets: Array<{ file: string; type: string; preview: string }>;
}

const SECRET_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: "AWS Access Key ID", regex: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { name: "Google API Key", regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: "GitHub PAT", regex: /\bgh[pousr]_[A-Za-z0-9]{24,}\b/g },
  { name: "Stripe Live/Test Key", regex: /\b[sr]k_(?:live|test)_[0-9a-zA-Z]{20,}\b/g },
  { name: "Anthropic API Key", regex: /\bsk-ant-[A-Za-z0-9_-]{24,}\b/g },
  { name: "OpenAI API Key", regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/g },
  { name: "Slack Token", regex: /\bxox[baprs]-[0-9A-Za-z-]{10,48}\b/g },
  { name: "JWT Token", regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { name: "Private Key Block", regex: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g },
  { name: "Firebase URL", regex: /https?:\/\/[a-z0-9-]+\.firebaseio\.com\b/gi },
  { name: "S3 Bucket URL", regex: /https?:\/\/[a-z0-9.-]+\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com\b/gi },
  { name: "Database Connection URI", regex: /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"'`]{8,}/gi },
  { name: "Hardcoded Bearer Token", regex: /["']Bearer\s+[A-Za-z0-9._-]{20,}["']/g },
  { name: "Slack/Discord Webhook", regex: /https:\/\/(?:hooks\.slack\.com\/services|discord(?:app)?\.com\/api\/webhooks)\/[^\s"'`]+/gi },
];

const DANGEROUS_SINKS: Array<{ name: string; regex: RegExp }> = [
  { name: "dangerouslySetInnerHTML", regex: /\bdangerouslySetInnerHTML\b/g },
  { name: "innerHTML / outerHTML", regex: /\.(?:innerHTML|outerHTML)\s*=/g },
  { name: "eval / new Function", regex: /\b(?:eval\s*\(|new\s+Function\s*\()/g },
  { name: "document.write", regex: /\bdocument\.write(?:ln)?\s*\(/g },
  { name: "postMessage listener", regex: /addEventListener\s*\(\s*["']message["']/g },
  { name: "child_process exec/spawn", regex: /\b(?:child_process|execSync|execFile|spawnSync)\b/g },
  { name: "__proto__ / prototype", regex: /\b__proto__\b/g },
  { name: "electron nodeIntegration", regex: /\bnodeIntegration\s*:\s*true\b/g },
];

const JS_EXTS = new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".map", ".html", ".json"]);

function collectFiles(target: string, maxFiles = 200): string[] {
  const out: string[] = [];
  if (!fs.existsSync(target)) return out;
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];

  const queue: string[] = [target];
  while (queue.length > 0 && out.length < maxFiles) {
    const dir = queue.shift()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (out.length >= maxFiles) break;
      if (ent.name === "node_modules" || ent.name === ".git" || ent.name === "dist") continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        queue.push(full);
      } else if (ent.isFile() && JS_EXTS.has(path.extname(ent.name).toLowerCase())) {
        out.push(full);
      }
    }
  }
  return out;
}

function maskPreview(val: string): string {
  if (val.length <= 16) return `${val.slice(0, 4)}***`;
  return `${val.slice(0, 10)}...${val.slice(-4)} (${val.length} chars)`;
}

export function runJsRecon(targetPath: string): JsReconResult {
  const abs = path.resolve(targetPath);
  const files = collectFiles(abs);

  const endpoints = new Set<string>();
  const urls = new Set<string>();
  const websockets = new Set<string>();
  const graphqlOps = new Set<string>();
  const sourceMaps = new Set<string>();
  const dangerousSinks: JsReconResult["dangerousSinks"] = [];
  const secrets: JsReconResult["secrets"] = [];
  const secretDedup = new Set<string>();

  let bytesScanned = 0;

  for (const file of files) {
    let text: string;
    try {
      const st = fs.statSync(file);
      if (st.size > 15 * 1024 * 1024) continue; // skip >15MB single files
      text = fs.readFileSync(file, "utf8");
      bytesScanned += st.size;
    } catch {
      continue;
    }

    const rel = path.relative(abs, file) || path.basename(file);

    // Source maps
    for (const m of text.matchAll(/\/\/[#@]\s*sourceMappingURL=([^\s]+)/g)) {
      sourceMaps.add(`${rel} -> ${m[1]}`);
    }

    // API paths
    for (const m of text.matchAll(/["'`](\/(?:api|v[0-9]+|graphql|auth|oauth|admin|internal|webhook|session|user|account|billing|payment|upload|debug)[A-Za-z0-9_/:.-]{1,100})["'`]/g)) {
      if (endpoints.size < 250) endpoints.add(m[1]);
    }

    // Full URLs
    for (const m of text.matchAll(/https?:\/\/[A-Za-z0-9._-]+(?::\d+)?(?:\/[A-Za-z0-9_./?%&=:#-]*)?/g)) {
      const u = m[0];
      if (!u.includes("w3.org") && !u.includes("mozilla.org") && !u.includes("reactjs.org") && urls.size < 150) {
        urls.add(u);
      }
    }

    // WebSockets
    for (const m of text.matchAll(/wss?:\/\/[A-Za-z0-9._-]+(?::\d+)?(?:\/[A-Za-z0-9_./?%&=:#-]*)?/g)) {
      if (websockets.size < 50) websockets.add(m[0]);
    }

    // GraphQL operations
    for (const m of text.matchAll(/\b(?:query|mutation|subscription)\s+([A-Za-z0-9_]{3,60})\s*(?:\(|\{)/g)) {
      if (graphqlOps.size < 100) graphqlOps.add(m[0].trim());
    }

    // Dangerous sinks
    for (const sink of DANGEROUS_SINKS) {
      const matches = text.match(sink.regex);
      if (matches && matches.length > 0) {
        dangerousSinks.push({ file: rel, sink: sink.name, count: matches.length });
      }
    }

    // Secrets
    for (const pat of SECRET_PATTERNS) {
      for (const m of text.matchAll(pat.regex)) {
        const val = m[0];
        const key = `${pat.name}:${val}`;
        if (!secretDedup.has(key) && secrets.length < 100) {
          secretDedup.add(key);
          secrets.push({ file: rel, type: pat.name, preview: maskPreview(val) });
        }
      }
    }
  }

  return {
    targetPath: abs,
    filesScanned: files.length,
    bytesScanned,
    endpoints: [...endpoints].sort(),
    urls: [...urls].sort(),
    websockets: [...websockets].sort(),
    graphqlOps: [...graphqlOps].sort(),
    sourceMaps: [...sourceMaps].sort(),
    dangerousSinks: dangerousSinks.slice(0, 80),
    secrets,
  };
}
