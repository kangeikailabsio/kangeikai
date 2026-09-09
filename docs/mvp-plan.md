# Kangeikai — Plano do MVP

> Projeto open source de um "virtual office" estilo Gather.town: escritório virtual 2D com movimento livre e chat de voz/vídeo por proximidade.

Data: 2026-08-18

## Visão

Escritório virtual persistente onde pessoas entram como avatares 2D, se movem livremente por um mapa e conversam por voz/vídeo com quem está fisicamente próximo dentro do mundo — sem precisar criar salas de chamada separadas.

Caso de uso primário: **virtual office** (presença assíncrona de time/comunidade), não evento social pontual.

## Escopo do MVP

**Incluído:**
- Avatar 2D com movimento livre num único mapa (Tiled), sala fixa única.
- Zonas nomeadas e tagueadas dentro desse mapa único (object layer do Tiled), ex.: `desk-01`
  (tag `personal-desk`), `public-space-01` (tag `public-space`) — sem zonas privadas por
  enquanto. Usadas apenas como sinal de ativação de voz/vídeo (ver item abaixo), não criam
  salas/rooms separadas.
- Chat de voz/vídeo por proximidade: todos os participantes na mesma room do LiveKit; volume
  ajustado no client conforme distância entre avatares — exceto quando os dois avatares estão
  na mesma zona nomeada, caso em que o volume/vídeo fica cheio independente da distância exata
  dentro da zona.
- Entrada como convidado, sem contas/login. Nome e avatar escolhidos ficam salvos em `localStorage` do navegador (sem backend) — não persistem entre dispositivos/navegadores.
- Estado de sala 100% em memória via Colyseus — reseta em restart do servidor.

**Fora do MVP (backlog v2+):**
- Contas de usuário / autenticação.
- Persistência em banco de dados (Postgres).
- Empacotamento genérico para self-host de terceiros (Docker Compose documentado, guia de instalação).
- Chat de texto.
- Customização avançada de avatar.
- Retomar a mesma posição/sessão ao dar refresh na página. Hoje cada refresh cria uma sessão
  nova no Colyseus e o avatar volta pro spawn point. Não exigiria persistência real (spec 002
  já implementa reconexão via `allowReconnection`/`reconnectionToken`) — bastaria o client
  guardar o `reconnectionToken` e tentar `reconnect()` antes de criar uma sessão nova; só
  cobre continuidade dentro do processo em memória (não sobrevive a restart do servidor).
- Toast de estado de conexão no client (perdida/reconectando/servidor indisponível), como no
  Gather.town — lá, quando a conexão cai aparece um toast avisando. Hoje, se o servidor está
  fora do ar ou a conexão cai, o avatar local continua totalmente interativo (movimento é
  client-authoritative) sem nenhum aviso de que não está mais sincronizado com ninguém.
  `RoomConnection` já expõe `onConnectionStateChange`; falta uma UI consumindo isso.

## Stack técnica

| Camada | Tecnologia | Observação |
|---|---|---|
| UI / client | SvelteKit | SPA mode (`adapter-static`, SSR desligado globalmente) — build vira arquivos estáticos, sem processo Node pra servir o client |
| Engine de jogo | Phaser.js | Renderização do mapa e avatares |
| Formato de mapa | Tiled | |
| Multiplayer / realtime | Colyseus | Estado da sala em memória |
| Estilização | CSS vanilla | `<style>` escopado nativo do SvelteKit — sem framework CSS/utility-classes |
| Validação/schema | Valibot | Única lib de validação — formulário, parse de dado guardado no localStorage, payloads de rede |
| Áudio / vídeo | LiveKit (self-hosted) | Proximidade via volume ajustado no client, todos numa mesma room |
| Banco de dados | — (nenhum no MVP) | Reavaliar quando surgir a primeira feature que exija persistência real |
| Monorepo | pnpm workspaces | Sem Turborepo por enquanto — build ainda não é lento o suficiente para justificar cache |
| Lint/format | ESLint (`@antfu/eslint-config`) | Sem Prettier — o config do antfu já cobre formatação via regras de estilo do próprio ESLint |
| Git hooks | `simple-git-hooks` + `lint-staged` | Hook `pre-commit` local roda lint só nos arquivos staged |
| Instruções pra agentes de IA | `AGENTS.md` (raiz) | Universal, pensando em contribuidores externos que não usam Claude Code — `CLAUDE.md` só importa o `AGENTS.md` |

## Infraestrutura / deploy do MVP

- **Hospedagem:** VPS Hetzner + Coolify.
- **Risco técnico conhecido:** LiveKit self-hosted precisa de uma faixa de portas UDP exposta diretamente (mídia WebRTC), além de HTTP/WSS — o proxy padrão do Coolify (Traefik) só cobre bem HTTP/TCP. Será necessário expor a faixa UDP na VPS por fora do Coolify e configurar TURN/STUN. Resolver como parte do runbook de deploy, não é uma decisão de produto.

## Ambiente de desenvolvimento local

- **Objetivo:** dev local autossuficiente, sem setup manual de terceiros.
- **LiveKit:** roda via `docker-compose` (arquivo na raiz do repo) em modo dev, com API key/secret fixos de desenvolvimento — é a única peça da stack incômoda o suficiente pra rodar nativamente.
- **`apps/server` (Colyseus) e `apps/client` (SvelteKit):** continuam rodando via `pnpm dev` nativo (fora de container), pra manter hot-reload rápido.
- Isso é uma exigência de developer experience, diferente do empacotamento self-host genérico para terceiros (que segue adiado para pós-MVP, ver seção de licenciamento abaixo).

## Projeto / licenciamento

- **Licença:** AGPL-3.0 — escolhida para impedir que terceiros hospedem o projeto como SaaS fechado sem contribuir de volta o código.
- **Time:** desenvolvimento solo, contribuições externas bem-vindas (open source).
- **Prazo:** sem deadline definido.
- **Objetivo de design:** o projeto deve ser fácil de rodar no próprio servidor de qualquer pessoa — mas esse empacotamento (Docker Compose genérico, documentação de instalação) é trabalho de pós-MVP, depois que a arquitetura estabilizar.

## Decisões em aberto / assumidas (confirmar se estiver errado)

- Sem chat de texto no MVP — não fazia parte do escopo original combinado.
- Avatar: apenas 2 sprites pré-definidos (homem e mulher), sem editor de aparência nem outras variações.

## Próximos passos sugeridos

1. Estruturar o monorepo (`apps/client` SvelteKit, `apps/server` Colyseus, `packages/shared` para tipos/schemas compartilhados).
2. Prototipar client Phaser dentro do SvelteKit (cuidado com SSR — Phaser precisa rodar só no browser).
3. Subir um servidor Colyseus mínimo com sincronização de posição de avatares.
4. Integrar LiveKit self-hosted local (docker) e validar a lógica de volume por distância.
5. Preparar deploy na VPS Hetzner via Coolify, resolvendo a exposição de portas UDP do LiveKit.
