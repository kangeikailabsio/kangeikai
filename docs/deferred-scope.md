# Escopo adiado

Coisas deixadas deliberadamente de fora do escopo de uma correção ou feature, para não se
perderem. Cada item linka de volta pra onde a decisão foi tomada. Quando um item for finalmente
endereçado, remova-o daqui (a issue/PR que o resolve passa a ser a fonte de verdade).

- **Blindar o áudio de proximidade/salas privadas contra cliente malicioso** — hoje, distância
  e estado "busy" só reduzem o volume de reprodução no cliente; todo cliente está de fato
  inscrito no áudio de todo mundo na sala "office" do LiveKit, então um cliente deliberadamente
  modificado poderia ignorar o volume e escutar independente de distância ou busy. Deixado de
  fora de [#144](https://github.com/kangeikailabsio/kangeikai/issues/144) (vazamento acidental,
  não um cliente malicioso) como um projeto maior e separado — exigiria inscrição
  seletiva/mediada pelo servidor em vez de apenas controle de volume no cliente.
- **Perda de conexão com o servidor falha silenciosamente** — `RoomConnection` já expõe
  `onConnectionStateChange` (`apps/client/src/lib/network/room-connection.ts:118`), mas nenhum
  lugar do client escuta esse evento; se o servidor Colyseus cai ou a conexão é perdida, o
  avatar local continua parecendo totalmente funcional, sem nenhum aviso de que não está mais
  sincronizado com ninguém. Notado em `docs/mvp-plan.md`, sem issue aberta.
- **Sem continuidade de sessão/posição ao dar refresh na página** — cada refresh cria uma sessão
  nova no Colyseus e volta pro spawn point, mesmo o servidor já suportando reconexão
  (`allowReconnection`/`reconnectionToken`, `office-room.ts:122-138`) — falta o client guardar o
  token e tentar `reconnect()` antes de criar sessão nova. A duplicata visível que isso causava
  (avatar antigo nunca some) é corrigida pela
  [#178](https://github.com/kangeikailabsio/kangeikai/issues/178) via deduplicação por
  identidade no `onJoin` (hoje pelo id da conta, [#232](https://github.com/kangeikailabsio/kangeikai/issues/232)) — mas isso só limpa a cópia antiga, não retoma a sessão de
  fato: cada refresh continua sendo um respawn do zero, sem posição/estado preservado. Notado em
  `docs/mvp-plan.md`, sem issue aberta pra continuidade real.
- **`privateZoneAt` assume que zonas privadas nunca se sobrepõem** — `packages/shared/src/private-zones.ts:46-48`
  documenta a suposição mas não a garante; se algum mapa no Tiled tiver duas zonas `private`
  sobrepostas, qual delas "vence" é arbitrário e silencioso. Baixa prioridade — depende de erro
  de autoria do mapa, não de um bug de runtime.
- **Sem aviso ao encaçapar bola do adversário** — a regra da casa de
  [#188](https://github.com/kangeikailabsio/kangeikai/issues/188) (encaçapar qualquer bola do
  adversário passa a vez, mesmo junto com uma bola sua) não é falta e não mostra mensagem: o
  jogador só percebe pela vez mudando. Também ficou de fora uma variante com bola na mão para o
  adversário. O comportamento está em `evaluateShot` (`packages/games/pool/src/core.ts`).
- **Bot de sinuca sem estratégia de posição** — o bot de [#190](https://github.com/kangeikailabsio/kangeikai/issues/190)
  (`packages/games/pool/src/bot.ts`) escolhe a tacada pela bola fantasma e simula só as 5 melhores
  candidatas; não planeja onde a branca vai parar, não faz tacadas de segurança e só tem um nível
  ("médio", constantes no topo do arquivo, afinadas jogando). Ficaram de fora: níveis de dificuldade
  selecionáveis, mais de um bot, afinação automática da dificuldade (ex.: bot contra bot medindo
  taxa de encaçapadas) e um aviso de falta específico do bot.
- **Internacionalização do pool e do resto do app** — [#193](https://github.com/kangeikailabsio/kangeikai/issues/193)
  traduziu os textos do pool para inglês (o idioma padrão), mas o resto do app (menus, página
  inicial, painel de avatar etc.) continua em português e não há biblioteca nem catálogo de
  mensagens. Os avisos e as faltas do pool são texto montado no servidor
  (`packages/games/pool/src/server.ts`, `core.ts`) e enviado no snapshot; para traduzir de verdade
  o servidor terá de mandar códigos de mensagem (ex.: `wrong-first-contact` com a bola derrubada) e o
  cliente montar a frase no idioma do jogador.
- **Modo Regional sem defesa do bot e sem nome oficial** — o modo Regional de
  [#194](https://github.com/kangeikailabsio/kangeikai/issues/194) não exige tabela depois do
  contato, então toques leves de defesa são legais, mas o bot (`packages/games/pool/src/bot.ts`)
  só lê o modo na pontuação e não joga defesa de propósito. Também não há nome oficial/histórico
  da variante (é uma regra regional sem fonte encontrada) e o modo só pode ser trocado antes de a
  partida começar, pelo dono da mesa.
- **Formato 2×2 sem bot, nomes e cores de time** — o formato 2×2 de
  [#200](https://github.com/kangeikailabsio/kangeikai/issues/200) é só entre humanos: o botão
  "Play against the bot" fica restrito ao 1×1 (jogar contra o bot volta a mesa para 1×1) e o
  bot não completa uma dupla. Os times são fixos ("Team A" e "Team B"), sem nome nem cor
  escolhidos pelos jogadores. A ordem dentro de cada time é sorteada a cada partida
  (`drawOrder` em `packages/games/pool/src/server.ts`) e quem sai no meio faz o time inteiro
  perder (sem substituição nem continuação com o parceiro).
- **Espectadores não veem mira na vez do bot** — a mira compartilhada de
  [#203](https://github.com/kangeikailabsio/kangeikai/issues/203) é enviada pelo cliente de quem
  está na vez e repassada só a espectadores e ao parceiro de time (evento `aim`, separado do
  snapshot). O bot atira direto, sem mira visível, então os espectadores não veem nada durante a
  vez dele. Também não há como impedir que um espectador conte a mira ao adversário por voz ou
  vídeo de proximidade no escritório: o servidor só garante que o adversário não **recebe** os dados.
- **Scripts de mira e clientes adulterados no pool** — [#206](https://github.com/kangeikailabsio/kangeikai/issues/206)
  detecta scripts injetados na página (`requestAnimationFrame` ou métodos do WebGL trocados, e um
  `<canvas>` flutuante sobre a mesa). Com pelo menos dois sinais distintos, o servidor tira o jogador da
  partida em andamento (1×1, 2×2 e contra o bot), cancela a partida sem vencedor e devolve os outros ao
  estado de antes, sem avisá-los. Só quem trapaceou vê o alerta. Bloquear a injeção é impossível num
  cliente web, e o estado do jogo é público (todo cliente recebe as posições das bolas e leva a física no
  bundle), então ficaram de fora: cliente modificado, bundle copiado e bot externo que calcula a tacada
  pelos dados da rede. Quem editar o script para não mandar o relatório escapa, porque a denúncia vem do
  próprio cliente. Também ficaram de fora um bloqueio que persista (o jogador pode voltar à mesa), a
  punição de espectadores, uma mira oficial opcional para todos (decisão de game design) e esconder
  cores/texturas das bolas (fácil de contornar e ruim para acessibilidade). Um sinal só nunca pune, para
  não derrubar quem usa extensões que mexem no `requestAnimationFrame` ou no WebGL.
- **Diagnóstico do screen share só observa** — [#208](https://github.com/kangeikailabsio/kangeikai/issues/208)
  mostra, em cada tile de screen share, métricas de envio (quem compartilha) e de recebimento (quem
  assiste), UDP ou TCP e uma frase de causa provável, mas não muda nada na publicação. Ficaram de
  fora: ajustar `contentHint`/`degradationPreference`, simulcast e escolha de codec, TURN e fallback
  TCP no servidor LiveKit (hoje sem TURN e com UDP restrito a 50000-50100 em produção), mostrar o
  estado de cada espectador para quem compartilha (exigiria trafegar dados de volta), adaptação
  automática de qualidade, teste ativo de banda e comparar antes de gravar em
  `screenShareGridState.set()` (hoje reescrito a cada frame). Os limiares de Boa/Instável/Ruim são
  fixos e conservadores, para ajustar depois com dados reais.
- **Fluidez sempre vence a nitidez no screen share** — [#217](https://github.com/kangeikailabsio/kangeikai/issues/217)
  faz todos os tiers (720p, 1080p e 2K) usarem `maintain-framerate` e `contentHint: 'motion'`: sob
  pressão de CPU ou rede, o encoder reduz a resolução antes de derrubar frames. Isso favorece jogos,
  mas deixa texto e código mais borrados enquanto a conexão estiver apertada. Ficou de fora uma
  opção "Content" no popover de qualidade ("Smooth" para jogos e vídeo, "Sharp" para documentos e
  código, voltando ao padrão do SDK, que prioriza a resolução). Só vale a pena se alguém reclamar.
- **Mic e câmera entre salas seguem a intenção da pessoa** — [#222](https://github.com/kangeikailabsio/kangeikai/issues/222)
  e [#239](https://github.com/kangeikailabsio/kangeikai/issues/239): o `MediaControls` guarda o que
  a pessoa pediu (`microphoneIntent` e `cameraIntent`), registrado na hora do pedido e não quando a
  publicação termina, e a `OfficeScene` repassa isso em toda troca de sala. A primeira versão do
  #222 lia o estado da track antes do `disconnect()`, o que falhava se a pessoa saísse enquanto a
  publicação ainda estava em andamento (#239); essa leitura foi removida. O Busy usa o valor que o
  `endBusy` vai restaurar. Ficou de fora: tentar publicar de novo no escritório quando a
  publicação falha de verdade (permissão negada ou sem dispositivo): a intenção é mantida e
  repassada, mas o botão continua mostrando "Mic unavailable" até a pessoa agir. O fluxo de busy
  dentro de uma sala privada não tem teste e2e próprio.
- **Falha de conexão na sala privada: recuperação local, sem avisar os outros** — [#225](https://github.com/kangeikailabsio/kangeikai/issues/225)
  faz o cliente tentar mais 2 vezes (1 s de intervalo) antes de mostrar "Couldn't connect", dá um
  botão "Try again" ao tile de erro, tira o erro quando a outra pessoa sai da zona e esconde o
  tile pendente dos outros depois de 15 s (ele volta sozinho se a pessoa conectar). Ficaram de
  fora: a pessoa que falhou avisar o servidor (campo no schema ou mensagem validada com Valibot)
  para os outros verem o motivo, distinguir o tipo de erro na mensagem (403, rede, 5xx), timeouts
  em `fetch` e `room.connect` (se algo travar, nem o erro aparece) e um possível vazamento de
  `Room` quando o `room.connect` falha pela metade (visto só na leitura do código). A causa do
  erro intermitente (403 por a posição chegar depois do pedido de token) é hipótese, não foi
  reproduzida.
- **Telas de login e cadastro são só interface** — [#230](https://github.com/kangeikailabsio/kangeikai/issues/230)
  traz `/sign-in` e `/sign-up` com email e senha e o botão do Google, validados localmente com
  Valibot, sem falar com servidor nenhum. As chamadas ao better-auth, o redirecionamento para
  `/room`, o envio do Google e o desvio de quem já tem sessão ficam na integração
  ([#232](https://github.com/kangeikailabsio/kangeikai/issues/232)). Ficaram de fora do épico: "esqueci
  a senha" e verificação de email (precisam de SMTP), outros provedores de login, uma tela de
  conta ou de perfil, mostrar a força da senha e lembrar o último método usado. As regras de senha
  do formulário (8 a 128 caracteres) copiam o padrão do better-auth e precisam acompanhar o
  servidor se ele mudar (#231).
- **Backend de autenticação só com o essencial** — [#231](https://github.com/kangeikailabsio/kangeikai/issues/231)
  monta o better-auth em `/api/auth/*` do `apps/server`, com email e senha e Google, Drizzle e
  Postgres (ids inteiros incrementais) e CORS só para a origem do site. Ficaram de fora: rodar as
  migrações no boot (hoje é `pnpm db:migrate`), limite de tentativas além do padrão do better-auth,
  backups e hospedagem do Postgres de produção, outros provedores de login e o endpoint que valida
  e grava o avatar da conta (vem na integração, #232; por isso `spriteType` e
  `characterSelection` não aceitam escrita pelo cliente e o cadastro que tenta mandá-los leva
  400). O CORS do Colyseus continua permissivo no preflight (`OPTIONS`) para qualquer origem, como
  já era; nas rotas de auth só as requisições reais são restritas à origem do site (um `POST` de
  fora leva 403 e nenhum header de CORS). Apertar o CORS do servidor inteiro para a origem do site
  é uma mudança à parte, porque afeta o matchmaking do jogo.
- **Integração da conta com a sala só com o essencial** — [#232](https://github.com/kangeikailabsio/kangeikai/issues/232)
  exige conta para entrar: as telas de login chamam o better-auth, `/room` redireciona para
  `/sign-in` sem sessão, o formulário de entrada vem preenchido com a conta e salva nome e avatar
  (`PUT /api/profile`), e o `join` do Colyseus leva um ticket assinado de 60 s (`POST
  /api/session-ticket`) que o `onAuth` valida. Uma conta tem um avatar só: a nova conexão fecha a
  anterior com o código 4001 e a aba antiga mostra um aviso. Saem os guests, o `guestId`, o
  `ACCESS_CODE` e o gerador de nome aleatório. Ficaram de fora: reaproveitar o perfil que
  estava no `localStorage` como ponto de partida do primeiro cadastro, uma tela de perfil ou
  conta separada do formulário de entrada (o avatar só se edita ali), ticket de uso único (hoje
  qualquer um que interceptar o ticket pode usá-lo por até 60 s, e o ticket só vale para
  entrar, não dá acesso à conta), reconexão automática depois de um `join` rejeitado por
  sessão expirada além de voltar para o login, limite de tentativas no endpoint do ticket e do
  perfil, e rodar o Playwright contra o fluxo completo (#227). O botão de sair existe só como
  link no formulário de entrada.
- **Suíte e2e com Playwright só localmente** — [#227](https://github.com/kangeikailabsio/kangeikai/issues/227)
  traz o pacote `e2e/` (Chromium, servidor e cliente próprios nas portas 2667 e 5273, banco
  recriado a cada execução, câmera e microfone falsos) com os cenários de cadastro, teclado,
  dois jogadores, mesma conta em duas abas, microfone ao sair da sala privada (#222) e falha de
  conexão com "Try again" (#225), incluindo sair da zona no meio da conexão da sala privada (#239). Ficaram de fora: rodar no GitHub Actions (#236), Firefox e
  WebKit, o login com o Google (exige o provedor real) e o desaparecimento do spinner dos
  outros depois de 15 s (teste de 15 s, melhor com relógio simulado). Os testes da sala privada
  compartilham a sala `office` do LiveKit de desenvolvimento.

- **Vídeos da landing: primeira rodada, sem script de gravação** — [#242](https://github.com/kangeikailabsio/kangeikai/issues/242)
  traz o passeio do hero, o mapa compartilhado, voz e vídeo por proximidade, salas privadas e o
  criador de avatar (MP4, WebM e poster, uns 2,3 MB no total em `apps/client/static/landing/`),
  gravados com câmera desligada. A landing toca cada clipe só quando ele aparece na tela, carrega
  os posters de baixo só perto dela e mostra só o poster para quem pede menos movimento. Ficaram de
  fora: um script que regrave os clipes (a primeira versão, com Playwright e `ffmpeg`, foi
  escrita e depois removida do PR porque os vídeos não devem mudar tão cedo; está nos commits do
  PR [#243](https://github.com/kangeikailabsio/kangeikai/pull/243) se for preciso retomar), os
  clipes de compartilhar tela e do jogo de sinuca (as duas vagas continuam com o espaço
  reservado), imagem de rosto de verdade, recortes para celular e vídeos mais longos ou com som.
  Ao regravar à mão, mantenha os arquivos pequenos (uns 1,5 MB cada), em MP4 e WebM, com um poster
  `<nome>-poster.jpg`, e confira o Lighthouse. Dois cuidados que a primeira gravação ensinou:
  dentro de uma zona privada todos ficam na mesma chamada qualquer que seja a distância, então os
  clipes de proximidade só funcionam no chão aberto entre as mesas e a sala de estar; e quem fecha
  o navegador à força fica um tempo na sala e aparece como tile no clipe seguinte. O crédito da arte
  do mapa (LimeZu) continua pendente, como registrado.
- **Módulo de dispositivos só com a base** — [#245](https://github.com/kangeikailabsio/kangeikai/issues/245),
  parte do épico [#244](https://github.com/kangeikailabsio/kangeikai/issues/244): `lib/av/devices/` lista
  microfones e câmeras (`Room.getLocalDevices` sem sala, sem pedir permissão), guarda a escolha no
  `localStorage` por navegador (validada com Valibot), traduz o erro em "bloqueado", "não encontrado" ou
  "em uso", e aplica o dispositivo escolhido nas duas salas (as opções `audioCaptureDefaults` e
  `videoCaptureDefaults` do `Room`, lidas de novo a cada volta ao escritório porque o `Room` é
  reaproveitado). O `MediaControls` ganha o motivo da falha e `switchDevice`, que troca ao vivo quando o
  microfone ou a câmera está ligado e, desligado, só aponta a próxima captura. Um dispositivo salvo que
  sumiu não impede ninguém de entrar: o LiveKit tenta de novo sem exigir o dispositivo exato. Ficaram de
  fora: qualquer tela (a de entrada é a #246 e o menu da sala é a #247), a saída de áudio (alto-falante),
  avisar quando o dispositivo em uso é desplugado e testar a troca entre dois dispositivos reais no e2e
  (o Chromium só oferece um microfone e uma câmera falsos; isso e os pedidos de permissão se conferem à
  mão). Achado lateral, fora do épico: ao ir do escritório para uma sala privada o app desconecta a sala
  antiga sem esperar o microfone ser liberado (o #137 só cobre a volta), então a corrida de "dispositivo
  ocupado" ainda é possível nessa direção.

- **Tela de entrada com prévia de dispositivos, sem teste** — [#246](https://github.com/kangeikailabsio/kangeikai/issues/246),
  parte do épico [#244](https://github.com/kangeikailabsio/kangeikai/issues/244): a tela "Join the space"
  liga microfone e câmera sozinha, mostra a prévia da câmera e deixa escolher o dispositivo de cada um com
  um interruptor liga/desliga; o estado dos interruptores é como a pessoa entra na sala. A prévia é
  independente da sala (`DevicePreview`): ela é parada ao clicar em "Enter" e a sala captura de novo com o
  dispositivo escolhido, porque o LiveKit para as faixas ao desconectar e não dá para entregá-las. Ficaram
  de fora: medidor de volume do microfone e botão de teste (viram a modal da #248), saída de áudio, e
  trocar o dispositivo dentro da sala (#247). Dispositivo bloqueado, ausente ou em uso é explicado na
  tela, mas nunca impede de entrar. No e2e só dá para testar com o microfone e a câmera falsos do
  Chromium; a troca entre dispositivos reais e os pedidos de permissão se conferem à mão.

- **Menu de dispositivos na sala, sem avisos de desplugar** — [#247](https://github.com/kangeikailabsio/kangeikai/issues/247),
  parte do épico [#244](https://github.com/kangeikailabsio/kangeikai/issues/244): os botões de microfone e
  câmera do HUD viram botões divididos. A parte principal continua ligando e desligando; a seta abre um
  menu (`role='menu'`, setas e Escape) com os dispositivos e o atual marcado. Escolher um dispositivo o
  guarda para as próximas salas e visitas e troca na sala atual (ao vivo só se estiver ligado; desligado,
  só aponta a próxima captura). O menu fica desligado em "Busy", atualiza no `devicechange` e, sem
  dispositivos, explica o motivo. Ficaram de fora: a saída de áudio (alto-falante) e avisar quando o
  dispositivo em uso é desplugado. O e2e só enxerga o microfone e a câmera falsos do Chromium; trocar
  entre dois dispositivos reais, um fone Bluetooth conectando com o menu aberto e trocar numa sala
  privada e sair andando se conferem à mão.

- **Validação de movimento no servidor, só o essencial** — [#255](https://github.com/kangeikailabsio/kangeikai/issues/255),
  parte do épico [#253](https://github.com/kangeikailabsio/kangeikai/issues/253): o servidor deixa de
  confiar no `x/y` que o cliente manda. Rejeita `NaN`/`Infinity`, posições fora do mapa ou com os pés
  em cima de um retângulo de `collisions`, o trecho entre duas posições que cruza uma parede (amostrado a
  cada 4 px, aceitando a reta ou qualquer um dos dois "L") e velocidade acima de 450 px/s. A velocidade é
  um balde de distância que enche com o relógio do servidor (no máximo 1 s de folga, mais 32 px por passo
  que precisam ser devolvidos), então rajadas de mensagens atrasadas passam, mas um salto depois de um
  longo silêncio não. Uma posição inválida não vai para o estado: só quem a mandou recebe
  `correctPosition` com a última posição válida, e o servidor registra (no máximo a cada 5 s por pessoa).
  Ninguém é expulso. Isso torna `isPositionInZone` (token de sala privada) e a distância da mesa de
  sinuca confiáveis. Não foi preciso tratar a volta do Busy nem a saída da mesa como saltos: o cliente não
  anda nesses estados. O teleporte dos testes e2e só funciona com `E2E_ALLOW_TELEPORT=true` no servidor
  (o `playwright.config.ts` liga; `E2E_VALIDATE_MOVEMENT=true` desliga para testar com a validação
  real); essa variável nunca deve existir em produção. Ficaram de fora: o áudio mediado pelo servidor
  (a entrada "Blindar o áudio" acima continua valendo: um cliente modificado ainda escuta quem está longe),
  punir ou desconectar quem insiste, e checar colisão com outros jogadores ou mesas além do que já existe.
  Os limites são generosos e não foram afinados com dados reais: vale olhar o log do servidor depois do
  deploy.
