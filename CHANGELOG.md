# Changelog

## [0.16.0](https://github.com/kangeikailabsio/kangeikai/compare/v0.15.0...v0.16.0) (2026-11-24)


### Features

* **av:** choose the audio output, speaker or headphones ([#299](https://github.com/kangeikailabsio/kangeikai/issues/299)) ([#304](https://github.com/kangeikailabsio/kangeikai/issues/304)) ([df94935](https://github.com/kangeikailabsio/kangeikai/commit/df94935d3ef5cc1fc3de54a1b67ab867adb65518))
* **av:** retry the microphone or camera when a device appears ([#301](https://github.com/kangeikailabsio/kangeikai/issues/301)) ([#306](https://github.com/kangeikailabsio/kangeikai/issues/306)) ([f11f5e2](https://github.com/kangeikailabsio/kangeikai/commit/f11f5e2362e235ee866e4520d0c7149bbe0b7e41))
* **av:** warn when the microphone or camera in use is disconnected ([#300](https://github.com/kangeikailabsio/kangeikai/issues/300)) ([#305](https://github.com/kangeikailabsio/kangeikai/issues/305)) ([2aa1774](https://github.com/kangeikailabsio/kangeikai/commit/2aa1774f04a2376d16e6cc318ce2ffc5175e6fd0))
* **server:** rate limit the session ticket and profile endpoints ([#293](https://github.com/kangeikailabsio/kangeikai/issues/293)) ([#297](https://github.com/kangeikailabsio/kangeikai/issues/297)) ([1af3ce0](https://github.com/kangeikailabsio/kangeikai/commit/1af3ce057b5a44fe33a21770486436cd8cd2a2db))


### Fixes

* **av:** a failed private room attempt disconnects its Room ([#291](https://github.com/kangeikailabsio/kangeikai/issues/291)) ([#295](https://github.com/kangeikailabsio/kangeikai/issues/295)) ([62cf306](https://github.com/kangeikailabsio/kangeikai/commit/62cf30656d9b9c94166cd0117a791d8647652c5b))
* **av:** the LiveKit token fetch and room connect time out ([#277](https://github.com/kangeikailabsio/kangeikai/issues/277)) ([#284](https://github.com/kangeikailabsio/kangeikai/issues/284)) ([9d5e388](https://github.com/kangeikailabsio/kangeikai/commit/9d5e38809e0f2d97e647d4c33f898da7daa9ff47))
* **av:** the private room waits for the office to release the microphone ([#298](https://github.com/kangeikailabsio/kangeikai/issues/298)) ([#303](https://github.com/kangeikailabsio/kangeikai/issues/303)) ([f259dc6](https://github.com/kangeikailabsio/kangeikai/commit/f259dc660c05a2ba19db54cba93136f9240a0d5f))
* **pool:** say why the turn passed after pocketing an opponent's ball ([#279](https://github.com/kangeikailabsio/kangeikai/issues/279)) ([#286](https://github.com/kangeikailabsio/kangeikai/issues/286)) ([8100285](https://github.com/kangeikailabsio/kangeikai/commit/8100285282e602d2bdf9f5121b2ab712fbff97ca))


### Performance

* **av:** the screen share grid state ignores a write of the same tiles ([#281](https://github.com/kangeikailabsio/kangeikai/issues/281)) ([#288](https://github.com/kangeikailabsio/kangeikai/issues/288)) ([089e970](https://github.com/kangeikailabsio/kangeikai/commit/089e970154d416f6bcf27058ebe7ce71e976fa98))
* **av:** the video overlay state ignores a write of the same entries ([#292](https://github.com/kangeikailabsio/kangeikai/issues/292)) ([#296](https://github.com/kangeikailabsio/kangeikai/issues/296)) ([4915569](https://github.com/kangeikailabsio/kangeikai/commit/4915569195605ed4ce13a8f3e3ecec8cf6176ccd))


### Improvements

* **pool:** the client validates the pool events it receives ([#278](https://github.com/kangeikailabsio/kangeikai/issues/278)) ([#285](https://github.com/kangeikailabsio/kangeikai/issues/285)) ([755b2ef](https://github.com/kangeikailabsio/kangeikai/commit/755b2ef124c216de44cf51312d17d2d41e826924))

## [0.15.0](https://github.com/kangeikailabsio/kangeikai/compare/v0.14.1...v0.15.0) (2026-11-15)


### ⚠ BREAKING CHANGES

* **auth:** joining the office requires an account. The guestId and accessCode join options and the ACCESS_CODE environment variable are removed.

### Features

* **auth:** accounts with better-auth and PostgreSQL; sign in to join the office ([#238](https://github.com/kangeikailabsio/kangeikai/issues/238)) ([8216473](https://github.com/kangeikailabsio/kangeikai/commit/8216473aa5680643f491267a30a0e15a33f4dec9))
* **av:** choose and test microphone and camera on the entry screen and in the room ([#244](https://github.com/kangeikailabsio/kangeikai/issues/244)) ([#252](https://github.com/kangeikailabsio/kangeikai/issues/252)) ([a32584d](https://github.com/kangeikailabsio/kangeikai/commit/a32584da7e8f42eaf710eacb874ed5d28ceb2f55))
* **landing:** add the landing page clips and play them lazily ([#243](https://github.com/kangeikailabsio/kangeikai/issues/243)) ([ac82f2a](https://github.com/kangeikailabsio/kangeikai/commit/ac82f2a9bb39ca8790a5edcd1b5ad810bbbf41a6))
* **server:** a returning account starts where it left ([#259](https://github.com/kangeikailabsio/kangeikai/issues/259)) ([#271](https://github.com/kangeikailabsio/kangeikai/issues/271)) ([40ea531](https://github.com/kangeikailabsio/kangeikai/commit/40ea5311e6e990b7f343b804894b7c237236527e))
* **server:** the server knows the map and validates movement ([#253](https://github.com/kangeikailabsio/kangeikai/issues/253)) ([#258](https://github.com/kangeikailabsio/kangeikai/issues/258)) ([faacfb1](https://github.com/kangeikailabsio/kangeikai/commit/faacfb1ff386e8ff093afd0977f31d0029af81fd))


### Fixes

* **av:** a switch that was overtaken no longer overwrites the newer one ([#269](https://github.com/kangeikailabsio/kangeikai/issues/269)) ([#270](https://github.com/kangeikailabsio/kangeikai/issues/270)) ([a19824c](https://github.com/kangeikailabsio/kangeikai/commit/a19824c102ad41167a3517325a390b953c68ef42))
* **av:** joining inside a private zone keeps the entry screen's microphone and camera ([#272](https://github.com/kangeikailabsio/kangeikai/issues/272)) ([#273](https://github.com/kangeikailabsio/kangeikai/issues/273)) ([10914d9](https://github.com/kangeikailabsio/kangeikai/commit/10914d99bb9ab0fe97e3b85133384dcd3571b4cf))
* **av:** keep mic and camera state when leaving a private room ([#222](https://github.com/kangeikailabsio/kangeikai/issues/222)) ([#223](https://github.com/kangeikailabsio/kangeikai/issues/223)) ([6d750a1](https://github.com/kangeikailabsio/kangeikai/commit/6d750a170abc80d15f8882448fcfb9a658e04579))
* **av:** keep the microphone and camera intent across room switches ([#241](https://github.com/kangeikailabsio/kangeikai/issues/241)) ([cab6335](https://github.com/kangeikailabsio/kangeikai/commit/cab6335811063e7f17b5863f88f60d9f3c4268b6))
* **av:** recover from private-room connect failures and stop the endless spinner for others ([#226](https://github.com/kangeikailabsio/kangeikai/issues/226)) ([e20770e](https://github.com/kangeikailabsio/kangeikai/commit/e20770e9209d40e6a705d0664f3f2c476b2a95ee))


### Improvements

* **av:** one MediaControls for the whole session ([#264](https://github.com/kangeikailabsio/kangeikai/issues/264)) ([#267](https://github.com/kangeikailabsio/kangeikai/issues/267)) ([12faffe](https://github.com/kangeikailabsio/kangeikai/commit/12faffeb0fca3d7c1af004c2bf599a32cfd0045b))
* **av:** room seams and a single source for the private-room error ([#263](https://github.com/kangeikailabsio/kangeikai/issues/263)) ([#266](https://github.com/kangeikailabsio/kangeikai/issues/266)) ([a3b3b94](https://github.com/kangeikailabsio/kangeikai/commit/a3b3b94e79429cc22392e85b30d97e9f5e72d884))
* **av:** the local AV session owns the room switch ([#265](https://github.com/kangeikailabsio/kangeikai/issues/265)) ([#268](https://github.com/kangeikailabsio/kangeikai/issues/268)) ([10083f5](https://github.com/kangeikailabsio/kangeikai/commit/10083f563276b0662682a1a625c36a8dcb146368))
* **av:** the video tile rules leave the scene ([#274](https://github.com/kangeikailabsio/kangeikai/issues/274)) ([#275](https://github.com/kangeikailabsio/kangeikai/issues/275)) ([56d4a06](https://github.com/kangeikailabsio/kangeikai/commit/56d4a06918c1cc658253a2143d3c331fd53c518f))
* **shared:** one office protocol for Colyseus messages ([#260](https://github.com/kangeikailabsio/kangeikai/issues/260)) ([#261](https://github.com/kangeikailabsio/kangeikai/issues/261)) ([7789a38](https://github.com/kangeikailabsio/kangeikai/commit/7789a38221531ee51c34248d22156f5918451682))

## [0.14.1](https://github.com/kangeikailabsio/kangeikai/compare/v0.14.0...v0.14.1) (2026-11-01)


### Fixes

* **av:** publish screen share with H.264 and no backup codec ([#219](https://github.com/kangeikailabsio/kangeikai/issues/219)) ([#220](https://github.com/kangeikailabsio/kangeikai/issues/220)) ([c6a7ba6](https://github.com/kangeikailabsio/kangeikai/commit/c6a7ba6ec7be1990cedd054f7716b36940ac2f0c))

## [0.14.0](https://github.com/kangeikailabsio/kangeikai/compare/v0.13.0...v0.14.0) (2026-11-01)


### Features

* **av:** tune screen share bitrate caps and keep the frame rate ([#216](https://github.com/kangeikailabsio/kangeikai/issues/216)) ([e6dafe2](https://github.com/kangeikailabsio/kangeikai/commit/e6dafe236c35fa7910ff6720626d2f72a168a490))

## [0.13.0](https://github.com/kangeikailabsio/kangeikai/compare/v0.12.1...v0.13.0) (2026-11-01)


### Features

* **av:** raise screen share bitrate caps and make 720p 30 fps ([#212](https://github.com/kangeikailabsio/kangeikai/issues/212)) ([#213](https://github.com/kangeikailabsio/kangeikai/issues/213)) ([dfaa4b6](https://github.com/kangeikailabsio/kangeikai/commit/dfaa4b6a123841c7ae69ea29c00192e2a267c531))

## [0.12.1](https://github.com/kangeikailabsio/kangeikai/compare/v0.12.0...v0.12.1) (2026-11-01)


### Fixes

* **av:** stop the screen share stats badge from restarting every frame ([#208](https://github.com/kangeikailabsio/kangeikai/issues/208)) ([#210](https://github.com/kangeikailabsio/kangeikai/issues/210)) ([6883d83](https://github.com/kangeikailabsio/kangeikai/commit/6883d83bed8b9f9da8358c9965a3eac16f33ee00))

## [0.12.0](https://github.com/kangeikailabsio/kangeikai/compare/v0.11.0...v0.12.0) (2026-11-01)


### Features

* **av:** show screen share connection stats to sharer and viewers ([#209](https://github.com/kangeikailabsio/kangeikai/issues/209)) ([5fc2580](https://github.com/kangeikailabsio/kangeikai/commit/5fc258040a7d26dad0df0641dcc3366cfd9f2c1e))
* **pool:** let spectators and the shooter's teammate see the aim ([#203](https://github.com/kangeikailabsio/kangeikai/issues/203)) ([#204](https://github.com/kangeikailabsio/kangeikai/issues/204)) ([e474c1a](https://github.com/kangeikailabsio/kangeikai/commit/e474c1a64b2405c6788c972b619a01e5ee3a256f))


### Fixes

* **pool:** remove players whose client reads the table from the match ([#207](https://github.com/kangeikailabsio/kangeikai/issues/207)) ([1351214](https://github.com/kangeikailabsio/kangeikai/commit/135121448d5027386cb9dcf37b7e675bddf10668))

## [0.11.0](https://github.com/kangeikailabsio/kangeikai/compare/v0.10.0...v0.11.0) (2026-10-22)


### Features

* **pool:** add a server-side bot opponent ([#190](https://github.com/kangeikailabsio/kangeikai/issues/190)) ([#191](https://github.com/kangeikailabsio/kangeikai/issues/191)) ([776a490](https://github.com/kangeikailabsio/kangeikai/commit/776a4906dd27941a05fd97464c4ff5c5a5c5bfec))
* **pool:** add the 2v2 format ([#200](https://github.com/kangeikailabsio/kangeikai/issues/200)) ([#202](https://github.com/kangeikailabsio/kangeikai/issues/202)) ([833f27a](https://github.com/kangeikailabsio/kangeikai/commit/833f27acb106a90eefc9b22c72c04afb7c4505e6))
* **pool:** add the Regional game mode ([#194](https://github.com/kangeikailabsio/kangeikai/issues/194)) ([#196](https://github.com/kangeikailabsio/kangeikai/issues/196)) ([8e3a43e](https://github.com/kangeikailabsio/kangeikai/commit/8e3a43e78e3d1076d1bead288c0cca4ed4873e1b))


### Fixes

* **pool:** fit the overlay to small screens without scrolling ([#197](https://github.com/kangeikailabsio/kangeikai/issues/197)) ([#198](https://github.com/kangeikailabsio/kangeikai/issues/198)) ([81eb8f8](https://github.com/kangeikailabsio/kangeikai/commit/81eb8f8c2b40054ecf42ea333be27fb486646574))
* **pool:** pass the turn when an opponent ball is potted ([#188](https://github.com/kangeikailabsio/kangeikai/issues/188)) ([#189](https://github.com/kangeikailabsio/kangeikai/issues/189)) ([8d1ee05](https://github.com/kangeikailabsio/kangeikai/commit/8d1ee05869267c0997a541e3aab2004ae05ed542))
* **pool:** size pockets at 1.75x the ball radius ([#186](https://github.com/kangeikailabsio/kangeikai/issues/186)) ([#187](https://github.com/kangeikailabsio/kangeikai/issues/187)) ([08a0cba](https://github.com/kangeikailabsio/kangeikai/commit/08a0cba9667a216549c6a01eadb4f147a0ec968f))
* **pool:** translate player-facing text to English ([#193](https://github.com/kangeikailabsio/kangeikai/issues/193)) ([#195](https://github.com/kangeikailabsio/kangeikai/issues/195)) ([850eea6](https://github.com/kangeikailabsio/kangeikai/commit/850eea677815541758621e9052e4c0b94e90b450))


### Improvements

* **pool:** generalize seats to players and teams ([#199](https://github.com/kangeikailabsio/kangeikai/issues/199)) ([#201](https://github.com/kangeikailabsio/kangeikai/issues/201)) ([2477826](https://github.com/kangeikailabsio/kangeikai/commit/2477826db00649d4692dadf0754f28f11b676bac))

## [0.10.0](https://github.com/kangeikailabsio/kangeikai/compare/v0.9.1...v0.10.0) (2026-10-16)


### Features

* **pool:** add multiplayer eight-ball with spectators ([#180](https://github.com/kangeikailabsio/kangeikai/issues/180)) ([b2244bb](https://github.com/kangeikailabsio/kangeikai/commit/b2244bbe44dfb0410d589dba692040b4eb9e25c4))

## [0.9.1](https://github.com/kangeikailabsio/kangeikai/compare/v0.9.0...v0.9.1) (2026-09-21)


### Fixes

* dedupe stale avatars on rejoin via a persistent guest identifier ([#178](https://github.com/kangeikailabsio/kangeikai/issues/178)) ([#181](https://github.com/kangeikailabsio/kangeikai/issues/181)) ([81aefbc](https://github.com/kangeikailabsio/kangeikai/commit/81aefbcd6ae1af655550eb89f5989748c119bde0))

## [0.9.0](https://github.com/kangeikailabsio/kangeikai/compare/v0.8.0...v0.9.0) (2026-09-16)


### Features

* Character Creator — customização de avatar (corpo, olhos, roupa, cabelo, acessório) ([#176](https://github.com/kangeikailabsio/kangeikai/issues/176)) ([114c29b](https://github.com/kangeikailabsio/kangeikai/commit/114c29bbceab5a0b495d8b9cf8e247f907d1d4fb))

## [0.8.0](https://github.com/kangeikailabsio/kangeikai/compare/v0.7.0...v0.8.0) (2026-09-11)


### Features

* "chamar atenção" — camera shake + blocking modal ([#158](https://github.com/kangeikailabsio/kangeikai/issues/158)) ([#165](https://github.com/kangeikailabsio/kangeikai/issues/165)) ([310c7f8](https://github.com/kangeikailabsio/kangeikai/commit/310c7f84ec4ef5443e7088b4f77df6e453844832))
* "Say Hello" button with a persistent toast and notification sound ([#164](https://github.com/kangeikailabsio/kangeikai/issues/164)) ([f6eb493](https://github.com/kangeikailabsio/kangeikai/commit/f6eb49317b8513ede9e4de557c92c78f00cdcc6d))
* **client:** "Follow" button continuously follows another avatar ([#163](https://github.com/kangeikailabsio/kangeikai/issues/163)) ([47abee9](https://github.com/kangeikailabsio/kangeikai/commit/47abee980b7aad4c40249eaf42aea68da579d62b))
* **client:** "Go to" button walks to another avatar's position ([#161](https://github.com/kangeikailabsio/kangeikai/issues/161)) ([963d9d0](https://github.com/kangeikailabsio/kangeikai/commit/963d9d0d4f88d5e2ba2d5fd14bcde8de9ae27344))

## [0.7.0](https://github.com/kangeikailabsio/kangeikai/compare/v0.6.3...v0.7.0) (2026-09-10)


### Features

* **client:** connection-quality indicator in the avatar profile panel ([#155](https://github.com/kangeikailabsio/kangeikai/issues/155)) ([2b14cef](https://github.com/kangeikailabsio/kangeikai/commit/2b14cefb15a6b4cd64c3a0593094618ccb0931f3)), closes [#132](https://github.com/kangeikailabsio/kangeikai/issues/132)
* **client:** dim the map outside a private zone (spotlight effect) ([#152](https://github.com/kangeikailabsio/kangeikai/issues/152)) ([3769356](https://github.com/kangeikailabsio/kangeikai/commit/376935609603e73e6dfbebe47fb90e5413ce8da2)), closes [#151](https://github.com/kangeikailabsio/kangeikai/issues/151)
* **client:** inline error tile when a private-room connection fails ([#156](https://github.com/kangeikailabsio/kangeikai/issues/156)) ([be6dfef](https://github.com/kangeikailabsio/kangeikai/commit/be6dfefa82373aecfb1398b8cf74f9d15e4ccba2)), closes [#142](https://github.com/kangeikailabsio/kangeikai/issues/142)
* **client:** per-participant connecting placeholder for private rooms ([#154](https://github.com/kangeikailabsio/kangeikai/issues/154)) ([7772a6e](https://github.com/kangeikailabsio/kangeikai/commit/7772a6e0441a7b26250ba747394286b262e57d00))

## [0.6.3](https://github.com/kangeikailabsio/kangeikai/compare/v0.6.2...v0.6.3) (2026-09-09)


### Fixes

* **client:** fail closed on newly subscribed proximity audio tracks ([#149](https://github.com/kangeikailabsio/kangeikai/issues/149)) ([f8b9dec](https://github.com/kangeikailabsio/kangeikai/commit/f8b9dec76f4289d2d249f8357bd1f22817cdf156)), closes [#144](https://github.com/kangeikailabsio/kangeikai/issues/144)
* **client:** stop rendering remote avatars at the placeholder spawn point ([#147](https://github.com/kangeikailabsio/kangeikai/issues/147)) ([d73a25b](https://github.com/kangeikailabsio/kangeikai/commit/d73a25b2cf390c409eccd81cd61b4ddc84b28760)), closes [#143](https://github.com/kangeikailabsio/kangeikai/issues/143)
* **client:** surface Colyseus connection loss to the user ([#150](https://github.com/kangeikailabsio/kangeikai/issues/150)) ([7e8dce8](https://github.com/kangeikailabsio/kangeikai/commit/7e8dce87188ddead0eabe0e4926c238b6bf91f09)), closes [#146](https://github.com/kangeikailabsio/kangeikai/issues/146)

## [0.6.2](https://github.com/kangeikailabsio/kangeikai/compare/v0.6.1...v0.6.2) (2026-09-08)


### Fixes

* **client:** release the private room's mic before reconnecting office audio ([#138](https://github.com/kangeikailabsio/kangeikai/issues/138)) ([9e8422a](https://github.com/kangeikailabsio/kangeikai/commit/9e8422a7e2dc5c7901888ba81df5412ae959fdf4)), closes [#137](https://github.com/kangeikailabsio/kangeikai/issues/137)

## [0.6.1](https://github.com/kangeikailabsio/kangeikai/compare/v0.6.0...v0.6.1) (2026-09-07)


### Fixes

* **client:** flush position before requesting a private-room token ([#135](https://github.com/kangeikailabsio/kangeikai/issues/135)) ([0a784fb](https://github.com/kangeikailabsio/kangeikai/commit/0a784fb7adb6c673e7b562ed41effa29270c0ca8))

## [0.6.0](https://github.com/kangeikailabsio/kangeikai/compare/v0.5.0...v0.6.0) (2026-09-07)


### Features

* **client:** add fps toggle to the avatar profile panel ([#131](https://github.com/kangeikailabsio/kangeikai/issues/131)) ([3afd355](https://github.com/kangeikailabsio/kangeikai/commit/3afd355054d2c0b4f87ebf4212086306eaea81ac)), closes [#130](https://github.com/kangeikailabsio/kangeikai/issues/130)
* **client:** avatar profile panel on click ([#128](https://github.com/kangeikailabsio/kangeikai/issues/128)) ([d4157b5](https://github.com/kangeikailabsio/kangeikai/commit/d4157b558cef75919b2302ed026792c971f204e5)), closes [#127](https://github.com/kangeikailabsio/kangeikai/issues/127)

## [0.5.0](https://github.com/kangeikailabsio/kangeikai/compare/v0.4.0...v0.5.0) (2026-09-07)


### Features

* **client:** compartilhar áudio da tela/janela/aba junto com a tela ([#113](https://github.com/kangeikailabsio/kangeikai/issues/113)) ([#114](https://github.com/kangeikailabsio/kangeikai/issues/114)) ([965f5b2](https://github.com/kangeikailabsio/kangeikai/commit/965f5b276941b659950f22d7ba55ee4c4fa68db1))
* compartilhamento de tela por proximidade ([2515dc2](https://github.com/kangeikailabsio/kangeikai/commit/2515dc2f62de5ce782e58e060777301122ec8796))
* pathfinding for click-to-move, with unreachable-target feedback ([#93](https://github.com/kangeikailabsio/kangeikai/issues/93)) ([db6fd15](https://github.com/kangeikailabsio/kangeikai/commit/db6fd158c738719ee7ee1e4a662c4bee802e2e55))
* scroll-wheel zoom in/out on the map camera ([#90](https://github.com/kangeikailabsio/kangeikai/issues/90)) ([0381c54](https://github.com/kangeikailabsio/kangeikai/commit/0381c54ae7a4ad0dee751040d0e1a476513080de))
* seletor de qualidade para compartilhamento de tela (até 2K) ([#112](https://github.com/kangeikailabsio/kangeikai/issues/112)) ([95a1fae](https://github.com/kangeikailabsio/kangeikai/commit/95a1fae5c33ff060838d5283ebd02bf3fc3b8606)), closes [#111](https://github.com/kangeikailabsio/kangeikai/issues/111)
* **server:** give the server access to authoritative private-zone geometry ([#123](https://github.com/kangeikailabsio/kangeikai/issues/123)) ([d9764ef](https://github.com/kangeikailabsio/kangeikai/commit/d9764ef87a20fce1e4f876f4d85ee904d7a5864f))


### Fixes

* **client:** make screen-share button retriable after any capture failure ([#117](https://github.com/kangeikailabsio/kangeikai/issues/117)) ([312c0af](https://github.com/kangeikailabsio/kangeikai/commit/312c0afb29ec4a3e90551f939894567383f72820)), closes [#115](https://github.com/kangeikailabsio/kangeikai/issues/115)
* **client:** preserve screen share across private-area room switches ([#118](https://github.com/kangeikailabsio/kangeikai/issues/118)) ([50a2c0d](https://github.com/kangeikailabsio/kangeikai/commit/50a2c0d99ca2e79789953617db131365896f6fb2)), closes [#116](https://github.com/kangeikailabsio/kangeikai/issues/116)
* **client:** silence svelte-check's state_referenced_locally in the screen-share popover ([#119](https://github.com/kangeikailabsio/kangeikai/issues/119)) ([3943462](https://github.com/kangeikailabsio/kangeikai/commit/39434623af94f0892995672ea17875d22b91f0e2))
* **server:** reject private room tokens for a zone that doesn't exist ([#124](https://github.com/kangeikailabsio/kangeikai/issues/124)) ([37617ab](https://github.com/kangeikailabsio/kangeikai/commit/37617ab0089fc29e56125ba82d7b6d233f0e3d42))
* **server:** verify requester position before minting a private room token ([#125](https://github.com/kangeikailabsio/kangeikai/issues/125)) ([3019e71](https://github.com/kangeikailabsio/kangeikai/commit/3019e71cf9fd61ce21c097e7e1c66a702f9db7d3))

## [0.4.0](https://github.com/kangeikailabsio/kangeikai/compare/v0.3.0...v0.4.0) (2026-09-02)


### Features

* add members sidebar listing people on the map ([#83](https://github.com/kangeikailabsio/kangeikai/issues/83)) ([74640d4](https://github.com/kangeikailabsio/kangeikai/commit/74640d44daa72969ad12785e6664178528c76154)), closes [#82](https://github.com/kangeikailabsio/kangeikai/issues/82)
* show a ring around a hovered avatar ([#88](https://github.com/kangeikailabsio/kangeikai/issues/88)) ([cf94f38](https://github.com/kangeikailabsio/kangeikai/commit/cf94f389715bc2a61137b915a878f5230b0eaa5b))
* walk to a double-clicked point on the map ([#86](https://github.com/kangeikailabsio/kangeikai/issues/86)) ([72bf7bb](https://github.com/kangeikailabsio/kangeikai/commit/72bf7bbf7c5fdcbdbcdb8765b9f29043b240157d))

## [0.3.0](https://github.com/kangeikailabsio/kangeikai/compare/v0.2.0...v0.3.0) (2026-08-27)


### Features

* add collision between the avatar and the map's collisions layer ([#65](https://github.com/kangeikailabsio/kangeikai/issues/65)) ([f14a6ed](https://github.com/kangeikailabsio/kangeikai/commit/f14a6eda462bdeff9a0f5118c4eb93ebb4ea7644)), closes [#64](https://github.com/kangeikailabsio/kangeikai/issues/64)
* add private conversation zones with isolated LiveKit rooms ([#61](https://github.com/kangeikailabsio/kangeikai/issues/61)) ([2ae65a0](https://github.com/kangeikailabsio/kangeikai/commit/2ae65a0bcc4bed4078e9872eecf4b4e89e7ffe4f)), closes [#58](https://github.com/kangeikailabsio/kangeikai/issues/58)
* add Roboto font via Fontsource ([#53](https://github.com/kangeikailabsio/kangeikai/issues/53)) ([e8d982a](https://github.com/kangeikailabsio/kangeikai/commit/e8d982aca5915635a05a13b4897959119a28f9b9))
* dynamically preload map/tileset images from the active map ([#59](https://github.com/kangeikailabsio/kangeikai/issues/59)) ([875d7c0](https://github.com/kangeikailabsio/kangeikai/commit/875d7c021c96c5635165b6ae4424789db9f08baa)), closes [#57](https://github.com/kangeikailabsio/kangeikai/issues/57)
* spawn players from the map's respawn object layer ([#63](https://github.com/kangeikailabsio/kangeikai/issues/63)) ([1e6d2a1](https://github.com/kangeikailabsio/kangeikai/commit/1e6d2a1de7962d33cdc1f380ccfe989d7bf45a61)), closes [#62](https://github.com/kangeikailabsio/kangeikai/issues/62)

## [0.2.0](https://github.com/kangeikailabsio/kangeikai/compare/v0.1.1...v0.2.0) (2026-08-24)


### Features

* add Shift-to-sprint movement ([#50](https://github.com/kangeikailabsio/kangeikai/issues/50)) ([4e33156](https://github.com/kangeikailabsio/kangeikai/commit/4e33156f06cb552d1f5a2270f1a337e024bb7c4f)), closes [#49](https://github.com/kangeikailabsio/kangeikai/issues/49)

## [0.1.1](https://github.com/kangeikailabsio/kangeikai/compare/v0.1.0...v0.1.1) (2026-08-24)


### Fixes

* keep release-please tags as plain vX.Y.Z ([#47](https://github.com/kangeikailabsio/kangeikai/issues/47)) ([19d74cc](https://github.com/kangeikailabsio/kangeikai/commit/19d74cc45f8462eb95022f5ea8d8c494572796f4))
