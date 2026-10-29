# FashionHunt: separat GitHub-repo och gratis drift

Koden hör till `https://github.com/luccasask/FashionHunt`. Ingen befintlig
webbplats, Pages-inställning eller domän ska ändras. Workflow-filen
`.github/workflows/checks.yml` testar och bygger bara detta repo; den publicerar
ingen webbplats och läser inga hemligheter.

## Nuvarande läge

Appen kör en Node/Express-server, en bakgrundsimportör och lokal SQLite.
GitHub Pages är statisk hosting och kan inte köra servern eller databasen.
En Pages-publicering av enbart frontend skulle därför inte ge en fungerande app.

Supabase har föreslagits av användaren. Det är en Postgres-databas och den
nuvarande SQLite-adaptern kan inte anslutas genom att bara byta adress.
Supabase är ännu inte anslutet, och inga migreringar har körts där.

## Föreslaget upplägg att slutföra efter att Supabase-projektet identifierats

- Separat privat GitHub-repo: FashionHunt.
- Separat gratis Node-webbtjänst, exempelvis Render, för frontend, API och import.
- Supabase för beständig databas och inloggning. Ett eget projekt ger bäst
  isolering från den befintliga webbplatsen; annars behöver FashionHunt eget
  schema och egna åtkomstregler. Befintliga tabeller och policies ska behållas.
- En separat adress som tjänsten tilldelar. Ingen befintlig domän flyttas.

Det återstår att införa och testa Postgres-adapter, databasmigrering,
autentisering, molnkonfiguration och överföring av befintlig lokal historik.
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
