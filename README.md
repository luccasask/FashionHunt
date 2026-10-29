# Kläder – lokal testapp

En första fungerande webbapp finns nu i `app/`. Den innehåller produktkort,
vänster/högerswipe, bildgalleri, spara, hoppa över, ångra, favoritlista,
butiks-/reafilter samt importknappar för Zalando och ASOS.

## Starta appen

Paket och frontendbygge är förberedda i denna arbetsmapp. Dubbelklicka på
`Starta-klader.cmd` eller kör:

```powershell
node app/server/index.mjs
```

Öppna http://localhost:4173. Stäng servern med Ctrl+C.

För iPhone på **samma wifi**: stoppa den vanliga servern och dubbelklicka på
`Starta-pa-wifi.cmd`, eller kör `node app/server/index.mjs --lan`.
Öppna den wifi-adress som terminalen skriver ut i Safari. Datorn måste vara på.
Om Windows-brandväggen frågar behöver åtkomst tillåtas för det privata
nätverket. Ingen brandväggsregel ändras av programmet.
Appen saknar inloggning och är avsedd för lokal testning; den publiceras inte
på internet. I wifi-läget kan andra enheter på samma nätverk nå appen.

### Databas och innehåll

- SQLite-databasen finns i `app/data/clothes.sqlite`. Den är lokal och
  ignoreras av Git, liksom WAL-filer. Stäng servern innan databasen kopieras.
- Första starten läser in de befintliga riktiga produktexporterna från
  `output/`, om de finns. Vid senare starter behålls databasen.
- Alla bilder är butikernas riktiga produktbilder. Enstaka äldre testprodukter
  har bara en bild tills detaljer hämtats via en ny import.
- Appen hämtar nästa kategorisida per knapptryckning och försöker därefter
  hämta detaljsidor. Antalet varierar med butikens sidstorlek. Jobben fortsätter när webbläsarfliken stängs, men datorn
  och serverprocessen måste vara igång. Endast ett jobb körs åt gången.
- Avbrutna jobb markeras tydligt efter omstart. En ny import kan startas;
  produkter och tidigare beslut behålls.
- Likes, avslag, ångringar, butiksklick och visningar sparas som händelser.
  Priser och produktuppgifter sparas som historiska versioner.
- Ett misslyckat beslut sparas tillfälligt i webbläsaren och försöker synkas
  vid nästa laddning/handling. Appen är inte en komplett offlineapp.
- Data kan exporteras som JSON från fliken Hämta.
- ASOS hämtas från den svenska sidan med SEK-priser. Äldre poster som ännu
  saknar svenskt pris visar ”Pris i butik”. Ingen valutakonvertering görs.

SQLite ersätter den planerade Postgres-databasen under den lokala testfasen.
Det behövs inga Supabase-konton, GitHub-konton eller API-nycklar för att testa.
Före extern hosting ska inloggning införas och databasen/driften väljas.

Supabase/Postgres stöds också via `FASHIONHUNT_DATABASE_URL`. Anslut med
`Anslut-Supabase.cmd`, som frågar efter lösenord lokalt och testar anslutningen.
Instruktioner för överföring av befintliga favoriter finns i
[`docs/HOSTING.md`](docs/HOSTING.md). Vanlig start använder fortfarande SQLite.
Postgres-adaptern, separat schema och återställning vid misslyckad överföring
har testats med PGlite; totalt 42 automatiska tester och frontendbygget passerar.
Den riktiga Supabase-anslutningen och överföringen av 183 produkter, 21 favoriter,
459 händelser och 419 produktversioner verifierades 29 oktober 2026.
Efter överföringen används `Starta-med-Supabase.cmd` vid omstart. Den lokala
SQLite-databasen behålls separat som reserv; de två lägena synkroniseras inte.

### Utveckling

Kräver Node.js 24+ och pnpm 11.25.0. Efter en ny kloning:

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

För frontendutveckling: kör backend med `pnpm start` och Vite med `pnpm dev`
i en andra terminal. Vite använder backend på port 4173.

```powershell
pnpm test
```

GitHub-repo behövs inte för lokal användning. Om ett repo skapas senare ska
det vara privat; `.gitignore` undantar databas, exporter och lokala nycklar.

## Tidigare importtester

Verifierat 2026-10-29: 50 unika produkter importerades från tre kategorisidor.
Alla exporterade poster hade de obligatoriska fälten och priser i SEK.
Två bildlänkar svarade med JPEG-bilder (HTTP 200), och en produktlänk
kontrollerades med vanlig GET (HTTP 200 och rätt produkttitel).
Zalando avvisade HEAD-förfrågningar till produktsidor med HTTP 403;
HEAD är därför ingen tillförlitlig kontroll av produktlänkar här.

Ett lokalt testprogram som hämtar cirka 50 herrprodukter från
https://www.zalando.se/herrklader/ och sparar bildadress, aktuellt pris,
valuta, märke, namn, produkt-ID och produktlänk.

## Kör

Kräver Node.js 22 eller senare. Inga paket behöver installeras.

```powershell
node fetch-zalando.mjs
```

Resultatet finns i `output/products.json` och `output/products.csv`.
CSV-filen använder semikolon och UTF-8 med BOM. Bildfältet är en direktlänk
till produktbilden; bilderna laddas inte ned som separata filer.

Valfritt antal (1–100):

```powershell
node fetch-zalando.mjs 25
```

Programmet gör högst fem sidförfrågningar i följd, med två sekunders paus
mellan sidorna, och slutar när önskat antal unika produkter har hittats.
Det använder den produktdata som redan finns inbäddad i den offentliga
HTML-sidan. Inget konto, inga hemliga API-nycklar och ingen webbläsare krävs.
Det försöker inte kringgå åtkomstspärrar.

## Kontrollera

```powershell
node --test
```

För att testa parsningen av en lokalt sparad original-HTML:

```powershell
node fetch-zalando.mjs 20 --input zalando-sample.html
```

Exitkod 0 betyder komplett import, 2 betyder delresultat och 1 betyder fel.
Vid fel före exporten behålls tidigare resultat; kontrollera `fetchedAt`
för att se när filen skapades. Varje import ersätter tidigare export.

## Avgränsning

CLI-programmen testar produktåtkomsten och exporterar filer.
Webbservern och swipegränssnittet beskrivs överst i detta dokument.
Ordningen följer Zalandos sidresultat och produkter dedupliceras via ID.
Annonsplatser utan fullständig produktdata tas inte med.
Priset är sidans aktuella produktpris vid hämtningen; storleksberoende
variationer, lagerstatus, frakt och pris vid ett senare köp verifieras inte.
Sidans interna datastruktur kan ändras och då måste parsningen uppdateras.

## ASOS och produktdetaljer

```powershell
node fetch-asos.mjs 50 3
node fetch-zalando-details.mjs
```

Första kommandot hämtar upp till 50 produkter från ASOS-länken som angavs i
chatten och detaljtestar tre av dem (inklusive en reavara om sådan finns).
Andra kommandot detaljtestar de två första varorna i Zalandos befintliga export.
Resultaten finns i `output/asos-products.json`, `output/asos-products.csv` och
`output/zalando-details.json`. JSON-filerna innehåller detaljfälten;
CSV-exporten innehåller grundfält och reaflagga med jämförelsepris.

Verifierat 2026-10-29:

- ASOS: 50 unika produkter, varav 19 markerade som rea. Den angivna
  kategorisidan skickade 72 produkter; importen begränsades till 50.
- ASOS returnerade marknad GB och valuta GBP. Priserna konverteras inte
  och ska inte visas som SEK. Svensk marknad/valuta behöver testas separat.
- Tre ASOS-detaljsidor gav plaggtyp, färg, material, passform, skötsel och fler bilder.
  Exempel: svart T-shirt, 100% bomull, Regular fit. En reavara hade pris
  13,99 GBP och jämförelsepris 20 GBP; material 98% bomull och 2% elastan.
- Två Zalando-detaljsidor gav plaggtyp, färg, material, tyg, passform,
  snitt och skötsel. Exempel: fleecejacka, 100% polyester, Regular, Rak.

### Betyg och modellnamn

De två Zalando-testvarorna hade `reviewStatus: NOT_REVIEWED`, med null i
betygsfältet. ASOS hade ett tomt `ratings`-objekt i alla tre sidornas HTML.
Sidkoden refererar till en separat recensionstjänst, men importen av den
tjänstens genomsnittsbetyg och antal recensioner är ännu inte verifierad.
`not_in_html` betyder alltså inte att en ASOS-vara saknar recensioner.

Importen sparar `rating: null` och en separat status i dessa fall; ett saknat
betyg ska inte visas som 0 stjärnor. Strukturerat `aggregateRating` kan läsas
när det finns, men någon sådan post påträffades inte i de fem detaljtesterna.
Zalandos andra interna betygsformat sparas som `rawRating` för vidare analys.

Modellnamn saknas i de undersökta detaljfälten och lämnas som null.
Produktnamn, plaggtyp, passform och snitt sparas separat. Råa materialtexter
och Zalando-attribut behålls för att senare kunna normaliseras utan att gissa.
Zalandos kategorifält `supplierName` sparas som `supplierLabel` i grundimporten;
det är en källbeteckning och inte ett verifierat separat modellnamn.
Reapris och rabatt kan variera mellan storlekar; hämtat kortpris innebär
inte att samma pris gäller alla storlekar.

Tester använder små, reducerade utdrag ur de faktiskt hämtade detaljsidorna
i `fixtures/`, plus separata fall för rea, dubbletter och saknade värden.

## Verifiering av testappen, 29 oktober 2026

- Produktionsbygge med TypeScript och Vite lyckades.
- 14 automatiska tester passerade: produktparsning, rea, deduplicering,
  prisversioner, beslut, ångra, bevarade detaljer och avbrutna importjobb.
- Webbläsartest: spara → favoritlista → omladdning → favoriten finns kvar →
  ångra. Testbesluten ångrades efteråt.
- Mobil vy testad vid 390 × 844 i webbläsaren. Högerswipe sparade plagget,
  medan ett svep i bildgalleriet bytte foto utan att registrera ett beslut.
  Verifiering på fysisk iPhone/Safari återstår.
- Importknappen för Zalando testades: 50 grundprodukter sparades, varav 30
  fick detaljer innan butiken började begränsa åtkomsten. Jobbet visades
  som delvis klart. Efter importen innehöll databasen 124 unika produkter
  och 33 produkter hade flera bilder.
- Ett extra POST-test av avvisning av främmande Origin kördes inte.
  Automatisk körningsgranskning avvisade det eftersom anropet potentiellt
  kunde starta en import. Det är inte ett verifierat testresultat.
- Servern startades om och databasens produkter och återställda beslut fanns kvar.

Skärmbilder av faktisk app: `docs/ui/app-mobile.jpg` och
`docs/ui/app-gallery-mobile.jpg`.

## Bildfokuserad kortlek enligt FashionHunt-referensen

Gränssnittet har förenklats med större produktbild, kort rubrik, diskreta
bildstreck och knappar för avslag, ångra och spara. Informationsknappen
öppnar produktdetaljer och det fullständiga galleriet. Tryck på bildens högra
del byter till nästa foto, vänstra delen till föregående.

Kortleken renderar både aktuell och nästa produkt. Kortet följer pekaren
utan övergång under dragningen och animeras ut ur skärmen vid ett tillräckligt
långt svep eller en tydlig flick. Nästa kort ligger redan laddat under.
Ett kort drag går tillbaka. Ett nätverksfel återställer kortet och behåller
handlingen för återförsök. Utgående kort fryses under animationen så att ett
snabbt databassvar inte byter produkt mitt i rörelsen.

Verifierat med separat testdatabas (`KLADER_DB_PATH`) och testserver på port
4174, utan att registrera testbeslut i den vanliga databasen:

- Kort drag → samma produkt och återställd position.
- Högersvep → nästa produkt och sparat beslut.
- Vänstersvep → nästa produkt.
- Tryck på ASOS-bild → foto 1 byttes till foto 2 utan beslut.
- Verklig nästa produkt finns i kortet under och är dold för skärmläsare.
- Mobilhöjder 932 och 780 px kontrollerade vid 430 px bredd.
- Produktionsbygget och 17 automatiska tester passerade.

Skärmbild: `docs/ui/fashionhunt-reference-v2.jpg`.

## Stabilt kortbyte, menymarkering och bildskärpa

Kort har nu en beständig React-nyckel baserad på produkt-ID. Nästa kort
behåller sitt DOM-element när det flyttas upp och ärver inte det utgående
kortets transform. Underkortet har ingen egen förflyttning eller skalning.
I isolerade tester låg underkortets vänsterkant på 22 px både under och
efter höger-/vänstersvep. Bildval är också knutet till produkt-ID för att
undvika en kort blinkning av föregående produkts bildindex.

Den valda huvudmenyikonen har en grön markering och `aria-current`.

Bildskärpan orsakades av butikernas små standardbilder. En verklig jämförelse
gav följande filstorlekar i pixlar:

| Bild | Tidigare | Ny stor variant |
| --- | --- | --- |
| ASOS exempel | 313 × 400 | 1200 × 1531 |
| Zalando galleri, exempel | 200 × 289 | 1250 × 1805 |

`product-images.mjs` begär större bildversioner direkt från butikernas CDN.
Det gäller även redan sparade produkter och kräver ingen återimport.
Originaladressen används som reserv om den större bilden inte kan laddas.
Olika storlekar av samma Zalando-foto dedupliceras i galleriet.
Råa källadresser och produkt-/beslutshistorik skrivs inte om.

Mätningen kan köras med `node scripts/check-image-quality.mjs`; filerna
sparas i den Git-ignorerade mappen `output/image-quality/`.
Bygget och 20 automatiska tester passerade, samt separata webbläsartester
av båda svepriktningar och menymarkeringens flikbyte.

## Svenska ASOS-priser och nästa steg för importen

Standardkategorin för ASOS använder nu den officiella svenska sv-SE-länken
`https://www.asos.com/se/man/ctas/masten/cat/?cid=51177`. Ett verkligt test
gav marknad SE, valuta SEK och svenska produktlänkar. Importarbetaren avbryter
om ASOS oväntat skickar annan marknad eller valuta. Priser räknas inte om
från GBP med en uppskattad växelkurs.

17 matchande befintliga ASOS-poster uppdaterades från den verifierade svenska
kategoridatan. Produkt-ID, användarbeslut och tidigare prishistorik bevarades.
33 äldre poster saknar ännu verifierat svenskt pris. De visar ”Pris i butik”
i stället för sitt gamla GBP-belopp tills de fått aktuella svenska uppgifter.
Historiska GBP-priser finns kvar i rådata/export för korrekt historik.
Bygget och 22 tester passerade, inklusive bevarade likes vid marknadsbyte.

Kategorilänkar är nu implementerade i fliken Hämta. Varje butik har ett eget
fält ovanför importpanelen. Den senast använda länken sparas i databasen när
en import startas. Jobbet får en egen kopia av länken, så dess källa inte
ändras i efterhand. Zalando-länkar kan exempelvis avse herrskor eller kläder;
ASOS kräver en svensk kategorilänk med `/se/`, `/cat/` och `cid` för SEK.
Kategori- och sökfilter behålls, medan vanliga spårningsparametrar tas bort.

Ogiltiga adresser avvisas i både gränssnittet och servern. Endast HTTPS till
respektive butiks tillåtna värdnamn accepteras, även efter omdirigeringar.
En korrekt utformad länk kan fortfarande ge importfel om butiken har tagit
bort kategorin eller begränsar åtkomsten.

Föreslagen fortsatt utveckling, ännu inte implementerad:

1. Per källa sparas nästa sida/cursor, senaste hämtning, pausstatus och om
   listan är uttömd. Varje produkt kan vara kopplad till flera källor.
2. Valbar automatisk påfyllning när cirka 10–15 osedda kort återstår.
   En begränsad omgång om 25–50 produkter hämtas medan användaren swipar.
3. Dubbletter och redan bedömda plagg återkommer inte som nya kort.
   Inga överlappande hämtningar, och inga oändliga återförsök vid blockering
   eller när kategorin inte ger nya produkter.
4. Grunddata och kategorisidans bildlista prioriteras för snabb påfyllning;
   detaljsidor för material m.m. kompletteras i lugnare takt.

Detta är inte en generell hämtare för valfria webbplatser. Varje butik behöver
en adapter, men flera produktkategorier inom samma butik kan dela den.

## Bildstreck och ny genomgång av sparade plagg

Bildindikatorn ligger längst ned på fotot. Alla bilder får lika stor del av
den tillgängliga bredden: en bild ger ett helt streck, tre ger tre streck.
Aktuell bild är vit, tidigare bilder har ljus fyllning och kommande är grå.
Ett litet grönt hjärta uppe till höger markerar ett redan sparat plagg.

När kortleken tar slut kan alla sparade plagg gås igenom igen. Högersvep
behåller favoriten, vänstersvep tar bort den från sparat och Ångra återställer
det senaste valet. Genomgångens händelser sparas med `mode: saved_review`,
så de går att skilja från första bedömningen vid senare analys.

Verifierat med produktionsbygge, 31 automatiska tester och separat mobiltest
vid 430 × 932 px. Webbläsartestet täcker en respektive tre bildsegment,
bildväxling, favoritgenomgång, borttagning, ångra och felaktig butikslänk.
Ett verkligt test med Zalandos herrskor gav tre sneakers med SEK-priser,
inklusive unisexprodukter. Testbeslut gjordes i separat databas.

Skärmbild: `docs/ui/segments-saved-review.jpg`.

## Granskning: daglig kortlek och tydlig importtäckning

Bildstreck visas bara när produkten har minst två unika bilder.

Tidigare startade varje import på samma sida och begränsades till ett urval.
Nu sparas nästa sidnummer och pagineringsstatus per butik/kategorilänk.
Zalandos `pageInfo` respektive ASOS sidstorlek/offset/antal används för att
verifiera sidnummer och identifiera sista sidan. Upprepade sidor, fel sidnummer,
blockering eller saknad metadata ska inte tolkas som tomt sortiment.
Sidmarkören flyttas först efter att alla läsbara grundprodukter har sparats.
Importstatus skiljer listans slut från misslyckad detaljhämtning.

Butikerna kan skicka ofullständig produktdata. Ett verkligt Zalando-test gav
76 produkt-ID:n men bara 24 fullständiga produktposter. Detta bortfall sparas
och visas som en ofullständig samling, även om sista sidan senare nås.
ASOS-testet för sida två gav 72 produkter och fyra sidor i aktuell kategori.
Varken butikernas dynamiska sortering eller sista sidan är en garanti för att
varje produkt på hela webbplatsen har hämtats. Använd avgränsade kategorier.

Bortvalda produkter blir tillgängliga igen vid nästa midnatt i
`Europe/Stockholm`. Detta är en ny daglig visningsomgång, ingen radering av
beslut eller historik. Sparade favoriter ligger kvar och undantas från den
vanliga kortleken. Ångra räknas även in i dagens visningsstatus. Servern
beräknar dagen och nästa midnatt; klienten uppdaterar vid midnatt och när
fliken blir synlig igen. Ingen bakgrundsautomation behöver köras för reset.
En avslutad kategori kan kontrolleras från början igen nästa dag; en ännu
oavslutad kategori fortsätter där den slutade även efter midnatt.

Verifiering: produktionsbygge, 36 automatiska tester och mobilvy vid
430 × 932 px. Testerna täcker dagsskifte, DST, bevarade favoriter/historik,
ångra, sidmarkörer per kategori, upprepade sidor och ofullständiga listor.
Skärmbild: `docs/ui/single-image-no-indicator.jpg`.

GitHub och den återstående Supabase-/hostingkopplingen beskrivs i
[`docs/HOSTING.md`](docs/HOSTING.md). Den andra webbplatsens konfiguration
har inte ändrats.
