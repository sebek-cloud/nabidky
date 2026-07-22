/* =====================================================================
   Orphans – Generátor vyúčtovacích nabídek
   Čistý statický web, data jen v prohlížeči (localStorage).
   ===================================================================== */
(function () {
  "use strict";

  /* ----------------------------- Konfigurace ----------------------------- */
  // Přihlášení řeší server (heslo je v proměnné prostředí APP_PASSWORD).
  var STORAGE_KEY = "orphans_nabidka_v1";
  var SUPPLIER_KEY = "orphans_dodavatel_v1";
  var COUNTER_KEY = "orphans_counter_v1";
  var ARES_URL = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/";

  var DEFAULT_SUPPLIER = {
    nazev: "Orphans s.r.o.",
    ico: "24904457",
    dic: "",
    adresa: "",
    ucet: "",
    email: "",
    telefon: ""
  };

  var CUR_SYMBOL = { CZK: "Kč", EUR: "€", USD: "$" };

  /* ------------------------------- Stav ---------------------------------- */
  var state = {
    supplier: loadSupplier(),
    customer: { nazev: "", ico: "", dic: "", adresa: "" },
    meta: {
      cislo: "",
      datum: todayISO(),
      platnost: addDaysISO(todayISO(), 14),
      mena: "CZK",
      poznamka: ""
    },
    items: []
  };

  /* ----------------------------- Pomocné --------------------------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function addDaysISO(iso, days) {
    var d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + days);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function isoToCz(iso) {
    if (!iso) return "";
    var p = iso.split("-");
    if (p.length !== 3) return iso;
    return p[2] + ". " + p[1] + ". " + p[0];
  }

  var nf = new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // cs-CZ používá jako oddělovač tisíců pevnou mezeru (U+00A0/U+202F),
  // kterou subset fontu v PDF neobsahuje → nahradíme běžnou mezerou.
  function normSpace(s) { return String(s).replace(/[\u00a0\u202f]/g, " "); }
  function money(n, mena) {
    return normSpace(nf.format(isFinite(n) ? n : 0)) + " " + (CUR_SYMBOL[mena] || mena || "");
  }
  function num(v) {
    if (typeof v === "number") return v;
    if (!v) return 0;
    var s = String(v).replace(/\s/g, "").replace(",", ".");
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  function nextOfferNumber() {
    var year = new Date().getFullYear();
    var raw = localStorage.getItem(COUNTER_KEY);
    var data = { year: year, seq: 0 };
    try { if (raw) data = JSON.parse(raw); } catch (e) {}
    if (data.year !== year) { data.year = year; data.seq = 0; }
    data.seq += 1;
    localStorage.setItem(COUNTER_KEY, JSON.stringify(data));
    return year + "-" + ("000" + data.seq).slice(-3);
  }

  /* --------------------------- localStorage ------------------------------ */
  function loadSupplier() {
    try {
      var raw = localStorage.getItem(SUPPLIER_KEY);
      if (raw) return Object.assign({}, DEFAULT_SUPPLIER, JSON.parse(raw));
    } catch (e) {}
    return Object.assign({}, DEFAULT_SUPPLIER);
  }
  function saveSupplier() { localStorage.setItem(SUPPLIER_KEY, JSON.stringify(state.supplier)); }

  function saveDraft() {
    var toSave = { customer: state.customer, meta: state.meta, items: state.items };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  }
  function loadDraft() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var d = JSON.parse(raw);
      if (d.customer) state.customer = d.customer;
      if (d.meta) state.meta = Object.assign(state.meta, d.meta);
      if (d.items && d.items.length) state.items = d.items;
      return true;
    } catch (e) { return false; }
  }

  /* ------------------------------ Výpočty -------------------------------- */
  function itemBase(it) { return num(it.qty) * num(it.price); }

  function totals() {
    var byRate = {};
    var base = 0, vat = 0;
    state.items.forEach(function (it) {
      var b = itemBase(it);
      var rate = num(it.vat);
      var v = b * rate / 100;
      base += b; vat += v;
      if (!byRate[rate]) byRate[rate] = { base: 0, vat: 0 };
      byRate[rate].base += b;
      byRate[rate].vat += v;
    });
    return { base: base, vat: vat, total: base + vat, byRate: byRate };
  }

  /* ------------------------------ Odhlášení ------------------------------ */
  function logout() {
    fetch("/api/logout", { method: "POST" }).then(function () {
      window.location.reload();
    }).catch(function () { window.location.reload(); });
  }

  /* -------------------------------- ARES --------------------------------- */
  function fetchAres(ico) {
    ico = String(ico || "").replace(/\D/g, "");
    if (ico.length < 1) return Promise.reject(new Error("Zadejte IČO."));
    // ARES chce IČO na 8 číslic (doplní zleva nulami)
    ico = ("00000000" + ico).slice(-8);
    return fetch(ARES_URL + ico, { headers: { accept: "application/json" } })
      .then(function (r) {
        if (r.status === 404) throw new Error("Firma s tímto IČO nebyla nalezena.");
        if (!r.ok) throw new Error("ARES vrátil chybu (" + r.status + ").");
        return r.json();
      })
      .then(function (d) {
        var s = d.sidlo || {};
        var adresa = s.textovaAdresa || buildAddress(s);
        return {
          nazev: d.obchodniJmeno || "",
          ico: d.ico || ico,
          dic: d.dic || "",
          adresa: adresa
        };
      });
  }
  function buildAddress(s) {
    var parts = [];
    var line1 = [s.nazevUlice, s.cisloDomovni].filter(Boolean).join(" ");
    if (line1) parts.push(line1);
    var line2 = [s.psc, s.nazevObce].filter(Boolean).join(" ");
    if (line2) parts.push(line2);
    return parts.join(", ");
  }

  /* --------------------------- Render dodavatel -------------------------- */
  function renderSupplierView() {
    var s = state.supplier;
    var lines = [];
    lines.push('<div class="pname">' + esc(s.nazev || "—") + "</div>");
    if (s.adresa) lines.push(esc(s.adresa));
    var idline = [];
    if (s.ico) idline.push("IČO: " + esc(s.ico));
    if (s.dic) idline.push("DIČ: " + esc(s.dic));
    if (idline.length) lines.push(idline.join(" · "));
    if (s.ucet) lines.push("Účet: " + esc(s.ucet));
    var contact = [];
    if (s.email) contact.push(esc(s.email));
    if (s.telefon) contact.push(esc(s.telefon));
    if (contact.length) lines.push(contact.join(" · "));
    $("#supplier-view").innerHTML = lines.join("\n");
  }
  function fillSupplierInputs() {
    $all("[data-sup]").forEach(function (el) {
      el.value = state.supplier[el.getAttribute("data-sup")] || "";
    });
  }

  /* ---------------------------- Render položky --------------------------- */
  function renderItems() {
    var body = $("#items-body");
    body.innerHTML = "";
    state.items.forEach(function (it, i) {
      var row = document.createElement("div");
      row.className = "item-row";
      row.innerHTML =
        '<div class="col-desc"><input data-i="' + i + '" data-f="desc" placeholder="Popis položky" value="' + escAttr(it.desc) + '"></div>' +
        '<div class="col-qty"><input class="num" data-i="' + i + '" data-f="qty" inputmode="decimal" value="' + escAttr(it.qty) + '"></div>' +
        '<div class="col-unit"><input data-i="' + i + '" data-f="unit" placeholder="ks" value="' + escAttr(it.unit) + '"></div>' +
        '<div class="col-price"><input class="num" data-i="' + i + '" data-f="price" inputmode="decimal" value="' + escAttr(it.price) + '"></div>' +
        '<div class="col-vat"><input class="num" data-i="' + i + '" data-f="vat" inputmode="decimal" value="' + escAttr(it.vat) + '"></div>' +
        '<div class="col-total item-total">' + money(itemBase(it), state.meta.mena) + "</div>" +
        '<div class="col-x"><button class="btn-x" data-del="' + i + '" title="Smazat">×</button></div>';
      body.appendChild(row);
    });
    renderSummary();
  }

  function renderSummary() {
    var t = totals();
    var rows = $("#summary-rows");
    rows.innerHTML = "";
    rows.appendChild(sumRow("Základ bez DPH", money(t.base, state.meta.mena)));
    Object.keys(t.byRate).sort(function (a, b) { return a - b; }).forEach(function (rate) {
      var r = t.byRate[rate];
      if (r.vat > 0.0001 || Number(rate) > 0) {
        rows.appendChild(sumRow("DPH " + rate + " %", money(r.vat, state.meta.mena)));
      }
    });
    $("#grand-total").textContent = money(t.total, state.meta.mena);
  }
  function sumRow(lbl, val) {
    var d = document.createElement("div");
    d.className = "summary-row";
    d.innerHTML = '<span class="lbl">' + esc(lbl) + '</span><span class="val">' + esc(val) + "</span>";
    return d;
  }

  function addItem() {
    state.items.push({ desc: "", qty: "1", unit: "ks", price: "", vat: "21" });
    renderItems();
    saveDraft();
  }

  /* ------------------------------ Utils ---------------------------------- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function escAttr(s) { return esc(s).replace(/"/g, "&quot;"); }

  /* ------------------------------- Init ---------------------------------- */
  function initApp() {
    // Logo
    if (window.ORPHANS_LOGO) $("#topbar-logo").src = window.ORPHANS_LOGO;

    // Načíst koncept nebo založit nový
    var had = loadDraft();
    if (!state.meta.cislo) state.meta.cislo = nextOfferNumber();
    if (!state.items.length) state.items = [{ desc: "", qty: "1", unit: "ks", price: "", vat: "21" }];

    // Naplnit meta pole
    $("#m-cislo").value = state.meta.cislo;
    $("#m-datum").value = state.meta.datum;
    $("#m-platnost").value = state.meta.platnost;
    $("#m-mena").value = state.meta.mena;
    $("#m-poznamka").value = state.meta.poznamka;

    // Odběratel pole
    fillCustomerInputs();

    // Dodavatel
    renderSupplierView();
    fillSupplierInputs();

    // Položky
    renderItems();

    bindEvents();
  }

  function fillCustomerInputs() {
    $all("[data-cust]").forEach(function (el) {
      el.value = state.customer[el.getAttribute("data-cust")] || "";
    });
  }

  function bindEvents() {
    // Meta
    $("#m-cislo").addEventListener("input", function () { state.meta.cislo = this.value; saveDraft(); });
    $("#m-datum").addEventListener("input", function () { state.meta.datum = this.value; saveDraft(); });
    $("#m-platnost").addEventListener("input", function () { state.meta.platnost = this.value; saveDraft(); });
    $("#m-mena").addEventListener("change", function () { state.meta.mena = this.value; renderItems(); saveDraft(); });
    $("#m-poznamka").addEventListener("input", function () { state.meta.poznamka = this.value; saveDraft(); });

    // Odběratel inputs
    $all("[data-cust]").forEach(function (el) {
      el.addEventListener("input", function () {
        state.customer[el.getAttribute("data-cust")] = el.value;
        saveDraft();
      });
    });

    // Odběratel ARES
    $("#cust-ares").addEventListener("click", function () {
      var ico = $("#cust-ico").value;
      var status = $("#cust-status");
      status.hidden = false; status.className = "ares-status load"; status.textContent = "Načítám z ARES…";
      fetchAres(ico).then(function (r) {
        state.customer.nazev = r.nazev;
        state.customer.ico = r.ico;
        state.customer.dic = r.dic;
        state.customer.adresa = r.adresa;
        fillCustomerInputs();
        saveDraft();
        status.className = "ares-status ok"; status.textContent = "✓ Načteno: " + r.nazev;
      }).catch(function (err) {
        status.className = "ares-status err";
        status.textContent = "Chyba: " + err.message + " (údaje můžete vyplnit ručně)";
      });
    });

    // Dodavatel toggle upravit
    $('[data-toggle="supplier"]').addEventListener("click", function () {
      var edit = $("#supplier-edit"), view = $("#supplier-view");
      var showing = !edit.hidden;
      edit.hidden = showing; view.hidden = !showing;
    });
    // Dodavatel inputs
    $all("[data-sup]").forEach(function (el) {
      el.addEventListener("input", function () {
        state.supplier[el.getAttribute("data-sup")] = el.value;
      });
    });
    // Dodavatel uložit
    $("#sup-save").addEventListener("click", function () {
      saveSupplier();
      renderSupplierView();
      $("#supplier-edit").hidden = true;
      $("#supplier-view").hidden = false;
    });
    // Dodavatel ARES
    $("#sup-ares").addEventListener("click", function () {
      var ico = state.supplier.ico || DEFAULT_SUPPLIER.ico;
      var btn = this; var orig = btn.textContent;
      btn.textContent = "Načítám…"; btn.disabled = true;
      fetchAres(ico).then(function (r) {
        state.supplier.nazev = r.nazev || state.supplier.nazev;
        state.supplier.ico = r.ico;
        if (r.dic) state.supplier.dic = r.dic;
        state.supplier.adresa = r.adresa || state.supplier.adresa;
        fillSupplierInputs();
      }).catch(function (err) {
        alert("ARES: " + err.message);
      }).then(function () { btn.textContent = orig; btn.disabled = false; });
    });

    // Položky – delegace
    var body = $("#items-body");
    body.addEventListener("input", function (e) {
      var el = e.target;
      var i = el.getAttribute("data-i"), f = el.getAttribute("data-f");
      if (i == null || !f) return;
      state.items[+i][f] = el.value;
      // přepočítat jen řádek + souhrn
      var row = el.closest(".item-row");
      if (row) $(".item-total", row).textContent = money(itemBase(state.items[+i]), state.meta.mena);
      renderSummary();
      saveDraft();
    });
    body.addEventListener("click", function (e) {
      var del = e.target.getAttribute("data-del");
      if (del != null) {
        state.items.splice(+del, 1);
        if (!state.items.length) state.items.push({ desc: "", qty: "1", unit: "ks", price: "", vat: "21" });
        renderItems();
        saveDraft();
      }
    });

    $("#btn-add-item").addEventListener("click", addItem);
    $("#btn-pdf").addEventListener("click", generatePDF);
    $("#btn-new").addEventListener("click", newOffer);
    $("#btn-logout").addEventListener("click", logout);
  }

  function newOffer() {
    if (!confirm("Založit novou nabídku? Rozpracovaná data (odběratel, položky) se smažou.")) return;
    localStorage.removeItem(STORAGE_KEY);
    state.customer = { nazev: "", ico: "", dic: "", adresa: "" };
    state.items = [{ desc: "", qty: "1", unit: "ks", price: "", vat: "21" }];
    state.meta.cislo = nextOfferNumber();
    state.meta.datum = todayISO();
    state.meta.platnost = addDaysISO(todayISO(), 14);
    state.meta.poznamka = "";
    $("#cust-ico").value = "";
    $("#cust-status").hidden = true;
    $("#m-cislo").value = state.meta.cislo;
    $("#m-datum").value = state.meta.datum;
    $("#m-platnost").value = state.meta.platnost;
    $("#m-poznamka").value = "";
    fillCustomerInputs();
    renderItems();
    saveDraft();
  }

  /* ------------------------------- PDF ----------------------------------- */
  function generatePDF() {
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ unit: "mm", format: "a4" });

    // Font s češtinou
    if (window.ORPHANS_FONT) {
      doc.addFileToVFS("LibSans-Regular.ttf", window.ORPHANS_FONT.regular);
      doc.addFont("LibSans-Regular.ttf", "lib", "normal");
      doc.addFileToVFS("LibSans-Bold.ttf", window.ORPHANS_FONT.bold);
      doc.addFont("LibSans-Bold.ttf", "lib", "bold");
      doc.setFont("lib", "normal");
    }

    var s = state.supplier, c = state.customer, m = state.meta, mena = m.mena;
    var pageW = doc.internal.pageSize.getWidth();
    var mL = 18, mR = pageW - 18;
    var y = 18;

    // Logo
    try {
      if (window.ORPHANS_LOGO) {
        var lw = 46, lh = lw * 82 / 700;
        doc.addImage(window.ORPHANS_LOGO, "PNG", mL, y, lw, lh);
      }
    } catch (e) {}

    // Titulek vpravo
    doc.setFont("lib", "bold"); doc.setFontSize(20);
    doc.text("NABÍDKA", mR, y + 4, { align: "right" });
    doc.setFont("lib", "normal"); doc.setFontSize(11);
    doc.text("č. " + (m.cislo || ""), mR, y + 11, { align: "right" });

    y += 22;
    doc.setDrawColor(210); doc.setLineWidth(0.3);
    doc.line(mL, y, mR, y);
    y += 8;

    // Dodavatel / Odběratel bloky
    var colR = mL + (mR - mL) / 2 + 4;
    var topY = y;
    doc.setFontSize(8.5); doc.setTextColor(120);
    doc.text("DODAVATEL", mL, y);
    doc.text("ODBĚRATEL", colR, y);
    doc.setTextColor(20);
    y += 5;

    var yL = drawParty(doc, mL, y, [
      { t: s.nazev, bold: true, size: 12 },
      { t: s.adresa },
      { t: joinDot(s.ico ? "IČO: " + s.ico : "", s.dic ? "DIČ: " + s.dic : "") },
      { t: s.ucet ? "Účet: " + s.ucet : "" },
      { t: joinDot(s.email, s.telefon) }
    ]);
    var yR = drawParty(doc, colR, y, [
      { t: c.nazev || "—", bold: true, size: 12 },
      { t: c.adresa },
      { t: joinDot(c.ico ? "IČO: " + c.ico : "", c.dic ? "DIČ: " + c.dic : "") }
    ]);

    y = Math.max(yL, yR) + 6;

    // Datumy
    doc.setFontSize(9.5); doc.setTextColor(60);
    doc.text("Datum vystavení: " + isoToCz(m.datum), mL, y);
    if (m.platnost) doc.text("Platnost do: " + isoToCz(m.platnost), colR, y);
    doc.setTextColor(20);
    y += 6;

    // Tabulka položek
    var t = totals();
    var rows = state.items
      .filter(function (it) { return it.desc || itemBase(it) > 0; })
      .map(function (it) {
        return [
          it.desc || "",
          fmtQty(it.qty),
          it.unit || "",
          money(num(it.price), mena),
          num(it.vat) + " %",
          money(itemBase(it), mena)
        ];
      });

    doc.autoTable({
      startY: y,
      head: [["Popis", "Počet", "MJ", "Cena / MJ", "DPH", "Celkem bez DPH"]],
      body: rows,
      margin: { left: mL, right: 18 },
      styles: { font: "lib", fontSize: 9.5, cellPadding: 2.4, textColor: 30, lineColor: 225, lineWidth: 0.1 },
      headStyles: { font: "lib", fontStyle: "bold", fillColor: [17, 17, 17], textColor: 255, halign: "left" },
      columnStyles: {
        1: { halign: "right", cellWidth: 18 },
        2: { halign: "center", cellWidth: 14 },
        3: { halign: "right", cellWidth: 26 },
        4: { halign: "right", cellWidth: 16 },
        5: { halign: "right", cellWidth: 30 }
      }
    });

    var afterY = doc.lastAutoTable.finalY + 8;

    // Souhrn vpravo
    var sumX = mR - 70;
    var valX = mR;
    doc.setFontSize(10);
    afterY = sumLine(doc, sumX, valX, afterY, "Základ bez DPH", money(t.base, mena), false);
    Object.keys(t.byRate).sort(function (a, b) { return a - b; }).forEach(function (rate) {
      var r = t.byRate[rate];
      if (r.vat > 0.0001 || Number(rate) > 0) {
        afterY = sumLine(doc, sumX, valX, afterY, "DPH " + rate + " %", money(r.vat, mena), false);
      }
    });
    afterY += 1.5;
    doc.setDrawColor(17); doc.setLineWidth(0.5);
    doc.line(sumX, afterY, valX, afterY);
    afterY += 5.5;
    sumLine(doc, sumX, valX, afterY, "Celkem k úhradě", money(t.total, mena), true);
    afterY += 10;

    // Poznámka
    if (m.poznamka) {
      doc.setFont("lib", "bold"); doc.setFontSize(9.5); doc.setTextColor(90);
      doc.text("Poznámka", mL, afterY);
      doc.setFont("lib", "normal"); doc.setTextColor(40);
      var lines = doc.splitTextToSize(m.poznamka, mR - mL);
      doc.text(lines, mL, afterY + 5);
    }

    // Patička
    var pageH = doc.internal.pageSize.getHeight();
    doc.setFontSize(8); doc.setTextColor(150);
    var footParts = [s.nazev, s.ico ? "IČO " + s.ico : "", s.ucet ? "Účet " + s.ucet : ""].filter(Boolean);
    doc.text(footParts.join("  ·  "), pageW / 2, pageH - 12, { align: "center" });

    var fname = "nabidka-" + (m.cislo || "").replace(/[^\w-]/g, "") + ".pdf";
    doc.save(fname);
  }

  function drawParty(doc, x, y, lines) {
    lines.forEach(function (ln) {
      if (!ln.t) return;
      doc.setFont("lib", ln.bold ? "bold" : "normal");
      doc.setFontSize(ln.size || 9.5);
      var wrapped = doc.splitTextToSize(String(ln.t), 82);
      doc.text(wrapped, x, y);
      y += wrapped.length * (ln.size ? ln.size * 0.42 : 4.4) + 1.5;
    });
    doc.setFont("lib", "normal");
    return y;
  }

  function sumLine(doc, lx, rx, y, lbl, val, strong) {
    doc.setFont("lib", strong ? "bold" : "normal");
    doc.setFontSize(strong ? 12 : 10);
    doc.setTextColor(strong ? 17 : 70);
    doc.text(lbl, lx, y);
    doc.setTextColor(strong ? 17 : 20);
    doc.text(val, rx, y, { align: "right" });
    doc.setFont("lib", "normal"); doc.setTextColor(20);
    return y + (strong ? 0 : 5.5);
  }

  function joinDot() {
    return Array.prototype.slice.call(arguments).filter(Boolean).join("  ·  ");
  }
  function fmtQty(q) {
    var n = num(q);
    return (Math.round(n * 100) / 100).toString().replace(".", ",");
  }

  /* ------------------------------ Start ---------------------------------- */
  document.addEventListener("DOMContentLoaded", initApp);
})();
