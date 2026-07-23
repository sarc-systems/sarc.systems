#!/usr/bin/env node
// import-colorplan.mjs — deterministic Colorplan palette importer.
//
// Reads the committed raw capture (scripts/colorplan-source.json) and generates:
//   • data/colorplan.json                 — structured Hugo data
//   • assets/css/generated/colorplan.css  — CSS custom properties
//
// The Jukebox source table is client-rendered JavaScript and is not available
// to a plain HTTP fetch, so the raw values are captured once into the source
// snapshot (see that file's header). This importer is pure and offline: given
// the same snapshot it always produces byte-identical output. It FAILS LOUDLY
// rather than guessing on any unexpected or inconsistent input.
//
// Run via `make colorplan`. Both generated files are committed; normal Hugo
// builds never run this.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = resolve(ROOT, "scripts/colorplan-source.json");
const OUT_JSON = resolve(ROOT, "data/colorplan.json");
const OUT_CSS = resolve(ROOT, "assets/css/generated/colorplan.css");

const EXPECTED_COUNT = 55; // The full Colorplan range. Fail if the source changes.
const AA_SMALL = 4.5; // WCAG 2.1 AA contrast for normal-size text.

function fail(msg) {
  console.error(`\n✗ colorplan import failed: ${msg}\n`);
  process.exit(1);
}

// --- Colour maths ---------------------------------------------------------

function parseHex(hex) {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return null;
  const n = m[1];
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
}

function parseTriple(str) {
  const parts = String(str).split(",").map((s) => s.trim());
  if (parts.length !== 3) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums;
}

function parseCmyk(str) {
  const parts = String(str).split(",").map((s) => s.trim());
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 100)) return null;
  return nums;
}

// WCAG relative luminance from sRGB.
function luminance([r, g, b]) {
  const lin = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrast(l1, l2) {
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// --- Load + validate ------------------------------------------------------

let raw;
try {
  raw = JSON.parse(readFileSync(SRC, "utf8"));
} catch (e) {
  fail(`cannot read/parse ${SRC}: ${e.message}`);
}

if (!Array.isArray(raw.colors)) fail("source has no `colors` array");
if (raw.count !== raw.colors.length) {
  fail(`source count (${raw.count}) != colors length (${raw.colors.length})`);
}
if (raw.colors.length !== EXPECTED_COUNT) {
  fail(
    `expected ${EXPECTED_COUNT} colors, found ${raw.colors.length}. ` +
      `The Colorplan range changed — review the source before regenerating.`
  );
}

const WHITE_L = luminance([255, 255, 255]);
const BLACK_L = luminance([0, 0, 0]);

const seenNames = new Set();
const seenSlugs = new Set();
const colors = raw.colors.map((c, i) => {
  const where = `row ${i} (${c.name ?? "?"})`;
  if (!c.name || typeof c.name !== "string") fail(`${where}: missing name`);

  const name = c.name.trim();
  const slug = slugify(name);
  if (!slug) fail(`${where}: name produces an empty slug`);
  if (seenNames.has(name)) fail(`duplicate name: ${name}`);
  if (seenSlugs.has(slug)) fail(`duplicate slug: ${slug}`);
  seenNames.add(name);
  seenSlugs.add(slug);

  const rgbFromHex = parseHex(c.hex);
  if (!rgbFromHex) fail(`${where}: invalid hex ${JSON.stringify(c.hex)}`);
  const rgb = parseTriple(c.rgb);
  if (!rgb) fail(`${where}: invalid rgb ${JSON.stringify(c.rgb)}`);

  // Hex and RGB must agree exactly — a mismatch means the source is suspect.
  if (rgbFromHex.some((v, k) => v !== rgb[k])) {
    fail(`${where}: hex ${c.hex} disagrees with rgb ${c.rgb}`);
  }

  const cmyk = parseCmyk(c.cmyk);
  if (!cmyk) fail(`${where}: invalid cmyk ${JSON.stringify(c.cmyk)}`);
  if (!c.pantone || typeof c.pantone !== "string") {
    fail(`${where}: missing pantone`);
  }

  const L = luminance(rgb);
  const onWhite = round2(contrast(L, WHITE_L)); // white text on this colour
  const onBlack = round2(contrast(L, BLACK_L)); // black text on this colour
  const useBlack = onBlack >= onWhite;
  const bestContrast = Math.max(onWhite, onBlack);

  return {
    name,
    slug,
    hex: c.hex.toUpperCase(),
    rgb: { r: rgb[0], g: rgb[1], b: rgb[2] },
    cmyk: { c: cmyk[0], m: cmyk[1], y: cmyk[2], k: cmyk[3] },
    pantone: c.pantone.trim(),
    contrast: { onWhiteText: onWhite, onBlackText: onBlack },
    // Recommended default foreground for text placed ON this colour.
    foreground: useBlack ? "#000000" : "#FFFFFF",
    foregroundName: useBlack ? "black" : "white",
    // Flag colours where NEITHER foreground reaches AA for small text.
    smallTextSafe: bestContrast >= AA_SMALL,
  };
});

const unsafe = colors.filter((c) => !c.smallTextSafe);

// --- Emit -----------------------------------------------------------------

const header = {
  url: raw.source,
  retrieved: raw.retrieved,
  generator: "scripts/import-colorplan.mjs",
  note: "GENERATED FILE — do not edit by hand. Run `make colorplan` to regenerate.",
};

const dataOut = {
  _generated: header,
  count: colors.length,
  smallTextUnsafe: unsafe.map((c) => c.slug),
  colors,
};

mkdirSync(dirname(OUT_JSON), { recursive: true });
writeFileSync(OUT_JSON, JSON.stringify(dataOut, null, 2) + "\n", "utf8");

// CSS: official names preserved as custom-property slugs.
const cssLines = [];
cssLines.push("/*");
cssLines.push(" * GENERATED FILE — do not edit by hand.");
cssLines.push(" * Colorplan palette custom properties.");
cssLines.push(` * Source:    ${header.url}`);
cssLines.push(` * Retrieved: ${header.retrieved}`);
cssLines.push(" * Regenerate with `make colorplan`.");
cssLines.push(" *");
cssLines.push(" * For each colour: --colorplan-<slug> is the paper colour and");
cssLines.push(" * --colorplan-<slug>-fg is the recommended text colour on it.");
cssLines.push(" */");
cssLines.push(":root {");
for (const c of colors) {
  const flag = c.smallTextSafe ? "" : "  /* small text: neither fg meets AA */";
  cssLines.push(`  --colorplan-${c.slug}: ${c.hex.toLowerCase()};${flag}`);
  cssLines.push(`  --colorplan-${c.slug}-fg: ${c.foreground.toLowerCase()};`);
}
cssLines.push("}");

mkdirSync(dirname(OUT_CSS), { recursive: true });
writeFileSync(OUT_CSS, cssLines.join("\n") + "\n", "utf8");

// --- Report ---------------------------------------------------------------

console.log(`✓ Colorplan: imported ${colors.length} colours`);
console.log(`  → ${OUT_JSON.replace(ROOT + "/", "")}`);
console.log(`  → ${OUT_CSS.replace(ROOT + "/", "")}`);
if (unsafe.length) {
  console.log(
    `  ⚠ ${unsafe.length} colour(s) unsafe for small text either way: ` +
      unsafe.map((c) => c.name).join(", ")
  );
}
