/* Tableur Excel (.xlsx) sans bibliothèque : écrire un modèle à remplir, relire un fichier rempli (.xlsx ou .csv).
   Un .xlsx est un zip de fichiers XML. Écriture : zip sans compression. Lecture : décompression par le navigateur
   (DecompressionStream "deflate-raw"). Utilisé par admin.js (window.Tableur). */
(function (racine) {
  "use strict";

  // ───────────── zip ─────────────
  const TABLE_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(octets) {
    let c = 0xffffffff;
    for (let i = 0; i < octets.length; i++) c = TABLE_CRC[(c ^ octets[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function zipper(fichiers, type) {
    const enc = new TextEncoder(), morceaux = [], central = [];
    let decalage = 0;
    fichiers.forEach(f => {
      const nom = enc.encode(f.nom), data = enc.encode(f.texte), crc = crc32(data);
      const loc = new DataView(new ArrayBuffer(30));
      loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true);
      loc.setUint16(8, 0, true); loc.setUint16(10, 0, true); loc.setUint16(12, 0x21, true);
      loc.setUint32(14, crc, true); loc.setUint32(18, data.length, true); loc.setUint32(22, data.length, true);
      loc.setUint16(26, nom.length, true); loc.setUint16(28, 0, true);
      morceaux.push(loc, nom, data);
      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true);
      cd.setUint16(10, 0, true); cd.setUint16(12, 0, true); cd.setUint16(14, 0x21, true);
      cd.setUint32(16, crc, true); cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true);
      cd.setUint16(28, nom.length, true); cd.setUint32(42, decalage, true);
      central.push(cd, nom);
      decalage += 30 + nom.length + data.length;
    });
    const tailleCentral = central.reduce((s, x) => s + x.byteLength, 0);
    const fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, fichiers.length, true); fin.setUint16(10, fichiers.length, true);
    fin.setUint32(12, tailleCentral, true); fin.setUint32(16, decalage, true);
    return new Blob([...morceaux, ...central, fin], { type });
  }

  function dezipper(buf) {
    const dv = new DataView(buf), dec = new TextDecoder();
    let e = buf.byteLength - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error("ce n'est pas un fichier Excel (.xlsx)");
    const n = dv.getUint16(e + 10, true), entrees = {};
    let p = dv.getUint32(e + 16, true);
    for (let i = 0; i < n; i++) {
      const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      const nom = dec.decode(new Uint8Array(buf, p + 46, nl));
      entrees[nom] = { methode: dv.getUint16(p + 10, true), taille: dv.getUint32(p + 20, true), pos: dv.getUint32(p + 42, true) };
      p += 46 + nl + xl + cl;
    }
    return {
      noms: Object.keys(entrees),
      async lire(nom) {
        const r = entrees[nom]; if (!r) return null;
        const debut = r.pos + 30 + dv.getUint16(r.pos + 26, true) + dv.getUint16(r.pos + 28, true);
        const brut = new Uint8Array(buf, debut, r.taille);
        if (r.methode === 0) return dec.decode(brut);
        if (r.methode === 8) return new Response(new Blob([brut]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
        throw new Error("compression inconnue dans le fichier");
      },
    };
  }

  // ───────────── écriture d'un classeur d'une feuille ─────────────
  const xmlEsc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const lettre = i => { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

  // spec : { feuille, lignes: [[valeur | {v, s}]], largeurs: [n], figer: nb de lignes figées, validationEntier: {plage, min, max, message} }
  // styles : 0 normal, 1 en-tête (gras, fond gris, bordure), 2 titre (gras), 3 note (italique gris), 4 cellule à remplir (fond clair)
  function creer(spec) {
    const lignesXml = spec.lignes.map((ligne, r) => `<row r="${r + 1}">${ligne.map((c, k) => {
      if (c == null || c === "") return "";
      const o = typeof c === "object" ? c : { v: c }, ref = lettre(k) + (r + 1), s = o.s ? ` s="${o.s}"` : "";
      if (o.v == null || o.v === "") return `<c r="${ref}"${s}/>`;
      return typeof o.v === "number" ? `<c r="${ref}"${s}><v>${o.v}</v></c>`
        : `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(o.v)}</t></is></c>`;
    }).join("")}</row>`).join("");
    const f = spec.figer || 0;
    const vue = f ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${f}" topLeftCell="A${f + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
      : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;
    const cols = spec.largeurs ? `<cols>${spec.largeurs.map((l, i) => `<col min="${i + 1}" max="${i + 1}" width="${l}" customWidth="1"/>`).join("")}</cols>` : "";
    const ve = spec.validationEntier;
    const valid = ve ? `<dataValidations count="1"><dataValidation type="whole" allowBlank="1" showErrorMessage="1" errorTitle="Âge" error="${xmlEsc(ve.message)}" sqref="${ve.plage}"><formula1>${ve.min}</formula1><formula2>${ve.max}</formula2></dataValidation></dataValidations>` : "";
    const feuille = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${vue}${cols}<sheetData>${lignesXml}</sheetData>${valid}</worksheet>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="13"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF595959"/><name val="Calibri"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF7E0"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
    return zipper([
      { nom: "[Content_Types].xml", texte: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
      { nom: "_rels/.rels", texte: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { nom: "xl/workbook.xml", texte: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEsc(spec.feuille.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
      { nom: "xl/_rels/workbook.xml.rels", texte: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { nom: "xl/styles.xml", texte: styles },
      { nom: "xl/worksheets/sheet1.xml", texte: feuille },
    ], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }

  // ───────────── lecture : tableau de lignes (chaque ligne = tableau de textes) ─────────────
  const parser = s => new DOMParser().parseFromString(s, "application/xml");
  const tous = (n, tag) => Array.from(n.getElementsByTagNameNS("*", tag));
  const colonne = ref => { const l = ref.replace(/\d+/g, ""); let n = 0; for (const ch of l) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

  async function lireXlsx(buf) {
    const z = dezipper(buf);
    const feuilles = z.noms.filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
      .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
    if (!feuilles.length) throw new Error("aucune feuille trouvée dans le fichier");
    const sst = await z.lire("xl/sharedStrings.xml");
    const partages = sst ? tous(parser(sst), "si").map(si => tous(si, "t").map(t => t.textContent).join("")) : [];
    const doc = parser(await z.lire(feuilles[0]));
    const lignes = [];
    tous(doc, "row").forEach((row, i) => {
      const r = row.getAttribute("r") ? Number(row.getAttribute("r")) - 1 : i;
      const ligne = lignes[r] = [];
      tous(row, "c").forEach((c, k) => {
        const ref = c.getAttribute("r"), col = ref ? colonne(ref) : k, t = c.getAttribute("t");
        const v = tous(c, "v")[0];
        let val = "";
        if (t === "s") val = v ? partages[Number(v.textContent)] || "" : "";
        else if (t === "inlineStr") val = tous(c, "t").map(x => x.textContent).join("");
        else if (v) val = v.textContent;
        ligne[col] = val;
      });
    });
    for (let i = 0; i < lignes.length; i++) lignes[i] = Array.from(lignes[i] || [], x => x == null ? "" : String(x));
    return lignes;
  }

  function lireCsv(buf) {
    let texte;
    try { texte = new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch (e) { texte = new TextDecoder("windows-1252").decode(buf); }
    texte = texte.replace(/^﻿/, "");
    const debut = texte.split(/\r?\n/).slice(0, 5).join("\n");
    const sep = [";", "\t", ","].sort((a, b) => debut.split(b).length - debut.split(a).length)[0];
    const lignes = []; let ligne = [], champ = "", guillemets = false;
    for (let i = 0; i < texte.length; i++) {
      const ch = texte[i];
      if (guillemets) {
        if (ch === '"' && texte[i + 1] === '"') { champ += '"'; i++; }
        else if (ch === '"') guillemets = false;
        else champ += ch;
      } else if (ch === '"') guillemets = true;
      else if (ch === sep) { ligne.push(champ); champ = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && texte[i + 1] === "\n") i++; ligne.push(champ); lignes.push(ligne); ligne = []; champ = ""; }
      else champ += ch;
    }
    if (champ || ligne.length) { ligne.push(champ); lignes.push(ligne); }
    return lignes;
  }

  async function lire(fichier) {
    const buf = await fichier.arrayBuffer();
    if (/\.csv$/i.test(fichier.name)) return lireCsv(buf);
    if (/\.xls$/i.test(fichier.name)) throw new Error("ancien format .xls : dans Excel, « Enregistrer sous » au format .xlsx");
    return lireXlsx(buf);
  }

  racine.Tableur = { creer, lire };
})(this);
