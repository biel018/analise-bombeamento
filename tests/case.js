/* Caso de validação (também usado como exemplo inicial da interface) */
(function (root) {
  const B = (root.Bomb = root.Bomb || {});
  // Valores de tabela da água a 20 °C (Çengel, Tab. A-3) usados na conferência manual
  B.VALIDATION_CASE = {
    fluidTable: { rho: 998.2, mu: 1.002e-3, pv: 2339 },
    patm: 101325,
    Q_m3h: 30,
    suction: { D_mm: 102.26, L: 5, eps_mm: 0.045, fittings: [{ id: 'pe-articulada', qty: 1 }, { id: 'cotovelo90', qty: 1 }] },
    discharge: { D_mm: 62.71, L: 45, eps_mm: 0.045, fittings: [{ id: 'cotovelo90', qty: 4 }, { id: 'gaveta', qty: 1 }, { id: 'retencao', qty: 1 }, { id: 'saida', qty: 1 }] },
    z1: -2, z2: 18, p1: 0, p2: 0,
    etaPump: 0.65, etaMotor: 0.90, npshrFixed: 2.3, npshMargin: 1.3,
    pumpRows_m3h: [
      [0, 38, NaN, NaN], [10, 36.9, 42, 1.2], [20, 33.6, 60, 1.6],
      [30, 28.2, 68, 2.3], [40, 20.5, 66, 3.4], [50, 10.6, 55, 5.0]
    ]
  };
})(typeof window !== 'undefined' ? window : globalThis);
