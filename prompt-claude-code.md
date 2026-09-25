# Prompt para colar no Claude Code (VS Code)

1. Baixe e descompacte `bombeamento.zip` — abra essa pasta `bombeamento` no VS Code (File → Open Folder).
2. Abra o Claude Code dentro do VS Code e cole o prompt abaixo inteiro.

---

Este é um projeto web estático pronto (index.html + css/ + js/ + tests/), sem
build e sem dependências de servidor. Preciso subir para um repositório novo
no GitHub e deixá-lo pronto para eu conectar na Vercel.

Faça o seguinte, nesta ordem:

1. Rode `node tests/validate.js` e me mostre o resultado antes de continuar
   (deve terminar em "TODOS OS TESTES PASSARAM").
2. Inicialize um repositório git nesta pasta, se ainda não houver um
   (`git init`), na branch `main`.
3. Crie um `.gitignore` simples (node_modules, .DS_Store, *.log).
4. Faça o commit inicial de todos os arquivos com uma mensagem descritiva.
5. Verifique se o GitHub CLI (`gh`) está instalado e autenticado
   (`gh auth status`).
   - Se estiver autenticado: crie o repositório no GitHub com
     `gh repo create <nome-que-eu-escolher> --public --source=. --remote=origin --push`
     (pergunte-me o nome antes, sugira "analise-bombeamento").
   - Se `gh` não estiver instalado ou autenticado: me explique exatamente
     o que fazer (instalar o GitHub CLI e rodar `gh auth login`, OU criar o
     repositório manualmente pelo site do GitHub e me dar os dois comandos
     `git remote add origin <url>` e `git push -u origin main`).
6. Confirme que o `index.html` ficou na raiz do repositório (não dentro de
   uma subpasta) — a Vercel precisa disso para detectar o site estático.
7. Por fim, me diga em poucas linhas os passos para conectar esse
   repositório na Vercel:
   - Add New → Project → selecionar o repositório
   - Framework Preset: "Other"
   - Build Command e Output Directory: deixar em branco
   - Deploy

Não altere nenhum código do projeto — a tarefa aqui é só infraestrutura
(git, GitHub, instruções da Vercel). Se algo der errado (ex.: já existe um
repositório remoto configurado, ou há conflitos), pare e me explique antes
de forçar qualquer coisa.
