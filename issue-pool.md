# feat: adicionar sinuca multiplayer com espectadores

Reaproveita a conexão Colyseus e as duas mesas existentes no mapa do escritório. Não depende da #157; as mensagens desta funcionalidade pertencem à sessão da mesa.

### Objetivo

Permitir partidas de bola 8 casual entre duas pessoas dentro do Kangeikai, com espectadores entrando a qualquer momento. Criar uma base de integração reutilizável para outros jogos em `packages/games`.

### Contexto

O mapa `welcome` já possui as mesas `pool` e `pool-2`, dentro da zona de conversa da sala de jogos. A sala `OfficeRoom` mantém avatares e sessões em memória e oferece 15 segundos para reconexão. A sinuca utiliza essa conexão e preserva a conversa atual, sem criar contas, banco de dados ou outra sala de voz.

### Decisões de design (fechadas via planejamento)

- **Proximidade:** até 48 pixels entre os pés do avatar e a borda da mesa. Hover próximo mostra luz amarela suave saindo de trás da silhueta real da mesa, com transição sutil, sem retângulo ou traço de contorno. Clique esquerdo ou `X` abre a mesa. `X` prioriza a mesa próxima sob hover, depois distância e ID. Não exibir dica, prompt ou aviso sobre o atalho: a interação deve ser intuitiva.
- **Janela ampla:** visão superior 2D, arte própria em Phaser. Avatar parado, caminhada automática cancelada e controles do escritório bloqueados; áudio/vídeo e botões de mídia continuam disponíveis.
- **Entrada como espectador:** botão “Jogar” ocupa uma das duas vagas. Ambos precisam confirmar “Pronto”. Espectadores recebem a partida em andamento sem poder alterá-la.
- **Desktop:** mira pelo mouse, barra de força, botão “Tacada”, guia até o primeiro contato e posicionamento da branca nas faltas.
- **30 segundos por jogada:** inclui posicionar a branca e mirar. Movimento das bolas não consome esse prazo. Tempo esgotado é falta e concede branca na mão ao adversário.
- **Saída:** sorteada na primeira partida e alternada nas revanches. Exige uma bola encaçapada ou quatro bolas distintas nas tabelas. Bola 8 na saída é recolocada no ponto inicial, ou no primeiro ponto livre em direção à tabela de fundo, sem encerrar a partida.
- **Grupos:** mesa aberta após a saída. A primeira bola legalmente encaçapada depois dela define lisas/listradas; em caçapas mistas vale a primeira registrada na simulação. Encaçapar bola própria sem falta mantém a vez.
- **Faltas:** contato inicial incorreto, nenhuma bola atingida, branca encaçapada ou ausência de caçapa/tabela após contato. Adversário recebe branca na mão; posicionamento deve respeitar bolas, limites e caçapas.
- **Bola 8:** vitória somente após limpar previamente o grupo e encaçapar a 8 sem falta. Encaçapar prematuramente ou com falta causa derrota. Sem declarar caçapa.
- **Saída da janela:** espectador sai imediatamente. Jogador em partida confirma desistência ao fechar ou pressionar Escape; antes da partida, sair apenas libera a vaga.
- **Reconexão:** uma tacada iniciada termina; a próxima jogada aguarda a reconexão durante a janela existente de 15 segundos. Reconectar restaura vaga, estado e tempo restante. Expiração causa derrota, ou cancelamento quando ambos abandonam.
- **Revanche:** vagas permanecem após o resultado e ambos precisam confirmar prontidão novamente. Saídas liberam vagas; mesa sem participantes é limpa. Estado exclusivamente em memória.

### Abordagem técnica

- **Pacote:** `@kangeikai/game-pool`, em `packages/games/pool`, com módulos `core`, `protocol`, `server` e `client`. Física/regras independentes do navegador; o servidor não importa Phaser.
- **Mapa:** camada de objetos `games`, com geometria e IDs estáveis para as duas mesas e propriedade `gameType: pool`. Cliente e servidor leem a mesma fonte. O glow usa a transparência dos tiles da mesa para gerar um halo difuso, desenhado atrás da camada original; o retângulo de interação não é desenhado.
- **Integração:** ciclo de abertura/fechamento e política de bloqueio de input reutilizáveis no cliente. Cada sessão abre somente uma mesa; enquanto vinculada, o servidor também bloqueia seu movimento.
- **Servidor:** um gerenciador por `OfficeRoom`, partidas isoladas por ID da mesa. Mensagens `poolCommand`/`poolEvent` para entrada, vagas, prontidão, branca, tacada, estado, erros e fechamento.
- **Autoridade:** Valibot valida mensagens; servidor confere sessão, proximidade inicial, vaga, turno, fase, valores finitos e identificadores de partida/turno. Rejeita tacadas duplicadas ou antigas e ações de espectadores.
- **Física básica confiável:** simulação com passo fixo de 1/120 segundo, colisões contínuas, tabelas, seis caçapas, atrito e restituição. Colisões confiáveis, ausência de atravessamento e sincronização correta são requisitos desta versão.
- **Sincronização:** posições a 20 Hz durante movimento, enviadas apenas aos participantes da mesa. Interpolação visual no cliente; estado completo na abertura, reconexão e transições de turno/resultado.

Para cadastrar outra mesa no Tiled, criar um retângulo na camada `games`, dar a ele um nome único e a propriedade string `gameType = pool`. Usar esse mesmo nome no grupo de arte, com a camada de tiles da mesa chamada `table` (`<nome>/table`); o halo extrai a silhueta dessa camada. Ajustar o retângulo ao desenho e cadastrar sua colisão na camada `collisions`, como nas mesas existentes.

### Testes

- **Automatizados pelo agente:** física, regras, validação de comandos, vagas concorrentes, isolamento entre mesas, espectadores durante tacada, prazo, desistência, reconexão, limpeza, proximidade e ciclo de input/subscrições. Vitest para lógica e integração Colyseus para o transporte real.
- **Checks:** lint, testes e verificações TypeScript/Svelte do cliente, servidor e pacote; builds de produção.
- **Manuais/visuais pelo mantenedor:** seguir o roteiro abaixo. O agente não executa nem marca esses testes como concluídos sem retorno do mantenedor. A entrega do código não aguarda essa etapa.

Roteiro manual:

1. Abrir três clientes no escritório, aproximar os avatares das mesas e conferir glow com diferentes níveis de zoom, clique esquerdo, `X` e bloqueio por distância.
2. Abrir a mesa como espectador, ocupar as duas vagas e confirmar que a partida só começa quando ambos estão prontos.
3. Jogar com mira/força variadas; avaliar colisões, caçapas, guia e sensação da física. Conferir indicação de turno, grupos, faltas, branca na mão, prazo e resultado.
4. Entrar com o terceiro cliente enquanto as bolas se movem; confirmar a mesma partida e impossibilidade de jogar como espectador. Testar também partidas simultâneas nas duas mesas.
5. Redimensionar a janela e verificar legibilidade, controles, ausência de movimento do avatar, convivência com overlays, conversa e botões de mídia.
6. Sair como espectador; cancelar/confirmar desistência como jogador; testar revanche e substituição de jogador após resultado.
7. Interromper a conexão de um jogador e restaurá-la antes de 15 segundos; repetir deixando expirar. Conferir suspensão do próximo turno, recuperação do estado e resultado por abandono.

### Fora de escopo

- **Física avançada:** rotação angular, transição entre deslizamento e rolamento, atrito dependente do contato, resposta mais realista das tabelas e bocas das caçapas. A calibração básica e a correção das colisões atuais continuam sendo obrigatórias.
- **Efeitos no taco/branca:** retrocesso, avanço, efeito lateral, elevação, saltos e massé.
- Guias avançadas com previsão de múltiplas colisões e trajetórias com efeitos.
- Regras competitivas completas, declaração de caçapa, outros modos e regulamentos configuráveis.
- Controles por toque e adaptação específica para celular/tablet.
- Ranking, histórico persistente, replay, torneios, matchmaking e fila de espera.
- Cosméticos, progressão, personalização de tacos/mesas e conversa exclusiva por mesa.

### Riscos

- Física básica, força e mira precisam da calibração visual do mantenedor para atingir a sensação desejada.
- Latência pode tornar a confirmação das ações perceptível; o cliente interpola posições, mas não decide resultados.
- Muitas mesas ativas aumentam o custo da simulação no mesmo processo do escritório.
- Overlay e foco precisam conviver com compartilhamento de tela, presença busy, perfil e controles de mídia.
- A proximidade inicial usa a posição do avatar informada pelo cliente, conforme o modelo atual do escritório; não constitui validação autoritativa de todo o movimento pelo mapa.

### Definition of Done

- [ ] Duas mesas independentes cadastradas no mapa, com halo amarelo sutil atrás da silhueta, clique esquerdo e `X`, sem dica visível de atalho.
- [ ] Pacote de sinuca separado em `packages/games/pool` e integração reutilizável para futuros jogos.
- [ ] Entrada como espectador, duas vagas atômicas e início somente com ambos prontos.
- [ ] Mira, força, tacada, guia e posicionamento válido da branca funcionando.
- [ ] Física básica confiável, regras casuais, grupos, faltas e vitória/derrota pela bola 8 implementados.
- [ ] Prazo de 30 segundos e transições de turno controlados pelo servidor.
- [ ] Espectadores recebem o estado atual e não podem alterar a partida.
- [ ] Desistência, revanche, reconexão e limpeza de mesas implementadas.
- [ ] Avatar permanece parado sem interromper a sessão e a conversa do escritório.
- [ ] Testes automatizados, lint, checks e builds passando.
- [ ] **Mantenedor:** validar glow, layout, mira, sensação da física e redimensionamento.
- [ ] **Mantenedor:** validar multiplayer com três clientes, duas mesas, reconexão e continuidade de mídia.

Os itens ficam inicialmente desmarcados para acompanhamento; os resultados automatizados serão informados na entrega.
