# 🎮 PS2 Console Station — Estação de Jogos PlayStation 2 (Estilo RetroPie / Recalbox)

Sistema completo de emulação e biblioteca de jogos para PlayStation 2 que roda direto no navegador com WebAssembly e WebGL 2, sem necessidade de placas de vídeo potentes, inspirado no **RetroPie**, **Recalbox** e na experiência leve do **dragonballbt3.online**.

---

## ⚡ Principais Recursos do Sistema

### 1. 🥔 Otimização Automática para Computadores Fracos (Low-End Hardware)
- **Detecção de Hardware em Tempo Real**: Analisa automaticamente os núcleos da CPU, memória RAM e placa de vídeo (Intel HD Graphics vs GPU dedicada).
- **Modo Batata / Eco Automático**: Para computadores modestos ou notebooks antigos, aplica automaticamente:
  - Escala de resolução interna adaptativa (0.75x ou 0.65x).
  - *Frame Skipping* inteligente (pula a renderização de quadros pesados para a GPU mantendo o áudio e a lógica do jogo a 60 FPS cravados).
  - Renderização pixelada nítida (*crisp-edges*) eliminando filtros pesados de pós-processamento.
- **Perfis Pré-configurados**:
  - 🟢 **Modo Batata (Eco / Ultra Leve)**: Para Dual-Core e Intel HD Graphics.
  - 🔵 **Modo Equilibrado (1x Nativo)**: 640×448 original a 60 FPS suaves.
  - 🟣 **Modo Alta Definição (HD 1.5x - 2x)**: Para PCs mais fortes.
- **HUD ao Vivo no Player**: Mostra FPS em tempo real, latência em milissegundos e botão de 1 clique para ativar/desativar o Modo PC Fraco durante a partida.

---

### 2. 💿 Leitor de CD/DVD Físico e Imagens Virtuais
- **Detecção Direta do Windows**: Identifica unidades óticas físicas (como a unidade `E:\ TSSTcorp CDDVDW`) e drives virtuais montados.
- **Leitura do Disco Original**: Lê o arquivo `SYSTEM.CNF` na raiz do disco, identifica o serial do jogo (ex: `SLUS-21678`) e carrega o título automaticamente.
- **Execução Direta**: Botão **"Executar Direto do CD/DVD"** sem necessidade de converter para ISO previamente.

---

### 3. 📂 Execução de Cópias .ISO, .CSO, .CHD e .BIN
- **Streaming de Blocos (Range Requests)**: Não carrega o arquivo de 4 GB todo na memória RAM. O emulador solicita apenas os blocos de disco necessários sob demanda, iniciando em menos de 1 segundo!
- **Varredura Automática de Pastas**: Monitora a pasta `library/`, Área de Trabalho, Downloads e Documentos.
- **Arraste e Solte (Drag & Drop)**: Arraste qualquer arquivo `.iso` para dentro da janela do navegador para iniciar imediatamente.

---

### 4. 🌐 Metadados e Requisitos Gerais Automáticos
- Reconhece o serial oficial do jogo (`SLUS-21678`, `SLUS-20946`, `SCUS-97399`, etc.).
- Busca capas oficiais em alta definição via repositório global do *xlenore/ps2-covers* e *libretro-thumbnails*.
- Classifica cada jogo por **Nível de Exigência**:
  - 🟢 **Leve**: Roda com 100% de velocidade em qualquer PC fraco ou dual-core (ex: *Crash Twinsanity*, *Tekken Tag*, *Final Fantasy X*, *Def Jam*).
  - 🟡 **Médio**: Roda perfeitamente com perfil Equilibrado (ex: *Dragon Ball Z Budokai Tenkaichi 3*, *Resident Evil 4*, *GTA San Andreas*).
  - 🔴 **Pesado**: Exige ativar o **Modo PC Fraco** para garantir 60 FPS em computadores sem placa de vídeo (ex: *God of War II*, *Shadow of the Colossus*, *Black*).

---

### 5. 🎯 Cheats & Patches Widescreen 16:9
- **Patches Widescreen 16:9**: Remove as tarjas pretas laterais e adapta o jogo para monitores modernos.
- **Patches de 60 FPS**: Desbloqueia a taxa máxima de quadros.
- **Códigos de Trapaça**: Vida infinita, Ki/energia infinita, todos os personagens destravados e dinheiro máximo.
- **Exportador .pnach**: 1-clique para copiar códigos ou baixar o arquivo `.pnach` compatível com PCSX2 e Play!.

---

### 6. 📥 Central de ROMs & Downloader Integrado
- **Repositórios Limpos e Confiáveis**:
  - **Myrient (Redump Sony PlayStation 2)**: Downloads diretos ultrarrápidos, sem anúncios e sem limites.
  - **Internet Archive (Coleção Redump PS2)**: Acervo público de preservação.
  - **CDRomance**: Jogos com dublagem e legendas em Português (PT-BR).
  - **Vimm's Lair**: O acervo clássico de emulação.
- **Downloader Integrado**: Cole qualquer link direto de download de uma ISO e o servidor baixa diretamente para a sua pasta `library/` com barra de progresso em tempo real, velocidade (MB/s) e auto-inclusão na biblioteca!

---

### 7. 🕹 Controles e Mapeamento
- Suporte a Controles USB e Bluetooth (DualShock 4, DualSense, Xbox 360/One, controles genéricos).
- Painel de teste interativo com iluminação dos botões em tempo real.
- Suporte a teclado completo e atalhos de tela cheia (F11), pausa e captura de tela.

---

## 🚀 Como Iniciar o Sistema

### Método 1: Dois cliques (Mais Fácil)
Dê dois cliques no arquivo:
```
iniciar.bat
```
ou
```
start.bat
```
O servidor será iniciado e seu navegador padrão abrirá automaticamente em `http://127.0.0.1:8620`.

### Método 2: Via Terminal / PowerShell
```bash
cd c:\Users\Win\Desktop\emulador
node server.mjs
```
Em seguida, acesse no Chrome ou Edge:
`http://127.0.0.1:8620`

---

## 📁 Onde Colocar os Jogos (.ISO)
Basta colocar suas cópias de jogos dentro da pasta:
```
c:\Users\Win\Desktop\emulador\library\
```
Ou na sua Área de Trabalho, Downloads ou Documentos.
Na interface do emulador, clique em **"Atualizar Pastas"** para que eles apareçam imediatamente com suas respectivas capas e requisitos!
