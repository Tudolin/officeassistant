# Setup (Windows)

Este guia cobre a instalação dos pré-requisitos externos que o Meeting Copilot
usa: o Claude Code CLI (para o assistente e a tradução) e o whisper.cpp
(para transcrição local, offline, de PT/EN).

## 1. Pré-requisitos

- Windows 10 (build 2004+) ou Windows 11 — necessário para `WDA_EXCLUDEFROMCAPTURE`
  (a proteção que deixa o overlay invisível em compartilhamento de tela).
- Node.js 20+ instalado.
- Uma assinatura Claude com acesso ao Claude Code CLI (não usamos API key).

## 2. (Recomendado) Deixe o assistente de configuração cuidar disso

Na primeira execução, o app abre uma tela de **Configuração inicial** que
checa automaticamente Claude CLI, login e whisper.cpp, com botões para:

- Instalar o Claude Code CLI via `npm install -g` (se você já tiver Node/npm).
- Abrir um terminal para você fazer `claude /login` (o fluxo OAuth abre no
  navegador; o app não pode automatizar isso por você).
- Baixar automaticamente um binário whisper.cpp (Windows x64, CPU) da última
  release no GitHub e um modelo `ggml-small.bin` do Hugging Face, já
  configurando os caminhos nas Configurações.

Você pode reabrir essa tela a qualquer momento em **Configurações
(⚙) > Verificar requisitos...**, ou pelo menu da bandeja do sistema. As
seções abaixo explicam o que fazer manualmente caso prefira, ou caso o
download automático do whisper.cpp falhe (a release mudou de nome, sem
internet, etc.).

## 3. Instalar e logar no Claude Code CLI (manual)

```powershell
npm install -g @anthropic-ai/claude-code
claude /login
```

Teste rápido para confirmar que o modo não-interativo funciona:

```powershell
claude -p "responda apenas: ok" --output-format text --permission-mode bypassPermissions
```

Se isso imprimir `ok`, o app conseguirá chamar o Claude durante a reunião.
Nas Configurações do app, "Caminho do Claude CLI" pode ficar como `claude`
se o comando já estiver no PATH, ou o caminho completo do `.cmd`/`.exe`.

## 4. Instalar o whisper.cpp (transcrição local, manual)

1. Baixe um build pré-compilado para Windows (x64, CPU) das releases do
   projeto `ggml-org/whisper.cpp` no GitHub, ou compile localmente. Você quer
   o executável `whisper-cli.exe` (versões mais novas) ou `main.exe`
   (versões antigas) — ambos aceitam os mesmos parâmetros usados aqui.
2. Baixe um modelo multilíngue (para tratar PT e EN sem trocar de modelo).
   Recomendado para uma máquina comum: `ggml-small.bin`. Se tiver GPU/CPU
   potente, `ggml-medium.bin` transcreve melhor.
3. Coloque o binário e o modelo em uma pasta fixa, ex:
   `C:\whisper\whisper-cli.exe` e `C:\whisper\models\ggml-small.bin`.
4. No app, aba **Configurações**, preencha "Binário whisper.cpp" e
   "Modelo whisper (.bin)" com esses caminhos.

Tudo roda localmente — nenhum áudio da reunião sai da sua máquina.

## 5. Rodar em desenvolvimento

```powershell
npm install
npm run dev
```

Isso builda e abre o overlay. Na primeira vez, o Windows vai pedir
permissão de **microfone** (para captar sua voz) — aceite. A captação do
áudio do sistema (o que os outros falam) usa loopback via
`desktopCapturer`, sem precisar de driver extra.

## 6. Gerar o instalador (.exe)

```powershell
npm run dist
```

Gera o instalador NSIS em `release/`.

## Atalhos globais (padrão, configurável em Config futuramente via arquivo)

Atalhos globais são exclusivos: enquanto o Meeting Copilot roda, a combinação
não chega mais ao navegador (ou qualquer outro app) - por isso os padrões
abaixo evitam de propósito combinações já usadas por Chrome/Edge/Firefox
(ex: `Ctrl+Shift+T` reabre aba fechada, `Ctrl+Shift+R` dá refresh forçado -
se o app tivesse escolhido essas, apertar por hábito no navegador acionaria
o Meeting Copilot em vez do navegador, sem aviso nenhum).

| Atalho | Ação |
|---|---|
| `Ctrl+Shift+H` | Mostrar/ocultar overlay |
| `Ctrl+Shift+G` | Alternar "clique-através" (deixa a janela clicável ou não) |
| `Ctrl+Shift+Space` | Focar campo de pergunta ao Claude |
| `Ctrl+Shift+A` | Print da tela + enviar para o Claude (ajuda em pergunta/livecoding) |
| `Ctrl+Shift+M` | Ligar/desligar transcrição da reunião |
| `Ctrl+Shift+U` | Abrir o modo roteiro (teleprompter) |
| `Ctrl+Shift+L` | Ligar/desligar tradução automática |

## Bandeja do sistema

O app não aparece na barra de tarefas — todas as janelas usam `skipTaskbar`.
Ele fica acessível pelo ícone na bandeja (perto do relógio); o Windows pode
escondê-lo inicialmente no menu "mostrar ícones ocultos" (o `^`), o que é
esperado. Pelo menu do ícone dá pra mostrar/ocultar o overlay, disparar as
mesmas ações dos atalhos, reabrir a Configuração inicial, e sair do app.

## Por que fica invisível na tela compartilhada?

O overlay usa `BrowserWindow.setContentProtection(true)` do Electron, que no
Windows aplica `SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)`. Isso
faz o SO excluir essa janela especificamente de qualquer captura de tela ou
compartilhamento (Teams, Meet, Zoom, gravação de tela, etc.) — ela continua
100% visível para você, só não aparece para quem está do outro lado.

## Limitações conhecidas desta primeira versão

- Transcrição é por blocos de ~6s (não é streaming palavra-a-palavra); há
  uma latência de alguns segundos.
- A tradução usa o Claude CLI por linha transcrita, então também tem uma
  latência de alguns segundos e depende da sua conexão/assinatura.
- Testado apenas em Windows 10/11. `setContentProtection` e a captura de
  áudio do sistema são comportamentos específicos do Windows.
- Detecção de idioma da fala usa `-l auto` do whisper.cpp por chunk; frases
  muito curtas podem ser mal classificadas.
- O download automático do whisper.cpp depende do formato dos assets da
  última release no GitHub e da URL de modelos do Hugging Face continuarem
  no mesmo padrão; se falhar, use a instalação manual (seção 4).
