#!/usr/bin/env node
// arness — instala, sincroniza y verifica el harness de @bi-analytics/arness-back en un repositorio.
// Sin dependencias: solo módulos de Node (>= 20).
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8'));
// Se publica en el registro público de npm (ADR 0013).
const INSTALL_SPEC = `${PKG.name}@${PKG.version}`;

const H = 'harness';
const MANIFEST = `${H}/.arness.json`;
const CONFIG = `${H}/arness.config.json`;
// Respaldo de la versión anterior antes de cada sync; se ignora a sí mismo en git.
const BACKUP_DIR = `${H}/.arness-backup`;
const BACKUPS_KEPT = 3;
const MANIFEST_SCHEMA = 1;
// Del repo instalador: el paquete los crea una sola vez y sync nunca los toca.
const OWNED_PREFIXES = [`${H}/decisiones/`, `${H}/progress.md`, MANIFEST, CONFIG, `${BACKUP_DIR}/`];
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

/** Lleva un manifiesto de cualquier versión anterior al formato actual (idempotente). */
function migrateManifest(raw) {
  return { ...raw, schema: MANIFEST_SCHEMA, files: raw.files ?? {}, links: raw.links ?? {} };
}

function readManifest(root, rel = MANIFEST) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return null;
  return migrateManifest(JSON.parse(fs.readFileSync(abs, 'utf8')));
}

function writeManifest(root, files, links) {
  const manifest = {
    schema: MANIFEST_SCHEMA,
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

/** Copia la base instalada (archivos del manifiesto + manifiesto) antes de sobrescribirla. */
function backupBase(root, manifest) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const dir = path.join(root, BACKUP_DIR, `${stamp}-v${manifest.version}`);
  for (const rel of [...Object.keys(manifest.files), MANIFEST]) {
    const src = path.join(root, rel);
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.copyFileSync(src, path.join(dir, rel));
    fs.chmodSync(path.join(dir, rel), fs.statSync(src).mode & 0o777);
  }
  fs.writeFileSync(path.join(root, BACKUP_DIR, '.gitignore'), '*\n');
  const all = listBackups(root);
  for (const old of all.slice(0, Math.max(0, all.length - BACKUPS_KEPT))) {
    fs.rmSync(path.join(root, BACKUP_DIR, old), { recursive: true, force: true });
  }
  return path.relative(root, dir);
}

/** Respaldos disponibles, del más antiguo al más reciente. */
function listBackups(root) {
  const abs = path.join(root, BACKUP_DIR);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(abs, e.name, MANIFEST)))
    .map((e) => e.name)
    .sort();
}

/** Diff unificado entre lo instalado y lo nuevo (requiere git; si no está, se omite). */
function showDiff(root, rel, next) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arness-diff-'));
  const nextPath = path.join(tmp, path.basename(rel));
  fs.writeFileSync(nextPath, next ?? '');
  const current = path.join(root, rel);
  const res = spawnSync('git', ['diff', '--no-index', '--no-color', '--', fs.existsSync(current) ? current : '/dev/null', nextPath], {
    encoding: 'utf8',
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  if (res.error) return log(`  (sin git: no se puede mostrar el diff de ${rel})`);
  log(res.stdout.replaceAll(nextPath, `(nuevo) ${rel}`).replaceAll(current, rel).trimEnd());
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
  if (opts.diff) {
    for (const rel of [...added, ...updated]) showDiff(root, rel, next.get(rel).content);
    for (const rel of removed) showDiff(root, rel, null);
  }
  const incoming = parseNovelties(next.get(NOVELTIES)?.content.toString('utf8')).filter(
    (n) => compareVersions(n.since, manifest.version) > 0,
  );
  if (incoming.length) {
    log(`\nNovedades desde ${manifest.version} (no se activan solas; detalle y pasos: arness doctor):`);
    for (const n of incoming) log(`  · [${n.type}] ${n.title} (${n.id}, desde ${n.since})`);
  }
  if (opts.dryRun) {
    log('\n(--dry-run: no se escribió nada. Usa --diff para ver los cambios línea a línea)');
    return;
  }

  // Solo se respalda si hay archivos que escribir; los enlaces y el manifiesto se reparan siempre.
  const changes = added.length + updated.length + removed.length > 0 || manifest.version !== PKG.version;
  const backup = changes ? backupBase(root, manifest) : null;
  for (const rel of [...added, ...updated]) writeFile(root, rel, next.get(rel));
  for (const rel of removed) fs.rmSync(path.join(root, rel), { force: true });
  ensureDecisionSkeleton(root);
  const links = createLinks(root, manifest.links ?? {}, { forceCopy: opts.copy });
  writeManifest(root, next, links);
  log('\n✔ Harness sincronizado. Solo se escribieron archivos de la base (harness/ y puentes);');
  log('  el código del proyecto, harness/decisiones/ y harness/progress.md no se tocaron.');
  if (backup) log(`  Respaldo de la versión anterior: ${backup} (para volver: arness rollback)`);
  log('  Revisa la sección "Para proyectos existentes" del CHANGELOG y ejecuta: arness doctor');
}

function cmdRollback(opts) {
  const root = findRoot();
  const current = readManifest(root);
  const backups = listBackups(root);
  if (!backups.length) throw new CliError('No hay respaldos en harness/.arness-backup/: nada que restaurar.');
  const name = backups.at(-1);
  const dir = path.join(root, BACKUP_DIR, name);
  const previous = readManifest(dir);

  const { modified } = integrity(root, current);
  if (modified.length && !opts.force) {
    throw new CliError(
      `Archivos de la base editados a mano desde el último sync:\n${list(modified)}\n` +
        'rollback los sobrescribiría. Para continuar de todos modos: arness rollback --force',
    );
  }

  const restored = Object.keys(previous.files);
  const removed = Object.keys(current.files).filter((rel) => !(rel in previous.files));
  log(`${PKG.name}: ${current.version} → ${previous.version} (respaldo ${name})`);
  log(`  restaurados: ${restored.length} · eliminados: ${removed.length}`);
  for (const rel of removed) log(`  - ${rel}`);
  if (opts.dryRun) {
    log('\n(--dry-run: no se escribió nada)');
    return;
  }

  for (const rel of removed) fs.rmSync(path.join(root, rel), { force: true });
  for (const rel of [...restored, MANIFEST]) {
    const src = path.join(dir, rel);
    if (!fs.existsSync(src)) continue;
    writeFile(root, rel, { content: fs.readFileSync(src), mode: fs.statSync(src).mode & 0o777 });
  }
  const wantsCopy = Object.values(previous.links).includes('copy');
  createLinks(root, current.links, { forceCopy: wantsCopy });
  fs.rmSync(dir, { recursive: true, force: true });
  log(`\n✔ Base restaurada a ${previous.version}. El código del proyecto y harness/decisiones/ no se tocaron.`);
  log('  Recuerda volver a fijar ese tag en la devDependency si la cambiaste.');
}

// Dónde mirar para resolver cada categoría de hallazgo de init.sh.
const DOCTOR_HINTS = {
  config: 'Revisa harness/arness.config.json (JSON válido; cada ignore lleva motivo).',
  harness: 'Restaura la base con arness sync (o arness sync --force si se editó a mano).',
  decisions: 'Sigue harness/decisiones/README.md.',
  progress: 'El líder lo reinicia desde harness/reference/progress-plantilla.md.',
  git: 'Usa un repo git propio; si hay secretos versionados, sácalos del índice (git rm --cached) y rota las credenciales.',
  package: 'Repo fuente del paquete: revisa bin/, CHANGELOG.md y docs/adr/.',
  install: 'Instala o actualiza el paquete (README de @bi-analytics/arness-back) y ejecuta arness sync.',
  toolchain: 'Skill nest-base §1 y §4: .nvmrc, packageManager, lockfile y scripts.',
  structure: 'AGENTS.md §4 y skill nest-base §4–§5. Adóptalo cuando convenga; no bloquea.',
  sql: 'AGENTS.md §6: SQL solo en *.sql.ts y sin escrituras.',
  docs: 'AGENTS.md §12: copia harness/skills/nest-base/templates/docs/ (EVOLUTIVO.md solo avance; PENDIENTES.md lo abierto).',
  env: 'harness/reference/configuracion.md (Dónde se leen las variables): process.env solo en src/config/configuration.ts.',
  logging: 'harness/reference/contrato-http.md (Logging): LOG_FORMAT=json|pretty y pino-pretty solo en devDependencies.',
  quality: 'pnpm install, pnpm lint, pnpm build, pnpm test.',
  health: 'harness/reference/contrato-http.md (Health) y la conexión a cada BD.',
};

// Catálogo de novedades adoptables (parte de la base): lo leen doctor y sync.
const NOVELTIES = `${H}/reference/novedades.json`;
const NOVELTY_TYPES = { seguridad: 'Seguridad', recomendada: 'Recomendadas', opcional: 'Opcionales' };

/** Compara versiones x.y.z: negativo si a < b, 0 si son iguales, positivo si a > b. */
function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

/** Novedades de un catálogo (texto JSON); [] si no existe (bases anteriores a 0.2.0). */
function parseNovelties(text) {
  if (!text) return [];
  const catalog = JSON.parse(text);
  return Array.isArray(catalog.novedades) ? catalog.novedades : [];
}

function readRepoConfig(root) {
  const abs = path.join(root, CONFIG);
  if (!fs.existsSync(abs)) return {};
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch {
    return {}; // init.sh ya reporta el JSON inválido (config.invalid)
  }
}

/**
 * Clasifica cada novedad: adoptada (existen sus paths y init.sh no reporta sus checks), declinada
 * (harness/arness.config.json → declined, con motivo) o pendiente, con los hallazgos que la delatan.
 */
function classifyNovelties(root, novelties, issues, declined) {
  const out = { pending: [], adopted: [], declined: [], configErrors: [] };
  for (const n of novelties) {
    const reason = String(declined[n.id] ?? '').trim();
    if (n.id in declined && !reason) out.configErrors.push(`declined.${n.id} sin motivo`);
    if (reason) {
      out.declined.push({ ...n, reason });
      continue;
    }
    const findings = issues.filter((i) => (n.checks ?? []).includes(i.id));
    const missingPaths = (n.paths ?? []).filter((p) => !fs.existsSync(path.join(root, p)));
    if (!findings.length && !missingPaths.length) out.adopted.push(n);
    else out.pending.push({ ...n, findings: [...missingPaths.map((p) => `No existe ${p}`), ...findings.map((i) => i.message)] });
  }
  return out;
}

function cmdDoctor(opts) {
  const root = findRoot();
  const manifest = readManifest(root);
  const { modified, missing } = integrity(root, manifest);
  const args = ['--json', ...(opts.full ? [] : ['--quick', '--no-health'])];
  const res = spawnSync('bash', [path.join(root, H, 'init.sh'), ...args], { cwd: root, encoding: 'utf8' });
  let report;
  try {
    report = JSON.parse(res.stdout);
  } catch {
    throw new CliError(`init.sh no devolvió JSON válido (¿versión anterior de la base?).\n${res.stderr.slice(-2000)}`);
  }

  const catalogPath = path.join(root, NOVELTIES);
  let novelties = parseNovelties(fs.existsSync(catalogPath) ? fs.readFileSync(catalogPath, 'utf8') : null);
  if (opts.since) novelties = novelties.filter((n) => compareVersions(n.since, opts.since) > 0);
  const declined = readRepoConfig(root).declined ?? {};
  const nov = classifyNovelties(root, novelties, report.issues, typeof declined === 'object' ? declined : {});

  // Los avisos de una novedad se muestran con ella; los fallos y críticos siguen en su sección.
  const noveltyChecks = new Set(novelties.flatMap((n) => n.checks ?? []));
  const others = report.issues.filter((i) => !(noveltyChecks.has(i.id) && (i.level === 'warning' || i.level === 'ignored')));
  const newer = compareVersions(PKG.version, manifest.version) > 0;

  if (opts.json) {
    const pick = ({ id, type, since, title, why, steps, approval, adr, reference }) => ({ id, type, since, title, why, steps, approval, adr, reference });
    process.stdout.write(
      `${JSON.stringify(
        {
          schema: 1,
          installed: manifest.version,
          available: PKG.version,
          newerAvailable: newer,
          mode: report.mode,
          base: { modified, missing },
          novelties: {
            pending: nov.pending.map((n) => ({ ...pick(n), findings: n.findings })),
            adopted: nov.adopted.map((n) => n.id),
            declined: nov.declined.map((n) => ({ id: n.id, reason: n.reason })),
          },
          configErrors: nov.configErrors,
          issues: others,
          summary: report.summary,
        },
        null,
        2,
      )}\n`,
    );
    if (report.summary.critical) process.exitCode = 1;
    return;
  }

  log(`Harness ${manifest.package}@${manifest.version} · paquete disponible ${PKG.version}`);
  if (newer) log(`  ⚠ Hay una versión más nueva del paquete: ejecuta arness sync (y después arness doctor)`);
  if (modified.length || missing.length) log(`  ⚠ Base distinta al manifiesto: ${modified.length} editados, ${missing.length} faltantes`);
  log(`Revisión ${opts.full ? 'completa' : 'rápida (usa --full para lint, build, tests y health)'} · modo ${report.mode}`);
  for (const e of nov.configErrors) log(`  ⚠ ${CONFIG}: ${e} (se ignora)`);

  if (nov.pending.length) {
    log(`\n◆ Novedades por adoptar${opts.since ? ` (desde ${opts.since})` : ''}: ${nov.pending.length}`);
    log('  No se activan solas: adóptalas cuando convenga, o declínalas con motivo en harness/arness.config.json → declined.');
    for (const [type, label] of Object.entries(NOVELTY_TYPES)) {
      const group = nov.pending.filter((n) => n.type === type);
      if (!group.length) continue;
      log(`\n  ${label}`);
      for (const n of group) {
        log(`    ● ${n.title} [${n.id}] · desde ${n.since}${n.adr ? ` · ADR ${n.adr}` : ''}`);
        log(`      Por qué: ${n.why}`);
        for (const f of n.findings) log(`      - ${f}`);
        log('      Pasos:');
        n.steps.forEach((step, i) => log(`        ${i + 1}. ${step}`));
        if (n.approval) log(`      Requiere aprobación: ${n.approval}`);
        if (n.reference) log(`      Referencia: ${n.reference}`);
      }
    }
  }
  if (nov.adopted.length) log(`\n✔ Novedades adoptadas: ${nov.adopted.map((n) => n.id).join(', ')}`);
  if (nov.declined.length) log(`· Novedades declinadas: ${nov.declined.map((n) => `${n.id} (${n.reason})`).join('; ')}`);

  const levels = [
    ['critical', '✖ Críticos (bloquean)'],
    ['failure', '✖ Obligatorios (strict o required)'],
    ['warning', '⚠ Advertencias'],
  ];
  for (const [level, title] of levels) {
    const items = others.filter((i) => i.level === level);
    if (!items.length) continue;
    log(`\n${title}: ${items.length}`);
    const byCat = new Map();
    for (const i of items) {
      const cat = (i.id ?? 'otros').split('.')[0];
      byCat.set(cat, [...(byCat.get(cat) ?? []), i]);
    }
    for (const [cat, group] of byCat) {
      log(`  ${cat}${DOCTOR_HINTS[cat] ? ` — ${DOCTOR_HINTS[cat]}` : ''}`);
      for (const i of group) log(`    - ${i.message}${i.id ? ` [${i.id}]` : ''}`);
    }
  }
  if (report.summary.ignored) log(`\n· ${report.summary.ignored} chequeo(s) silenciado(s) en ${CONFIG}`);
  if (!nov.pending.length && !others.some((i) => i.level !== 'ignored')) log('\n✔ Sin hallazgos: el proyecto cumple la versión instalada.');
  log('\nNo se modificó ningún archivo.');
  if (report.summary.critical) process.exitCode = 1;
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
  arness sync [--dry-run] [--diff] [--force] [--copy]
                                                   Actualiza la base (respalda la versión anterior)
  arness rollback [--dry-run] [--force]            Restaura la base desde el último respaldo
  arness doctor [--full] [--json] [--since <x.y.z>]
                                                   Novedades por adoptar y hallazgos (solo lectura)
  arness status [--check]                          Versión instalada e integridad de la base
  arness verify [opciones de init.sh]              Ejecuta ./harness/init.sh
  arness decision new "<título>"                   Crea una decisión en harness/decisiones/
  arness --version | --help

Para no adoptar una novedad: harness/arness.config.json → "declined": { "<id>": "<motivo>" }.
harness/decisiones/, harness/progress.md y harness/arness.config.json pertenecen al repo:
sync y rollback nunca los modifican, ni tocan el código del proyecto.
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
    else if (a === '--diff') opts.diff = true;
    else if (a === '--full') opts.full = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--since') {
      opts.since = argv[++i];
      if (!/^\d+\.\d+\.\d+$/.test(opts.since ?? '')) throw new CliError('Uso: --since <x.y.z>');
    }
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
    case 'rollback':
      return cmdRollback(parseFlags(rest));
    case 'doctor':
      return cmdDoctor(parseFlags(rest));
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
