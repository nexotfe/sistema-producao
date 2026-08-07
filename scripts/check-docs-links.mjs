#!/usr/bin/env node
// Verificador read-only de links Markdown e referencias de caminho na documentacao.
// So le arquivos (fs.readFileSync / fs.existsSync) - nunca escreve nada.
// Uso: node scripts/check-docs-links.mjs

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const EXCLUDE_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".claude",
  "dist",
  "build",
]);

function walkMarkdownFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkMarkdownFiles(full, files);
    } else if (/\.(md|MD)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

// [texto](caminho) - link markdown padrao
const MD_LINK_RE = /\]\(([^)]+)\)/g;
// `caminho/arquivo.md` - referencia a documento em code span
const INLINE_MD_PATH_RE = /`([a-zA-Z0-9_.\- /À-ÿ]+\.(?:md|MD))`/g;

function candidateTargets(fileDir, rawTarget) {
  const withoutAnchor = rawTarget.split("#")[0].trim();
  if (!withoutAnchor) return []; // link so-de-ancora, ex: (#secao)
  if (/^https?:\/\//i.test(withoutAnchor)) return [];
  if (withoutAnchor.startsWith("mailto:")) return [];
  if (path.isAbsolute(withoutAnchor)) return []; // fora do escopo deste checker

  // Duas convencoes convivem no repo: link relativo a pasta do arquivo
  // (ex.: TROUBLESHOOTING.md -> "SETUP_WINDOWS.md") e mencao relativa a
  // raiz do repo (ex.: INDICE.md -> "knowledge/arquitetura-tecnica/PAD-008...").
  // So marca quebrado se NENHUMA das duas resolver.
  return [
    path.resolve(fileDir, withoutAnchor),
    path.resolve(ROOT, withoutAnchor),
  ];
}

function checkFile(file, results) {
  const text = fs.readFileSync(file, "utf8");
  const dir = path.dirname(file);
  const lines = text.split("\n");

  lines.forEach((line, idx) => {
    for (const re of [MD_LINK_RE, INLINE_MD_PATH_RE]) {
      re.lastIndex = 0;
      let match;
      while ((match = re.exec(line)) !== null) {
        const rawTarget = match[1];
        const candidates = candidateTargets(dir, rawTarget);
        if (candidates.length === 0) continue;
        results.checked++;
        const found = candidates.find((c) => fs.existsSync(c));
        if (!found) {
          results.broken.push({
            file: path.relative(ROOT, file),
            line: idx + 1,
            target: rawTarget,
            resolved: path.relative(ROOT, candidates[0]),
          });
        }
      }
    }
  });
}

function main() {
  const mdFiles = walkMarkdownFiles(ROOT);
  const results = { checked: 0, broken: [] };

  for (const file of mdFiles) {
    checkFile(file, results);
  }

  console.log(`Arquivos .md verificados: ${mdFiles.length}`);
  console.log(`Referencias de caminho verificadas: ${results.checked}`);
  console.log(`Referencias quebradas: ${results.broken.length}`);

  if (results.broken.length > 0) {
    console.log("\nDetalhe das referencias quebradas:");
    for (const b of results.broken) {
      console.log(`  ${b.file}:${b.line} -> "${b.target}" (nao encontrado: ${b.resolved})`);
    }
  }

  process.exit(results.broken.length > 0 ? 1 : 0);
}

main();
