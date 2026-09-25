/* =====================================================================
   charts.js — Gráficos em SVG puro (sem bibliotecas externas)
   ===================================================================== */
(function (root) {
  'use strict';
  const B = (root.Bomb = root.Bomb || {});
  const nf = (v, d = 2) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

  /* ---------- eixos ---------- */
  function niceStep(range, target) {
    const raw = range / target, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
  }
  function ticks(min, max, target = 6) {
    const step = niceStep(max - min, target), out = [];
    for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(10));
    return { ticks: out, step };
  }
  const tickFmt = (v, step) => nf(v, step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step) - 1e-9)));
  function niceMax(v) { const t = ticks(0, v, 5); return t.ticks[t.ticks.length - 1] + (t.ticks[t.ticks.length - 1] < v ? t.step : 0); }

  /** limite inferior do eixo y: 0, ou um valor 'redondo' abaixo do mínimo se houver negativos */
  const yminOf = (v) => (v < 0 ? -niceMax(-v * 1.1) : 0);

  /**
   * Gráfico de linhas genérico.
   * o = { w,h, xlabel,ylabel, xmin,xmax,ymin,ymax,
   *       series:[{name,color,width,dash,points:[[x,y]..]}],
   *       dots:[{x,y,color}], marks:[{x,y,label,color,fill,dx,dy,anchor}],
   *       vlines:[{x,label,color}], bands:[{x0,x1,color,label}], hlines:[{y,label,color,dash}] }
   */
  function lineChart(o) {
    const W = o.w || 600, H = o.h || 350, m = { l: 58, r: 20, t: 40, b: 50 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const X = (v) => m.l + ((v - o.xmin) / (o.xmax - o.xmin)) * iw;
    const Y = (v) => m.t + ih - ((v - o.ymin) / (o.ymax - o.ymin)) * ih;
    const tx = ticks(o.xmin, o.xmax, 7), ty = ticks(o.ymin, o.ymax, 6);
    let s = `<svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title || 'gráfico')}" xmlns="http://www.w3.org/2000/svg">`;

    // faixas
    for (const b of o.bands || []) {
      const x0 = Math.max(X(b.x0), m.l), x1 = Math.min(X(b.x1), m.l + iw);
      if (x1 > x0) s += `<rect x="${x0}" y="${m.t}" width="${x1 - x0}" height="${ih}" fill="${b.color}" opacity=".13"/>` +
        (b.label ? `<text x="${(x0 + x1) / 2}" y="${m.t + ih - 8}" text-anchor="middle" class="t-mini" fill="${b.color}">${esc(b.label)}</text>` : '');
    }
    // grade e eixos
    for (const v of ty.ticks) s += `<line x1="${m.l}" x2="${m.l + iw}" y1="${Y(v)}" y2="${Y(v)}" class="grade-l"/><text x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end" class="t-eixo">${tickFmt(v, ty.step)}</text>`;
    for (const v of tx.ticks) s += `<line x1="${X(v)}" x2="${X(v)}" y1="${m.t}" y2="${m.t + ih}" class="grade-l"/><text x="${X(v)}" y="${m.t + ih + 18}" text-anchor="middle" class="t-eixo">${tickFmt(v, tx.step)}</text>`;
    s += `<rect x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" class="moldura"/>`;
    s += `<text x="${m.l + iw / 2}" y="${H - 8}" text-anchor="middle" class="t-rot">${esc(o.xlabel)}</text>`;
    s += `<text transform="translate(15 ${m.t + ih / 2}) rotate(-90)" text-anchor="middle" class="t-rot">${esc(o.ylabel)}</text>`;

    // linhas de referência
    for (const l of o.vlines || []) {
      if (l.x < o.xmin || l.x > o.xmax) continue;
      s += `<line x1="${X(l.x)}" x2="${X(l.x)}" y1="${m.t}" y2="${m.t + ih}" stroke="${l.color}" stroke-dasharray="5 4" stroke-width="1.3"/>` +
        (l.label ? `<text x="${X(l.x) + 4}" y="${m.t + 13}" class="t-mini" fill="${l.color}">${esc(l.label)}</text>` : '');
    }
    for (const l of o.hlines || []) {
      if (l.y < o.ymin || l.y > o.ymax) continue;
      s += `<line x1="${m.l}" x2="${m.l + iw}" y1="${Y(l.y)}" y2="${Y(l.y)}" stroke="${l.color}" stroke-dasharray="${l.dash || '5 4'}" stroke-width="1.3"/>` +
        (l.label ? `<text x="${m.l + iw - 4}" y="${Y(l.y) - 5}" text-anchor="end" class="t-mini" fill="${l.color}">${esc(l.label)}</text>` : '');
    }
    // séries (recortadas à área do gráfico)
    s += `<clipPath id="clip-${o.id}"><rect x="${m.l}" y="${m.t}" width="${iw}" height="${ih}"/></clipPath><g clip-path="url(#clip-${o.id})">`;
    for (const se of o.series) {
      const d = se.points.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
      s += `<path d="${d}" fill="none" stroke="${se.color}" stroke-width="${se.width || 2.6}" ${se.dash ? `stroke-dasharray="${se.dash}"` : ''} stroke-linejoin="round"/>`;
    }
    for (const d of o.dots || []) s += `<circle cx="${X(d.x)}" cy="${Y(d.y)}" r="3.2" fill="${d.color}" opacity=".85"/>`;
    s += '</g>';
    // marcas com rótulo
    for (const k of o.marks || []) {
      if (k.x == null || !isFinite(k.y)) continue;
      s += `<circle cx="${X(k.x)}" cy="${Y(k.y)}" r="6" fill="${k.fill ? k.color : '#FBFCFC'}" stroke="${k.color}" stroke-width="2.4"/>`;
      s += `<text x="${X(k.x) + (k.dx ?? 10)}" y="${Y(k.y) + (k.dy ?? -10)}" text-anchor="${k.anchor || 'start'}" class="t-marca" fill="${k.color}">${esc(k.label)}</text>`;
    }
    // legenda
    let lx = m.l;
    for (const se of o.series.filter((z) => z.name)) {
      s += `<line x1="${lx}" x2="${lx + 22}" y1="20" y2="20" stroke="${se.color}" stroke-width="3" ${se.dash ? `stroke-dasharray="${se.dash}"` : ''}/><text x="${lx + 28}" y="24" class="t-leg">${esc(se.name)}</text>`;
      lx += 36 + se.name.length * 6.6;
    }
    return s + '</svg>';
  }

  /* ---------- gráfico H × Q ---------- */
  function curvesChart(r) {
    const { inp, pump, op, sweep, Qplot } = r;
    const P = B.pump, k = 3600;
    const sys = sweep.map((p) => [p.Q * k, p.H]);
    const series = [{ name: 'Curva do sistema', color: '#0A6C7E', points: sys }];
    const dots = [], marks = [], vlines = [], bands = [];
    let ymax = Math.max(...sys.map((p) => p[1]));
    if (pump) {
      const pts = sweep.filter((p) => p.Q <= pump.Qmax * 1.05).map((p) => [p.Q * k, P.pumpH(pump, p.Q)]).filter((p) => p[1] > -5);
      series.push({ name: 'Curva da bomba', color: '#D9781C', points: pts });
      ymax = Math.max(ymax, ...pts.map((p) => p[1]));
      for (const row of inp.pumpRows || []) if (isFinite(row.Q) && isFinite(row.H)) dots.push({ x: row.Q * k, y: row.H, color: '#D9781C' });
      if (pump.Qbep) {
        vlines.push({ x: pump.Qbep * k, label: 'BEP', color: '#5B6F77' });
        bands.push({ x0: 0.7 * pump.Qbep * k, x1: 1.2 * pump.Qbep * k, color: '#2E7D57', label: 'região preferencial' });
      }
    }
    marks.push({ x: inp.Q * k, y: r.dsg.H, label: `Projeto ${nf(inp.Q * k, 1)} m³/h · ${nf(r.dsg.H, 1)} m`, color: '#0A6C7E', dx: 12, dy: 26 });
    if (op && op.Q) marks.push({ x: op.Q * k, y: op.H, label: `Operação ${nf(op.Q * k, 1)} m³/h · ${nf(op.H, 1)} m`, color: '#B85E0D', fill: true, dx: -14, dy: -14, anchor: 'end' });
    return lineChart({
      id: 'hq', title: 'Curva do sistema e curva da bomba', w: 600, h: 360, xlabel: 'Vazão Q (m³/h)', ylabel: 'Altura H (m)',
      xmin: 0, xmax: niceMax(Qplot * k), ymin: yminOf(Math.min(...sys.map((p) => p[1]))), ymax: niceMax(ymax * 1.08), series, dots, marks, vlines, bands
    });
  }

  /* ---------- gráfico NPSH × Q ---------- */
  function npshChart(r) {
    const { inp, pump, op, sweep, Qplot } = r, P = B.pump, k = 3600;
    const series = [{ name: 'NPSH disponível', color: '#0A6C7E', points: sweep.map((p) => [p.Q * k, p.npshd]) }];
    const hlines = [], marks = [];
    let ymax = Math.max(...sweep.map((p) => p.npshd), 1);
    if (pump && pump.npshr) {
      const req = sweep.filter((p) => p.Q > 0).map((p) => [p.Q * k, P.pumpNpshr(pump, p.Q, NaN)]);
      series.push({ name: 'NPSH requerido', color: '#D9781C', points: req });
      series.push({ name: 'Exigido (com folga)', color: '#B93A32', dash: '6 4', width: 1.8, points: req.map(([q, v]) => [q, Math.max(inp.npshMargin * v, v + B.analysis.CRIT.npshAbsMargin)]) });
      ymax = Math.max(ymax, ...req.map((p) => p[1] * 1.4));
    } else if (Number.isFinite(inp.npshrFixed)) {
      const v = inp.npshrFixed;
      hlines.push({ y: v, color: '#D9781C', label: `NPSHr = ${nf(v)} m (informado)`, dash: '' });
      hlines.push({ y: Math.max(inp.npshMargin * v, v + B.analysis.CRIT.npshAbsMargin), color: '#B93A32', label: 'exigido (com folga)' });
    }
    marks.push({ x: inp.Q * k, y: r.dsg.npsh.npshd, label: 'Projeto', color: '#0A6C7E', dx: 10, dy: -12 });
    if (op && op.Q) marks.push({ x: op.Q * k, y: op.e.npsh.npshd, label: 'Operação', color: '#B85E0D', fill: true, dx: -10, dy: -12, anchor: 'end' });
    return lineChart({
      id: 'npsh', title: 'NPSH disponível e requerido', w: 600, h: 340, xlabel: 'Vazão Q (m³/h)', ylabel: 'NPSH (m)',
      xmin: 0, xmax: niceMax(Qplot * k), ymin: yminOf(Math.min(...sweep.map((p) => p.npshd))), ymax: niceMax(ymax * 1.1), series, marks, hlines
    });
  }

  /* ---------- Diagrama de energia ao longo do sistema ---------- */
  function energyChart(r) {
    const { inp, dsg: d, rg } = r;
    const hv = inp.fluid.pv / rg;                       // Pv/ρg
    const E1 = (inp.patm + inp.p1) / rg + inp.z1;       // energia total (abs.) na superfície de sucção
    const Es = E1 - d.S.hL, Ed = Es + d.H;              // entrada e saída da bomba
    const E2 = (inp.patm + inp.p2) / rg + inp.z2;
    const W = 760, Ht = 440, m = { l: 62, r: 22, t: 30, b: 44 };
    const iw = W - m.l - m.r, ih = Ht - m.t - m.b;
    const x0 = 0.05, xp = 0.40, xe = 0.95;              // posições relativas (escala horizontal esquemática)
    const yBot = Math.min(inp.z1, 0, hv) - 1.5;
    let yTop = Math.max(Ed, E1, E2) + 2.5;
    // garante ~110 px livres acima da linha de sucção para a legenda
    const eSuc = Math.max(E1, Es), need = 110 / ih;
    if ((yTop - eSuc) / (yTop - yBot) < need) yTop = (eSuc - need * yBot) / (1 - need);
    const X = (u) => m.l + u * iw, Y = (v) => m.t + ih - ((v - yBot) / (yTop - yBot)) * ih;
    const ty = ticks(yBot, yTop, 7);
    let s = `<svg class="grafico energia" viewBox="0 0 ${W} ${Ht}" role="img" aria-label="Diagrama de energia ao longo do sistema de bombeamento" xmlns="http://www.w3.org/2000/svg">`;
    for (const v of ty.ticks) s += `<line x1="${m.l}" x2="${m.l + iw}" y1="${Y(v)}" y2="${Y(v)}" class="grade-l"/><text x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end" class="t-eixo">${tickFmt(v, ty.step)}</text>`;
    s += `<rect x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" class="moldura"/>`;
    s += `<text transform="translate(15 ${m.t + ih / 2}) rotate(-90)" text-anchor="middle" class="t-rot">Altura absoluta acima do eixo da bomba (m)</text>`;
    s += `<text x="${X(x0)}" y="${Ht - 12}" class="t-rot">Sucção</text><text x="${X(xp)}" y="${Ht - 12}" text-anchor="middle" class="t-rot">Bomba</text><text x="${X(xe)}" y="${Ht - 12}" text-anchor="end" class="t-rot">Recalque</text>`;

    // eixo da bomba (datum)
    s += `<line x1="${m.l}" x2="${m.l + iw}" y1="${Y(0)}" y2="${Y(0)}" stroke="#5B6F77" stroke-dasharray="2 4" stroke-width="1.2"/><text x="${m.l + iw - 4}" y="${Y(0) + 14}" text-anchor="end" class="t-mini" fill="#5B6F77">eixo da bomba (z = 0)</text>`;
    // tubulação (esquemática)
    s += `<path d="M${X(x0)},${Y(0)} L${X(xp)},${Y(0)} L${X(xe)},${Y(inp.z2)}" fill="none" stroke="#0A6C7E" stroke-width="7" stroke-linejoin="round" opacity=".28"/>`;
    // níveis dos reservatórios (elevação física) e conector para a energia
    const lvl = (u, z, E, lab) => `<line x1="${X(u) - 14}" x2="${X(u) + 14}" y1="${Y(z)}" y2="${Y(z)}" stroke="#0A6C7E" stroke-width="3"/>` +
      `<line x1="${X(u)}" x2="${X(u)}" y1="${Y(z)}" y2="${Y(E)}" stroke="#0A6C7E" stroke-dasharray="1 4" stroke-width="1.4"/>` +
      `<text x="${X(u) + (u < 0.5 ? 18 : -18)}" y="${Y(z) + 4}" text-anchor="${u < 0.5 ? 'start' : 'end'}" class="t-mini" fill="#0A6C7E">${lab}</text>`;
    s += lvl(x0, inp.z1, E1, 'nível do líquido') + lvl(xe, inp.z2, E2, 'ponto de descarga');

    // linha de vapor e limite de NPSHr
    s += `<line x1="${X(x0)}" x2="${X(xp) + 16}" y1="${Y(hv)}" y2="${Y(hv)}" stroke="#B93A32" stroke-width="1.8" stroke-dasharray="6 4"/>`;
    if (Number.isFinite(d.npshr)) {
      const yr = hv + d.npshr;
      s += `<line x1="${X(x0) + 6}" x2="${X(xp) - 36}" y1="${Y(yr)}" y2="${Y(yr)}" stroke="#D9781C" stroke-width="2" stroke-dasharray="3 3"/>`;
    }

    // linha de energia
    const pts = [[x0, E1], [x0, E1 - d.S.hm], [xp, Es]];
    const disc = [[xp, Ed], [xe, Ed - d.R.hf], [xe, E2]];
    const path = (a) => a.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
    s += `<path d="${path(pts)}" fill="none" stroke="#14303B" stroke-width="3" stroke-linejoin="round"/>`;
    s += `<path d="${path(disc)}" fill="none" stroke="#14303B" stroke-width="3" stroke-linejoin="round"/>`;
    s += `<line x1="${X(xp)}" x2="${X(xp)}" y1="${Y(Es)}" y2="${Y(Ed)}" stroke="#D9781C" stroke-width="5"/>`;

    // colchete NPSHd
    const bx = X(xp) - 24;
    s += `<line x1="${bx}" x2="${bx}" y1="${Y(hv)}" y2="${Y(Es)}" stroke="#0A6C7E" stroke-width="2"/><path d="M${bx - 5},${Y(hv) - 1} h10 M${bx - 5},${Y(Es) + 1} h10" stroke="#0A6C7E" stroke-width="2"/>`;
    if (Y(hv) - Y(Es) >= 46) s += `<text x="${bx - 8}" y="${(Y(hv) + Y(Es)) / 2 + 4}" text-anchor="end" class="t-marca" fill="#0A6C7E">NPSHd</text>`;
    // colchete H
    const hx = X(xp) + 26;
    s += `<line x1="${hx}" x2="${hx}" y1="${Y(Es)}" y2="${Y(Ed)}" stroke="#B85E0D" stroke-width="2"/><path d="M${hx - 5},${Y(Es) + 1} h10 M${hx - 5},${Y(Ed) - 1} h10" stroke="#B85E0D" stroke-width="2"/>`;
    s += `<text x="${hx + 9}" y="${(Y(Es) + Y(Ed)) / 2 + 4}" class="t-marca" fill="#B85E0D">H = ${nf(d.H)} m</text>`;
    // rótulos de perdas (só se legíveis)
    const range = yTop - yBot;
    if (d.R.hf > 0.035 * range) {
      // rótulo acima da parte mais alta da linha sob ele (a linha desce para a direita)
      const uc = xp + 0.55 * (xe - xp), ul = uc - 100 / iw;
      const yl = Y(Ed - (d.R.hf * (ul - xp)) / (xe - xp));
      s += `<text x="${X(uc)}" y="${yl - 10}" text-anchor="middle" class="t-mini" fill="#14303B">atrito no recalque: −${nf(d.R.hf)} m</text>`;
    }
    if (d.R.hm > 0.03 * range) s += `<text x="${X(xe) - 14}" y="${Y(E2 + d.R.hm / 2) + 4}" text-anchor="end" class="t-mini" fill="#14303B">singularidades + saída: −${nf(d.R.hm)} m</text>`;
    if (d.S.hL > 0.03 * range) s += `<text x="${X((x0 + xp) / 2)}" y="${Y(E1) - 8}" text-anchor="middle" class="t-mini" fill="#14303B">perdas na sucção: −${nf(d.S.hL)} m</text>`;
    // legenda (canto superior esquerdo, região sempre livre)
    const leg = [
      { c: '#14303B', w: 3, t: 'Energia do líquido' },
      { c: '#0A6C7E', w: 3, t: `NPSH disponível = ${nf(d.npsh.npshd)} m` },
      Number.isFinite(d.npshr) && { c: '#D9781C', w: 2, dash: '3 3', t: `NPSH requerido = ${nf(d.npshr)} m` },
      { c: '#B93A32', w: 2, dash: '6 4', t: `Vapor do fluido, Pv/ρg = ${nf(hv)} m` }
    ].filter(Boolean);
    leg.forEach((it, i) => {
      const yy = m.t + 20 + i * 19;
      s += `<line x1="${m.l + 12}" x2="${m.l + 38}" y1="${yy - 4}" y2="${yy - 4}" stroke="${it.c}" stroke-width="${it.w}" ${it.dash ? `stroke-dasharray="${it.dash}"` : ''}/><text x="${m.l + 46}" y="${yy}" class="t-leg">${it.t}</text>`;
    });
    // símbolo da bomba
    s += `<circle cx="${X(xp)}" cy="${Y(0)}" r="13" fill="#FBFCFC" stroke="#D9781C" stroke-width="3"/><path d="M${X(xp) - 7},${Y(0) + 5} L${X(xp)},${Y(0) - 8} L${X(xp) + 7},${Y(0) + 5}" fill="none" stroke="#D9781C" stroke-width="2.2"/>`;
    return s + '</svg>';
  }

  B.charts = { curvesChart, npshChart, energyChart, lineChart };
})(typeof window !== 'undefined' ? window : globalThis);
