import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'arness-test-'));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

let counter = 0;
const newRepo = () => {
  const dir = path.join(TMP, `repo-${++counter}`);
  fs.mkdirSync(dir);
  return dir;
};

/** Copia el paquete (bin + harness + package.json) para simular otra versión. */
function packageCopy(version, mutate = () => {}) {
  const dir = path.join(TMP, `pkg-${version}-${++counter}`);
  for (const rel of ['bin', 'harness', 'package.json']) {
    fs.cpSync(path.join(PKG_ROOT, rel), path.join(dir, rel), { recursive: true });
  }
  fs.rmSync(path.join(dir, 'harness/progress.md'), { force: true });
  const pkgJson = path.join(dir, 'package.json');
  fs.writeFileSync(pkgJson, JSON.stringify({ ...JSON.parse(fs.readFileSync(pkgJson, 'utf8')), version }));
  mutate(dir);
  return dir;
}

const run = (cwd, args, pkg = PKG_ROOT) =>
  spawnSync(process.execPath, [path.join(pkg, 'bin/arness.mjs'), ...args], { cwd, encoding: 'utf8' });

const read = (repo, rel) => fs.readFileSync(path.join(repo, rel), 'utf8');
const manifest = (repo) => JSON.parse(read(repo, 'harness/.arness.json'));

describe('arness init', () => {
  let repo;
  beforeEach(() => {
    repo = newRepo();
  });

  it('instala la base, los puentes, el esqueleto de decisiones y el manifiesto', () => {
    const res = run(repo, ['init']);
    assert.equal(res.status, 0, res.stderr);

    for (const rel of ['harness/AGENTS.md', 'harness/init.sh', 'harness/agents/lider.md', 'CLAUDE.md', 'GEMINI.md']) {
      assert.ok(fs.existsSync(path.join(repo, rel)), `falta ${rel}`);
    }
    assert.equal(fs.readlinkSync(path.join(repo, 'AGENTS.md')), 'harness/AGENTS.md');
    assert.equal(fs.readlinkSync(path.join(repo, '.claude/agents')), '../harness/agents');
    assert.ok(fs.existsSync(path.join(repo, '.agents/skills/nest-base/SKILL.md')));
    assert.ok(fs.statSync(path.join(repo, 'harness/init.sh')).mode & 0o100, 'init.sh debe ser ejecutable');

    assert.deepEqual(fs.readdirSync(path.join(repo, 'harness/decisiones')).sort(), ['README.md', '_plantilla.md']);
    const m = manifest(repo);
    assert.equal(m.package, '@linktic/arness-back');
    assert.ok(!Object.keys(m.files).some((f) => f.startsWith('harness/decisiones/')), 'decisiones no es gestionada');
    assert.match(read(repo, '.gitignore'), /^harness\/progress\.md$/m);
  });

  it('no se instala dos veces', () => {
    run(repo, ['init']);
    const res = run(repo, ['init']);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /arness sync/);
  });

  it('no pisa un CLAUDE.md propio sin --force', () => {
    fs.writeFileSync(path.join(repo, 'CLAUDE.md'), 'mis reglas\n');
    const res = run(repo, ['init']);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /CLAUDE\.md/);
    assert.equal(read(repo, 'CLAUDE.md'), 'mis reglas\n');
    assert.equal(run(repo, ['init', '--force']).status, 0);
  });

  it('con --copy crea copias en lugar de enlaces', () => {
    assert.equal(run(repo, ['init', '--copy']).status, 0);
    assert.ok(!fs.lstatSync(path.join(repo, 'AGENTS.md')).isSymbolicLink());
    assert.equal(read(repo, 'AGENTS.md'), read(repo, 'harness/AGENTS.md'));
    assert.equal(manifest(repo).links['.claude/agents'], 'copy');
  });

  it('en un repo instalado, init.sh pasa en modo solo harness', () => {
    run(repo, ['init']);
    const res = spawnSync('bash', ['harness/init.sh', '--quick'], { cwd: repo, encoding: 'utf8' });
    assert.equal(res.status, 0, res.stdout);
  });
});

describe('arness sync', () => {
  it('sin cambios de versión no toca nada y conserva decisiones y progress', () => {
    const repo = newRepo();
    run(repo, ['init']);
    fs.writeFileSync(path.join(repo, 'harness/progress.md'), 'estado\n');
    const res = run(repo, ['sync']);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /nuevos: 0 · actualizados: 0 · eliminados: 0/);
    assert.equal(read(repo, 'harness/progress.md'), 'estado\n');
  });

  it('se detiene si la base fue editada a mano, y --force la restaura', () => {
    const repo = newRepo();
    run(repo, ['init']);
    const original = read(repo, 'harness/AGENTS.md');
    fs.appendFileSync(path.join(repo, 'harness/AGENTS.md'), '\nregla local\n');

    const res = run(repo, ['sync']);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /harness\/AGENTS\.md/);
    assert.equal(run(repo, ['status', '--check']).status, 1);

    assert.equal(run(repo, ['sync', '--force']).status, 0);
    assert.equal(read(repo, 'harness/AGENTS.md'), original);
    assert.equal(run(repo, ['status', '--check']).status, 0);
  });

  it('actualiza a una versión nueva: agrega, modifica y elimina solo archivos gestionados', () => {
    const repo = newRepo();
    const v1 = packageCopy('1.0.0', (dir) => fs.writeFileSync(path.join(dir, 'harness/playbooks/obsoleto.md'), 'x\n'));
    const v2 = packageCopy('1.1.0', (dir) => {
      fs.appendFileSync(path.join(dir, 'harness/playbooks/review.md'), '\n- [ ] nuevo check\n');
      fs.writeFileSync(path.join(dir, 'harness/playbooks/nuevo.md'), '# Nuevo\n');
    });

    assert.equal(run(repo, ['init'], v1).status, 0);
    assert.equal(run(repo, ['decision', 'new', 'Usar Zod'], v1).status, 0);

    const dry = run(repo, ['sync', '--dry-run'], v2);
    assert.equal(dry.status, 0, dry.stderr);
    assert.ok(!fs.existsSync(path.join(repo, 'harness/playbooks/nuevo.md')), '--dry-run no escribe');

    const res = run(repo, ['sync'], v2);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /1\.0\.0 → 1\.1\.0/);
    assert.ok(fs.existsSync(path.join(repo, 'harness/playbooks/nuevo.md')));
    assert.ok(!fs.existsSync(path.join(repo, 'harness/playbooks/obsoleto.md')));
    assert.match(read(repo, 'harness/playbooks/review.md'), /nuevo check/);
    assert.ok(fs.existsSync(path.join(repo, 'harness/decisiones/0001-usar-zod.md')), 'sync no toca decisiones');
    assert.equal(manifest(repo).version, '1.1.0');
  });
});

describe('arness decision new', () => {
  it('numera correlativamente, rellena la plantilla y actualiza el índice', () => {
    const repo = newRepo();
    run(repo, ['init']);
    assert.equal(run(repo, ['decision', 'new', 'Agregar conexión Réplica'], PKG_ROOT).status, 0);
    assert.equal(run(repo, ['decision', 'new', 'Usar Zod'], PKG_ROOT).status, 0);

    const body = read(repo, 'harness/decisiones/0001-agregar-conexion-replica.md');
    assert.match(body, /^# 0001\. Agregar conexión Réplica$/m);
    assert.match(body, /^- \*\*Estado:\*\* Propuesta$/m);
    assert.match(body, /^- \*\*Fecha:\*\* \d{4}-\d{2}-\d{2}$/m);

    const index = read(repo, 'harness/decisiones/README.md');
    assert.match(index, /\| \[0001\]\(0001-agregar-conexion-replica\.md\) \|/);
    assert.match(index, /\| \[0002\]\(0002-usar-zod\.md\) \| Usar Zod \| Propuesta \|/);
  });

  it('funciona desde una subcarpeta del repo', () => {
    const repo = newRepo();
    run(repo, ['init']);
    const res = run(path.join(repo, 'harness/playbooks'), ['decision', 'new', 'Algo']);
    assert.equal(res.status, 0, res.stderr);
    assert.ok(fs.existsSync(path.join(repo, 'harness/decisiones/0001-algo.md')));
  });
});

describe('arness (general)', () => {
  it('se niega a instalarse sobre el repo fuente del paquete', () => {
    const res = run(PKG_ROOT, ['init']);
    assert.equal(res.status, 1);
  });

  it('comandos que requieren instalación fallan con un mensaje claro', () => {
    const res = run(newRepo(), ['sync']);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /arness init/);
  });
});
