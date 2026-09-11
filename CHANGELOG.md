# Changelog

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
