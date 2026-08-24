# Versionamento e releases

Como o projeto versiona código, gera changelog e publica releases no GitHub.

## Resumo

O versionamento é automatizado pelo [release-please](https://github.com/googleapis/release-please)
a partir dos commits em Conventional Commits (já exigidos pelo hook `commit-msg`, ver
`AGENTS.md`). Não existe bump de versão manual: a versão em `package.json`, o `CHANGELOG.md` e
a tag/release no GitHub são todos gerados pelo bot.

Uma única versão cobre o monorepo inteiro (client + server juntos) — não há versionamento
independente por app.

## Como o tipo do commit afeta a versão

| Tipo de commit                                | Efeito na versão |
| ---------------------------------------------- | ----------------- |
| `feat`                                         | **minor** (`0.1.0` → `0.2.0`) |
| `fix`, `perf`, `refactor`, `docs`, `chore`, ... | **patch** (`0.1.0` → `0.1.1`) |
| `feat!` ou rodapé `BREAKING CHANGE:`           | minor enquanto o projeto estiver em `0.x` (major a partir de `1.0.0`) |

Isso é configurado em `bump-minor-pre-major: true` no `release-please-config.json` — sem essa
flag, o release-please trataria `feat` como patch enquanto a versão for `0.x` (comportamento
padrão da ferramenta para pré-1.0).

## O que aparece no changelog

Nem todo commit que afeta a versão aparece no `CHANGELOG.md`. As seções visíveis são:

- **Features** (`feat`)
- **Fixes** (`fix`)
- **Performance** (`perf`)
- **Improvements** (`refactor`)

Commits `docs`, `chore`, `test`, `build`, `ci` e `style` continuam contando para decidir se a
próxima versão é patch, mas ficam ocultos do changelog (configurado em
`changelog-sections` no `release-please-config.json`).

## Fluxo passo a passo

1. PRs são mergeados normalmente na `main`, seguindo Conventional Commits.
2. A cada push na `main`, o workflow `.github/workflows/release-please.yml` roda e o bot
   release-please abre (ou atualiza) um Pull Request chamado algo como
   `chore(main): release 0.2.0`, acumulando todos os commits ainda não lançados.
3. Esse PR já vem com o `CHANGELOG.md` e a versão do `package.json` atualizados — é só revisar
   a descrição da release.
4. Ao dar merge nesse PR de release, o release-please:
   - cria a tag Git (ex.: `v0.2.0`);
   - publica a GitHub Release com as notas geradas;
   - some com o PR de release (até o próximo push na `main` gerar um novo).

Nenhuma tag ou release é criada antes desse merge — enquanto o PR de release estiver aberto, dá
pra continuar mergeando outros PRs normalmente que ele vai só acumulando.

## Onde ver

- Releases publicadas: [aba Releases do GitHub](https://github.com/kangeikailabsio/kangeikai/releases)
- Configuração: `release-please-config.json` e `.release-please-manifest.json` (raiz do repo)
- **Nunca editar `CHANGELOG.md` ou o campo `version` manualmente** — o bot é quem gerencia os
  dois; qualquer edição manual é sobrescrita na próxima release.
