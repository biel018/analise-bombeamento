/* =====================================================================
   app.js — Interface: lê o formulário, chama o motor e desenha resultados
   ===================================================================== */
(function () {
  'use strict';
  const B = window.Bomb;
  const $ = (id) => document.getElementById(id);
  const nf = (v, d = 2) => Number.isFinite(v) ? Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const FLOW = { m3h: 1 / 3600, ls: 1 / 1000, m3s: 1, gpm: 6.30902e-5 };   // → m³/s

  /* ------------------------------------------------------------------ */
  /*  Exemplos prontos                                                   */
  /* ------------------------------------------------------------------ */
  const CURVA_EXEMPLO = [[0, 38, '', ''], [10, 36.9, 42, 1.2], [20, 33.6, 60, 1.6], [30, 28.2, 68, 2.3], [40, 20.5, 66, 3.4], [50, 10.6, 55, 5.0]];
  const INSTALACAO_AGUA = {
    q: 30, alt: 0, z1: -2, z2: 18, p1: 0, p2: 0, etaP: 65, etaM: 90, npshr: 2.3, margem: 1.3,
    s: { dn: '4"', d: 102.26, l: 5, mat: 'aco', eps: 0.045, fit: [['pe-articulada', 1], ['cotovelo90', 1]] },
    d: { dn: '2 1/2"', d: 62.71, l: 45, mat: 'aco', eps: 0.045, fit: [['cotovelo90', 4], ['gaveta', 1], ['retencao', 1], ['saida', 1]] },
    curva: CURVA_EXEMPLO
  };
  const PRESETS = {
    validacao: { ...INSTALACAO_AGUA, fluid: 'agua', T: 20 },
    quente: { ...INSTALACAO_AGUA, fluid: 'agua', T: 90 },
    oleo: {
      fluid: 'vg46', T: 30, q: 10, alt: 0, z1: 1, z2: 8, p1: 0, p2: 0, etaP: 45, etaM: 90, npshr: 2, margem: 1.3,
      s: { dn: '2 1/2"', d: 62.71, l: 3, mat: 'aco', eps: 0.045, fit: [['entrada-viva', 1], ['cotovelo90', 1]] },
      d: { dn: '2"', d: 52.5, l: 60, mat: 'aco', eps: 0.045, fit: [['cotovelo90', 3], ['gaveta', 1], ['saida', 1]] },
      curva: []
    },
    // Desafio: salmoura em unidade industrial em região de altitude (Patm local = 88,0 kPa abs,
    // equivalente a ~1173 m pela atmosfera padrão ISA — o mesmo modelo usado pelo campo Altitude).
    salmoura: {
      fluid: 'custom', cRho: 1070, cMu: 1.20, cPv: 2.1,
      q: 50, alt: 1173.43, z1: -0.5, z2: 35.0, p1: 0, p2: 0, etaP: 74, etaM: 92, npshr: 5.6, margem: 1.3,
      opHoras: 22, opDias: 28, opTarifa: 0.79, compareLowered: true,
      s: {
        dn: '', d: 100, l: 25, mat: 'aco', eps: 0.045,
        fit: [['kc', 1, 0.50], ['kc', 3, 0.90], ['kc', 1, 0.15], ['kc', 1, 2.00]]
      },
      d: {
        dn: '', d: 90, l: 140, mat: 'aco', eps: 0.045,
        fit: [['kc', 8, 0.90], ['kc', 2, 0.15], ['kc', 1, 2.00], ['kc', 1, 10.00], ['kc', 1, 1.00]]
      },
      curva: []
    }
  };

  /* ------------------------------------------------------------------ */
  /*  Construção do formulário                                           */
  /* ------------------------------------------------------------------ */
  const fitOptions = B.fittings.FITTINGS.map((f) => `<option value="${f.id}">${esc(f.name)}</option>`).join('');

  function lineFieldset(x, titulo, dica) {
    const dn = B.fittings.PIPES.map((p) => `<option value="${esc(p.dn)}">${esc(p.dn)} — ${p.id.toFixed(2).replace('.', ',')} mm</option>`).join('');
    const mats = B.fittings.MATERIALS.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
    return `<fieldset>
      <legend>${titulo}</legend>
      <p class="ajuda">${dica}</p>
      <label>Tubo de aço Sch 40 (atalho)
        <select id="${x}-dn"><option value="">Outro — informar diâmetro interno</option>${dn}</select>
      </label>
      <div class="linha2">
        <label>Diâmetro interno
          <span class="campo"><input id="${x}-d" type="number" step="any" inputmode="decimal" min="0"><span class="un">mm</span></span>
        </label>
        <label>Comprimento reto
          <span class="campo"><input id="${x}-l" type="number" step="any" inputmode="decimal" min="0"><span class="un">m</span></span>
        </label>
      </div>
      <div class="linha2">
        <label>Material
          <select id="${x}-mat">${mats}</select>
        </label>
        <label>Rugosidade ε
          <span class="campo"><input id="${x}-eps" type="number" step="any" inputmode="decimal" min="0"><span class="un">mm</span></span>
        </label>
      </div>
      <div class="cabeca-pecas"><span>Singularidades</span><span>Qtd.</span><span></span></div>
      <div class="pecas" id="${x}-fit"></div>
      <button type="button" class="botao-fino" data-add="${x}">+ Adicionar singularidade</button>
    </fieldset>`;
  }

  function addFitting(x, id = 'cotovelo90', qty = 1, K = 1) {
    const row = document.createElement('div');
    row.className = 'peca';
    row.innerHTML = `<select class="peca-tipo" aria-label="Tipo de singularidade">${fitOptions}</select>
      <input class="peca-qtd" type="number" min="0" step="1" inputmode="numeric" value="${qty}" aria-label="Quantidade">
      <button type="button" class="peca-x" aria-label="Remover singularidade">×</button>
      <input class="peca-k escondido" type="number" step="any" min="0" value="${K}" aria-label="Coeficiente K" placeholder="K">`;
    row.querySelector('select').value = id;
    toggleK(row);
    $(x + '-fit').appendChild(row);
  }
  function toggleK(row) {
    row.querySelector('.peca-k').classList.toggle('escondido', row.querySelector('select').value !== 'kc');
  }

  function addPumpRow(v = ['', '', '', '']) {
    const tr = document.createElement('tr');
    tr.innerHTML = [0, 1, 2, 3].map((i) => `<td><input type="number" step="any" inputmode="decimal" value="${v[i] === '' ? '' : v[i]}" aria-label="${['Vazão', 'Altura', 'Rendimento', 'NPSH requerido'][i]}"></td>`).join('') +
      '<td><button type="button" class="peca-x" aria-label="Remover ponto">×</button></td>';
    $('curva-corpo').appendChild(tr);
  }

  /* ------------------------------------------------------------------ */
  /*  Leitura e validação                                                */
  /* ------------------------------------------------------------------ */
  const num = (id) => { const v = $(id).value; return v === '' ? NaN : parseFloat(v); };

  function readLine(x, nome, errors) {
    const D = num(x + '-d') / 1000, L = num(x + '-l'), eps = num(x + '-eps') / 1000;
    if (!(D > 0)) errors.push(`${nome}: informe o diâmetro interno (> 0).`);
    if (!(L >= 0)) errors.push(`${nome}: informe o comprimento reto (≥ 0).`);
    if (!(eps >= 0)) errors.push(`${nome}: informe a rugosidade (≥ 0).`);
    const fittings = [...$(x + '-fit').children].map((row) => ({
      id: row.querySelector('select').value,
      qty: parseFloat(row.querySelector('.peca-qtd').value) || 0,
      K: parseFloat(row.querySelector('.peca-k').value)
    }));
    return { D, L, eps, fittings };
  }

  function readInputs() {
    const errors = [];
    const id = $('fluid').value, T = num('temp');
    let custom = null;
    if (id === 'custom') {
      custom = { rho: num('c-rho'), mu: num('c-mu') / 1000, pv: num('c-pv') * 1000 };
      if (!(custom.rho > 0)) errors.push('Fluido: informe a massa específica.');
      if (!(custom.mu > 0)) errors.push('Fluido: informe a viscosidade.');
      if (!(custom.pv >= 0)) errors.push('Fluido: informe a pressão de vapor.');
    } else if (!Number.isFinite(T)) errors.push('Fluido: informe a temperatura.');
    const Q = num('q') * FLOW[$('qunit').value];
    if (!(Q > 0)) errors.push('Informe a vazão de projeto (> 0).');
    const suction = readLine('s', 'Sucção', errors), discharge = readLine('d', 'Recalque', errors);
    const z1 = num('z1'), z2 = num('z2'), p1 = num('p1'), p2 = num('p2');
    if (![z1, z2, p1, p2].every(Number.isFinite)) errors.push('Preencha os desníveis e as pressões (use 0 se não houver).');
    const etaPump = num('eta-p') / 100, etaMotor = num('eta-m') / 100;
    if (!(etaPump > 0 && etaPump <= 1)) errors.push('Rendimento da bomba deve estar entre 0 e 100 %.');
    if (!(etaMotor > 0 && etaMotor <= 1)) errors.push('Rendimento do motor deve estar entre 0 e 100 %.');
    if (errors.length) return { errors };

    const alt = Number.isFinite(num('alt')) ? num('alt') : 0;
    const fluid = B.fluids.props(id, T, custom);
    const pumpRows = [...$('curva-corpo').children].map((tr) => {
      const v = [...tr.querySelectorAll('input')].map((i) => (i.value === '' ? NaN : parseFloat(i.value)));
      return { Q: v[0] / 3600, H: v[1], eta: v[2] / 100, npshr: v[3] };
    }).filter((r) => Number.isFinite(r.Q) || Number.isFinite(r.H));
    return {
      errors, inp: {
        fluid, T, alt, patm: B.hyd.atmPressure(alt), suction, discharge, z1, z2, p1: p1 * 1000, p2: p2 * 1000, Q,
        etaPump, etaMotor, npshrFixed: num('npshr'), npshMargin: Math.max(1, num('margem') || 1.3), pumpRows,
        opHoras: num('op-horas'), opDias: num('op-dias'), opTarifa: num('op-tarifa'),
        compareLowered: $('cmp-rebaixo').checked
      }
    };
  }

  /* ------------------------------------------------------------------ */
  /*  Desenho dos resultados                                             */
  /* ------------------------------------------------------------------ */
  const cvTxt = (m) => (m.std ? nf(m.std, m.std % 1 ? 2 : 0) : '—');
  const numero = (rot, val, un, nota, cls = '') =>
    `<div class="numero ${cls}"><small>${rot}</small><b>${val}<i>${un}</i></b><em>${nota}</em></div>`;
  const NIVEL = { bad: 'Crítico', warn: 'Atenção', ok: 'OK', info: 'Info' };

  function renderResults(r) {
    const { inp, dsg: d, pump, op } = r;
    const cnt = (l) => r.alerts.filter((a) => a.level === l).length;
    const stTxt = { ok: 'Instalação sem alertas', warn: 'Atenção: há pontos a revisar', bad: 'Há problemas críticos no projeto' }[r.status];
    const stSub = [cnt('bad') && `${cnt('bad')} crítico(s)`, cnt('warn') && `${cnt('warn')} atenção`, `${cnt('ok')} verificação(ões) em ordem`].filter(Boolean).join(' · ');
    const cavCls = d.cav.level === 'info' ? '' : 'cav-' + d.cav.level;
    const cavNota = Number.isFinite(d.npshr) ? `NPSHr ${nf(d.npshr)} m · folga ${nf(d.cav.margin)} m` : 'NPSHr não informado';

    let h = `<div class="status status-${r.status}" role="status"><strong>${stTxt}</strong><span>${stSub}</span></div>`;
    h += `<div class="numeros">` +
      numero('Altura manométrica', nf(d.H), 'm', `estática ${nf(d.Hstatic)} m + perdas ${nf(d.S.hL + d.R.hL)} m`, 'destaque') +
      numero('Potência no eixo', nf(d.Pshaft / 1000), 'kW', `hidráulica ${nf(d.Phyd / 1000)} kW · η ${nf(inp.etaPump * 100, 0)} %`) +
      numero('Motor sugerido', cvTxt(d.motor), 'cv', d.motor.std ? `${nf(d.motor.kW)} kW · margem ${nf(d.motor.margin * 100, 0)} %` : 'acima da tabela') +
      numero('NPSH disponível', nf(d.npsh.npshd), 'm', cavNota, cavCls) + `</div>`;

    h += `<div class="bloco-res"><h2>Perfil de energia do sistema</h2>
      <p class="sub">A linha escura é a energia do líquido ao longo do caminho: cai com o atrito e com as singularidades, sobe no salto laranja da bomba. A distância entre a linha de energia na entrada da bomba e a linha vermelha de vapor é o NPSH disponível.</p>
      <div class="rolagem">${B.charts.energyChart(r)}</div>
      <p class="nota so-celular">Deslize o gráfico para os lados para ver tudo.</p>
      <p class="nota">Desenho esquemático: a escala horizontal não é proporcional, as perdas localizadas aparecem agrupadas nas extremidades e o tubo de recalque foi desenhado em rampa. Os valores nos pontos-chave (superfícies, entrada e saída da bomba) são exatos. Vazão de projeto: ${nf(inp.Q * 3600, 1)} m³/h.</p>`;

    if (pump) {
      h += `<h2>Curvas: bomba × sistema</h2>`;
      if (op && op.Q) {
        h += `</div><div class="numeros" style="margin-top:8px">` +
          numero('Vazão de operação', nf(op.Q * 3600, 1), 'm³/h', `${op.dev >= 0 ? '+' : ''}${nf(op.dev * 100, 1)} % sobre o projeto${op.ratioBep ? ` · ${nf(op.ratioBep * 100, 0)} % do BEP` : ''}`, 'destaque') +
          numero('Altura de operação', nf(op.H), 'm', `η ${nf(op.eta * 100, 1)} %${pump.eta ? '' : ' (informado)'}`) +
          numero('Potência no eixo', nf(op.Pshaft / 1000), 'kW', `motor ${cvTxt(op.motor)} cv`) +
          numero('NPSH na operação', nf(op.e.npsh.npshd), 'm', Number.isFinite(op.npshr) ? `NPSHr ${nf(op.npshr)} m · folga ${nf(op.cav.margin)} m` : 'NPSHr não informado', op.cav.level === 'info' ? '' : 'cav-' + op.cav.level) + `</div><div class="bloco-res">`;
      }
      h += `<div class="dois"><div class="rolagem">${B.charts.curvesChart(r)}</div><div class="rolagem">${B.charts.npshChart(r)}</div></div>
        <p class="nota">Curva da bomba ajustada por parábola aos pontos digitados (R² = ${nf(pump.H.r2, 4)}). O ponto de operação é onde a curva da bomba cruza a curva do sistema.</p>`;
    } else {
      h += `<h2>Curvas: bomba × sistema</h2><div class="rolagem">${B.charts.curvesChart(r)}</div>
        <p class="nota">Preencha ao menos 3 pontos (Q, H) da curva da bomba para ver o ponto de operação e o NPSH requerido.</p>`;
    }

    // alertas
    const ordem = { bad: 0, warn: 1, info: 2, ok: 3 };
    const alertas = [...r.alerts].sort((a, b) => ordem[a.level] - ordem[b.level]);
    h += `<h2>Alertas e indicadores de condição operacional</h2><ul class="alertas">` +
      alertas.map((a) => `<li class="al-${a.level}"><span class="nivel">${NIVEL[a.level]}</span><b>${esc(a.title)}</b><p>${esc(a.text)}</p></li>`).join('') + `</ul>`;

    // tabela por linha
    const S = d.S, R = d.R, f = inp.fluid;
    const row = (rot, a, b, cls = '') => `<tr class="${cls}"><td>${rot}</td><td>${a}</td><td>${b}</td></tr>`;
    const row1 = (rot, a) => `<tr><td>${rot}</td><td>${a}</td></tr>`;
    h += `<h2>Perdas de carga por linha</h2><table class="dados"><thead><tr><th></th><th>Sucção</th><th>Recalque</th></tr></thead><tbody>` +
      row('Diâmetro interno (mm)', nf(S.D * 1000), nf(R.D * 1000)) +
      row('Comprimento reto (m)', nf(S.L), nf(R.L)) +
      row('Velocidade (m/s)', nf(S.V, 3), nf(R.V, 3)) +
      row('Reynolds · regime', `${nf(S.Re, 0)} · ${S.regime}`, `${nf(R.Re, 0)} · ${R.regime}`) +
      row('Rugosidade relativa ε/D', nf(S.rr, 5), nf(R.rr, 5)) +
      row('Fator de atrito f', nf(S.f, 5), nf(R.f, 5)) +
      row('Perda distribuída h<sub>f</sub> (m)', nf(S.hf, 3), nf(R.hf, 3)) +
      row('ΣK das singularidades', nf(S.sumK, 3), nf(R.sumK, 3)) +
      row('Perda localizada h<sub>m</sub> (m)', nf(S.hm, 3), nf(R.hm, 3)) +
      row('Perda total h<sub>L</sub> (m)', nf(S.hL, 3), nf(R.hL, 3), 'total') +
      `</tbody></table>
      <h3>Pressões nos flanges da bomba</h3>
      <table class="dados"><tbody>
        ${row1('Sucção (kPa man. · kPa abs.)', `${nf(d.flange.psGauge / 1000)} · ${nf(d.flange.psAbs / 1000)}`)}
        ${row1('Recalque (kPa man. · bar man.)', `${nf(d.flange.pdGauge / 1000)} · ${nf(d.flange.pdGauge / 1e5)}`)}
      </tbody></table>
      <h3>Propriedades do fluido usadas</h3>
      <table class="dados"><tbody>
        ${row1('Massa específica ρ', `${nf(f.rho, 2)} kg/m³`)}
        ${row1('Viscosidade dinâmica μ · cinemática ν', `${nf(f.mu * 1000, 4)} mPa·s · ${nf(f.nu * 1e6, 3)} cSt`)}
        ${row1('Pressão de vapor Pv (abs.)', `${nf(f.pv / 1000, 3)} kPa`)}
        ${row1('Pressão atmosférica local', `${nf(inp.patm / 1000, 2)} kPa`)}
      </tbody></table>` + renderEnergy(inp, d) + `</div>`;
    return h;
  }

  function renderEnergy(inp, d) {
    const { opHoras: hd, opDias: dm, opTarifa: tar } = inp;
    if (![hd, dm, tar].every((v) => Number.isFinite(v) && v > 0)) return '';
    const kWh = (d.Pelec / 1000) * hd * dm;
    const custo = kWh * tar;
    const row1 = (rot, a) => `<tr><td>${rot}</td><td>${a}</td></tr>`;
    return `<h3>Consumo de energia estimado</h3>
      <table class="dados"><tbody>
        ${row1('Regime de operação', `${nf(hd, 1)} h/dia × ${nf(dm, 0)} dias/mês`)}
        ${row1('Potência elétrica', `${nf(d.Pelec / 1000, 3)} kW`)}
        ${row1('Consumo mensal', `${nf(kWh, 0)} kWh`)}
        ${row1('Custo mensal (tarifa ' + nf(tar, 2) + ' R$/kWh)', `R$ ${nf(custo, 2)}`)}
      </tbody></table>`;
  }

  function renderCompare(r1, r2) {
    const d1 = r1.dsg, d2 = r2.dsg;
    const row = (rot, v1, v2) => `<tr><td>${rot}</td><td>${nf(v1, 3)}</td><td>${nf(v2, 3)}</td><td>${v2 - v1 >= 0 ? '+' : ''}${nf(v2 - v1, 3)}</td></tr>`;
    return `<section class="comparacao"><h2>Condição adicional: bomba rebaixada 1 m</h2>
      <p>Mesmos níveis físicos dos reservatórios; a bomba (referência de cotas) desce 1 m. Isso desloca z₁ e z₂ em +1 m cada, na mesma proporção — como H = (z₂ − z₁) + (p₂ − p₁)/ρg + perdas, e a diferença (z₂ − z₁) não muda, a <b>altura manométrica total permanece igual</b> pelo balanço de Bernoulli entre as duas superfícies. O que muda é a distribuição de energia ao longo do caminho: a sucção fica com mais carga disponível (menos desnível negativo), então o <b>NPSH disponível aumenta</b> exatamente 1 m.</p>
      <table class="dados"><thead><tr><th></th><th>Condição base</th><th>Rebaixada 1 m</th><th>Δ</th></tr></thead><tbody>` +
      row('Perda total na sucção (m)', d1.S.hL, d2.S.hL) +
      row('Perda total no recalque (m)', d1.R.hL, d2.R.hL) +
      row('Altura manométrica H (m)', d1.H, d2.H) +
      row('Potência no eixo (kW)', d1.Pshaft / 1000, d2.Pshaft / 1000) +
      row('Potência elétrica (kW)', d1.Pelec / 1000, d2.Pelec / 1000) +
      row('NPSH disponível (m)', d1.npsh.npshd, d2.npsh.npshd) +
      row('NPSH requerido (m)', d1.npshr, d2.npshr) +
      row('Margem de NPSH (m)', d1.cav.margin, d2.cav.margin) +
      `</tbody></table></section>`;
  }

  function updateFixed(r) {
    const d = r.dsg;
    const lvl = r.status === 'ok' ? '' : r.status;
    $('resumo-fixo').innerHTML =
      `<div><span>Altura H</span><b>${nf(d.H, 1)} m</b></div>` +
      `<div><span>Potência no eixo</span><b>${nf(d.Pshaft / 1000, 2)} kW</b></div>` +
      `<div><span>NPSH disponível</span><b>${nf(d.npsh.npshd, 1)} m</b></div>` +
      `<div><span>Status</span><b><i class="ponto ${lvl}"></i>${{ ok: 'OK', warn: 'Atenção', bad: 'Crítico' }[r.status]}</b></div>`;
  }

  function updateFluidInfo() {
    const id = $('fluid').value;
    const custom = id === 'custom';
    $('fluid-std').classList.toggle('escondido', custom);
    $('fluid-custom').classList.toggle('escondido', !custom);
    const T = num('temp');
    if (!custom && !Number.isFinite(T)) { $('fluid-info').innerHTML = 'Informe a temperatura.'; return; }
    const p = B.fluids.props(id, T, custom ? { rho: num('c-rho'), mu: num('c-mu') / 1000, pv: num('c-pv') * 1000 } : null);
    if (![p.rho, p.mu, p.pv].every(Number.isFinite)) { $('fluid-info').innerHTML = ''; return; }
    $('fluid-info').innerHTML = `<b>ρ</b> ${nf(p.rho, 1)} kg/m³ · <b>μ</b> ${nf(p.mu * 1000, 3)} mPa·s · <b>ν</b> ${nf(p.nu * 1e6, 2)} cSt<br><b>Pv</b> ${nf(p.pv / 1000, 2)} kPa (abs.)` +
      (p.warnings.length ? `<br><span style="color:var(--critico)">${esc(p.warnings[0])}</span>` : '');
  }

  /* ------------------------------------------------------------------ */
  /*  Atualização                                                        */
  /* ------------------------------------------------------------------ */
  let timer = null;
  function schedule() { clearTimeout(timer); timer = setTimeout(update, 60); }

  function update() {
    updateFluidInfo();
    const { errors, inp } = readInputs();
    if (errors.length) {
      $('resultados').innerHTML = `<div class="erro"><strong>Complete os dados para calcular</strong><ul>${errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>`;
      $('memoria-corpo').innerHTML = ''; $('resumo-fixo').innerHTML = '';
      return;
    }
    try {
      const r = B.analysis.analyze(inp);
      let html = renderResults(r);
      if (inp.compareLowered) {
        const r2 = B.analysis.analyze({ ...inp, z1: inp.z1 + 1, z2: inp.z2 + 1 });
        html = renderCompare(r, r2) + html;
      }
      $('resultados').innerHTML = html;
      $('memoria-corpo').innerHTML = B.memoria.build(r);
      updateFixed(r);
    } catch (e) {
      console.error(e);
      $('resultados').innerHTML = `<div class="erro"><strong>Não foi possível calcular</strong><p>${esc(e.message)}</p></div>`;
    }
  }

  function applyPreset(name) {
    const p = PRESETS[name];
    $('fluid').value = p.fluid; $('temp').value = p.T ?? '';
    if (p.fluid === 'custom') { $('c-rho').value = p.cRho; $('c-mu').value = p.cMu; $('c-pv').value = p.cPv; }
    $('q').value = p.q; $('qunit').value = 'm3h'; $('qunit').dataset.prev = 'm3h';
    $('alt').value = p.alt;
    for (const x of ['s', 'd']) {
      const L = p[x];
      $(x + '-dn').value = L.dn; $(x + '-d').value = L.d; $(x + '-l').value = L.l;
      $(x + '-mat').value = L.mat; $(x + '-eps').value = L.eps;
      $(x + '-fit').innerHTML = '';
      L.fit.forEach((f) => addFitting(x, f[0], f[1], f[2]));
    }
    ['z1', 'z2', 'p1', 'p2'].forEach((k) => ($(k).value = p[k]));
    $('eta-p').value = p.etaP; $('eta-m').value = p.etaM; $('npshr').value = p.npshr; $('margem').value = p.margem;
    $('op-horas').value = p.opHoras ?? ''; $('op-dias').value = p.opDias ?? ''; $('op-tarifa').value = p.opTarifa ?? '';
    $('cmp-rebaixo').checked = !!p.compareLowered;
    $('curva-corpo').innerHTML = '';
    p.curva.forEach((v) => addPumpRow(v));
    for (let i = p.curva.length; i < 4; i++) addPumpRow();
    update();
  }

  /* ------------------------------------------------------------------ */
  /*  Inicialização                                                      */
  /* ------------------------------------------------------------------ */
  function init() {
    $('bloco-s').innerHTML = lineFieldset('s', 'Sucção', 'Da superfície do reservatório até o flange de entrada da bomba. Inclua a válvula de pé ou a entrada.');
    $('bloco-d').innerHTML = lineFieldset('d', 'Recalque', 'Do flange de saída da bomba até o ponto de descarga. Inclua a saída da tubulação (K = 1).');
    $('fluid').innerHTML = B.fluids.list.map((f) => `<option value="${f.id}">${esc(f.name)}</option>`).join('');

    const form = $('entrada');
    form.addEventListener('input', (e) => {
      const t = e.target;
      // digitar diâmetro/rugosidade manualmente desfaz o atalho de catálogo
      if (t.id === 's-d' || t.id === 'd-d') $(t.id[0] + '-dn').value = '';
      if (t.id === 's-eps' || t.id === 'd-eps') $(t.id[0] + '-mat').value = 'custom';
      schedule();
    });
    form.addEventListener('change', (e) => {
      const t = e.target;
      if (t.id === 's-dn' || t.id === 'd-dn') {
        const p = B.fittings.PIPES.find((k) => k.dn === t.value);
        if (p) $(t.id[0] + '-d').value = p.id;
      }
      if (t.id === 's-mat' || t.id === 'd-mat') {
        const m = B.fittings.MATERIALS.find((k) => k.id === t.value);
        if (m && m.id !== 'custom') $(t.id[0] + '-eps').value = m.eps;
      }
      if (t.classList.contains('peca-tipo')) toggleK(t.closest('.peca'));
      if (t.id === 'qunit') {   // converte o valor digitado para manter a mesma vazão física
        const old = t.dataset.prev || 'm3h', q = num('q');
        if (Number.isFinite(q)) $('q').value = +(q * FLOW[old] / FLOW[t.value]).toPrecision(6);
        t.dataset.prev = t.value;
      }
      schedule();
    });
    form.addEventListener('click', (e) => {
      const add = e.target.closest('[data-add]');
      if (add) { addFitting(add.dataset.add); schedule(); return; }
      if (e.target.closest('#add-ponto')) { addPumpRow(); return; }
      const x = e.target.closest('.peca-x');
      if (x) { (x.closest('.peca') || x.closest('tr')).remove(); schedule(); }
    });
    $('qunit').dataset.prev = 'm3h';
    document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => { applyPreset(b.dataset.preset); window.scrollTo({ top: 0 }); }));

    applyPreset('validacao');
  }
  document.addEventListener('DOMContentLoaded', init);
})();
