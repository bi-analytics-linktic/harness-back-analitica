#!/usr/bin/env node
// arness — instala, sincroniza y verifica el harness de @linktic/arness-back en un repositorio.
// Sin dependencias: solo módulos de Node (>= 20).
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8'));
// Se instala desde git (sin registro): <repo>#v<versión>.
const INSTALL_SPEC = `${PKG.repository.url}#v${PKG.version}`;

const H = 'harness';
const MANIFEST = `${H}/.arness.json`;
// Del repo instalador: el paquete los crea una sola vez y sync nunca los toca.
const OWNED_PREFIXES = [`${H}/decisiones/`, `${H}/progress.md`, MANIFEST];
const DECISION_SKELETON = [`${H}/decisiones/README.md`, `${H}/decisiones/_plantilla.md`];

// Puentes de la raíz: cada herramienta busca en rutas fijas (ADR 0002).
const BRIDGE_FILES = {
  'CLAUDE.md': `# CLAUDE.md

Puente hacia el harness. Las instrucciones viven en \`harness/AGENTS.md\`; no agregues reglas aquí.

@harness/AGENTS.md
`,
  'GEMINI.md': `# GEMINI.md

Puente hacia el harness. Las instrucciones viven en \`harness/AGENTS.md\`; no agregues reglas aquí.

@./harness/AGENTS.md
`,
  '.cursor/rules/agents.mdc': `---
description: Reglas del repositorio (fuente única en harness/AGENTS.md)
alwaysApply: true
---

Sigue estrictamente \`harness/AGENTS.md\` y los playbooks de \`harness/playbooks/\`. No agregues reglas aquí.

@harness/AGENTS.md
`,
};
const BRIDGE_LINKS = [
  { link: 'AGENTS.md', target: `${H}/AGENTS.md`, type: 'file' },
  { link: '.claude/agents', target: `../${H}/agents`, type: 'dir' },
  { link: '.claude/skills', target: `../${H}/skills`, type: 'dir' },
  { link: '.agents/skills', target: `../${H}/skills`, type: 'dir' },
];

// ── utilidades ───────────────────────────────────────────────────────────────

class CliError extends Error {}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const log = (msg = '') => process.stdout.write(`${msg}\n`);
const isOwned = (rel) => OWNED_PREFIXES.some((p) => rel === p || rel.startsWith(p));

function walk(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs, base));
    else if (entry.isFile()) out.push(path.relative(base, abs).split(path.sep).join('/'));
  }
  return out;
}

/** Archivos gestionados que ofrece esta versión del paquete: rel → { content, mode }. */
function packageFiles() {
  const files = new Map();
  for (const rel of walk(path.join(PKG_ROOT, H)).map((r) => `${H}/${r}`)) {
    if (isOwned(rel)) continue;
    const abs = path.join(PKG_ROOT, rel);
    files.set(rel, { content: fs.readFileSync(abs), mode: fs.statSync(abs).mode & 0o777 });
  }
  for (const [rel, text] of Object.entries(BRIDGE_FILES)) {
    files.set(rel, { content: Buffer.from(text), mode: 0o644 });
  }
  return files;
}

function readManifest(root) {
  const abs = path.join(root, MANIFEST);
  if (!fs.existsSync(abs)) return null;
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

function writeManifest(root, files, links) {
  const manifest = {
    package: PKG.name,
    version: PKG.version,
    files: Object.fromEntries([...files].map(([rel, f]) => [rel, sha256(f.content)]).sort()),
    links,
  };
  fs.writeFileSync(path.join(root, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
}

function writeFile(root, rel, { content, mode }) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  fs.chmodSync(abs, mode);
}

function exists(abs) {
  try {
    fs.lstatSync(abs);
    return true;
  } catch {
    return false;
  }
}

/** Sube desde cwd hasta encontrar una carpeta con harness/ instalado. */
function findRoot(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, MANIFEST))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new CliError('No se encontró harness/.arness.json. Ejecuta primero: arness init');
    dir = parent;
  }
}

/** Crea los enlaces de la raíz; si el sistema no permite symlinks (Windows), copia. */
function createLinks(root, previous = {}, { force = false, forceCopy = false } = {}) {
  const result = {};
  for (const { link, target, type } of BRIDGE_LINKS) {
    const abs = path.join(root, link);
    const targetAbs = path.resolve(path.dirname(abs), target);
    if (exists(abs)) {
      const st = fs.lstatSync(abs);
      const ours = st.isSymbolicLink() || previous[link] === 'copy';
      if (!ours && !force) {
        throw new CliError(`Ya existe ${link} y no lo creó arness. Muévelo o usa --force.`);
      }
      fs.rmSync(abs, { recursive: true, force: true });
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    let mode = 'symlink';
    try {
      if (forceCopy) throw new Error('copy requested');
      fs.symlinkSync(target, abs, type);
    } catch {
      fs.cpSync(targetAbs, abs, { recursive: true });
      mode = 'copy';
    }
    result[link] = mode;
  }
  return result;
}

function ensureDecisionSkeleton(root) {
  const created = [];
  for (const rel of DECISION_SKELETON) {
    const abs = path.join(root, rel);
    if (exists(abs)) continue;
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.copyFileSync(path.join(PKG_ROOT, rel), abs);
    created.push(rel);
  }
  return created;
}

function ensureGitignore(root) {
  const abs = path.join(root, '.gitignore');
  const line = `${H}/progress.md`;
  const current = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
  if (current.split(/\r?\n/).includes(line)) return false;
  const sep = current && !current.endsWith('\n') ? '\n' : '';
  fs.writeFileSync(abs, `${current}${sep}${line}\n`);
  return true;
}

/** Compara lo instalado con el manifiesto: archivos editados a mano o faltantes. */
function integrity(root, manifest) {
  const modified = [];
  const missing = [];
  for (const [rel, hash] of Object.entries(manifest.files)) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) missing.push(rel);
    else if (sha256(fs.readFileSync(abs)) !== hash) modified.push(rel);
  }
  return { modified, missing };
}

// ── comandos ─────────────────────────────────────────────────────────────────

function cmdInit(opts) {
  const root = path.resolve(opts.dir ?? process.cwd());
  if (root === PKG_ROOT) throw new CliError('Este es el repositorio fuente del paquete; aquí no se instala.');
  if (readManifest(root)) throw new CliError('El harness ya está instalado. Para actualizarlo usa: arness sync');

  const files = packageFiles();
  const conflicts = [...files.keys()].filter((rel) => {
    const abs = path.join(root, rel);
    return exists(abs) && !fs.readFileSync(abs).equals(files.get(rel).content);
  });
  if (conflicts.length && !opts.force) {
    throw new CliError(`Estos archivos ya existen con otro contenido:\n${list(conflicts)}\nMuévelos o usa --force.`);
  }

  for (const [rel, file] of files) writeFile(root, rel, file);
  const skeleton = ensureDecisionSkeleton(root);
  const links = createLinks(root, {}, { force: opts.force, forceCopy: opts.copy });
  writeManifest(root, files, links);
  const gitignore = ensureGitignore(root);

  log(`✔ ${PKG.name}@${PKG.version} instalado en ${root}`);
  log(`  ${files.size} archivos gestionados · ${skeleton.length ? 'harness/decisiones/ creada' : 'harness/decisiones/ ya existía (sin cambios)'}`);
  for (const [link, mode] of Object.entries(links)) log(`  ${link} → ${mode === 'copy' ? 'copia (sin symlinks)' : 'enlace'}`);
  if (gitignore) log('  .gitignore: se agregó harness/progress.md');
  log('');
  log('Siguientes pasos:');
  if (fs.existsSync(path.join(root, 'package.json'))) {
    log(`  pnpm add -D ${INSTALL_SPEC}`);
  } else {
    log('  Crea la base del proyecto con la skill nest-base; ella agrega el paquete como devDependency.');
  }
  log('  ./harness/init.sh');
}

function cmdSync(opts) {
  const root = findRoot();
  const manifest = readManifest(root);
  const next = packageFiles();
  const { modified, missing } = integrity(root, manifest);

  // Archivos nuevos del paquete que chocan con algo que ya existe en el repo.
  const collisions = [...next.keys()].filter((rel) => {
    if (rel in manifest.files) return false;
    const abs = path.join(root, rel);
    return exists(abs) && !fs.readFileSync(abs).equals(next.get(rel).content);
  });

  if ((modified.length || collisions.length) && !opts.force) {
    const parts = [];
    if (modified.length) parts.push(`Archivos de la base editados a mano:\n${list(modified)}`);
    if (collisions.length) parts.push(`Archivos nuevos del paquete que ya existen en el repo:\n${list(collisions)}`);
    throw new CliError(
      `${parts.join('\n')}\n\nLa base no se edita (AGENTS.md §17): convierte esos cambios en una decisión en ` +
        `harness/decisiones/ o propónlos al paquete. Para sobrescribir de todos modos: arness sync --force`,
    );
  }

  const added = [...next.keys()].filter((rel) => !(rel in manifest.files));
  const updated = [...next.keys()].filter(
    (rel) =>
      rel in manifest.files &&
      (sha256(next.get(rel).content) !== manifest.files[rel] || modified.includes(rel) || missing.includes(rel)),
  );
  const removed = Object.keys(manifest.files).filter((rel) => !next.has(rel));

  log(`${PKG.name}: ${manifest.version} → ${PKG.version}`);
  log(`  nuevos: ${added.length} · actualizados: ${updated.length} · eliminados: ${removed.length}`);
  for (const rel of added) log(`  + ${rel}`);
  for (const rel of updated) log(`  ~ ${rel}`);
  for (const rel of removed) log(`  - ${rel}`);
  if (opts.dryRun) {
    log('\n(--dry-run: no se escribió nada)');
    return;
  }

  for (const rel of [...added, ...updated]) writeFile(root, rel, next.get(rel));
  for (const rel of removed) fs.rmSync(path.join(root, rel), { force: true });
  ensureDecisionSkeleton(root);
  const links = createLinks(root, manifest.links ?? {}, { forceCopy: opts.copy });
  writeManifest(root, next, links);
  ensureGitignore(root);
  log('\n✔ Harness sincronizado. harness/decisiones/ y harness/progress.md no se tocaron.');
  log('  Revisa el CHANGELOG del paquete y ejecuta ./harness/init.sh');
}

function cmdStatus(opts) {
  const root = findRoot();
  const manifest = readManifest(root);
  const { modified, missing } = integrity(root, manifest);
  const outdated = manifest.version !== PKG.version;

  log(`Instalado: ${manifest.package}@${manifest.version} · Paquete disponible: ${PKG.version}`);
  if (outdated) log('⚠ Versión distinta a la del paquete: ejecuta arness sync');
  if (modified.length) log(`✖ Base editada a mano:\n${list(modified)}`);
  if (missing.length) log(`✖ Archivos de la base faltantes:\n${list(missing)}`);
  if (!modified.length && !missing.length) log('✔ La base coincide con el manifiesto');
  if (opts.check && (modified.length || missing.length)) process.exitCode = 1;
}

function cmdVerify(args) {
  const root = findRoot();
  const res = spawnSync('bash', [path.join(root, H, 'init.sh'), ...args], { stdio: 'inherit' });
  process.exitCode = res.status ?? 1;
}

function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function cmdDecisionNew(title) {
  if (!title) throw new CliError('Uso: arness decision new "<título>"');
  const root = findRoot();
  const dir = path.join(root, H, 'decisiones');
  ensureDecisionSkeleton(root);

  const numbers = fs
    .readdirSync(dir)
    .map((f) => /^(\d{4})-/.exec(f)?.[1])
    .filter(Boolean)
    .map(Number);
  const num = String((numbers.length ? Math.max(...numbers) : 0) + 1).padStart(4, '0');
  const file = `${num}-${slugify(title)}.md`;
  const today = new Date().toISOString().slice(0, 10);

  const body = fs
    .readFileSync(path.join(dir, '_plantilla.md'), 'utf8')
    .replace(/^# NNNN\. .*$/m, `# ${num}. ${title}`)
    .replace(/^- \*\*Estado:\*\* .*$/m, '- **Estado:** Propuesta')
    .replace(/^- \*\*Fecha:\*\* .*$/m, `- **Fecha:** ${today}`);
  fs.writeFileSync(path.join(dir, file), body);

  const readme = path.join(dir, 'README.md');
  const current = fs.readFileSync(readme, 'utf8');
  const sep = current.endsWith('\n') ? '' : '\n';
  fs.appendFileSync(readme, `${sep}| [${num}](${file}) | ${title} | Propuesta | <alcance> | ${today} |\n`);

  log(`✔ Creada ${H}/decisiones/${file} (Propuesta) y agregada al índice.`);
  log('  Completa contexto, decisión y alcance; un humano la pasa a Aceptada.');
}

// ── entrada ──────────────────────────────────────────────────────────────────

const list = (items) => items.map((i) => `  - ${i}`).join('\n');

const HELP = `arness — harness de agentes IA para backends NestJS (${PKG.name}@${PKG.version})

Uso:
  arness init [--dir <ruta>] [--force] [--copy]   Instala el harness en el repo
  arness sync [--dry-run] [--force] [--copy]       Actualiza la base a la versión instalada del paquete
  arness status [--check]                          Versión instalada e integridad de la base
  arness verify [opciones de init.sh]              Ejecuta ./harness/init.sh
  arness decision new "<título>"                   Crea una decisión en harness/decisiones/
  arness --version | --help

harness/decisiones/ y harness/progress.md pertenecen al repo: sync nunca los modifica.
--copy crea copias en lugar de enlaces simbólicos (útil en Windows sin symlinks).`;

function parseFlags(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir') opts.dir = argv[++i];
    else if (a === '--force') opts.force = true;
    else if (a === '--copy') opts.copy = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--check') opts.check = true;
    else if (a.startsWith('--')) throw new CliError(`Opción desconocida: ${a}`);
    else opts._.push(a);
  }
  return opts;
}

function main(argv) {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case 'init':
      return cmdInit(parseFlags(rest));
    case 'sync':
      return cmdSync(parseFlags(rest));
    case 'status':
      return cmdStatus(parseFlags(rest));
    case 'verify':
      return cmdVerify(rest);
    case 'decision': {
      const [sub, ...words] = rest;
      if (sub !== 'new') throw new CliError('Uso: arness decision new "<título>"');
      return cmdDecisionNew(words.join(' ').trim());
    }
    case '--version':
    case '-v':
      return log(PKG.version);
    case undefined:
    case '--help':
    case '-h':
    case 'help':
      return log(HELP);
    default:
      throw new CliError(`Comando desconocido: ${cmd}\n\n${HELP}`);
  }
}

try {
  main(process.argv.slice(2));
} catch (err) {
  if (err instanceof CliError) {
    process.stderr.write(`✖ ${err.message}\n`);
    process.exitCode = 1;
  } else {
    throw err;
  }
}
