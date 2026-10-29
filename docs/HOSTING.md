# FashionHunt: separat GitHub-repo och gratis drift

Koden hör till `https://github.com/luccasask/FashionHunt`. Repot gjordes publikt
på användarens uttryckliga begäran för GitHub Pages. Ingen befintlig webbplats,
Pages-inställning i något annat repo eller egen domän ändras.

Frontend: https://luccasask.github.io/FashionHunt/

API: https://pzdoafvohibhveffdexm.supabase.co/functions/v1/fashionhunt-api

Användaren valde uttryckligen att vänta med inloggning. Den publicerade appen
har därför en gemensam samling: besökare kan läsa och ändra samma val. CORS
och `noindex` ersätter inte inloggning. Databaslösenordet finns bara serverledes.

## Nuvarande läge

GitHub Pages visar React/Vite-gränssnittet. En Supabase Edge Function kör API:t
och produkthämtningen, och Supabase Postgres lagrar produkterna och historiken.
Node/Express-versionen finns kvar för lokala tester. Render används inte.

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

## Publicering och uppdateringar

- `.github/workflows/checks.yml` testar, paketerar Edge-koden och bygger
  gränssnittet. Push till `codex/fashionhunt-app` publicerar frontend till Pages.
- Vite använder `/FashionHunt/` som bas och API-adressen ovan i Pages-bygget.
  Dessa är publika inställningar, inga databasnycklar. Bygget ligger i
  `app/dist-pages/`; det vanliga lokala bygget i `app/dist/` påverkas inte.
- Edge Function publiceras separat med `pnpm build:edge` och
  `pnpm publish:edge`, efter `Logga-in-Supabase.cmd` om CLI-inloggning saknas.
  Databasanslutningen förs över via en tillfällig Git-ignorerad fil som raderas.
- `supabase/config.toml` har `verify_jwt=false`, enligt valet utan inloggning.
  Funktionens åtkomst till Postgres använder den serverlagrade hemligheten.
- Kör `node --env-file=.env.supabase.local scripts/prepare-edge-hosting.mjs`
  för att förbereda jobbfält och appens egen importfortsättning i databasen.
  Inga hemligheter skrivs i cron-kommandot och inga andra projekt ändras.

## Import på gratisplanen

En långlivad Node-process ersätts av korta importomgångar. Produktlistan sparas
först och högst två detaljsidor behandlas per omgång. Arbetsposition och
återstående produkter sparas i Postgres. Ett tidsbegränsat lås med ägartoken
hindrar dubbla körningar; nästa körning kan ta över efter ett avbrott.

Öppen app driver nästa omgång när status hämtas. Databasjobbet
`fashionhunt-import-worker` kontrollerar varje minut om ett påbörjat Edge-jobb
återstår och anropar då worker-endpointen. Det startar inga nya kategorihämtningar
på egen hand. Stängd webbsida kan därför ge långsammare komplettering av detaljer.
Node-importören hämtar bara `work_mode=node` och återställer inte Edge-jobb.

Testerna täcker återupptagen import, bevarade favoriter, gamla låsägares avvisade
skrivningar och blockerade kategorier som inte räknas som färdighämtade.

Överföringen till det nya projektet genomfördes och verifierades 29 oktober 2026:
183 produkter, 21 favoriter, 459 händelser och 419 snapshots. Jämförelsen
kontrollerade produktfält, snapshot-innehåll, händelseordning, produkt-ID och
sparade beslut mot den skrivskyddade lokala databasen. Den lokala servern
startades med Supabase och favoritlistan verifierades i webbläsaren.
45 automatiska tester passerar efter anpassningen till Edge Functions.
Skärmbild före Pages-publiceringen: `docs/ui/supabase-favorites-mobile.jpg`.

Butikernas produktåtkomst behöver också testas från den valda driftmiljön.

Supabase Free har en maximal worker-livstid på 150 sekunder, CPU-gräns och
gemensamma konto-/projektgränser. Inaktiva projekt kan pausas. Gratis drift
innebär inte obegränsad eller garanterat ständigt aktiv drift.

## Uppgifter som behövs

1. Användaren loggar själv in vid behov och matar hemligheter i leverantörens
   miljövariabler eller en lokal Git-ignorerad `.env`, aldrig i GitHub eller chatten.

Skapa helst ett nytt projekt `FashionHunt` i befintlig organisation om dess
plan är Free. Supabase tillåter två aktiva gratisprojekt totalt över de
organisationer där kontot är ägare/administratör. Om befintlig organisation
har Pro behövs en separat Free-organisation för ett gratisprojekt, eftersom
planen gäller hela organisationen. Delade användningskvoter finns även när
databaserna är separata. Det befintliga projektet ska inte flyttas eller ändras.

## Officiella källor, kontrollerade 29 oktober 2026

- https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- https://supabase.com/docs/guides/functions/limits
- https://supabase.com/docs/guides/functions/schedule-functions
- https://supabase.com/pricing
- https://supabase.com/docs/guides/platform/billing-on-supabase
