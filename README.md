# Orphans – Vyúčtovací nabídky

Jednoduchá webová aplikace pro tvorbu vyúčtovacích nabídek za **Orphans s.r.o.**
Běží čistě v prohlížeči, žádný server ani databáze — data se ukládají jen lokálně
(localStorage) ve vašem prohlížeči.

## Funkce
- Přihlášení heslem (klientská závora).
- Hlavička dodavatele (Orphans s.r.o.) — editovatelná, uložená v prohlížeči.
- Odběratel: zadáte **IČO** a tlačítkem **Načíst z ARES** se doplní název, adresa a DIČ.
- Položky à la Fakturoid (počet, MJ, popis, cena/MJ, DPH %) s automatickým přepočtem
  základu, DPH podle sazeb a celkové částky.
- Export do **PDF** (s logem a plnou českou diakritikou).

## Spuštění lokálně
Otevřete `index.html` v prohlížeči, nebo:
```bash
python3 -m http.server 8000
# → http://localhost:8000
```

## Nasazení (GitHub Pages)
1. **Settings → Pages**
2. **Source:** Deploy from a branch
3. **Branch:** `claude/billing-offers-app-e57xwi` (nebo `main` po sloučení), složka `/ (root)`
4. Uložit → web poběží na `https://sebek-cloud.github.io/nabidky/`

## Zabezpečení
Heslo je pouze klientská závora v `js/app.js` (`PASSWORD`). Skryje appku před náhodným
návštěvníkem, ale **není to silné zabezpečení** — repozitář je veřejný, takže heslo je
čitelné ve zdrojovém kódu. Pro citlivá data (číslo účtu) je nechte vyplnit až v aplikaci;
neukládají se do repozitáře. Pro skutečnou ochranu použijte hosting s autentizací
(Vercel/Cloudflare Access).

## Změna hesla
V `js/app.js` uprav `var PASSWORD = "peakyblinders";`.
