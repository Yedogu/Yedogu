import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { BinaryArtifactSummary } from "../types.js";

function shannonEntropy(buf: Buffer): number {
  if (buf.length === 0) return 0;
  const counts = new Uint32Array(256);
  const sampleLen = Math.min(buf.length, 2 * 1024 * 1024);
  for (let i = 0; i < sampleLen; i++) {
    counts[buf[i]]++;
  }
  let ent = 0;
  for (let i = 0; i < 256; i++) {
    if (counts[i] === 0) continue;
    const p = counts[i] / sampleLen;
    ent -= p * Math.log2(p);
  }
  return Math.round(ent * 1000) / 1000;
}

function extractInterestingStrings(buf: Buffer, maxCount = 60): string[] {
  // Scan up to first 6MB + last 2MB (catches headers + appended Bun/PyInstaller overlays)
  const slices: Buffer[] = [];
  if (buf.length <= 8 * 1024 * 1024) {
    slices.push(buf);
  } else {
    slices.push(buf.subarray(0, 4 * 1024 * 1024));
    slices.push(buf.subarray(buf.length - 4 * 1024 * 1024));
  }

  const hits = new Set<string>();
  const interestRegex =
    /(?:https?:\/\/[\x21-\x7e]{6,120}|wss?:\/\/[\x21-\x7e]{6,100}|\/api\/[A-Za-z0-9_/:.-]{2,80}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]+PRIVATE KEY-----|B:\/~BUN\/root\/[\x21-\x7e]{2,80}|---- Bun! ----|app\.asar|AndroidManifest\.xml|classes\.dex)/g;

  for (const slice of slices) {
    const str = slice.toString("latin1");
    for (const m of str.matchAll(interestRegex)) {
      if (hits.size >= maxCount) break;
      const val = m[0].replace(/["'<>\\]+$/, "");
      if (val.length >= 8) hits.add(val);
    }
  }
  return [...hits];
}

function parsePe(buf: Buffer): {
  format: string;
  architecture: string;
  mitigations: Record<string, boolean | string>;
  sections: BinaryArtifactSummary["sections"];
  highlights: string[];
} {
  const peOffset = buf.readUInt32LE(0x3c);
  if (peOffset + 24 >= buf.length || buf.toString("ascii", peOffset, peOffset + 4) !== "PE\0\0") {
    return {
      format: "dos-mz",
      architecture: "unknown",
      mitigations: {},
      sections: [],
      highlights: ["MZ header present without valid PE signature"],
    };
  }

  const machine = buf.readUInt16LE(peOffset + 4);
  const numSections = buf.readUInt16LE(peOffset + 6);
  const optHeaderSize = buf.readUInt16LE(peOffset + 20);
  const optOffset = peOffset + 24;
  const optMagic = optOffset + 2 <= buf.length ? buf.readUInt16LE(optOffset) : 0;

  const isPe32Plus = optMagic === 0x20b;
  const archMap: Record<number, string> = {
    0x014c: "x86 (i386)",
    0x8664: "x86_64 (AMD64)",
    0xaa64: "ARM64 (AArch64)",
    0x01c4: "ARMv7",
  };
  const architecture = archMap[machine] || `machine-0x${machine.toString(16)}`;

  const mitigations: Record<string, boolean | string> = {};
  if (optHeaderSize >= 72 && optOffset + 72 <= buf.length) {
    const dllChars = buf.readUInt16LE(optOffset + 70);
    mitigations["ASLR (DYNAMIC_BASE)"] = Boolean(dllChars & 0x0040);
    mitigations["HIGH_ENTROPY_VA"] = Boolean(dllChars & 0x0020);
    mitigations["DEP/NX (NX_COMPAT)"] = Boolean(dllChars & 0x0100);
    mitigations["CFG (GUARD_CF)"] = Boolean(dllChars & 0x4000);
    mitigations["NO_SEH"] = Boolean(dllChars & 0x0400);
  }

  const secTableOffset = optOffset + optHeaderSize;
  const sections: BinaryArtifactSummary["sections"] = [];
  let maxRawEnd = 0;

  for (let i = 0; i < Math.min(numSections, 64); i++) {
    const off = secTableOffset + i * 40;
    if (off + 40 > buf.length) break;
    const rawName = buf.subarray(off, off + 8).toString("ascii").replace(/\0+$/, "");
    const vAddr = buf.readUInt32LE(off + 12);
    const rawSize = buf.readUInt32LE(off + 16);
    const rawPtr = buf.readUInt32LE(off + 20);
    const chars = buf.readUInt32LE(off + 36);

    const end = Math.min(buf.length, rawPtr + rawSize);
    if (end > maxRawEnd) maxRawEnd = end;

    const secSlice = rawPtr < buf.length ? buf.subarray(rawPtr, end) : Buffer.alloc(0);
    const flags: string[] = [];
    if (chars & 0x20000000) flags.push("X");
    if (chars & 0x40000000) flags.push("R");
    if (chars & 0x80000000) flags.push("W");

    sections.push({
      name: rawName || `sec_${i}`,
      virtualAddress: `0x${vAddr.toString(16)}`,
      size: rawSize,
      entropy: shannonEntropy(secSlice),
      flags: flags.join("") || "---",
    });
  }

  const highlights: string[] = [];
  const overlaySize = buf.length - maxRawEnd;
  if (overlaySize > 4096) {
    highlights.push(
      `Large PE overlay detected: ${(overlaySize / (1024 * 1024)).toFixed(2)} MB appended after section table (offset 0x${maxRawEnd.toString(16)}).`,
    );
  }
  if (buf.lastIndexOf(Buffer.from("---- Bun! ----")) !== -1) {
    highlights.push("Detected Bun single-file executable trailer (`---- Bun! ----`) with embedded JS virtual filesystem.");
  }
  if (sections.some((s) => s.entropy > 7.2)) {
    highlights.push("High-entropy section (> 7.2) detected — possible packing, compression, or encrypted payload.");
  }
  if (sections.some((s) => s.flags === "XRW" || s.flags === "RWX")) {
    highlights.push("RWX (Writable + Executable) section detected — potential shellcode/unpacking stub surface.");
  }

  return {
    format: isPe32Plus ? "PE32+ (64-bit)" : "PE32 (32-bit)",
    architecture,
    mitigations,
    sections,
    highlights,
  };
}

function parseElf(buf: Buffer): {
  format: string;
  architecture: string;
  mitigations: Record<string, boolean | string>;
  sections: BinaryArtifactSummary["sections"];
  highlights: string[];
} {
  const elfClass = buf[4] === 2 ? 64 : 32;
  const littleEndian = buf[5] === 1;
  const read16 = (off: number) => (littleEndian ? buf.readUInt16LE(off) : buf.readUInt16BE(off));
  const eType = read16(16);
  const eMachine = read16(18);

  const archMap: Record<number, string> = {
    3: "x86",
    62: "x86_64",
    40: "ARM",
    183: "ARM64 (AArch64)",
    243: "RISC-V",
  };

  const isPie = eType === 3;
  const highlights: string[] = [];
  if (!isPie) highlights.push("Non-PIE ELF binary (ET_EXEC) — fixed base address simplifies ROP.");

  return {
    format: `ELF${elfClass} (${littleEndian ? "LE" : "BE"})`,
    architecture: archMap[eMachine] || `e_machine=${eMachine}`,
    mitigations: {
      PIE: isPie,
      "GNU_STACK/NX": buf.indexOf(Buffer.from("GNU_STACK")) !== -1 ? "check phdrs" : "unknown",
      "Stack Canary (__stack_chk_fail)": buf.indexOf(Buffer.from("__stack_chk_fail")) !== -1,
    },
    sections: [],
    highlights,
  };
}

function parseZipEntries(buf: Buffer): string[] {
  const entries: string[] = [];
  let pos = 0;
  while (pos + 30 < buf.length && entries.length < 150) {
    const sig = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), pos);
    if (sig === -1 || sig + 46 > buf.length) break;
    const nameLen = buf.readUInt16LE(sig + 28);
    const extraLen = buf.readUInt16LE(sig + 30);
    const commentLen = buf.readUInt16LE(sig + 32);
    if (sig + 46 + nameLen <= buf.length) {
      entries.push(buf.subarray(sig + 46, sig + 46 + nameLen).toString("utf8"));
    }
    pos = sig + 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

export function runBinaryTriage(targetPath: string): BinaryArtifactSummary {
  const abs = path.resolve(targetPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Artifact not found: ${abs}`);
  }
  const st = fs.statSync(abs);
  if (!st.isFile()) {
    throw new Error(`Target is not a regular file: ${abs}`);
  }

  const buf = fs.readFileSync(abs);
  const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
  const overallEntropy = shannonEntropy(buf);

  let format = "unknown";
  let architecture = "unknown";
  let mitigations: Record<string, boolean | string> = {};
  let sections: BinaryArtifactSummary["sections"] = [];
  let highlights: string[] = [];
  let entries: string[] | undefined;

  if (buf.length >= 64 && buf[0] === 0x4d && buf[1] === 0x5a) {
    const pe = parsePe(buf);
    format = pe.format;
    architecture = pe.architecture;
    mitigations = pe.mitigations;
    sections = pe.sections;
    highlights = pe.highlights;
  } else if (buf.length >= 52 && buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) {
    const elf = parseElf(buf);
    format = elf.format;
    architecture = elf.architecture;
    mitigations = elf.mitigations;
    sections = elf.sections;
    highlights = elf.highlights;
  } else if (
    buf.length >= 4 &&
    ((buf[0] === 0xcf && buf[1] === 0xfa && buf[2] === 0xed && buf[3] === 0xfe) ||
      (buf[0] === 0xfe && buf[1] === 0xed && buf[2] === 0xfa && buf[3] === 0xcf) ||
      (buf[0] === 0xca && buf[1] === 0xfe && buf[2] === 0xba && buf[3] === 0xbe))
  ) {
    format = "Mach-O";
    architecture = buf[0] === 0xca ? "Universal (Fat)" : "64-bit";
    highlights.push("Mach-O binary detected; use REA MCP (`inspect_macho`, `open_binary`) for deep segment/ObjC/Swift inspection.");
  } else if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    entries = parseZipEntries(buf);
    const isApk = entries.some((e) => e === "AndroidManifest.xml" || e.endsWith(".dex"));
    const isIpa = entries.some((e) => e.startsWith("Payload/") && e.includes(".app/"));
    format = isApk ? "Android APK (ZIP)" : isIpa ? "iOS IPA (ZIP)" : "ZIP Archive";
    architecture = isApk ? "Dalvik/ART + Native" : isIpa ? "ARM64" : "archive";
    highlights.push(`Archive contains ${entries.length}+ central-directory entries.`);
    if (isApk) {
      const nativeLibs = entries.filter((e) => e.endsWith(".so"));
      highlights.push(`Android APK detected (${nativeLibs.length} native .so libs). Use REA MCP (\`inspect_android_package\`) or jadx for class/method analysis.`);
    }
  } else if (abs.toLowerCase().endsWith(".asar")) {
    format = "Electron ASAR";
    architecture = "JavaScript/Node";
    highlights.push("Electron ASAR container detected. Use REA MCP (`analyze_javascript_application`) for IPC & preload graph reconstruction.");
  } else {
    format = path.extname(abs).replace(".", "").toUpperCase() || "RAW";
  }

  const interestingStrings = extractInterestingStrings(buf);

  return {
    id: `art_${crypto.randomBytes(4).toString("hex")}`,
    timestamp: new Date().toISOString(),
    path: abs,
    format,
    architecture,
    sizeBytes: buf.length,
    sha256,
    entropy: overallEntropy,
    mitigations,
    sections,
    highlights,
    interestingStrings,
    entries,
  };
}
