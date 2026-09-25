/* =====================================================================
   fittings.js — Rugosidades, diâmetros comerciais e singularidades
   ---------------------------------------------------------------------
   Perdas localizadas pelo MÉTODO K:      h_m = K · V² / (2g)

   Duas famílias de coeficientes:
     kind 'K'  → K fixo (entradas, saídas)
     kind 'LD' → K = (Le/D) · fT    (método de Crane TP-410)
                 fT = fator de atrito em regime plenamente turbulento
                 de tubo de aço comercial, que depende do diâmetro.
     kind 'KC' → K informado pelo usuário
   ===================================================================== */
(function (root) {
  'use strict';
  const B = (root.Bomb = root.Bomb || {});

  /* Rugosidade absoluta ε [mm] — Çengel & Cimbala, Tab. 8-2 / Crane TP-410 */
  const MATERIALS = [
    { id: 'aco', name: 'Aço comercial (novo)', eps: 0.045 },
    { id: 'galv', name: 'Aço galvanizado', eps: 0.15 },
    { id: 'fofo', name: 'Ferro fundido', eps: 0.26 },
    { id: 'fofo-asf', name: 'Ferro fundido asfaltado', eps: 0.12 },
    { id: 'inox', name: 'Aço inox / cobre / trefilado', eps: 0.0015 },
    { id: 'pvc', name: 'PVC / PEAD / plástico', eps: 0.0015 },
    { id: 'custom', name: 'Outro (informar ε)', eps: 0.1 }
  ];

  /* Diâmetros internos — tubo de aço Schedule 40 (ASME B36.10) [mm] */
  const PIPES = [
    { dn: '1/2"', id: 15.80 }, { dn: '3/4"', id: 20.93 }, { dn: '1"', id: 26.64 },
    { dn: '1 1/4"', id: 35.05 }, { dn: '1 1/2"', id: 40.89 }, { dn: '2"', id: 52.50 },
    { dn: '2 1/2"', id: 62.71 }, { dn: '3"', id: 77.93 }, { dn: '4"', id: 102.26 },
    { dn: '5"', id: 128.19 }, { dn: '6"', id: 154.05 }, { dn: '8"', id: 202.72 }
  ];

  /* fT de Crane TP-410 (tubo de aço comercial, regime plenamente turbulento)
     pontos (diâmetro interno [mm], fT); interpolação linear entre pontos */
  const FT_TABLE = [
    [15, 0.027], [20, 0.025], [25, 0.023], [32, 0.022], [40, 0.021], [50, 0.019],
    [65, 0.018], [80, 0.018], [100, 0.017], [125, 0.016], [150, 0.015], [200, 0.014],
    [250, 0.014], [300, 0.013], [400, 0.013], [450, 0.012], [600, 0.012]
  ];
  function fT(D_m) {
    const d = D_m * 1000;
    if (d <= FT_TABLE[0][0]) return FT_TABLE[0][1];
    if (d >= FT_TABLE[FT_TABLE.length - 1][0]) return FT_TABLE[FT_TABLE.length - 1][1];
    for (let i = 1; i < FT_TABLE.length; i++) {
      const [d1, f1] = FT_TABLE[i - 1], [d2, f2] = FT_TABLE[i];
      if (d <= d2) return f1 + ((f2 - f1) * (d - d1)) / (d2 - d1);
    }
    return 0.015;
  }

  const FITTINGS = [
    { id: 'entrada-viva', name: 'Entrada de reservatório (borda viva)', kind: 'K', value: 0.5 },
    { id: 'entrada-reentrante', name: 'Entrada reentrante (tubo projetado)', kind: 'K', value: 0.78 },
    { id: 'entrada-arred', name: 'Entrada bem arredondada (r/D ≥ 0,15)', kind: 'K', value: 0.04 },
    { id: 'saida', name: 'Saída da tubulação (energia cinética perdida)', kind: 'K', value: 1.0 },
    { id: 'cotovelo90', name: 'Cotovelo 90° padrão', kind: 'LD', value: 30 },
    { id: 'cotovelo90-lr', name: 'Cotovelo 90° raio longo', kind: 'LD', value: 20 },
    { id: 'cotovelo45', name: 'Cotovelo 45°', kind: 'LD', value: 16 },
    { id: 'curva180', name: 'Curva de retorno 180°', kind: 'LD', value: 50 },
    { id: 'te-passagem', name: 'Tê – escoamento em linha reta', kind: 'LD', value: 20 },
    { id: 'te-derivacao', name: 'Tê – escoamento pela derivação', kind: 'LD', value: 60 },
    { id: 'gaveta', name: 'Válvula gaveta (aberta)', kind: 'LD', value: 8 },
    { id: 'esfera', name: 'Válvula esfera (aberta)', kind: 'LD', value: 3 },
    { id: 'globo', name: 'Válvula globo (aberta)', kind: 'LD', value: 340 },
    { id: 'borboleta', name: 'Válvula borboleta (2" a 8")', kind: 'LD', value: 45 },
    { id: 'retencao', name: 'Válvula de retenção de portinhola', kind: 'LD', value: 100 },
    { id: 'retencao-lift', name: 'Válvula de retenção de pistão (globo)', kind: 'LD', value: 600 },
    { id: 'pe-articulada', name: 'Válvula de pé com crivo (disco articulado)', kind: 'LD', value: 75 },
    { id: 'pe-pistao', name: 'Válvula de pé com crivo (pistão)', kind: 'LD', value: 420 },
    { id: 'kc', name: 'Outro – informar K (filtro, redução, medidor…)', kind: 'KC', value: 1.0 }
  ];

  /** K de UMA peça, dado o diâmetro interno D [m]. item = {id, K?} */
  function kOf(item, D) {
    const def = FITTINGS.find((f) => f.id === item.id);
    if (!def) return 0;
    if (def.kind === 'K') return def.value;
    if (def.kind === 'LD') return def.value * fT(D);
    return Number.isFinite(item.K) ? item.K : def.value;
  }
  function describe(item, D) {
    const def = FITTINGS.find((f) => f.id === item.id);
    if (!def) return { name: '?', basis: '' };
    const c = (v, d) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
    if (def.kind === 'K') return { name: def.name, basis: `K = ${c(def.value, 2)}` };
    if (def.kind === 'LD') return { name: def.name, basis: `K = (Le/D)·fT = ${def.value} × ${c(fT(D), 4)}` };
    return { name: def.name, basis: 'K informado' };
  }

  B.fittings = { MATERIALS, PIPES, FITTINGS, FT_TABLE, fT, kOf, describe };
})(typeof window !== 'undefined' ? window : globalThis);
