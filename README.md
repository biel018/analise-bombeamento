# Análise de sistemas de bombeamento

Ferramenta web (HTML + JavaScript puro, sem build e sem dependências) que calcula, para uma instalação de bombeamento entre dois reservatórios:

- perdas de carga distribuídas e localizadas (sucção e recalque);
- altura manométrica total, potência hidráulica, potência no eixo e motor comercial sugerido;
- NPSH disponível e avaliação de cavitação (semáforo com margem de segurança);
- curva do sistema × curva da bomba, ponto de operação e posição em relação ao BEP;
- alertas de condição operacional (velocidades, regime de escoamento, fluido viscoso, extrapolação da curva…);
- memória de cálculo passo a passo, com os números da simulação atual.

## Como usar

Abra `index.html` no navegador (funciona direto do arquivo, sem servidor). Os três botões do topo carregam exemplos prontos: o **caso de validação** (água a 20 °C), um caso de **água quente** que provoca cavitação e um **óleo viscoso** em regime laminar.

## Publicar no GitHub + Vercel

1. No GitHub, crie um repositório novo (`New repository`).
2. Envie **o conteúdo desta pasta** (`index.html`, `css/`, `js/`, `tests/`, `README.md`) pelo botão *uploading an existing file* ou com `git push`. O `index.html` precisa ficar na raiz do repositório.
3. Em [vercel.com](https://vercel.com), clique em **Add New → Project**, escolha o repositório e clique em **Deploy**.
   - *Framework Preset*: **Other**
   - *Build Command* e *Output Directory*: deixe vazios (é um site estático).
4. A Vercel gera um endereço `https://nome-do-projeto.vercel.app`. Cada `git push` republica automaticamente.

## Estrutura

```
index.html            página principal
css/style.css         visual
js/fluids.js          propriedades dos fluidos (Kell, Vogel, Antoine, Andrade, ASTM D341)
js/fittings.js        rugosidades, diâmetros Sch 40, singularidades (método K de Crane)
js/hydraulics.js      motor hidráulico: atrito (Colebrook-White), perdas, H, NPSH
js/pump.js            curva da bomba (mínimos quadrados), ponto de operação, BEP, motor
js/analysis.js        junta tudo e gera os alertas
js/charts.js          gráficos em SVG (energia, H×Q, NPSH×Q)
js/memoria.js         memória de cálculo
js/app.js             interface
tests/                validação (ver abaixo)
```

## Validação

```
node tests/validate.js
```

Roda 65 verificações automáticas:

- propriedades da água contra tabelas publicadas;
- fator de atrito contra as equações de Prandtl (tubo liso), von Kármán (rugoso), Hagen-Poiseuille (laminar) e contra uma implementação independente de Colebrook por outro método numérico;
- **caso completo** (`tests/case.js`) contra o cálculo manual independente `tests/reference.py` (Python com `numpy`/`scipy`, propriedades de tabela), etapa por etapa;
- coerência física (balanço de energia pelos flanges da bomba, efeito da altitude e da temperatura no NPSH, ponto de operação como interseção real);
- lógica de classificação de cavitação e seleção de motor.

Para rodar só o cálculo manual: `python3 tests/reference.py`.

## Hipóteses e limitações

Escoamento permanente e incompressível entre dois reservatórios de nível constante; propriedades do fluido avaliadas em uma única temperatura; tubulação com diâmetro e rugosidade constantes em cada linha; perdas localizadas por coeficientes K típicos (Crane TP-410), aplicados como constantes; curva da bomba ajustada por parábola aos pontos digitados. Ferramenta didática: para uso real, confirme sempre com a folha de dados do fabricante e com a norma aplicável.
