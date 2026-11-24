import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const WEBTUI_CSS_SPECIFIERS = [
  "@webtui/css",
  "@webtui/plugin-nf",
  "@webtui/plugin-declarative-layout",
  "@webtui/theme-catppuccin",
  "@webtui/theme-everforest",
  "@webtui/theme-gruvbox",
  "@webtui/theme-nord",
  "@webtui/theme-osmium",
  "@webtui/theme-vitesse",
] as const;

let cachedBundle: string | null = null;

/**
 * Concatenates the installed @webtui/css library, official plugins
 * (@webtui/plugin-nf, @webtui/plugin-declarative-layout), and official themes
 * into a single zero-CDN CSS bundle served by YedoguDaemon at /assets/webtui.css.
 */
export function getWebTuiCssBundle(): string {
  if (cachedBundle !== null) return cachedBundle;

  const chunks: string[] = [
    "/* YEDOGU // Official WebTUI CSS + Plugins + Themes Bundle (webtui.ironclad.sh) */",
    "@layer base, utils, components;",
  ];

  for (const specifier of WEBTUI_CSS_SPECIFIERS) {
    try {
      const resolved = require.resolve(specifier);
      const css = fs.readFileSync(resolved, "utf8");
      chunks.push(`/* --- ${specifier} --- */\n${css}`);
    } catch {
      // Optional plugin/theme missing in a stripped install — degrade gracefully
    }
  }

  cachedBundle = chunks.join("\n\n");
  return cachedBundle;
}
