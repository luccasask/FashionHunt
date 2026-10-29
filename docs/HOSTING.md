# FashionHunt: separat GitHub-repo och gratis drift

Koden hör till `https://github.com/luccasask/FashionHunt`. Ingen befintlig
webbplats, Pages-inställning eller domän ska ändras. Workflow-filen
`.github/workflows/checks.yml` testar och bygger bara detta repo; den publicerar
ingen webbplats och läser inga hemligheter.

## Nuvarande läge

Appen kör en Node/Express-server, en bakgrundsimportör och SQLite eller Postgres.
GitHub Pages är statisk hosting och kan inte köra servern eller databasen.
En Pages-publicering av enbart frontend skulle därför inte ge en fungerande app.

En Postgres-adapter och migrering från SQLite är implementerade och testade
med PGlite. Den riktiga Supabase-anslutningen verifierades 29 oktober 2026,
inklusive autentisering, TLS och förberedelse av det separata schemat.
All SQL använder ett separat `fashionhunt`-schema; tabellerna har RLS aktiverat
utan publika policies. Befintliga `public`-tabeller och Auth-inställningar ändras inte.

## Anslut lokalt

1. Dubbelklicka på `Anslut-Supabase.cmd`. Klistra in Session pooler URI med
   `[YOUR-PASSWORD]` kvar, för det nya projektet. Hjälpen kontrollerar att
   projektet motsvarar den anslutning som användaren angav i chatten.
2. Ange databaslösenordet i den maskerade terminalfrågan. Det URL-kodas och
   sparas endast i `.env.supabase.local` (Git-ignorerad). Filen innehåller en
   hemlighet i klartext och ska inte delas. Inget lösenord behövs i chatten.
3. Hjälpen testar verklig anslutning med verifierad TLS och förbereder schemat.
   Inga lokala produkter eller beslut ändras under anslutningstestet.
4. Efter lyckat test: avsluta den vanliga lokala servern och användningen av
   SQLite-versionen. Kör `Overfor-till-Supabase.cmd` för att kopiera produkter,
   snapshots, historik, favoriter och hämtningsstatus i en transaktion. Målet
   måste vara tomt, bortsett från standardkällorna. Källdatabasen öppnas skrivskyddat.
   Körningen avvisas om en import pågår eller om målprojektet har appdata.
5. Starta med `Starta-med-Supabase.cmd`. Det är fortfarande en lokal server
   på samma wifi; databasen ligger nu i Supabase. Internet behövs för datalagringen.
   `Starta-klader.cmd` använder fortsatt den separata lokala SQLite-databasen.

Terminalkommandon: `pnpm check:supabase`, `pnpm migrate:supabase`,
`pnpm start:supabase`. Anslutningssträngen används endast av servern, aldrig av Vite.
Avaktivera inte certifikatkontroll vid eventuella TLS-fel; kontrollera i stället
leverantörens CA-inställningar och korrekt pooler-adress.

`SELF_SIGNED_CERT_IN_CHAIN` åtgärdades genom att lägga till Supabases officiella
databas-rotcertifikat i just Postgres-anslutningens CA-lista för Supabase-värdar.
Certifikatkedja och värdnamn verifieras fortfarande, och datorns certifikatlager
ändras inte. Certifikat, källa, giltighet och SHA-256-fingeravtryck finns i
`app/server/certs/README.md`. Befintlig lokal anslutningsfil behöver inte skrivas om.

## Föreslaget upplägg att slutföra efter att Supabase-projektet identifierats

- Separat privat GitHub-repo: FashionHunt.
- Separat gratis Node-webbtjänst, exempelvis Render, för frontend, API och import.
- Supabase för beständig databas och inloggning. Ett eget projekt ger bäst
  isolering från den befintliga webbplatsen; annars behöver FashionHunt eget
  schema och egna åtkomstregler. Befintliga tabeller och policies ska behållas.
- En separat adress som tjänsten tilldelar. Ingen befintlig domän flyttas.

Överföringen till det nya projektet genomfördes och verifierades 29 oktober 2026:
183 produkter, 21 favoriter, 459 händelser och 419 snapshots. Jämförelsen
kontrollerade produktfält, snapshot-innehåll, händelseordning, produkt-ID och
sparade beslut mot den skrivskyddade lokala databasen. Den lokala servern
startades med Supabase och favoritlistan verifierades i webbläsaren.
42 automatiska tester passerar. Skärmbild: `docs/ui/supabase-favorites-mobile.jpg`.

Det återstår att införa autentisering och molnkonfiguration innan publicering.
Butikernas produktåtkomst behöver också testas från den valda driftmiljön.

En gratis Render-webbtjänst kan sova vid inaktivitet och tappar lokala filer
vid omstart. Lägg därför inte SQLite med favoriter där. Render anger även
en delad gräns på 750 fria instanstimmar per workspace och månad. Kontrollera
befintlig användning så en annan tjänst inte påverkas av en gemensam kvot.
Supabase Free har också gemensamma konto-/projektgränser och kan pausa
inaktiva projekt. Gratis drift innebär inte obegränsad eller garanterat
ständigt aktiv drift.

## Uppgifter som behövs

1. Supabase-projektets namn/Project URL och om det används av den andra sidan.
2. Val av separat ny driftjänst; inga befintliga tjänster ska ersättas.
3. Användaren loggar själv in vid behov och matar hemligheter i leverantörens
   miljövariabler eller en lokal Git-ignorerad `.env`, aldrig i GitHub eller chatten.

Skapa helst ett nytt projekt `FashionHunt` i befintlig organisation om dess
plan är Free. Supabase tillåter två aktiva gratisprojekt totalt över de
organisationer där kontot är ägare/administratör. Om befintlig organisation
har Pro behövs en separat Free-organisation för ett gratisprojekt, eftersom
planen gäller hela organisationen. Delade användningskvoter finns även när
databaserna är separata. Det befintliga projektet ska inte flyttas eller ändras.

## Officiella källor, kontrollerade 29 oktober 2026

- https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- https://render.com/docs/free
- https://supabase.com/pricing
- https://supabase.com/docs/guides/platform/billing-on-supabase
