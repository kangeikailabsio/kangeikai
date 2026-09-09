# Escopo adiado

Coisas deixadas deliberadamente de fora do escopo de uma correção ou feature, para não se
perderem. Cada item linka de volta pra onde a decisão foi tomada. Quando um item for finalmente
endereçado, remova-o daqui (a issue/PR que o resolve passa a ser a fonte de verdade).

- **Servidor autoritativo do ponto de spawn** — o servidor ainda cria cada avatar numa posição
  placeholder fixa, em vez do ponto real de respawn do Tiled, porque o servidor não tem
  consciência de mapa/collision hoje. Deixado de fora de
  [#143](https://github.com/kangeikailabsio/kangeikai/issues/143) como um projeto maior e
  separado (dar ao servidor consciência real de mapa), não parte da correção contida
  client-side daquele bug.
- **Blindar o áudio de proximidade/salas privadas contra cliente malicioso** — hoje, distância
  e estado "busy" só reduzem o volume de reprodução no cliente; todo cliente está de fato
  inscrito no áudio de todo mundo na sala "office" do LiveKit, então um cliente deliberadamente
  modificado poderia ignorar o volume e escutar independente de distância ou busy. Deixado de
  fora de [#144](https://github.com/kangeikailabsio/kangeikai/issues/144) (vazamento acidental,
  não um cliente malicioso) como um projeto maior e separado — exigiria inscrição
  seletiva/mediada pelo servidor em vez de apenas controle de volume no cliente.
- **Posição client-authoritative, sem validação de movimento no servidor** — o servidor confia
  no `x/y` que o próprio cliente reporta via `updateState` (`apps/server/src/rooms/office-room.ts:104-112`);
  um cliente modificado pode reportar qualquer posição (teleporte, atravessar paredes do ponto
  de vista do servidor, se declarar dentro de qualquer zona a qualquer momento). A issue #60
  (fechada) resolveu só o caso de pedir um token de sala privada sem nunca ter sincronizado uma
  posição compatível — não o problema mais amplo de confiar cegamente na posição reportada.
  Provavelmente a causa raiz por trás do gap de áudio acima. Sem issue aberta cobrindo isso.
- **Perda de conexão com o servidor falha silenciosamente** — `RoomConnection` já expõe
  `onConnectionStateChange` (`apps/client/src/lib/network/room-connection.ts:118`), mas nenhum
  lugar do client escuta esse evento; se o servidor Colyseus cai ou a conexão é perdida, o
  avatar local continua parecendo totalmente funcional, sem nenhum aviso de que não está mais
  sincronizado com ninguém. Notado em `docs/mvp-plan.md`, sem issue aberta.
- **Sem continuidade de sessão/posição ao dar refresh na página** — cada refresh cria uma sessão
  nova no Colyseus e volta pro spawn point, mesmo o servidor já suportando reconexão
  (`allowReconnection`/`reconnectionToken`, `office-room.ts:122-138`) — falta o client guardar o
  token e tentar `reconnect()` antes de criar sessão nova. Notado em `docs/mvp-plan.md`, sem
  issue aberta.
- **`privateZoneAt` assume que zonas privadas nunca se sobrepõem** — `packages/shared/src/private-zones.ts:46-48`
  documenta a suposição mas não a garante; se algum mapa no Tiled tiver duas zonas `private`
  sobrepostas, qual delas "vence" é arbitrário e silencioso. Baixa prioridade — depende de erro
  de autoria do mapa, não de um bug de runtime.
