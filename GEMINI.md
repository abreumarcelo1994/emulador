# 🎮 Diretrizes de Desenvolvimento e Experiência do Usuário (UX)

## 📌 Regra Fundamental do Repositório: Consulta Obrigatória às 18 Leis de UX
Antes de criar qualquer nova funcionalidade, tela, componente, menu, automação, script ou fluxo neste projeto, você **DEVE consultar e aplicar ativamente as 18 Leis de UX** documentadas em:
- [`.agents/rules/18-ux-laws.md`](file:///C:/Users/Win/Desktop/emulador/.agents/rules/18-ux-laws.md)
- [`UX_LEIS_DESIGN_SYSTEM.md`](file:///C:/Users/Win/Desktop/emulador/UX_LEIS_DESIGN_SYSTEM.md)

### Resumo Rápido das 18 Leis e Aplicação Prática:
1. **Lei de Hick**: Reduzir escolhas, categorizar por console/gênero, destacar favoritos/últimos jogados.
2. **Lei de Fitts**: Botão "JOGAR" gigante e clicável; alvos com hitbox ampla e foco imediato.
3. **Lei de Jakob**: Seguir padrões universais de consoles e TV (RetroPie, Steam Big Picture, Switch).
4. **Lei da Proximidade**: Agrupar capa, título, badges e ações dentro do mesmo card coeso.
5. **Lei de Miller**: Limitar chunks cognitivos a 5-7 itens por grupo; metadados densos em modais.
6. **Limiar de Doherty**: Resposta e feedback visual/sonoro em menos de 400ms (< 100ms ideal).
7. **Efeito Von Restorff**: Botão de play com cor vibrante e contraste neon contra o fundo neutro.
8. **Efeito de Posição Serial**: Itens mais importantes nas pontas das listas (ex: "Todos/Favoritos" e "Ajustes").
9. **Regra do Pico-Fim**: Entrada no jogo empolgante e sem erros; saída com retorno limpo à central.
10. **Efeito Zeigarnik**: "Continuar Jogando", barras de download/extração visíveis e saves recentes.
11. **Lei de Prägnanz**: Geometria limpa, simetria nas capas, cantos suaves, sem poluição visual.
12. **Lei da Semelhança**: Consistência visual absoluta em botões de play, badges e cards em todo o sistema.
13. **Conectividade Uniforme**: Cards em estilo glassmorphism unificando todos os elementos do jogo.
14. **Lei de Tesler**: O sistema absorve toda a complexidade técnica (hardware, shaders, configs, BIOS), nunca o jogador.
15. **Lei de Postel**: Aceitar múltiplos formatos (`.rvz`, `.iso`, `.zip`, `.chd`, etc.), buscas parciais sem acento e múltiplos tipos de controles.
16. **Lei de Parkinson**: 1 clique para jogar; sem telas intermediárias nem confirmações redundantes.
17. **Navalha de Occam**: Preferir sempre a solução mais direta e leve (1 executável nativo Windows em vez de OS secundário/pendrive).
18. **Princípio de Pareto**: Priorizar os 20% vitais (jogar a 60 FPS com 1 clique e controles perfeitos) que geram 80% do valor.
