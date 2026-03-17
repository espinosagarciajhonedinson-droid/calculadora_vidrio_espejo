/* Optimizador de cortes: anidado 2D + plano SVG + cotización (sin dependencias). */

const MATERIALS = [
  { id: "v5-inc-330x220", name: "Lámina de vidrio 5 mm incoloro (transparente)", w: 330, h: 220, price: 260000 },
  { id: "v4-inc-330x220", name: "Lámina de vidrio 4 mm incoloro", w: 330, h: 220, price: 210000 },
  { id: "v3-183x244", name: "Lámina de vidrio 3 mm", w: 183, h: 244, price: 125000 },
  { id: "v4-bronce-330x214", name: "Lámina de vidrio 4 mm bronce", w: 330, h: 214, price: 230000 },
  { id: "v-bronce-refl-330x214", name: "Lámina bronce reflectivo", w: 330, h: 214, price: 240000 },
  { id: "e4-330x214", name: "Lámina de espejo 4 mm", w: 330, h: 214, price: 450000 },
  { id: "e3-183x244", name: "Lámina de espejo 3 mm", w: 183, h: 244, price: 165000 },
];

const $ = (id) => document.getElementById(id);

function fmtCOP(value) {
  const v = Number.isFinite(value) ? value : 0;
  return v.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}

function fmtNum(value, digits = 2) {
  const v = Number.isFinite(value) ? value : 0;
  return v.toLocaleString("es-CO", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function clampInt(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function readNumber(el, fallback = 0) {
  const n = Number(el.value);
  return Number.isFinite(n) ? n : fallback;
}

function readNumberIfNotEmpty(el, fallback = null) {
  const raw = String(el.value ?? "").trim();
  if (raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function safeText(s) {
  return String(s ?? "").replace(/[<>]/g, "");
}

function uid() {
  return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
}

function normalizeDims(w, h) {
  return { w: Math.max(0, w), h: Math.max(0, h) };
}

// ---------- MaxRects packing (simple heuristic) ----------

function rectIntersects(a, b) {
  return !(a.x >= b.x + b.w || a.x + a.w <= b.x || a.y >= b.y + b.h || a.y + a.h <= b.y);
}

function rectContains(outer, inner) {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

function splitFreeRect(free, used) {
  // Split `free` around `used` (axis-aligned), returning new rectangles.
  if (!rectIntersects(free, used)) return [free];

  const out = [];
  const freeRight = free.x + free.w;
  const freeBottom = free.y + free.h;
  const usedRight = used.x + used.w;
  const usedBottom = used.y + used.h;

  // Left
  if (used.x > free.x) {
    out.push({ x: free.x, y: free.y, w: used.x - free.x, h: free.h });
  }
  // Right
  if (usedRight < freeRight) {
    out.push({ x: usedRight, y: free.y, w: freeRight - usedRight, h: free.h });
  }
  // Top
  if (used.y > free.y) {
    out.push({ x: free.x, y: free.y, w: free.w, h: used.y - free.y });
  }
  // Bottom
  if (usedBottom < freeBottom) {
    out.push({ x: free.x, y: usedBottom, w: free.w, h: freeBottom - usedBottom });
  }

  // Filter invalid/degenerate
  return out.filter((r) => r.w > 0.000001 && r.h > 0.000001);
}

function pruneFreeRects(freeRects) {
  const pruned = [];
  for (let i = 0; i < freeRects.length; i++) {
    let contained = false;
    for (let j = 0; j < freeRects.length; j++) {
      if (i === j) continue;
      if (rectContains(freeRects[j], freeRects[i])) {
        contained = true;
        break;
      }
    }
    if (!contained) pruned.push(freeRects[i]);
  }
  return pruned;
}

function scorePlacement(free, w, h) {
  // Best-area-fit with short-side tie-breaker.
  const leftoverHoriz = Math.abs(free.w - w);
  const leftoverVert = Math.abs(free.h - h);
  const shortSide = Math.min(leftoverHoriz, leftoverVert);
  const areaFit = free.w * free.h - w * h;
  return { areaFit, shortSide };
}

function packOneSheet(sheetW, sheetH, pieces, allowRotate) {
  let freeRects = [{ x: 0, y: 0, w: sheetW, h: sheetH }];
  const placements = [];
  const notPlaced = [];

  for (const p of pieces) {
    let best = null;
    let bestScore = null;
    for (const fr of freeRects) {
      // Normal
      if (p.w <= fr.w && p.h <= fr.h) {
        const sc = scorePlacement(fr, p.w, p.h);
        if (
          !best ||
          sc.areaFit < bestScore.areaFit ||
          (sc.areaFit === bestScore.areaFit && sc.shortSide < bestScore.shortSide)
        ) {
          best = { x: fr.x, y: fr.y, w: p.w, h: p.h, rotated: false, piece: p };
          bestScore = sc;
        }
      }
      // Rotated
      if (allowRotate && p.h <= fr.w && p.w <= fr.h) {
        const sc = scorePlacement(fr, p.h, p.w);
        if (
          !best ||
          sc.areaFit < bestScore.areaFit ||
          (sc.areaFit === bestScore.areaFit && sc.shortSide < bestScore.shortSide)
        ) {
          best = { x: fr.x, y: fr.y, w: p.h, h: p.w, rotated: true, piece: p };
          bestScore = sc;
        }
      }
    }

    if (!best) {
      notPlaced.push(p);
      continue;
    }

    placements.push(best);

    // Update free rectangles by splitting any that intersect with placed.
    const usedRect = { x: best.x, y: best.y, w: best.w, h: best.h };
    const nextFree = [];
    for (const fr of freeRects) {
      const splits = splitFreeRect(fr, usedRect);
      for (const s of splits) nextFree.push(s);
    }
    freeRects = pruneFreeRects(nextFree);
  }

  return { placements, notPlaced, freeRects };
}

function packSheets(material, pieceInstances, allowRotate) {
  const sheetW = material.w;
  const sheetH = material.h;

  // Sort by area desc, then by max side desc: helps reduce fragmentation.
  let remaining = [...pieceInstances].sort((a, b) => {
    const da = a.w * a.h;
    const db = b.w * b.h;
    if (db !== da) return db - da;
    return Math.max(b.w, b.h) - Math.max(a.w, a.h);
  });

  const sheets = [];
  while (remaining.length > 0) {
    const { placements, notPlaced, freeRects } = packOneSheet(sheetW, sheetH, remaining, allowRotate);
    if (placements.length === 0) {
      // Nothing could be placed at all: avoid infinite loop.
      break;
    }
    sheets.push({ placements, freeRects });
    remaining = notPlaced;
    if (sheets.length >= 50) break; // hard guard
  }

  return { sheets, remaining };
}

// ---------- UI State ----------

function defaultModel() {
  return {
    materialId: MATERIALS[0].id,
    allowRotate: true,
    pieces: [
      { id: uid(), name: "Pieza 1", w: 50, h: 70, qty: 1 },
    ],
    extras: {
      transport: 40000,
      siliconeUnit: 25000,
      siliconeQty: 1,
      bevelCost: 0,
      sandCost: 0,
      ledUnit: 7000,
      ledMeters: 0,
      touchUnit: 50000,
      touchQty: 0,
      laborPct: 0,
    },
    notes: "",
    selectedSheetIndex: 0,
  };
}

let MODEL = defaultModel();

function getMaterial() {
  return MATERIALS.find((m) => m.id === MODEL.materialId) ?? MATERIALS[0];
}

function expandPieces(pieces) {
  const out = [];
  let seq = 1;
  for (const p of pieces) {
    const w = Number(p.w);
    const h = Number(p.h);
    const qty = clampInt(Number(p.qty), 0, 9999);
    if (!(w > 0 && h > 0 && qty > 0)) continue;
    for (let i = 0; i < qty; i++) {
      const label = `${safeText(p.name || "Pieza").slice(0, 18)} #${i + 1}`;
      out.push({ key: `${p.id}:${i}`, label, w, h, seq: seq++ });
    }
  }
  return out;
}

function compute(model) {
  const material = MATERIALS.find((m) => m.id === model.materialId) ?? MATERIALS[0];
  const allowRotate = !!model.allowRotate;
  const instances = expandPieces(model.pieces);

  const pack = packSheets(material, instances, allowRotate);
  const sheets = pack.sheets;
  const unplaced = pack.remaining;
  const sheetArea = material.w * material.h;
  const usedAreaTotal = sheets.reduce((acc, s) => acc + s.placements.reduce((a, p) => a + p.w * p.h, 0), 0);
  const totalAreaAvailable = sheets.length * sheetArea;
  const wasteAreaTotal = Math.max(0, totalAreaAvailable - usedAreaTotal);
  const usedPct = totalAreaAvailable > 0 ? usedAreaTotal / totalAreaAvailable : 0;

  const costPerCm2 = sheetArea > 0 ? material.price / sheetArea : 0;
  const materialUsedCost = usedAreaTotal * costPerCm2;
  const materialWasteCost = wasteAreaTotal * costPerCm2;
  const materialFullSheetsCost = sheets.length * material.price;

  const transport = Math.max(0, Number(model.extras.transport) || 0);
  const siliconeUnit = Math.max(0, Number(model.extras.siliconeUnit) || 0);
  const siliconeQty = clampInt(Number(model.extras.siliconeQty) || 0, 0, 999);
  const siliconeCost = siliconeUnit * siliconeQty;
  const bevelCost = Math.max(0, Number(model.extras.bevelCost) || 0);
  const sandCost = Math.max(0, Number(model.extras.sandCost) || 0);
  const ledUnit = Math.max(0, Number(model.extras.ledUnit) || 0);
  const ledMeters = Math.max(0, Number(model.extras.ledMeters) || 0);
  const ledCost = ledUnit * ledMeters;
  const touchUnit = Math.max(0, Number(model.extras.touchUnit) || 0);
  const touchQty = clampInt(Number(model.extras.touchQty) || 0, 0, 999);
  const touchCost = touchUnit * touchQty;
  const laborPct = Math.max(0, Number(model.extras.laborPct) || 0) / 100;

  const subtotal = materialUsedCost + transport + siliconeCost + bevelCost + sandCost + ledCost + touchCost;
  const laborCost = subtotal * laborPct;
  const total = subtotal + laborCost;
  const piecesTotal = instances.length;

  const costPerPiece = piecesTotal > 0 ? total / piecesTotal : 0;
  const materialCostPerPiece = piecesTotal > 0 ? materialUsedCost / piecesTotal : 0;

  return {
    material,
    allowRotate,
    instances,
    sheets,
    unplaced,
    sheetArea,
    usedAreaTotal,
    wasteAreaTotal,
    usedPct,
    costPerCm2,
    materialUsedCost,
    materialWasteCost,
    materialFullSheetsCost,
    transport,
    siliconeUnit,
    siliconeQty,
    siliconeCost,
    bevelCost,
    sandCost,
    ledUnit,
    ledMeters,
    ledCost,
    touchUnit,
    touchQty,
    touchCost,
    laborPct,
    laborCost,
    subtotal,
    total,
    piecesTotal,
    costPerPiece,
    materialCostPerPiece,
  };
}

// ---------- Rendering ----------

function colorForIndex(i) {
  // Fixed palette: technical and readable.
  const pal = [
    "#d85b35",
    "#1d6a76",
    "#3a5ba0",
    "#a03a7c",
    "#8a6a1d",
    "#2d7d3a",
    "#7b3a2d",
    "#2d5d7b",
    "#6b4aa0",
    "#a05b3a",
  ];
  return pal[i % pal.length];
}

function renderMaterialSelect() {
  const sel = $("materialSelect");
  sel.innerHTML = MATERIALS.map((m) => {
    const label = `${m.name} · ${m.w}×${m.h} cm · ${fmtCOP(m.price)}`;
    return `<option value="${m.id}">${safeText(label)}</option>`;
  }).join("");
  sel.value = MODEL.materialId;
}

function renderMaterialMeta(material) {
  const area = material.w * material.h;
  const costPerCm2 = area > 0 ? material.price / area : 0;
  $("materialMeta").innerHTML = `
    <div><strong>${safeText(material.name)}</strong></div>
    <div>Medidas: <strong>${fmtNum(material.w, 0)} × ${fmtNum(material.h, 0)} cm</strong> · Área: <strong>${fmtNum(area, 0)} cm²</strong></div>
    <div>Precio lámina: <strong>${fmtCOP(material.price)}</strong> · Costo aprox. por cm²: <strong>${fmtCOP(costPerCm2)}</strong></div>
  `;
}

function renderPiecesTable(pieces) {
  const body = $("piecesBody");
  body.innerHTML = pieces
    .map((p) => {
      return `
        <tr data-id="${p.id}">
          <td data-label="Nombre"><input class="name" type="text" value="${safeText(p.name)}" /></td>
          <td data-label="Ancho (cm)"><input class="w" type="number" min="0" step="0.1" value="${safeText(p.w)}" /></td>
          <td data-label="Alto (cm)"><input class="h" type="number" min="0" step="0.1" value="${safeText(p.h)}" /></td>
          <td data-label="Cant."><input class="qty" type="number" min="0" step="1" value="${safeText(p.qty)}" /></td>
          <td data-label=""><button class="iconbtn del" type="button" title="Eliminar">✕</button></td>
        </tr>
      `;
    })
    .join("");
}

function renderSheetSelect(sheets, selectedIndex) {
  const sel = $("sheetSelect");
  const opts = sheets.map((s, i) => {
    const n = s.placements.length;
    return `<option value="${i}">#${i + 1} (${n} piezas)</option>`;
  });
  sel.innerHTML = opts.join("");
  const clamped = clampInt(selectedIndex, 0, Math.max(0, sheets.length - 1));
  sel.value = String(clamped);
}

function renderHint(comp) {
  const { sheets, unplaced, material, piecesTotal } = comp;
  if (piecesTotal === 0) {
    $("fitHint").textContent = "Agrega piezas para ver el plano.";
    return;
  }
  if (unplaced.length > 0) {
    $("fitHint").textContent = `No caben todas las piezas. Se colocaron ${piecesTotal - unplaced.length}/${piecesTotal}. Revisa dimensiones o elige otra lámina.`;
    return;
  }
  if (sheets.length === 1) {
    $("fitHint").textContent = `Todas las piezas caben en 1 lámina (${material.w}×${material.h} cm).`;
    return;
  }
  $("fitHint").textContent = `Se requieren ${sheets.length} láminas para acomodar todas las piezas.`;
}

function buildSVG(comp, sheetIndex) {
  const material = comp.material;
  const sheet = comp.sheets[sheetIndex] || { placements: [], freeRects: [] };
  const W = material.w;
  const H = material.h;
  const padding = 10;
  const vbW = W + padding * 2;
  const vbH = H + padding * 2;

  const gridStep = chooseGridStep(W, H);
  const grid = gridLines(W, H, gridStep);

  const pieces = sheet.placements.map((pl, idx) => {
    const c = colorForIndex(pl.piece.seq);
    const fill = hexToRgba(c, 0.18);
    const stroke = hexToRgba(c, 0.85);
    const label = `${pl.piece.seq}`;
    const sizeLabel = `${fmtNum(pl.w, 0)}×${fmtNum(pl.h, 0)}`;
    const title = `${pl.piece.label}\n${sizeLabel} cm${pl.rotated ? " (rotado)" : ""}`;
    const cx = pl.x + pl.w / 2 + padding;
    const cy = pl.y + pl.h / 2 + padding;
    return `
      <g class="piece" data-seq="${pl.piece.seq}">
        <title>${escapeXML(title)}</title>
        <rect x="${pl.x + padding}" y="${pl.y + padding}" width="${pl.w}" height="${pl.h}"
          fill="${fill}" stroke="${stroke}" stroke-width="1.2" />
        <text x="${cx}" y="${cy - 5}" text-anchor="middle" dominant-baseline="central"
          font-size="${Math.max(9, Math.min(14, Math.min(pl.w, pl.h) / 4))}"
          fill="${hexToRgba("#1b2430", 0.82)}" font-weight="700">${escapeXML(label)}</text>
        <text x="${cx}" y="${cy + 10}" text-anchor="middle" dominant-baseline="central"
          font-size="${Math.max(8, Math.min(12, Math.min(pl.w, pl.h) / 5))}"
          fill="${hexToRgba("#506071", 0.95)}">${escapeXML(sizeLabel)}</text>
      </g>
    `;
  });

  const free = sheet.freeRects
    .slice(0, 120)
    .map((fr) => {
      return `<rect x="${fr.x + padding}" y="${fr.y + padding}" width="${fr.w}" height="${fr.h}"
        fill="none" stroke="${hexToRgba("#1b2430", 0.10)}" stroke-dasharray="3 4" stroke-width="1" />`;
    })
    .join("");

  const svg = `
    <svg viewBox="0 0 ${vbW} ${vbH}" width="100%" height="100%" role="img" aria-label="Plano de corte">
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="rgba(10,16,24,.18)" />
        </filter>
      </defs>
      <rect x="0" y="0" width="${vbW}" height="${vbH}" fill="transparent" />
      <g transform="translate(${padding},${padding})">
        ${grid}
      </g>
      <rect x="${padding}" y="${padding}" width="${W}" height="${H}"
        fill="${hexToRgba("#ffffff", 0.75)}" stroke="${hexToRgba("#1b2430", 0.55)}" stroke-width="2"
        filter="url(#shadow)" />
      ${free}
      ${pieces.join("")}
      <g>
        <text x="${padding}" y="${padding - 4}" font-size="12" fill="${hexToRgba("#506071", 0.95)}">
          ${escapeXML(`${material.w}×${material.h} cm · Lámina #${sheetIndex + 1}`)}
        </text>
      </g>
    </svg>
  `;
  return svg;
}

function chooseGridStep(W, H) {
  const maxSide = Math.max(W, H);
  if (maxSide <= 200) return 10;
  if (maxSide <= 260) return 10;
  if (maxSide <= 400) return 20;
  return 25;
}

function gridLines(W, H, step) {
  const lines = [];
  for (let x = 0; x <= W + 0.0001; x += step) {
    const major = Math.abs(x % (step * 5)) < 0.0001;
    lines.push(
      `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${hexToRgba("#1b2430", major ? 0.10 : 0.05)}" stroke-width="1" />`,
    );
  }
  for (let y = 0; y <= H + 0.0001; y += step) {
    const major = Math.abs(y % (step * 5)) < 0.0001;
    lines.push(
      `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${hexToRgba("#1b2430", major ? 0.10 : 0.05)}" stroke-width="1" />`,
    );
  }
  return `<g>${lines.join("")}</g>`;
}

function hexToRgba(hex, a) {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function escapeXML(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function renderLegend(comp, sheetIndex) {
  const sheet = comp.sheets[sheetIndex] || { placements: [] };
  const uniq = [];
  const seen = new Set();
  for (const pl of sheet.placements) {
    if (seen.has(pl.piece.seq)) continue;
    seen.add(pl.piece.seq);
    uniq.push(pl);
  }
  uniq.sort((a, b) => a.piece.seq - b.piece.seq);

  const host = $("legend");
  host.innerHTML = uniq
    .slice(0, 30)
    .map((pl) => {
      const c = colorForIndex(pl.piece.seq);
      return `
        <div class="chip" title="${escapeXML(pl.piece.label)}">
          <span class="swatch" style="background:${hexToRgba(c, 0.35)}; border-color:${hexToRgba(c, 0.85)}"></span>
          <span><strong>${pl.piece.seq}</strong> · ${escapeXML(fmtNum(pl.w, 0))}×${escapeXML(fmtNum(pl.h, 0))} cm</span>
        </div>
      `;
    })
    .join("");
}

function renderKPIs(comp) {
  const sheetArea = comp.sheetArea;
  const used = comp.usedAreaTotal;
  const waste = comp.wasteAreaTotal;
  const usedPct = comp.usedPct * 100;

  const kpis = [
    { k: "Piezas", v: `${comp.piecesTotal}`, s: comp.unplaced.length ? `${comp.unplaced.length} sin ubicar` : `0 sin ubicar` },
    { k: "Láminas", v: `${comp.sheets.length}`, s: fmtCOP(comp.material.price) + " c/u" },
    { k: "Aprovechamiento", v: `${fmtNum(usedPct, 1)}%`, s: `${fmtNum(used, 0)} cm² usados` },
    { k: "Desperdicio", v: `${fmtNum(waste, 0)} cm²`, s: fmtCOP(comp.materialWasteCost) + " (prorrateado)" },
    { k: "Costo material", v: fmtCOP(comp.materialUsedCost), s: `${fmtCOP(comp.costPerCm2)} / cm²` },
    { k: "Costo por pieza", v: fmtCOP(comp.costPerPiece), s: `${fmtCOP(comp.materialCostPerPiece)} material/pieza` },
  ];

  $("kpis").innerHTML = kpis
    .map(
      (x) => `
      <div class="kpi">
        <div class="k">${escapeXML(x.k)}</div>
        <div class="v">${escapeXML(x.v)}</div>
        <div class="s">${escapeXML(x.s)}</div>
      </div>
    `,
    )
    .join("");
}

function renderTotals(comp) {
  const lines = [];
  lines.push({ k: "Material usado (prorrateado)", v: fmtCOP(comp.materialUsedCost) });
  if (comp.transport > 0) lines.push({ k: "Transporte", v: fmtCOP(comp.transport) });
  if (comp.siliconeCost > 0) lines.push({ k: `Silicona (${comp.siliconeQty} u)`, v: fmtCOP(comp.siliconeCost) });
  if (comp.bevelCost > 0) lines.push({ k: "Viselado", v: fmtCOP(comp.bevelCost) });
  if (comp.sandCost > 0) lines.push({ k: "Arenado", v: fmtCOP(comp.sandCost) });
  if (comp.ledCost > 0) lines.push({ k: `Cinta LED (${fmtNum(comp.ledMeters, 1)} m)`, v: fmtCOP(comp.ledCost) });
  if (comp.touchCost > 0) lines.push({ k: `Botón touch (${comp.touchQty} u)`, v: fmtCOP(comp.touchCost) });
  if (comp.laborCost > 0) lines.push({ k: `Mano de obra (${fmtNum(comp.laborPct * 100, 1)}%)`, v: fmtCOP(comp.laborCost) });
  lines.push({ k: "Total", v: fmtCOP(comp.total), grand: true });

  // Extra: show full-sheet cost for reference.
  const note = `
    <div class="line">
      <span class="muted">Referencia (lámina completa)</span>
      <span class="muted">${escapeXML(fmtCOP(comp.materialFullSheetsCost))}</span>
    </div>
  `;

  $("totals").innerHTML =
    lines
      .map((l) => {
        return `
          <div class="line ${l.grand ? "grand" : ""}">
            <span>${escapeXML(l.k)}</span>
            <strong>${escapeXML(l.v)}</strong>
          </div>
        `;
      })
      .join("") + note;
}

function renderAll() {
  const comp = compute(MODEL);
  const material = comp.material;

  renderMaterialMeta(material);
  renderOutputs(comp);
}

function renderOutputs(comp) {
  renderHint(comp);
  // Keep current selection if still valid.
  const maxIdx = Math.max(0, comp.sheets.length - 1);
  MODEL.selectedSheetIndex = clampInt(MODEL.selectedSheetIndex, 0, maxIdx);
  renderSheetSelect(comp.sheets, MODEL.selectedSheetIndex);

  const host = $("svgHost");
  host.innerHTML = `<div id="svgZoom" class="svg-zoom"></div>`;
  $("svgZoom").innerHTML = buildSVG(comp, MODEL.selectedSheetIndex);
  renderLegend(comp, MODEL.selectedSheetIndex);
  renderKPIs(comp);
  renderTotals(comp);

  applyZoomUI();
}

let renderQueued = false;
function scheduleOutputs() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderOutputs(compute(MODEL));
  });
}

function renderAllFull() {
  renderPiecesTable(MODEL.pieces);
  wireTableEvents(); // bind once
  renderAll();
}

let ZOOM = 1;
function setZoom(next) {
  const z = Math.max(0.5, Math.min(3, next));
  ZOOM = z;
  const el = $("svgZoom");
  if (el) el.style.transform = `scale(${ZOOM})`;
  const btn = $("zoomReset");
  if (btn) btn.textContent = `${Math.round(ZOOM * 100)}%`;
}

function applyZoomUI() {
  // Ensure the wrapper exists and keeps current zoom after rerenders.
  const el = $("svgZoom");
  if (el) el.style.transform = `scale(${ZOOM})`;
  const btn = $("zoomReset");
  if (btn) btn.textContent = `${Math.round(ZOOM * 100)}%`;
}

// ---------- Events ----------

function wireStaticEvents() {
  $("materialSelect").addEventListener("change", (e) => {
    MODEL.materialId = e.target.value;
    MODEL.selectedSheetIndex = 0;
    renderAll();
  });

  $("allowRotate").addEventListener("change", (e) => {
    MODEL.allowRotate = e.target.value === "yes";
    MODEL.selectedSheetIndex = 0;
    renderAll();
  });

  $("sheetSelect").addEventListener("change", (e) => {
    MODEL.selectedSheetIndex = clampInt(Number(e.target.value), 0, 9999);
    renderAll();
  });

  const extras = [
    ["costTransport", "transport"],
    ["costSiliconeUnit", "siliconeUnit"],
    ["siliconeQty", "siliconeQty"],
    ["bevelCost", "bevelCost"],
    ["sandCost", "sandCost"],
    ["ledUnit", "ledUnit"],
    ["ledMeters", "ledMeters"],
    ["touchUnit", "touchUnit"],
    ["touchQty", "touchQty"],
    ["laborPct", "laborPct"],
  ];
  for (const [id, key] of extras) {
    $(id).addEventListener("input", (e) => {
      MODEL.extras[key] = readNumber(e.target, MODEL.extras[key]);
      scheduleOutputs();
    });
  }

  $("notes").addEventListener("input", (e) => {
    MODEL.notes = e.target.value ?? "";
  });

  $("btnAddRow").addEventListener("click", () => {
    MODEL.pieces.push({ id: uid(), name: `Pieza ${MODEL.pieces.length + 1}`, w: 10, h: 10, qty: 1 });
    renderAllFull();
  });

  $("btnClear").addEventListener("click", () => {
    MODEL.pieces = [];
    MODEL.selectedSheetIndex = 0;
    renderAllFull();
  });

  $("btnExample").addEventListener("click", () => {
    MODEL.pieces = [
      { id: uid(), name: "Puerta", w: 70, h: 190, qty: 1 },
      { id: uid(), name: "Laterales", w: 35, h: 190, qty: 2 },
      { id: uid(), name: "Entrepaños", w: 60, h: 30, qty: 4 },
      { id: uid(), name: "Divisiones", w: 18, h: 30, qty: 6 },
    ];
    MODEL.selectedSheetIndex = 0;
    renderAllFull();
  });

  $("btnPrint").addEventListener("click", () => window.print());

  $("zoomIn")?.addEventListener("click", () => setZoom(ZOOM + 0.1));
  $("zoomOut")?.addEventListener("click", () => setZoom(ZOOM - 0.1));
  $("zoomReset")?.addEventListener("click", () => setZoom(1));

  $("btnExport").addEventListener("click", async () => {
    const payload = {
      v: 1,
      exportedAt: new Date().toISOString(),
      model: MODEL,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const btn = $("btnExport");
    const prev = btn.textContent;

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = exportFilename();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    btn.textContent = "Exportado";
    setTimeout(() => (btn.textContent = prev), 1200);
  });

  $("importFile").addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      const parsed = JSON.parse(text);
      if (parsed?.model) {
        MODEL = hydrateModel(parsed.model);
        $("materialSelect").value = MODEL.materialId;
        $("allowRotate").value = MODEL.allowRotate ? "yes" : "no";
        $("costTransport").value = String(MODEL.extras.transport ?? 0);
        $("costSiliconeUnit").value = String(MODEL.extras.siliconeUnit ?? 0);
        $("siliconeQty").value = String(MODEL.extras.siliconeQty ?? 0);
        $("bevelCost").value = String(MODEL.extras.bevelCost ?? 0);
        $("sandCost").value = String(MODEL.extras.sandCost ?? 0);
        $("ledUnit").value = String(MODEL.extras.ledUnit ?? 0);
        $("ledMeters").value = String(MODEL.extras.ledMeters ?? 0);
        $("touchUnit").value = String(MODEL.extras.touchUnit ?? 0);
        $("touchQty").value = String(MODEL.extras.touchQty ?? 0);
        $("laborPct").value = String(MODEL.extras.laborPct ?? 0);
        $("notes").value = MODEL.notes ?? "";
        renderAllFull();
      }
    } catch (err) {
      alert("No se pudo importar el JSON. Verifica el archivo.");
    } finally {
      e.target.value = "";
    }
  });
}

function hydrateModel(raw) {
  const base = defaultModel();
  const out = { ...base, ...raw };
  out.materialId = MATERIALS.some((m) => m.id === out.materialId) ? out.materialId : MATERIALS[0].id;
  out.allowRotate = !!out.allowRotate;
  out.pieces = Array.isArray(out.pieces) ? out.pieces.map((p) => ({
    id: String(p.id || uid()),
    name: String(p.name ?? "Pieza"),
    w: Number(p.w) || 0,
    h: Number(p.h) || 0,
    qty: Number(p.qty) || 0,
  })) : base.pieces;
  out.extras = {
    transport: Number(out.extras?.transport ?? base.extras.transport) || 0,
    siliconeUnit: Number(out.extras?.siliconeUnit ?? base.extras.siliconeUnit) || 0,
    siliconeQty: Number(out.extras?.siliconeQty ?? base.extras.siliconeQty) || 0,
    bevelCost: Number(out.extras?.bevelCost ?? base.extras.bevelCost) || 0,
    sandCost: Number(out.extras?.sandCost ?? base.extras.sandCost) || 0,
    ledUnit: Number(out.extras?.ledUnit ?? base.extras.ledUnit) || 0,
    ledMeters: Number(out.extras?.ledMeters ?? base.extras.ledMeters) || 0,
    touchUnit: Number(out.extras?.touchUnit ?? base.extras.touchUnit) || 0,
    touchQty: Number(out.extras?.touchQty ?? base.extras.touchQty) || 0,
    laborPct: Number(out.extras?.laborPct ?? base.extras.laborPct) || 0,
  };
  out.notes = String(out.notes ?? "");
  out.selectedSheetIndex = clampInt(Number(out.selectedSheetIndex) || 0, 0, 999);
  return out;
}

let tableWired = false;
function wireTableEvents() {
  // Avoid stacking listeners when renderAll() runs; we delegate to tbody once.
  const body = $("piecesBody");
  if (tableWired) return;
  tableWired = true;

  body.addEventListener("focusin", (e) => {
    const input = e.target.closest("input");
    if (!input) return;
    // Auto-select to avoid extra clicks when editing numbers.
    setTimeout(() => {
      try { input.select(); } catch {}
    }, 0);
  });

  body.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const input = e.target.closest("input");
    const tr = e.target.closest("tr");
    if (!input || !tr) return;
    e.preventDefault();
    const inputs = [...tr.querySelectorAll("input")];
    const idx = inputs.indexOf(input);
    const next = inputs[idx + 1] || inputs[0];
    next?.focus?.();
    next?.select?.();
  });

  body.addEventListener("input", (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (!tr) return;
    const id = tr.getAttribute("data-id");
    const idx = MODEL.pieces.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const p = MODEL.pieces[idx];
    if (e.target.classList.contains("name")) p.name = e.target.value;
    if (e.target.classList.contains("w")) {
      const n = readNumberIfNotEmpty(e.target, null);
      if (n !== null) p.w = n;
    }
    if (e.target.classList.contains("h")) {
      const n = readNumberIfNotEmpty(e.target, null);
      if (n !== null) p.h = n;
    }
    if (e.target.classList.contains("qty")) {
      const n = readNumberIfNotEmpty(e.target, null);
      if (n !== null) p.qty = n;
    }
    scheduleOutputs();
  });

  body.addEventListener("blur", (e) => {
    const input = e.target.closest("input");
    const tr = e.target.closest("tr[data-id]");
    if (!input || !tr) return;
    const id = tr.getAttribute("data-id");
    const idx = MODEL.pieces.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const p = MODEL.pieces[idx];
    // If user leaves field empty, normalize to 0 to keep model consistent.
    if (input.classList.contains("w") && String(input.value ?? "").trim() === "") p.w = 0;
    if (input.classList.contains("h") && String(input.value ?? "").trim() === "") p.h = 0;
    if (input.classList.contains("qty") && String(input.value ?? "").trim() === "") p.qty = 0;
    scheduleOutputs();
  }, true);

  body.addEventListener("click", (e) => {
    const btn = e.target.closest("button.del");
    if (!btn) return;
    const tr = btn.closest("tr[data-id]");
    const id = tr?.getAttribute("data-id");
    if (!id) return;
    MODEL.pieces = MODEL.pieces.filter((p) => p.id !== id);
    MODEL.selectedSheetIndex = 0;
    renderAllFull();
  });
}

// ---------- Boot ----------

function boot() {
  renderMaterialSelect();
  $("allowRotate").value = MODEL.allowRotate ? "yes" : "no";

  $("costTransport").value = String(MODEL.extras.transport);
  $("costSiliconeUnit").value = String(MODEL.extras.siliconeUnit);
  $("siliconeQty").value = String(MODEL.extras.siliconeQty);
  $("bevelCost").value = String(MODEL.extras.bevelCost);
  $("sandCost").value = String(MODEL.extras.sandCost);
  $("ledUnit").value = String(MODEL.extras.ledUnit);
  $("ledMeters").value = String(MODEL.extras.ledMeters);
  $("touchUnit").value = String(MODEL.extras.touchUnit);
  $("touchQty").value = String(MODEL.extras.touchQty);
  $("laborPct").value = String(MODEL.extras.laborPct);
  $("notes").value = MODEL.notes;

  // PWA: basic offline + installability
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }

  // Show an explicit Install button when the browser allows it (Android Chrome).
  let deferredInstallPrompt = null;
  const installBtn = $("btnInstall");
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    installBtn?.classList?.remove("hidden");
  });
  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    installBtn?.classList?.add("hidden");
  });
  installBtn?.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    installBtn.disabled = true;
    try {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
    } catch {
      // ignore
    } finally {
      installBtn.disabled = false;
    }
  });

  wireStaticEvents();
  renderAllFull();
  setZoom(1);
}

boot();

function exportFilename() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  return `cortes-${y}${m}${day}-${hh}${mm}.json`;
}
