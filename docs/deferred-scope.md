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
- **Bola do adversário encaçapada: aviso só em texto, sem variante de bola na mão** — a regra da casa de
  [#188](https://github.com/kangeikailabsio/kangeikai/issues/188) (encaçapar qualquer bola do
  adversário passa a vez, mesmo junto com uma bola sua) não é falta. Desde a
  [#279](https://github.com/kangeikailabsio/kangeikai/issues/279) o `notice` da mesa explica por que a
  vez passou nos dois modos (`shotNotice` em `packages/games/pool/src/core.ts`). Ficou de fora uma variante
  com bola na mão para o adversário e qualquer destaque visual além do texto.
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
  automática de qualidade e teste ativo de banda. Os limiares de Boa/Instável/Ruim são
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
  para os outros verem o motivo, distinguir o tipo de erro na mensagem (403, rede, 5xx). Os timeouts
  (10 s no `fetch` do token e 15 s no `room.connect`) vieram com [#277](https://github.com/kangeikailabsio/kangeikai/issues/277);
  cancelar no nível do SDK um `connect()` em andamento continua de fora. A tentativa que falha passou a
  desconectar o próprio `Room` ([#291](https://github.com/kangeikailabsio/kangeikai/issues/291)). A causa do
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
  sessão expirada além de voltar para o login, e rodar o Playwright contra o fluxo completo (#227). O
  botão de sair existe só como link no formulário de entrada. O limite de tentativas veio com
  [#293](https://github.com/kangeikailabsio/kangeikai/issues/293): 30 tickets e 10 salvamentos de perfil
  por minuto por conta, em memória (`RateLimiter`), então reiniciar o servidor zera a contagem e várias
  instâncias contariam cada uma por si; ficaram de fora o limite por IP, a loja compartilhada (Redis) e
  as outras rotas.
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
  fora: qualquer tela (a de entrada é a #246 e o menu da sala é a #247), a saída de áudio (veio na [#299](https://github.com/kangeikailabsio/kangeikai/issues/299)),
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
  de fora: medidor de volume do microfone e botão de teste (viram a modal da #248), e
  trocar o dispositivo dentro da sala (#247). Dispositivo bloqueado, ausente ou em uso é explicado na
  tela, mas nunca impede de entrar. No e2e só dá para testar com o microfone e a câmera falsos do
  Chromium; a troca entre dispositivos reais e os pedidos de permissão se conferem à mão.

- **Menu de dispositivos na sala, sem avisos de desplugar** — [#247](https://github.com/kangeikailabsio/kangeikai/issues/247),
  parte do épico [#244](https://github.com/kangeikailabsio/kangeikai/issues/244): os botões de microfone e
  câmera do HUD viram botões divididos. A parte principal continua ligando e desligando; a seta abre um
  menu (`role='menu'`, setas e Escape) com os dispositivos e o atual marcado. Escolher um dispositivo o
  guarda para as próximas salas e visitas e troca na sala atual (ao vivo só se estiver ligado; desligado,
  só aponta a próxima captura). O menu fica desligado em "Busy", atualiza no `devicechange` e, sem
  dispositivos, explica o motivo. Ficou de fora avisar quando o
  dispositivo em uso é desplugado (a saída de áudio veio na #299). O e2e só enxerga o microfone e a câmera falsos do Chromium; trocar
  entre dois dispositivos reais, um fone Bluetooth conectando com o menu aberto e trocar numa sala
  privada e sair andando se conferem à mão.

- **Saída de áudio só onde o navegador deixa, sem som de teste** — [#299](https://github.com/kangeikailabsio/kangeikai/issues/299),
  parte do épico [#302](https://github.com/kangeikailabsio/kangeikai/issues/302): o menu do HUD ganha o botão
  "Speaker" e a tela de entrada uma linha "Speaker", que escolhem onde se ouve os outros (`audiooutput` no
  `DeviceChoice`, mesma chave do `localStorage`). A escolha vai para `room.options.audioOutput` de cada sala
  (escritório e privadas, como as entradas) e `MediaControls.switchDevice('audiooutput')` troca na hora. Só
  existe onde há `setSinkId` (Chromium); no Firefox e no Safari o HUD esconde o botão e a tela de entrada diz
  que usa o padrão do sistema. Busy não desliga o menu da saída. Ficaram de fora: um botão de som de teste e
  controle de volume, aplicar a escolha ao som de notificação (`notification-sound.ts`, que toca no padrão do
  sistema), um aviso quando a saída salva some (cai no padrão do navegador) e teste e2e (o Chromium falso só
  oferece uma saída; trocar entre duas reais se confere à mão).

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

- **Protocolo do escritório: o pool segue à parte e o client não confere os handlers** — [#260](https://github.com/kangeikailabsio/kangeikai/issues/260)
  define as mensagens do escritório (`updateState`, `setPresence`, `interaction`, `interactionReceived`,
  `spawn`, `correctPosition`, `sessionProof`) uma vez em `packages/shared/src/office-protocol.ts`, com
  nome, direção e schema Valibot; o servidor registra os handlers e o client escuta e envia a partir
  dessa tabela, e o client descarta com `console.warn` o que chega fora do schema. Ficaram de fora: unir
  o protocolo do pool (`POOL_COMMAND` e `POOL_EVENT`, em `packages/games/pool/src/protocol.ts`) a este
  (o pool tem o seu schema, e o client valida o `PoolEvent` recebido desde a [#278](https://github.com/kangeikailabsio/kangeikai/issues/278), mas as tabelas continuam separadas), e um teste
  que prove que o client escuta toda mensagem `toClient` (o servidor já tem o teste equivalente para as
  `toServer`; o `RoomConnection` fala com um `Client` real do Colyseus e não tem fake). Um
  `sessionProof` inválido agora é descartado e o client espera os 5 s do timeout em vez de aceitar o
  valor, o que só acontece com um servidor quebrado.

- **Seams de `Room` e estado de erro da sala privada, sem o resto do estado espelhado** — [#263](https://github.com/kangeikailabsio/kangeikai/issues/263),
  parte do épico [#262](https://github.com/kangeikailabsio/kangeikai/issues/262): o `PrivateRoomController`
  e o `ProximityAudioController` recebem uma fábrica de `Room` (`lib/av/room-factory.ts`, o `Room` real
  por padrão), e o erro de conexão da sala privada e o "Try again" (`connectError`, com `retrying`)
  passam a ter uma única fonte, o controller, em vez de uma cópia na `OfficeScene`. Ficaram de fora:
  um tipo `RoomLike` (o `Room` é repassado intacto ao `MediaControls` e ao overlay, então um tipo
  parcial só obrigaria a casts; os fakes dos testes fazem o cast, como o `media-controls.spec.ts` já
  fazia) e os campos `connectedPrivateRoom` e `localMediaConnecting` da cena. Eles não espelham o
  controller de forma fiel: `connectedPrivateRoom` só vale depois do `await` do `detachScreenShareTrack` e
  só some depois do `disconnect()` da sala, e `localMediaConnecting` dura até o `applyMediaControls`
  terminar. Mover os dois para o controller mudaria quando a cena troca de ramo no `update()`; quem sabe
  essa sequência é a sessão local de AV (#265). `onError` do `PrivateRoomTransitionHandlers` virou
  opcional, e a cena deixou de usá-lo.

- **Um `MediaControls` por sessão, com a qualidade da tela zerada a cada troca** — [#264](https://github.com/kangeikailabsio/kangeikai/issues/264),
  parte do épico [#262](https://github.com/kangeikailabsio/kangeikai/issues/262): o `MediaControls` passa a ser
  uma instância só, criada na primeira conexão, e `switchRoom(room)` o aponta para a sala ativa (tira os
  listeners da sala antiga, põe os da nova e reemite a qualidade da conexão). Sai o `adoptBusyState`; a
  intenção de mic e câmera e o Busy (com o snapshot que o `endBusy` restaura) simplesmente continuam na
  instância. Ficaram de fora: lembrar a qualidade e o "compartilhar áudio" do screen share entre as salas
  (como antes, `switchRoom` volta os dois ao padrão, porque um share só atravessa salas pelo
  `detachScreenShareTrack`/`adoptScreenShareTrack`, que leva a própria qualidade) e os motivos de falha de
  mic e câmera (também zerados a cada troca, como quando cada troca criava uma instância nova). Como o
  `MEDIA_CONTROLS_READY_EVENT` agora reemite a mesma referência a cada troca, o `+page.svelte` guarda o motivo
  da falha (`micFailure`, `cameraFailure`) em estado próprio, porque o template não perceberia um motivo novo
  lido de uma referência que não mudou. O constructor continua recebendo a primeira sala (o `Room` é só
  trocado depois); sem a sala no constructor ele precisaria de um estado "sem sala" em todos os getters.

- **Sessão local de AV: troca de sala ainda sem serialização** — [#265](https://github.com/kangeikailabsio/kangeikai/issues/265),
  fecha o épico [#262](https://github.com/kangeikailabsio/kangeikai/issues/262): o `LocalAvSession`
  (`lib/av/local-av-session.ts`) é dono de qual sala LiveKit a pessoa está e de tudo que atravessa uma
  troca (intenção de mic e câmera, Busy, passagem do screen share); a `OfficeScene` só chama
  `update(...)` uma vez por frame e lê `privateRoom`, `mediaConnecting`, `connectError`,
  `nearbySessionIds` e `activeRoom`. Ficaram de fora: serializar ou cancelar as trocas (a passagem para a
  sala privada continua sem `await`, então pode se intercalar com o `teardown` se a pessoa sair logo; a
  [#269](https://github.com/kangeikailabsio/kangeikai/issues/269) fez cada troca descartar o que fizer depois
  de ser ultrapassada por uma mais nova (um contador de geração), sem fila; um teste fixa a ordem do caso
  normal: a cena só vê a sala privada depois de o share ser solto do escritório), a política dos tiles do overlay de vídeo (ainda na
  cena: filtro de Busy, tile pendente, tile de erro e throttle) e a corrida de "dispositivo ocupado" ao ir
  do escritório para a sala privada (o `office.disconnect()` não é esperado). O `activeRoom` do hook de
  e2e continua lendo `privateRoom`.

- **Troca de sala: sem fila e sem cancelar a conexão em andamento** — [#269](https://github.com/kangeikailabsio/kangeikai/issues/269):
  o `LocalAvSession` agora confere, depois de cada `await` de uma troca, se ela ainda é a mais recente
  (`generation`), e desiste sem mexer no estado se uma troca mais nova começou: a ida para a sala privada
  que perdeu a corrida para a volta, e a volta ao escritório que perdeu para uma nova ida. Se a ida é
  ultrapassada depois de o share ser solto do escritório, o `track` é parado em silêncio em vez de
  republicado numa sala já desconectada (como já acontece na volta, #116), e a pessoa não vê o toast de
  "Couldn't continue screen share". Ficaram de fora: serializar as trocas numa fila e cancelar, no nível
  do LiveKit, um `connect()` que já está em andamento (a sala ultrapassada continua conectando até o
  controller derrubá-la no frame seguinte).

- **Voltar ao último ponto: só a posição, só em memória** — [#259](https://github.com/kangeikailabsio/kangeikai/issues/259):
  o `OfficeRoom` guarda, ao sair (refresh, aba fechada ou conexão caída), a última posição de cada conta
  num `LastPositionStore` em memória do processo, e `onJoin` põe a conta ali se o ponto ainda for um lugar
  onde um avatar cabe (senão, no `respawn`). Vale enquanto o servidor estiver no ar: reiniciar zera,
  e ele guarda no máximo 10 mil contas (sai a que saiu há mais tempo). Quem entra de novo passa pela tela
  de entrada, como antes. Ficaram de fora: gravar a posição no Postgres para sobreviver a reinícios
  ([#184](https://github.com/kangeikailabsio/kangeikai/issues/184); o AGENTS.md pede conversar antes de
  mover estado de jogo para o banco, e o `LastPositionStore` é síncrono, então a troca pediria uma
  interface assíncrona), a direção do avatar (volta olhando para baixo), o Busy (já é por aba, no
  `localStorage`) e o assento numa mesa de sinuca: cada entrada é uma sessão nova, com outro `sessionId`,
  então quem estava sentado precisa sentar de novo. Reaproveitar a sessão do Colyseus (`allowReconnection`,
  que já preserva o `sessionId`) pediria entregar ao client um token de reconexão, ou um endpoint que o
  entregue só a quem tem o cookie da conta; foi descartado por ora porque a tela de entrada continua e
  porque o ganho seria só o assento no pool.

- **Entrar já dentro de uma zona privada: a conexão do escritório em andamento não é abortada** — [#272](https://github.com/kangeikailabsio/kangeikai/issues/272):
  quem nasce numa zona privada com alguém (por exemplo, depois de um refresh no meio de uma conversa, desde
  a [#259](https://github.com/kangeikailabsio/kangeikai/issues/259)) entra na sala privada antes de o escritório
  terminar de aplicar a mídia. O `LocalAvSession` agora guarda o que foi escolhido na tela de entrada (a sala
  privada começa dali, e não dos padrões) e numera a primeira conexão do escritório como qualquer troca, então
  o escritório não aplica sua mídia por cima da sala privada. Ficou de fora: abortar a conexão do escritório que
  ainda está em andamento quando a sala privada assume (o `office.disconnect()` durante o `connect()` do LiveKit
  pode registrar um aviso no console). O e2e de refresh dentro da conversa cobre o caminho de ponta a ponta, mas
  no ambiente de teste o escritório costuma terminar antes da sala privada; quem prova a corrida são os testes
  unitários da sessão, que seguram a conexão do escritório.

- **Regras dos tiles de vídeo fora da cena; throttle e escrita nos stores ficam nela** — [#274](https://github.com/kangeikailabsio/kangeikai/issues/274):
  o `CallTiles` (`lib/av/call-tiles.ts`) decide quais tiles aparecem (Busy, o tile pendente que desiste depois
  de 15 s, o tile de erro e o spinner de "Try again", o tile local "conectando", o limite de 4 remotos e a
  ordem pelos mais próximos) a partir de dados simples, e o `snapshotRoom` é o único lugar que lê o `Room` do
  LiveKit para isso. A `OfficeScene` só diz em que situação a pessoa está (escritório, sala privada, sala
  privada que falhou), entrega o que sabe e escreve o resultado em `videoOverlayState` e
  `screenShareGridState`. Ficaram de fora: o throttle do redesenho (`nextOverlayRefresh`) e as escritas nos
  stores, que continuam na cena, e qualquer mudança no visual ou no número de tiles. O ramo da sala
  privada em Busy deixava a grade de compartilhamento como estava (só limpava a faixa); agora limpa as duas,
  como nos outros caminhos.

- **CI: só o essencial, sem branch protection, SHA nas actions nem matriz** — [#236](https://github.com/kangeikailabsio/kangeikai/issues/236):
  `.github/workflows/ci.yml` roda em todo pull request e em push na `main` os jobs `check` (lint e type
  checks), `build`, `unit`, `integration` (o servidor inteiro com cobertura, Postgres via Testcontainers)
  e `e2e` (Playwright contra o compose, com Chromium em cache e o relatório como artefato quando falha). A cobertura (`test:coverage` por pacote, 90% de lines, statements,
  functions e branches desde a [#282](https://github.com/kangeikailabsio/kangeikai/issues/282)) conta só a lógica; cada exclusão está no config do Vitest com o motivo. Ficaram
  de fora: marcar os jobs como obrigatórios (é configuração do repositório, não do workflow; o `e2e` fica de
  fora até se provar estável no runner do GitHub), fixar as actions por SHA, matriz de versões do Node ou de
  navegadores (só Chromium), enviar a cobertura a um serviço, cobertura da cena do Phaser, dos componentes
  Svelte e dos adapters de SDK (checados à mão e pelo e2e). O comando `pnpm lint` falhava na `main` por causa dos
  nomes `bug_report.md` e `feature_request.md` dos templates de issue; a regra agora os aceita.
