/* =====================================================================
   analysis.js — Junta hidráulica + bomba, e gera alertas operacionais
   ===================================================================== */
(function (root) {
  'use strict';
  const B = (root.Bomb = root.Bomb || {});
  const G = 9.80665;

  /* Critérios de projeto adotados (justificados no Guia de Estudo) */
  const CRIT = {
    vSucMax: 1.8, vSucBad: 2.5,      // m/s — sucção: quanto menor, melhor p/ NPSH
    vRecMax: 3.0, vRecBad: 4.0,      // m/s — recalque: compromisso custo × perda/ruído
    vMin: 0.3,                       // m/s — abaixo disso: tubo superdimensionado
    npshAbsMargin: 0.6,              // m — margem mínima absoluta NPSHd − NPSHr
    porLow: 0.7, porHigh: 1.2,       // região preferencial de operação (HI): 70–120 % do BEP
    aorLow: 0.5, aorHigh: 1.3,       // fora disso: operação crítica
    nuViscous: 20e-6                 // m²/s (20 cSt) — acima disso a curva da bomba precisa de correção
  };

  /**
   * Avalia cavitação.  NPSHd deve superar NPSHr com folga:
   *   NPSHd ≥ máx( razão · NPSHr ,  NPSHr + 0,6 m )
   */
  function cavitation(npshd, npshr, ratio) {
    if (!Number.isFinite(npshr)) return { level: 'info', required: NaN, margin: NaN };
    const required = Math.max(ratio * npshr, npshr + CRIT.npshAbsMargin);
    let level = 'ok';
    if (npshd <= 0 || npshd < npshr) level = 'bad';
    else if (npshd < required) level = 'warn';
    return { level, required, margin: npshd - npshr, ratio: npshd / npshr };
  }

  const fmt = (v, d = 2) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const m3h = (Q) => Q * 3600;

  function analyze(inp) {
    const H = B.hyd, P = B.pump;
    const rg = inp.fluid.rho * G;
    const alerts = [];
    const add = (level, title, text) => alerts.push({ level, title, text });

    /* ---- Ponto de projeto (vazão exigida) ---- */
    const dsg = H.evaluate(inp, inp.Q);
    const pump = P.buildPump(inp.pumpRows || []);
    dsg.Pshaft = dsg.Phyd / inp.etaPump;
    dsg.Pelec = dsg.Pshaft / inp.etaMotor;
    dsg.motor = P.selectMotor(dsg.Pshaft);
    dsg.npshr = P.pumpNpshr(pump, inp.Q, inp.npshrFixed);
    dsg.cav = cavitation(dsg.npsh.npshd, dsg.npshr, inp.npshMargin);

    /* ---- Ponto de operação com a bomba selecionada ---- */
    let op = null;
    if (pump) {
      const o = P.operatingPoint(inp, pump);
      if (o.Q) {
        const e = H.evaluate(inp, o.Q);
        const eta = P.pumpEta(pump, o.Q, inp.etaPump);
        const Pshaft = e.Phyd / eta;
        const npshr = P.pumpNpshr(pump, o.Q, inp.npshrFixed);
        op = {
          Q: o.Q, H: e.H, eta, Pshaft, Pelec: Pshaft / inp.etaMotor, e,
          motor: P.selectMotor(Pshaft),
          npshr, cav: cavitation(e.npsh.npshd, npshr, inp.npshMargin),
          ratioBep: pump.Qbep ? o.Q / pump.Qbep : null,
          dev: (o.Q - inp.Q) / inp.Q,
          extrapolated: o.Q > pump.Qmax * 1.05
        };
      } else {
        op = { Q: null, reason: o.reason };
      }
    }

    /* ---- Curvas para os gráficos ---- */
    const Qplot = Math.max(inp.Q * 1.6, pump ? pump.Qmax * 1.1 : 0, op && op.Q ? op.Q * 1.25 : 0);
    const sweep = H.sweep(inp, Qplot, 60);

    /* ---- Alertas ---- */
    (inp.fluid.warnings || []).forEach((w) => add('warn', 'Propriedades do fluido', w));

    const vs = dsg.S.V, vr = dsg.R.V;
    if (vs > CRIT.vSucBad) add('bad', 'Velocidade na sucção muito alta', `${fmt(vs)} m/s (> ${fmt(CRIT.vSucBad, 1)} m/s). Aumente o diâmetro da sucção: velocidade alta reduz o NPSH disponível e favorece cavitação.`);
    else if (vs > CRIT.vSucMax) add('warn', 'Velocidade na sucção elevada', `${fmt(vs)} m/s. Faixa usual de projeto: até ${fmt(CRIT.vSucMax, 1)} m/s.`);
    else if (vs < CRIT.vMin) add('info', 'Velocidade na sucção baixa', `${fmt(vs)} m/s — tubulação provavelmente superdimensionada.`);
    else add('ok', 'Velocidade na sucção', `${fmt(vs)} m/s — dentro da faixa usual (≤ ${fmt(CRIT.vSucMax, 1)} m/s).`);

    if (vr > CRIT.vRecBad) add('bad', 'Velocidade no recalque muito alta', `${fmt(vr)} m/s (> ${fmt(CRIT.vRecBad, 1)} m/s). Risco de ruído, erosão e perda de carga excessiva. Aumente o diâmetro.`);
    else if (vr > CRIT.vRecMax) add('warn', 'Velocidade no recalque elevada', `${fmt(vr)} m/s. Faixa usual: até ${fmt(CRIT.vRecMax, 1)} m/s.`);
    else if (vr < CRIT.vMin) add('info', 'Velocidade no recalque baixa', `${fmt(vr)} m/s — tubulação provavelmente superdimensionada.`);
    else add('ok', 'Velocidade no recalque', `${fmt(vr)} m/s — dentro da faixa usual (≤ ${fmt(CRIT.vRecMax, 1)} m/s).`);

    for (const [nome, L] of [['sucção', dsg.S], ['recalque', dsg.R]]) {
      if (L.regime === 'transição') add('warn', `Regime de transição (${nome})`, `Re = ${fmt(L.Re, 0)}. Entre 2300 e 4000 o fator de atrito é incerto; foi adotado o valor turbulento (conservador).`);
      if (L.regime === 'laminar') add('info', `Escoamento laminar (${nome})`, `Re = ${fmt(L.Re, 0)}. Usado f = 64/Re; perda proporcional à viscosidade e à vazão.`);
    }

    if (inp.fluid.nu > CRIT.nuViscous) add('warn', 'Fluido viscoso', `ν = ${fmt(inp.fluid.nu * 1e6, 1)} cSt (> 20 cSt). As curvas de fabricante são levantadas com água: aplique a correção de viscosidade (ANSI/HI 9.6.7) sobre H, Q e η.`);

    const cavMsg = (c, npshd, npshr, where) => {
      if (c.level === 'info') return;
      const base = `NPSHd = ${fmt(npshd)} m; NPSHr = ${fmt(npshr)} m; folga = ${fmt(c.margin)} m; exigido ≥ ${fmt(c.required)} m.`;
      if (c.level === 'bad') add('bad', `Cavitação provável ${where}`, `${base} Reduza perdas na sucção (diâmetro maior, menos peças), abaixe a bomba em relação ao nível, resfrie o fluido ou escolha bomba com menor NPSHr.`);
      else if (c.level === 'warn') add('warn', `Margem de NPSH insuficiente ${where}`, `${base} A bomba não cavita, mas sem folga de segurança.`);
      else add('ok', `NPSH adequado ${where}`, base);
    };
    if (dsg.cav.level === 'info') add('info', 'NPSHr não informado', `NPSHd = ${fmt(dsg.npsh.npshd)} m. Informe o NPSHr da bomba (folha de dados ou curva) para avaliar a cavitação.`);
    else cavMsg(dsg.cav, dsg.npsh.npshd, dsg.npshr, 'no ponto de projeto');

    if (pump && op) {
      if (!op.Q) {
        add('bad', 'Bomba não vence o sistema', op.reason === 'shutoff'
          ? `A altura da bomba em vazão nula (${fmt(pump.H.coef[0])} m) é menor que a altura estática do sistema (${fmt(dsg.Hstatic)} m).`
          : 'A curva da bomba não cruza a curva do sistema na faixa analisada.');
      } else {
        if (op.cav.level !== 'info') cavMsg(op.cav, op.e.npsh.npshd, op.npshr, 'no ponto de operação');
        if (op.ratioBep) {
          const r = op.ratioBep;
          const pct = `${fmt(r * 100, 0)} % do BEP`;
          if (r < CRIT.aorLow || r > CRIT.aorHigh) add('bad', 'Operação muito afastada do BEP', `Q = ${fmt(m3h(op.Q))} m³/h (${pct}). Vibração, recirculação e desgaste prematuro. Reavalie a bomba escolhida.`);
          else if (r < CRIT.porLow || r > CRIT.porHigh) add('warn', 'Fora da região preferencial de operação', `Q = ${fmt(m3h(op.Q))} m³/h (${pct}). Recomendado 70–120 % do BEP.`);
          else add('ok', 'Região preferencial de operação', `Q = ${fmt(m3h(op.Q))} m³/h (${pct}) — dentro de 70–120 % do BEP.`);
        }
        if (Math.abs(op.dev) > 0.1) add('info', 'Vazão real difere da de projeto', `A bomba entrega ${fmt(m3h(op.Q))} m³/h contra ${fmt(m3h(inp.Q))} m³/h de projeto (${op.dev > 0 ? '+' : ''}${fmt(op.dev * 100, 1)} %). Ajuste com válvula de estrangulamento, inversor de frequência ou redução do rotor.`);
        if (op.extrapolated) add('warn', 'Extrapolação da curva', 'O ponto de operação está além da última vazão da tabela da bomba: o ajuste parabólico é extrapolado e pouco confiável.');
        if (pump.eta && op.eta < 0.4) add('warn', 'Rendimento baixo', `η = ${fmt(op.eta * 100, 1)} % no ponto de operação.`);
      }
    }
    if (!pump) add('info', 'Sem curva da bomba', 'Preencha ao menos 3 pontos (Q, H) na tabela da bomba para obter o ponto de operação.');

    // Nota geral de status
    const rank = { ok: 0, info: 0, warn: 1, bad: 2 };
    const worst = alerts.reduce((m, a) => Math.max(m, rank[a.level]), 0);
    const status = ['ok', 'warn', 'bad'][worst];

    return { inp, dsg, pump, op, sweep, Qplot, alerts, status, rg };
  }

  B.analysis = { analyze, cavitation, CRIT };
})(typeof window !== 'undefined' ? window : globalThis);
