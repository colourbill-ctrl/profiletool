<!-- (c) 2026 William Li -->

<!-- pt-BR translation of MANUAL.md. Translate the text; keep every {#anchor src=…} exactly as it is. -->

# ICC Profile Tool — Manual do usuário {#icc-profile-tool-user-manual src=38bba1de}

A **Ferramenta de perfis ICC** (ICC Profile Tool, ou profiletool) é uma ferramenta que roda no navegador para inspecionar, validar e editar com ida e volta perfis de cor **ICC.1** e **ICC.2 (iccMAX)**. Ela funciona inteiramente no seu navegador — sem upload, sem instalação — usando uma versão WebAssembly do [iccDEV](https://github.com/InternationalColorConsortium/iccDEV), a implementação de demonstração oficial do ICC da IccProfLib.

**O que você pode fazer:**

- **Navegar pelo cabeçalho** — cada campo do cabeçalho de 128 bytes do perfil, decodificado em texto legível.
- **Navegar pelo diretório de tags** — cada tag com sua assinatura, tipo, deslocamento em bytes, tamanho e bytes de preenchimento. Clique em qualquer tag para expandir uma descrição completa específica do tipo (a mesma saída da visualização "Describe" do `wxProfileDump` do iccDEV) e — nas tags que a têm — uma **visualização** embutida: curvas de resposta tonal, diagramas de cromaticidade, imagens de CLUT e de gamut, gráficos de dispersão de cores nomeadas, além de um **avaliador de transformação** para um único ponto.
- **Validar** — executar a lista de verificação do ICC Profile Assessment Working Group (Segurança / Conformidade / Qualidade), com um veredito para cada verificação e filtro por categoria.
- **Editar com ida e volta** — converter o perfil em XML ou JSON, editá-lo no editor de código embutido, convertê-lo de volta para ICC e validá-lo novamente. O botão de salvar baixa o binário editado.
- **Encadear perfis** — na aba **Vincular**, arraste perfis do conjunto para uma cadeia ordenada e transforme-a em um **DeviceLink**, **transforme uma imagem** por ela (com controle total da codificação de saída, compressão, disposição planar e incorporação do ICC) ou **transforme um conjunto de dados de cor**.
- **Trabalhar com HDR** — verificar um perfil contra as regras do HDR ColorSpace Profile do ICC.1 (cláusula 8.7.1), ler seus pontos de código cICP e traçar sua curva de ganho adaptativo para qualquer margem da tela. A aba **HDR** mostra uma imagem HDR na sua tela, e **Configurações → Ambiente** informa o que este navegador e esta tela são capazes de fazer.
- **Abrir a partir do chardata** — abra aqui diretamente um perfil carregado no [chardata](https://chardata.colourbill.com/), com os bytes repassados dentro do navegador via `postMessage`.
- **Abrir com uma URL** — abra um link que aponta a ferramenta para um perfil hospedado na web e, opcionalmente, para a aba a ser exibida (p. ex. `…/profiletool#url=…&tab=VAL`).

Tudo é executado no lado do cliente. Os bytes do perfil nunca saem da aba do navegador.

<div class="note">
<strong>O suporte a ICC.2 (iccMAX) é parcial.</strong> Perfis ICC.2 são carregados, inspecionados, validados e editados com ida e volta como os ICC.1 — a lista de validação inclui verificações específicas do iccMAX, PCS espectral e tags de elementos multiprocessamento são decodificados, e os mecanismos de transformação são compilados sobre a pilha iccMAX completa. Ainda não são cobertos: fluxos <strong>ICS</strong> (Interchange Color Space) com várias partes, a seleção de um <em>subperfil</em> V5 ao aplicar uma transformação e a busca inversa em alguns perfis ICC.2. Espere lacunas nos recursos mais exóticos do ICC.2; elas estão sendo preenchidas a cada versão.
</div>

<div class="note">
<strong>O suporte ao HDR ColorSpace Profile segue um rascunho.</strong> As verificações HDR, as visualizações da <code>headroomAdaptiveGainCurveTag</code> e a aba HDR implementam a emenda HDR do ICC.1 em seu estado atual. A emenda ainda não foi publicada, portanto os detalhes podem mudar até lá.
</div>

---

## Sumário {#contents src=54605fa3}

1. [O espaço de trabalho](#1-the-workspace)
2. [Painel de configurações](#2-settings-panel)
3. [Visualizações do perfil](#3-profile-views)
   - [Cabeçalho](#3-1-header)
   - [Tags](#3-2-tags)
   - [Validação](#3-3-validation)
   - [Análise](#3-4-analysis)
   - [XML](#3-5-xml)
   - [JSON](#3-6-json)
4. [Aba Vincular](#4-combine-tab)
   - [Montar uma cadeia](#4-1-building-a-chain)
   - [Criar DeviceLink](#4-2-make-devicelink)
   - [Transformar imagem](#4-3-transform-image)
   - [Transformar dados](#4-4-transform-data)
   - [Mudança de observador](#4-5-observer-change)
   - [Abas Comparar e Espectral](#4-6-compare-and-spectral-tabs)
   - [Aba HDR](#4-7-hdr-tab)
5. [Edição com ida e volta](#5-round-trip-editing)
6. [Abrir a partir do chardata](#6-launching-from-chardata)
7. [Abrir com uma URL](#7-launching-with-a-url)
8. [Dispositivos móveis](#8-mobile)
9. [Limites e segurança](#9-limits-and-security)

---

## 1. O espaço de trabalho {#1-the-workspace src=4bc9350f}

O profiletool é uma **bancada de trabalho para vários perfis**. A janela tem três partes:

- o painel **Perfis** à esquerda — o *conjunto* de tudo o que você carregou;
- o **canvas** à direita, com cinco abas no topo — **Perfil**, **Comparar**, **Vincular**, **Espectral**, **HDR**;
- o painel lateral de **Configurações** na borda direita (veja [Painel de configurações](#2-settings-panel)).

### Carregar perfis {#loading-profiles src=2cd0f653}

Carregue arquivos de uma destas duas formas:

- Clique em **Carregar perfis** no topo do painel Perfis e escolha um ou mais arquivos, ou
- **Arraste e solte** os arquivos no painel Perfis.

Você pode carregar perfis `.icc` / `.icm` *e* imagens. Solte um **TIFF, PNG, JPEG, HEIC ou AVIF** e a ferramenta extrai o seu **perfil ICC incorporado** e o adiciona ao conjunto. Ela lê apenas os metadados do arquivo, nunca os pixels. No HEIC e no AVIF ela percorre as caixas (boxes) do arquivo, então isso funciona em qualquer navegador, inclusive nos que não conseguem exibir esses formatos. Um arquivo **JPEG XL** também é recusado: o perfil fica comprimido dentro do codestream, que o profiletool ainda não descomprime. Vídeos e arquivos raw de câmera que usam o mesmo contêiner do HEIC (MP4, QuickTime, Canon CR3) não são tratados como imagens. Um arquivo **OpenEXR** ou **Radiance HDR** (`.hdr`) é recusado com o motivo: nenhum dos dois formatos tem espaço para um perfil ICC. O OpenEXR declara sua cor por cromaticidades, o Radiance HDR por uma linha de cabeçalho `PRIMARIES` opcional. Para *ver* uma imagem, use a [aba HDR](#4-7-hdr-tab). Um botão **＋ Novo a partir de .cube** cria um DeviceLink a partir de uma LUT `.cube`. O resultado é adicionado ao conjunto e aberto na aba **Perfil**; nada é baixado até você clicar em **Salvar perfil ICC**.

Um perfil é aceito se seus primeiros 36 bytes contêm a assinatura `acsp` e ele passa pelo `ValidateIccProfile` da IccProfLib. Os arquivos que falham aparecem em um resumo de rejeição com o motivo específico; seus bytes não são mantidos.

### O painel Perfis {#the-profiles-pane src=04750126}

Os perfis carregados são agrupados em seções recolhíveis por **classe de perfil** (Input, Display, Output, DeviceLink, ColorSpace, Abstract, Named Color, …). Os **Perfis HDR ColorSpace** da cláusula 8.7.1 do ICC.1 ganham uma seção própria no topo (são perfis da classe ColorSpace, por isso são retirados da seção ColorSpace), dividida pela transferência em **Transferência linear** e **Transferência não linear (PQ, HLG)**, com a transferência mostrada como um selo em cada linha. A divisão importa na [aba HDR](#4-7-hdr-tab), onde só um perfil de transferência linear pode ser atribuído a uma imagem OpenEXR ou Radiance HDR. Cada linha mostra o nome do arquivo e selos com a classe, o espaço de cor, a versão e o tamanho; um perfil que só pôde ser analisado parcialmente é sinalizado. Use o botão **A–Z** para alternar a ordenação (ordem de carregamento → crescente → decrescente), o **×** de uma linha para removê-la e a alça na borda direita do painel para redimensioná-lo — ou recolha o painel por completo.

Clique para selecionar uma linha; Ctrl/Cmd-clique para alternar a seleção e Shift-clique para selecionar um intervalo. **Arraste linhas do conjunto para uma aba** para colocá-las em uso.

<div class="note">
<strong>O conjunto vale só para a sessão.</strong> Nada é enviado e nada é guardado — o seu sistema de arquivos continua sendo o armazenamento permanente. Recarregar a página esvazia o conjunto.
</div>

### As abas {#the-tabs src=034c9677}

| Aba | O que faz |
|---|---|
| **Perfil** | Inspeciona **um** perfil — cabeçalho, tags, validação, análise, XML, JSON. Soltar um novo perfil aqui substitui o atual. |
| **Comparar** | Sobrepõe os gamuts de **dois ou mais** perfis. |
| **Vincular** | Encadeia perfis em um DeviceLink, ou transforma uma imagem / conjunto de dados por eles. |
| **Espectral** | Monta imagens espectrais de um canal em um único TIFF multicanal. |
| **HDR** | Mostra **uma** imagem HDR na sua tela, com um controle SDR ↔ HDR. Veja a [aba HDR](#4-7-hdr-tab). |

As abas Espectral e HDR recebem arquivos de imagem diretamente, e não perfis do conjunto. Cada uma das outras abas mantém seu próprio grupo de perfis, mostrados como chips removíveis abaixo da faixa de abas, com um contador na própria aba. O primeiro perfil que você carrega abre automaticamente na aba **Perfil**; depois disso, arraste do conjunto para a aba que quiser. Soltar arquivos diretamente em uma aba os carrega no conjunto *e* os coloca nessa aba em uma única ação.

<div class="note">
<strong>Limite de tamanho:</strong> o carregador rejeita qualquer coisa maior que 256 MB. Perfis reais costumam ficar bem abaixo de 10 MB; o limite existe apenas para impedir que um arquivo solto ou um postMessage mal-intencionado esgote o heap WASM da aba.
</div>

---

## 2. Painel de configurações {#2-settings-panel src=3bf599d9}

Abra as Configurações clicando no botão **⚙** na borda direita da tela (ou no ícone de engrenagem no canto superior direito em dispositivos móveis). O painel desliza sobre o conteúdo sem redimensioná-lo.

Há mais dois botões abaixo do ⚙:

- **?** abre este guia **dentro do app**, como um painel que desliza sobre a janela. Ele tem uma caixa de pesquisa no cabeçalho — digite para destacar os resultados e use `Enter` / `Shift+Enter` (ou os botões `˄` `˅`) para percorrê-los; `Escape` limpa a pesquisa, e um segundo `Escape` fecha o painel.
- **✉** abre o formulário de contato em colourbill.com em uma nova aba do navegador.

O painel tem dois grupos, **Exibição** e **Ambiente**. Para alargar ou estreitar o painel, arraste sua borda esquerda (220–560 px); a largura é lembrada.

### Fundo {#background src=1450fe76}

Alterna o app entre os temas **Claro**, **Escuro** e **Sistema** (segue a preferência do sistema operacional). A escolha é mantida entre sessões. No modo **Sistema** o app acompanha `prefers-color-scheme` e muda automaticamente quando o tema do sistema operacional muda; escolher Claro ou Escuro explicitamente desliga esse acompanhamento.

### Formato numérico {#number-format src=af65622c}

Define como os valores numéricos são exibidos em todas as visualizações do perfil — **Hexadecimal** ou **Decimal**.

### Idioma {#language src=38c60535}

Substitui o idioma da interface. **Padrão do sistema (…)** detecta a localidade do navegador e usa o idioma suportado mais próximo, com o nome nativo entre parênteses para você ver qual foi escolhido. A tradução cobre a interface do app: o painel Perfis, os rótulos das abas, as ferramentas Vincular, Espectral e HDR, as visualizações da curva de ganho HDR em Tags, o painel de configurações, incluindo Ambiente e suas justificativas, e a moldura deste guia. Alguns textos não são traduzidos:
- Os textos gerados pela IccProfLib — descrições de tags, mensagens de validação, nomes de campos do cabeçalho — vêm da biblioteca C++ em inglês.
- O nome da flag do navegador fica em inglês para corresponder à própria página de flags do navegador.
- O conteúdo do registro **Eventos de tela** do painel Ambiente fica em inglês, para que possa ser colado como está em um relatório de bug.
- Este guia segue a mesma configuração, exceto as seções sobre HDR, que ficam em inglês enquanto o suporte a HDR está em beta e o texto ainda muda. Uma seção revisada em inglês depois da última atualização de sua tradução também aparece em inglês, com um aviso, até que a tradução seja atualizada.

Idiomas suportados: English, Français, Deutsch, Italiano, Español, Português (PT), Português (BR), Svenska, 中文（简体）, 中文（繁體）, 日本語, 한국어. O painel de configurações do chardata oferece o mesmo conjunto, então mudar o Idioma em um app proporciona uma leitura coerente no outro.

### Ambiente {#environment src=2eb1ea2c}

Mostra o que **este** navegador, esta plataforma e esta tela são capazes de fazer, para que você veja o motivo quando um formato ou recurso HDR não está disponível. De cima para baixo:

- **Resumo** — o navegador e o sistema operacional, e se a tela informa suporte a HDR.
- **Flags do navegador** (Chrome, Edge, Opera, Brave) — se *Experimental Web Platform features* está ativada. Essa flag ativa o canvas HDR e permite que a página leia a margem HDR de uma tela.
  - Quando se sabe que a flag está desativada, o quadro fica destacado. Ele é marcado como **necessária** se este navegador não tem WebGPU utilizável, pois o canvas HDR passa a ser a única forma de renderizar HDR. Caso contrário, é **opcional**.
  - A inspeção de perfis nunca precisa dela.
  - Uma página web não pode abrir nem alterar flags do navegador. Clique em **Copiar**, cole o endereço na barra de endereços, defina a flag como *Enabled* e reinicie o navegador.
- **Dados da tela** — **Tela HDR**, **Gamut amplo** (sRGB, Display P3 ou Rec. 2020), **Proporção de pixels** e o **Caminho de canvas HDR** em uso (`float16-canvas`, `webgpu` ou nenhum). Eles se atualizam sozinhos quando você arrasta a janela para uma tela em que são diferentes. A troca acontece quando a maior parte da janela está na nova tela.
- **Identificar telas** (navegadores Chromium) — pede permissão para ver em qual monitor a janela está. Depois de permitido, o painel se atualiza mesmo entre monitores parecidos, nomeia o **Monitor atual** e mostra a **Margem HDR** quando o navegador a expõe (Chrome com a flag acima), por exemplo *1,35 stops (≈2,55× o branco SDR)*. Se você recusar a permissão, altere-a nas configurações do site.
  - A margem é o espaço acima do branco SDR, então no painel HDR embutido de um notebook ela **diminui quando você aumenta o brilho** (o branco SDR fica mais claro enquanto o pico do painel não muda) e aumenta quando você diminui o brilho. Para visualizar HDR, diminua o brilho.
  - No Windows, um novo valor chega alguns segundos depois de uma mudança de brilho, quando o driver de vídeo o informa. Ele também se atualiza quando a janela vai para outra tela ou quando o Chrome volta a ser o app ativo.
- **Eventos de tela** — um registro recolhível das últimas 20 atualizações e do que acionou cada uma. É útil ao relatar um problema de exibição.
- **Tabela de formatos** — uma linha por formato (perfil ICC, TIFF, PNG, JPEG, OpenEXR, Radiance HDR, AVIF, HEIC/HEIF, JPEG XL), com três perguntas:
  - **Inspecionar**: o perfil incorporado pode ser lido?
  - **Exibir**: os pixels podem ser mostrados?
  - **HDR**: é possível renderizar mais claro que o branco?

  Passe o mouse sobre uma linha para ver o motivo de um ✕; os formatos que não podem ser exibidos são listados com seus motivos abaixo da tabela. Um ponto marca os formatos que o próprio profiletool decodifica, que funcionam igual em qualquer navegador. **Inspecionar** é ✓ para todos os formatos exceto JPEG XL, cujo perfil fica comprimido dentro do codestream.

---

## 3. Visualizações do perfil {#3-profile-views src=ccf59d34}

Arraste um perfil do conjunto para a aba **Perfil** para inspecioná-lo. A aba mostra uma barra com o nome do arquivo e um botão **Salvar perfil ICC** (mais um indicador *● Modificado — não salvo* depois que você o edita) e, abaixo dela, o visualizador: uma barra de título (nome do arquivo · tamanho em bytes · versão da IccProfLib · selo de validade) e sua própria faixa de abas.

O selo resume o relatório de **Validação**: verde **Aprovado** quando nenhuma verificação falha nem gera alerta, âmbar **Aviso** quando pelo menos uma verificação gera alerta, vermelho **Reprovado** quando alguma verificação falha.

<div class="note">
<strong>Perfis analisados parcialmente:</strong> se um perfil estiver danificado a ponto de o validador só conseguir lê-lo estruturalmente, aparece uma faixa de aviso e só as abas <strong>Cabeçalho</strong> e <strong>Tags</strong> ficam disponíveis — Validação, Análise, XML e JSON ficam ocultas, porque o perfil não deve ser aplicado.
</div>

### 3.1 Cabeçalho {#3-1-header src=45c71bd0}

Uma tabela de duas colunas com todos os campos do cabeçalho binário de 128 bytes do perfil ICC. Os valores são decodificados em texto legível (assinaturas expandidas, datas formatadas, valores de ponto fixo convertidos) usando o `CIccInfo` da IccProfLib. O **ID do perfil** (hash MD5 do cabeçalho) aparece em uma faixa destacada no topo.

### 3.2 Tags {#3-2-tags src=90f22730}

Uma grade de seis colunas com todas as tags do diretório de tags do perfil:

| Coluna | Significado |
|---|---|
| `#` | Posição no diretório (a partir de 1) |
| `Name` | Nome longo legível (p. ex. `profileDescriptionTag`) |
| `ID` | Assinatura de 4 caracteres (p. ex. `desc`) |
| `Offset` | Deslocamento em bytes a partir do início do arquivo |
| `Size` | Tamanho em bytes dos dados da tag |
| `Pad` | Bytes de preenchimento entre esta tag e a seguinte |

A assinatura do **tipo** da tag (p. ex. `descType`, `mft2`, `mAB`) aparece junto com o deslocamento e o tamanho no topo da tag expandida.

As tags são ordenadas por deslocamento. A coluna **Preenchimento** usa cores — `Pad < 0` (tags sobrepostas, fora da conformidade) aparece em vermelho; `Pad > 3` (preenchimento acima da especificação) aparece em âmbar.

**Clique em qualquer linha** para expandi-la no lugar (um acordeão — uma tag aberta por vez). O detalhe expandido sempre termina com a descrição completa específica do tipo — equivalente a executar `CIccTag::Describe(verbosity = 100)` da IccProfLib. Para tags que contêm CLUTs ou curvas grandes (p. ex. `A2B0`, `B2A0`), isso inclui cada célula da grade ou ponto da curva.

Acima dessa descrição, as tags com dados visualizáveis mostram uma ou mais **visualizações embutidas**, cada uma em uma seção recolhível:

| Tipo de tag | Visualizações |
|---|---|
| Curvas tonais (`rTRC`/`gTRC`/`bTRC`/`kTRC`) | A curva de resposta tonal traçada contra a linha identidade; a tabela da curva fica recolhida abaixo. |
| Colorantes RGB (`rXYZ`/`gXYZ`/`bXYZ`) e ponto branco (`wtpt`) | Um diagrama de cromaticidade CIE 1931 com a primária correspondente (ou o ponto branco) destacada; os dados do colorante/ponto branco aparecem abaixo. |
| Transformações LUT (`A2B0–3`, `B2A0–3`, `gamt`, `pre0–2`) | Curvas tonais do lado de entrada e do lado de saída (sobrepostas, com cor por colorante e uma legenda para mostrar/ocultar traços); a grade da CLUT como imagem; a **imagem de gamut** (para a `gamutTag` do perfil, com cores — neutro = dentro do gamut, vermelho = fora do gamut); o **avaliador** (abaixo); e a tabela de dados brutos, recolhida. |
| Tabelas de cores nomeadas / colorantes (`ncl2`/`nmcl`/`clrt`/`clot`) | Uma dispersão das cores nos diagramas a\*b\* CIELAB (e xy CIE); as tabelas ficam recolhidas abaixo. |
| Pontos de código independentes de codificação (`cicp`) | **Pontos de código**: primárias de cor, características de transferência, coeficientes de matriz e o sinalizador de faixa completa, cada um nomeado como a ITU-T H.273 o define. Valores que a H.273 não atribui são sinalizados, assim como bytes reservados diferentes de zero. |
| Curva de ganho adaptativo (`headroomAdaptiveGainCurveTag`) | **Ganho para uma margem da tela**, mais **Curva de ganho** quando a tag armazena imagens alternativas. Veja *Curvas de ganho HDR (HAGC)* abaixo. |

<div class="note">
<strong>Dados malformados nunca são ocultados.</strong> Se uma curva ou outro elemento visualizável não passa na validação da IccProfLib — por exemplo, uma curva tonal com gama degenerado igual a 0 — a seção ainda renderiza o que for possível e mostra um aviso ⚠ com o motivo exato informado pela biblioteca, em vez de omitir o gráfico silenciosamente.
</div>

#### O avaliador de transformação {#the-transform-evaluator src=c70f94b4}

Para transformações LUT (tags `A2B*` / `B2A*` / de pré-visualização), a seção **Avaliar** aplica a transformação dessa tag específica a uma única cor que você informa, usando a IccProfLib diretamente — sem mecanismo de cor externo. A direção segue a tag (`A2B*` mapeia dispositivo → PCS; `B2A*` mapeia PCS → dispositivo), e a intenção de renderização é implícita na tag (`…0` perceptual, `…1` colorimétrica relativa, `…2` saturação).

- Informe a entrada como valores de **ponto flutuante** (canais do dispositivo, ou PCS em unidades Lab/XYZ legíveis) ou, quando a tag tem uma CLUT, pelo índice de **ponto da grade** (a posição de um nó na grade).
- A saída aparece em **ambas** as formas: a codificação interna normalizada 0–1 e unidades legíveis (Lab/XYZ para um resultado em PCS).

A tag de gamut (`gamt`) não tem avaliador — é um mapa de um canal dentro/fora do gamut, e não uma transformação invertível; em vez disso, aparece sua imagem de gamut.

### 3.3 Validação {#3-3-validation src=b72d6c69}

Executa a lista de verificação do **ICC Profile Assessment Working Group** no perfil carregado e a mostra como relatório. As verificações vêm da ferramenta `iccPawgReport` do iccDEV, compilada em um módulo WebAssembly separado que só é baixado na primeira vez que você abre esta aba. (O mesmo relatório alimenta o selo de validade na barra de título, e pode ser acessado ao abrir por URL tanto como `VAL` quanto pelo código legado `PAWG`.)

Cada verificação é agrupada em **Segurança**, **Conformidade** ou **Qualidade** e recebe um veredito. Perfis com conteúdo HDR ganham um quarto grupo, **HDR**. A primeira verificação desse grupo informa se o perfil é um **HDR ColorSpace Profile** do ICC.1 em conformidade (cláusula 8.7.1), e as demais verificam os metadados HDR de que essa cláusula depende. Os vereditos aparecem no relatório em inglês:

| Veredito | Significado |
|---|---|
| **Pass** | A verificação foi bem-sucedida (no selo de validade: **Aprovado**) |
| **Warn** | Um problema não fatal que merece revisão (no selo de validade: **Aviso**) |
| **Fail** | O perfil não atende à verificação (no selo de validade: **Reprovado**) |
| **Gap** | Não foi possível avaliar a verificação por completo (p. ex. ainda não implementada) |
| **N/A** | A verificação não se aplica a este perfil |
| **Not Run** | A verificação foi ignorada |

A linha de resumo no topo contabiliza cada veredito em uma etiqueta colorida. **Clique em uma etiqueta para filtrar** o relatório abaixo — um halo azul marca as categorias exibidas no momento, e as etiquetas com zero itens ficam inativas. Por exemplo, desative **Pass** e **N/A** para se concentrar apenas nos Warn e Fail.

### 3.4 Análise {#3-4-analysis src=9478bc94}

Análises de qualidade do perfil inteiro, derivadas das transformações de cor do perfil — calculadas por um módulo WebAssembly dedicado (o mecanismo de visualização do iccDEV), que só é baixado na primeira vez que você abre esta aba, e traçadas no estilo do próprio app.

Cada análise é uma seção recolhível, e **todas começam fechadas**. Isso é proposital: cada seção custa uma passada completa de transformação pelo perfil, então abrir uma delas é uma escolha explícita sua, em vez de seis análises dispararem no momento em que você troca de aba. Os resultados ficam em cache, então reabrir uma seção é instantâneo. Uma seção que não se aplica ao perfil carregado mostra, em vez disso, uma breve nota de *não aplicável* (por exemplo, um perfil de tela matriz/TRC não tem CLUTs dispositivo↔PCS para analisar).

#### Estatísticas do perfil {#profile-statistics src=f2d4f2db}

Métricas do perfil inteiro para **uma** intenção de renderização selecionada, controladas por duas listas e uma caixa de seleção:

- **Intenção de renderização** — Perceptual / Colorimétrico relativo / Saturação / Colorimétrico absoluto.
- **Tipo de ida e volta** — qual métrica de precisão informar (veja abaixo).
- **Usar tags MPE (cor)** — desmarcada = as tabelas de consulta colorimétricas; marcada = as tags de elementos multiprocessamento / de cor. Não tem efeito na visão geral dentro do gamut, onde fica desativada.

A tabela mostra o **volume do gamut** (em ΔE\*ab³, delimitado pela transformação dispositivo → PCS `A2B`, medido voxelizando o limite e contando as células internas) junto com o **mín. / média / desvio padrão / P90 / máx.** do ΔE\*ab da ida e volta selecionada. Abaixo dela fica um histograma da distribuição do ΔE — barras de frequência relativa com uma linha de frequência cumulativa — mais o `L, a, b` de pior erro e, para PRMG, se o perfil implica o Perceptual Reference Medium Gamut.

Os quatro tipos de ida e volta:

- **Visão geral dentro do gamut (RT0)** — uma grade de valores do dispositivo levada ao PCS, de volta ao dispositivo e ao PCS outra vez; o ΔE\*ab é medido entre as duas passagens pelo PCS. Uma verificação rápida de estabilidade dentro do gamut.
- **Inversão + gamut (RT1)** — ΔE\*ab entre o PCS de cada cor do dispositivo e o seu PCS após uma ida e volta Lab → dispositivo → Lab. Reflete a precisão da inversão *e* o mapeamento de gamut.
- **Reprodutibilidade (RT2)** — ΔE\*ab entre a primeira e a segunda ida e volta: quão estável é uma ida e volta repetida, independentemente do recorte de gamut da primeira.
- **Interoperabilidade PRMG** — cores do PCS dentro do Perceptual Reference Medium Gamut submetidas a uma ida e volta; a distribuição do ΔE indica a interoperabilidade entre perfis.

Abaixo do histograma, **ΔE de ida e volta por luminosidade** responde à pergunta que os números do resumo não respondem: *onde* na escala tonal a inversão tem dificuldade, e *até que ponto do gamut* o problema chega.

Ele amostra 32 níveis de luminosidade. Em cada nível, toma 64 pontos **no limite do gamut** e depois os repete deslocados em direção ao eixo neutro a 80 %, 50 % e 20 % do seu croma — 8.192 pontos ao todo, cada um traçado individualmente, com separadores pontilhados entre os níveis.

Leia faixa por faixa. Dentro de uma faixa, os pontos vão da superfície do gamut, à esquerda, até o neutro, à direita, então o erro deve **diminuir** ao longo da faixa: as cores perto do limite são as mais difíceis de inverter, e as perto do neutro, as mais fáceis. Uma faixa cujo erro continua alto até o neutro indica um perfil com problemas naquela luminosidade. Os picos mais altos marcam os níveis de luminosidade em que o próprio limite do gamut é invertido com menos precisão.

Todas as amostras estão dentro do gamut por construção, então o que você vê é uma discordância real entre `B2A`/`A2B`, e não cores recortadas por serem inalcançáveis. Observe que este gráfico tem sua **própria** amostragem — propositalmente concentrada no limite do gamut —, por isso sua média e seu máximo são mais altos que os da tabela acima e não são comparáveis com eles. Ele segue a intenção de renderização, mas não o tipo de ida e volta.

Um perfil sem as transformações dispositivo↔PCS de que uma métrica precisa mostra uma nota de *não aplicável*; um espaço de dispositivo amplo demais para amostrar é informado como ignorado, e não como erro.

#### Colorimetria dos extremos {#extrema-colorimetry src=be6c9597}

As pontas da faixa de reprodução do perfil — os números que um operador de impressão costuma ler primeiro.

- **Ponto branco** — a cor com **zero de colorante**, ou seja, o substrato sem tinta.
- **Ponto preto** — obtido passando o preto do PCS (L\*=0, a\*=b\*=0) pela tabela `B2A` selecionada para obter a tintagem que o perfil *escolhe* para o preto e, em seguida, lendo essa tintagem de volta pela `A2B1`.
- Ambos aparecem em colorimetria **relativa** e **absoluta**. A absoluta mostra a cor do próprio substrato (um papel branco-azulado aparece como algo em torno de L\* 95, b\* −4); a relativa o referencia novamente a um branco perfeito. Se as duas colunas forem idênticas, isso é normal — o branco da mídia simplesmente coincide com o iluminante. Um perfil sem a tag de ponto branco da mídia mostra apenas a relativa.
- **Tintagem no ponto preto** e **TAC** — a tinta por canal nesse preto e a soma delas: a cobertura total de área, o número do limite de tinta.

Como cada tabela `B2A` escolhe sua própria tintagem para o preto, o ponto preto realmente difere entre as intenções — daí o seletor de intenção de renderização.

Abaixo disso, **Tinta plena vs croma máximo**: para cada canto de tinta (C, M, Y, R, G, B e K), onde ele cai em matiz / croma / luminosidade, e o ponto mais cromático encontrado no caminho até ele a partir do substrato sem tinta. Essas linhas são medidas pela `A2B1` e por isso **não mudam com o seletor de intenção**. Em um perfil bem-comportado as duas linhas coincidem. Quando o croma máximo chega *antes* da tinta plena, a linha é sinalizada: a partir desse ponto a tinta adicional já não acrescenta croma, só escurece.

**Somente perfis de saída (impressora)** — a análise pressupõe que zero de colorante significa substrato sem tinta. A tabela por matiz também precisa de um espaço de dispositivo **CMYK ou CMY**: um perfil de n cores (nCLR) nomeia seus canais em qualquer ordem, então não há como saber qual canal é o "ciano", e a tabela informa isso em vez de adivinhar.

#### Tintagem do eixo neutro {#neutral-axis-inking src=aa5449e4}

Percorre o eixo neutro (a\*=b\*=0) do branco (L\*=100) até o preto (L\*=0) pela tabela `B2A` (PCS → dispositivo) do perfil e traça quanto de cada colorante do dispositivo o perfil aplica ao longo do caminho — a clássica curva de GCR / composição do neutro. Uma curva por canal do dispositivo, com cor por colorante.

Uma curva adicional é traçada sobre a separação:

- **L\* de saída (tom)** — a resposta tonal: onde o eixo neutro realmente cai em luminosidade após uma ida e volta pelo perfil. Observe duas coisas na forma dela. Um afundamento abaixo da diagonal significa que os cinzas saem mais escuros do que o solicitado. Mais útil ainda, a curva **se achata na luminosidade mais escura que o perfil consegue alcançar** — esse patamar *é* o ponto preto da mídia, e ele deve concordar com a seção Colorimetria dos extremos acima.

**Somente perfis de saída (impressora)**; as demais classes de perfil mostram uma nota.

#### Uso de tinta nas sombras {#ink-usage-in-shadows src=e62016b7}

Quatro percursos retos pelo plano a\*b\* em uma luminosidade constante e propositalmente escura — 0°, 45°, 90° e 135° — passados pela tabela `B2A` selecionada, com a separação resultante traçada para cada um.

Como todas as amostras de um percurso têm o mesmo L\*, qualquer salto ou inversão brusca em um colorante vem apenas do tratamento de matiz e croma. Essa é a marca de um artefato de mapeamento de gamut nas sombras, o tipo de coisa que aparece na impressão como banding ou uma mudança repentina de cor nas áreas escuras. Os percursos vão de bem fora do gamut, atravessam-no e saem pelo outro lado, então você também vê onde o perfil começa a limitar.

O plano de luminosidade é escolhido automaticamente: a meio caminho entre o canto Azul do perfil e o mais escuro entre C, M, Y, R e G. Para as tabelas perceptual e de saturação, a luminosidade é antes esticada do ponto preto da mídia até o preto do PCS — essas tabelas esperam o preto ali —, e a seção informa tanto o plano compensado quanto o original.

**Somente perfis de saída (impressora)**, com a mesma restrição a CMYK/CMY da tabela por matiz acima (o plano é derivado dos cantos de tinta).

#### Caminhos de entintamento primário pelo neutro {#primary-inking-paths-through-neutral src=cb510c25}

Três caminhos — Ciano→Vermelho, Magenta→Verde, Amarelo→Azul — cada um partindo de um canto primário, **passando pelo eixo neutro** na luminosidade média de suas duas extremidades, até o canto oposto, passados pela tabela `B2A` selecionada e traçados como uma separação.

Esta é a contrapartida dentro do gamut do Uso de tinta nas sombras. Lá, os percursos passam propositalmente por fora do gamut para expor artefatos de mapeamento de gamut; aqui, **todas as amostras estão dentro do gamut por construção** — as duas extremidades são as próprias primárias do perfil e o pivô fica no eixo neutro. Assim, um salto, uma dobra ou uma inversão em um colorante ao longo de um desses caminhos não pode ser atribuído ao recorte de gamut: é um defeito de suavidade da CLUT. O pivô neutro fica no meio de cada gráfico, onde você deve ver uma composição neutra equilibrada.

Para as tabelas perceptual e de saturação, a luminosidade recebe compensação do ponto preto conforme a intenção, exatamente como no Uso de tinta nas sombras.

**Somente perfis de saída (impressora)**, com a mesma restrição a CMYK/CMY (os cantos vêm da mesma fonte que a tabela por matiz).

#### Estatísticas de uso de tinta {#ink-usage-statistics src=191fd7cd}

Quanto de cada colorante o perfil aplica, como cobertura média e como **parcela do total** — a assinatura de consumo de tinta da separação.

A tabela soma cada colorante ao longo do eixo neutro e informa sua cobertura média e sua porcentagem de toda a tinta aplicada. A coluna de parcela é o diagnóstico: ela é a impressão digital da composição do neutro do perfil (um equilíbrio de cinza carregado em ciano se lê de forma diferente de um carregado em preto) e independe de quantas amostras foram tomadas.

Uma segunda tabela — o uso de tinta em **todas as cores no limite e dentro do gamut** — aparece como *pendente*: ela precisa de uma construção do limite do gamut que ainda não foi implementada.

**Somente perfis de saída (impressora).**

#### Imagem CLUT {#clut-image src=a3fec568}

A tabela de consulta de cores de uma transformação dispositivo↔PCS, organizada em blocos como uma imagem, com um seletor da tabela de intenção de renderização a exibir (`A2B0`–`A2B3`, `B2A0`–`B2A3` e as tabelas de pré-visualização). Útil para identificar de relance danos estruturais em uma tabela. Use os controles no canvas para aproximar, mover e redefinir.

Quando você seleciona uma **tabela `B2A` (PCS → dispositivo)**, uma **imagem de cobertura de tinta em tons de cinza para cada colorante** aparece abaixo da grade — as separações por tinta, em que mais escuro significa mais daquela tinta. Uma dica no topo da seção aponta para elas, já que a seção abre em uma tabela `A2B` (cuja saída é L\*a\*b\*, não tintas). Para uma **saída de n cores (nCLR)** — de 5, 6 ou 7 cores —, em que não existe uma pré-visualização de cor simples, a imagem principal é **gerenciada em cor pela `A2B` direta do perfil**, de modo que ainda aparece em cores reais, e não em um cinza de canal único.

#### Imagem de gamut {#gamut-image src=92f58c0f}

O mapa dentro/fora do gamut da tag de gamut: neutro onde uma cor do PCS é reproduzível, vermelho onde ela fica fora do gamut do dispositivo. Só aparece quando o perfil tem uma tag `gamt`.

### 3.5 XML {#3-5-xml src=dfd43c4e}

Converte o perfil em XML (pela IccLibXML, o mesmo gravador usado pela CLI `iccToXml` do iccDEV) e o mostra em um editor CodeMirror com realce de sintaxe. Edite o XML e clique em **Converter para ICC** para voltar ao binário; o visualizador valida de novo e o botão **Salvar perfil ICC** na barra da aba Perfil baixa o resultado.

Um indicador de **alteração pendente** aparece quando o texto do editor difere da última saída do conversor, para que você veja de relance se suas edições já foram aplicadas. Se a conversão falhar, o erro de análise da IccLibXML aparece acima do editor com a linha / coluna problemática.

### 3.6 JSON {#3-6-json src=59c3f2e5}

A mesma ideia da aba XML, mas usando uma representação JSON do perfil produzida pelo wrapper do validador (`json-wrapper.cpp`). Edite, clique em **Converter para ICC** e salve. A forma JSON é mais compacta e mais fácil de usar em scripts; a forma XML é mais familiar se você já usou as ferramentas de linha de comando do iccDEV.

---

## 4. Aba Vincular {#4-combine-tab src=735d6198}

O profiletool mantém todos os perfis carregados em um **Conjunto de perfis** à esquerda. No topo há cinco abas — **Perfil** (o visualizador de um único perfil descrito acima), **Comparar**, **Vincular**, **Espectral** e **HDR**. A aba **Vincular** é onde você encadeia perfis e os coloca em uso: crie um **DeviceLink**, **transforme uma imagem** ou **transforme um conjunto de dados de cor** pela cadeia.

### 4.1 Montar uma cadeia {#4-1-building-a-chain src=83ab772c}

Arraste um ou mais perfis do conjunto para o cartão Vincular para adicioná-los à cadeia, em ordem. A cadeia é uma **pilha vertical**: a origem fica no topo, o destino embaixo. Cada perfil contribui com **uma transformação**, e a ferramenta mostra o espaço de cor que entra e sai dela (p. ex. `RGB → Lab`), com o **espaço de conexão** indicado na linha entre as etapas. O mecanismo valida a cadeia inteira em tempo real e informa o fluxo de ponta a ponta (p. ex. *Cadeia: RGB → CMYK*) ou explica, etapa por etapa, onde a conexão falha.

- **Reordene** uma etapa arrastando sua alça (`⠿`) ou com os botões ▲ / ▼; remova uma com ×.
- **Inverter a direção** — o botão ⇅ da primeira transformação inverte a direção da cadeia, propagando a mudança pelas etapas seguintes.
- **Intenção de renderização** — escolha uma para a cadeia inteira com *Intenção de renderização (todas)* ou substitua a de uma etapa com a lista dela. Passe o mouse sobre qualquer um dos controles para ver a descrição da intenção selecionada. Além das quatro intenções básicas, um perfil que tenha as tabelas necessárias também oferece as variantes *no D2Bx/B2Dx* e *+ BPC* (compensação do ponto preto).

<div class="note">
<strong>Perfil HDR ColorSpace na cadeia.</strong> Um HDR ColorSpace Profile do ICC.1 não tem tags TRC — a cláusula 8.7 não define nenhuma para um perfil ColorSpace —, então uma transformação por ele usa sua <code>AToB0Tag</code>. Essa tabela é a renderização HDR&#8594;SDR que a cláusula 8.7.1.5 exige para software sem processamento HDR. O cartão avisa isso quando uma cadeia contém um HDR ColorSpace Profile: o DeviceLink, a imagem ou os dados que você produz refletem essa alternativa SDR, e não o comportamento HDR do perfil.
</div>

### 4.2 Criar DeviceLink {#4-2-make-devicelink src=2cb72a0d}

Consolida a cadeia inteira em um único perfil **DeviceLink** (uma versão para navegador do `iccApplyToLink` do iccDEV). Dê um nome e clique em **Criar DeviceLink**; o resultado vai para o conjunto e para o acumulador de Vincular como qualquer outro perfil, pronto para ser inspecionado na aba Perfil ou reutilizado em outra cadeia.

### 4.3 Transformar imagem {#4-3-transform-image src=461fcd83}

Solte uma imagem raster (TIFF, PNG ou JPEG) no espaço de imagem e clique em **Transformar imagem** para passá-la pela cadeia (uma versão para navegador do `iccApplyProfiles`). A imagem é primeiro validada por uma sondagem só do cabeçalho — seu espaço de cor precisa corresponder à entrada da cadeia. O resultado é **baixado**; as imagens nunca são guardadas no conjunto.

Quando uma imagem válida é carregada, aparece um painel **Opções de saída de imagem** com os controles de destino que espelham a CLI `iccApplyProfiles`:

- **Codificação** — *Igual à origem*, 8 bits, 16 bits ou **Flutuante (32 bits)**.
- **Compressão** — Nenhuma, **LZW** ou **ZIP** (Deflate).
- **Planar** — planos **Composto** (intercalado) ou **Separado**.
- **Interpolação CMM** — **Tetraédrica** ou **Linear**.
- **Incorporar ICC** — marca a saída com o último perfil da cadeia (o do espaço de saída).

O padrão mantém a saída RGB/Gray como PNG; escolher um controle exclusivo de TIFF (flutuante, LZW/ZIP ou planos separados) muda o contêiner para TIFF.

<div class="note">
<strong>Perfis incorporados:</strong> se a imagem solta tiver um perfil ICC incorporado, uma faixa oferece <strong>extraí-lo</strong> — o perfil é adicionado ao conjunto e colocado no início da cadeia (seu espaço de origem) com um clique.
</div>

### 4.4 Transformar dados {#4-4-transform-data src=96934eec}

Solte um conjunto de dados de cor (CGATS/IT8, CSV, CxF ou JSON) no espaço de dados e clique em **Transformar dados** para passar cada patch pela cadeia (o equivalente ao `iccApplyNamedCmm`). A ferramenta lê os tipos de dados do conjunto (dispositivo / Lab / XYZ / espectral) e fornece o que a entrada da cadeia precisa; uma entrada **espectral** é convertida em colorimetria com a calculadora canônica do iccDEV, usando o **Observador** e o **Iluminante** que você escolher. Patches duplicados podem ser filtrados (mediana ou média). O resultado abre em uma tabela que você pode **Salvar** como CSV.

### 4.5 Mudança de observador {#4-5-observer-change src=738ba4d4}

A aba Vincular tem **dois** cartões criadores. Acima do Fluxo de vinculação, o cartão **Mudança de observador** cria um perfil de tela matriz/TRC v4.3 a partir de um perfil de tela RGB V5 e de um perfil de observador V5 (PCC). Arraste os dois para o cartão — eles são encaminhados automaticamente para os espaços **Tela RGB V5** e **Observador V5 (PCC)** de acordo com a classe do perfil —, depois clique em **Criar perfil de tela V4**, dê um nome e clique em **Criar**. O resultado entra no conjunto e nesta aba. Um perfil que não seja nenhum dos dois é ignorado com um aviso.

### 4.6 Abas Comparar e Espectral {#4-6-compare-and-spectral-tabs src=b934d7e3}

A aba **Comparar** sobrepõe os limites de gamut de dois ou mais perfis do conjunto — um invólucro 3D mais um corte 2D por luminosidade — para mostrar onde eles diferem. Quando os perfis são HDR ColorSpace Profiles, uma nota **Mostrando o fallback SDR** explica que cada gamut é construído a partir da renderização SDR da `AToB0Tag`, e não da faixa HDR do perfil, que não pode ser desenhada em um PCS limitado. A aba **Espectral** monta um conjunto de imagens espectrais de um canal (soltas na ordem dos canais) em um único TIFF multicanal (`iccSpecSepToTiff`).

## 5. Edição com ida e volta {#5-round-trip-editing src=595f380b}

As abas XML e JSON podem gravar o perfil de volta em binário ICC. O fluxo típico:

1. **Carregue** um perfil ICC.
2. Abra a aba **XML** ou **JSON**. Clique em **Converter para XML** / **Converter para JSON** para preencher o editor.
3. **Edite** no editor da página. Um indicador de alteração pendente aparece ao lado da barra de ferramentas.
4. Clique em **Converter para ICC**. O wrapper cria um novo perfil, executa a validação de novo e atualiza as abas Cabeçalho / Tags / Validação.
5. Um indicador **● Modificado — não salvo** aparece ao lado do nome do arquivo na barra da aba Perfil.
6. Clique em **Salvar perfil ICC**. Os bytes editados são baixados como `<original>-edited.icc`.

Os dois editores são independentes — editar o XML e depois o JSON não mistura os dois caminhos. O que é salvo são os bytes ICC produzidos mais recentemente.

<div class="note">
<strong>Ressalva:</strong> a fidelidade da conversão depende do que a IccLibXML / o wrapper JSON suporta para cada tipo de tag. Se um tipo de tag não puder ser representado, a ida e volta perderá detalhes; confira a aba Validação depois da conversão de volta para garantir que tudo ainda é analisado sem erros.
</div>

A aba Tags destaca qualquer tag cujos bytes diferem dos carregados originalmente, para facilitar ver o que suas edições mudaram.

---

## 6. Abrir a partir do chardata {#6-launching-from-chardata src=b39a6805}

No **chardata**, depois de carregar um perfil ICC, clique em **Mostrar arquivo** para abrir o visualizador na página e depois em **Abrir editor**. Uma nova aba se abre aqui com `?source=chardata` na URL.

A transferência acontece inteiramente no navegador:

1. O profiletool abre, detecta `?source=chardata` e envia `{type:'profiletool:ready'}` para `window.opener` via `postMessage`.
2. O chardata responde com `{type:'profiletool:load', filename, bytes}`.
3. O profiletool aceita os bytes (depois de verificar a origem do remetente contra uma lista de permissões e o tamanho contra o limite de 256 MB), executa a validação e mostra o perfil.

Sem upload, sem ida e volta ao servidor. O fluxo é de mão única — as edições feitas aqui são salvas clicando em **Salvar perfil ICC**, e não devolvidas ao chardata.

---

## 7. Abrir com uma URL {#7-launching-with-a-url src=f9a8d871}

Você pode abrir a ferramenta com um link que indica um perfil a carregar — e a aba a exibir — usando um **fragmento de URL** (a parte depois do `#`):

```
https://chardata.colourbill.com/profiletool#url=<profile-url>&tab=<tab>
```

Os dois parâmetros são opcionais:

- **`url=`** — o endereço web de onde o perfil é baixado. Os bytes são baixados no seu navegador e depois passam exatamente pelo mesmo caminho de um arquivo local: a verificação de cabeçalho `acsp`, o `ValidateIccProfile` completo, o limite de tamanho de 256 MB e a alternativa de melhor esforço para perfis que não podem ser analisados. Nada é enviado — os bytes baixados alimentam apenas o validador e nunca são reenviados.
- **`tab=`** — qual visualização abrir depois que o perfil for carregado.

Um exemplo completo:

```
https://chardata.colourbill.com/profiletool#url=https://example.org/profiles/sRGB.icc&tab=VAL
```

<div class="note">
<strong>Por que um fragmento, e não uma query string?</strong> A parte depois do <code>#</code> nunca é enviada a um servidor web, então o endereço do perfil que você está inspecionando fica no seu próprio computador.
</div>

### Nomes das abas {#tab-names src=d3a4dbae}

`tab=` aceita dois esquemas de nomes intercambiáveis, sem distinção entre maiúsculas e minúsculas. Os códigos **curtos** são a forma preferida:

| Visualização | Código curto | Nome longo |
|---|---|---|
| Cabeçalho | `HEADER` | `Header` |
| Tags | `TAGS` | `Tags` |
| Validação | `VAL` | `Validation` |
| Análise | `ANALYSIS` | `Analysis` |
| XML | `XML` | `XML` |
| JSON | `JSON` | `JSON` |

Os nomes longos são os rótulos das abas em inglês, sem os espaços. Os dois esquemas são mantidos estáveis mesmo que os rótulos visíveis sejam renomeados, para que os links existentes continuem funcionando. A aba Validação também responde ao código legado `PAWG` (ela antes se chamava "Profile Assessment WG"). Um valor de `tab=` não reconhecido é ignorado e a visualização Cabeçalho é aberta.

<div class="note">
<strong>Requisitos para <code>url=</code>:</strong> o perfil precisa ser servido por <strong>HTTPS</strong>, e o servidor que o hospeda precisa permitir leituras de origem cruzada (um cabeçalho <code>Access-Control-Allow-Origin</code> / CORS permissivo). Se faltar qualquer um dos dois, o navegador bloqueia o download e a ferramenta mostra um erro de busca. Se a própria URL do perfil contiver <code>&</code> ou <code>#</code> (sua própria query string), aplique percent-encoding ao valor inteiro de <code>url=</code> para que esses caracteres não encerrem o fragmento antes da hora.
</div>

---

## 8. Dispositivos móveis {#8-mobile src=cb948e3c}

Em telas com menos de 700 px de largura:

- O painel de configurações vira uma gaveta que desliza a partir da direita.
- Um botão flutuante **⚙** no canto superior direito abre / fecha as Configurações.
- Um botão **?** abaixo do ⚙ abre este guia em seu painel deslizante.
- Um botão **✉** abre o formulário de contato em uma nova aba do navegador.
- Tocar no fundo escurecido fecha a gaveta aberta.
- A tabela de tags passa de uma grade larga para cartões empilhados, para que todas as colunas continuem legíveis sem rolagem horizontal; uma tag ainda se expande no lugar.
- **O toque substitui o arrastar e soltar.** O iOS não tem arrastar e soltar, então arrastar um perfil do conjunto para uma aba não funciona ali. Em vez disso, **toque nos perfis para selecioná-los e depois toque na aba** em que você os quer — o mesmo resultado do arrasto. O conjunto mostra esse lembrete enquanto uma tela sensível ao toque está em uso.
- **No iPhone e no iPad, os seletores de arquivo listam todos os arquivos.** O iOS compara um filtro de tipo de arquivo com os tipos que conhece, e não conhece nenhum para `.icc`, `.icm`, `.cube` ou `.exr`, então o filtro deixaria em cinza exatamente os arquivos que você quer abrir. Escolha o perfil pelo nome; qualquer coisa que não seja um perfil ainda é recusada com um motivo depois de carregada.

Todos os recursos estão disponíveis; o layout se adapta à tela menor.

---

## 9. Limites e segurança {#9-limits-and-security src=ce1e9474}

O profiletool não faz nenhuma requisição de rede depois do carregamento inicial da página. O validador, o conversor XML, o conversor JSON e os codecs de imagem são todos WebAssembly compilado a partir de código C++ e rodam inteiramente no lado do cliente. A aba HDR mostra uma imagem solta por meio de uma URL de objeto local, então a imagem nunca sai da aba. **Identificar telas** pergunta ao navegador, e não a um servidor, em qual monitor a janela está.

| Limite | Onde | Observações |
|---|---|---|
| **256 MB** | postMessage / carregamento de arquivo | Recusa carregar qualquer coisa maior; evita o esgotamento do heap por uma janela de origem mal-intencionada |
| **32 MB** | Conversores XML e JSON | Tanto a proteção em JS (`MAX_XML_BYTES` / `MAX_JSON_BYTES`) quanto os wrappers C++ (`kMaxXmlBytes` / `kMaxJsonBytes`) aplicam esse limite; o lado C++ tem autoridade própria e independente |
| **Proteção contra bombas de entidades XML** | Conversor XML | Qualquer XML que contenha `<!DOCTYPE` ou `<!ENTITY`, ou um byte NUL, é rejeitado antes de chegar à libxml2. Os próprios limites de expansão de entidades da libxml2 também estão ativos, então esta é uma segunda camada de defesa contra entradas do tipo billion laughs |
| **512 MB** | Arquivo da aba HDR | Verificado pelo tamanho do arquivo antes de qualquer parte dele ser lida; espelha o próprio limite de entrada de 512 MB dos codecs de imagem |
| **40 megapixels**, **64 pixels por byte** | Decodificação Radiance HDR (aba HDR) | Ambos verificados a partir do cabeçalho e do tamanho do arquivo antes de alocar qualquer memória para pixels; o segundo recusa bombas de descompressão com marcadores de repetição |
| **Orçamento de decodificação EXR** | Decodificação OpenEXR | Largura × altura × canais × 4 bytes precisa caber em 512 MB, verificado a partir do cabeçalho antes que o decodificador aloque qualquer coisa |
| **Percurso de caixas HEIC/AVIF** | Extração de perfil | Os tamanhos das caixas são verificados sem overflow, o aninhamento é limitado a 8, um perfil a 64 MB (por arquivo, no total) e as associações de itens a 65 536 |
| **Lista de origens permitidas** | Abertura via postMessage | Somente a mesma origem e as origens de desenvolvimento do chardata podem enviar bytes `profiletool:load` |
| **HTTPS + CORS** | Abertura via `#url=` | Um perfil aberto por URL precisa ser servido por HTTPS a partir de um host que permita leituras de origem cruzada; os bytes baixados alimentam apenas o validador e nunca são reenviados |

A abertura via `#url=` (adicionada na versão 1.1.5) é o único caso em que a ferramenta faz uma requisição para outra origem depois do carregamento da página: ela amplia o `connect-src` da Content-Security-Policy para `https:` para que o perfil indicado possa ser baixado. O carregamento de scripts **não** é ampliado — apenas as buscas de dados.

Se você precisar inspecionar um perfil que excede esses limites, compile o iccDEV a partir do código-fonte e use as ferramentas de linha de comando nativas — elas não têm os limites do lado JS.

### Licença {#licence src=e7a2a884}

O profiletool é distribuído sob a Licença MIT. O app também inclui componentes de terceiros sob suas próprias licenças: a IccProfLib do iccDEV (International Color Consortium), LibTIFF, libpng, zlib, libxml2, JSON for Modern C++, o runtime do Emscripten e pacotes JavaScript, entre eles React, Plotly e CodeMirror. Este software se baseia em parte no trabalho do Independent JPEG Group. Os avisos completos estão em [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt).

### Cobertura do ICC.2 (iccMAX) {#icc-2-iccmax-coverage src=3d2b33e8}

Tanto perfis **ICC.1** quanto **ICC.2** são suportados, mas a cobertura do ICC.2 está **incompleta**. O carregamento, as visualizações de cabeçalho e de tags, a validação, a ida e volta XML/JSON e os mecanismos de transformação entendem ICC.2; as lacunas conhecidas são os fluxos de intercâmbio **ICS** com várias partes, a escolha de um **subperfil** V5 ao aplicar uma transformação e a busca inversa em alguns perfis ICC.2. Um perfil que usa uma construção ICC.2 não suportada é informado pela aba Validação, em vez de ser lido incorretamente sem aviso.
