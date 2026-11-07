<!-- (c) 2026 William Li -->

<!-- pt-PT translation of MANUAL.md. Translate the text; keep every {#anchor src=…} exactly as it is. -->

# ICC Profile Tool — Manual do utilizador {#icc-profile-tool-user-manual src=38bba1de}

O **ICC Profile Tool** (profiletool; na interface em português, **Ferramenta de perfis ICC**) é uma ferramenta que funciona no navegador para inspecionar, validar e editar em ida e volta perfis de cor **ICC.1** e **ICC.2 (iccMAX)**. Funciona inteiramente no seu navegador — sem envio de ficheiros, sem instalação — através de uma compilação WebAssembly do [iccDEV](https://github.com/InternationalColorConsortium/iccDEV), a implementação de demonstração oficial do IccProfLib mantida pelo ICC.

**O que pode fazer:**

- **Explorar o cabeçalho** — todos os campos do cabeçalho de 128 bytes do perfil, descodificados em texto legível.
- **Explorar o diretório de etiquetas** — cada etiqueta com a respetiva assinatura, tipo, deslocamento em bytes, tamanho e bytes de preenchimento. Clique em qualquer etiqueta para expandir uma descrição completa específica do tipo (a mesma saída da vista "Describe" do `wxProfileDump` do iccDEV) e — nas etiquetas que a suportam — uma **visualização** incorporada: curvas de resposta tonal, diagramas de cromaticidade, imagens de CLUT e de gamut, gráficos de dispersão de cores nomeadas, e ainda um **avaliador de transformações** para um único ponto.
- **Validar** — executar a lista de verificação do ICC Profile Assessment Working Group (Segurança / Conformidade / Qualidade), em que cada verificação tem um veredicto e pode ser filtrada por categoria.
- **Editar em ida e volta** — converter o perfil para XML ou JSON, editá-lo no editor de código integrado, convertê-lo de novo para ICC e revalidá-lo. O botão de guardar transfere o binário editado.
- **Encadear perfis** — no separador **Ligar**, arraste perfis do conjunto para uma cadeia ordenada e depois converta-a num **DeviceLink**, **transforme uma imagem** através dela (com controlo total sobre a codificação de saída, a compressão, a disposição planar e a incorporação do perfil ICC) ou **transforme um conjunto de dados de cor**.
- **Trabalhar com HDR** — verificar um perfil face às regras do ICC.1 para perfis HDR ColorSpace (cláusula 8.7.1), ler os respetivos pontos de código cICP e traçar a curva de ganho adaptativa para qualquer margem do ecrã. O separador **HDR** mostra uma imagem HDR no seu ecrã, e **Definições → Ambiente** indica o que este navegador e este ecrã conseguem fazer.
- **Abrir a partir do chardata** — abrir aqui diretamente um perfil carregado no [chardata](https://chardata.colourbill.com/), com os bytes transmitidos dentro do navegador através de `postMessage`.
- **Abrir com um URL** — abrir uma ligação que indica à ferramenta um perfil alojado na Web e, opcionalmente, o separador a apresentar (p. ex. `…/profiletool#url=…&tab=VAL`).

Tudo é executado do lado do cliente. Os bytes do perfil nunca saem do separador do navegador.

<div class="note">
<strong>O suporte de ICC.2 (iccMAX) é parcial.</strong> Os perfis ICC.2 carregam-se, inspecionam-se, validam-se e editam-se em ida e volta tal como os ICC.1 — a lista de verificação inclui verificações específicas do iccMAX, as etiquetas de PCS espectral e de elementos de processamento múltiplo são descodificadas, e os motores de transformação são compilados sobre a pilha iccMAX completa. Ainda não abrangidos: fluxos de trabalho <strong>ICS</strong> (Interchange Color Space) com várias partes, a seleção de um <em>subperfil</em> V5 ao aplicar uma transformação e a procura inversa em alguns perfis ICC.2. Conte com lacunas nas funcionalidades ICC.2 mais exóticas; estão a ser preenchidas versão a versão.
</div>

<div class="note">
<strong>O suporte de perfis HDR ColorSpace segue um rascunho.</strong> As verificações HDR, as vistas da <code>headroomAdaptiveGainCurveTag</code> e o separador HDR implementam a emenda HDR do ICC.1 tal como se encontra atualmente. A emenda ainda não foi publicada, pelo que alguns pormenores podem mudar até lá.
</div>

---

## Índice {#contents src=54605fa3}

1. [A área de trabalho](#1-the-workspace)
2. [Painel de definições](#2-settings-panel)
3. [Vistas do perfil](#3-profile-views)
   - [Cabeçalho](#3-1-header)
   - [Etiquetas](#3-2-tags)
   - [Validação](#3-3-validation)
   - [Análise](#3-4-analysis)
   - [XML](#3-5-xml)
   - [JSON](#3-6-json)
4. [Separador Ligar](#4-combine-tab)
   - [Construir uma cadeia](#4-1-building-a-chain)
   - [Criar DeviceLink](#4-2-make-devicelink)
   - [Transformar imagem](#4-3-transform-image)
   - [Transformar dados](#4-4-transform-data)
   - [Mudança de observador](#4-5-observer-change)
   - [Separadores Comparar e Espectral](#4-6-compare-and-spectral-tabs)
   - [Separador HDR](#4-7-hdr-tab)
5. [Edição de ida e volta](#5-round-trip-editing)
6. [Abrir a partir do chardata](#6-launching-from-chardata)
7. [Abrir com um URL](#7-launching-with-a-url)
8. [Dispositivos móveis](#8-mobile)
9. [Limites e segurança](#9-limits-and-security)

---

## 1. A área de trabalho {#1-the-workspace src=4bc9350f}

O profiletool é uma **bancada de trabalho para vários perfis**. A janela tem três partes:

- o painel **Perfis** à esquerda — o *conjunto* de tudo o que carregou;
- a **área principal** à direita, com cinco separadores no topo — **Perfil**, **Comparar**, **Ligar**, **Espectral**, **HDR**;
- o painel **Definições** no limite direito (consulte [Painel de definições](#2-settings-panel)).

### Carregar perfis {#loading-profiles src=2cd0f653}

Pode carregar ficheiros de duas formas:

- Clique em **Carregar perfis** no topo do painel Perfis e escolha um ou mais ficheiros, ou
- **Arraste e largue** ficheiros no painel Perfis.

Pode carregar perfis `.icc` / `.icm` *e* imagens. Largue um ficheiro **TIFF, PNG, JPEG, HEIC ou AVIF** e a ferramenta extrai o respetivo **perfil ICC incorporado** e acrescenta-o ao conjunto. Lê apenas os metadados do ficheiro, nunca os píxeis. No caso de HEIC e AVIF, percorre as caixas do ficheiro, pelo que funciona em qualquer navegador, incluindo os que não conseguem mostrar esses formatos. Um ficheiro **JPEG XL** também é recusado: o perfil está comprimido dentro do codestream, que o profiletool ainda não descomprime. Os vídeos e os ficheiros raw de câmara que partilham o contentor do HEIC (MP4, QuickTime, Canon CR3) não são tratados como imagens. Um ficheiro **OpenEXR** ou **Radiance HDR** (`.hdr`) é recusado com a indicação do motivo: nenhum dos formatos tem lugar para um perfil ICC. O OpenEXR indica a cor através de cromaticidades e o Radiance HDR através de uma linha de cabeçalho `PRIMARIES` opcional. Para *ver* uma imagem, use o [separador HDR](#4-7-hdr-tab). O botão **＋ Novo a partir de .cube** cria um DeviceLink a partir de uma LUT `.cube`. O resultado é acrescentado ao conjunto e aberto no separador **Perfil**; nada é transferido até clicar em **Guardar perfil ICC**.

Um perfil é aceite se os seus primeiros 36 bytes contiverem a assinatura `acsp` e se for analisado com êxito pelo `ValidateIccProfile` do IccProfLib. Os ficheiros que falham são apresentados num resumo de rejeições com o motivo concreto; os respetivos bytes não são conservados.

### O painel Perfis {#the-profiles-pane src=04750126}

Os perfis carregados são agrupados em secções recolhíveis por **classe de perfil** (Input, Display, Output, DeviceLink, ColorSpace, Abstract, Named Color, …). Os **Perfis HDR ColorSpace** da cláusula 8.7.1 do ICC.1 têm a sua própria secção no topo (são perfis da classe ColorSpace, pelo que são retirados da secção ColorSpace), divididos por transferência em **Transferência linear** e **Transferência não linear (PQ, HLG)**, com a transferência indicada num distintivo em cada linha. Esta divisão é importante no [separador HDR](#4-7-hdr-tab), onde só um perfil com transferência linear pode ser atribuído a uma imagem OpenEXR ou Radiance HDR. Cada linha mostra o nome do ficheiro e distintivos com a classe, o espaço de cor, a versão e o tamanho; um perfil que só pôde ser analisado parcialmente é assinalado. Use o botão **A–Z** para alternar a ordenação (ordem de carregamento → ascendente → descendente), o **×** de uma linha para a remover e a pega no limite direito do painel para o redimensionar — ou para recolher o painel por completo.

Clique para selecionar uma linha; Ctrl/Cmd-clique para alternar a seleção e Shift-clique para selecionar um intervalo. **Arraste linhas do conjunto para um separador** para as pôr a trabalhar.

<div class="note">
<strong>O conjunto existe apenas durante a sessão.</strong> Nada é enviado e nada é guardado — o seu sistema de ficheiros continua a ser o armazenamento permanente. Recarregar a página esvazia o conjunto.
</div>

### Os separadores {#the-tabs src=034c9677}

| Separador | O que faz |
|---|---|
| **Perfil** | Inspeciona **um** perfil — cabeçalho, etiquetas, validação, análise, XML, JSON. Largar aqui um novo perfil substitui o atual. |
| **Comparar** | Sobrepõe os gamuts de **dois ou mais** perfis. |
| **Ligar** | Encadeia perfis num DeviceLink ou transforma uma imagem / um conjunto de dados através deles. |
| **Espectral** | Junta imagens espectrais de canal único num único TIFF multicanal. |
| **HDR** | Mostra **uma** imagem HDR no seu ecrã, com um controlo SDR ↔ HDR. Consulte [Separador HDR](#4-7-hdr-tab). |

Os separadores Espectral e HDR recebem diretamente ficheiros de imagem em vez de perfis do conjunto. Cada um dos restantes separadores mantém o seu próprio grupo de perfis, apresentados como fichas removíveis por baixo da barra de separadores, com um contador no próprio separador. O primeiro perfil que carregar abre automaticamente no separador **Perfil**; a partir daí, arraste do conjunto para o separador que pretender. Largar ficheiros diretamente num separador carrega-os no conjunto *e* coloca-os nesse separador numa só ação.

<div class="note">
<strong>Limite de tamanho:</strong> o carregador rejeita tudo o que tenha mais de 256 MB. Os perfis reais têm normalmente bem menos de 10 MB; o limite existe apenas para impedir que um ficheiro largado ou um postMessage hostil esgote a memória WASM do separador.
</div>

---

## 2. Painel de definições {#2-settings-panel src=3bf599d9}

Abra as Definições clicando no botão **⚙** no limite direito do ecrã (ou no ícone de roda dentada no canto superior direito, em dispositivos móveis). O painel desliza sobre o conteúdo sem o redimensionar.

Por baixo do ⚙ há mais dois botões:

- **?** abre este guia **dentro da aplicação**, num painel que desliza sobre a janela. Tem uma caixa de pesquisa no cabeçalho — escreva para realçar as correspondências e use `Enter` / `Shift+Enter` (ou os botões `˄` `˅`) para as percorrer; `Escape` limpa a pesquisa e um segundo `Escape` fecha o painel.
- **✉** abre o formulário de contacto em colourbill.com num novo separador do navegador.

O painel tem dois grupos, **Visualização** e **Ambiente**. Para alargar ou estreitar o painel, arraste o seu limite esquerdo (220–560 px); a largura fica memorizada.

### Fundo {#background src=1450fe76}

Alterna a aplicação entre os temas **Claro**, **Escuro** e **Sistema** (segue a preferência do sistema operativo). A escolha mantém-se entre sessões. No modo **Sistema**, a aplicação subscreve `prefers-color-scheme` e muda automaticamente quando o tema do sistema operativo muda; escolher Claro ou Escuro explicitamente desliga esse ouvinte.

### Formato numérico {#number-format src=af65622c}

Escolhe como os valores numéricos são apresentados em todas as vistas do perfil — **Hexadecimal** ou **Decimal**.

### Idioma {#language src=38c60535}

Substitui o idioma da interface. **Predefinição do sistema (…)** deteta a configuração regional do navegador e usa o idioma suportado mais próximo, com o nome nativo entre parênteses para que veja qual foi escolhido. A tradução abrange a estrutura da aplicação: o painel Perfis, os nomes dos separadores, as ferramentas Ligar, Espectral e HDR, as vistas da curva de ganho HDR em Etiquetas, o painel de definições, incluindo Ambiente e as respetivas explicações, e a estrutura deste guia. Algum texto não é traduzido:
- O texto produzido pelo IccProfLib — descrições de etiquetas, mensagens de validação, nomes dos campos do cabeçalho — vem da biblioteca C++ em inglês.
- O nome da flag do navegador fica em inglês, para coincidir com a própria página de flags do navegador.
- O registo **Eventos de ecrã** do painel Ambiente fica em inglês, para poder ser colado tal como está num relatório de erro.
- Este guia segue a mesma definição, exceto as secções sobre HDR, que ficam em inglês enquanto o suporte HDR estiver em beta e o texto continuar a mudar. Uma secção revista em inglês desde a última atualização da tradução também é apresentada em inglês, com uma nota, até a tradução ser atualizada.

Idiomas suportados: English, Français, Deutsch, Italiano, Español, Português (PT), Português (BR), Svenska, 中文（简体）, 中文（繁體）, 日本語, 한국어. O painel de definições do chardata oferece o mesmo conjunto, pelo que alterar o idioma numa aplicação proporciona uma leitura coerente na outra.

### Ambiente {#environment src=2eb1ea2c}

Mostra o que **este** navegador, esta plataforma e este ecrã conseguem fazer, para que, quando um formato ou uma funcionalidade HDR não estiver disponível, possa perceber porquê. De cima para baixo:

- **Resumo** — o navegador e o sistema operativo, e se o ecrã indica suporte HDR.
- **Flags do navegador** (Chrome, Edge, Opera, Brave) — se *Experimental Web Platform features* está ativa. Essa flag ativa o canvas HDR e permite à página ler a margem HDR de um ecrã.
  - Quando se sabe que a flag está desativada, a caixa fica realçada. É marcada como **obrigatória** se este navegador não tiver WebGPU utilizável, uma vez que o canvas HDR passa então a ser a única forma de apresentar HDR. Caso contrário, é **opcional**.
  - A inspeção de perfis nunca precisa dela.
  - Uma página web não consegue abrir nem alterar flags do navegador. Clique em **Copiar**, cole o endereço na barra de endereço, defina a flag como *Enabled* e reinicie o navegador.
- **Características do ecrã** — **Ecrã HDR**, **Gamut alargado** (sRGB, Display P3 ou Rec. 2020), **Relação de píxeis** e o **Caminho de canvas HDR** em uso (`float16-canvas`, `webgpu` ou nenhum). Estes valores atualizam-se sozinhos quando arrasta a janela para um ecrã onde são diferentes. A mudança acontece quando a maior parte da janela já está no novo ecrã.
- **Identificar ecrãs** (navegadores Chromium) — pede permissão para saber em que monitor está a janela. Depois de autorizado, o painel atualiza-se mesmo entre monitores semelhantes, indica o **Monitor atual** e mostra a **Margem HDR** quando o navegador a disponibiliza (Chrome com a flag acima), por exemplo *1,35 stops (≈2,55× o branco SDR)*. Se recusar a permissão, altere-a nas definições do site.
  - A margem é o espaço acima do branco SDR, pelo que, num painel HDR integrado de um portátil, **diminui quando aumenta o brilho** (o branco SDR fica mais claro enquanto o pico do painel se mantém) e aumenta quando o reduz. Para ver conteúdo HDR, reduza o brilho.
  - No Windows, um novo valor chega alguns segundos depois de uma alteração de brilho, quando o controlador do ecrã o comunica. Também se atualiza quando a janela passa para outro ecrã ou quando o Chrome volta a ser a aplicação ativa.
- **Eventos de ecrã** — um registo recolhível das últimas 20 atualizações e do que desencadeou cada uma. É útil para comunicar um problema de visualização.
- **Tabela de formatos** — uma linha por formato (perfil ICC, TIFF, PNG, JPEG, OpenEXR, Radiance HDR, AVIF, HEIC/HEIF, JPEG XL), com três perguntas:
  - **Inspecionar**: é possível ler o perfil incorporado?
  - **Mostrar**: é possível mostrar os píxeis?
  - **HDR**: é possível apresentar algo mais claro do que o branco?

  Passe o cursor sobre uma linha para ver o motivo de um ✕; os formatos que não podem ser mostrados são listados, com os respetivos motivos, por baixo da tabela. Um ponto assinala os formatos que o próprio profiletool descodifica, e que funcionam da mesma forma em qualquer navegador. **Inspecionar** tem ✓ em todos os formatos exceto JPEG XL, cujo perfil está comprimido dentro do codestream.

---

## 3. Vistas do perfil {#3-profile-views src=ccf59d34}

Arraste um perfil do conjunto para o separador **Perfil** para o inspecionar. O separador mostra uma barra com o nome do ficheiro e um botão **Guardar perfil ICC** (e ainda uma etiqueta *● Modificado — não guardado* depois de o editar) e, por baixo, o visualizador: uma barra de título (nome do ficheiro · tamanho em bytes · versão do IccProfLib · distintivo de validade) e a sua própria barra de separadores.

O distintivo resume o relatório de **Validação**: **Aprovado** a verde quando nenhuma verificação falha nem gera aviso, **Aviso** a âmbar quando pelo menos uma verificação gera aviso, **Reprovado** a vermelho quando alguma verificação falha.

<div class="note">
<strong>Perfis analisados parcialmente:</strong> se um perfil estiver tão danificado que o validador só o consegue ler estruturalmente, surge uma faixa de aviso e só ficam disponíveis os separadores <strong>Cabeçalho</strong> e <strong>Etiquetas</strong> — Validação, Análise, XML e JSON ficam ocultos, porque o perfil não deve ser aplicado.
</div>

### 3.1 Cabeçalho {#3-1-header src=45c71bd0}

Uma tabela de duas colunas com todos os campos do cabeçalho binário de 128 bytes do perfil ICC. Os valores são descodificados em texto legível (assinaturas expandidas, datas formatadas, valores de vírgula fixa convertidos) através do `CIccInfo` do IccProfLib. O **ID do perfil** (o hash MD5 do cabeçalho) aparece numa faixa realçada no topo.

### 3.2 Etiquetas {#3-2-tags src=90f22730}

Uma grelha de seis colunas com todas as etiquetas do diretório de etiquetas do perfil:

| Coluna | Significado |
|---|---|
| `#` | Posição no diretório (a contar de 1) |
| `Name` | Nome longo legível (p. ex. `profileDescriptionTag`) |
| `ID` | Assinatura de 4 caracteres (p. ex. `desc`) |
| `Offset` | Deslocamento em bytes desde o início do ficheiro |
| `Size` | Tamanho em bytes dos dados da etiqueta |
| `Pad` | Bytes de preenchimento entre esta etiqueta e a seguinte |

A assinatura do **tipo** da etiqueta (p. ex. `descType`, `mft2`, `mAB`) aparece, juntamente com o deslocamento e o tamanho, no topo da etiqueta expandida.

As etiquetas estão ordenadas por deslocamento. A coluna **Preenchimento** tem um código de cores — `Pad < 0` (etiquetas sobrepostas, não conforme) aparece a vermelho; `Pad > 3` (preenchimento acima do previsto na especificação) aparece a âmbar.

**Clique em qualquer linha** para a expandir no local (em acordeão — uma etiqueta aberta de cada vez). O detalhe expandido termina sempre com a descrição completa específica do tipo — equivalente a executar `CIccTag::Describe(verbosity = 100)` do IccProfLib. Nas etiquetas que contêm CLUTs ou curvas grandes (p. ex. `A2B0`, `B2A0`), isto inclui todas as células da grelha ou pontos da curva.

Acima dessa descrição, as etiquetas com dados visualizáveis mostram uma ou mais **visualizações incorporadas**, cada uma numa secção recolhível:

| Tipo de etiqueta | Visualizações |
|---|---|
| Curvas tonais (`rTRC`/`gTRC`/`bTRC`/`kTRC`) | A curva de resposta tonal traçada contra a linha identidade; a tabela da curva fica recolhida por baixo. |
| Colorantes RGB (`rXYZ`/`gXYZ`/`bXYZ`) e ponto branco (`wtpt`) | Um diagrama de cromaticidade CIE 1931 com o primário em causa (ou o ponto branco) realçado; os dados do colorante/ponto branco aparecem por baixo. |
| Transformações LUT (`A2B0–3`, `B2A0–3`, `gamt`, `pre0–2`) | Curvas tonais do lado da entrada e do lado da saída (sobrepostas, com cor por colorante e uma legenda para mostrar/ocultar traços); a grelha da CLUT como imagem; a **imagem de gamut** (para a `gamutTag` do perfil, com código de cores — neutro = dentro do gamut, vermelho = fora do gamut); o **avaliador** (ver abaixo); e a tabela de dados em bruto, recolhida. |
| Tabelas de cores nomeadas / colorantes (`ncl2`/`nmcl`/`clrt`/`clot`) | Um gráfico de dispersão das cores nos diagramas CIELAB a\*b\* (e CIE xy); as tabelas ficam recolhidas por baixo. |
| Pontos de código independentes da codificação (`cicp`) | **Pontos de código**: primárias de cor, características de transferência, coeficientes de matriz e o sinalizador de gama completa, cada um com o nome definido pela UIT-T H.273. Os valores que a H.273 não atribui são assinalados, tal como os bytes reservados diferentes de zero. |
| Curva de ganho adaptativa (`headroomAdaptiveGainCurveTag`) | **Ganho para uma margem do ecrã**, e ainda **Curva de ganho** quando a etiqueta guarda imagens alternativas. Consulte *HDR gain curves (HAGC)* mais abaixo (secção em inglês). |

<div class="note">
<strong>Os dados malformados nunca são ocultados.</strong> Se uma curva ou outro elemento visualizável falhar a validação do IccProfLib — por exemplo, uma curva tonal com um gama degenerado de 0 — a secção apresenta mesmo assim o que consegue e mostra um aviso ⚠ com o motivo exato indicado pela biblioteca, em vez de omitir o gráfico sem aviso.
</div>

#### O avaliador de transformações {#the-transform-evaluator src=c70f94b4}

Nas transformações LUT (etiquetas `A2B*` / `B2A*` / de pré-visualização), a secção **Avaliar** aplica a transformação dessa etiqueta específica a uma única cor que indicar, usando diretamente o IccProfLib — sem motor de cor externo. A direção decorre da etiqueta (`A2B*` converte dispositivo → PCS; `B2A*` converte PCS → dispositivo) e a intenção de renderização está implícita na etiqueta (`…0` perceptual, `…1` colorimétrica relativa, `…2` saturação).

- Introduza a entrada como valores de **vírgula flutuante** (canais do dispositivo, ou PCS em unidades Lab/XYZ legíveis) ou, quando a etiqueta tem uma CLUT, pelo índice de **ponto da grelha** (a posição de um nó na grelha).
- A saída é apresentada em **ambas** as formas: a codificação interna normalizada 0–1 e as unidades legíveis (Lab/XYZ para um resultado PCS).

A etiqueta de gamut (`gamt`) não tem avaliador — é um mapa de um canal dentro/fora do gamut e não uma transformação invertível; em vez disso, é mostrada a respetiva imagem de gamut.

### 3.3 Validação {#3-3-validation src=b72d6c69}

Executa a lista de verificação do **ICC Profile Assessment Working Group** sobre o perfil carregado e apresenta-a como relatório. As verificações vêm da ferramenta `iccPawgReport` do iccDEV, compilada num módulo WebAssembly separado que só é obtido quando abre este separador pela primeira vez. (O mesmo relatório determina o distintivo de validade na barra de título e pode ser aberto a partir de um URL com `VAL` ou com o código antigo `PAWG`.)

Cada verificação está agrupada em **Segurança**, **Conformidade** ou **Qualidade** e tem um único veredicto. Os perfis com conteúdo HDR têm um quarto grupo, **HDR**. A primeira verificação deste grupo indica se o perfil é um **Perfil HDR ColorSpace** conforme do ICC.1 (cláusula 8.7.1), e as restantes verificam os metadados HDR de que essa cláusula depende:

| Veredicto | Significado |
|---|---|
| **Aprovado** | A verificação teve êxito |
| **Warn** | Um problema não fatal que convém rever |
| **Reprovado** | O perfil não cumpre a verificação |
| **Gap** | Não foi possível avaliar a verificação por completo (p. ex. ainda não implementada) |
| **N/A** | A verificação não se aplica a este perfil |
| **Not Run** | A verificação foi ignorada |

A linha de resumo no topo contabiliza cada veredicto numa pastilha colorida. **Clique numa pastilha para filtrar** o relatório abaixo — um halo azul assinala as categorias atualmente apresentadas, e as pastilhas sem itens ficam inativas. Por exemplo, desative **Aprovado** e **N/A** para se concentrar apenas nos avisos e nas reprovações.

### 3.4 Análise {#3-4-analysis src=9478bc94}

Análises de qualidade de todo o perfil, derivadas das transformações de cor do perfil — calculadas por um módulo WebAssembly dedicado (o motor de visualização do iccDEV), obtido apenas quando abre este separador pela primeira vez, e representadas com o estilo da própria aplicação.

Cada análise é uma secção recolhível e **todas começam fechadas**. É intencional: cada secção implica uma passagem completa de transformação sobre o perfil, pelo que abrir uma é uma escolha explícita sua, em vez de seis análises dispararem no momento em que muda de separador. Os resultados ficam em cache, pelo que reabrir uma secção é instantâneo. Uma secção que não se aplica ao perfil carregado mostra, em vez disso, uma breve nota *não aplicável* (por exemplo, um perfil de ecrã matriz/TRC não tem CLUTs dispositivo↔PCS para analisar).

#### Estatísticas do perfil {#profile-statistics src=f2d4f2db}

Métricas de todo o perfil para **uma** intenção de renderização selecionada, controladas por duas listas e uma caixa de verificação:

- **Intenção de renderização** — Perceptual / Colorimétrico relativo / Saturação / Colorimétrico absoluto.
- **Tipo de ida e volta** — que métrica de precisão apresentar (ver abaixo).
- **Usar etiquetas MPE (cor)** — desativado = as tabelas de consulta colorimétricas; ativado = as etiquetas de elementos de processamento múltiplo / de cor. Não tem efeito na visão geral dentro do gamut, onde fica desativado.

A tabela mostra o **volume de gamut** (em ΔE\*ab³, delimitado pela transformação dispositivo → PCS `A2B`, medido por voxelização do limite e contagem das células delimitadas) a par de **mín. / média / desvio padrão / P90 / máx.** do ΔE\*ab da ida e volta selecionada. Por baixo há um histograma da distribuição do ΔE — barras de frequência relativa com uma linha de frequência cumulativa — e ainda o `L, a, b` com o pior erro e, no caso do PRMG, se o perfil implica o Perceptual Reference Medium Gamut.

Os quatro tipos de ida e volta:

- **Visão geral dentro do gamut (RT0)** — uma grelha de valores do dispositivo é levada ao PCS, de volta ao dispositivo e novamente ao PCS; o ΔE\*ab é medido entre as duas passagens PCS. Uma verificação rápida de estabilidade dentro do gamut.
- **Inversão + gamut (RT1)** — ΔE\*ab entre o PCS de cada cor do dispositivo e o seu PCS após uma ida e volta Lab → dispositivo → Lab. Reflete a precisão da inversão *e* o mapeamento de gamut.
- **Reprodutibilidade (RT2)** — ΔE\*ab entre a primeira e a segunda ida e volta: a estabilidade de uma ida e volta repetida, independentemente do recorte de gamut da primeira passagem.
- **Interoperabilidade PRMG** — as cores PCS dentro do Perceptual Reference Medium Gamut fazem uma única ida e volta; a distribuição do ΔE indica a interoperabilidade entre perfis.

Por baixo do histograma, **ΔE de ida e volta por luminosidade** responde à pergunta a que os valores de resumo não respondem: *onde*, na escala tonal, a inversão tem dificuldades, e *até que ponto do interior do gamut* chega o problema.

Amostra 32 níveis de luminosidade. Em cada nível toma 64 pontos **no limite do gamut** e repete-os, aproximados do eixo neutro, a 80 %, 50 % e 20 % do respetivo croma — 8192 pontos no total, cada um representado individualmente, com separadores ponteados entre níveis.

Leia-o faixa a faixa. Dentro de uma faixa, os pontos vão da superfície do gamut, à esquerda, até ao neutro, à direita, pelo que o erro deve **diminuir** ao longo da faixa: as cores perto do limite são as mais difíceis de inverter, as cores perto do neutro as mais fáceis. Uma faixa cujo erro se mantém elevado até ao neutro indica um perfil com problemas nessa luminosidade. Os picos mais altos assinalam os níveis de luminosidade em que o próprio limite do gamut é pior invertido.

Todas as sementes estão dentro do gamut por construção, pelo que o que vê é uma discordância genuína entre `B2A`/`A2B` e não cores recortadas por serem inatingíveis. Note que este gráfico tem a sua **própria** amostragem — deliberadamente ponderada para o limite do gamut — pelo que a média e o máximo são mais elevados do que os da tabela acima e não comparáveis com eles. Segue a intenção de renderização, mas não o tipo de ida e volta.

Um perfil a que faltem as transformações dispositivo↔PCS de que uma métrica precisa mostra uma nota *não aplicável*; um espaço de dispositivo demasiado amplo para amostrar é indicado como ignorado e não como erro.

#### Colorimetria dos extremos {#extrema-colorimetry src=be6c9597}

Os extremos da gama de reprodução do perfil — os números que um operador de impressão costuma ler primeiro.

- **Ponto branco** — a cor com **corante nulo**, ou seja, o suporte nu.
- **Ponto preto** — obtido passando o preto do PCS (L\*=0, a\*=b\*=0) pela tabela `B2A` selecionada para obter a tintagem que o perfil *escolhe* para o preto e lendo depois essa tintagem através de `A2B1`.
- Ambos são apresentados em colorimetria **relativa** e **absoluta**. A absoluta mostra a cor própria do suporte (um papel branco-azulado aparece como algo como L\* 95, b\* −4); a relativa refere-a a um branco perfeito. Se as duas colunas forem idênticas, é normal — o branco do meio coincide simplesmente com o iluminante. Um perfil sem etiqueta de ponto branco do meio mostra apenas a relativa.
- **Tintagem no ponto preto** e **TAC** — a tinta por canal nesse preto e a respetiva soma: a cobertura total de tinta, o valor do limite de tinta.

Como cada tabela `B2A` escolhe a sua própria tintagem para o preto, o ponto preto difere realmente entre intenções — daí o seletor de intenção de renderização.

Por baixo, **Tinta plena vs croma máximo**: para cada vértice de tinta (C, M, Y, R, G, B e K), onde fica em matiz / croma / luminosidade, e o ponto mais cromático encontrado no caminho até lá a partir do suporte nu. Estas linhas são medidas através de `A2B1` e por isso **não mudam com o seletor de intenção**. Num perfil bem comportado, as duas linhas coincidem. Quando o croma máximo surge *antes* da tinta plena, a linha é assinalada: a partir desse ponto, a tinta adicional já não acrescenta croma, apenas escurece.

**Apenas perfis de saída (impressora)** — a análise pressupõe que corante nulo significa suporte nu. A tabela por matiz exige ainda um espaço de dispositivo **CMYK ou CMY**: um perfil de n cores (nCLR) nomeia os canais por qualquer ordem, pelo que não é possível saber qual é o "ciano", e a tabela indica isso em vez de adivinhar.

#### Tintagem do eixo neutro {#neutral-axis-inking src=aa5449e4}

Percorre o eixo neutro (a\*=b\*=0) desde o branco (L\*=100) até ao preto (L\*=0) através da tabela `B2A` (PCS → dispositivo) do perfil e representa a quantidade de cada corante do dispositivo que o perfil deposita ao longo do caminho — a clássica curva de GCR / construção do neutro. Uma curva por canal do dispositivo, com cor por corante.

É traçada uma curva adicional sobre a separação:

- **L\* de saída (tom)** — a resposta tonal: onde o eixo neutro fica efetivamente em luminosidade após uma ida e volta pelo perfil. Leia duas coisas na sua forma. Uma descida abaixo da diagonal significa que os cinzentos são reproduzidos mais escuros do que o pedido. Mais útil ainda, a curva **achata na luminosidade mais escura que o perfil consegue atingir** — esse patamar *é* o ponto preto do meio, e deve coincidir com a secção Colorimetria dos extremos acima.

**Apenas perfis de saída (impressora)**; as outras classes de perfil mostram uma nota.

#### Utilização de tinta nas sombras {#ink-usage-in-shadows src=e62016b7}

Quatro percursos retos no plano a\*b\* com uma luminosidade constante e deliberadamente escura — 0°, 45°, 90° e 135° — passados pela tabela `B2A` selecionada, com a separação resultante representada para cada um.

Como todas as amostras de um percurso partilham a mesma L\*, qualquer degrau abrupto ou inversão num corante resulta apenas do tratamento do matiz e do croma. É a assinatura de um artefacto de mapeamento de gamut nas sombras, o tipo de problema que aparece na impressão como bandas ou uma mudança súbita de cor nas zonas escuras. Os percursos vão de muito fora do gamut, atravessam-no e saem pelo outro lado, pelo que também vê onde o perfil começa a limitar.

O plano de luminosidade é escolhido automaticamente: a meio caminho entre o vértice Azul do perfil e o mais escuro de C, M, Y, R e G. Nas tabelas perceptual e de saturação, a luminosidade é primeiro esticada desde o ponto preto do meio até ao preto do PCS — essas tabelas esperam aí o preto — e a secção indica tanto o plano compensado como o original.

**Apenas perfis de saída (impressora)**, e com a mesma restrição CMYK/CMY da tabela por matiz acima (o plano é derivado dos vértices de tinta).

#### Trajetos de tintagem primária pelo neutro {#primary-inking-paths-through-neutral src=cb510c25}

Três trajetos — ciano→vermelho, magenta→verde, amarelo→azul — cada um levado de um vértice primário, **através do eixo neutro** na luminosidade média das suas duas extremidades, até ao vértice oposto, passados pela tabela `B2A` selecionada e representados como separação.

É a contrapartida, dentro do gamut, da Utilização de tinta nas sombras. Aí, os percursos saem deliberadamente do gamut para expor artefactos de mapeamento de gamut; aqui, **todas as amostras estão dentro do gamut por construção** — ambas as extremidades são primários do próprio perfil e o ponto de viragem está no eixo neutro. Assim, um degrau, uma dobra ou uma inversão num corante ao longo de um destes trajetos não pode ser atribuído ao recorte de gamut: é um defeito de suavidade da CLUT. O ponto de viragem neutro fica no centro de cada gráfico, onde deve ver uma construção do neutro equilibrada.

Nas tabelas perceptual e de saturação, a luminosidade tem compensação do ponto preto para a intenção, exatamente como em Utilização de tinta nas sombras.

**Apenas perfis de saída (impressora)**, com a mesma restrição CMYK/CMY (os vértices vêm da mesma fonte que a tabela por matiz).

#### Estatísticas de utilização de tinta {#ink-usage-statistics src=191fd7cd}

Quanto de cada corante o perfil deposita, como cobertura média e como **quota do total** — a assinatura de consumo de tinta da separação.

A tabela soma cada corante ao longo do eixo neutro e indica a sua cobertura média e a sua percentagem do total de tinta depositada. A coluna da quota é a que tem valor de diagnóstico: é a impressão digital da construção do neutro do perfil (um equilíbrio de cinzentos com predomínio de ciano lê-se de forma diferente de um com predomínio de preto) e é independente do número de amostras recolhidas.

Uma segunda tabela — a utilização de tinta em **todas as cores no limite e dentro do gamut** — aparece como *pendente*: precisa de uma construção do limite do gamut que ainda não está implementada.

**Apenas perfis de saída (impressora).**

#### Imagem CLUT {#clut-image src=a3fec568}

A tabela de consulta de cor de uma transformação dispositivo↔PCS, disposta em mosaico numa imagem, com um seletor da tabela de intenção de renderização a ver (`A2B0`–`A2B3`, `B2A0`–`B2A3` e as tabelas de pré-visualização). Útil para detetar de relance danos estruturais numa tabela. Aproxime, desloque e reponha com os controlos da tela.

Quando seleciona uma **tabela `B2A` (PCS → dispositivo)**, aparece por baixo da grelha uma **imagem de cobertura de tinta em tons de cinzento para cada corante** — as separações por tinta, em que mais escuro significa mais dessa tinta. Uma indicação no topo da secção encaminha-o para elas, uma vez que a secção abre numa tabela `A2B` (cuja saída é L\*a\*b\*, não tintas). Para uma **saída de n cores (nCLR)** — de 5, 6 ou 7 cores — em que não há uma pré-visualização de cor simples, a imagem principal tem **gestão de cor através da `A2B` direta do perfil**, pelo que continua a ser apresentada em cor real em vez de num cinzento de canal único.

#### Imagem de gamut {#gamut-image src=92f58c0f}

O mapa dentro/fora do gamut da etiqueta de gamut: neutro onde uma cor PCS é reproduzível, vermelho onde fica fora do gamut do dispositivo. Só aparece quando o perfil tem uma etiqueta `gamt`.

### 3.5 XML {#3-5-xml src=dfd43c4e}

Converte o perfil para XML (através do IccLibXML, o mesmo escritor usado pela ferramenta de linha de comandos `iccToXml` do iccDEV) e mostra-o num editor CodeMirror com realce de sintaxe. Edite o XML e clique em **Converter para ICC** para voltar ao binário; o visualizador revalida o perfil e o botão **Guardar perfil ICC** na barra do separador Perfil transfere o resultado.

Um indicador de **edições por guardar** mostra quando o texto do editor difere da última saída do conversor, para perceber de relance se as suas edições já foram aplicadas. Se a conversão falhar, o erro de análise do IccLibXML aparece por cima do editor, com a linha / coluna em causa.

### 3.6 JSON {#3-6-json src=59c3f2e5}

A mesma ideia do separador XML, mas com uma representação JSON do perfil produzida pelo wrapper do validador (`json-wrapper.cpp`). Edite, clique em **Converter para ICC** e guarde. A forma JSON é mais compacta e mais fácil de tratar em scripts; a forma XML é mais familiar se já usou as ferramentas de linha de comandos do iccDEV.

---

## 4. Separador Ligar {#4-combine-tab src=735d6198}

O profiletool mantém todos os perfis carregados num **conjunto de perfis**, à esquerda. No topo há cinco separadores — **Perfil** (o visualizador de um único perfil descrito acima), **Comparar**, **Ligar**, **Espectral** e **HDR**. O separador **Ligar** é onde encadeia perfis e os põe a trabalhar: criar um **DeviceLink**, **transformar uma imagem** ou **transformar um conjunto de dados de cor** através da cadeia.

### 4.1 Construir uma cadeia {#4-1-building-a-chain src=83ab772c}

Arraste um ou mais perfis do conjunto para o cartão Ligar para os acrescentar à cadeia, por ordem. A cadeia é uma **pilha vertical**: a origem fica no topo e o destino em baixo. Cada perfil contribui com **uma transformação**, e a ferramenta mostra o espaço de cor de entrada e de saída de cada uma (p. ex. `RGB → Lab`), com o **espaço de ligação** indicado na linha entre etapas. O motor valida toda a cadeia em tempo real e indica o fluxo de ponta a ponta (p. ex. *Cadeia: RGB → CMYK*) ou explica, etapa a etapa, onde a ligação falha.

- **Reordene** uma etapa arrastando a pega (`⠿`) ou com os botões ▲ / ▼; remova-a com ×.
- **Inverter a direção** — o botão ⇅ da transformação inicial inverte a direção da cadeia, propagando-se pelas etapas seguintes.
- **Intenção de renderização** — escolha uma para toda a cadeia com *Intenção de renderização (todas)* ou substitua-a numa etapa com a lista dessa etapa. Passe o cursor sobre qualquer dos controlos para ver uma descrição da intenção selecionada. Além das quatro intenções base, um perfil com as tabelas necessárias oferece também as variantes *no D2Bx/B2Dx* e *+ BPC* (compensação do ponto preto).

<div class="note">
<strong>Perfil HDR ColorSpace na cadeia.</strong> Um perfil HDR ColorSpace do ICC.1 não tem etiquetas TRC — a cláusula 8.7 não define nenhuma para um perfil ColorSpace — pelo que uma transformação através dele usa o seu <code>AToB0Tag</code>. Essa tabela é a renderização HDR&#8594;SDR que a cláusula 8.7.1.5 exige para software sem processamento HDR. O cartão indica-o quando uma cadeia contém um perfil HDR ColorSpace: o DeviceLink, a imagem ou os dados que produzir refletem essa alternativa SDR, não o comportamento HDR do perfil.
</div>

### 4.2 Criar DeviceLink {#4-2-make-devicelink src=2cb72a0d}

Converte a cadeia inteira num único perfil **DeviceLink** (uma versão para o navegador do `iccApplyToLink` do iccDEV). Dê-lhe um nome e clique em **Criar DeviceLink**; o resultado entra no conjunto e no acumulador do separador Ligar como qualquer outro perfil, pronto a inspecionar no separador Perfil ou a reutilizar noutra cadeia.

### 4.3 Transformar imagem {#4-3-transform-image src=461fcd83}

Largue uma imagem raster (TIFF, PNG ou JPEG) na área de imagem e clique em **Transformar imagem** para a passar pela cadeia (uma versão para o navegador do `iccApplyProfiles`). A imagem é primeiro validada por uma sonda que lê apenas o cabeçalho — o seu espaço de cor tem de coincidir com a entrada da cadeia. O resultado **é transferido**; as imagens nunca são guardadas no conjunto.

Quando é carregada uma imagem válida, aparece um painel **Opções de saída de imagem** com os parâmetros de destino que espelham a ferramenta de linha de comandos `iccApplyProfiles`:

- **Codificação** — *Igual à origem*, 8 bits, 16 bits ou **Flutuante (32 bits)**.
- **Compressão** — Nenhuma, **LZW** ou **ZIP** (Deflate).
- **Planar** — planos **Composto** (intercalados) ou **Separado**.
- **Interpolação CMM** — **Tetraédrica** ou **Linear**.
- **Incorporar ICC** — marcar a saída com o último perfil da cadeia (o do espaço de saída).

Por predefinição, a saída RGB/Gray é mantida em PNG; escolher um parâmetro exclusivo de TIFF (flutuante, LZW/ZIP ou planos separados) muda o contentor para TIFF.

<div class="note">
<strong>Perfis incorporados:</strong> se a imagem largada tiver o seu próprio perfil ICC incorporado, uma faixa propõe <strong>extraí-lo</strong> — o perfil é acrescentado ao conjunto e colocado no início da cadeia (como espaço de origem) com um só clique.
</div>

### 4.4 Transformar dados {#4-4-transform-data src=96934eec}

Largue um conjunto de dados de cor (CGATS/IT8, CSV, CxF ou JSON) na área de dados e clique em **Transformar dados** para passar todas as amostras pela cadeia (o equivalente ao `iccApplyNamedCmm`). A ferramenta lê os tipos de dados do conjunto (dispositivo / Lab / XYZ / espectral) e fornece o que a entrada da cadeia precisar; uma entrada **espectral** é convertida em colorimetria com o calculador canónico do iccDEV, usando o **Observador** e o **Iluminante** que escolher. As amostras duplicadas podem ser filtradas (mediana ou média). O resultado abre numa tabela que pode **Guardar** como CSV.

### 4.5 Mudança de observador {#4-5-observer-change src=738ba4d4}

O separador Ligar tem **dois** cartões de criação. Acima do fluxo de ligação, o cartão **Mudança de observador** cria um perfil de ecrã matriz/TRC v4.3 a partir de um perfil de ecrã RGB V5 e de um perfil de observador V5 (PCC). Arraste ambos para o cartão — são encaminhados automaticamente, pela classe do perfil, para as áreas **Ecrã RGB V5** e **Observador V5 (PCC)** — e depois clique em **Criar perfil de ecrã V4**, dê-lhe um nome e clique em **Criar**. O resultado junta-se ao conjunto e a este separador. Um perfil que não seja nenhum dos dois é ignorado com um aviso.

### 4.6 Separadores Comparar e Espectral {#4-6-compare-and-spectral-tabs src=b934d7e3}

O separador **Comparar** sobrepõe os limites de gamut de dois ou mais perfis do conjunto — um invólucro 3D e um corte 2D de luminosidade — para ver onde diferem. Quando os perfis são perfis HDR ColorSpace, uma nota **A mostrar o recurso SDR** explica que cada gamut é construído a partir da renderização SDR do `AToB0Tag` e não da gama HDR do perfil, que não pode ser desenhada num PCS limitado. O separador **Espectral** junta um grupo de imagens espectrais de canal único (largadas pela ordem dos canais) num único TIFF multicanal (`iccSpecSepToTiff`).

## 5. Edição de ida e volta {#5-round-trip-editing src=595f380b}

Os separadores XML e JSON podem ambos voltar a gravar o perfil em binário ICC. O fluxo de trabalho típico:

1. **Carregue** um perfil ICC.
2. Abra o separador **XML** ou **JSON**. Clique em **Converter para XML** / **Converter para JSON** para preencher o editor.
3. **Edite** no editor da página. Aparece um indicador de alterações junto à barra de ferramentas.
4. Clique em **Converter para ICC**. O wrapper cria um novo perfil, volta a executar a validação e atualiza os separadores Cabeçalho / Etiquetas / Validação.
5. Aparece uma etiqueta **● Modificado — não guardado** junto ao nome do ficheiro, na barra do separador Perfil.
6. Clique em **Guardar perfil ICC**. Os bytes editados são transferidos como `<original>-edited.icc`.

Os dois editores são independentes — editar o XML e depois o JSON não mistura os dois caminhos. São guardados os bytes ICC produzidos mais recentemente.

<div class="note">
<strong>Atenção:</strong> a fidelidade da conversão depende do que o IccLibXML / o wrapper JSON suporta para cada tipo de etiqueta. Se um tipo de etiqueta não for representável, a ida e volta perde detalhe; consulte o separador Validação depois da conversão de regresso para confirmar que tudo continua a ser analisado sem problemas.
</div>

O separador Etiquetas realça qualquer etiqueta cujos bytes difiram dos carregados originalmente, para ser fácil ver o que as suas edições alteraram.

---

## 6. Abrir a partir do chardata {#6-launching-from-chardata src=b39a6805}

No **chardata**, depois de carregar um perfil ICC, clique em **Display File** para abrir o visualizador da página e depois em **Launch editor**. Abre-se aqui um novo separador com `?source=chardata` no URL.

A transferência decorre inteiramente no navegador:

1. O profiletool abre, deteta `?source=chardata` e envia `{type:'profiletool:ready'}` para `window.opener` através de `postMessage`.
2. O chardata responde com `{type:'profiletool:load', filename, bytes}`.
3. O profiletool aceita os bytes (depois de verificar a origem do remetente numa lista de origens permitidas e o tamanho face ao limite de 256 MB), executa a validação e mostra o perfil.

Sem envio de ficheiros, sem ida e volta ao servidor. O fluxo é unidirecional — as edições feitas aqui guardam-se clicando em **Guardar perfil ICC** e não são devolvidas ao chardata.

---

## 7. Abrir com um URL {#7-launching-with-a-url src=f9a8d871}

Pode abrir a ferramenta com uma ligação que indica um perfil a carregar — e o separador a apresentar — através de um **fragmento de URL** (a parte depois de `#`):

```
https://chardata.colourbill.com/profiletool#url=<profile-url>&tab=<tab>
```

Ambos os parâmetros são opcionais:

- **`url=`** — o endereço web de onde o perfil é obtido. Os bytes são transferidos no seu navegador e depois seguem exatamente o mesmo caminho que um ficheiro local: a verificação do cabeçalho `acsp`, o `ValidateIccProfile` completo, o limite de tamanho de 256 MB e a alternativa de melhor esforço para perfis que não podem ser analisados. Nada é enviado — os bytes obtidos servem apenas ao validador e nunca são reenviados.
- **`tab=`** — a vista a abrir depois de o perfil ser carregado.

Um exemplo completo:

```
https://chardata.colourbill.com/profiletool#url=https://example.org/profiles/sRGB.icc&tab=VAL
```

<div class="note">
<strong>Porquê um fragmento e não uma query string?</strong> A parte depois de <code>#</code> nunca é enviada para um servidor web, pelo que o endereço do perfil que está a inspecionar fica no seu próprio computador.
</div>

### Nomes dos separadores {#tab-names src=d3a4dbae}

`tab=` aceita dois esquemas de nomes intercambiáveis, sem distinção entre maiúsculas e minúsculas. Os códigos **curtos** são a forma preferida:

| Vista | Código curto | Nome longo |
|---|---|---|
| Cabeçalho | `HEADER` | `Header` |
| Etiquetas | `TAGS` | `Tags` |
| Validação | `VAL` | `Validation` |
| Análise | `ANALYSIS` | `Analysis` |
| XML | `XML` | `XML` |
| JSON | `JSON` | `JSON` |

Os nomes longos são os nomes ingleses dos separadores no ecrã, sem espaços. Ambos os esquemas se mantêm estáveis mesmo que os nomes visíveis mudem, pelo que as ligações existentes continuam a funcionar. O separador Validação também responde ao código antigo `PAWG` (anteriormente chamava-se "Profile Assessment WG"). Um valor de `tab=` não reconhecido é ignorado e abre-se a vista Cabeçalho.

<div class="note">
<strong>Requisitos de <code>url=</code>:</strong> o perfil tem de ser servido por <strong>HTTPS</strong> e o servidor de alojamento tem de permitir leituras de origem cruzada (um cabeçalho <code>Access-Control-Allow-Origin</code> / CORS permissivo). Se faltar algum deles, o navegador bloqueia a transferência e a ferramenta mostra um erro de obtenção. Se o próprio URL do perfil contiver <code>&</code> ou <code>#</code> (a sua própria query string), codifique em percentagem todo o valor de <code>url=</code> para que esses caracteres não terminem o fragmento antes do tempo.
</div>

---

## 8. Dispositivos móveis {#8-mobile src=cb948e3c}

Em ecrãs com menos de 700 px de largura:

- O painel de definições passa a ser uma gaveta que desliza a partir da direita.
- Um botão flutuante **⚙** no canto superior direito abre / fecha as Definições.
- Um botão **?** por baixo do ⚙ abre este guia no seu painel deslizante.
- Um botão **✉** abre o formulário de contacto num novo separador do navegador.
- Tocar no fundo escurecido fecha a gaveta aberta.
- A tabela de etiquetas passa de uma grelha larga para cartões empilhados, para que todas as colunas fiquem legíveis sem deslocamento horizontal; uma etiqueta continua a expandir-se no local.
- **O toque substitui o arrastar e largar.** O iOS não tem arrastar e largar, pelo que arrastar um perfil do conjunto para um separador não funciona aí. Em vez disso, **toque nos perfis para os selecionar e depois toque no separador** em que os quer colocar — o resultado é o mesmo do arrastamento. O conjunto mostra este lembrete enquanto estiver a usar um ecrã tátil.
- **No iPhone e no iPad, os seletores de ficheiros listam todos os ficheiros.** O iOS compara um filtro de tipo de ficheiro com os tipos que conhece, e não conhece nenhum para `.icc`, `.icm`, `.cube` ou `.exr`, pelo que filtrar deixaria a cinzento precisamente os ficheiros que quer abrir. Escolha o perfil pelo nome; tudo o que não for um perfil continua a ser recusado, com o motivo, depois do carregamento.

Todas as funcionalidades estão disponíveis; a disposição adapta-se ao ecrã mais pequeno.

---

## 9. Limites e segurança {#9-limits-and-security src=ce1e9474}

O profiletool não faz pedidos de rede depois do carregamento inicial da página. O validador, o conversor XML, o conversor JSON e os codecs de imagem são todos WebAssembly compilado a partir de código-fonte C++ e são executados inteiramente do lado do cliente. O separador HDR mostra uma imagem largada através de um URL de objeto local, pelo que a imagem nunca sai do separador. **Identificar ecrãs** pergunta ao navegador, e não a um servidor, em que monitor está a janela.

| Limite | Onde | Notas |
|---|---|---|
| **256 MB** | postMessage / carregamento de ficheiros | Recusa carregar tudo o que for maior; impede o esgotamento da memória por uma janela de origem hostil |
| **32 MB** | Conversores XML e JSON | Aplicado tanto pela proteção em JS (`MAX_XML_BYTES` / `MAX_JSON_BYTES`) como pelos wrappers C++ (`kMaxXmlBytes` / `kMaxJsonBytes`); o lado C++ é autoritativo de forma independente |
| **Proteção contra bombas de entidades XML** | Conversor XML | Qualquer XML que contenha `<!DOCTYPE` ou `<!ENTITY`, ou um byte NUL, é rejeitado antes de chegar ao libxml2. Os próprios limites de expansão de entidades do libxml2 também estão ativos, pelo que esta é uma segunda camada de defesa contra entradas do tipo billion laughs |
| **512 MB** | Ficheiro do separador HDR | Verificado face ao tamanho do ficheiro antes de qualquer leitura; espelha o próprio limite de entrada de 512 MB dos codecs de imagem |
| **40 megapíxeis**, **64 píxeis por byte** | Descodificação Radiance HDR (separador HDR) | Ambos verificados a partir do cabeçalho e do tamanho do ficheiro antes de ser reservada qualquer memória de píxeis; o segundo recusa bombas de descompressão por marcadores de repetição |
| **Orçamento de descodificação EXR** | Descodificação OpenEXR | Largura × altura × canais × 4 bytes tem de caber em 512 MB, verificado a partir do cabeçalho antes de o descodificador reservar o que quer que seja |
| **Percurso das caixas HEIC/AVIF** | Extração de perfis | Os tamanhos das caixas são verificados sem overflow, o aninhamento está limitado a 8, um perfil a 64 MB (por ficheiro, no total) e as associações de itens a 65 536 |
| **Lista de origens permitidas** | Abertura por postMessage | Só a mesma origem e as origens de desenvolvimento do chardata podem enviar bytes `profiletool:load` |
| **HTTPS + CORS** | Abertura por `#url=` | Um perfil aberto por URL tem de ser servido por HTTPS a partir de um servidor que permita leituras de origem cruzada; os bytes obtidos servem apenas ao validador e nunca são reenviados |

A abertura por `#url=` (acrescentada na versão 1.1.5) é o único caso em que a ferramenta faz um pedido para outra origem depois do carregamento da página: alarga a diretiva `connect-src` da Content-Security-Policy a `https:` para que o perfil indicado possa ser obtido. O carregamento de scripts **não** é alargado — apenas a obtenção de dados.

Se precisar de inspecionar um perfil que exceda estes limites, compile o iccDEV a partir do código-fonte e use as ferramentas nativas de linha de comandos — essas não têm os limites do lado JS.

### Licença {#licence src=e7a2a884}

O profiletool é distribuído sob a licença MIT. A aplicação inclui também componentes de terceiros com as suas próprias licenças: o IccProfLib do iccDEV (International Color Consortium), LibTIFF, libpng, zlib, libxml2, JSON for Modern C++, o runtime Emscripten e pacotes JavaScript, incluindo React, Plotly e CodeMirror. Este software baseia-se em parte no trabalho do Independent JPEG Group. Os avisos completos estão em [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt).

### Cobertura de ICC.2 (iccMAX) {#icc-2-iccmax-coverage src=3d2b33e8}

São suportados perfis **ICC.1** e **ICC.2**, mas a cobertura de ICC.2 está **incompleta**. O carregamento, as vistas de cabeçalho e de etiquetas, a validação, a ida e volta XML/JSON e os motores de transformação compreendem todos o ICC.2; as lacunas conhecidas são os fluxos de trabalho de intercâmbio **ICS** com várias partes, a escolha de um **subperfil** V5 ao aplicar uma transformação e a procura inversa em alguns perfis ICC.2. Um perfil que use uma construção ICC.2 não suportada é assinalado pelo separador Validação em vez de ser lido incorretamente sem aviso.
