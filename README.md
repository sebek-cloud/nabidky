# Orphans – Vyúčtovací nabídky

Webová aplikace pro tvorbu vyúčtovacích nabídek za **Orphans s.r.o.**
Samotná nabídka běží v prohlížeči (data jen v `localStorage`), přístup chrání
**malý Node server s přihlášením** – heslo je v proměnné prostředí, ne v kódu.

## Funkce
- **Přihlášení** heslem – ověřuje server (podepsaná HttpOnly cookie). Heslo v kódu není.
- Hlavička dodavatele (Orphans s.r.o.) – editovatelná, uložená v prohlížeči.
- Odběratel: zadáte **IČO** a tlačítkem **Načíst z ARES** se doplní název, adresa, DIČ.
- Položky à la Fakturoid (počet, MJ, popis, cena/MJ, DPH %) s automatickým přepočtem
  základu, DPH podle sazeb a celkové částky.
- Položky mají **dva násobitele** (počet × koeficient), každý s vlastním názvem MJ
  (např. `5 ks × 8 hod`).
- Volné pole **Předmět / popis nabídky** a **Poznámka**.
- **Vystavil / podpis** (default Jakub Sirotek) – propisuje se do PDF.
- **Ukládání nabídek na server** – tlačítko „Uložit", seznam „Uložené" (Načíst / Smazat).
- Export do **PDF** (s logem a plnou českou diakritikou).
- **Odhlášení** tlačítkem v horní liště.

## Proměnné prostředí
| Proměnná       | Význam                                    | Výchozí                                  |
|----------------|-------------------------------------------|------------------------------------------|
| `APP_PASSWORD` | Heslo pro vstup do aplikace               | `peakyblinders` (změňte!)                |
| `APP_SECRET`   | Tajný klíč pro podpis přihlašovací cookie | odvozeno z hesla (doporučeno nastavit)   |
| `DATABASE_URL` | Připojení k PostgreSQL (trvalé úložiště)  | – (bez ní se použije soubor `DATA_DIR`)  |
| `DATA_DIR`     | Fallback složka pro nabídky (JSON)        | `./data`                                 |
| `PORT`         | Port serveru                              | `3000` (Railway nastaví sám)             |

## Trvalé úložiště nabídek
Server ukládá nabídky dvěma způsoby (podle prostředí):

**A) PostgreSQL (doporučeno – přežije redeploy).** Když je nastavená
`DATABASE_URL`, nabídky se ukládají do tabulky `offers` (vytvoří se sama).
Na Railway:
1. V projektu **Create → Database → Add PostgreSQL**.
2. V service `nabidky` → **Variables → New Variable**: `DATABASE_URL` =
   `${{Postgres.DATABASE_URL}}` (odkaz na databázi ve stejném projektu).

**B) Soubory (fallback).** Bez `DATABASE_URL` se ukládá do `DATA_DIR` (výchozí
`./data`). Přežije restart, ale při novém deployi se ztratí (pokud není
připojený Railway Volume na `DATA_DIR`).

## Nasazení na Railway
1. Railway → **New Project → Deploy from GitHub repo** → vyberte `sebek-cloud/nabidky`,
   větev `claude/billing-offers-app-e57xwi` (nebo `main` po sloučení).
2. Railway detekuje Node (`package.json`) a spustí `npm start` → `node server.js`.
3. V **Variables** nastavte:
   - `APP_PASSWORD` = vaše heslo,
   - `APP_SECRET` = libovolný náhodný řetězec (např. 32+ znaků).
4. V **Settings → Networking → Generate Domain** vytvořte veřejnou adresu.

## Spuštění lokálně
```bash
APP_PASSWORD="tajneheslo" node server.js
# → http://localhost:3000
```

## Bezpečnost
Heslo se ověřuje na serveru a je uložené jen v proměnné prostředí (`APP_PASSWORD`),
takže **ve zdrojovém kódu ani v repozitáři není**. Bez správné cookie server
neposkytne ani aplikaci, ani její soubory. Číslo bankovního účtu se zadává až
v aplikaci a ukládá se pouze ve vašem prohlížeči – do repozitáře se neukládá.
