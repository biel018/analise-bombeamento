/* =====================================================================
   fluids.js — Banco de dados de fluidos e propriedades físicas
   ---------------------------------------------------------------------
   Cada fluido devolve, para uma temperatura T (°C):
     rho  massa específica       [kg/m³]
     mu   viscosidade dinâmica   [Pa·s]
     pv   pressão de vapor abs.  [Pa]
   Correlações usadas (todas explicadas no Guia de Estudo):
     • Água ........ Kell (1975) p/ densidade; Vogel p/ viscosidade;
                     Antoine p/ pressão de vapor.
     • Etanol ...... densidade linear; Andrade (ln μ = A + B/T); Antoine.
     • Óleos ISO VG  densidade com dilatação térmica; ASTM D341 (Walther)
                     p/ viscosidade cinemática a partir de ν40 e ν100.
   ===================================================================== */
(function (root) {
  'use strict';
  const B = (root.Bomb = root.Bomb || {});
  const K0 = 273.15;
  const MMHG = 133.322; // Pa por mmHg

  /* ---------- Água (0 a 100 °C) ---------- */
  function waterRho(T) {
    // Kell (1975): ρ em kg/m³, T em °C
    const num = 999.83952 + 16.945176 * T - 7.9870401e-3 * T ** 2
      - 46.170461e-6 * T ** 3 + 105.56302e-9 * T ** 4 - 280.54253e-12 * T ** 5;
    return num / (1 + 16.87985e-3 * T);
  }
  // Vogel: μ = A·10^(B/(T−C)), T em K  →  Pa·s
  function waterMu(T) { return 2.414e-5 * Math.pow(10, 247.8 / (T + K0 - 140)); }
  // Antoine (1–100 °C): log10(P[mmHg]) = A − B/(C+T)
  function waterPv(T) { return Math.pow(10, 8.07131 - 1730.63 / (233.426 + T)) * MMHG; }

  /* ---------- Etanol (0 a 70 °C) ---------- */
  function ethanolRho(T) { return 789.3 - 0.85 * (T - 20); }
  // Andrade ancorado em μ(20 °C) = 1,200 mPa·s, B = 1693,5 K (ajuste a 20 e 50 °C)
  function ethanolMu(T) { return 1.2e-3 * Math.exp(1693.5 * (1 / (T + K0) - 1 / (20 + K0))); }
  function ethanolPv(T) { return Math.pow(10, 8.20417 - 1642.89 / (230.3 + T)) * MMHG; }

  /* ---------- Óleos minerais ISO VG (ASTM D341) ---------- */
  // log10(log10(ν + 0,7)) = A − B·log10(T[K])   com ν em mm²/s (cSt)
  function walther(nu40, nu100) {
    const w = (nu) => Math.log10(Math.log10(nu + 0.7));
    const t1 = Math.log10(40 + K0), t2 = Math.log10(100 + K0);
    const Bc = (w(nu40) - w(nu100)) / (t2 - t1);
    const Ac = w(nu40) + Bc * t1;
    return (T) => Math.pow(10, Math.pow(10, Ac - Bc * Math.log10(T + K0))) - 0.7; // ν [cSt]
  }
  function oil(id, name, rho15, nu40, nu100) {
    const nu = walther(nu40, nu100);
    return {
      id, name, range: [0, 120],
      source: `ISO VG: ν40 = ${nu40} cSt, ν100 = ${nu100} cSt (valores típicos); ρ15 = ${rho15} kg/m³; β = 6,5·10⁻⁴ K⁻¹; Pv desprezível`,
      props: (T) => {
        const rho = rho15 * (1 - 6.5e-4 * (T - 15));
        return { rho, mu: rho * nu(T) * 1e-6, pv: 1 };
      }
    };
  }

  const DB = [
    {
      id: 'agua', name: 'Água', range: [0, 100],
      source: 'ρ: Kell (1975) · μ: Vogel · Pv: Antoine',
      props: (T) => ({ rho: waterRho(T), mu: waterMu(T), pv: waterPv(T) })
    },
    {
      id: 'etanol', name: 'Etanol', range: [0, 70],
      source: 'ρ: linear (−0,85 kg/m³·K) · μ: Andrade · Pv: Antoine',
      props: (T) => ({ rho: ethanolRho(T), mu: ethanolMu(T), pv: ethanolPv(T) })
    },
    oil('vg32', 'Óleo hidráulico ISO VG 32', 865, 32, 5.4),
    oil('vg46', 'Óleo hidráulico ISO VG 46', 870, 46, 6.8),
    oil('vg68', 'Óleo hidráulico ISO VG 68', 875, 68, 8.7),
    { id: 'custom', name: 'Fluido personalizado…', range: [-Infinity, Infinity], source: 'valores informados pelo usuário' }
  ];

  /** Devolve {rho, mu, nu, pv, warnings[], source}. `custom` = {rho, mu, pv} (SI). */
  function props(id, T, custom) {
    const f = DB.find((x) => x.id === id) || DB[0];
    const warnings = [];
    let p;
    if (f.id === 'custom') {
      p = { rho: custom.rho, mu: custom.mu, pv: custom.pv };
    } else {
      p = f.props(T);
      if (T < f.range[0] || T > f.range[1]) {
        warnings.push(`Temperatura fora da faixa de validade das correlações de "${f.name}" (${f.range[0]}–${f.range[1]} °C).`);
      }
    }
    return { rho: p.rho, mu: p.mu, nu: p.mu / p.rho, pv: p.pv, warnings, source: f.source, name: f.name };
  }

  B.fluids = { list: DB.map(({ id, name }) => ({ id, name })), props, waterRho, waterMu, waterPv };
})(typeof window !== 'undefined' ? window : globalThis);
