/* =====================================================================
   validate.js — Bateria de testes do motor de cálculo
   Uso:   node tests/validate.js
   ===================================================================== */
const { execSync } = require('child_process');
globalThis.Bomb = {};
for (const f of ['fluids', 'fittings', 'hydraulics', 'pump', 'analysis']) require('../js/' + f + '.js');
require('./case.js');
const B = Bomb, G = 9.80665, C = B.VALIDATION_CASE;

let pass = 0, fail = 0;
const relErr = (a, b) => Math.abs(a - b) / Math.abs(b);
function check(name, got, want, tol, unit = '') {
  const e = want === 0 ? Math.abs(got - want) : relErr(got, want);
  const ok = e <= tol;
  ok ? pass++ : fail++;
  console.log(`${ok ? ' PASS' : ' FAIL'}  ${name.padEnd(52)} obtido=${(+got).toPrecision(6)}${unit}  ref=${(+want).toPrecision(6)}${unit}  erro=${(e * 100).toFixed(3)}%`);
}
function truth(name, cond, extra = '') {
  cond ? pass++ : fail++;
  console.log(`${cond ? ' PASS' : ' FAIL'}  ${name} ${extra}`);
}
const H1 = (t) => console.log(`\n── ${t}`);

/* ---------- 1. Propriedades da água (tabelas: Çengel A-3 / IAPWS) ---------- */
H1('1. Propriedades da água vs. tabela');
const water = [ // T, rho, mu[mPa.s], Pv[kPa]
  [20, 998.21, 1.002, 2.339], [40, 992.2, 0.653, 7.384], [60, 983.2, 0.466, 19.94], [80, 971.8, 0.355, 47.39]
];
for (const [T, rho, mu, pv] of water) {
  const p = B.fluids.props('agua', T);
  check(`ρ água ${T} °C`, p.rho, rho, 0.002, ' kg/m³');
  check(`μ água ${T} °C`, p.mu * 1e3, mu, 0.015, ' mPa·s');
  check(`Pv água ${T} °C`, p.pv / 1e3, pv, 0.015, ' kPa');
}
const o = B.fluids.props('vg46', 40);
check('ν óleo ISO VG 46 a 40 °C (definição do grau)', o.nu * 1e6, 46, 1e-6, ' cSt');
check('ν óleo ISO VG 46 a 100 °C', B.fluids.props('vg46', 100).nu * 1e6, 6.8, 1e-6, ' cSt');
check('Pv etanol 20 °C', B.fluids.props('etanol', 20).pv / 1e3, 5.95, 0.04, ' kPa');

/* ---------- 2. Fator de atrito ---------- */
H1('2. Fator de atrito');
check('Laminar Re=1000: f = 64/Re', B.hyd.frictionFactor(1000, 0.001).f, 0.064, 1e-12);
// tubo liso: equação de Prandtl  1/√f = 2·log10(Re·√f) − 0.8   (resolvida por bisseção, independente)
function prandtl(Re) {
  let lo = 0.005, hi = 0.08;
  for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; const r = 1 / Math.sqrt(m) - (2 * Math.log10(Re * Math.sqrt(m)) - 0.8); r > 0 ? (lo = m) : (hi = m); }
  return (lo + hi) / 2;
}
check('Tubo liso Re=1e5 vs. Prandtl', B.hyd.frictionFactor(1e5, 0).f, prandtl(1e5), 0.004);
check('Tubo liso Re=1e6 vs. Prandtl', B.hyd.frictionFactor(1e6, 0).f, prandtl(1e6), 0.004);
// totalmente rugoso: von Kármán  1/√f = −2·log10(ε/D/3.7)
check('Totalmente rugoso ε/D=0,01 vs. von Kármán', B.hyd.frictionFactor(1e8, 0.01).f, 1 / Math.pow(-2 * Math.log10(0.01 / 3.7), 2), 0.01);
check('Moody clássico Re=1e5, ε/D=0,001 (≈0,0222)', B.hyd.frictionFactor(1e5, 0.001).f, 0.0222, 0.01);
try {
  const grid = JSON.parse(execSync('python3 tests/reference.py --grid', { cwd: __dirname + '/..', stdio: ['ignore', 'pipe', 'ignore'] }).toString());
  let worst = 0;
  for (const [Re, rr, f] of grid) worst = Math.max(worst, relErr(B.hyd.frictionFactor(Re, rr).f, f));
  truth(`Colebrook (Newton) = Colebrook (ponto fixo, Python) em ${grid.length} pontos`, worst < 1e-9, `pior erro = ${worst.toExponential(2)}`);
} catch (e) { console.log(' SKIP  grade Colebrook (python3 indisponível)'); }

/* ---------- 3. Caso de validação vs. cálculo manual independente ---------- */
H1('3. Caso de validação: motor JS × cálculo manual (Python, propriedades de TABELA)');
const mk = (l) => ({ D: l.D_mm / 1000, L: l.L, eps: l.eps_mm / 1000, fittings: l.fittings });
const baseInp = (fluid) => ({
  fluid, patm: C.patm, suction: mk(C.suction), discharge: mk(C.discharge), z1: C.z1, z2: C.z2, p1: C.p1, p2: C.p2,
  Q: C.Q_m3h / 3600, etaPump: C.etaPump, etaMotor: C.etaMotor, npshrFixed: C.npshrFixed, npshMargin: C.npshMargin,
  pumpRows: C.pumpRows_m3h.map((r) => ({ Q: r[0] / 3600, H: r[1], eta: r[2] / 100, npshr: r[3] / 1 }))
});
const tf = C.fluidTable;
const inpTab = baseInp({ ...tf, nu: tf.mu / tf.rho, warnings: [] });
const R = B.analysis.analyze(inpTab);
let ref = null;
try { ref = JSON.parse(execSync('python3 tests/reference.py --json', { cwd: __dirname + '/..', stdio: ['ignore', 'pipe', 'ignore'] }).toString()); } catch (e) { }
if (ref) {
  const d = R.dsg;
  check('Sucção: velocidade V', d.S.V, ref.S.V, 1e-9, ' m/s');
  check('Sucção: Reynolds', d.S.Re, ref.S.Re, 1e-9);
  check('Sucção: fator de atrito f', d.S.f, ref.S.f, 1e-9);
  check('Sucção: perda distribuída hf', d.S.hf, ref.S.hf, 1e-9, ' m');
  check('Sucção: ΣK', d.S.sumK, ref.S.sumK, 1e-9);
  check('Sucção: perda total hL', d.S.hL, ref.S.hL, 1e-9, ' m');
  check('Recalque: velocidade V', d.R.V, ref.R.V, 1e-9, ' m/s');
  check('Recalque: Reynolds', d.R.Re, ref.R.Re, 1e-9);
  check('Recalque: fator de atrito f', d.R.f, ref.R.f, 1e-9);
  check('Recalque: perda distribuída hf', d.R.hf, ref.R.hf, 1e-9, ' m');
  check('Recalque: ΣK', d.R.sumK, ref.R.sumK, 1e-9);
  check('Recalque: perda total hL', d.R.hL, ref.R.hL, 1e-9, ' m');
  check('Altura manométrica H', d.H, ref.H, 1e-9, ' m');
  check('Potência hidráulica', d.Phyd, ref.Phyd, 1e-9, ' W');
  check('Potência no eixo', d.Pshaft, ref.Pshaft, 1e-9, ' W');
  check('Potência elétrica', d.Pelec, ref.Pelec, 1e-9, ' W');
  check('NPSH disponível', d.npsh.npshd, ref.npshd, 1e-9, ' m');
  check('Ponto de operação: Q', R.op.Q * 3600, ref.op.Q_m3h, 1e-6, ' m³/h');
  check('Ponto de operação: H', R.op.H, ref.op.H, 1e-6, ' m');
  check('Ponto de operação: η', R.op.eta, ref.op.eta, 1e-6);
  check('Ponto de operação: potência no eixo', R.op.Pshaft, ref.op.Pshaft, 1e-6, ' W');
  check('Ponto de operação: NPSHd', R.op.e.npsh.npshd, ref.op.npshd, 1e-6, ' m');
  check('Ponto de operação: NPSHr', R.op.npshr, ref.op.npshr, 1e-6, ' m');
  check('Vazão do BEP', R.pump.Qbep * 3600, ref.Qbep_m3h, 0.005, ' m³/h');
} else console.log(' SKIP  comparação com Python (python3 indisponível)');

/* ---------- 4. Mesma instalação usando as CORRELAÇÕES do banco de fluidos ---------- */
H1('4. Caso de validação com propriedades por correlação (o que o app faz de fato)');
const wp = B.fluids.props('agua', 20);
const Rc = B.analysis.analyze(baseInp({ ...wp }));
if (ref) {
  check('H (correlação × tabela)', Rc.dsg.H, ref.H, 0.002, ' m');
  check('NPSHd (correlação × tabela)', Rc.dsg.npsh.npshd, ref.npshd, 0.002, ' m');
  check('Potência no eixo (correlação × tabela)', Rc.dsg.Pshaft, ref.Pshaft, 0.003, ' W');
  check('Vazão de operação (correlação × tabela)', Rc.op.Q * 3600, ref.op.Q_m3h, 0.003, ' m³/h');
}

/* ---------- 5. Coerência física ---------- */
H1('5. Coerência física');
const d = R.dsg;
check('H pela energia entre reservatórios = H pelos flanges da bomba', d.flange.HmanoFlange, d.H, 1e-12, ' m');
check('Pressão no flange de sucção < pressão atmosférica (sucção negativa)', d.flange.psGauge < 0 ? 1 : 0, 1, 0);
// Hagen-Poiseuille (laminar): hf = 32·μ·L·V/(ρ·g·D²)
{
  const oil = B.fluids.props('vg68', 20);
  const D = 0.05, L = 30, Q = 2e-4;
  const line = { D, L, eps: 0, fittings: [] };
  const r = B.hyd.lineLoss(line, Q, oil);
  const V = Q / (Math.PI * D * D / 4);
  check('Laminar: Darcy (64/Re) = Hagen-Poiseuille', r.hf, 32 * oil.mu * L * V / (oil.rho * G * D * D), 1e-9, ' m');
  truth('Regime classificado como laminar', r.regime === 'laminar', `(Re=${r.Re.toFixed(0)})`);
}
// turbulento pleno: dobrar Q ⇒ hf ×≈4
{
  const line = { D: 0.05, L: 100, eps: 0.05, fittings: [] };  // muito rugoso
  const f = { rho: 998, mu: 1e-3, pv: 2339 };
  const a = B.hyd.lineLoss(line, 0.02, f).hf, b = B.hyd.lineLoss(line, 0.04, f).hf;
  check('Regime rugoso: dobrar Q → hf ≈ ×4', b / a, 4, 0.02);
}
// altitude: NPSHd cai ≈ ΔP_atm/ρg
{
  const i0 = baseInp({ ...wp }), i1 = { ...i0, patm: B.hyd.atmPressure(1000) };
  const dN = B.hyd.evaluate(i0, i0.Q).npsh.npshd - B.hyd.evaluate(i1, i1.Q).npsh.npshd;
  check('Altitude 1000 m: perda de NPSHd = ΔPatm/ρg', dN, (101325 - B.hyd.atmPressure(1000)) / (wp.rho * G), 1e-9, ' m');
  check('Patm a 1000 m (ISA ≈ 89,87 kPa)', B.hyd.atmPressure(1000) / 1e3, 89.87, 0.001, ' kPa');
}
// água quente: Pv sobe → NPSHd cai
{
  const cold = B.fluids.props('agua', 20), hot = B.fluids.props('agua', 80);
  const nc = B.hyd.evaluate(baseInp({ ...cold }), 30 / 3600).npsh.npshd, nh = B.hyd.evaluate(baseInp({ ...hot }), 30 / 3600).npsh.npshd;
  truth('Água a 80 °C tem NPSHd bem menor que a 20 °C', nh < nc - 4, `(${nc.toFixed(2)} → ${nh.toFixed(2)} m)`);
}
// ponto de operação é realmente interseção
{
  const Hp = B.pump.pumpH(R.pump, R.op.Q), Hs = B.hyd.systemHead(inpTab, R.op.Q);
  check('Ponto de operação: H_bomba = H_sistema', Hp, Hs, 1e-9, ' m');
}

/* ---------- 6. Cavitação: lógica de classificação ---------- */
H1('6. Critério de cavitação');
const cav = B.analysis.cavitation;
truth('NPSHd < NPSHr → crítico', cav(2, 3, 1.3).level === 'bad');
truth('NPSHr ≤ NPSHd < exigido → atenção', cav(3.2, 3, 1.3).level === 'warn');
truth('NPSHd folgado → ok', cav(6, 3, 1.3).level === 'ok');
truth('NPSHd negativo → crítico', cav(-1, 0.5, 1.3).level === 'bad');
truth('Margem absoluta 0,6 m vale p/ NPSHr pequeno', cav(1.5, 1.0, 1.3).level === 'warn', '(1,3×1,0=1,3 mas exige 1,6)');

/* ---------- 7. Motor ---------- */
H1('7. Seleção do motor');
{
  const m = B.pump.selectMotor(3440.22);
  check('3,44 kW = 4,68 cv → margem 30 %', m.margin, 0.3, 0);
  truth('Motor comercial escolhido = 7,5 cv', m.std === 7.5, `(necessário ${m.need.toFixed(2)} cv)`);
}

console.log(`\n${fail === 0 ? '✔ TODOS OS TESTES PASSARAM' : '✘ HÁ FALHAS'}  —  ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
