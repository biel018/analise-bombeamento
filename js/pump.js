/* =====================================================================
   pump.js — Curva da bomba, ponto de operação e seleção do motor
   ---------------------------------------------------------------------
   As curvas do fabricante (H×Q, η×Q, NPSHr×Q) são digitadas como tabela.
   Cada uma é ajustada por uma parábola (mínimos quadrados):

        y(Q) = a + b·Q + c·Q²

   Ponto de operação = interseção  H_bomba(Q) = H_sistema(Q)
   (achada por varredura + bisseção).
   ===================================================================== */
(function (root) {
  'use strict';
  const B = (root.Bomb = root.Bomb || {});
  const G = 9.80665;

  /** Resolve sistema linear pequeno por eliminação de Gauss com pivotamento */
  function solveLinear(A, b) {
    const n = b.length;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let i = 0; i < n; i++) {
      let p = i;
      for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
      [M[i], M[p]] = [M[p], M[i]];
      if (Math.abs(M[i][i]) < 1e-14) return null;
      for (let r = i + 1; r < n; r++) {
        const k = M[r][i] / M[i][i];
        for (let c = i; c <= n; c++) M[r][c] -= k * M[i][c];
      }
    }
    const x = Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let s = M[i][n];
      for (let c = i + 1; c < n; c++) s -= M[i][c] * x[c];
      x[i] = s / M[i][i];
    }
    return x;
  }

  /** Ajuste polinomial por mínimos quadrados (grau ≤ 2). x é normalizado p/ estabilidade. */
  function polyfit(xs, ys, deg = 2) {
    const n = xs.length;
    deg = Math.min(deg, n - 1);
    const s = Math.max(...xs.map(Math.abs)) || 1;
    const X = xs.map((x) => x / s);
    const m = deg + 1;
    const A = Array.from({ length: m }, () => Array(m).fill(0));
    const b = Array(m).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) {
        b[j] += ys[i] * Math.pow(X[i], j);
        for (let k = 0; k < m; k++) A[j][k] += Math.pow(X[i], j + k);
      }
    }
    const coef = solveLinear(A, b);
    if (!coef) return null;
    const p = { coef, scale: s, deg, xmin: Math.min(...xs), xmax: Math.max(...xs) };
    const mean = ys.reduce((a, v) => a + v, 0) / n;
    let ssr = 0, sst = 0;
    for (let i = 0; i < n; i++) { ssr += (ys[i] - polyval(p, xs[i])) ** 2; sst += (ys[i] - mean) ** 2; }
    p.r2 = sst > 0 ? 1 - ssr / sst : 1;
    return p;
  }
  function polyval(p, x) {
    const t = x / p.scale;
    let y = 0;
    for (let k = p.coef.length - 1; k >= 0; k--) y = y * t + p.coef[k];
    return y;
  }

  /**
   * rows = [{Q [m³/s], H [m], eta [0–1] | NaN, npshr [m] | NaN}]
   * Devolve null se houver menos de 3 pontos (Q,H) válidos.
   */
  function buildPump(rows) {
    const ok = (v) => Number.isFinite(v);
    const hp = rows.filter((r) => ok(r.Q) && ok(r.H) && r.Q >= 0);
    if (hp.length < 3) return null;
    const H = polyfit(hp.map((r) => r.Q), hp.map((r) => r.H), 2);
    if (!H) return null;
    const ep = rows.filter((r) => ok(r.Q) && ok(r.eta) && r.eta > 0);
    const np = rows.filter((r) => ok(r.Q) && ok(r.npshr) && r.npshr >= 0);
    const eta = ep.length >= 3 ? polyfit(ep.map((r) => r.Q), ep.map((r) => r.eta), 2) : null;
    const npshr = np.length >= 3 ? polyfit(np.map((r) => r.Q), np.map((r) => r.npshr), 2) : null;

    // BEP: vazão de máximo rendimento dentro da faixa dos dados
    let Qbep = null, etaBep = null;
    if (eta) {
      let best = -Infinity;
      for (let i = 0; i <= 400; i++) {
        const q = eta.xmin + ((eta.xmax - eta.xmin) * i) / 400;
        const e = polyval(eta, q);
        if (e > best) { best = e; Qbep = q; }
      }
      etaBep = best;
    }
    return { H, eta, npshr, Qmin: H.xmin, Qmax: H.xmax, Qbep, etaBep };
  }

  const pumpH = (pump, Q) => polyval(pump.H, Q);
  const pumpEta = (pump, Q, fixed) => {
    if (pump && pump.eta) return Math.min(0.95, Math.max(0.05, polyval(pump.eta, Q)));
    return fixed;
  };
  const pumpNpshr = (pump, Q, fixed) => {
    if (pump && pump.npshr) return Math.max(0, polyval(pump.npshr, Q));
    return fixed;
  };

  /** Interseção curva da bomba × curva do sistema. Devolve Q [m³/s] ou null. */
  function operatingPoint(inp, pump) {
    const g = (Q) => pumpH(pump, Q) - B.hyd.systemHead(inp, Q);
    if (g(0) <= 0) return { Q: null, reason: 'shutoff' };
    const step = pump.Qmax / 300;
    let lo = 0, hi = null;
    for (let Q = step; Q <= pump.Qmax * 3; Q += step) {
      if (g(Q) <= 0) { hi = Q; lo = Q - step; break; }
    }
    if (hi === null) return { Q: null, reason: 'nocross' };
    for (let i = 0; i < 80; i++) {
      const mid = 0.5 * (lo + hi);
      if (g(mid) > 0) lo = mid; else hi = mid;
    }
    return { Q: 0.5 * (lo + hi), reason: null };
  }

  /* -------- Motor -------- */
  const MOTORS_CV = [0.25, 0.33, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6, 7.5, 10, 12.5, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 200];
  const CV = 735.49875; // W
  /** Margem de segurança usual (Macintyre): ≤2cv 50%, ≤5cv 30%, ≤10cv 20%, ≤20cv 15%, >20cv 10% */
  function selectMotor(PshaftW) {
    const cv = PshaftW / CV;
    const margin = cv <= 2 ? 0.5 : cv <= 5 ? 0.3 : cv <= 10 ? 0.2 : cv <= 20 ? 0.15 : 0.1;
    const need = cv * (1 + margin);
    const std = MOTORS_CV.find((m) => m >= need) || null;
    return { cv, margin, need, std, kW: std ? (std * CV) / 1000 : null };
  }

  B.pump = { polyfit, polyval, buildPump, pumpH, pumpEta, pumpNpshr, operatingPoint, selectMotor, G };
})(typeof window !== 'undefined' ? window : globalThis);
