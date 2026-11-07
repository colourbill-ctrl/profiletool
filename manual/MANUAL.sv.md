<!-- (c) 2026 William Li -->

<!-- sv translation of MANUAL.md. Translate the text; keep every {#anchor src=…} exactly as it is. -->

# ICC-profilverktyg — användarhandbok {#icc-profile-tool-user-manual src=38bba1de}

**ICC-profilverktyg** (profiletool) är ett webbläsarbaserat verktyg för att granska, validera och redigera färgprofiler enligt **ICC.1** och **ICC.2 (iccMAX)** fram och tillbaka. Det körs helt i din webbläsare — ingen uppladdning, ingen installation — med en WebAssembly-version av [iccDEV](https://github.com/InternationalColorConsortium/iccDEV), ICC:s officiella demoimplementering av IccProfLib.

**Det här kan du göra:**

- **Bläddra i profilhuvudet** — varje fält i det 128 byte långa profilhuvudet, avkodat till läsbar text.
- **Bläddra i taggkatalogen** — varje tagg med signatur, typ, byteoffset, storlek och utfyllnadsbyte. Klicka på en tagg för att fälla ut en fullständig typspecifik beskrivning (samma utdata som vyn ”Describe” i iccDEV:s `wxProfileDump`) och — för taggar som har en sådan — en inbäddad **visualisering**: tonkurvor, kromaticitetsdiagram, CLUT- och gamutbilder, spridningsdiagram för namngivna färger samt en **transformutvärderare** för enskilda punkter.
- **Validera** — kör checklistan från ICC Profile Assessment Working Group (Säkerhet / Överensstämmelse / Kvalitet), där varje kontroll får ett utlåtande och kan filtreras per kategori.
- **Redigera fram och tillbaka** — konvertera profilen till XML eller JSON, redigera den i den inbyggda kodredigeraren, konvertera tillbaka till ICC och validera på nytt. Spara-knappen laddar ned den redigerade binärfilen.
- **Kedja profiler** — på fliken **Länka** drar du profiler från poolen till en ordnad kedja och bakar sedan ihop den till en **DeviceLink**, **transformerar en bild** genom den (med full kontroll över utdatans kodning, komprimering, planformat och inbäddning av ICC-profil) eller **transformerar ett färgdataset**.
- **Arbeta med HDR** — kontrollera en profil mot reglerna för HDR ColorSpace-profiler i ICC.1 (avsnitt 8.7.1), läs dess cICP-kodpunkter och rita dess adaptiva förstärkningskurva vid valfritt skärmutrymme. Fliken **HDR** visar en HDR-bild på din skärm, och **Inställningar → Miljö** visar vad den här webbläsaren och skärmen klarar.
- **Starta från chardata** — öppna en profil som är inläst i [chardata](https://chardata.colourbill.com/) direkt här; byten överlämnas i webbläsaren via `postMessage`.
- **Starta med en URL** — öppna en länk som pekar verktyget på en profil på webben och, om du vill, vilken flik som ska öppnas (t.ex. `…/profiletool#url=…&tab=VAL`).

Allt körs på klientsidan. Profilens byte lämnar aldrig webbläsarfliken.

<div class="note">
<strong>Stödet för ICC.2 (iccMAX) är ofullständigt.</strong> ICC.2-profiler kan läsas in, granskas, valideras och redigeras fram och tillbaka precis som ICC.1-profiler — valideringschecklistan innehåller iccMAX-specifika kontroller, spektral PCS och taggar med multiprocesselement avkodas, och transformmotorerna är byggda mot hela iccMAX-stacken. Ännu inte täckt: arbetsflöden med flerdelad <strong>ICS</strong> (Interchange Color Space), val av en V5-<em>delprofil</em> när en transform tillämpas, och omvänd sökning i vissa ICC.2-profiler. Räkna med luckor bland de mer exotiska ICC.2-funktionerna; de fylls i version för version.
</div>

<div class="note">
<strong>Stödet för HDR ColorSpace-profiler följer ett utkast.</strong> HDR-kontrollerna, vyerna för <code>headroomAdaptiveGainCurveTag</code> och fliken HDR implementerar HDR-tillägget till ICC.1 så som det ser ut i dag. Tillägget är ännu inte publicerat, så detaljer kan ändras innan det blir det.
</div>

---

## Innehåll {#contents src=54605fa3}

1. [Arbetsytan](#1-the-workspace)
2. [Inställningspanelen](#2-settings-panel)
3. [Profilvyer](#3-profile-views)
   - [Rubrik](#3-1-header)
   - [Taggar](#3-2-tags)
   - [Validering](#3-3-validation)
   - [Analys](#3-4-analysis)
   - [XML](#3-5-xml)
   - [JSON](#3-6-json)
4. [Fliken Länka](#4-combine-tab)
   - [Bygga en kedja](#4-1-building-a-chain)
   - [Skapa DeviceLink](#4-2-make-devicelink)
   - [Transformera bild](#4-3-transform-image)
   - [Transformera data](#4-4-transform-data)
   - [Observatörsbyte](#4-5-observer-change)
   - [Flikarna Jämför och Spektral](#4-6-compare-and-spectral-tabs)
   - [Fliken HDR](#4-7-hdr-tab)
5. [Redigering fram och tillbaka](#5-round-trip-editing)
6. [Starta från chardata](#6-launching-from-chardata)
7. [Starta med en URL](#7-launching-with-a-url)
8. [Mobil](#8-mobile)
9. [Gränser och säkerhet](#9-limits-and-security)

---

## 1. Arbetsytan {#1-the-workspace src=4bc9350f}

profiletool är en **arbetsbänk för flera profiler**. Fönstret har tre delar:

- panelen **Profiler** längs vänsterkanten — *poolen* med allt du har läst in;
- **arbetsytan** till höger, med fem flikar överst — **Profil**, **Jämför**, **Länka**, **Spektral**, **HDR**;
- panelen **Inställningar** längs högerkanten (se [Inställningspanelen](#2-settings-panel)).

### Läsa in profiler {#loading-profiles src=2cd0f653}

Du kan läsa in filer på två sätt:

- Klicka på **Läs in profiler** överst i panelen Profiler och välj en eller flera filer, eller
- **dra och släpp** filer på panelen Profiler.

Du kan läsa in profiler (`.icc` / `.icm`) *och* bilder. Släpp en **TIFF, PNG, JPEG, HEIC eller AVIF** så extraherar verktyget dess **inbäddade ICC-profil** och lägger till den i poolen. Bara filens metadata läses, aldrig pixlarna. För HEIC och AVIF går verktyget igenom filens boxar, så det fungerar i alla webbläsare, även sådana som inte kan visa de formaten. En **JPEG XL**-fil avvisas också: dess profil är komprimerad i kodströmmen, som profiletool ännu inte packar upp. Video- och kamerarådatafiler som delar HEIC:s behållarformat (MP4, QuickTime, Canon CR3) behandlas inte som bilder. En **OpenEXR**- eller **Radiance HDR**-fil (`.hdr`) avvisas med en förklaring: inget av formaten har plats för en ICC-profil. OpenEXR anger sin färg genom kromaticiteter, Radiance HDR genom en valfri `PRIMARIES`-rubrikrad. Använd [fliken HDR](#4-7-hdr-tab) om du vill *visa* en bild. Knappen **＋ Ny från .cube** skapar en DeviceLink från en `.cube`-LUT. Resultatet läggs till i poolen och öppnas på fliken **Profil**; inget laddas ned förrän du klickar på **Spara ICC-profil**.

En profil godtas om dess första 36 byte innehåller signaturen `acsp` och den kan tolkas av IccProfLibs `ValidateIccProfile`. Filer som inte klarar det listas i en sammanfattning över avvisade filer med den exakta orsaken; deras byte sparas inte.

### Panelen Profiler {#the-profiles-pane src=04750126}

Inlästa profiler grupperas i hopfällbara avsnitt efter **profilklass** (Input, Display, Output, DeviceLink, ColorSpace, Abstract, Named Color, …). **HDR ColorSpace-profiler** enligt ICC.1 avsnitt 8.7.1 får i stället ett eget avsnitt överst (de är profiler i klassen ColorSpace och lyfts därför ut ur avsnittet ColorSpace), uppdelat efter överföringsfunktion i **Linjär överföring** och **Icke-linjär överföring (PQ, HLG)**, med överföringen som en etikett på varje rad. Uppdelningen spelar roll på [fliken HDR](#4-7-hdr-tab), där bara en profil med linjär överföring kan tilldelas en OpenEXR- eller Radiance HDR-bild. Varje rad visar filnamnet och etiketter för klass, färgrymd, version och storlek; en profil som bara kunde tolkas delvis markeras. Använd knappen **A–Z** för att växla sortering (inläsningsordning → stigande → fallande), **×** på en rad för att ta bort den och handtaget i panelens högerkant för att ändra bredden — eller fäll ihop panelen helt.

Klicka för att markera en rad; Ctrl/Cmd-klicka för att växla markering och Skift-klicka för att markera ett intervall. **Dra rader från poolen till en flik** för att börja arbeta med dem.

<div class="note">
<strong>Poolen gäller bara den aktuella sessionen.</strong> Inget laddas upp och inget sparas — ditt filsystem förblir den beständiga lagringen. Om du läser in sidan på nytt töms poolen.
</div>

### Flikarna {#the-tabs src=034c9677}

| Flik | Vad den gör |
|---|---|
| **Profil** | Granskar **en** profil — huvud, taggar, validering, analys, XML, JSON. Om du släpper en ny profil här ersätts den aktuella. |
| **Jämför** | Lägger gamuten för **två eller fler** profiler över varandra. |
| **Länka** | Kedjar profiler till en DeviceLink, eller transformerar en bild / ett dataset genom dem. |
| **Spektral** | Monterar enkanaliga spektralbilder till en flerkanalig TIFF. |
| **HDR** | Visar **en** HDR-bild på din skärm, med en reglering mellan SDR och HDR. Se [Fliken HDR](#4-7-hdr-tab). |

Spektral och HDR tar emot bildfiler direkt i stället för profiler från poolen. Var och en av de övriga flikarna har sin egen uppsättning profiler, som visas som borttagbara etiketter under flikraden, med ett antal på själva fliken. Den första profilen du läser in öppnas automatiskt på fliken **Profil**; därefter drar du från poolen till den flik du vill. Om du släpper filer direkt på en flik läses de in i poolen *och* placeras på fliken i ett enda steg.

<div class="note">
<strong>Storleksgräns:</strong> inläsningen avvisar allt som är större än 256 MB. Verkliga profiler är normalt långt under 10 MB; gränsen finns bara för att hindra att en fientlig släppt fil eller postMessage tömmer flikens WASM-heap.
</div>

---

## 2. Inställningspanelen {#2-settings-panel src=3bf599d9}

Öppna Inställningar genom att klicka på knappen **⚙** vid skärmens högerkant (eller kugghjulsikonen uppe till höger på mobil). Panelen glider in över innehållet utan att ändra dess storlek.

Under ⚙ finns ytterligare två knappar:

- **?** öppnar den här handboken **i appen**, som en panel som glider in över fönstret. Panelens huvud har en sökruta — skriv för att markera träffar och använd sedan `Enter` / `Shift+Enter` (eller knapparna `˄` `˅`) för att stega mellan dem; `Escape` rensar sökningen och ett andra `Escape` stänger panelen.
- **✉** öppnar kontaktformuläret på colourbill.com i en ny webbläsarflik.

Panelen har två grupper, **Visning** och **Miljö**. Dra i panelens vänsterkant för att göra den bredare eller smalare (220–560 px); bredden sparas.

### Bakgrund {#background src=1450fe76}

Växlar appen mellan temana **Ljus**, **Mörk** och **System** (följer operativsystemets inställning). Valet sparas mellan sessioner. I läget **System** lyssnar appen på `prefers-color-scheme` och växlar automatiskt när operativsystemets tema ändras; om du uttryckligen väljer Ljus eller Mörk kopplas den lyssnaren bort.

### Talformat {#number-format src=af65622c}

Väljer hur numeriska värden visas i profilvyerna — **Hexadecimal** eller **Decimal**.

### Språk {#language src=38c60535}

Åsidosätter gränssnittets språk. **Systemstandard (…)** identifierar webbläsarens språkinställning och använder det närmaste språk som stöds, med språkets eget namn inom parentes så att du ser vilket som valdes. Översättningen omfattar appens gränssnitt: panelen Profiler, flikarnas namn, verktygen på flikarna Länka, Spektral och HDR, HDR-vyerna för förstärkningskurvor under Taggar, inställningspanelen inklusive Miljö och dess förklaringar, samt ramen kring den här handboken. Viss text översätts inte:
- Texter från IccProfLib — taggbeskrivningar, valideringsmeddelanden, namn på fält i huvudet — kommer från C++-biblioteket på engelska.
- Namnet på webbläsarflaggan förblir på engelska så att det stämmer med webbläsarens egen flaggsida.
- Loggen **Skärmhändelser** i panelen Miljö förblir på engelska, så att den kan klistras in i en felrapport som den är.
- Den här handboken följer samma inställning, utom HDR-avsnitten, som förblir på engelska medan HDR-stödet är i betaversion och texten fortfarande ändras. Ett avsnitt som har reviderats på engelska sedan översättningen senast uppdaterades visas också på engelska, med en anmärkning, tills översättningen har kommit ikapp.

Språk som stöds: English, Français, Deutsch, Italiano, Español, Português (PT), Português (BR), Svenska, 中文（简体）, 中文（繁體）, 日本語, 한국어. Panelen Settings i chardata erbjuder samma uppsättning, så om du byter språk i den ena appen får du en enhetlig läsupplevelse i den andra.

### Miljö {#environment src=2eb1ea2c}

Visar vad **den här** webbläsaren, plattformen och skärmen klarar, så att du kan se varför ett format eller en HDR-funktion inte är tillgänglig. Uppifrån och ned:

- **Sammanfattning** — webbläsare och operativsystem, och om skärmen rapporterar HDR.
- **Webbläsarflaggor** (Chrome, Edge, Opera, Brave) — om *Experimental Web Platform features* är påslagen. Flaggan aktiverar HDR-canvasen och låter sidan läsa en skärms HDR-utrymme.
  - När flaggan är känd för att vara avslagen markeras rutan. Den märks som **krävs** om webbläsaren saknar användbar WebGPU, eftersom HDR-canvasen då är enda sättet att rendera HDR. Annars är den **valfri**.
  - Profilgranskning behöver den aldrig.
  - En webbsida kan inte öppna eller ändra webbläsarflaggor. Klicka på **Kopiera**, klistra in adressen i adressfältet, ställ flaggan på *Enabled* och starta sedan om webbläsaren.
- **Skärmegenskaper** — **HDR-skärm**, **Brett färgomfång** (sRGB, Display P3 eller Rec. 2020), **Pixelförhållande** och vilken **HDR-canvasväg** som används (`float16-canvas`, `webgpu` eller ingen). De uppdateras av sig själva när du drar fönstret till en skärm där de skiljer sig. Bytet sker när större delen av fönstret ligger på den nya skärmen.
- **Identifiera skärmar** (Chromium-webbläsare) — ber om tillåtelse att se vilken skärm fönstret ligger på. När det är tillåtet uppdateras panelen även mellan skärmar som ser likadana ut, namnger **Aktuell skärm** och visar **HDR-utrymme** där webbläsaren exponerar det (Chrome med flaggan ovan), till exempel *1,35 steg (≈2,55× SDR-vitt)*. Om du nekar tillåtelsen kan du ändra det i webbplatsens inställningar.
  - Utrymmet är marginalen ovanför SDR-vitt, så på en bärbar dators inbyggda HDR-panel **minskar det när du höjer ljusstyrkan** (SDR-vitt blir ljusare medan panelens toppluminans ligger kvar) och ökar när du sänker den. Sänk ljusstyrkan för HDR-visning.
  - I Windows kommer ett nytt värde några sekunder efter en ändring av ljusstyrkan, när skärmdrivrutinen rapporterar det. Det uppdateras också när fönstret flyttas till en annan skärm eller när Chrome blir den aktiva appen igen.
- **Skärmhändelser** — en hopfällbar logg över de senaste 20 uppdateringarna och vad som utlöste var och en. Den är användbar när du rapporterar ett skärmproblem.
- **Formattabell** — en rad per format (ICC-profil, TIFF, PNG, JPEG, OpenEXR, Radiance HDR, AVIF, HEIC/HEIF, JPEG XL), med tre frågor:
  - **Granska**: kan den inbäddade profilen läsas?
  - **Visa**: kan pixlarna visas?
  - **HDR**: kan formatet återges ljusare än vitt?

  Håll muspekaren över en rad för att se orsaken bakom ett ✕; format som inte kan visas listas med sina orsaker under tabellen. En punkt markerar format som profiletool avkodar själv, och som därför fungerar likadant i alla webbläsare. **Granska** är ✓ för alla format utom JPEG XL, vars profil är komprimerad i kodströmmen.

---

## 3. Profilvyer {#3-profile-views src=ccf59d34}

Dra en profil från poolen till fliken **Profil** för att granska den. Fliken visar ett fält med filnamnet och knappen **Spara ICC-profil** (plus etiketten *● Ändrad — osparad* när du har redigerat profilen), och under det visaren: en titelrad (filnamn · storlek i byte · IccProfLib-version · giltighetsmärke) och en egen flikrad.

Märket sammanfattar rapporten **Validering**: grönt **Godkänd** när ingen kontroll misslyckas eller varnar, gult **Varning** när minst en kontroll varnar, rött **Underkänd** när någon kontroll misslyckas.

<div class="note">
<strong>Delvis tolkade profiler:</strong> om en profil är så skadad att valideraren bara kan läsa den strukturellt visas en varningsbanderoll och bara flikarna <strong>Rubrik</strong> och <strong>Taggar</strong> är tillgängliga — Validering, Analys, XML och JSON döljs, eftersom profilen inte får tillämpas.
</div>

### 3.1 Rubrik {#3-1-header src=45c71bd0}

En tvåkolumnstabell med varje fält i ICC-profilens 128 byte långa binära huvud. Värdena avkodas till läsbar text (signaturer utskrivna, datum formaterade, fixpunktsvärden omräknade) med IccProfLibs `CIccInfo`. **Profil-ID** (MD5-summan från huvudet) visas i en markerad remsa överst.

### 3.2 Taggar {#3-2-tags src=90f22730}

Ett rutnät med sex kolumner över varje tagg i profilens taggkatalog:

| Kolumn | Betydelse |
|---|---|
| `#` | Position i katalogen (räknat från 1) |
| `Name` | Långt, läsbart namn (t.ex. `profileDescriptionTag`) |
| `ID` | Signatur på 4 tecken (t.ex. `desc`) |
| `Offset` | Byteoffset från filens början |
| `Size` | Taggdatans storlek i byte |
| `Pad` | Utfyllnadsbyte mellan den här taggen och nästa |

Taggens **typsignatur** (t.ex. `descType`, `mft2`, `mAB`) visas tillsammans med offset och storlek överst i den utfällda taggen.

Taggarna sorteras efter offset. Kolumnen **Utfyllnad** är färgkodad — `Pad < 0` (överlappande taggar, följer inte specifikationen) visas i rött; `Pad > 3` (mer utfyllnad än specifikationen tillåter) visas i gult.

**Klicka på en rad** för att fälla ut den på plats (dragspelsvy — en tagg öppen åt gången). Den utfällda detaljvyn slutar alltid med den fullständiga typspecifika beskrivningen — motsvarande IccProfLibs `CIccTag::Describe(verbosity = 100)`. För taggar med stora CLUT:ar eller kurvor (t.ex. `A2B0`, `B2A0`) ingår varje rutnätscell eller kurvpunkt.

Ovanför beskrivningen visar taggar med visualiserbara data en eller flera **inbäddade visualiseringar**, var och en i ett hopfällbart avsnitt:

| Taggtyp | Visualiseringar |
|---|---|
| Tonkurvor (`rTRC`/`gTRC`/`bTRC`/`kTRC`) | Tonkurvan ritad mot identitetslinjen; kurvtabellen ligger hopfälld under den. |
| RGB-färgmedel (`rXYZ`/`gXYZ`/`bXYZ`) och vitpunkt (`wtpt`) | Ett CIE 1931-kromaticitetsdiagram med aktuell primärfärg (eller vitpunkten) markerad; färgmedels- respektive vitpunktsdata visas under. |
| LUT-transformer (`A2B0–3`, `B2A0–3`, `gamt`, `pre0–2`) | Tonkurvor på in- och utgångssidan (överlagrade, färgkodade per färgmedel, med en förklaring för att visa/dölja kurvor); CLUT-gittret som en bild; **Gamut-bild** (för profilens `gamutTag`, färgkodad — neutral = inom gamut, röd = utanför gamut); **utvärderaren** (se nedan); och rådatatabellen, hopfälld. |
| Namngivna färger / färgmedelstabeller (`ncl2`/`nmcl`/`clrt`/`clot`) | Ett spridningsdiagram över färgerna i CIELAB-diagrammet a\*b\* (och CIE xy); tabellerna ligger hopfällda under. |
| Kodningsoberoende kodpunkter (`cicp`) | **Kodpunkter**: färgprimärer, överföringsfunktion, matriskoefficienter och flaggan för fullt omfång, var och en med det namn som ITU-T H.273 definierar. Värden som H.273 inte tilldelar markeras, liksom reserverade byte som inte är noll. |
| Adaptiv förstärkningskurva (`headroomAdaptiveGainCurveTag`) | **Förstärkning vid ett skärmutrymme**, plus **Förstärkningskurva** när taggen lagrar alternativa bilder. Se *HDR gain curves (HAGC)* nedan. |

<div class="note">
<strong>Felaktiga data döljs aldrig.</strong> Om en kurva eller ett annat visualiserbart element underkänns av IccProfLibs validering — till exempel en tonkurva med en degenererad gamma på 0 — visar avsnittet ändå det som går och en ⚠-varning med bibliotekets exakta orsak, i stället för att tyst utelämna diagrammet.
</div>

#### Transformutvärderaren {#the-transform-evaluator src=c70f94b4}

För LUT-transformer (`A2B*` / `B2A*` / förhandsvisningstaggar) tillämpar avsnittet **Utvärdera** just den taggens transform på en enskild färg som du anger, direkt med IccProfLib — ingen extern färgmotor. Riktningen följer taggen (`A2B*` går enhet → PCS; `B2A*` går PCS → enhet), och renderingsavsikten ges av taggen (`…0` perceptuell, `…1` relativ kolorimetrisk, `…2` mättnad).

- Ange indata antingen som **flyttal** (enhetskanaler, eller PCS i läsbara Lab/XYZ-enheter) eller, när taggen har en CLUT, som index för en **rutnätspunkt** (en nodposition i gittret).
- Utdata visas i **både** den interna normaliserade kodningen 0–1 och läsbara enheter (Lab/XYZ för ett PCS-resultat).

Gamuttaggen (`gamt`) har ingen utvärderare — den är en enkanalig karta över inom/utanför gamut snarare än en inverterbar transform; dess gamutbild visas i stället.

### 3.3 Validering {#3-3-validation src=b72d6c69}

Kör checklistan från **ICC Profile Assessment Working Group** mot den inlästa profilen och visar den som en rapport. Kontrollerna kommer från iccDEV-verktyget `iccPawgReport`, kompilerat till en separat WebAssembly-modul som hämtas först när du öppnar fliken första gången. (Samma rapport styr giltighetsmärket i titelraden och kan nås vid start via URL som antingen `VAL` eller den äldre koden `PAWG`.)

Varje kontroll grupperas under **Säkerhet**, **Överensstämmelse** eller **Kvalitet** och får ett utlåtande. Profiler med HDR-innehåll får en fjärde grupp, **HDR**. Dess första kontroll visar om profilen är en **HDR ColorSpace-profil** enligt ICC.1 (avsnitt 8.7.1), och resten kontrollerar de HDR-metadata som avsnittet bygger på:

| Utlåtande | Betydelse |
|---|---|
| **Pass** | Kontrollen lyckades (giltighetsmärket i titelraden: **Godkänd**) |
| **Warn** | Ett icke-kritiskt problem som är värt att granska (märket: **Varning**) |
| **Fail** | Profilen uppfyller inte kontrollen (märket: **Underkänd**) |
| **Gap** | Kontrollen kunde inte utvärderas fullt ut (t.ex. ännu inte implementerad) |
| **N/A** | Kontrollen gäller inte den här profilen |
| **Not Run** | Kontrollen hoppades över |

Sammanfattningsraden överst räknar varje utlåtande som en färgad etikett. **Klicka på en etikett för att filtrera** rapporten nedanför — en blå ring markerar de kategorier som visas just nu, och etiketter med noll poster är inaktiva. Stäng till exempel av **Pass** och **N/A** för att bara se Warn och Fail.

### 3.4 Analys {#3-4-analysis src=9478bc94}

Kvalitetsanalyser för hela profilen, härledda från profilens färgtransformer — beräknade av en särskild WebAssembly-modul (iccDEV:s visualiseringsmotor) som hämtas först när du öppnar fliken första gången, och ritade i appens egen stil.

Varje analys är ett hopfällbart avsnitt och **alla börjar stängda**. Det är avsiktligt: varje avsnitt kräver ett helt transformpass över profilen, så att öppna ett är ditt uttryckliga val, i stället för att sex analyser startar så fort du byter flik. Resultaten cachas, så att öppna ett avsnitt igen går direkt. Ett avsnitt som inte gäller den inlästa profilen visar i stället en kort anmärkning om att det *inte är tillämpligt* (till exempel har en matris/TRC-skärmprofil inga enhet↔PCS-CLUT:ar att analysera).

#### Profilstatistik {#profile-statistics src=f2d4f2db}

Mått för hela profilen för **en** vald renderingsavsikt, styrda av två listrutor och en kryssruta:

- **Renderingsavsikt** — Perceptuell / Relativ kolorimetrisk / Mättnad / Absolut kolorimetrisk.
- **Typ av tur och retur** — vilket noggrannhetsmått som rapporteras (se nedan).
- **Använd MPE-taggar (färg)** — av = de kolorimetriska uppslagstabellerna; på = taggarna med multiprocesselement / färgtaggarna. Den påverkar inte översikten inom gamut och är inaktiverad där.

Tabellen visar **gamutvolymen** (i ΔE\*ab³, omsluten av enhet → PCS-transformen `A2B`, mätt genom att voxelisera gränsen och räkna de omslutna cellerna) tillsammans med vald tur och returs **min / medel / standardavvikelse / P90 / max** ΔE\*ab. Under den finns ett histogram över ΔE-fördelningen — staplar för relativ frekvens med en linje för kumulativ frekvens — plus `L, a, b` för det största felet och, för PRMG, om profilen anger Perceptual Reference Medium Gamut.

De fyra typerna av tur och retur:

- **Översikt inom gamut (RT0)** — ett rutnät av enhetsvärden förs till PCS, tillbaka till enhet och till PCS igen; ΔE\*ab mäts mellan de två PCS-passen. En snabb stabilitetskontroll inom gamut.
- **Inversion + gamut (RT1)** — ΔE\*ab mellan varje enhetsfärgs PCS och dess PCS efter en tur och retur Lab → enhet → Lab. Speglar inversionsnoggrannhet *och* gamutmappning.
- **Reproducerbarhet (RT2)** — ΔE\*ab mellan första och andra tur och retur: hur stabil en upprepad tur och retur är, oberoende av den första turens gamutklippning.
- **PRMG-interoperabilitet** — PCS-färger inom Perceptual Reference Medium Gamut gör en enda tur och retur; ΔE-fördelningen visar interoperabiliteten mellan profiler.

Under histogrammet besvarar **Tur-och-retur-ΔE efter ljushet** den fråga som sammanfattningssiffrorna inte kan: *var* i tonskalan inversionen har svårt, och *hur långt in i gamuten* problemen når.

Diagrammet samplar 32 ljushetsnivåer. På varje nivå tas 64 punkter **på gamutgränsen**, som sedan upprepas förskjutna mot neutralaxeln till 80 %, 50 % och 20 % av sin kroma — totalt 8 192 punkter, var och en ritad för sig, med prickade avgränsare mellan nivåerna.

Läs diagrammet band för band. Inom ett band går punkterna från gamutytan till vänster till neutralt till höger, så felet bör **avta** över bandet: färger nära gränsen är svårast att invertera, färger nära neutralt lättast. Ett band där felet förblir högt hela vägen till neutralt visar en profil med problem vid den ljusheten. De högsta topparna markerar de ljushetsnivåer där själva gamutgränsen inverteras sämst.

Varje startpunkt ligger inom gamut genom konstruktionen, så det du ser är verklig oenighet mellan `B2A` och `A2B`, inte färger som klipps för att de inte kan nås. Observera att diagrammet har sin **egen** sampling — medvetet viktad mot gamutgränsen — så dess medel- och maxvärde är högre än, och inte jämförbara med, tabellen ovan. Det följer renderingsavsikten men inte typen av tur och retur.

En profil som saknar de enhet↔PCS-transformer ett mått kräver visar en anmärkning om att det *inte är tillämpligt*; en enhetsfärgrymd som är för bred för att samplas rapporteras som överhoppad, inte som ett fel.

#### Kolorimetri för ytterlägen {#extrema-colorimetry src=be6c9597}

Ytterlägena i profilens återgivningsomfång — de siffror en tryckare oftast läser först.

- **Vitpunkt** — färgen vid **noll färgmedel**, alltså det bara substratet.
- **Svartpunkt** — tas fram genom att föra PCS-svart (L\*=0, a\*=b\*=0) genom den valda `B2A`-tabellen för att få den färgmängd profilen *väljer* för svart, och sedan läsa tillbaka den färgmängden via `A2B1`.
- Båda visas i **Relativ** och **Absolut** kolorimetri. Absolut visar substratets egen färg (ett blåvitt papper ger något i stil med L\* 95, b\* −4); relativ refererar om den till ett perfekt vitt. Om de två kolumnerna är identiska är det normalt — mediets vitpunkt stämmer helt enkelt med ljuskällan. En profil utan tagg för mediets vitpunkt visar bara relativ.
- **Färgmängd vid svartpunkten** och **TAC** — färgmängden per kanal vid det svarta och summan av dem: total färgmängd (total area coverage), måttet för färgbegränsningen.

Eftersom varje `B2A`-tabell väljer sin egen färgmängd för svart skiljer sig svartpunkten verkligen mellan renderingsavsikterna — därav väljaren för renderingsavsikt.

Därunder finns **Fullton mot maximal kroma**: för varje färghörn (C, M, Y, R, G, B och K), var det hamnar i nyans / kroma / ljushet, och den mest kromatiska punkten på vägen dit från det bara substratet. Raderna mäts via `A2B1` och **ändras därför inte med väljaren för renderingsavsikt**. I en välartad profil sammanfaller de två raderna. När maximal kroma nås *före* fullton markeras raden: efter den punkten tillför den extra färgen ingen kroma längre, den gör bara mörkare.

**Endast utdataprofiler (skrivare)** — analysen förutsätter att noll färgmedel betyder bart substrat. Tabellen per nyans kräver dessutom en enhetsfärgrymd i **CMYK eller CMY**: en n-färgsprofil (nCLR) namnger sina kanaler i valfri ordning, så det går inte att veta vilken kanal som är ”cyan”, och tabellen rapporterar det i stället för att gissa.

#### Bläckning av neutralaxeln {#neutral-axis-inking src=aa5449e4}

Sveper neutralaxeln (a\*=b\*=0) från vitt (L\*=100) ned till svart (L\*=0) genom profilens `B2A`-tabell (PCS → enhet) och ritar hur mycket av varje färgmedel profilen lägger på längs vägen — den klassiska GCR-kurvan / kurvan för neutraluppbyggnad. En kurva per enhetskanal, färgkodad per färgmedel.

Ytterligare en kurva ritas över separationen:

- **L\* ut (ton)** — tonåtergivningen: var neutralaxeln faktiskt hamnar i ljushet efter en tur och retur genom profilen. Läs två saker ur kurvans form. Sjunker den under diagonalen återges gråtoner mörkare än begärt. Mer användbart är att kurvan **planar ut vid den mörkaste ljushet profilen kan nå** — den platån *är* mediets svartpunkt, och den bör stämma med avsnittet Kolorimetri för ytterlägen ovan.

**Endast utdataprofiler (skrivare)**; andra profilklasser visar en anmärkning.

#### Bläckförbrukning i skuggor {#ink-usage-in-shadows src=e62016b7}

Fyra raka banor genom a\*b\*-planet vid en konstant, medvetet mörk ljushet — 0°, 45°, 90° och 135° — förda genom den valda `B2A`-tabellen, med den resulterande separationen ritad för var och en.

Eftersom alla sampel på en bana har samma L\* kommer varje abrupt steg eller omkastning i ett färgmedel enbart från hanteringen av nyans och kroma. Det är signaturen för en gamutmappningsartefakt i skuggorna, och det är sådant som syns i tryck som bandning eller en plötslig färgförskjutning i mörka partier. Banorna går från långt utanför gamuten, genom den och ut på andra sidan, så du ser också var profilen börjar klippa.

Ljushetsplanet väljs automatiskt: halvvägs mellan profilens blå hörn och det mörkaste av C, M, Y, R och G. För de perceptuella tabellerna och mättnadstabellerna sträcks ljusheten först ut från mediets svartpunkt ned till PCS-svart — de tabellerna förväntar sig svart där — och avsnittet visar både det kompenserade planet och det ursprungliga.

**Endast utdataprofiler (skrivare)**, och samma CMYK/CMY-begränsning som tabellen per nyans ovan (planet härleds från färghörnen).

#### Primärbläckvägar genom neutralt {#primary-inking-paths-through-neutral src=cb510c25}

Tre banor — cyan→röd, magenta→grön, gul→blå — som var och en går från ett primärhörn **genom neutralaxeln** vid mittljusheten mellan sina två ändpunkter till det motsatta hörnet, förda genom den valda `B2A`-tabellen och ritade som en separation.

Det här är motsvarigheten inom gamut till Bläckförbrukning i skuggor. Där går banorna medvetet utanför gamuten för att avslöja gamutmappningsartefakter; här ligger **varje sampel inom gamuten genom konstruktionen** — båda ändpunkterna är profilens egna primärfärger och vändpunkten ligger på neutralaxeln. Ett steg, en knyck eller en omkastning i ett färgmedel längs någon av banorna kan därför inte skyllas på gamutklippning: det är ett jämnhetsfel i CLUT:en. Den neutrala vändpunkten ligger mitt i varje diagram, där du bör se en balanserad neutraluppbyggnad.

För de perceptuella tabellerna och mättnadstabellerna svartpunktskompenseras ljusheten för renderingsavsikten, precis som i Bläckförbrukning i skuggor.

**Endast utdataprofiler (skrivare)**, med samma CMYK/CMY-begränsning (hörnen kommer från samma källa som tabellen per nyans).

#### Statistik för färgförbrukning {#ink-usage-statistics src=191fd7cd}

Hur mycket av varje färgmedel profilen lägger på, som medeltäckning och som **andel av totalen** — separationens signatur för färgförbrukning.

Tabellen summerar varje färgmedel längs neutralaxeln och anger dess medeltäckning och dess procentandel av all pålagd färg. Andelskolumnen är det diagnostiska måttet: den är profilens fingeravtryck för neutraluppbyggnaden (en gråbalans med mycket cyan ser annorlunda ut än en med mycket svart), och den är oberoende av hur många sampel som togs.

En andra tabell — färgförbrukning över **alla färger på och inom gamuten** — står som *kommer senare*: den kräver en konstruktion av gamutgränsen som ännu inte är byggd.

**Endast utdataprofiler (skrivare).**

#### CLUT-bild {#clut-image src=a3fec568}

Färguppslagstabellen för en enhet↔PCS-transform, utlagd som en bild, med en väljare för vilken renderingsavsikts tabell som ska visas (`A2B0`–`A2B3`, `B2A0`–`B2A3` och förhandsvisningstabellerna). Användbart för att se strukturella skador i en tabell med en blick. Zooma, panorera och återställ med kontrollerna på bildytan.

När du väljer en **`B2A`-tabell (PCS → enhet)** visas en **gråskalebild av färgtäckningen för varje färgmedel** under gittret — separationerna per färg, där mörkare betyder mer av den färgen. En ledtråd överst i avsnittet hänvisar dig dit, eftersom avsnittet öppnas med en `A2B`-tabell (vars utdata är L\*a\*b\*, inte färger). För **n-färgsutdata (nCLR)** — 5, 6 eller 7 färger — där det inte finns någon enkel färgförhandsvisning, **färghanteras huvudbilden genom profilens framåtriktade `A2B`** så att den ändå återges i verkliga färger i stället för som en enkanalig gråbild.

#### Gamut-bild {#gamut-image src=92f58c0f}

Gamuttaggens karta över inom/utanför gamut: neutral där en PCS-färg kan återges, röd där den hamnar utanför enhetens gamut. Finns bara när profilen har en `gamt`-tagg.

### 3.5 XML {#3-5-xml src=dfd43c4e}

Konverterar profilen till XML (via IccLibXML, samma skrivare som iccDEV:s kommandoradsverktyg `iccToXml` använder) och visar den i en CodeMirror-redigerare med syntaxmarkering. Redigera XML-koden och klicka på **Konvertera till ICC** för att gå tillbaka till binärformat; visaren validerar på nytt och knappen **Spara ICC-profil** i fältet på fliken Profil laddar ned resultatet.

En indikator för **osparade ändringar** visas när redigerarens text skiljer sig från konverterarens senaste utdata, så att du direkt ser om dina ändringar har tillämpats. Om konverteringen misslyckas visas IccLibXML:s tolkningsfel ovanför redigeraren med den felaktiga raden / kolumnen.

### 3.6 JSON {#3-6-json src=59c3f2e5}

Samma idé som fliken XML, men med en JSON-representation av profilen som skapas av validerarens wrapper (`json-wrapper.cpp`). Redigera, klicka på **Konvertera till ICC**, spara. JSON-formen är kompaktare och lättare att skripta mot; XML-formen är mer bekant om du har använt iccDEV:s kommandoradsverktyg.

---

## 4. Fliken Länka {#4-combine-tab src=735d6198}

profiletool samlar varje inläst profil i en **profilpool** till vänster. Överst finns fem flikar — **Profil** (visaren för en profil ovan), **Jämför**, **Länka**, **Spektral** och **HDR**. På fliken **Länka** kedjar du ihop profiler och sätter dem i arbete: skapa en **DeviceLink**, **transformera en bild** eller **transformera ett färgdataset** genom kedjan.

### 4.1 Bygga en kedja {#4-1-building-a-chain src=83ab772c}

Dra en eller flera profiler från poolen till kortet Länka för att lägga till dem i kedjan, i ordning. Kedjan är en **lodrät stapel**: källan överst, målet längst ned. Varje profil bidrar med **en transform**, och verktyget visar färgrymden in i och ut ur den (t.ex. `RGB → Lab`), med den **anslutande färgrymden** angiven på linjen mellan stegen. Motorn validerar hela kedjan löpande och visar flödet från början till slut (t.ex. *Kedja: RGB → CMYK*) eller förklarar, steg för steg, var den inte hänger ihop.

- **Ändra ordning** på ett steg genom att dra i dess grepp (`⠿`) eller med knapparna ▲ / ▼; ta bort ett med ×.
- **Vänd riktning** — knappen ⇅ på den första transformen vänder kedjans riktning, vilket sprider sig genom de följande stegen.
- **Renderingsavsikt** — välj en för hela kedjan med *Återgivningsalternativ (alla)*, eller åsidosätt ett enskilt steg med dess egen listruta. Håll muspekaren över någon av kontrollerna för en beskrivning av den valda avsikten. Utöver de fyra grundläggande avsikterna erbjuder en profil som har de tabeller som behövs även varianterna *no D2Bx/B2Dx* och *+ BPC* (svartpunktskompensation).

<div class="note">
<strong>HDR ColorSpace-profil i kedjan.</strong> En HDR ColorSpace-profil enligt ICC.1 har inga TRC-taggar — avsnitt 8.7 definierar inga för en ColorSpace-profil — så en transform genom den använder dess <code>AToB0Tag</code>. Den tabellen är den HDR&#8594;SDR-återgivning som avsnitt 8.7.1.5 kräver för programvara utan HDR-bearbetning. Kortet anger detta när en kedja innehåller en HDR ColorSpace-profil: den DeviceLink, bild eller data du skapar återspeglar SDR-reserven, inte profilens HDR-beteende.
</div>

### 4.2 Skapa DeviceLink {#4-2-make-devicelink src=2cb72a0d}

Bakar ihop hela kedjan till en enda **DeviceLink**-profil (en webbläsarport av iccDEV:s `iccApplyToLink`). Ge den ett namn och klicka på **Skapa DeviceLink**; resultatet hamnar i poolen och i Länka-samlingen som vilken profil som helst, redo att granskas på fliken Profil eller återanvändas i en annan kedja.

### 4.3 Transformera bild {#4-3-transform-image src=461fcd83}

Släpp en rasterbild (TIFF, PNG eller JPEG) i bildplatsen och klicka på **Transformera bild** för att köra den genom kedjan (en webbläsarport av `iccApplyProfiles`). Bilden kontrolleras först genom att bara huvudet läses — dess färgrymd måste stämma med kedjans indata. Resultatet **laddas ned**; bilder sparas aldrig i poolen.

När en giltig bild är inläst visas panelen **Alternativ för bildutdata** med inställningarna för målet, som motsvarar kommandoradsverktyget `iccApplyProfiles`:

- **Kodning** — *Samma som källan*, 8-bitars, 16-bitars eller **Flyttal (32-bitars)**.
- **Komprimering** — Ingen, **LZW** eller **ZIP** (Deflate).
- **Planformat** — **Sammansatt** (sammanflätade kanaler) eller **Separerad** (separata plan).
- **CMM-interpolation** — **Tetraedrisk** eller **Linjär**.
- **Bädda in ICC** — märk utdatan med kedjans sista profil (utdatafärgrymdens).

Standardvalet behåller RGB/Gray-utdata som PNG; väljer du ett alternativ som bara finns för TIFF (flyttal, LZW/ZIP eller separata plan) byts filformatet till TIFF.

<div class="note">
<strong>Inbäddade profiler:</strong> om den släppta bilden har en egen inbäddad ICC-profil erbjuder en banderoll att <strong>extrahera</strong> den — profilen läggs till i poolen och placeras först i kedjan (som dess källfärgrymd) med ett klick.
</div>

### 4.4 Transformera data {#4-4-transform-data src=96934eec}

Släpp ett färgdataset (CGATS/IT8, CSV, CxF eller JSON) i dataplatsen och klicka på **Transformera data** för att köra varje färgfält genom kedjan (motsvarigheten till `iccApplyNamedCmm`). Verktyget läser vilka slags data datasetet innehåller (enhet / Lab / XYZ / spektral) och matar in det som kedjans indata kräver; **spektrala** indata räknas om till kolorimetri med iccDEV:s kanoniska beräkning, med den **Observatör** och **Ljuskälla** du väljer. Dubbletter av färgfält kan filtreras (median eller medelvärde). Resultatet öppnas i en tabell som du kan **Spara** som CSV.

### 4.5 Observatörsbyte {#4-5-observer-change src=738ba4d4}

Fliken Länka har **två** skaparkort. Ovanför Länkpipeline bygger kortet **Observatörsbyte** en v4.3-skärmprofil av typen matris/TRC från en V5 RGB-skärmprofil plus en V5-observatörsprofil (PCC). Dra båda till kortet — de placeras automatiskt i platserna **V5 RGB-skärm** och **V5-observatör (PCC)** efter profilklass — klicka sedan på **Skapa V4-skärmprofil**, ge profilen ett namn och klicka på **Skapa**. Resultatet läggs till i poolen och på fliken. En profil som är varken det ena eller det andra ignoreras med en varning.

### 4.6 Flikarna Jämför och Spektral {#4-6-compare-and-spectral-tabs src=b934d7e3}

Fliken **Jämför** lägger gamutgränserna för två eller fler profiler från poolen över varandra — ett 3D-skal plus ett 2D-snitt i ljushet — så att du ser var de skiljer sig. När profilerna är HDR ColorSpace-profiler förklarar anmärkningen **Visar SDR-reserven** att varje gamut byggs från SDR-återgivningen i `AToB0Tag`, inte från profilens HDR-omfång, som inte kan ritas i ett begränsat PCS. Fliken **Spektral** monterar en uppsättning enkanaliga spektralbilder (släppta i kanalordning) till en flerkanalig TIFF (`iccSpecSepToTiff`).

## 5. Redigering fram och tillbaka {#5-round-trip-editing src=595f380b}

Både fliken XML och fliken JSON kan skriva tillbaka profilen till ICC-binärformat. Ett typiskt arbetsflöde:

1. **Läs in** en ICC-profil.
2. Öppna fliken **XML** eller **JSON**. Klicka på **Konvertera till XML** / **Konvertera till JSON** för att fylla redigeraren.
3. **Redigera** i redigeraren på sidan. En indikator för osparade ändringar visas bredvid verktygsfältet.
4. Klicka på **Konvertera till ICC**. Wrappern bygger en ny profil, kör valideringen igen och uppdaterar flikarna Rubrik / Taggar / Validering.
5. Etiketten **● Ändrad — osparad** visas bredvid filnamnet i fältet på fliken Profil.
6. Klicka på **Spara ICC-profil**. De redigerade byten laddas ned som `<original>-edited.icc`.

De båda redigerarna är oberoende — att redigera XML och sedan JSON blandar inte ihop de två vägarna. Det är de senast skapade ICC-byten som sparas.

<div class="note">
<strong>Förbehåll:</strong> hur troget konverteringen blir beror på vad IccLibXML / JSON-wrappern stöder för varje taggtyp. Om en taggtyp inte kan representeras går detaljer förlorade fram och tillbaka; kontrollera fliken Validering efter återkonverteringen för att bekräfta att allt fortfarande tolkas felfritt.
</div>

Fliken Taggar markerar varje tagg vars byte skiljer sig från den ursprungliga inläsningen, så att det är lätt att se vad dina ändringar har påverkat.

---

## 6. Starta från chardata {#6-launching-from-chardata src=b39a6805}

I **chardata** läser du in en ICC-profil, klickar på **Display File** för att öppna visaren på sidan och klickar sedan på **Launch editor**. En ny flik öppnas här med `?source=chardata` i URL:en.

Överlämningen sker helt i webbläsaren:

1. profiletool öppnas, upptäcker `?source=chardata` och skickar `{type:'profiletool:ready'}` till `window.opener` via `postMessage`.
2. chardata svarar med `{type:'profiletool:load', filename, bytes}`.
3. profiletool tar emot byten (efter att ha kontrollerat avsändarens ursprung mot en tillåtelselista och storleken mot gränsen på 256 MB), kör valideringen och visar profilen.

Ingen uppladdning, ingen tur och retur till någon server. Flödet går bara åt ett håll — ändringar du gör här sparas genom att du klickar på **Spara ICC-profil**, de lämnas inte tillbaka till chardata.

---

## 7. Starta med en URL {#7-launching-with-a-url src=f9a8d871}

Du kan öppna verktyget med en länk som anger en profil att läsa in — och vilken flik som ska öppnas — med hjälp av ett **URL-fragment** (delen efter `#`):

```
https://chardata.colourbill.com/profiletool#url=<profile-url>&tab=<tab>
```

Båda parametrarna är valfria:

- **`url=`** — webbadressen som profilen hämtas från. Byten laddas ned i din webbläsare och går sedan exakt samma väg som en lokal fil: kontrollen av `acsp`-huvudet, fullständig `ValidateIccProfile`, storleksgränsen på 256 MB och reservläget för profiler som inte kan tolkas. Inget laddas upp — de hämtade byten matas bara till valideraren och skickas aldrig vidare.
- **`tab=`** — vilken vy som ska öppnas när profilen har lästs in.

Ett fullständigt exempel:

```
https://chardata.colourbill.com/profiletool#url=https://example.org/profiles/sRGB.icc&tab=VAL
```

<div class="note">
<strong>Varför ett fragment och inte en frågesträng?</strong> Delen efter <code>#</code> skickas aldrig till en webbserver, så adressen till profilen du granskar stannar på din egen dator.
</div>

### Fliknamn {#tab-names src=d3a4dbae}

`tab=` godtar två likvärdiga namnscheman som inte är skiftlägeskänsliga. De **korta** koderna är den föredragna formen:

| Vy | Kort kod | Långt namn |
|---|---|---|
| Rubrik | `HEADER` | `Header` |
| Taggar | `TAGS` | `Tags` |
| Validering | `VAL` | `Validation` |
| Analys | `ANALYSIS` | `Analysis` |
| XML | `XML` | `XML` |
| JSON | `JSON` | `JSON` |

De långa namnen är de engelska fliketiketterna utan mellanslag. Båda schemana hålls stabila även om de synliga etiketterna byter namn, så befintliga länkar fortsätter att fungera. Fliken Validering svarar också på den äldre koden `PAWG` (den hette tidigare ”Profile Assessment WG”). Ett okänt `tab=`-värde ignoreras och vyn Rubrik öppnas.

<div class="note">
<strong>Krav för <code>url=</code>:</strong> profilen måste levereras över <strong>HTTPS</strong>, och servern måste tillåta läsning från andra ursprung (ett tillåtande <code>Access-Control-Allow-Origin</code>-huvud / CORS-huvud). Saknas något av dem blockerar webbläsaren hämtningen och verktyget visar ett hämtningsfel. Om själva profilens URL innehåller <code>&</code> eller <code>#</code> (en egen frågesträng) ska hela <code>url=</code>-värdet procentkodas så att de tecknen inte avslutar fragmentet i förtid.
</div>

---

## 8. Mobil {#8-mobile src=cb948e3c}

På skärmar smalare än 700 px:

- Inställningspanelen fälls ihop till en låda som glider in från höger.
- En flytande **⚙**-knapp uppe till höger öppnar / stänger Inställningar.
- En **?**-knapp under ⚙ öppnar den här handboken i dess inglidande panel.
- En **✉**-knapp öppnar kontaktformuläret i en ny webbläsarflik.
- Ett tryck på den nedtonade bakgrunden stänger den öppna lådan.
- Taggtabellen ordnas om från ett brett rutnät till staplade kort så att varje kolumn förblir läsbar utan vågrät rullning; en tagg fälls fortfarande ut på plats.
- **Tryck ersätter dra och släpp.** iOS saknar dra och släpp, så att dra en profil från poolen till en flik fungerar inte där. **Tryck i stället på profilerna för att markera dem och tryck sedan på den flik** du vill ha dem på — samma resultat som att dra. Poolen visar den här påminnelsen när en pekskärm används.
- **På iPhone och iPad listar filväljarna alla filer.** iOS matchar ett filtypsfilter mot typer som systemet känner till, och det känner inte till `.icc`, `.icm`, `.cube` eller `.exr`, så ett filter skulle gråa ut exakt de filer du vill öppna. Välj profilen efter namn; allt som inte är en profil avvisas ändå med en förklaring efter inläsningen.

Alla funktioner är tillgängliga; layouten anpassas till den mindre skärmen.

---

## 9. Gränser och säkerhet {#9-limits-and-security src=ce1e9474}

profiletool gör inga nätverksanrop efter den första sidinläsningen. Valideraren, XML-konverteraren, JSON-konverteraren och bildkodekarna är alla WebAssembly kompilerat från C++-källkod och körs helt på klientsidan. Fliken HDR visar en släppt bild via en lokal objekt-URL, så bilden lämnar aldrig fliken. **Identifiera skärmar** frågar webbläsaren, inte en server, vilken skärm fönstret ligger på.

| Gräns | Var | Kommentar |
|---|---|---|
| **256 MB** | postMessage / filinläsning | Vägrar läsa in något större; förhindrar att heapen töms av ett fientligt öppnande fönster |
| **32 MB** | XML- och JSON-konverterarna | Både JS-skyddet (`MAX_XML_BYTES` / `MAX_JSON_BYTES`) och C++-wrapparna (`kMaxXmlBytes` / `kMaxJsonBytes`) upprätthåller gränsen; C++-sidan gäller oberoende av JS-sidan |
| **Skydd mot XML-entitetsbomber** | XML-konverteraren | XML som innehåller `<!DOCTYPE` eller `<!ENTITY`, eller en NUL-byte, avvisas innan libxml2 ser den. libxml2:s egna gränser för entitetsexpansion är också aktiva, så detta är ett andra försvarslager mot ”billion laughs”-indata |
| **512 MB** | Fil på fliken HDR | Kontrolleras mot filens storlek innan något av den läses; motsvarar bildkodekarnas egen indatagräns på 512 MB |
| **40 megapixlar**, **64 pixlar per byte** | Avkodning av Radiance HDR (fliken HDR) | Båda kontrolleras utifrån huvudet och filstorleken innan något pixelminne allokeras; den andra stoppar dekomprimeringsbomber med upprepningsmarkörer |
| **Avkodningsbudget för EXR** | Avkodning av OpenEXR | Bredd × höjd × kanaler × 4 byte måste rymmas inom 512 MB, kontrollerat utifrån huvudet innan avkodaren allokerar något |
| **Genomgång av HEIC/AVIF-boxar** | Extrahering av profiler | Boxstorlekar kontrolleras utan överspill, nästlingen begränsas till 8, en profil till 64 MB (per fil, totalt) och objektassociationer till 65 536 |
| **Tillåtelselista för ursprung** | Start via postMessage | Bara samma ursprung och chardatas utvecklingsvärdar kan skicka byte med `profiletool:load` |
| **HTTPS + CORS** | Start via `#url=` | En profil som startas via URL måste levereras över HTTPS från en värd som tillåter läsning från andra ursprung; de hämtade byten matas bara till valideraren och skickas aldrig vidare |

Start via `#url=` (tillagt i 1.1.5) är det enda fallet där verktyget gör ett anrop till ett annat ursprung efter sidinläsningen: det vidgar Content-Security-Policy-direktivet `connect-src` till `https:` så att den angivna profilen kan hämtas. Inläsning av skript vidgas **inte** — bara datahämtningar.

Om du behöver granska en profil som överskrider dessa gränser kan du bygga iccDEV från källkod och använda de inbyggda kommandoradsverktygen — de har inga gränser på JS-sidan.

### Licens {#licence src=e7a2a884}

profiletool släpps under MIT-licensen. Appen innehåller också tredjepartskomponenter under egna licenser: iccDEV:s IccProfLib (International Color Consortium), LibTIFF, libpng, zlib, libxml2, JSON for Modern C++, Emscripten-körmiljön och JavaScript-paket som React, Plotly och CodeMirror. Den här programvaran bygger delvis på arbete av Independent JPEG Group. De fullständiga meddelandena finns i [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt).

### Täckning av ICC.2 (iccMAX) {#icc-2-iccmax-coverage src=3d2b33e8}

Både **ICC.1**- och **ICC.2**-profiler stöds, men täckningen av ICC.2 är **ofullständig**. Inläsning, vyerna för huvud och taggar, validering, XML/JSON fram och tillbaka och transformmotorerna förstår alla ICC.2; de kända luckorna är arbetsflöden med flerdelad **ICS**-utväxling, val av en V5-**delprofil** när en transform tillämpas, och omvänd sökning i vissa ICC.2-profiler. En profil som använder en ICC.2-konstruktion som inte stöds rapporteras av fliken Validering i stället för att tyst tolkas fel.
