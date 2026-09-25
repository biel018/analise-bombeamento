#!/usr/bin/env python3
"""
reference.py — Cálculo MANUAL independente do caso de validação.

Segue exatamente os passos que uma pessoa faria à mão / em calculadora:
  1. propriedades da água a 20 °C (VALORES DE TABELA, não correlações)
  2. velocidade, Re, rugosidade relativa
  3. fator de atrito (Colebrook por iteração de ponto fixo — método
     DIFERENTE do Newton usado no JavaScript)
  4. perdas distribuídas e localizadas (K = (Le/D)·fT, Crane)
  5. altura manométrica, potência, NPSH disponível
  6. curva da bomba (numpy.polyfit) e ponto de operação (scipy.brentq)

Não importa nada do código JavaScript. Saída: JSON em stdout (--json)
ou tabela legível (padrão).
"""
import json
import math
import sys

import numpy as np
from scipy.optimize import brentq

g = 9.80665

# ---------------- DADOS DO CASO (idênticos a tests/case.js) ----------------
rho, mu, Pv = 998.2, 1.002e-3, 2339.0      # água 20 °C — Çengel Tab. A-3
Patm = 101325.0
Q = 30 / 3600                               # m³/s
suc = dict(D=0.10226, L=5.0, eps=0.045e-3)  # 4" Sch 40
rec = dict(D=0.06271, L=45.0, eps=0.045e-3) # 2 1/2" Sch 40
z1, z2, p1, p2 = -2.0, 18.0, 0.0, 0.0
eta_p, eta_m = 0.65, 0.90

# fT de Crane (aço comercial, turbulento pleno). Interpolação linear entre tabela:
#   100 mm → 0,017 ; 125 mm → 0,016   |   50 mm → 0,019 ; 65 mm → 0,018
fT_suc = 0.017 + (102.26 - 100) / (125 - 100) * (0.016 - 0.017)
fT_rec = 0.019 + (62.71 - 50) / (65 - 50) * (0.018 - 0.019)

# peças: (quantidade, K) — K = Le/D · fT  ou fixo
suc_fit = [(1, 75 * fT_suc), (1, 30 * fT_suc)]                      # válv. de pé articulada, cotovelo 90°
rec_fit = [(4, 30 * fT_rec), (1, 8 * fT_rec), (1, 100 * fT_rec), (1, 1.0)]  # 4 cot., gaveta, retenção, saída


def colebrook_fixed_point(Re, rr):
    """1/√f = −2 log10( rr/3,7 + 2,51/(Re √f) ) — iteração de ponto fixo"""
    x = 7.0  # chute: f ≈ 0,02
    for _ in range(200):
        x_new = -2 * math.log10(rr / 3.7 + 2.51 * x / Re)
        if abs(x_new - x) < 1e-13:
            break
        x = x_new
    return 1 / x**2


def linha(d, fits, Qv):
    A = math.pi * d["D"] ** 2 / 4
    V = Qv / A
    Re = rho * V * d["D"] / mu
    rr = d["eps"] / d["D"]
    f = 64 / Re if Re < 2300 else colebrook_fixed_point(Re, rr)
    v2g = V**2 / (2 * g)
    hf = f * d["L"] / d["D"] * v2g
    sumK = sum(n * k for n, k in fits)
    hm = sumK * v2g
    return dict(A=A, V=V, Re=Re, rr=rr, f=f, v2g=v2g, hf=hf, sumK=sumK, hm=hm, hL=hf + hm)


def sistema(Qv):
    S = linha(suc, suc_fit, Qv)
    R = linha(rec, rec_fit, Qv)
    H = (z2 - z1) + (p2 - p1) / (rho * g) + S["hL"] + R["hL"]
    return S, R, H


# ---------------- ponto de projeto ----------------
S, R, H = sistema(Q)
Phyd = rho * g * Q * H
Pshaft = Phyd / eta_p
Pelec = Pshaft / eta_m
npsh = (Patm + p1) / (rho * g) + z1 - S["hL"] - Pv / (rho * g)

# ---------------- curva da bomba ----------------
rows = [(0, 38, None, None), (10, 36.9, 42, 1.2), (20, 33.6, 60, 1.6),
        (30, 28.2, 68, 2.3), (40, 20.5, 66, 3.4), (50, 10.6, 55, 5.0)]
qh = np.array([r[0] for r in rows], float) / 3600
hh = np.array([r[1] for r in rows], float)
qe = np.array([r[0] for r in rows if r[2]], float) / 3600
ee = np.array([r[2] for r in rows if r[2]], float) / 100
qn = np.array([r[0] for r in rows if r[3]], float) / 3600
nn = np.array([r[3] for r in rows if r[3]], float)
cH = np.polyfit(qh, hh, 2)
cE = np.polyfit(qe, ee, 2)
cN = np.polyfit(qn, nn, 2)

f_op = lambda q: np.polyval(cH, q) - sistema(q)[2]
Qop = brentq(f_op, 1e-6, 50 / 3600 * 1.5)
Hop = float(np.polyval(cH, Qop))
eta_op = float(np.polyval(cE, Qop))
npshr_op = float(np.polyval(cN, Qop))
S_op, _, _ = sistema(Qop)
npsh_op = (Patm + p1) / (rho * g) + z1 - S_op["hL"] - Pv / (rho * g)
Pshaft_op = rho * g * Qop * Hop / eta_op

out = dict(
    S=S, R=R, H=H, Hstatic=(z2 - z1), Phyd=Phyd, Pshaft=Pshaft, Pelec=Pelec, npshd=npsh,
    fT_suc=fT_suc, fT_rec=fT_rec,
    op=dict(Q=Qop, Q_m3h=Qop * 3600, H=Hop, eta=eta_op, Pshaft=Pshaft_op, npshd=npsh_op, npshr=npshr_op),
    Qbep_m3h=None,
)
# BEP
qs = np.linspace(qe.min(), qe.max(), 401)
out["Qbep_m3h"] = float(qs[np.argmax(np.polyval(cE, qs))] * 3600)

if "--grid" in sys.argv:
    grid = [(Re, rr, colebrook_fixed_point(Re, rr))
            for Re in (4000, 1e4, 1e5, 1e6, 1e7, 1e8) for rr in (0.0, 1e-4, 1e-3, 1e-2, 5e-2)]
    print(json.dumps(grid))
    sys.exit(0)

if "--json" in sys.argv:
    print(json.dumps(out))
else:
    def sec(t): print("\n" + "=" * 8, t)
    sec("SUCÇÃO"); [print(f"{k:6s} = {v:.6g}") for k, v in S.items()]
    sec("RECALQUE"); [print(f"{k:6s} = {v:.6g}") for k, v in R.items()]
    sec("SISTEMA")
    print(f"fT suc = {fT_suc:.5f}   fT rec = {fT_rec:.5f}")
    print(f"H estática = {z2 - z1:.4f} m\nH total    = {H:.4f} m")
    print(f"P hidráulica = {Phyd:.2f} W\nP eixo (η={eta_p}) = {Pshaft:.2f} W\nP elétrica (ηm={eta_m}) = {Pelec:.2f} W")
    print(f"NPSHd = {npsh:.4f} m")
    sec("PONTO DE OPERAÇÃO")
    print(f"Q = {Qop * 3600:.4f} m³/h   H = {Hop:.4f} m   η = {eta_op:.4f}   P eixo = {Pshaft_op:.1f} W")
    print(f"NPSHd = {npsh_op:.4f} m   NPSHr = {npshr_op:.4f} m   Q_BEP = {out['Qbep_m3h']:.2f} m³/h")
