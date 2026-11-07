<!-- (c) 2026 William Li -->

<!-- de translation of MANUAL.md. Translate the text; keep every {#anchor src=…} exactly as it is. -->

# ICC-Profil-Tool — Benutzerhandbuch {#icc-profile-tool-user-manual src=38bba1de}

**ICC-Profil-Tool** (profiletool) ist ein browserbasiertes Werkzeug zum Untersuchen, Validieren und Bearbeiten im Rundlauf von **ICC.1**- und **ICC.2 (iccMAX)**-Farbprofilen. Es läuft vollständig in Ihrem Browser — ohne Upload, ohne Installation — und nutzt dazu einen WebAssembly-Build von [iccDEV](https://github.com/InternationalColorConsortium/iccDEV), der offiziellen Demo-Implementierung von IccProfLib durch das ICC.

**Was Sie damit tun können:**

- **Header durchsehen** — jedes Feld des 128 Byte langen Profil-Headers, dekodiert in gut lesbare Zeichenketten.
- **Tag-Verzeichnis durchsehen** — jedes Tag mit Signatur, Typ, Byte-Offset, Größe und Auffüllbytes. Klicken Sie auf ein Tag, um eine vollständige, typspezifische Beschreibung aufzuklappen (dieselbe Ausgabe wie die „Describe“-Ansicht von iccDEV `wxProfileDump`), und — bei Tags, die so etwas enthalten — eine eingebettete **Visualisierung**: Tonwertkurven, Chromazitätsdiagramme, CLUT- und Gamut-Bilder, Streudiagramme benannter Farben sowie einen **Transformationsauswerter** für einzelne Farbwerte.
- **Validieren** — die Checkliste der ICC Profile Assessment Working Group ausführen (Sicherheit / Konformität / Qualität), jede Prüfung mit einem Ergebnis, filterbar nach Kategorie.
- **Im Rundlauf bearbeiten** — das Profil nach XML oder JSON konvertieren, im integrierten Code-Editor bearbeiten, zurück nach ICC konvertieren und erneut validieren. Die Speichern-Schaltfläche lädt die bearbeitete Binärdatei herunter.
- **Profile verketten** — ziehen Sie im Tab **Verknüpfen** Profile aus dem Pool in eine geordnete Kette und erzeugen Sie daraus einen **DeviceLink**, **transformieren Sie ein Bild** durch die Kette (mit voller Kontrolle über Ausgabekodierung, Komprimierung, Planaranordnung und ICC-Einbettung) oder **transformieren Sie einen Farbdatensatz**.
- **Mit HDR arbeiten** — ein Profil gegen die Regeln für ICC.1-HDR-ColorSpace-Profile (Abschnitt 8.7.1) prüfen, seine cICP-Codepunkte lesen und seine adaptive Verstärkungskurve für jeden Display-Spielraum darstellen. Der Tab **HDR** zeigt ein HDR-Bild auf Ihrem Display, und **Einstellungen → Umgebung** meldet, was dieser Browser und dieses Display können.
- **Aus chardata starten** — ein in [chardata](https://chardata.colourbill.com/) geladenes Profil direkt hier öffnen; die Bytes werden im Browser per `postMessage` übergeben.
- **Per URL starten** — einen Link öffnen, der das Tool auf ein im Web bereitgestelltes Profil verweist und optional den Tab angibt, der geöffnet werden soll (z. B. `…/profiletool#url=…&tab=VAL`).

Alles läuft clientseitig. Die Profilbytes verlassen den Browser-Tab nie.

<div class="note">
<strong>Die Unterstützung für ICC.2 (iccMAX) ist unvollständig.</strong> ICC.2-Profile lassen sich wie ICC.1-Profile laden, untersuchen, validieren und im Rundlauf bearbeiten — die Validierungs-Checkliste enthält iccMAX-spezifische Prüfungen, spektraler PCS und Tags mit Multi-Processing-Elementen werden dekodiert, und die Transformationsmodule sind gegen den vollständigen iccMAX-Stack gebaut. Noch nicht abgedeckt: mehrteilige <strong>ICS</strong>-Workflows (Interchange Color Space), die Auswahl eines V5-<em>Unterprofils</em> beim Anwenden einer Transformation und die inverse Suche bei manchen ICC.2-Profilen. Rechnen Sie bei den ausgefalleneren ICC.2-Funktionen mit Lücken; sie werden Release für Release geschlossen.
</div>

<div class="note">
<strong>Die Unterstützung für HDR-ColorSpace-Profile folgt einem Entwurf.</strong> Die HDR-Prüfungen, die Ansichten des <code>headroomAdaptiveGainCurveTag</code> und der HDR-Tab setzen die HDR-Ergänzung zu ICC.1 in ihrem aktuellen Stand um. Die Ergänzung ist noch nicht veröffentlicht; Details können sich bis dahin noch ändern.
</div>

---

## Inhalt {#contents src=54605fa3}

1. [Der Arbeitsbereich](#1-the-workspace)
2. [Einstellungen](#2-settings-panel)
3. [Profilansichten](#3-profile-views)
   - [Header](#3-1-header)
   - [Tags](#3-2-tags)
   - [Validierung](#3-3-validation)
   - [Analyse](#3-4-analysis)
   - [XML](#3-5-xml)
   - [JSON](#3-6-json)
4. [Tab „Verknüpfen“](#4-combine-tab)
   - [Eine Kette aufbauen](#4-1-building-a-chain)
   - [DeviceLink erstellen](#4-2-make-devicelink)
   - [Bild transformieren](#4-3-transform-image)
   - [Daten transformieren](#4-4-transform-data)
   - [Beobachterwechsel](#4-5-observer-change)
   - [Tabs „Vergleichen“ und „Spektral“](#4-6-compare-and-spectral-tabs)
   - [HDR-Tab](#4-7-hdr-tab)
5. [Bearbeiten im Rundlauf](#5-round-trip-editing)
6. [Start aus chardata](#6-launching-from-chardata)
7. [Start per URL](#7-launching-with-a-url)
8. [Mobilgeräte](#8-mobile)
9. [Grenzwerte und Sicherheit](#9-limits-and-security)

---

## 1. Der Arbeitsbereich {#1-the-workspace src=4bc9350f}

profiletool ist eine **Werkbank für mehrere Profile**. Das Fenster besteht aus drei Teilen:

- dem Bereich **Profile** am linken Rand — dem *Pool* aller geladenen Dateien;
- der **Arbeitsfläche** rechts davon mit fünf Tabs am oberen Rand — **Profil**, **Vergleichen**, **Verknüpfen**, **Spektral**, **HDR**;
- der Seitenleiste **Einstellungen** am rechten Rand (siehe [Einstellungen](#2-settings-panel)).

### Profile laden {#loading-profiles src=2cd0f653}

Dateien lassen sich auf zwei Arten laden:

- Klicken Sie oben im Profilbereich auf **Profile laden** und wählen Sie eine oder mehrere Dateien aus, oder
- ziehen Sie Dateien per **Drag-and-drop** auf den Profilbereich.

Sie können `.icc`- / `.icm`-Profile *und* Bilder laden. Legen Sie ein **TIFF, PNG, JPEG, HEIC oder AVIF** ab, extrahiert das Tool dessen **eingebettetes ICC-Profil** und fügt es dem Pool hinzu. Dabei werden nur die Metadaten der Datei gelesen, nie die Pixel. Bei HEIC und AVIF durchläuft es die Boxen der Datei; das funktioniert daher in jedem Browser, auch in solchen, die diese Formate nicht anzeigen können. Eine **JPEG XL**-Datei wird ebenfalls abgewiesen: Ihr Profil ist im Codestream komprimiert, den profiletool noch nicht dekomprimiert. Videos und Kamera-Rohdateien, die den Container von HEIC verwenden (MP4, QuickTime, Canon CR3), werden nicht als Bilder behandelt. Eine **OpenEXR**- oder **Radiance HDR**-Datei (`.hdr`) wird mit Begründung abgewiesen: Keines der beiden Formate sieht einen Platz für ein ICC-Profil vor. OpenEXR gibt seine Farbe über Chromatizitäten an, Radiance HDR über eine optionale Header-Zeile `PRIMARIES`. Um ein Bild *anzusehen*, verwenden Sie den [HDR-Tab](#4-7-hdr-tab). Die Schaltfläche **＋ Neu aus .cube** erstellt einen DeviceLink aus einer `.cube`-LUT. Das Ergebnis wird dem Pool hinzugefügt und im Tab **Profil** geöffnet; heruntergeladen wird erst, wenn Sie auf **ICC-Profil speichern** klicken.

Ein Profil wird akzeptiert, wenn seine ersten 36 Bytes die Signatur `acsp` enthalten und es von `ValidateIccProfile` aus IccProfLib eingelesen werden kann. Dateien, bei denen das scheitert, werden mit dem jeweiligen Grund in einer Ablehnungsübersicht aufgeführt; ihre Bytes werden nicht aufbewahrt.

### Der Profilbereich {#the-profiles-pane src=04750126}

Geladene Profile werden nach **Profilklasse** in aufklappbare Abschnitte gruppiert (Input, Display, Output, DeviceLink, ColorSpace, Abstract, Named Color, …). **HDR-ColorSpace-Profile** nach ICC.1 Abschnitt 8.7.1 erhalten stattdessen einen eigenen Abschnitt ganz oben (sie sind Profile der Klasse ColorSpace und werden deshalb aus dem ColorSpace-Abschnitt herausgehoben), unterteilt nach Übertragungsfunktion in **Lineare Übertragung** und **Nichtlineare Übertragung (PQ, HLG)**; die Übertragung erscheint als Badge in jeder Zeile. Die Unterteilung ist im [HDR-Tab](#4-7-hdr-tab) wichtig, wo nur ein Profil mit linearer Übertragung einem OpenEXR- oder Radiance-HDR-Bild zugewiesen werden kann. Jede Zeile zeigt den Dateinamen und Badges für Klasse, Farbraum, Version und Größe; ein Profil, das nur teilweise eingelesen werden konnte, wird markiert. Mit der Schaltfläche **A–Z** wechseln Sie die Sortierung (Ladereihenfolge → aufsteigend → absteigend), mit dem **×** in einer Zeile entfernen Sie das Profil, und mit dem Griff am rechten Rand des Bereichs ändern Sie dessen Breite — oder klappen ihn ganz ein.

Klicken Sie, um eine Zeile auszuwählen; Strg/Cmd-Klick schaltet die Auswahl um, Umschalt-Klick wählt einen Bereich aus. **Ziehen Sie Zeilen aus dem Pool auf einen Tab**, um mit ihnen zu arbeiten.

<div class="note">
<strong>Der Pool gilt nur für die aktuelle Sitzung.</strong> Nichts wird hochgeladen und nichts dauerhaft gespeichert — Ihr Dateisystem bleibt der dauerhafte Speicherort. Ein Neuladen der Seite leert den Pool.
</div>

### Die Tabs {#the-tabs src=034c9677}

| Tab | Funktion |
|---|---|
| **Profil** | Untersucht **ein** Profil — Header, Tags, Validierung, Analyse, XML, JSON. Ein hier abgelegtes neues Profil ersetzt das aktuelle. |
| **Vergleichen** | Überlagert die Gamuts von **zwei oder mehr** Profilen. |
| **Verknüpfen** | Verkettet Profile zu einem DeviceLink oder transformiert ein Bild / einen Datensatz durch sie. |
| **Spektral** | Fügt einkanalige Spektralbilder zu einem mehrkanaligen TIFF zusammen. |
| **HDR** | Zeigt **ein** HDR-Bild auf Ihrem Display, mit einem Regler SDR ↔ HDR. Siehe [HDR-Tab](#4-7-hdr-tab). |

Spektral und HDR nehmen Bilddateien direkt entgegen statt Profile aus dem Pool. Jeder der übrigen Tabs führt seine eigene Profilauswahl, angezeigt als entfernbare Chips unterhalb der Tab-Leiste, mit einem Zähler-Badge am Tab selbst. Das erste geladene Profil öffnet sich automatisch im Tab **Profil**; danach ziehen Sie aus dem Pool auf den gewünschten Tab. Dateien, die Sie direkt auf einem Tab ablegen, werden in einem Schritt in den Pool geladen *und* auf diesen Tab gelegt.

<div class="note">
<strong>Größenbegrenzung:</strong> Der Lader weist alles ab, was größer als 256 MB ist. Echte Profile liegen normalerweise deutlich unter 10 MB; die Grenze soll nur verhindern, dass eine feindselige Ablage oder postMessage den WASM-Heap des Tabs erschöpft.
</div>

---

## 2. Einstellungen {#2-settings-panel src=3bf599d9}

Öffnen Sie die Einstellungen mit der Schaltfläche **⚙** am rechten Bildschirmrand (auf Mobilgeräten mit dem Zahnradsymbol oben rechts). Das Panel schiebt sich über den Inhalt, ohne dessen Größe zu ändern.

Unter ⚙ befinden sich zwei weitere Schaltflächen:

- **?** öffnet dieses Handbuch **in der App**, als Bereich, der sich über das Fenster schiebt. In seiner Kopfzeile befindet sich ein Suchfeld — tippen Sie, um Treffer hervorzuheben, und springen Sie dann mit `Enter` / `Shift+Enter` (oder den Schaltflächen `˄` `˅`) von Treffer zu Treffer; `Escape` löscht die Suche, ein zweites `Escape` schließt den Bereich.
- **✉** öffnet das Kontaktformular auf colourbill.com in einem neuen Browser-Tab.

Das Panel hat zwei Gruppen, **Anzeige** und **Umgebung**. Um das Panel breiter oder schmaler zu machen, ziehen Sie an seinem linken Rand (220–560 px); die Breite wird gespeichert.

### Hintergrund {#background src=1450fe76}

Schaltet die App zwischen den Designs **Hell**, **Dunkel** und **System** (folgt der Einstellung des Betriebssystems) um. Die Wahl bleibt über Sitzungen hinweg erhalten. Im Modus **System** abonniert die App `prefers-color-scheme` und wechselt automatisch, wenn sich das Design des Betriebssystems ändert; die ausdrückliche Wahl von Hell oder Dunkel trennt diesen Listener.

### Zahlenformat {#number-format src=af65622c}

Legt fest, wie Zahlenwerte in allen Profilansichten angezeigt werden — **Hexadezimal** oder **Dezimal**.

### Sprache {#language src=38c60535}

Überschreibt die Sprache der Benutzeroberfläche. **Systemstandard (…)** erkennt die Browser-Locale und verwendet die nächstliegende unterstützte Sprache; der Name in der Klammer steht in der jeweiligen Landessprache, sodass Sie sehen, welche gewählt wurde. Übersetzt ist die Oberfläche der App: der Profilbereich, die Tab-Beschriftungen, die Werkzeuge Verknüpfen, Spektral und HDR, die Ansichten der HDR-Verstärkungskurven unter Tags, das Einstellungspanel einschließlich Umgebung und ihrer Begründungen sowie die Bedienelemente dieses Handbuchs. Manche Texte werden nicht übersetzt:
- Von IccProfLib erzeugte Zeichenketten — Tag-Beschreibungen, Validierungsmeldungen, Namen der Header-Felder — stammen aus der C++-Bibliothek und sind englisch.
- Der Name des Browser-Flags bleibt englisch, damit er mit der Flag-Seite des Browsers übereinstimmt.
- Das Protokoll **Display-Ereignisse** im Umgebungs-Panel bleibt englisch, damit es unverändert in einen Fehlerbericht eingefügt werden kann.
- Dieses Handbuch folgt derselben Einstellung, mit Ausnahme seiner HDR-Abschnitte, die englisch bleiben, solange sich die HDR-Unterstützung in der Beta-Phase befindet und ihr Text sich noch ändert. Ein Abschnitt, der seit der letzten Aktualisierung seiner Übersetzung auf Englisch überarbeitet wurde, erscheint ebenfalls auf Englisch, mit einem Hinweis, bis die Übersetzung nachgezogen ist.

Unterstützte Sprachen: English, Français, Deutsch, Italiano, Español, Português (PT), Português (BR), Svenska, 中文（简体）, 中文（繁體）, 日本語, 한국어. Das Einstellungspanel von chardata bietet dieselbe Auswahl, sodass eine in einer der beiden Apps gewählte Sprache in der anderen ein einheitliches Leseerlebnis ergibt.

### Umgebung {#environment src=2eb1ea2c}

Zeigt, was **dieser** Browser, diese Plattform und dieses Display können, sodass Sie sehen, warum ein Format oder eine HDR-Funktion nicht verfügbar ist. Von oben nach unten:

- **Übersicht** — Browser und Betriebssystem sowie die Angabe, ob das Display HDR meldet.
- **Browser-Flags** (Chrome, Edge, Opera, Brave) — ob *Experimental Web Platform features* aktiviert ist. Dieses Flag schaltet das HDR-Canvas frei und erlaubt der Seite, den HDR-Spielraum eines Displays zu lesen.
  - Ist das Flag bekanntermaßen deaktiviert, wird das Feld hervorgehoben. Es ist als **erforderlich** markiert, wenn dieser Browser kein nutzbares WebGPU hat, denn dann ist das HDR-Canvas der einzige Weg zur HDR-Darstellung. Andernfalls ist es **optional**.
  - Die Profilprüfung braucht es nie.
  - Eine Webseite kann Browser-Flags weder öffnen noch ändern. Klicken Sie auf **Kopieren**, fügen Sie die Adresse in die Adressleiste ein, setzen Sie das Flag auf *Enabled* und starten Sie den Browser neu.
- **Display-Eigenschaften** — **HDR-Display**, **Erweiterter Gamut** (sRGB, Display P3 oder Rec. 2020), **Pixelverhältnis** und der verwendete **HDR-Canvas-Pfad** (`float16-canvas`, `webgpu` oder keiner). Diese Angaben aktualisieren sich selbst, wenn Sie das Fenster auf einen Bildschirm ziehen, auf dem sie abweichen. Der Wechsel erfolgt, sobald sich der größte Teil des Fensters auf dem neuen Bildschirm befindet.
- **Displays erkennen** (Chromium-Browser) — fragt nach der Erlaubnis, zu sehen, auf welchem Monitor sich das Fenster befindet. Nach der Freigabe aktualisiert sich das Panel auch zwischen gleich wirkenden Monitoren, zeigt unter **Aktueller Monitor** den Monitor an sowie den **HDR-Spielraum**, wo der Browser ihn bereitstellt (Chrome mit dem oben genannten Flag), zum Beispiel *1.35 Blendenstufen (≈2.55× SDR-Weiß)*. Wenn Sie die Erlaubnis verweigern, ändern Sie sie in den Einstellungen der Website.
  - Der Spielraum ist der Bereich oberhalb von SDR-Weiß; beim eingebauten HDR-Panel eines Laptops **sinkt er daher, wenn Sie die Helligkeit erhöhen** (SDR-Weiß wird heller, während die Spitzenhelligkeit des Panels gleich bleibt), und steigt, wenn Sie sie senken. Für die HDR-Betrachtung senken Sie die Helligkeit.
  - Unter Windows trifft ein neuer Wert einige Sekunden nach einer Helligkeitsänderung ein, sobald der Display-Treiber ihn meldet. Er wird außerdem aktualisiert, wenn das Fenster auf einen anderen Bildschirm wechselt oder Chrome wieder zur aktiven App wird.
- **Display-Ereignisse** — ein aufklappbares Protokoll der letzten 20 Aktualisierungen und ihrer jeweiligen Auslöser. Es ist hilfreich, wenn Sie ein Display-Problem melden.
- **Formattabelle** — eine Zeile je Format (ICC-Profil, TIFF, PNG, JPEG, OpenEXR, Radiance HDR, AVIF, HEIC/HEIF, JPEG XL) mit drei Fragen:
  - **Prüfen**: Lässt sich das eingebettete Profil lesen?
  - **Anzeigen**: Lassen sich die Pixel anzeigen?
  - **HDR**: Kann es heller als Weiß darstellen?

  Fahren Sie mit der Maus über eine Zeile, um den Grund für ein ✕ zu sehen; nicht anzeigbare Formate sind mit ihren Gründen unter der Tabelle aufgeführt. Ein Punkt kennzeichnet Formate, die profiletool selbst dekodiert und die daher in jedem Browser gleich funktionieren. **Prüfen** ist bei jedem Format ✓ außer bei JPEG XL, dessen Profil im Codestream komprimiert ist.

---

## 3. Profilansichten {#3-profile-views src=ccf59d34}

Ziehen Sie ein Profil aus dem Pool auf den Tab **Profil**, um es zu untersuchen. Der Tab zeigt eine Leiste mit dem Dateinamen und der Schaltfläche **ICC-Profil speichern** (sowie, sobald Sie das Profil bearbeitet haben, eine Markierung *● Geändert — nicht gespeichert*) und darunter den Viewer: eine Titelleiste (Dateiname · Größe in Bytes · IccProfLib-Version · Gültigkeits-Badge) und eine eigene Tab-Leiste.

Das Badge fasst den Bericht unter **Validierung** zusammen: grün **Bestanden**, wenn keine Prüfung fehlschlägt oder warnt, gelb **Warnung**, wenn mindestens eine Prüfung warnt, rot **Fehlgeschlagen**, wenn eine Prüfung fehlschlägt.

<div class="note">
<strong>Teilweise eingelesene Profile:</strong> Ist ein Profil so beschädigt, dass der Validator es nur strukturell lesen kann, erscheint ein Warnbanner, und nur die Tabs <strong>Header</strong> und <strong>Tags</strong> sind verfügbar — Validierung, Analyse, XML und JSON sind ausgeblendet, da das Profil nicht angewendet werden darf.
</div>

### 3.1 Header {#3-1-header src=45c71bd0}

Eine zweispaltige Tabelle aller Felder des 128 Byte langen binären Headers des ICC-Profils. Die Werte werden mit `CIccInfo` aus IccProfLib in gut lesbare Zeichenketten dekodiert (Signaturen ausgeschrieben, Datumsangaben formatiert, Festkommawerte umgerechnet). Die **Profil-ID** (der MD5-Hash aus dem Header) wird oben in einem hervorgehobenen Streifen angezeigt.

### 3.2 Tags {#3-2-tags src=90f22730}

Ein sechsspaltiges Raster aller Tags im Tag-Verzeichnis des Profils:

| Spalte | Bedeutung |
|---|---|
| `#` | Position im Verzeichnis (ab 1 gezählt) |
| `Name` | Langer, gut lesbarer Name (z. B. `profileDescriptionTag`) |
| `ID` | Signatur aus 4 Zeichen (z. B. `desc`) |
| `Offset` | Byte-Offset ab Dateianfang |
| `Size` | Größe der Tag-Daten in Bytes |
| `Pad` | Auffüllbytes zwischen diesem und dem nächsten Tag |

Die Signatur des Tag-**Typs** (z. B. `descType`, `mft2`, `mAB`) wird zusammen mit Offset und Größe oben im aufgeklappten Tag angezeigt.

Die Tags sind nach Offset sortiert. Die Spalte **Auffüllung** ist farbcodiert — `Pad < 0` (überlappende Tags, nicht konform) erscheint rot, `Pad > 3` (Auffüllung über das Spezifikationsmaß hinaus) gelb.

**Klicken Sie auf eine Zeile**, um sie an Ort und Stelle aufzuklappen (als Akkordeon — jeweils ein Tag geöffnet). Die aufgeklappten Details enden immer mit der vollständigen, typspezifischen Beschreibung — gleichwertig zum Aufruf von `CIccTag::Describe(verbosity = 100)` aus IccProfLib. Bei Tags mit großen CLUTs oder Kurven (z. B. `A2B0`, `B2A0`) umfasst sie jeden Gitterpunkt bzw. jeden Kurvenpunkt.

Oberhalb dieser Beschreibung zeigen Tags mit visualisierbaren Daten eine oder mehrere **eingebettete Visualisierungen**, jeweils in einem aufklappbaren Abschnitt:

| Tag-Typ | Visualisierungen |
|---|---|
| Tonwertkurven (`rTRC`/`gTRC`/`bTRC`/`kTRC`) | Die Tonwertkurve, aufgetragen gegen die Identitätslinie; die Kurventabelle ist darunter eingeklappt. |
| RGB-Farbmittel (`rXYZ`/`gXYZ`/`bXYZ`) und Weißpunkt (`wtpt`) | Ein CIE-1931-Chromazitätsdiagramm mit hervorgehobener Primärvalenz (bzw. hervorgehobenem Weißpunkt); die Farbmittel- bzw. Weißpunktdaten stehen darunter. |
| LUT-Transformationen (`A2B0–3`, `B2A0–3`, `gamt`, `pre0–2`) | Ein- und ausgangsseitige Tonwertkurven (überlagert, je Farbmittel farbcodiert, mit einer Legende zum Ein- und Ausblenden der Kurven); das CLUT-Gitter als Bild; das **Gamut-Bild** (für das `gamutTag` des Profils, farbcodiert — neutral = im Gamut, rot = außerhalb des Gamuts); der **Auswerter** (siehe unten); und die eingeklappte Rohdatentabelle. |
| Benannte Farben / Farbmitteltabellen (`ncl2`/`nmcl`/`clrt`/`clot`) | Ein Streudiagramm der Farben in den Diagrammen CIELAB a\*b\* (und CIE xy); die Tabellen sind darunter eingeklappt. |
| Kodierungsunabhängige Codepunkte (`cicp`) | **Codepunkte**: Farbprimärvalenzen, Übertragungsfunktion, Matrixkoeffizienten und das Vollbereichs-Flag, jeweils mit der Bezeichnung nach ITU-T H.273. Werte, die H.273 nicht vergibt, werden markiert, ebenso reservierte Bytes ungleich null. |
| Adaptive Verstärkungskurve (`headroomAdaptiveGainCurveTag`) | **Verstärkung bei einem Display-Spielraum**, dazu **Verstärkungskurve**, wenn das Tag alternative Bilder speichert. Siehe *HDR gain curves (HAGC)* unten. |

<div class="note">
<strong>Fehlerhafte Daten werden nie verborgen.</strong> Besteht eine Kurve oder ein anderes visualisierbares Element die Validierung durch IccProfLib nicht — etwa eine Tonwertkurve mit einem entarteten Gamma von 0 —, zeigt der Abschnitt trotzdem an, was möglich ist, und gibt eine ⚠-Warnung mit dem genauen Grund aus der Bibliothek aus, statt das Diagramm stillschweigend wegzulassen.
</div>

#### Der Transformationsauswerter {#the-transform-evaluator src=c70f94b4}

Bei LUT-Transformationen (`A2B*` / `B2A*` / Vorschau-Tags) wendet der Abschnitt **Auswerten** die Transformation genau dieses Tags auf eine einzelne, von Ihnen angegebene Farbe an — direkt mit IccProfLib, ohne externes Farbmodul. Die Richtung ergibt sich aus dem Tag (`A2B*` bildet Gerät → PCS ab, `B2A*` PCS → Gerät), und der Render-Intent ist durch das Tag vorgegeben (`…0` perzeptiv, `…1` relativ farbmetrisch, `…2` Sättigung).

- Geben Sie die Eingabe entweder als **Gleitkomma**-Werte ein (Gerätekanäle oder PCS in lesbaren Lab-/XYZ-Einheiten) oder, wenn das Tag eine CLUT hat, über den **Gitterpunkt**-Index (eine Knotenposition im Gitter).
- Die Ausgabe wird in **beiden** Formen angezeigt: in der internen, auf 0–1 normalisierten Kodierung und in lesbaren Einheiten (Lab/XYZ bei einem PCS-Ergebnis).

Das Gamut-Tag (`gamt`) hat keinen Auswerter — es ist eine einkanalige Karte innerhalb/außerhalb des Gamuts und keine invertierbare Transformation; stattdessen wird sein Gamut-Bild angezeigt.

### 3.3 Validierung {#3-3-validation src=b72d6c69}

Führt die Checkliste der **ICC Profile Assessment Working Group** für das geladene Profil aus und zeigt sie als Bericht an. Die Prüfungen stammen aus dem iccDEV-Werkzeug `iccPawgReport`, kompiliert zu einem eigenen WebAssembly-Modul, das erst beim ersten Öffnen dieses Tabs geladen wird. (Derselbe Bericht steuert das Gültigkeits-Badge in der Titelleiste — **Bestanden**, **Warnung** oder **Fehlgeschlagen** — und ist beim Start per URL entweder als `VAL` oder über den älteren Code `PAWG` erreichbar.)

Jede Prüfung ist unter **Sicherheit**, **Konformität** oder **Qualität** eingeordnet und hat genau ein Ergebnis. Profile mit HDR-Inhalt erhalten eine vierte Gruppe, **HDR**. Deren erste Prüfung meldet, ob das Profil ein konformes ICC.1-**HDR-ColorSpace-Profil** ist (Abschnitt 8.7.1); die übrigen prüfen die HDR-Metadaten, auf die sich dieser Abschnitt stützt. Die Ergebnisse erscheinen im Bericht in englischer Schreibweise:

| Ergebnis | Bedeutung |
|---|---|
| **Pass** | Die Prüfung war erfolgreich |
| **Warn** | Ein nicht schwerwiegender Punkt, der eine Überprüfung lohnt |
| **Fail** | Das Profil erfüllt die Prüfung nicht |
| **Gap** | Die Prüfung konnte nicht vollständig ausgewertet werden (z. B. noch nicht implementiert) |
| **N/A** | Die Prüfung gilt nicht für dieses Profil |
| **Not Run** | Die Prüfung wurde übersprungen |

Die Übersichtszeile oben zählt jedes Ergebnis als farbige Pille. **Klicken Sie auf eine Pille, um den Bericht darunter zu filtern** — ein blauer Rahmen markiert die aktuell angezeigten Kategorien, Pillen ohne Einträge sind inaktiv. Schalten Sie zum Beispiel **Pass** und **N/A** aus, um sich nur auf Warns und Fails zu konzentrieren.

### 3.4 Analyse {#3-4-analysis src=9478bc94}

Profilweite Qualitätsanalysen, abgeleitet aus den Farbtransformationen des Profils — berechnet von einem eigenen WebAssembly-Modul (dem Visualisierungsmodul von iccDEV), das erst beim ersten Öffnen dieses Tabs geladen wird, und im Stil der App dargestellt.

Jede Analyse ist ein aufklappbarer Abschnitt, und **alle sind anfangs geschlossen**. Das ist Absicht: Jeder Abschnitt kostet einen vollständigen Transformationsdurchlauf über das Profil; ihn zu öffnen ist daher Ihre bewusste Entscheidung, statt dass sechs Analysen beim Wechsel des Tabs gleichzeitig starten. Die Ergebnisse werden zwischengespeichert, sodass ein erneutes Öffnen sofort erfolgt. Ein Abschnitt, der für das geladene Profil nicht gilt, zeigt stattdessen einen kurzen Hinweis *nicht anwendbar* (ein Matrix/TRC-Displayprofil hat zum Beispiel keine Gerät↔PCS-CLUTs, die sich analysieren ließen).

#### Profilstatistik {#profile-statistics src=f2d4f2db}

Profilweite Kennzahlen für **einen** gewählten Render-Intent, gesteuert über zwei Auswahllisten und ein Kontrollkästchen:

- **Render-Intent** — Perzeptiv / Relativ farbmetrisch / Sättigung / Absolut farbmetrisch.
- **Rundlauf-Typ** — welche Genauigkeitskennzahl berichtet wird (siehe unten).
- **MPE-(Farb-)Tags verwenden** — aus = die farbmetrischen Lookup-Tabellen; ein = die Multi-Processing-Element- bzw. Farb-Tags. Auf die In-Gamut-Übersicht hat es keine Wirkung und ist dort deaktiviert.

Die Tabelle zeigt das **Gamut-Volumen** (in ΔE\*ab³, umschlossen von der Transformation Gerät → PCS `A2B`, gemessen durch Voxelisierung der Grenze und Zählen der eingeschlossenen Zellen) neben **Min / Mittel / Std.-Abw. / P90 / Max** ΔE\*ab des gewählten Rundlaufs. Darunter steht ein ΔE-Verteilungshistogramm — Balken der relativen Häufigkeit mit einer Linie der kumulativen Häufigkeit — sowie das schlechteste `L, a, b` und, bei PRMG, ob das Profil den Perceptual Reference Medium Gamut impliziert.

Die vier Rundlauf-Typen:

- **In-Gamut-Übersicht (RT0)** — ein Gitter aus Gerätewerten wird nach PCS, zurück zum Gerät und erneut nach PCS überführt; ΔE\*ab wird zwischen den beiden PCS-Durchläufen gemessen. Eine schnelle In-Gamut-Stabilitätsprüfung.
- **Inversion + Gamut (RT1)** — ΔE\*ab zwischen dem PCS jeder Gerätefarbe und ihrem PCS nach einem Rundlauf Lab → Gerät → Lab. Spiegelt die Inversionsgenauigkeit *und* das Gamut-Mapping wider.
- **Reproduzierbarkeit (RT2)** — ΔE\*ab zwischen dem ersten und dem zweiten Rundlauf: wie stabil ein wiederholter Rundlauf ist, unabhängig vom Gamut-Clipping des ersten Durchlaufs.
- **PRMG-Interoperabilität** — PCS-Farben innerhalb des Perceptual Reference Medium Gamut durchlaufen einen einzelnen Rundlauf; die ΔE-Verteilung zeigt die profilübergreifende Interoperabilität.

Unter dem Histogramm beantwortet **Rundlauf-ΔE nach Helligkeit** die Frage, die die Kennzahlen der Übersicht nicht beantworten können: *wo* in der Tonwertskala die Inversion Schwierigkeiten hat und *wie weit ins Gamut hinein* das Problem reicht.

Es tastet 32 Helligkeitsstufen ab. Auf jeder Stufe nimmt es 64 Punkte **auf der Gamut-Grenze** und wiederholt sie dann zur Neutralachse hin eingezogen auf 80 %, 50 % und 20 % ihres Chromas — insgesamt 8.192 Punkte, jeder einzeln dargestellt, mit gepunkteten Trennlinien zwischen den Stufen.

Lesen Sie das Diagramm Band für Band. Innerhalb eines Bandes verlaufen die Punkte von der Gamut-Oberfläche links bis zur Neutralen rechts; der Fehler sollte daher über das Band hinweg **abfallen**: Farben nahe der Grenze sind am schwersten zu invertieren, Farben nahe der Neutralen am leichtesten. Ein Band, dessen Fehler bis zur Neutralen hoch bleibt, zeigt ein Profil mit Problemen bei dieser Helligkeit. Die höchsten Spitzen markieren die Helligkeitsstufen, auf denen die Gamut-Grenze selbst am schlechtesten invertiert wird.

Jeder Startpunkt liegt konstruktionsbedingt im Gamut; was Sie sehen, ist daher echte Uneinigkeit zwischen `B2A` und `A2B` und nicht das Clipping unerreichbarer Farben. Beachten Sie, dass dieses Diagramm eine **eigene** Abtastung hat — bewusst zur Gamut-Grenze hin gewichtet —, sodass sein Mittel- und Maximalwert höher als in der Tabelle darüber und mit ihr nicht vergleichbar sind. Es folgt dem Render-Intent, nicht aber dem Rundlauf-Typ.

Fehlen einem Profil die Gerät↔PCS-Transformationen, die eine Kennzahl benötigt, erscheint ein Hinweis *nicht anwendbar*; ein Gerätefarbraum, der zu groß für die Abtastung ist, wird als übersprungen gemeldet, nicht als Fehler.

#### Kolorimetrie der Extremwerte {#extrema-colorimetry src=be6c9597}

Die Enden des Wiedergabeumfangs des Profils — die Werte, die ein Drucker in der Regel zuerst liest.

- **Weißpunkt** — die Farbe bei **null Farbmittel**, also der blanke Bedruckstoff.
- **Schwarzpunkt** — ermittelt, indem PCS-Schwarz (L\*=0, a\*=b\*=0) durch die gewählte `B2A`-Tabelle geführt wird, um den Farbauftrag zu erhalten, den das Profil für Schwarz *wählt*, und dieser Farbauftrag anschließend über `A2B1` zurückgelesen wird.
- Beide werden in **relativer** und **absoluter** Farbmetrik angezeigt. Absolut zeigt die Eigenfarbe des Bedruckstoffs (ein bläulich-weißes Papier ergibt etwa L\* 95, b\* −4); relativ bezieht sie auf ein perfektes Weiß. Sind beide Spalten identisch, ist das normal — das Medienweiß entspricht dann einfach der Lichtart. Ein Profil ohne Medien-Weißpunkt-Tag zeigt nur relative Werte.
- **Farbauftrag am Schwarzpunkt** und **TAC** — der Farbauftrag je Kanal an diesem Schwarz und deren Summe: der Gesamtfarbauftrag, die Kennzahl für die Farbauftragsgrenze.

Da jede `B2A`-Tabelle ihren eigenen Farbauftrag für Schwarz wählt, unterscheidet sich der Schwarzpunkt tatsächlich zwischen den Intents — daher die Auswahl des Render-Intents.

Darunter zeigt **Vollton gegenüber maximalem Chroma** für jede Farbecke (C, M, Y, R, G, B und K), wo sie in Farbton / Chroma / Helligkeit landet, und den chromatischsten Punkt, der auf dem Weg dorthin vom blanken Bedruckstoff aus erreicht wird. Diese Zeilen werden über `A2B1` gemessen und **ändern sich daher nicht mit der Intent-Auswahl**. Bei einem gutmütigen Profil stimmen beide Zeilen überein. Wird das maximale Chroma *vor* dem Vollton erreicht, wird die Zeile markiert: Jenseits dieses Punkts erhöht zusätzliche Farbe nicht mehr das Chroma, sondern dunkelt nur noch ab.

**Nur Ausgabeprofile (Drucker)** — die Analyse setzt voraus, dass null Farbmittel dem blanken Bedruckstoff entspricht. Die Tabelle je Farbton benötigt zusätzlich einen **CMYK- oder CMY**-Gerätefarbraum: Ein n-Farben-Profil (nCLR) benennt seine Kanäle in beliebiger Reihenfolge, sodass nicht feststellbar ist, welcher Kanal „Cyan“ ist; die Tabelle meldet das, statt zu raten.

#### Neutralachsen-Einfärbung {#neutral-axis-inking src=aa5449e4}

Durchläuft die Neutralachse (a\*=b\*=0) von Weiß (L\*=100) bis Schwarz (L\*=0) über die `B2A`-Tabelle (PCS → Gerät) des Profils und stellt dar, wie viel von jedem Gerätefarbmittel das Profil dabei aufträgt — die klassische GCR- bzw. Grauaufbaukurve. Eine Kurve je Gerätekanal, je Farbmittel farbcodiert.

Über die Separation wird eine weitere Kurve gelegt:

- **L\* Ausgabe (Tonwert)** — die Tonwertwiedergabe: wo die Neutralachse nach einem Rundlauf durch das Profil tatsächlich in der Helligkeit landet. Lesen Sie zweierlei an ihrer Form ab. Ein Durchhängen unter die Diagonale bedeutet, dass Grautöne dunkler als angefordert wiedergegeben werden. Aufschlussreicher ist, dass die Kurve **bei der dunkelsten erreichbaren Helligkeit des Profils abflacht** — dieses Plateau *ist* der Medien-Schwarzpunkt und sollte mit dem Abschnitt Kolorimetrie der Extremwerte oben übereinstimmen.

**Nur Ausgabeprofile (Drucker)**; andere Profilklassen zeigen einen Hinweis.

#### Farbverbrauch in den Tiefen {#ink-usage-in-shadows src=e62016b7}

Vier gerade Pfade durch die a\*b\*-Ebene bei einer konstanten, bewusst dunklen Helligkeit — 0°, 45°, 90° und 135° —, geführt durch die gewählte `B2A`-Tabelle, wobei für jeden Pfad die resultierende Separation dargestellt wird.

Da alle Abtastwerte eines Pfads dieselbe L\* haben, rührt jeder abrupte Sprung oder jede Umkehr eines Farbmittels allein von der Behandlung von Farbton und Chroma her. Das ist die Signatur eines Gamut-Mapping-Artefakts in den Tiefen, und genau so etwas zeigt sich im Druck als Streifenbildung oder plötzliche Farbverschiebung in dunklen Bereichen. Die Pfade verlaufen von weit außerhalb des Gamuts durch das Gamut hindurch und auf der anderen Seite wieder hinaus; Sie sehen also auch, wo das Profil zu begrenzen beginnt.

Die Helligkeitsebene wird automatisch gewählt: auf halbem Weg zwischen der Blau-Ecke des Profils und der dunkelsten von C, M, Y, R und G. Für die perzeptiven und die Sättigungstabellen wird die Helligkeit zunächst vom Medien-Schwarzpunkt bis zum PCS-Schwarz gestreckt — diese Tabellen erwarten dort Schwarz —, und der Abschnitt gibt sowohl die kompensierte als auch die unkompensierte Ebene an.

**Nur Ausgabeprofile (Drucker)**, mit derselben CMYK/CMY-Einschränkung wie die Tabelle je Farbton oben (die Ebene wird aus den Farbecken abgeleitet).

#### Primärfarben-Pfade durch Neutral {#primary-inking-paths-through-neutral src=cb510c25}

Drei Pfade — Cyan→Rot, Magenta→Grün, Gelb→Blau —, die jeweils von einer Primärfarbecke **durch die Neutralachse** bei der mittleren Helligkeit ihrer beiden Endpunkte zur gegenüberliegenden Ecke verlaufen, durch die gewählte `B2A`-Tabelle geführt und als Separation dargestellt werden.

Dies ist das Gegenstück im Gamut zum Farbverbrauch in den Tiefen. Dort verlaufen die Pfade bewusst außerhalb des Gamuts, um Gamut-Mapping-Artefakte aufzudecken; hier **liegt jeder Abtastwert konstruktionsbedingt im Gamut** — beide Endpunkte sind die eigenen Primärfarben des Profils, und der Drehpunkt liegt auf der Neutralachse. Ein Sprung, Knick oder eine Umkehr eines Farbmittels entlang eines dieser Pfade kann also nicht dem Gamut-Clipping zugeschrieben werden: Es handelt sich um einen Glättungsfehler der CLUT. Der neutrale Drehpunkt ist die Mitte jedes Diagramms; dort sollte ein ausgewogener Grauaufbau zu sehen sein.

Für die perzeptiven und die Sättigungstabellen wird die Helligkeit für den Intent schwarzpunktkompensiert, genau wie beim Farbverbrauch in den Tiefen.

**Nur Ausgabeprofile (Drucker)**, mit derselben CMYK/CMY-Einschränkung (die Ecken stammen aus derselben Quelle wie die Tabelle je Farbton).

#### Farbverbrauchsstatistik {#ink-usage-statistics src=191fd7cd}

Wie viel von jedem Farbmittel das Profil aufträgt, als mittlere Deckung und als **Anteil am Gesamtwert** — die Farbverbrauchssignatur der Separation.

Die Tabelle summiert jedes Farbmittel entlang der Neutralachse und gibt seine mittlere Deckung sowie seinen prozentualen Anteil am gesamten Farbauftrag an. Die Anteilsspalte ist das eigentliche Diagnosewerkzeug: Sie ist der Fingerabdruck des Grauaufbaus des Profils (eine cyanlastige Graubalance liest sich anders als eine schwarzlastige) und unabhängig von der Anzahl der Abtastwerte.

Eine zweite Tabelle — der Farbverbrauch über **alle Farben auf der Gamut-Grenze und im Gamut** — ist als *ausstehend* aufgeführt: Sie benötigt eine Konstruktion der Gamut-Grenze, die noch nicht implementiert ist.

**Nur Ausgabeprofile (Drucker).**

#### CLUT-Bild {#clut-image src=a3fec568}

Die Farbtabelle (CLUT) einer Gerät↔PCS-Transformation, als Kacheln zu einem Bild angeordnet, mit einer Auswahl der anzuzeigenden Render-Intent-Tabelle (`A2B0`–`A2B3`, `B2A0`–`B2A3` und die Vorschautabellen). Nützlich, um strukturelle Schäden in einer Tabelle auf einen Blick zu erkennen. Zoomen, Verschieben und Zurücksetzen erfolgen über die Bedienelemente auf der Zeichenfläche.

Wenn Sie eine **`B2A`-Tabelle (PCS → Gerät)** wählen, erscheint unter dem Gitter für jedes Farbmittel ein **Graustufenbild der Farbdeckung** — die Separationen je Farbe, dunkler bedeutet mehr von dieser Farbe. Ein Hinweis oben im Abschnitt weist darauf hin, da der Abschnitt mit einer `A2B`-Tabelle öffnet (deren Ausgabe L\*a\*b\* ist, keine Farbauszüge). Bei einer **n-Farben-Ausgabe (nCLR)** — 5, 6 oder 7 Farben —, für die es keine einfache Farbvorschau gibt, wird das Hauptbild **über die Vorwärts-`A2B` des Profils farbgemanagt**, sodass es trotzdem in echten Farben statt in einkanaligem Grau erscheint.

#### Gamut-Bild {#gamut-image src=92f58c0f}

Die In-/Außerhalb-Gamut-Karte des Gamut-Tags: neutral, wo eine PCS-Farbe reproduzierbar ist, rot, wo sie außerhalb des Gerätegamuts liegt. Nur vorhanden, wenn das Profil ein `gamt`-Tag enthält.

### 3.5 XML {#3-5-xml src=dfd43c4e}

Konvertiert das Profil nach XML (über IccLibXML, denselben Writer, den das iccDEV-CLI `iccToXml` verwendet) und zeigt es in einem CodeMirror-Editor mit Syntaxhervorhebung an. Bearbeiten Sie das XML und klicken Sie auf **In ICC konvertieren**, um es im Rundlauf zurück ins Binärformat zu bringen; der Viewer validiert erneut, und die Schaltfläche **ICC-Profil speichern** in der Leiste des Profil-Tabs lädt das Ergebnis herunter.

Eine **Änderungsanzeige** erscheint, wenn der Editortext von der letzten Konverterausgabe abweicht, sodass Sie auf einen Blick sehen, ob Ihre Änderungen übernommen wurden. Schlägt die Konvertierung fehl, wird der Parse-Fehler von IccLibXML mit der betroffenen Zeile / Spalte über dem Editor angezeigt.

### 3.6 JSON {#3-6-json src=59c3f2e5}

Dasselbe Prinzip wie im XML-Tab, jedoch mit einer JSON-Darstellung des Profils, die der Validator-Wrapper (`json-wrapper.cpp`) erzeugt. Bearbeiten, auf **In ICC konvertieren** klicken, speichern. Die JSON-Form ist kompakter und einfacher per Skript zu verarbeiten; die XML-Form ist vertrauter, wenn Sie die CLI-Werkzeuge von iccDEV kennen.

---

## 4. Tab „Verknüpfen“ {#4-combine-tab src=735d6198}

profiletool hält jedes geladene Profil links in einem **Profil-Pool**. Oben befinden sich fünf Tabs — **Profil** (der oben beschriebene Einzelprofil-Viewer), **Vergleichen**, **Verknüpfen**, **Spektral** und **HDR**. Im Tab **Verknüpfen** verketten Sie Profile und setzen sie ein: Sie erstellen einen **DeviceLink**, **transformieren ein Bild** oder **transformieren einen Farbdatensatz** durch die Kette.

### 4.1 Eine Kette aufbauen {#4-1-building-a-chain src=83ab772c}

Ziehen Sie ein oder mehrere Profile aus dem Pool in die Verknüpfen-Karte, um sie der Reihe nach zur Kette hinzuzufügen. Die Kette ist ein **vertikaler Stapel**: oben die Quelle, unten das Ziel. Jedes Profil trägt **eine Transformation** bei, und das Tool zeigt den eintretenden und den austretenden Farbraum an (z. B. `RGB → Lab`), wobei der **Verbindungsraum** auf der Linie zwischen den Stufen beschriftet ist. Das Modul validiert die gesamte Kette fortlaufend und meldet den durchgängigen Fluss (z. B. *Kette: RGB → CMYK*) oder erklärt je Stufe, wo die Verbindung scheitert.

- **Umsortieren** Sie eine Stufe, indem Sie an ihrem Griff (`⠿`) ziehen oder die Schaltflächen ▲ / ▼ verwenden; entfernen Sie sie mit ×.
- **Richtung umkehren** — die Schaltfläche ⇅ der ersten Transformation kehrt die Richtung der Kette um und wirkt sich auf die folgenden Stufen aus.
- **Render-Intent** — wählen Sie mit *Rendering-Priorität (alle)* einen für die ganze Kette, oder überschreiben Sie ihn für eine einzelne Stufe mit deren eigener Auswahlliste. Fahren Sie mit der Maus über eines der beiden Bedienelemente, um eine Beschreibung des gewählten Intents zu sehen. Über die vier Grund-Intents hinaus bietet ein Profil mit den nötigen Tabellen auch die Varianten *no D2Bx/B2Dx* und *+ BPC* (Schwarzpunktkompensation).

<div class="note">
<strong>HDR-ColorSpace-Profil in der Kette.</strong> Ein ICC.1-HDR-ColorSpace-Profil hat keine TRC-Tags — Abschnitt 8.7 definiert für ein ColorSpace-Profil keine —, daher verwendet eine Transformation über dieses Profil dessen <code>AToB0Tag</code>. Diese Tabelle ist das HDR&#8594;SDR-Rendering, das Abschnitt 8.7.1.5 für Software ohne HDR-Verarbeitung verlangt. Die Karte weist darauf hin, wenn eine Kette ein HDR-ColorSpace-Profil enthält: Der erzeugte DeviceLink, das Bild oder die Daten spiegeln diesen SDR-Rückfall wider, nicht das HDR-Verhalten des Profils.
</div>

### 4.2 DeviceLink erstellen {#4-2-make-devicelink src=2cb72a0d}

Fasst die gesamte Kette zu einem einzigen **DeviceLink**-Profil zusammen (eine Browser-Portierung von `iccApplyToLink` aus iccDEV). Geben Sie einen Namen ein und klicken Sie auf **DeviceLink erstellen**; das Ergebnis landet wie jedes andere Profil im Pool und in der Sammlung des Verknüpfen-Tabs, bereit zur Untersuchung im Tab „Profil“ oder zur Wiederverwendung in einer anderen Kette.

### 4.3 Bild transformieren {#4-3-transform-image src=461fcd83}

Legen Sie ein Rasterbild (TIFF, PNG oder JPEG) im Bildfeld ab und klicken Sie auf **Bild transformieren**, um es durch die Kette zu schicken (eine Browser-Portierung von `iccApplyProfiles`). Das Bild wird zunächst über eine reine Header-Prüfung validiert — sein Farbraum muss zum Eingang der Kette passen. Das Ergebnis wird **heruntergeladen**; Bilder werden nie im Pool gespeichert.

Ist ein gültiges Bild geladen, erscheint ein Panel **Bildausgabeoptionen** mit den Zieleinstellungen, die denen des CLI `iccApplyProfiles` entsprechen:

- **Kodierung** — *Wie Quelle*, 8 Bit, 16 Bit oder **Gleitkomma (32 Bit)**.
- **Komprimierung** — Keine, **LZW** oder **ZIP** (Deflate).
- **Planar** — **Verschachtelt** (chunky) oder **Getrennt** (separate Ebenen).
- **CMM-Interpolation** — **Tetraedrisch** oder **Linear**.
- **ICC-Profil einbetten** — versieht die Ausgabe mit dem letzten Profil der Kette (dem des Ausgabefarbraums).

Die einfache Standardeinstellung belässt eine RGB-/Gray-Ausgabe als PNG; die Wahl einer nur für TIFF verfügbaren Option (Gleitkomma, LZW/ZIP oder getrennte Ebenen) stellt den Container auf TIFF um.

<div class="note">
<strong>Eingebettete Profile:</strong> Enthält das abgelegte Bild ein eigenes eingebettetes ICC-Profil, bietet ein Banner an, es zu <strong>extrahieren</strong> — das Profil wird mit einem Klick dem Pool hinzugefügt und an den Anfang der Kette gesetzt (als ihr Quellfarbraum).
</div>

### 4.4 Daten transformieren {#4-4-transform-data src=96934eec}

Legen Sie einen Farbdatensatz (CGATS/IT8, CSV, CxF oder JSON) im Datenfeld ab und klicken Sie auf **Daten transformieren**, um jedes Farbfeld durch die Kette zu schicken (entspricht `iccApplyNamedCmm`). Das Tool erkennt die im Datensatz enthaltenen Datenarten (Gerät / Lab / XYZ / spektral) und speist diejenige ein, die der Eingang der Kette benötigt; ein **spektraler** Eingang wird mit dem kanonischen Rechner von iccDEV in Farbmetrik umgerechnet, mit dem von Ihnen gewählten **Beobachter** und der gewählten **Lichtart**. Doppelte Farbfelder lassen sich filtern (Median oder Mittelwert). Das Ergebnis öffnet sich in einer Tabelle, die Sie mit **Speichern** als CSV sichern können.

### 4.5 Beobachterwechsel {#4-5-observer-change src=738ba4d4}

Der Tab „Verknüpfen“ enthält **zwei** Erstellerkarten. Über der Link-Pipeline erstellt die Karte **Beobachterwechsel** aus einem V5-RGB-Displayprofil und einem V5-Beobachterprofil (PCC) ein Matrix/TRC-Displayprofil der Version 4.3. Ziehen Sie beide auf die Karte — sie werden anhand der Profilklasse automatisch den Feldern **V5-RGB-Display** und **V5-Beobachter (PCC)** zugeordnet —, klicken Sie dann auf **V4-Displayprofil erstellen**, vergeben Sie einen Namen und klicken Sie auf **Erstellen**. Das Ergebnis wird dem Pool und diesem Tab hinzugefügt. Ein Profil, das keines von beiden ist, wird mit einer Warnung ignoriert.

### 4.6 Tabs „Vergleichen“ und „Spektral“ {#4-6-compare-and-spectral-tabs src=b934d7e3}

Der Tab **Vergleichen** überlagert die Gamut-Grenzen von zwei oder mehr Profilen aus dem Pool — eine 3D-Hülle sowie ein 2D-Helligkeitsschnitt —, um zu zeigen, wo sie sich unterscheiden. Handelt es sich um HDR-ColorSpace-Profile, erklärt der Hinweis **SDR-Rückfall wird angezeigt**, dass jedes Gamut aus dem SDR-Rendering des `AToB0Tag` gebildet wird, nicht aus dem HDR-Umfang des Profils, der sich in einem begrenzten PCS nicht darstellen lässt. Der Tab **Spektral** fügt einen Satz einkanaliger Spektralbilder (in Kanalreihenfolge abgelegt) zu einem mehrkanaligen TIFF zusammen (`iccSpecSepToTiff`).

## 5. Bearbeiten im Rundlauf {#5-round-trip-editing src=595f380b}

Sowohl der XML- als auch der JSON-Tab können das Profil zurück ins ICC-Binärformat schreiben. Der typische Ablauf:

1. **Laden** Sie ein ICC-Profil.
2. Öffnen Sie den Tab **XML** oder **JSON**. Klicken Sie auf **In XML konvertieren** / **In JSON konvertieren**, um den Editor zu füllen.
3. **Bearbeiten** Sie im Editor auf der Seite. Neben der Werkzeugleiste erscheint eine Änderungsanzeige.
4. Klicken Sie auf **In ICC konvertieren**. Der Wrapper erzeugt ein neues Profil, führt die Validierung erneut aus und aktualisiert die Tabs Header / Tags / Validierung.
5. Neben dem Dateinamen in der Leiste des Profil-Tabs erscheint die Markierung **● Geändert — nicht gespeichert**.
6. Klicken Sie auf **ICC-Profil speichern**. Die bearbeiteten Bytes werden als `<original>-edited.icc` heruntergeladen.

Beide Editoren sind unabhängig voneinander — wer erst XML und dann JSON bearbeitet, vermischt die beiden Wege nicht. Gespeichert werden die zuletzt erzeugten ICC-Bytes.

<div class="note">
<strong>Einschränkung:</strong> Die Konvertierungstreue hängt davon ab, was IccLibXML bzw. der JSON-Wrapper für den jeweiligen Tag-Typ unterstützt. Lässt sich ein Tag-Typ nicht darstellen, gehen im Rundlauf Details verloren; prüfen Sie nach der Rückkonvertierung den Tab Validierung, um sicherzustellen, dass sich alles weiterhin fehlerfrei einlesen lässt.
</div>

Der Tab Tags hebt jedes Tag hervor, dessen Bytes vom ursprünglich geladenen Stand abweichen, sodass Sie leicht erkennen, was Ihre Änderungen bewirkt haben.

---

## 6. Start aus chardata {#6-launching-from-chardata src=b39a6805}

Klicken Sie in **chardata** nach dem Laden eines ICC-Profils auf **Datei anzeigen**, um den Viewer auf der Seite zu öffnen, und dann auf **Editor öffnen**. Hier öffnet sich ein neuer Tab mit `?source=chardata` in der URL.

Die Übergabe erfolgt vollständig im Browser:

1. profiletool öffnet sich, erkennt `?source=chardata` und sendet `{type:'profiletool:ready'}` per `postMessage` an `window.opener`.
2. chardata antwortet mit `{type:'profiletool:load', filename, bytes}`.
3. profiletool übernimmt die Bytes (nachdem es den Ursprung des Absenders gegen eine Positivliste und die Größe gegen die Grenze von 256 MB geprüft hat), führt die Validierung aus und zeigt das Profil an.

Kein Upload, kein Umweg über einen Server. Der Ablauf ist einseitig — hier vorgenommene Änderungen werden durch Klick auf **ICC-Profil speichern** gesichert, nicht an chardata zurückgegeben.

---

## 7. Start per URL {#7-launching-with-a-url src=f9a8d871}

Sie können das Tool mit einem Link öffnen, der ein zu ladendes Profil — und den zu öffnenden Tab — über ein **URL-Fragment** (den Teil nach `#`) angibt:

```
https://chardata.colourbill.com/profiletool#url=<profile-url>&tab=<tab>
```

Beide Parameter sind optional:

- **`url=`** — die Webadresse, von der das Profil abgerufen wird. Die Bytes werden in Ihrem Browser heruntergeladen und durchlaufen dann genau denselben Weg wie eine lokale Datei: die Header-Prüfung auf `acsp`, das vollständige `ValidateIccProfile`, die Größengrenze von 256 MB und den Best-Effort-Rückfall für nicht einlesbare Profile. Nichts wird hochgeladen — die abgerufenen Bytes gehen nur an den Validator und werden nie weitergesendet.
- **`tab=`** — welche Ansicht nach dem Laden des Profils geöffnet wird.

Ein vollständiges Beispiel:

```
https://chardata.colourbill.com/profiletool#url=https://example.org/profiles/sRGB.icc&tab=VAL
```

<div class="note">
<strong>Warum ein Fragment und kein Query-String?</strong> Der Teil nach <code>#</code> wird nie an einen Webserver gesendet; die Adresse des Profils, das Sie untersuchen, bleibt also auf Ihrem eigenen Rechner.
</div>

### Tab-Namen {#tab-names src=d3a4dbae}

`tab=` akzeptiert zwei gleichwertige Benennungsschemata, ohne Unterscheidung von Groß- und Kleinschreibung. Die **Kurzcodes** sind die bevorzugte Form:

| Ansicht | Kurzcode | Langname |
|---|---|---|
| Header | `HEADER` | `Header` |
| Tags | `TAGS` | `Tags` |
| Validierung | `VAL` | `Validation` |
| Analyse | `ANALYSIS` | `Analysis` |
| XML | `XML` | `XML` |
| JSON | `JSON` | `JSON` |

Die Langnamen sind die englischen Tab-Beschriftungen ohne Leerzeichen. Beide Schemata bleiben stabil, auch wenn die sichtbaren Beschriftungen umbenannt werden, damit bestehende Links weiter funktionieren. Der Tab Validierung reagiert außerdem auf den älteren Code `PAWG` (früher hieß er „Profile Assessment WG“). Ein unbekannter Wert für `tab=` wird ignoriert, und die Ansicht Header öffnet sich.

<div class="note">
<strong>Voraussetzungen für <code>url=</code>:</strong> Das Profil muss über <strong>HTTPS</strong> bereitgestellt werden, und der Server muss ursprungsübergreifende Lesezugriffe erlauben (ein freizügiger <code>Access-Control-Allow-Origin</code>- bzw. CORS-Header). Fehlt eines davon, blockiert der Browser den Download, und das Tool zeigt einen Abruffehler an. Enthält die Profil-URL selbst <code>&</code> oder <code>#</code> (einen eigenen Query-String), kodieren Sie den gesamten Wert von <code>url=</code> per Prozentkodierung, damit diese Zeichen das Fragment nicht vorzeitig beenden.
</div>

---

## 8. Mobilgeräte {#8-mobile src=cb948e3c}

Auf Bildschirmen, die schmaler als 700 px sind:

- Das Einstellungspanel wird zu einer Schublade, die von rechts hereingleitet.
- Eine schwebende Schaltfläche **⚙** oben rechts öffnet / schließt die Einstellungen.
- Eine Schaltfläche **?** unter ⚙ öffnet dieses Handbuch in seinem einblendbaren Bereich.
- Eine Schaltfläche **✉** öffnet das Kontaktformular in einem neuen Browser-Tab.
- Ein Tippen auf den abgedunkelten Hintergrund schließt die geöffnete Schublade.
- Die Tag-Tabelle wechselt von einem breiten Raster zu gestapelten Karten, sodass jede Spalte ohne horizontales Scrollen lesbar bleibt; ein Tag klappt weiterhin an Ort und Stelle auf.
- **Tippen ersetzt Drag-and-drop.** iOS kennt kein Drag-and-drop; das Ziehen eines Profils aus dem Pool auf einen Tab funktioniert dort daher nicht. **Tippen Sie stattdessen auf die Profile, um sie auszuwählen, und dann auf den Tab**, auf dem Sie sie haben möchten — mit demselben Ergebnis wie beim Ziehen. Der Pool zeigt diesen Hinweis an, solange ein Touchscreen verwendet wird.
- **Auf iPhone und iPad listen die Dateiauswahldialoge alle Dateien auf.** iOS gleicht einen Dateityp-Filter mit den ihm bekannten Typen ab und kennt keinen für `.icc`, `.icm`, `.cube` oder `.exr`; eine Filterung würde also genau die Dateien ausgrauen, die Sie öffnen möchten. Wählen Sie das Profil anhand des Namens aus; alles, was kein Profil ist, wird nach dem Laden weiterhin mit Begründung abgewiesen.

Alle Funktionen sind verfügbar; das Layout passt sich an den kleineren Bildschirm an.

---

## 9. Grenzwerte und Sicherheit {#9-limits-and-security src=ce1e9474}

profiletool stellt nach dem ersten Laden der Seite keine Netzwerkanfragen. Validator, XML-Konverter, JSON-Konverter und Bild-Codecs sind allesamt aus C++-Quellen kompiliertes WebAssembly und laufen vollständig clientseitig. Der HDR-Tab zeigt ein abgelegtes Bild über eine lokale Objekt-URL an, sodass das Bild den Tab nie verlässt. **Displays erkennen** fragt den Browser, nicht einen Server, auf welchem Monitor sich das Fenster befindet.

| Grenzwert | Wo | Hinweise |
|---|---|---|
| **256 MB** | postMessage / Laden von Dateien | Verweigert das Laden größerer Dateien; verhindert die Erschöpfung des Heaps durch ein feindseliges öffnendes Fenster |
| **32 MB** | XML- und JSON-Konverter | Sowohl die JS-Prüfung (`MAX_XML_BYTES` / `MAX_JSON_BYTES`) als auch die C++-Wrapper (`kMaxXmlBytes` / `kMaxJsonBytes`) setzen dies durch; die C++-Seite ist unabhängig maßgeblich |
| **Schutz vor XML-Entity-Bomben** | XML-Konverter | Jedes XML, das `<!DOCTYPE` oder `<!ENTITY` oder ein NUL-Byte enthält, wird abgewiesen, bevor libxml2 es zu sehen bekommt. Die eigenen Grenzen von libxml2 für die Entity-Expansion sind ebenfalls aktiv; dies ist also eine zweite Verteidigungslinie gegen Billion-Laughs-Eingaben |
| **512 MB** | Datei im HDR-Tab | Wird anhand der Dateigröße geprüft, bevor irgendetwas davon gelesen wird; entspricht der eigenen Eingabegrenze von 512 MB der Bild-Codecs |
| **40 Megapixel**, **64 Pixel pro Byte** | Radiance-HDR-Dekodierung (HDR-Tab) | Beides wird aus dem Header und der Dateigröße geprüft, bevor Speicher für Pixel reserviert wird; die zweite Grenze weist Dekompressionsbomben über Wiederholungsmarker ab |
| **Budget für EXR-Dekodierung** | OpenEXR-Dekodierung | Breite × Höhe × Kanäle × 4 Bytes müssen in 512 MB passen, geprüft aus dem Header, bevor der Decoder Speicher reserviert |
| **Durchlauf der HEIC/AVIF-Boxen** | Profilextraktion | Boxgrößen werden überlauffrei geprüft, die Verschachtelungstiefe ist auf 8 begrenzt, ein Profil auf 64 MB (je Datei, insgesamt) und Elementzuordnungen auf 65 536 |
| **Ursprungs-Positivliste** | Start per postMessage | Nur derselbe Ursprung und die Entwicklungs-Ursprünge von chardata dürfen `profiletool:load`-Bytes senden |
| **HTTPS + CORS** | Start per `#url=` | Ein per URL gestartetes Profil muss über HTTPS von einem Host bereitgestellt werden, der ursprungsübergreifende Lesezugriffe erlaubt; die abgerufenen Bytes gehen nur an den Validator und werden nie weitergesendet |

Der Start per `#url=` (eingeführt in 1.1.5) ist der einzige Fall, in dem das Tool nach dem Laden der Seite eine Anfrage an einen fremden Ursprung stellt: Er erweitert `connect-src` der Content-Security-Policy auf `https:`, damit das angegebene Profil abgerufen werden kann. Das Laden von Skripten wird **nicht** erweitert — nur Datenabrufe.

Wenn Sie ein Profil untersuchen müssen, das diese Grenzen überschreitet, bauen Sie iccDEV aus dem Quellcode und verwenden Sie die nativen CLI-Werkzeuge — diese haben keine JS-seitigen Grenzen.

### Lizenz {#licence src=e7a2a884}

profiletool wird unter der MIT-Lizenz veröffentlicht. Die App enthält außerdem Komponenten Dritter unter deren eigenen Lizenzen: IccProfLib aus iccDEV (International Color Consortium), LibTIFF, libpng, zlib, libxml2, JSON for Modern C++, die Emscripten-Laufzeitumgebung sowie JavaScript-Pakete, darunter React, Plotly und CodeMirror. Diese Software beruht teilweise auf der Arbeit der Independent JPEG Group. Die vollständigen Hinweise finden Sie in [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt).

### Abdeckung von ICC.2 (iccMAX) {#icc-2-iccmax-coverage src=3d2b33e8}

Sowohl **ICC.1**- als auch **ICC.2**-Profile werden unterstützt, die Abdeckung von ICC.2 ist jedoch **unvollständig**. Das Laden, die Header- und Tag-Ansichten, die Validierung, der XML/JSON-Rundlauf und die Transformationsmodule verstehen alle ICC.2; die bekannten Lücken sind mehrteilige **ICS**-Austausch-Workflows, die Auswahl eines V5-**Unterprofils** beim Anwenden einer Transformation und die inverse Suche bei manchen ICC.2-Profilen. Ein Profil mit einem nicht unterstützten ICC.2-Konstrukt wird vom Tab Validierung gemeldet, statt stillschweigend falsch gelesen zu werden.
