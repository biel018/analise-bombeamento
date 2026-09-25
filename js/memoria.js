/* =====================================================================
   memoria.js — Gera a "memória de cálculo": cada equação com os números
   da simulação atual substituídos, para conferência manual.
   ===================================================================== */
(function (root) {
  'use strict';
  const B = (root.Bomb = root.Bomb || {});
  const G = 9.80665;
  const nf = (v, d = 2) => Number.isFinite(v) ? Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const eq = (html) => `<code class="eq">${html}</code>`;
  const k = (v) => `<b>${v}</b>`;

  function lineSteps(nome, L, inp, fl) {
    const D = L.D, mm = D * 1000;
    let h = `<div class="passo"><h3>${nome}</h3>`;
    h += eq(`Área:  A = π·D²/4 = π·(${nf(D, 5)})²/4 = ${k(nf(L.A * 1e4, 3) + ' cm²')}`);
    h += eq(`Velocidade:  V = Q/A = ${nf(inp.Q, 6)} / ${nf(L.A, 6)} = ${k(nf(L.V, 3) + ' m/s')}`);
    h += eq(`Reynolds:  Re = ρ·V·D/μ = ${nf(fl.rho, 1)}·${nf(L.V, 3)}·${nf(D, 5)} / ${nf(fl.mu, 6)} = ${k(nf(L.Re, 0))}  → regime ${k(L.regime)}`);
    h += eq(`Rugosidade relativa:  ε/D = ${nf(L.eps * 1000, 4)} mm / ${nf(mm, 2)} mm = ${k(nf(L.rr, 6))}`);
    if (L.regime === 'laminar') h += eq(`Fator de atrito (laminar):  f = 64/Re = 64/${nf(L.Re, 0)} = ${k(nf(L.f, 5))}`);
    else h += eq(`Fator de atrito (Colebrook-White, iterativo):  1/√f = −2·log₁₀[ ε/(3,7·D) + 2,51/(Re·√f) ]  →  f = ${k(nf(L.f, 5))}`);
    h += eq(`Perda distribuída:  h<sub>f</sub> = f·(L/D)·V²/2g = ${nf(L.f, 5)}·(${nf(L.L, 2)}/${nf(D, 5)})·${nf(L.V, 3)}²/(2·${nf(G, 5)}) = ${k(nf(L.hf, 4) + ' m')}`);
    if (L.items.length) {
      h += `<p>Singularidades (método K; f<sub>T</sub> = ${nf(L.fT, 4)} para este diâmetro):</p>`;
      for (const it of L.items) h += eq(`${it.qty} × ${esc(it.name)}: ${esc(it.basis)}  →  K = ${nf(it.K1, 4)}  →  ${it.qty}·K = ${nf(it.sub, 4)}`);
    }
    h += eq(`Perda localizada:  h<sub>m</sub> = ΣK·V²/2g = ${nf(L.sumK, 4)}·${nf(L.v2g, 5)} = ${k(nf(L.hm, 4) + ' m')}`);
    h += eq(`Perda total da linha:  h<sub>L</sub> = h<sub>f</sub> + h<sub>m</sub> = ${nf(L.hf, 4)} + ${nf(L.hm, 4)} = ${k(nf(L.hL, 4) + ' m')}`);
    return h + '</div>';
  }

  function build(r) {
    const { inp, dsg: d, pump, op, rg } = r, fl = inp.fluid;
    const altTxt = Number.isFinite(inp.alt) ? `h = ${nf(inp.alt, 0)} m` : '';
    let h = '';

    h += `<div class="passo"><h3>1. Propriedades do fluido e pressão atmosférica</h3>`;
    h += `<p>${esc(fl.name || 'Fluido')}${Number.isFinite(inp.T) && fl.name !== 'Fluido personalizado…' ? ` a ${nf(inp.T, 1)} °C` : ''} — ${esc(fl.source || '')}</p>`;
    h += eq(`ρ = ${k(nf(fl.rho, 2) + ' kg/m³')} &nbsp; μ = ${k(nf(fl.mu * 1e3, 4) + ' mPa·s')} &nbsp; ν = μ/ρ = ${k(nf(fl.nu * 1e6, 3) + ' cSt')} &nbsp; P<sub>v</sub> = ${k(nf(fl.pv / 1e3, 3) + ' kPa (abs.)')}`);
    h += eq(`Pressão atmosférica (ISA):  P<sub>atm</sub> = 101325·(1 − 2,25577·10⁻⁵·h)^5,25588 = ${k(nf(inp.patm / 1e3, 3) + ' kPa')} &nbsp; ${altTxt}`);
    h += eq(`ρ·g = ${nf(fl.rho, 2)}·${nf(G, 5)} = ${nf(rg, 1)} N/m³ &nbsp; (peso específico)`);
    h += '</div>';

    h += lineSteps('2. Linha de sucção', d.S, inp, fl);
    h += lineSteps('3. Linha de recalque', d.R, inp, fl);

    h += `<div class="passo"><h3>4. Altura manométrica (equação da energia entre os reservatórios)</h3>`;
    h += eq(`H = (z₂ − z₁) + (p₂ − p₁)/(ρ·g) + h<sub>L,suc</sub> + h<sub>L,rec</sub>`);
    h += eq(`H = (${nf(inp.z2)} − (${nf(inp.z1)})) + (${nf(inp.p2 / 1e3)} − ${nf(inp.p1 / 1e3)})·10³/${nf(rg, 1)} + ${nf(d.S.hL, 4)} + ${nf(d.R.hL, 4)}`);
    h += eq(`H = ${nf(d.dz, 3)} + ${nf(d.dpHead, 3)} + ${nf(d.S.hL, 3)} + ${nf(d.R.hL, 3)} = ${k(nf(d.H, 3) + ' m')}`);
    h += '</div>';

    h += `<div class="passo"><h3>5. Potências e motor</h3>`;
    h += eq(`Potência hidráulica:  P<sub>hid</sub> = ρ·g·Q·H = ${nf(rg, 1)}·${nf(inp.Q, 6)}·${nf(d.H, 3)} = ${k(nf(d.Phyd, 1) + ' W')}`);
    h += eq(`Potência no eixo:  P<sub>eixo</sub> = P<sub>hid</sub>/η<sub>b</sub> = ${nf(d.Phyd, 1)}/${nf(inp.etaPump, 3)} = ${k(nf(d.Pshaft, 1) + ' W')} = ${nf(d.Pshaft / 735.49875, 2)} cv`);
    h += eq(`Potência elétrica:  P<sub>el</sub> = P<sub>eixo</sub>/η<sub>m</sub> = ${nf(d.Pshaft, 1)}/${nf(inp.etaMotor, 3)} = ${k(nf(d.Pelec, 1) + ' W')}`);
    h += `<p>Motor: margem usual de ${nf(d.motor.margin * 100, 0)} % → ${nf(d.motor.need, 2)} cv necessários → motor comercial ${d.motor.std ? k(nf(d.motor.std, d.motor.std % 1 ? 2 : 0) + ' cv (' + nf(d.motor.kW, 2) + ' kW)') : 'acima da tabela'}.</p>`;
    h += '</div>';

    h += `<div class="passo"><h3>6. NPSH disponível e cavitação</h3>`;
    const n = d.npsh;
    h += eq(`NPSH<sub>d</sub> = (P<sub>atm</sub> + p₁)/(ρ·g) + z₁ − h<sub>L,suc</sub> − P<sub>v</sub>/(ρ·g)`);
    h += eq(`NPSH<sub>d</sub> = ${nf(n.hAtm, 3)} + (${nf(n.z1, 3)}) − ${nf(n.hLs, 3)} − ${nf(n.hv, 3)} = ${k(nf(n.npshd, 3) + ' m')}`);
    if (Number.isFinite(d.npshr)) {
      h += eq(`NPSH<sub>r</sub> = ${nf(d.npshr, 3)} m &nbsp;·&nbsp; exigido: NPSH<sub>d</sub> ≥ máx( ${nf(inp.npshMargin, 2)}·NPSH<sub>r</sub> ; NPSH<sub>r</sub> + 0,6 ) = ${nf(d.cav.required, 3)} m`);
      h += `<p>Folga = NPSH<sub>d</sub> − NPSH<sub>r</sub> = ${nf(d.cav.margin, 3)} m → ${k({ ok: 'sem risco de cavitação', warn: 'margem insuficiente', bad: 'cavitação provável' }[d.cav.level])}.</p>`;
    } else h += '<p>NPSHr não informado — cavitação não avaliada.</p>';
    h += '</div>';

    h += `<div class="passo"><h3>7. Pressões nos flanges da bomba (verificação)</h3>`;
    h += eq(`p<sub>suc</sub> = p₁ + ρ·g·z₁ − ρ·g·h<sub>L,suc</sub> − ½·ρ·V²<sub>suc</sub> = ${k(nf(d.flange.psGauge / 1e3, 2) + ' kPa man.')} (${nf(d.flange.psAbs / 1e3, 2)} kPa abs.)`);
    h += eq(`p<sub>desc</sub> = p₂ + ρ·g·z₂ + ρ·g·h<sub>L,rec</sub> − ½·ρ·V²<sub>rec</sub> = ${k(nf(d.flange.pdGauge / 1e3, 2) + ' kPa man.')}`);
    h += eq(`Conferência: H = (p<sub>desc</sub> − p<sub>suc</sub>)/(ρ·g) + (V²<sub>rec</sub> − V²<sub>suc</sub>)/2g = ${k(nf(d.flange.HmanoFlange, 3) + ' m')} &nbsp;(igual ao passo 4)`);
    h += '</div>';

    if (pump) {
      const s = pump.H.scale * 3600, c = pump.H.coef;
      h += `<div class="passo"><h3>8. Curva da bomba e ponto de operação</h3>`;
      h += eq(`Ajuste por mínimos quadrados (Q em m³/h):  H<sub>bomba</sub>(Q) = ${nf(c[0], 3)} ${c[1] / s < 0 ? '−' : '+'} ${nf(Math.abs(c[1] / s), 5)}·Q ${(c[2] || 0) / (s * s) < 0 ? '−' : '+'} ${nf(Math.abs((c[2] || 0) / (s * s)), 6)}·Q² &nbsp; (R² = ${nf(pump.H.r2, 5)})`);
      h += eq(`Curva do sistema:  H<sub>sist</sub>(Q) = ${nf(d.Hstatic, 3)} + h<sub>L,suc</sub>(Q) + h<sub>L,rec</sub>(Q)  (recalculada a cada vazão, com f variando com Re)`);
      if (op && op.Q) {
        h += eq(`Ponto de operação (H<sub>bomba</sub> = H<sub>sist</sub>):  Q = ${k(nf(op.Q * 3600, 2) + ' m³/h')} &nbsp; H = ${k(nf(op.H, 2) + ' m')}`);
        h += eq(`η = ${nf(op.eta * 100, 1)} % &nbsp; P<sub>eixo</sub> = ρ·g·Q·H/η = ${k(nf(op.Pshaft, 0) + ' W')} &nbsp; NPSH<sub>d</sub> = ${nf(op.e.npsh.npshd, 2)} m &nbsp; NPSH<sub>r</sub> = ${nf(op.npshr, 2)} m`);
        if (pump.Qbep) h += `<p>Vazão do melhor rendimento (BEP) = ${nf(pump.Qbep * 3600, 1)} m³/h → operando a ${nf(op.ratioBep * 100, 0)} % do BEP.</p>`;
      } else h += '<p>Não há ponto de operação (a bomba não vence o sistema).</p>';
      h += '</div>';
    }
    return h;
  }

  B.memoria = { build };
})(typeof window !== 'undefined' ? window : globalThis);
