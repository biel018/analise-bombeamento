/* =====================================================================
   hydraulics.js — Motor de cálculo hidráulico (unidades do SI)
   ---------------------------------------------------------------------
   Modelo: dois reservatórios (1 = sucção, 2 = descarga) ligados por
   uma linha de sucção, a bomba e uma linha de recalque.

   Equação da energia entre as superfícies 1 e 2 (velocidades nulas):

       p1/ρg + z1 + H = p2/ρg + z2 + hL_suc + hL_rec

   →   H = (z2 − z1) + (p2 − p1)/ρg + hL_suc + hL_rec

   Perdas por linha:
       hf = f · (L/D) · V²/2g          (Darcy-Weisbach, distribuída)
       hm = ΣK · V²/2g                 (localizadas)
   Fator de atrito f:
       Re < 2300 ........ f = 64/Re                    (laminar)
       Re ≥ 2300 ........ Colebrook-White (iterativo)  (turbulento)

   NPSH disponível:
       NPSHd = (P_atm + p1)/ρg + z1 − hL_suc − Pv/ρg
   ===================================================================== */
(function (root) {
  'use strict';
  const B = (root.Bomb = root.Bomb || {});
  const G = 9.80665; // m/s²

  /** Pressão atmosférica [Pa] pela altitude [m] — Atmosfera Padrão ISA */
  function atmPressure(alt) {
    return 101325 * Math.pow(1 - 2.25577e-5 * alt, 5.25588);
  }

  /** Swamee-Jain (1976): só serve de chute inicial para o Colebrook */
  function swameeJain(Re, rr) {
    const t = Math.log10(rr / 3.7 + 5.74 / Math.pow(Re, 0.9));
    return 0.25 / (t * t);
  }

  /**
   * Colebrook-White:  1/√f = −2·log10( ε/(3,7·D) + 2,51/(Re·√f) )
   * Resolvido por Newton-Raphson em x = 1/√f.
   */
  function colebrook(Re, rr) {
    let x = 1 / Math.sqrt(swameeJain(Re, rr));
    for (let i = 0; i < 60; i++) {
      const a = rr / 3.7 + (2.51 * x) / Re;
      const F = x + 2 * Math.log10(a);
      const dF = 1 + ((2 / Math.LN10) * (2.51 / Re)) / a;
      const dx = F / dF;
      x -= dx;
      if (Math.abs(dx) < 1e-13) break;
    }
    return 1 / (x * x);
  }

  function frictionFactor(Re, rr) {
    if (!(Re > 0)) return { f: 0, regime: 'repouso' };
    if (Re < 2300) return { f: 64 / Re, regime: 'laminar' };
    const f = colebrook(Re, rr);
    if (Re < 4000) return { f: Math.max(f, 64 / Re), regime: 'transição' };
    return { f, regime: 'turbulento' };
  }

  /** Perdas de UMA linha (sucção ou recalque) para a vazão Q [m³/s] */
  function lineLoss(line, Q, fluid) {
    const { D, L, eps } = line;
    const A = (Math.PI * D * D) / 4;
    const V = Q / A;
    const Re = (fluid.rho * V * D) / fluid.mu;
    const rr = eps / D;
    const ff = frictionFactor(Re, rr);
    const v2g = (V * V) / (2 * G);
    const hf = ff.f * (L / D) * v2g;

    let sumK = 0;
    const items = [];
    for (const it of line.fittings || []) {
      const qty = Number(it.qty) || 0;
      if (qty <= 0) continue;
      const K1 = B.fittings.kOf(it, D);
      const info = B.fittings.describe(it, D);
      items.push({ name: info.name, basis: info.basis, qty, K1, sub: qty * K1 });
      sumK += qty * K1;
    }
    const hm = sumK * v2g;
    return { D, A, L, eps, rr, V, Re, f: ff.f, regime: ff.regime, v2g, hf, sumK, hm, hL: hf + hm, items, fT: B.fittings.fT(D) };
  }

  /**
   * Avalia o sistema completo para a vazão Q [m³/s].
   * inp = { fluid:{rho,mu,pv}, patm, suction:{D,L,eps,fittings}, discharge:{...},
   *         z1, z2 [m], p1, p2 [Pa manométrica] }
   */
  function evaluate(inp, Q) {
    const { fluid, patm, z1, z2, p1, p2 } = inp;
    const rg = fluid.rho * G;
    const S = lineLoss(inp.suction, Q, fluid);
    const R = lineLoss(inp.discharge, Q, fluid);

    const dz = z2 - z1;
    const dpHead = (p2 - p1) / rg;
    const Hstatic = dz + dpHead;
    const H = Hstatic + S.hL + R.hL;

    // Pressões nos flanges da bomba (manométricas) — balanço de energia
    const psGauge = p1 + rg * z1 - rg * S.hL - 0.5 * fluid.rho * S.V * S.V;
    const pdGauge = p2 + rg * z2 + rg * R.hL - 0.5 * fluid.rho * R.V * R.V;

    // NPSH disponível
    const hAtm = (patm + p1) / rg;
    const hv = fluid.pv / rg;
    const npshd = hAtm + z1 - S.hL - hv;

    return {
      Q, S, R, dz, dpHead, Hstatic, H,
      Phyd: rg * Q * H,
      flange: { psGauge, pdGauge, psAbs: patm + psGauge, HmanoFlange: (pdGauge - psGauge) / rg + (R.V * R.V - S.V * S.V) / (2 * G) },
      npsh: { hAtm, z1, hLs: S.hL, hv, npshd }
    };
  }

  /** Só a altura do sistema H(Q) — usada na curva do sistema */
  function systemHead(inp, Q) { return evaluate(inp, Q).H; }

  /** Varredura de vazões para os gráficos */
  function sweep(inp, Qmax, n = 60) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const Q = (Qmax * i) / n;
      const r = evaluate(inp, Q);
      out.push({ Q, H: r.H, npshd: r.npsh.npshd });
    }
    return out;
  }

  B.hyd = { G, atmPressure, colebrook, swameeJain, frictionFactor, lineLoss, evaluate, systemHead, sweep };
})(typeof window !== 'undefined' ? window : globalThis);
