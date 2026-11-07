<!-- (c) 2026 William Li -->

<!-- it translation of MANUAL.md. Translate the text; keep every {#anchor src=…} exactly as it is. -->

# ICC Profile Tool — Manuale utente {#icc-profile-tool-user-manual src=38bba1de}

**ICC Profile Tool** (profiletool; nell'interfaccia italiana **Strumento per profili ICC**) è uno strumento basato sul browser per ispezionare, convalidare e modificare in round-trip i profili colore **ICC.1** e **ICC.2 (iccMAX)**. Funziona interamente nel browser — nessun caricamento su server, nessuna installazione — grazie a una build WebAssembly di [iccDEV](https://github.com/InternationalColorConsortium/iccDEV), l'implementazione dimostrativa ufficiale di IccProfLib dell'ICC.

**Cosa puoi fare:**

- **Esaminare l'intestazione** — ogni campo dell'intestazione del profilo da 128 byte, decodificato in stringhe leggibili.
- **Esaminare la directory dei tag** — ogni tag con firma, tipo, offset in byte, dimensione e byte di riempimento. Fai clic su un tag per espandere la descrizione completa specifica del tipo (lo stesso output della vista "Describe" di `wxProfileDump` di iccDEV) e — per i tag che ne hanno una — una **visualizzazione** in linea: curve di risposta tonale, diagrammi di cromaticità, immagini CLUT e del gamut, grafici a dispersione dei colori nominali, più un **valutatore della trasformazione** su un singolo punto.
- **Convalidare** — eseguire la checklist dell'ICC Profile Assessment Working Group (Sicurezza / Conformità / Qualità), con un esito per ogni controllo e un filtro per categoria.
- **Modificare in round-trip** — convertire il profilo in XML o JSON, modificarlo nell'editor di codice integrato, riconvertirlo in ICC e convalidarlo di nuovo. Il pulsante di salvataggio scarica il file binario modificato.
- **Concatenare profili** — nella scheda **Collega**, trascina i profili del pool in una catena ordinata, poi convertila in un **DeviceLink**, **trasforma un'immagine** attraverso di essa (con pieno controllo su codifica di output, compressione, disposizione planare e incorporamento ICC) oppure **trasforma un set di dati colore**.
- **Lavorare con l'HDR** — verificare un profilo rispetto alle regole ICC.1 per gli HDR ColorSpace Profile (clausola 8.7.1), leggerne i punti di codice cICP e tracciarne la curva di guadagno adattiva a qualsiasi margine (headroom) del display. La scheda **HDR** mostra un'immagine HDR sul tuo display e **Impostazioni → Ambiente** riporta che cosa sanno fare questo browser e questo display.
- **Avviare da chardata** — aprire qui direttamente un profilo caricato in [chardata](https://chardata.colourbill.com/), con i byte trasferiti all'interno del browser tramite `postMessage`.
- **Avviare con un URL** — aprire un link che indica allo strumento un profilo ospitato sul web e, facoltativamente, la scheda su cui arrivare (ad es. `…/profiletool#url=…&tab=VAL`).

Tutto viene eseguito lato client. I byte del profilo non lasciano mai la scheda del browser.

<div class="note">
<strong>Il supporto ICC.2 (iccMAX) è parziale.</strong> I profili ICC.2 si caricano, si ispezionano, si convalidano e supportano il round-trip come quelli ICC.1 — la checklist di convalida include controlli specifici per iccMAX, i PCS spettrali e i tag multi-processing-element vengono decodificati e i motori di trasformazione sono compilati sull'intero stack iccMAX. Non ancora coperti: i flussi di lavoro <strong>ICS</strong> (Interchange Color Space) in più parti, la selezione di un <em>sotto-profilo</em> V5 quando si applica una trasformazione e la ricerca inversa su alcuni profili ICC.2. Sono prevedibili lacune sulle funzioni ICC.2 più particolari; vengono colmate versione dopo versione.
</div>

<div class="note">
<strong>Il supporto degli HDR ColorSpace Profile segue una bozza.</strong> I controlli HDR, le viste di <code>headroomAdaptiveGainCurveTag</code> e la scheda HDR implementano l'emendamento HDR di ICC.1 nella sua forma attuale. L'emendamento non è ancora pubblicato, quindi alcuni dettagli potrebbero cambiare prima della pubblicazione.
</div>

---

## Indice {#contents src=54605fa3}

1. [L'area di lavoro](#1-the-workspace)
2. [Pannello Impostazioni](#2-settings-panel)
3. [Viste del profilo](#3-profile-views)
   - [Intestazione](#3-1-header)
   - [Tag](#3-2-tags)
   - [Convalida](#3-3-validation)
   - [Analisi](#3-4-analysis)
   - [XML](#3-5-xml)
   - [JSON](#3-6-json)
4. [Scheda Collega](#4-combine-tab)
   - [Costruire una catena](#4-1-building-a-chain)
   - [Crea DeviceLink](#4-2-make-devicelink)
   - [Trasforma immagine](#4-3-transform-image)
   - [Trasforma dati](#4-4-transform-data)
   - [Cambio di osservatore](#4-5-observer-change)
   - [Schede Confronta e Spettrale](#4-6-compare-and-spectral-tabs)
   - [Scheda HDR](#4-7-hdr-tab)
5. [Modifica round-trip](#5-round-trip-editing)
6. [Avvio da chardata](#6-launching-from-chardata)
7. [Avvio con un URL](#7-launching-with-a-url)
8. [Dispositivi mobili](#8-mobile)
9. [Limiti e sicurezza](#9-limits-and-security)

---

## 1. L'area di lavoro {#1-the-workspace src=4bc9350f}

profiletool è un **banco di lavoro multi-profilo**. La finestra è composta da tre parti:

- il pannello **Profili** a sinistra — il *pool* di tutto ciò che hai caricato;
- l'**area di lavoro** a destra, con cinque schede in alto — **Profilo**, **Confronta**, **Collega**, **Spettrale**, **HDR**;
- il pannello laterale **Impostazioni** sul bordo destro (vedi [Pannello Impostazioni](#2-settings-panel)).

### Caricare i profili {#loading-profiles src=2cd0f653}

Puoi caricare i file in due modi:

- Fai clic su **Carica profili** in cima al pannello Profili e scegli uno o più file, oppure
- **Trascina e rilascia** i file sul pannello Profili.

Puoi caricare profili `.icc` / `.icm` *e* immagini. Rilascia un file **TIFF, PNG, JPEG, HEIC o AVIF** e lo strumento ne estrae il **profilo ICC incorporato** e lo aggiunge al pool. Legge solo i metadati del file, mai i pixel. Per HEIC e AVIF percorre i box del file, quindi funziona in ogni browser, anche in quelli che non sanno visualizzare questi formati. Anche un file **JPEG XL** viene rifiutato: il suo profilo è compresso all'interno del codestream, che profiletool non sa ancora decomprimere. I video e i file raw di fotocamera che condividono il contenitore di HEIC (MP4, QuickTime, Canon CR3) non vengono trattati come immagini. Un file **OpenEXR** o **Radiance HDR** (`.hdr`) viene rifiutato indicandone il motivo: nessuno dei due formati prevede uno spazio per un profilo ICC. OpenEXR dichiara il proprio colore tramite cromaticità, Radiance HDR tramite una riga di intestazione `PRIMARIES` facoltativa. Per *visualizzare* un'immagine, usa la [scheda HDR](#4-7-hdr-tab). Il pulsante **＋ Nuovo da .cube** crea un DeviceLink da una LUT `.cube`. Il risultato viene aggiunto al pool e aperto nella scheda **Profilo**; nulla viene scaricato finché non fai clic su **Salva profilo ICC**.

Un profilo viene accettato se i suoi primi 36 byte contengono la firma `acsp` e se supera l'analisi di `ValidateIccProfile` di IccProfLib. I file non validi sono elencati in un riepilogo dei rifiuti con il motivo specifico; i loro byte non vengono conservati.

### Il pannello Profili {#the-profiles-pane src=04750126}

I profili caricati sono raggruppati in sezioni comprimibili per **classe di profilo** (Input, Display, Output, DeviceLink, ColorSpace, Abstract, Named Color, …). Gli **HDR ColorSpace Profile** della clausola 8.7.1 di ICC.1 hanno invece una sezione propria in cima, **Profili HDR ColorSpace** (sono profili di classe ColorSpace, quindi vengono estratti dalla sezione ColorSpace), suddivisa per trasferimento in **Trasferimento lineare** e **Trasferimento non lineare (PQ, HLG)**, con il trasferimento indicato da un badge su ogni riga. La suddivisione conta nella [scheda HDR](#4-7-hdr-tab), dove a un'immagine OpenEXR o Radiance HDR si può assegnare solo un profilo a trasferimento lineare. Ogni riga mostra il nome del file e i badge di classe, spazio colore, versione e dimensione; un profilo analizzabile solo in parte viene segnalato. Usa il pulsante **A–Z** per cambiare l'ordinamento (ordine di caricamento → crescente → decrescente), la **×** su una riga per rimuoverla e la maniglia sul bordo destro del pannello per ridimensionarlo — oppure comprimi del tutto il pannello.

Fai clic su una riga per selezionarla; Ctrl/Cmd-clic per aggiungerla o toglierla dalla selezione e Maiusc-clic per selezionare un intervallo. **Trascina le righe dal pool su una scheda** per metterle all'opera.

<div class="note">
<strong>Il pool dura solo per la sessione.</strong> Nulla viene caricato su un server e nulla viene conservato — il tuo file system resta l'archivio permanente. Ricaricando la pagina il pool si svuota.
</div>

### Le schede {#the-tabs src=034c9677}

| Scheda | Cosa fa |
|---|---|
| **Profilo** | Ispeziona **un** profilo — intestazione, tag, convalida, analisi, XML, JSON. Rilasciando qui un nuovo profilo si sostituisce quello attuale. |
| **Confronta** | Sovrappone i gamut di **due o più** profili. |
| **Collega** | Concatena i profili in un DeviceLink, oppure trasforma attraverso di essi un'immagine o un set di dati. |
| **Spettrale** | Riunisce immagini spettrali a canale singolo in un unico TIFF multicanale. |
| **HDR** | Mostra **un'**immagine HDR sul tuo display, con un controllo SDR ↔ HDR. Vedi [Scheda HDR](#4-7-hdr-tab). |

Le schede Spettrale e HDR accettano direttamente file immagine anziché profili del pool. Ciascuna delle altre schede mantiene un proprio insieme di profili, mostrati come chip rimovibili sotto la barra delle schede, con un badge numerico sulla scheda stessa. Il primo profilo caricato si apre automaticamente nella scheda **Profilo**; in seguito, trascinalo dal pool sulla scheda che preferisci. Rilasciando i file direttamente su una scheda li si carica nel pool *e* li si colloca su quella scheda in un'unica azione.

<div class="note">
<strong>Limite di dimensione:</strong> il caricatore rifiuta qualsiasi file più grande di 256 MB. I profili reali sono normalmente ben al di sotto dei 10 MB; il limite serve solo a impedire che un rilascio o un postMessage ostile esaurisca l'heap WASM della scheda.
</div>

---

## 2. Pannello Impostazioni {#2-settings-panel src=3bf599d9}

Apri le Impostazioni facendo clic sul pulsante **⚙** sul bordo destro dello schermo (o sull'icona a ingranaggio in alto a destra sui dispositivi mobili). Il pannello scorre sopra il contenuto senza ridimensionarlo.

Sotto ⚙ si trovano altri due pulsanti:

- **?** apre questa guida **all'interno dell'app**, in un pannello che scorre sopra la finestra. Nell'intestazione ha una casella di ricerca — digita per evidenziare le corrispondenze, poi usa `Enter` / `Shift+Enter` (o i pulsanti `˄` `˅`) per scorrerle; `Escape` cancella la ricerca e un secondo `Escape` chiude il pannello.
- **✉** apre il modulo di contatto su colourbill.com in una nuova scheda del browser.

Il pannello ha due gruppi, **Visualizzazione** e **Ambiente**. Per allargare o restringere il pannello, trascinane il bordo sinistro (220–560 px); la larghezza viene memorizzata.

### Sfondo {#background src=1450fe76}

Passa l'app tra i temi **Chiaro**, **Scuro** e **Sistema** (segue la preferenza del sistema operativo). La scelta viene mantenuta tra una sessione e l'altra. In modalità **Sistema** l'app si iscrive a `prefers-color-scheme` e cambia automaticamente quando cambia il tema del sistema operativo; scegliendo esplicitamente Chiaro o Scuro quel listener viene scollegato.

### Formato numerico {#number-format src=af65622c}

Sceglie come vengono mostrati i valori numerici in tutte le viste del profilo — **Esadecimale** o **Decimale**.

### Lingua {#language src=38c60535}

Imposta la lingua dell'interfaccia. **Predefinito di sistema (…)** rileva la lingua del browser e usa la lingua supportata più vicina, con il nome nativo tra parentesi per mostrarti quale ha scelto. La traduzione copre l'interfaccia dell'app: il pannello Profili, le etichette delle schede, gli strumenti Collega, Spettrale e HDR, le viste della curva di guadagno HDR in Tag, il pannello Impostazioni compresi Ambiente e le sue motivazioni, e l'interfaccia di questa guida. Alcuni testi non vengono tradotti:
- Le stringhe prodotte da IccProfLib — descrizioni dei tag, messaggi di convalida, nomi dei campi dell'intestazione — provengono dalla libreria C++ in inglese.
- Il nome del flag del browser resta in inglese, così corrisponde alla pagina dei flag del browser stesso.
- Il registro **Eventi del display** del pannello Ambiente resta in inglese, così si può incollare così com'è in una segnalazione di bug.
- Questa guida segue la stessa impostazione, tranne le sezioni sull'HDR, che restano in inglese finché il supporto HDR è in beta e il loro testo è ancora in evoluzione. Anche una sezione rivista in inglese dopo l'ultimo aggiornamento della traduzione viene mostrata in inglese, con una nota, finché la traduzione non viene aggiornata.

Lingue supportate: English, Français, Deutsch, Italiano, Español, Português (PT), Português (BR), Svenska, 中文（简体）, 中文（繁體）, 日本語, 한국어. Il pannello Impostazioni di chardata offre lo stesso insieme, quindi cambiando la lingua in un'app si ottiene un'esperienza di lettura coerente nell'altra.

### Ambiente {#environment src=2eb1ea2c}

Mostra che cosa sanno fare **questo** browser, questa piattaforma e questo display, così quando un formato o una funzione HDR non è disponibile puoi capire perché. Dall'alto in basso:

- **Riepilogo** — il browser e il sistema operativo, e se il display dichiara il supporto HDR.
- **Flag del browser** (Chrome, Edge, Opera, Brave) — se *Experimental Web Platform features* è attivo. Quel flag abilita il canvas HDR e permette alla pagina di leggere il margine HDR di un display.
  - Quando si sa che il flag non è attivo, il riquadro viene evidenziato. È indicato come **necessario** se questo browser non dispone di un WebGPU utilizzabile, perché il canvas HDR è allora l'unico modo di rendere l'HDR. Altrimenti è **facoltativo**.
  - L'ispezione dei profili non ne ha mai bisogno.
  - Una pagina web non può aprire né modificare i flag del browser. Fai clic su **Copia**, incolla l'indirizzo nella barra degli indirizzi, imposta il flag su *Enabled*, quindi riavvia il browser.
- **Caratteristiche del display** — **Display HDR**, **Gamut esteso** (sRGB, Display P3 o Rec. 2020), **Rapporto pixel** e il **Percorso canvas HDR** in uso (`float16-canvas`, `webgpu` o nessuno). Si aggiornano da sole quando trascini la finestra su uno schermo dove sono diverse. Il passaggio avviene quando la maggior parte della finestra si trova sul nuovo schermo.
- **Identifica i display** (browser Chromium) — chiede il permesso di vedere su quale monitor si trova la finestra. Una volta concesso, il pannello si aggiorna anche tra monitor simili, indica il **Monitor attuale** e mostra il **Margine HDR** dove il browser lo espone (Chrome con il flag sopra), ad esempio *1,35 stop (≈2,55× il bianco SDR)*. Se rifiuti il permesso, puoi modificarlo nelle impostazioni del sito.
  - Il margine è lo spazio sopra il bianco SDR, quindi sul pannello HDR integrato di un portatile **diminuisce quando aumenti la luminosità** (il bianco SDR diventa più luminoso mentre il picco del pannello resta invariato) e aumenta quando la abbassi. Per la visione HDR, abbassa la luminosità.
  - Su Windows il nuovo valore arriva qualche secondo dopo una modifica della luminosità, quando il driver video lo comunica. Si aggiorna anche quando la finestra passa a un altro schermo o Chrome torna a essere l'app attiva.
- **Eventi del display** — un registro comprimibile degli ultimi 20 aggiornamenti e di ciò che ha attivato ciascuno. È utile per segnalare un problema del display.
- **Tabella dei formati** — una riga per formato (profilo ICC, TIFF, PNG, JPEG, OpenEXR, Radiance HDR, AVIF, HEIC/HEIF, JPEG XL), con tre domande:
  - **Ispeziona**: il profilo incorporato è leggibile?
  - **Visualizza**: i pixel possono essere mostrati?
  - **HDR**: può essere reso più luminoso del bianco?

  Passa il puntatore su una riga per conoscere il motivo di una ✕; i formati che non possono essere visualizzati sono elencati sotto la tabella con i rispettivi motivi. Un punto contrassegna i formati che profiletool decodifica da sé, che funzionano allo stesso modo in ogni browser. **Ispeziona** è ✓ per tutti i formati tranne JPEG XL, il cui profilo è compresso all'interno del codestream.

---

## 3. Viste del profilo {#3-profile-views src=ccf59d34}

Trascina un profilo dal pool sulla scheda **Profilo** per ispezionarlo. La scheda mostra una barra con il nome del file e un pulsante **Salva profilo ICC** (più un'etichetta *● Modificato — non salvato* dopo che lo hai modificato) e, sotto, il visualizzatore: una barra del titolo (nome del file · dimensione in byte · versione di IccProfLib · badge di validità) e una propria barra di schede.

Il badge riassume il rapporto di **Convalida**: verde **Superato** quando nessun controllo fallisce o genera avvisi, ambra **Avviso** quando almeno un controllo genera un avviso, rosso **Non superato** quando un controllo fallisce.

<div class="note">
<strong>Profili analizzati in parte:</strong> se un profilo è danneggiato al punto che il validatore può leggerne solo la struttura, compare un banner di avviso e sono disponibili solo le schede <strong>Intestazione</strong> e <strong>Tag</strong> — Convalida, Analisi, XML e JSON sono nascoste, perché il profilo non deve essere applicato.
</div>

### 3.1 Intestazione {#3-1-header src=45c71bd0}

Una tabella a due colonne con tutti i campi dell'intestazione binaria da 128 byte del profilo ICC. I valori sono decodificati in stringhe leggibili (firme espanse, date formattate, valori in virgola fissa convertiti) tramite `CIccInfo` di IccProfLib. L'**ID del profilo** (l'hash MD5 presente nell'intestazione) è mostrato in una fascia evidenziata in alto.

### 3.2 Tag {#3-2-tags src=90f22730}

Una griglia a sei colonne con tutti i tag della directory dei tag del profilo:

| Colonna | Significato |
|---|---|
| `#` | Posizione nella directory (a partire da 1) |
| `Name` | Nome esteso leggibile (ad es. `profileDescriptionTag`) |
| `ID` | Firma di 4 caratteri (ad es. `desc`) |
| `Offset` | Offset in byte dall'inizio del file |
| `Size` | Dimensione in byte dei dati del tag |
| `Pad` | Byte di riempimento tra questo tag e il successivo |

La firma del **tipo** di tag (ad es. `descType`, `mft2`, `mAB`) è mostrata insieme a offset e dimensione in cima al tag espanso.

I tag sono ordinati per offset. La colonna **Riempimento** è codificata a colori — `Pad < 0` (tag sovrapposti, non conformi) è mostrato in rosso; `Pad > 3` (riempimento oltre quanto previsto dalla specifica) è mostrato in ambra.

**Fai clic su una riga** per espanderla sul posto (a fisarmonica — un tag aperto alla volta). Il dettaglio espanso termina sempre con la descrizione completa specifica del tipo — equivalente all'esecuzione di `CIccTag::Describe(verbosity = 100)` di IccProfLib. Per i tag che contengono CLUT o curve di grandi dimensioni (ad es. `A2B0`, `B2A0`), include ogni cella della griglia o punto della curva.

Sopra la descrizione, i tag con dati visualizzabili mostrano una o più **visualizzazioni in linea**, ciascuna in una sezione comprimibile:

| Tipo di tag | Visualizzazioni |
|---|---|
| Curve tonali (`rTRC`/`gTRC`/`bTRC`/`kTRC`) | La curva di risposta tonale tracciata rispetto alla retta identità; la tabella della curva è compressa sotto il grafico. |
| Coloranti RGB (`rXYZ`/`gXYZ`/`bXYZ`) e punto di bianco (`wtpt`) | Un diagramma di cromaticità CIE 1931 con il primario corrispondente (o il punto di bianco) evidenziato; i dati del colorante o del punto di bianco sono mostrati sotto. |
| Trasformazioni LUT (`A2B0–3`, `B2A0–3`, `gamt`, `pre0–2`) | Curve tonali lato ingresso e lato uscita (sovrapposte, con un colore per colorante e una legenda per attivare o disattivare le tracce); il reticolo della CLUT come immagine; l'**immagine del gamut** (per il `gamutTag` del profilo, codificata a colori — neutro = nel gamut, rosso = fuori gamut); il **valutatore** (vedi sotto); e la tabella dei dati grezzi, compressa. |
| Tabelle di colori nominali / coloranti (`ncl2`/`nmcl`/`clrt`/`clot`) | Un grafico a dispersione dei colori sui diagrammi CIELAB a\*b\* (e CIE xy); le tabelle sono compresse sotto. |
| Punti di codice indipendenti dalla codifica (`cicp`) | **Punti di codice**: primari del colore, caratteristiche di trasferimento, coefficienti di matrice e flag di gamma completa, ciascuno denominato come lo definisce ITU-T H.273. I valori che H.273 non assegna vengono segnalati, così come i byte riservati diversi da zero. |
| Curva di guadagno adattiva (`headroomAdaptiveGainCurveTag`) | **Guadagno a un margine del display**, più **Curva di guadagno** quando il tag memorizza immagini alternative. Vedi *HDR gain curves (HAGC)* più avanti. |

<div class="note">
<strong>I dati malformati non vengono mai nascosti.</strong> Se una curva o un altro elemento visualizzabile non supera la convalida di IccProfLib — ad esempio una curva tonale con una gamma degenere pari a 0 — la sezione mostra comunque ciò che può e visualizza un avviso ⚠ con il motivo esatto fornito dalla libreria, invece di omettere silenziosamente il grafico.
</div>

#### Il valutatore della trasformazione {#the-transform-evaluator src=c70f94b4}

Per le trasformazioni LUT (`A2B*` / `B2A*` / tag di anteprima) la sezione **Valuta** applica la trasformazione di quel tag specifico a un singolo colore da te indicato, usando direttamente IccProfLib — senza alcun motore colore esterno. La direzione segue il tag (`A2B*` va da dispositivo → PCS; `B2A*` da PCS → dispositivo) e l'intento di rendering è implicito nel tag (`…0` percettivo, `…1` colorimetrico relativo, `…2` saturazione).

- Inserisci l'ingresso come valori in **virgola mobile** (canali del dispositivo, oppure PCS in unità Lab/XYZ leggibili) oppure, quando il tag ha una CLUT, tramite l'indice del **punto griglia** (la posizione di un nodo sul reticolo).
- L'uscita è mostrata in **entrambe** le forme: la codifica interna normalizzata 0–1 e le unità leggibili (Lab/XYZ per un risultato PCS).

Il tag gamut (`gamt`) non ha un valutatore — è una mappa a un canale dentro/fuori gamut anziché una trasformazione invertibile; al suo posto viene mostrata la sua immagine del gamut.

### 3.3 Convalida {#3-3-validation src=b72d6c69}

Esegue sul profilo caricato la checklist dell'**ICC Profile Assessment Working Group** e la presenta come rapporto. I controlli provengono dallo strumento `iccPawgReport` di iccDEV, compilato in un modulo WebAssembly separato che viene scaricato solo quando apri questa scheda per la prima volta. (Lo stesso rapporto determina il badge di validità nella barra del titolo ed è raggiungibile da un avvio tramite URL sia con `VAL` sia con il codice storico `PAWG`.)

Ogni controllo è raggruppato sotto **Sicurezza**, **Conformità** o **Qualità** e riporta un esito. I profili con contenuto HDR hanno un quarto gruppo, **HDR**. Il suo primo controllo indica se il profilo è un **Profilo HDR ColorSpace** ICC.1 conforme (clausola 8.7.1), mentre gli altri verificano i metadati HDR su cui quella clausola si basa:

| Esito | Significato |
|---|---|
| **Superato** (PASS) | Il controllo è riuscito |
| **Warn** | Un problema non bloccante che merita una verifica |
| **Non superato** (FAIL) | Il profilo non soddisfa il controllo |
| **Gap** | Il controllo non ha potuto essere valutato completamente (ad es. non ancora implementato) |
| **N/A** | Il controllo non si applica a questo profilo |
| **Not Run** | Il controllo è stato saltato |

La riga di riepilogo in alto conta ogni esito in una pillola colorata. **Fai clic su una pillola per filtrare** il rapporto sottostante — un alone blu indica le categorie attualmente mostrate e le pillole con zero elementi sono inattive. Ad esempio, disattiva **PASS** e **N/A** per concentrarti solo su WARN e FAIL.

### 3.4 Analisi {#3-4-analysis src=9478bc94}

Analisi di qualità sull'intero profilo derivate dalle sue trasformazioni colore — calcolate da un modulo WebAssembly dedicato (il motore di visualizzazione di iccDEV), scaricato solo quando apri questa scheda per la prima volta, e tracciate nello stile proprio dell'app.

Ogni analisi è una sezione comprimibile e **all'inizio sono tutte chiuse**. È una scelta voluta: ogni sezione richiede un passaggio completo di trasformazione sul profilo, quindi aprirne una è una tua scelta esplicita, invece di avviare sei analisi nel momento in cui cambi scheda. I risultati vengono memorizzati in cache, quindi riaprire una sezione è immediato. Una sezione che non si applica al profilo caricato mostra invece una breve nota *non applicabile* (ad esempio, un profilo display matrice/TRC non ha CLUT dispositivo↔PCS da analizzare).

#### Statistiche del profilo {#profile-statistics src=f2d4f2db}

Metriche sull'intero profilo per **un** intento di rendering selezionato, controllate da due elenchi e una casella di controllo:

- **Intento di rendering** — Percettivo / Colorimetrico relativo / Saturazione / Colorimetrico assoluto.
- **Tipo di round-trip** — quale metrica di accuratezza riportare (vedi sotto).
- **Usa tag MPE (colore)** — disattivato = le tabelle di conversione colorimetriche; attivato = i tag multi-processing-element / colore. Non ha effetto sulla panoramica nel gamut, dove è disattivato.

La tabella mostra il **volume del gamut** (in ΔE\*ab³, racchiuso dalla trasformazione dispositivo → PCS `A2B`, misurato voxelizzando il confine e contando le celle racchiuse) insieme a **min / media / dev. std. / P90 / max** del ΔE\*ab del round-trip selezionato. Sotto si trova un istogramma della distribuzione del ΔE — barre di frequenza relativa con una linea di frequenza cumulativa — più il valore `L, a, b` con l'errore peggiore e, per PRMG, se il profilo implica il Perceptual Reference Medium Gamut.

I quattro tipi di round-trip:

- **Panoramica nel gamut (RT0)** — una griglia di valori dispositivo portata al PCS, di nuovo al dispositivo e ancora al PCS; il ΔE\*ab è misurato tra i due passaggi PCS. Un rapido controllo di stabilità nel gamut.
- **Inversione + gamut (RT1)** — ΔE\*ab tra il PCS di ogni colore dispositivo e il suo PCS dopo un round-trip Lab → dispositivo → Lab. Riflette l'accuratezza dell'inversione *e* il gamut mapping.
- **Riproducibilità (RT2)** — ΔE\*ab tra il primo e il secondo round-trip: quanto è stabile un round-trip ripetuto, indipendentemente dal clipping di gamut del primo passaggio.
- **Interoperabilità PRMG** — i colori PCS all'interno del Perceptual Reference Medium Gamut eseguono un singolo round-trip; la distribuzione del ΔE indica l'interoperabilità tra profili.

Sotto l'istogramma, **ΔE di andata e ritorno per luminosità** risponde alla domanda a cui i valori riassuntivi non possono rispondere: *dove* nella scala tonale l'inversione è in difficoltà, e *quanto in profondità nel gamut* arriva il problema.

Campiona 32 livelli di luminosità. A ogni livello prende 64 punti **sul confine del gamut**, poi li ripete erosi verso l'asse neutro all'80 %, al 50 % e al 20 % della loro croma — 8.192 punti in tutto, ciascuno tracciato singolarmente, con separatori punteggiati tra i livelli.

Leggilo fascia per fascia. All'interno di una fascia i punti vanno dalla superficie del gamut a sinistra al neutro a destra, quindi l'errore dovrebbe **diminuire** lungo la fascia: i colori vicini al confine sono i più difficili da invertire, quelli vicini al neutro i più facili. Una fascia il cui errore resta alto fino al neutro indica un profilo in difficoltà a quella luminosità. I picchi più alti indicano i livelli di luminosità in cui il confine del gamut stesso è invertito peggio.

Ogni punto di partenza è per costruzione all'interno del gamut, quindi ciò che vedi è un reale disaccordo tra `B2A` e `A2B`, non colori tagliati perché irraggiungibili. Nota che questo grafico ha un **proprio** campionamento — volutamente concentrato verso il confine del gamut — quindi la sua media e il suo massimo sono più alti di quelli della tabella sopra e non sono confrontabili con essi. Segue l'intento di rendering ma non il tipo di round-trip.

Un profilo privo delle trasformazioni dispositivo↔PCS richieste da una metrica mostra una nota *non applicabile*; uno spazio dispositivo troppo ampio per essere campionato viene segnalato come saltato anziché come errore.

#### Colorimetria degli estremi {#extrema-colorimetry src=be6c9597}

Gli estremi dell'intervallo di riproduzione del profilo — i numeri che un operatore di stampa di solito legge per primi.

- **Punto di bianco** — il colore con **colorante nullo**, cioè il supporto nudo.
- **Punto di nero** — si ottiene facendo passare il nero PCS (L\*=0, a\*=b\*=0) attraverso la tabella `B2A` selezionata per ricavare l'inchiostrazione che il profilo *sceglie* per il nero, e rileggendo poi tale inchiostrazione tramite `A2B1`.
- Entrambi sono mostrati in colorimetria **relativa** e **assoluta**. Quella assoluta mostra il colore proprio del supporto (una carta bianco-azzurra risulta qualcosa come L\* 95, b\* −4); quella relativa lo riferisce a un bianco perfetto. Se le due colonne coincidono è normale — il bianco del supporto corrisponde semplicemente all'illuminante. Un profilo senza tag del punto di bianco del supporto mostra solo la relativa.
- **Inchiostrazione al punto di nero** e **TAC** — l'inchiostro per canale a quel nero e la loro somma: la copertura totale d'inchiostro, il valore del limite d'inchiostro.

Poiché ogni tabella `B2A` sceglie la propria inchiostrazione per il nero, il punto di nero cambia davvero da un intento all'altro — da qui il selettore dell'intento di rendering.

Più sotto, **Pieno e croma massima**: per ogni vertice d'inchiostro (C, M, Y, R, G, B e K), dove si colloca in tinta / croma / luminosità, e il punto più cromatico trovato lungo il percorso dal supporto nudo. Queste righe sono misurate tramite `A2B1` e quindi **non cambiano con il selettore dell'intento**. In un profilo ben formato le due righe coincidono. Quando la croma massima arriva *prima* del pieno la riga viene segnalata: oltre quel punto l'inchiostro aggiuntivo non aggiunge più croma, scurisce soltanto.

**Solo profili di output (stampante)** — l'analisi presuppone che colorante nullo significhi supporto nudo. La tabella per tinta richiede inoltre uno spazio dispositivo **CMYK o CMY**: un profilo n-colori (nCLR) nomina i propri canali in un ordine qualsiasi, quindi non si può sapere quale canale sia il "ciano", e la tabella lo segnala invece di tirare a indovinare.

#### Inchiostrazione dell'asse neutro {#neutral-axis-inking src=aa5449e4}

Percorre l'asse neutro (a\*=b\*=0) dal bianco (L\*=100) al nero (L\*=0) attraverso la tabella `B2A` (PCS → dispositivo) del profilo e traccia quanto di ciascun colorante del dispositivo il profilo deposita lungo il percorso — la classica curva di GCR / costruzione del neutro. Una curva per canale del dispositivo, con un colore per colorante.

Sopra la separazione è tracciata un'ulteriore curva:

- **L\* in uscita (tono)** — la risposta tonale: dove l'asse neutro arriva effettivamente in luminosità dopo un round-trip attraverso il profilo. Dalla sua forma si leggono due cose. Un avvallamento sotto la diagonale significa che i grigi vengono resi più scuri del richiesto. Ancora più utile, la curva **si appiattisce alla luminosità più scura che il profilo può raggiungere** — quel plateau *è* il punto di nero del supporto, e dovrebbe concordare con la sezione Colorimetria degli estremi sopra.

**Solo profili di output (stampante)**; le altre classi di profilo mostrano una nota.

#### Uso dell'inchiostro nelle ombre {#ink-usage-in-shadows src=e62016b7}

Quattro percorsi rettilinei sul piano a\*b\* a una luminosità costante e deliberatamente scura — 0°, 45°, 90° e 135° — passati attraverso la tabella `B2A` selezionata, con la separazione risultante tracciata per ciascuno.

Poiché tutti i campioni di un percorso condividono la stessa L\*, ogni scalino brusco o inversione in un colorante deriva unicamente dalla gestione di tinta e croma. È la firma di un artefatto di gamut mapping nelle ombre, ed è il tipo di difetto che in stampa si manifesta come banding o come un improvviso salto di colore nelle zone scure. I percorsi partono da molto fuori del gamut, lo attraversano ed escono dal lato opposto, quindi si vede anche dove il profilo inizia a tagliare.

Il piano di luminosità viene scelto automaticamente: a metà tra il vertice Blu del profilo e il più scuro fra C, M, Y, R e G. Per le tabelle percettiva e di saturazione la luminosità viene prima estesa dal punto di nero del supporto fino al nero PCS — quelle tabelle si aspettano il nero lì — e la sezione riporta sia il piano compensato sia quello grezzo.

**Solo profili di output (stampante)**, con la stessa restrizione CMYK/CMY della tabella per tinta sopra (il piano è derivato dai vertici d'inchiostro).

#### Percorsi d'inchiostrazione primaria attraverso il neutro {#primary-inking-paths-through-neutral src=cb510c25}

Tre percorsi — ciano→rosso, magenta→verde, giallo→blu — ciascuno condotto da un vertice primario, **attraverso l'asse neutro** alla luminosità media dei suoi due estremi, fino al vertice opposto, passati attraverso la tabella `B2A` selezionata e tracciati come separazione.

È il corrispettivo nel gamut di Uso dell'inchiostro nelle ombre. Lì i percorsi escono deliberatamente dal gamut per mettere in luce gli artefatti di gamut mapping; qui **ogni campione è per costruzione all'interno del gamut** — entrambi gli estremi sono primari del profilo stesso e il perno si trova sull'asse neutro. Quindi uno scalino, una piega o un'inversione in un colorante lungo uno di questi percorsi non si può attribuire al clipping di gamut: è un difetto di regolarità della CLUT. Il perno neutro è il punto centrale di ogni grafico, dove dovresti vedere una costruzione del neutro bilanciata.

Per le tabelle percettiva e di saturazione la luminosità è compensata per il punto di nero in base all'intento, esattamente come in Uso dell'inchiostro nelle ombre.

**Solo profili di output (stampante)**, con la stessa restrizione CMYK/CMY (i vertici provengono dalla stessa fonte della tabella per tinta).

#### Statistiche di utilizzo dell'inchiostro {#ink-usage-statistics src=191fd7cd}

Quanto di ciascun colorante il profilo deposita, come copertura media e come **quota del totale** — la firma di consumo d'inchiostro della separazione.

La tabella somma ciascun colorante lungo l'asse neutro e ne riporta la copertura media e la percentuale su tutto l'inchiostro depositato. La colonna della quota è quella diagnostica: è l'impronta della costruzione del neutro del profilo (un bilanciamento dei grigi a prevalenza di ciano si legge diversamente da uno a prevalenza di nero) ed è indipendente dal numero di campioni prelevati.

Una seconda tabella — l'utilizzo d'inchiostro su **tutti i colori sul confine e all'interno del gamut** — è indicata come *in arrivo*: richiede una costruzione del confine del gamut non ancora implementata.

**Solo profili di output (stampante).**

#### Immagine CLUT {#clut-image src=a3fec568}

La tabella di conversione colore di una trasformazione dispositivo↔PCS, disposta a mosaico in un'immagine, con un selettore della tabella dell'intento di rendering da visualizzare (`A2B0`–`A2B3`, `B2A0`–`B2A3` e le tabelle di anteprima). Utile per individuare a colpo d'occhio danni strutturali in una tabella. Ingrandisci, sposta e ripristina con i controlli sul canvas.

Quando selezioni una **tabella `B2A` (PCS → dispositivo)**, sotto il reticolo compare un'**immagine di copertura d'inchiostro in scala di grigi per ogni colorante** — le separazioni per inchiostro, dove più scuro significa più inchiostro. Un suggerimento in cima alla sezione te le indica, poiché la sezione si apre su una tabella `A2B` (la cui uscita è L\*a\*b\*, non inchiostri). Per un **output n-colori (nCLR)** — a 5, 6 o 7 colori — dove non esiste una semplice anteprima a colori, l'immagine principale è **gestita a colori tramite la `A2B` diretta del profilo**, così viene comunque resa a colori reali invece che in un grigio a canale singolo.

#### Immagine gamut {#gamut-image src=92f58c0f}

La mappa dentro/fuori gamut del tag gamut: neutra dove un colore PCS è riproducibile, rossa dove cade fuori dal gamut del dispositivo. Presente solo quando il profilo contiene un tag `gamt`.

### 3.5 XML {#3-5-xml src=dfd43c4e}

Converte il profilo in XML (tramite IccLibXML, lo stesso writer usato dalla CLI `iccToXml` di iccDEV) e lo mostra in un editor CodeMirror con evidenziazione della sintassi. Modifica l'XML e fai clic su **Converti in ICC** per tornare al formato binario; il visualizzatore ripete la convalida e il pulsante **Salva profilo ICC** nella barra della scheda Profilo scarica il risultato.

Un indicatore di **modifiche non applicate** compare quando il testo dell'editor differisce dall'ultimo output del convertitore, così puoi vedere a colpo d'occhio se le tue modifiche sono state applicate. Se la conversione non riesce, l'errore di analisi di IccLibXML viene mostrato sopra l'editor con la riga / colonna incriminata.

### 3.6 JSON {#3-6-json src=59c3f2e5}

Stesso principio della scheda XML, ma con una rappresentazione JSON del profilo prodotta dal wrapper del validatore (`json-wrapper.cpp`). Modifica, fai clic su **Converti in ICC**, salva. La forma JSON è più compatta e più semplice da gestire con script; la forma XML è più familiare se hai usato gli strumenti CLI di iccDEV.

---

## 4. Scheda Collega {#4-combine-tab src=735d6198}

profiletool conserva ogni profilo caricato in un **pool di profili** a sinistra. In alto si trovano cinque schede — **Profilo** (il visualizzatore di profilo singolo descritto sopra), **Confronta**, **Collega**, **Spettrale** e **HDR**. La scheda **Collega** è dove concateni i profili e li metti all'opera: crea un **DeviceLink**, **trasforma un'immagine** o **trasforma un set di dati colore** attraverso la catena.

### 4.1 Costruire una catena {#4-1-building-a-chain src=83ab772c}

Trascina uno o più profili dal pool nel riquadro Collega per aggiungerli alla catena, nell'ordine. La catena è una **pila verticale**: l'origine è in alto, la destinazione in basso. Ogni profilo contribuisce con **una trasformazione** e lo strumento mostra lo spazio colore in ingresso e in uscita (ad es. `RGB → Lab`), con lo **spazio di connessione** indicato sulla linea tra le fasi. Il motore convalida l'intera catena in tempo reale e riporta il flusso da capo a capo (ad es. *Catena: RGB → CMYK*) oppure spiega, fase per fase, dove la connessione non riesce.

- **Riordina** una fase trascinandone la maniglia (`⠿`) o con i pulsanti ▲ / ▼; rimuovine una con ×.
- **Inverti la direzione** — il pulsante ⇅ della trasformazione iniziale inverte la direzione della catena, propagandosi alle fasi successive.
- **Intento di rendering** — scegline uno per tutta la catena con *Intento di rendering (tutti)*, oppure sovrascrivilo per una singola fase con il relativo elenco. Passa il puntatore su uno dei due controlli per una descrizione dell'intento selezionato. Oltre ai quattro intenti di base, un profilo che contiene le tabelle necessarie offre anche le varianti *no D2Bx/B2Dx* e *+ BPC* (compensazione del punto di nero).

<div class="note">
<strong>Profilo HDR ColorSpace nella catena.</strong> Un HDR ColorSpace Profile ICC.1 non ha tag TRC — la clausola 8.7 non ne definisce per un profilo ColorSpace — quindi una trasformazione attraverso di esso usa il suo <code>AToB0Tag</code>. Quella tabella è il rendering HDR&#8594;SDR che la clausola 8.7.1.5 richiede per i software privi di elaborazione HDR. Il riquadro lo segnala quando una catena contiene un HDR ColorSpace Profile: il DeviceLink, l'immagine o i dati prodotti riflettono quel ripiego SDR, non il comportamento HDR del profilo.
</div>

### 4.2 Crea DeviceLink {#4-2-make-devicelink src=2cb72a0d}

Fonde l'intera catena in un unico profilo **DeviceLink** (un porting nel browser di `iccApplyToLink` di iccDEV). Assegnagli un nome e fai clic su **Crea DeviceLink**; il risultato finisce nel pool e nell'accumulatore di Collega come qualsiasi altro profilo, pronto per essere ispezionato nella scheda Profilo o riutilizzato in un'altra catena.

### 4.3 Trasforma immagine {#4-3-transform-image src=461fcd83}

Rilascia un'immagine raster (TIFF, PNG o JPEG) nello spazio dell'immagine e fai clic su **Trasforma immagine** per farla passare attraverso la catena (un porting nel browser di `iccApplyProfiles`). L'immagine viene prima verificata leggendone solo l'intestazione — il suo spazio colore deve corrispondere all'ingresso della catena. Il risultato **viene scaricato**; le immagini non vengono mai conservate nel pool.

Quando è caricata un'immagine valida, compare un pannello **Opzioni di output dell'immagine** con le impostazioni di destinazione che rispecchiano la CLI `iccApplyProfiles`:

- **Codifica** — *Come l'origine*, 8 bit, 16 bit o **Virgola mobile (32 bit)**.
- **Compressione** — Nessuna, **LZW** o **ZIP** (Deflate).
- **Planare** — piani **Interlacciato** (chunky) o **Separato**.
- **Interpolazione CMM** — **Tetraedrica** o **Lineare**.
- **Incorpora profilo ICC** — associa all'output l'ultimo profilo della catena (quello dello spazio di uscita).

L'impostazione predefinita mantiene l'output RGB/Gray in PNG; scegliendo un'opzione esclusiva del TIFF (virgola mobile, LZW/ZIP o piani separati) il contenitore passa a TIFF.

<div class="note">
<strong>Profili incorporati:</strong> se l'immagine rilasciata contiene un proprio profilo ICC incorporato, un banner propone di <strong>estrarlo</strong> — con un clic il profilo viene aggiunto al pool e posizionato all'inizio della catena (come suo spazio di origine).
</div>

### 4.4 Trasforma dati {#4-4-transform-data src=96934eec}

Rilascia un set di dati colore (CGATS/IT8, CSV, CxF o JSON) nello spazio dei dati e fai clic su **Trasforma dati** per far passare ogni campione attraverso la catena (l'equivalente di `iccApplyNamedCmm`). Lo strumento legge i tipi di dati presenti nel set (dispositivo / Lab / XYZ / spettrale) e fornisce quello richiesto dall'ingresso della catena; un ingresso **spettrale** viene convertito in colorimetria con il calcolatore canonico di iccDEV, usando l'**Osservatore** e l'**Illuminante** che scegli. I campioni duplicati possono essere filtrati (mediana o media). Il risultato si apre in una tabella che puoi salvare come CSV con **Salva**.

### 4.5 Cambio di osservatore {#4-5-observer-change src=738ba4d4}

La scheda Collega contiene **due** riquadri generatori. Sopra la Pipeline di collegamento, il riquadro **Cambio di osservatore** crea un profilo display matrice/TRC v4.3 a partire da un profilo display RGB V5 e da un profilo osservatore V5 (PCC). Trascina entrambi sul riquadro — vengono assegnati automaticamente agli spazi **Display RGB V5** e **Osservatore V5 (PCC)** in base alla classe di profilo — poi fai clic su **Crea profilo display V4**, assegnagli un nome e fai clic su **Crea**. Il risultato si aggiunge al pool e a questa scheda. Un profilo che non è né l'uno né l'altro viene ignorato con un avviso.

### 4.6 Schede Confronta e Spettrale {#4-6-compare-and-spectral-tabs src=b934d7e3}

La scheda **Confronta** sovrappone i confini del gamut di due o più profili del pool — un guscio 3D più una sezione 2D a luminosità costante — per vedere dove differiscono. Quando i profili sono HDR ColorSpace Profile, una nota **Visualizzazione del ripiego SDR** spiega che ogni gamut è costruito dal rendering SDR di `AToB0Tag`, non dall'intervallo HDR del profilo, che non può essere tracciato in un PCS limitato. La scheda **Spettrale** riunisce un insieme di immagini spettrali a canale singolo (rilasciate nell'ordine dei canali) in un unico TIFF multicanale (`iccSpecSepToTiff`).

## 5. Modifica round-trip {#5-round-trip-editing src=595f380b}

Sia la scheda XML sia la scheda JSON possono riscrivere il profilo in formato binario ICC. Il flusso di lavoro tipico:

1. **Carica** un profilo ICC.
2. Apri la scheda **XML** o **JSON**. Fai clic su **Converti in XML** / **Converti in JSON** per popolare l'editor.
3. **Modifica** nell'editor della pagina. Accanto alla barra degli strumenti compare un indicatore di modifiche non applicate.
4. Fai clic su **Converti in ICC**. Il wrapper crea un nuovo profilo, ripete la convalida e aggiorna le schede Intestazione / Tag / Convalida.
5. Accanto al nome del file, nella barra della scheda Profilo, compare l'etichetta **● Modificato — non salvato**.
6. Fai clic su **Salva profilo ICC**. I byte modificati vengono scaricati come `<original>-edited.icc`.

I due editor sono indipendenti — modificare l'XML e poi il JSON non mescola i due percorsi. Viene salvato l'ultimo insieme di byte ICC prodotto.

<div class="note">
<strong>Attenzione:</strong> la fedeltà della conversione dipende da ciò che IccLibXML / il wrapper JSON supportano per ciascun tipo di tag. Se un tipo di tag non è rappresentabile, il round-trip perderà dettagli; dopo la riconversione controlla la scheda Convalida per verificare che tutto venga ancora analizzato correttamente.
</div>

La scheda Tag evidenzia ogni tag i cui byte differiscono da quelli caricati in origine, così è facile vedere che cosa hanno cambiato le tue modifiche.

---

## 6. Avvio da chardata {#6-launching-from-chardata src=b39a6805}

In **chardata**, dopo aver caricato un profilo ICC, fai clic su **Display File** per aprire il visualizzatore nella pagina, poi fai clic su **Launch editor**. Si apre qui una nuova scheda con `?source=chardata` nell'URL.

Il passaggio avviene interamente nel browser:

1. profiletool si apre, rileva `?source=chardata` e invia `{type:'profiletool:ready'}` a `window.opener` tramite `postMessage`.
2. chardata risponde con `{type:'profiletool:load', filename, bytes}`.
3. profiletool accetta i byte (dopo aver verificato l'origine del mittente rispetto a una allowlist e la dimensione rispetto al limite di 256 MB), esegue la convalida e mostra il profilo.

Nessun caricamento, nessun passaggio dal server. Il flusso è a senso unico — le modifiche fatte qui si salvano facendo clic su **Salva profilo ICC**, non vengono restituite a chardata.

---

## 7. Avvio con un URL {#7-launching-with-a-url src=f9a8d871}

Puoi aprire lo strumento con un link che indica un profilo da caricare — e la scheda su cui arrivare — usando un **frammento dell'URL** (la parte dopo `#`):

```
https://chardata.colourbill.com/profiletool#url=<profile-url>&tab=<tab>
```

Entrambi i parametri sono facoltativi:

- **`url=`** — l'indirizzo web da cui viene scaricato il profilo. I byte vengono scaricati nel tuo browser e poi seguono esattamente lo stesso percorso di un file locale: il controllo dell'intestazione `acsp`, la `ValidateIccProfile` completa, il limite di dimensione di 256 MB e il ripiego al meglio delle possibilità per i profili non analizzabili. Nulla viene caricato su un server — i byte scaricati alimentano solo il validatore e non vengono mai reinviati.
- **`tab=`** — quale vista aprire dopo il caricamento del profilo.

Un esempio completo:

```
https://chardata.colourbill.com/profiletool#url=https://example.org/profiles/sRGB.icc&tab=VAL
```

<div class="note">
<strong>Perché un frammento e non una query string?</strong> La parte dopo <code>#</code> non viene mai inviata a un server web, quindi l'indirizzo del profilo che stai ispezionando resta sul tuo computer.
</div>

### Nomi delle schede {#tab-names src=d3a4dbae}

`tab=` accetta due schemi di denominazione intercambiabili e insensibili a maiuscole/minuscole. I codici **brevi** sono la forma preferita:

| Vista | Codice breve | Nome lungo |
|---|---|---|
| Intestazione | `HEADER` | `Header` |
| Tag | `TAGS` | `Tags` |
| Convalida | `VAL` | `Validation` |
| Analisi | `ANALYSIS` | `Analysis` |
| XML | `XML` | `XML` |
| JSON | `JSON` | `JSON` |

I nomi lunghi sono le etichette inglesi delle schede senza spazi. Entrambi gli schemi restano stabili anche se le etichette visibili vengono rinominate, così i link esistenti continuano a funzionare. La scheda Convalida risponde anche al codice storico `PAWG` (in precedenza era etichettata "Profile Assessment WG"). Un valore di `tab=` non riconosciuto viene ignorato e si apre la vista Intestazione.

<div class="note">
<strong>Requisiti per <code>url=</code>:</strong> il profilo deve essere servito tramite <strong>HTTPS</strong> e il server che lo ospita deve consentire le letture cross-origin (un'intestazione <code>Access-Control-Allow-Origin</code> / CORS permissiva). Se manca una delle due condizioni, il browser blocca il download e lo strumento mostra un errore di recupero. Se l'URL del profilo contiene a sua volta <code>&</code> o <code>#</code> (una propria query string), codifica in percentuale l'intero valore di <code>url=</code>, così quei caratteri non chiudono anzitempo il frammento.
</div>

---

## 8. Dispositivi mobili {#8-mobile src=cb948e3c}

Sugli schermi più stretti di 700 px:

- Il pannello Impostazioni diventa un cassetto che scorre da destra.
- Un pulsante flottante **⚙** in alto a destra apre / chiude le Impostazioni.
- Un pulsante **?** sotto ⚙ apre questa guida nel suo pannello a scorrimento.
- Un pulsante **✉** apre il modulo di contatto in una nuova scheda del browser.
- Toccando lo sfondo oscurato si chiude il cassetto aperto.
- La tabella dei tag passa da una griglia larga a schede impilate, così ogni colonna resta leggibile senza scorrimento orizzontale; un tag si espande comunque sul posto.
- **Il tocco sostituisce il trascinamento.** iOS non supporta il trascinamento, quindi lì non si può trascinare un profilo dal pool su una scheda. Invece, **tocca i profili per selezionarli, poi tocca la scheda** su cui li vuoi — con lo stesso risultato del trascinamento. Il pool mostra questo promemoria quando si usa uno schermo touch.
- **Su iPhone e iPad i selettori di file elencano tutti i file.** iOS confronta il filtro per tipo di file con i tipi che conosce, e non ne conosce nessuno per `.icc`, `.icm`, `.cube` o `.exr`, quindi il filtro renderebbe grigi proprio i file che vuoi aprire. Scegli il profilo per nome; tutto ciò che non è un profilo viene comunque rifiutato con un motivo dopo il caricamento.

Tutte le funzioni sono disponibili; il layout si adatta allo schermo più piccolo.

---

## 9. Limiti e sicurezza {#9-limits-and-security src=ce1e9474}

profiletool non effettua richieste di rete dopo il caricamento iniziale della pagina. Il validatore, il convertitore XML, il convertitore JSON e i codec delle immagini sono tutti in WebAssembly, compilati da sorgenti C++, ed eseguiti interamente lato client. La scheda HDR mostra un'immagine rilasciata tramite un URL di oggetto locale, quindi l'immagine non lascia mai la scheda. **Identifica i display** chiede al browser, non a un server, su quale monitor si trova la finestra.

| Limite | Dove | Note |
|---|---|---|
| **256 MB** | postMessage / caricamento file | Rifiuta di caricare file più grandi; impedisce l'esaurimento dell'heap da parte di una finestra di origine ostile |
| **32 MB** | Convertitori XML e JSON | Lo applicano sia il controllo JS (`MAX_XML_BYTES` / `MAX_JSON_BYTES`) sia i wrapper C++ (`kMaxXmlBytes` / `kMaxJsonBytes`); il lato C++ fa fede in modo indipendente |
| **Protezione da entity bomb XML** | Convertitore XML | Qualsiasi XML che contenga `<!DOCTYPE` o `<!ENTITY`, o un byte NUL, viene rifiutato prima che libxml2 lo veda. Sono attivi anche i limiti di espansione delle entità propri di libxml2, quindi questo è un secondo livello di difesa contro input di tipo billion-laughs |
| **512 MB** | File della scheda HDR | Verificato sulla dimensione del file prima di leggerne qualsiasi parte; rispecchia il limite di ingresso di 512 MB dei codec delle immagini |
| **40 megapixel**, **64 pixel per byte** | Decodifica Radiance HDR (scheda HDR) | Entrambi verificati dall'intestazione e dalla dimensione del file prima di allocare memoria per i pixel; il secondo respinge le bombe di decompressione basate su marcatori di ripetizione |
| **Budget di decodifica EXR** | Decodifica OpenEXR | Larghezza × altezza × canali × 4 byte deve stare in 512 MB, verificato dall'intestazione prima che il decoder allochi qualsiasi cosa |
| **Scansione dei box HEIC/AVIF** | Estrazione del profilo | Le dimensioni dei box sono verificate senza overflow, l'annidamento è limitato a 8, un profilo a 64 MB (per file, in totale) e le associazioni degli elementi a 65 536 |
| **Allowlist delle origini** | Avvio tramite postMessage | Solo la stessa origine e le origini dell'host di sviluppo di chardata possono inviare byte `profiletool:load` |
| **HTTPS + CORS** | Avvio tramite `#url=` | Un profilo avviato tramite URL deve essere servito in HTTPS da un host che consenta le letture cross-origin; i byte scaricati alimentano solo il validatore e non vengono mai reinviati |

L'avvio tramite `#url=` (aggiunto nella 1.1.5) è l'unico caso in cui lo strumento effettua una richiesta verso un'altra origine dopo il caricamento della pagina: estende `connect-src` della Content-Security-Policy a `https:` così da poter scaricare il profilo indicato. Il caricamento degli script **non** viene esteso — solo il recupero dei dati.

Se devi ispezionare un profilo che supera questi limiti, compila iccDEV dai sorgenti e usa gli strumenti CLI nativi — non hanno limiti lato JS.

### Licenza {#licence src=e7a2a884}

profiletool è distribuito con licenza MIT. L'app include anche componenti di terze parti soggetti alle rispettive licenze: IccProfLib di iccDEV (International Color Consortium), LibTIFF, libpng, zlib, libxml2, JSON for Modern C++, il runtime di Emscripten e pacchetti JavaScript tra cui React, Plotly e CodeMirror. Questo software si basa in parte sul lavoro dell'Independent JPEG Group. Le note complete si trovano in [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt).

### Copertura ICC.2 (iccMAX) {#icc-2-iccmax-coverage src=3d2b33e8}

Sono supportati sia i profili **ICC.1** sia quelli **ICC.2**, ma la copertura ICC.2 è **incompleta**. Il caricamento, le viste dell'intestazione e dei tag, la convalida, il round-trip XML/JSON e i motori di trasformazione comprendono tutti ICC.2; le lacune note sono i flussi di interscambio **ICS** in più parti, la scelta di un **sotto-profilo** V5 quando si applica una trasformazione e la ricerca inversa su alcuni profili ICC.2. Un profilo che usa un costrutto ICC.2 non supportato viene segnalato dalla scheda Convalida invece di essere letto erroneamente in silenzio.
