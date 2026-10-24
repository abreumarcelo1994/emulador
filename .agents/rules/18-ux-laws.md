# 🧠 Memória Permanente & Diretrizes: As 18 Leis de UX no Projeto

Este documento é a regra de ouro do projeto. **Toda e qualquer nova funcionalidade, tela, componente, fluxo, menu ou automação criada neste ecossistema DEVE ser validada e projetada com base nestas 18 leis de UX.**

---

## 1. Lei de Hick (Hick's Law)
> *O tempo necessário para tomar uma decisão aumenta logaritmicamente com o número e a complexidade das escolhas.*
* **Regra no Projeto**:
  - Nunca expor centenas de jogos ou dezenas de botões sem agrupamento e categorização prévia.
  - Oferecer filtros claros e objetivos (por Plataforma / Console, Gênero ou Favoritos).
  - Destaque imediato para "Últimos Jogados" e "Favoritos" na tela inicial (máximo de 4 a 5 opções diretas de decisão rápida).
  - Menus de configuração com revelação progressiva: exibir apenas o essencial e guardar o complexo em "Avançado".

---

## 2. Lei de Fitts (Fitts's Law)
> *O tempo para alcançar um alvo depende da distância até ele e da largura/tamanho da sua área de clique.*
* **Regra no Projeto**:
  - O botão primário de ação (**"JOGAR / INICIAR"**) deve ter o maior tamanho e área clicável/tocável da interface.
  - Em telas de TV/Arcade (10-foot UI), os cartões de jogos e botões de navegação devem ser grandes, com foco visual imediato.
  - Ações críticas de encerramento (ESC / Fechar / Sair) devem ter atalhos universais e posições fáceis de acessar.

---

## 3. Lei de Jakob (Jakob's Law)
> *Os usuários passam a maior parte do tempo em outros produtos e esperam que o seu funcione da mesma forma que os familiares.*
* **Regra no Projeto**:
  - Respeitar os modelos mentais consolidados de consoles e sistemas retrô (RetroPie, Recalbox, Steam Big Picture, Nintendo Switch, Netflix).
  - Teclas universais: `Enter` ou `A` confirma/inicia; `Esc` ou `B` volta/cancela; `F` ou `Alt+Enter` alterna tela cheia.
  - Ícones padronizados: controle para gamepads, engrenagem para configurações, coração/estrela para favoritos, lupa para busca.
  - Capas de jogos exibidas em cartões verticais com aspecto de box art oficial.

---

## 4. Lei da Proximidade (Law of Proximity - Gestalt)
> *Objetos visualmente próximos uns dos outros são percebidos como um grupo coeso e relacionado.*
* **Regra no Projeto**:
  - Agrupar informações do mesmo jogo: Capa, Título, Badge de FPS, Plataforma e Botão de Ação devem estar dentro do mesmo cartão com espaçamento menor do que a distância para o cartão ao lado.
  - Ações de um jogo específico (Jogar, Favoritar, Abrir Pasta) devem estar fixadas dentro do contexto visual daquele jogo.
  - Separar claramente a barra de filtros superiores da grade de conteúdo de jogos.

---

## 5. Lei de Miller (Miller's Law)
> *A capacidade média da memória de trabalho humana é de 7 ± 2 pedaços (chunks) de informação por vez.*
* **Regra no Projeto**:
  - Não apresentar mais de 5 a 7 categorias de consoles na barra primária sem paginação, rolagem lateral ou agrupamento.
  - Formulários de controles e configurações divididos em blocos lógicos de até 5 a 7 itens (ex: "Direcionais", "Botões Principais", "Gatilhos", "Sistema").
  - Mostrar os metadados vitais no card (Título, Console, FPS, Avaliação) e recolher detalhes técnicos longos em modal expansível.

---

## 6. Limiar de Doherty (Doherty Threshold)
> *O engajamento e a produtividade disparam quando a resposta do sistema ocorre em menos de 400 milissegundos (< 400ms).*
* **Regra no Projeto**:
  - Feedback imediato ao clique (< 100ms): som de clique, animação de pulso no card e mensagem "Iniciando emulador...". Jamais deixar a interface muda ou congelada enquanto o processo carrega.
  - Busca instantânea e responsiva em tempo real: filtrar jogos conforme o usuário digita na barra de pesquisa sem recarregar a tela.
  - Transições e animações a 60 FPS sem engasgos de interface.

---

## 7. Efeito Von Restorff (Isolation Effect)
> *Quando múltiplos itens semelhantes estão presentes, aquele que difere visualmente dos demais atrai a atenção e é lembrado.*
* **Regra no Projeto**:
  - O botão primário de ação (**"JOGAR"**) deve ter contraste e cor de destaque imediato (gradiente verde elétrico ou neon) contra o fundo escuro e botões secundários neutros.
  - Jogos otimizados a **60 FPS** ou novidades na biblioteca devem possuir badges com cor contrastante para chamar o olhar de forma elegante.
  - O item focado pelo teclado ou controle deve receber escala aumentada (1.05x) e contorno luminoso perceptível.

---

## 8. Efeito de Posição Serial (Serial Position Effect)
> *Usuários lembram melhor do primeiro (primazia) e do último item (recência) de uma série.*
* **Regra no Projeto**:
  - Em carrosséis e barras horizontais de consoles, posicionar as opções mais importantes nas pontas:
    - Início: "🎮 Todos" ou "⭐ Mais Jogados / Favoritos".
    - Fim: "⚙️ Configurações / Status do Sistema".
  - Na lista de consoles, priorizar as plataformas mais jogadas e nostálgicas no início (ex: GameCube, PS2, SNES, Mega Drive).

---

## 9. Regra do Pico-Fim (Peak-End Rule)
> *As experiências são lembradas pelo seu ponto de maior intensidade (pico emocional) e pelo seu momento de encerramento (fim).*
* **Regra no Projeto**:
  - **Pico**: A entrada no jogo deve ser suave, rápida, cinematográfica e sem mensagens assustadoras de erro.
  - **Fim**: Ao fechar um jogo com `Esc`, retornar diretamente à central de jogos mantendo o foco no título recém-jogado, de forma fluida, sem janelas pretas orfãs ou travamentos.

---

## 10. Efeito Zeigarnik (Zeigarnik Effect)
> *Tarefas incompletas criam tensão cognitiva e são mais lembradas do que tarefas concluídas.*
* **Regra no Projeto**:
  - Destaque para "Continuar Jogando": mostrar o último jogo jogado com o status de save ou último acesso recente.
  - Exibir barra visual de progresso quando um jogo ou emulador estiver sendo baixado ou extraído.
  - Metas e progresso de conquistas/retroachievements exibidos como porcentagem a concluir.

---

## 11. Lei de Prägnanz (Simplicidade e Boa Forma - Gestalt)
> *O cérebro prefere interpretar formas complexas e ambíguas da maneira mais simples, limpa e simétrica possível.*
* **Regra no Projeto**:
  - Geometria limpa e padronizada em toda a interface: capas com proporções uniformes (2:3 ou 3:4), cantos arredondados consistentes (ex: 8px a 12px) e grid simétrico.
  - Eliminar ruído visual: ícones limpos, sem excesso de textos técnicos ou decorações desnecessárias.

---

## 12. Lei da Semelhança (Law of Similarity - Gestalt)
> *Elementos com características visuais semelhantes (cor, tamanho, formato) são percebidos como tendo o mesmo propósito e função.*
* **Regra no Projeto**:
  - Todos os botões de iniciar jogos devem compartilhar a mesma cor, tipografia e comportamento em qualquer parte do sistema.
  - Todos os selos de plataforma (badges) devem ter o mesmo estilo pílula e acabamento visual.
  - Cards de jogos idênticos em estrutura para que o usuário saiba instantaneamente o que fazer ao olhar para qualquer um deles.

---

## 13. Conectividade Uniforme (Law of Uniform Connectedness)
> *Elementos visualmente conectados por caixas, bordas ou cores compartilhadas são percebidos como mais relacionados.*
* **Regra no Projeto**:
  - Uso de cards tipo *glassmorphism* (fundo escuro translúcido com borda suave) conectando internamente a capa, o nome do jogo, os badges de FPS e o botão de play.
  - Painéis de configuração agrupando visualmente seções conectadas (ex: bloco de "Vídeo", bloco de "Áudio", bloco de "Controles").

---

## 14. Lei de Tesler (Conservação da Complexidade)
> *Todo sistema possui uma quantidade fundamental de complexidade que não pode ser eliminada; ela deve ser absorvida pelo sistema ou repassada ao usuário.*
* **Regra no Projeto**:
  - **O sistema DEVE absorver 100% da complexidade técnica de emulação**:
    - O usuário NUNCA deve ser obrigado a configurar manualmente caminhos de BIOS, variáveis de ambiente, plugins gráficos obscuros ou editar arquivos INI.
    - O sistema detecta o hardware do PC (ex: Intel HD 3000), aplica as correções de shaders (`ShaderCompilationMode = 0`, `UsePanicHandlers = False`) e configura os emuladores de forma transparente.
    - O papel do usuário é apenas escolher e jogar.

---

## 15. Lei de Postel (Princípio da Robustez)
> *"Seja conservador no que você envia, mas liberal no que você aceita."*
* **Regra no Projeto**:
  - Aceitar com total tolerância múltiplos formatos de ROMs para o mesmo console (`.rvz`, `.iso`, `.gcm`, `.gcz`, `.zip`, `.7z`, `.chd`, `.bin`, `.cue`, `.sfc`, `.md`).
  - Busca inteligente: ignorar maiúsculas/minúsculas, acentuações e caracteres especiais (buscar por "mario", "double", "kart" ou "dash" localiza *Mario Kart: Double Dash!!* com precisão).
  - Reconhecimento automático e transparente de qualquer controle conectado (Xbox, PlayStation, Switch Pro, USB genérico ou Teclado).

---

## 16. Lei de Parkinson (Parkinson's Law)
> *Qualquer tarefa se expande até preencher todo o tempo disponível para sua conclusão.*
* **Regra no Projeto**:
  - Reduzir ao mínimo absoluto os passos e o tempo entre "abrir o sistema" e "estar dentro da pista de corrida".
  - Execução imediata em 1 clique (Launchers `.bat` instantâneos ou botão único no card).
  - Sem diálogos de confirmação inúteis ("Tem certeza que quer jogar?").
  - O jogador não deve perder tempo esperando telas intermediárias desnecessárias.

---

## 17. Navalha de Occam (Occam's Razor)
> *Entre soluções concorrentes, a mais simples (com o menor número de dependências e hipóteses) deve ser a escolhida.*
* **Regra no Projeto**:
  - Preferir soluções diretas e leves em vez de estruturas monumentais.
  - Não obrigar o usuário a instalar um sistema operacional secundário (como Recalbox em pendrive bootável) se podemos executar emuladores portáteis nativos e uma interface fluida no próprio Windows com 1 duplo clique.
  - Design enxuto: manter o foco no jogo e remover qualquer adorno que não cumpra um papel funcional claro.

---

## 18. Princípio de Pareto (Regra 80/20)
> *80% dos resultados e da satisfação do usuário decorrem de 20% das funcionalidades essenciais.*
* **Regra no Projeto**:
  - 80% do valor real deste ecossistema vem de: **(1) Navegar de forma agradável pelas capas**, **(2) Clicar em 1 botão** e **(3) Jogar a 60 FPS perfeitos com controle configurado**.
  - O foco de engenharia e polimento visual deve ser concentrado nestes 20% fundamentais:
    - Desempenho e compatibilidade impecável dos emuladores;
    - Ausência de travamentos ou avisos na tela;
    - Atalho direto e responsivo.
  - Não sobrecarregar a interface com 80% de recursos marginais que quase ninguém utiliza.
