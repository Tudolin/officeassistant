# Meeting Copilot

Assistente de reunião desktop (Windows) que fica visível apenas para você —
mesmo compartilhando a tela inteira no Teams, Google Meet ou Zoom — com
ajuda do Claude, transcrição/tradução ao vivo (PT/EN) e modo roteiro.

## Recursos

- **Overlay invisível ao compartilhar tela**: usa `setContentProtection`
  (Electron) para ficar oculto de qualquer gravação/compartilhamento de
  tela no Windows, mas 100% visível para você. Visual translúcido tipo
  "vidro fosco" (aero glass), para não tampar o que está atrás.
- **Roda só na bandeja do sistema**: nenhuma janela aparece na barra de
  tarefas (`skipTaskbar` em todas elas); o app fica acessível pelo ícone na
  bandeja (inclusive dentro do menu "mostrar ícones ocultos" do Windows).
- **Assistente de configuração inicial**: ao abrir pela primeira vez (ou a
  qualquer momento em Configurações > "Verificar requisitos..."), o app
  checa se o Claude CLI está instalado/logado e se o whisper.cpp está
  configurado, com botões para instalar/baixar automaticamente o que faltar.
- **Assistente com Claude Code**: pergunte algo e receba a resposta no
  popup, sem sair da chamada.
- **Print + pergunta (`Ctrl+Shift+A`)**: tira um print da tela, manda pro
  Claude e já traz a resposta/solução — ótimo para ajuda em livecoding ou
  para responder uma pergunta que apareceu no compartilhamento.
- **Transcrição local (whisper.cpp)**: transcreve a reunião em PT/EN sem
  enviar áudio para a nuvem, separando "Você" (microfone) de "Outros"
  (áudio do sistema).
- **Tradução automática ao vivo**: cada linha transcrita é traduzida
  automaticamente entre PT e EN.
- **Notas da reunião**: anote durante a call; tudo é salvo automaticamente
  por reunião e pode ser exportado em Markdown.
- **Modo roteiro (teleprompter)**: escreva os tópicos da apresentação antes
  e deixe rolando na tela para não se perder.
- **Layout customizável**: posição (arrastar livremente ou escolher um dos
  4 cantos) e transparência do vidro ficam salvas; cada painel (Assistente,
  Transcrição, Tradução, Roteiro, Notas) pode ser ligado/desligado.
- **Idioma de transcrição por locutor**: dá pra fixar "Você" (microfone) e
  "Outros" (áudio do sistema) em idiomas diferentes — inclusive travar os
  dois em inglês, ou um em português e o outro em inglês, em vez de sempre
  usar detecção automática.

## Stack

Electron + TypeScript, sem frameworks de UI (renderer em TS/HTML/CSS puro),
build com esbuild. Transcrição via whisper.cpp local; assistente/tradução
via Claude Code CLI local (sua própria assinatura, sem API key).

## Começando

Veja [docs/SETUP.md](docs/SETUP.md) para o passo a passo completo (instalar
o Claude Code CLI, baixar o whisper.cpp + modelo, rodar e empacotar o app).

```powershell
npm install
npm run dev
```

## Estrutura

```
src/
  main/           processo principal do Electron (janelas, atalhos, IPC, serviços)
    services/      claudeCli, screenshot, whisper, audioPipeline, translation,
                    sessionStore, teleprompter
    windows/        overlayWindow (popup com content protection), audioCaptureWindow
  preload/        pontes contextBridge (overlay e captura de áudio)
  renderer/
    overlay/        UI do popup (abas: assistente, transcrição, tradução, roteiro, notas, config)
    audio/          janela oculta que captura microfone + loopback do sistema
  shared/         tipos e nomes de canais IPC compartilhados
```

## Privacidade

Transcrição roda 100% local via whisper.cpp — o áudio da reunião não sai da
sua máquina. Perguntas ao assistente e traduções são enviadas ao Claude via
Claude Code CLI usando a sua própria assinatura.
