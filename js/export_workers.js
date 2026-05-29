// ══════════════════════════════════════════════════════════════
//  WORKER PROFILES EXPORT — PDF & XLSX
//  Template: MJM Groups Worker Profiles
// ══════════════════════════════════════════════════════════════

// All available columns matching the template exactly
const WORKER_EXPORT_COLS = [
  { key: 'workerId',      label: 'Worker ID',             width: 12 },
  { key: 'photo',         label: 'Profile Picture',       width: 16, isPhoto: true },
  { key: 'name',          label: 'Name',                  width: 19 },
  { key: 'status',        label: 'Status',                width: 9  },
  { key: 'gender',        label: 'Gender',                width: 9  },
  { key: 'category',      label: 'Category',              width: 13 },
  { key: 'quotaCompany',  label: 'AP Quota Company',      width: 20 },
  { key: 'location',      label: 'Work Location',         width: 16 },
  { key: 'nationality',   label: 'Nationality',           width: 12 },
  { key: 'passportNo',    label: 'Passport No.',          width: 9  },
  { key: 'passportExpiry',label: 'Passport Expiry',       width: 12 },
  { key: 'passportStatus',label: 'Passport Status',       width: 12 },
  { key: 'joiningDate',   label: 'Joining Date',          width: 13 },
  { key: 'recruitment',   label: 'Recruitment Date',      width: 15 },
  { key: 'socso',         label: 'SOCSO No.',             width: 15 },
  { key: 'licenseNo',     label: 'Labour License No.',    width: 35 },
  { key: 'licenseExpiry', label: 'Labour License Expiry', width: 15 },
  { key: 'permitNo',      label: 'Work Permit No.',       width: 22 },
  { key: 'permitExpiry',  label: 'Work Permit Exp.',      width: 12 },
  { key: 'termination',   label: 'Termination Date',      width: 14 },
  { key: 'departure',     label: 'Departure Date',        width: 15 },
];

// Which columns are selected (all by default)
let _exportSelectedCols = null; // null = all

// Get currently filtered + sorted workers (mirrors renderWorkerTable exactly)
function getFilteredSortedWorkers() {
  const query = (document.getElementById('workerSearch')?.value  || '').toLowerCase().trim();
  const catF  = document.getElementById('categoryFilter')?.value || '';
  const staF  = document.getElementById('statusFilter')?.value   || '';
  const locF  = document.getElementById('locationFilter')?.value || '';
  const compF = document.getElementById('companyFilter')?.value  || '';

  let list = workers.filter(w => {
    const g   = w.general || {};
    const cat = deriveCategory(w);
    const sta = deriveStatus(w);
    const co  = w.legal?.quota?.company || '';
    const loc = g.location || '';
    if (catF  && cat !== catF)  return false;
    if (staF  && sta !== staF)  return false;
    if (locF  && loc !== locF)  return false;
    if (compF && co  !== compF) return false;
    if (query) {
      const hay = [g.name, g.workerId, g.nationality, g.passport, loc, cat, sta, co].join(' ').toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });

  if (typeof workerSort !== 'undefined' && typeof applySort === 'function') {
    list = applySort(list, workerSort, (w, col) => {
      const g = w.general || {};
      switch (col) {
        case 'name':     return (g.name || '').toLowerCase();
        case 'category': return deriveCategory(w);
        case 'status':   return deriveStatus(w);
        case 'location': return (g.location || '').toLowerCase();
        case 'passport': return w.legal?.passport?.expiry || 'z';
        case 'company':  return (w.legal?.quota?.company || '').toLowerCase();
        case 'license':  return w.legal?.license?.expiry  || 'z';
        case 'permit':   return w.legal?.permit?.expiry   || 'z';
        default:         return '';
      }
    });
  }
  return list;
}

// Build row data from a worker
function buildWorkerExportRow(w) {
  const g = w.general || {};
  const l = w.legal   || {};
  const passExpiry = l.passport?.expiry || '';
  const today = new Date(); today.setHours(0,0,0,0);
  let passStatus = '';
  if (passExpiry) {
    const exp = new Date(passExpiry); exp.setHours(0,0,0,0);
    passStatus = exp < today ? 'Expired' : 'With Worker';
  }
  return {
    workerId:       g.workerId      || '',
    photo:          g.photo         || '',
    name:           g.name          || '',
    status:         deriveStatus(w),
    gender:         g.gender        || '',
    category:       deriveCategory(w),
    quotaCompany:   l.quota?.company || '',
    location:       g.location      || '',
    nationality:    g.nationality   || '',
    passportNo:     l.passport?.number || g.passport || '',
    passportExpiry: passExpiry ? formatDate(passExpiry) : '',
    passportStatus: passStatus,
    joiningDate:    formatDate(g.joining)      || '',
    recruitment:    formatDate(g.recruitment)  || '',
    socso:          l.socso?.reg               || '',
    licenseNo:      l.license?.reg             || '',
    licenseExpiry:  formatDate(l.license?.expiry) || '',
    permitNo:       l.permit?.reg              || '',
    permitExpiry:   formatDate(l.permit?.expiry)  || '',
    termination:    formatDate(g.termination)  || '',
    departure:      formatDate(g.departure)    || '',
  };
}

// ── COLUMN PICKER MODAL ───────────────────────────────────────
function openWorkerExportPicker() {
  const modal = document.getElementById('workerExportPickerModal');
  if (!modal) return;

  // Build column checkboxes
  const list = document.getElementById('wep-col-list');
  if (!list) return;

  const selected = _exportSelectedCols || WORKER_EXPORT_COLS.map(c => c.key);

  list.innerHTML = WORKER_EXPORT_COLS.map(col => `
    <label style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid var(--border-default);cursor:pointer;transition:background .12s;" onmouseover="this.style.background='rgba(139,105,20,.04)'" onmouseout="this.style.background=''">
      <input type="checkbox" value="${col.key}" ${selected.includes(col.key) ? 'checked' : ''}
        style="width:16px;height:16px;accent-color:var(--accent-primary);cursor:pointer;flex-shrink:0;"
        onchange="updateWepSelectAll()"/>
      <span style="font-size:13.5px;color:var(--text-primary);font-family:var(--font-body);">${esc(col.label)}</span>
    </label>`).join('');

  updateWepSelectAll();
  openModal('workerExportPickerModal');
}

function updateWepSelectAll() {
  const boxes    = document.querySelectorAll('#wep-col-list input[type="checkbox"]');
  const allBox   = document.getElementById('wep-select-all');
  if (!allBox) return;
  const total    = boxes.length;
  const checked  = [...boxes].filter(b => b.checked).length;
  allBox.checked       = checked === total;
  allBox.indeterminate = checked > 0 && checked < total;
}

function toggleWepAll(cb) {
  document.querySelectorAll('#wep-col-list input[type="checkbox"]')
    .forEach(b => b.checked = cb.checked);
}

function getWepSelectedKeys() {
  return [...document.querySelectorAll('#wep-col-list input[type="checkbox"]:checked')]
    .map(b => b.value);
}

function closeWorkerExportPicker() { closeModal('workerExportPickerModal'); }
function closeWorkerExportPickerOutside(e) { closeModalOutsideStack(e, 'workerExportPickerModal'); }

function doWorkerExport(format) {
  const keys = getWepSelectedKeys();
  if (!keys.length) { showToast('Please select at least one column.', true); return; }
  _exportSelectedCols = keys;
  const cols = WORKER_EXPORT_COLS.filter(c => keys.includes(c.key));
  const data = getFilteredSortedWorkers().map(buildWorkerExportRow);
  closeWorkerExportPicker();

  // Get active filter labels for header
  const locF  = document.getElementById('locationFilter')?.value  || '';
  const compF = document.getElementById('companyFilter')?.value   || '';

  if (format === 'pdf')  exportWorkersPDF(cols, data, locF, compF);
  if (format === 'xlsx') exportWorkersXLSX(cols, data, locF, compF);
}

// ── PDF EXPORT ────────────────────────────────────────────────
function exportWorkersPDF(cols, rows, locationFilter, companyFilter) {
  const ACCENT = '#1a5c2a';

  // Define explicit widths per column key (mm) — prevents single-char overflow
  const COL_WIDTHS = {
    workerId:       18, photo:          18, name:           22,
    status:         14, gender:         12, category:       14,
    quotaCompany:   28, location:       20, nationality:    16,
    passportNo:     16, passportExpiry: 16, passportStatus: 14,
    joiningDate:    16, recruitment:    16, socso:          20,
    licenseNo:      36, licenseExpiry:  16, permitNo:       24,
    permitExpiry:   16, termination:    16, departure:      16,
  };

  // Build colgroup for fixed widths
  const colgroupHTML = cols.map(c =>
    `<col style="width:${COL_WIDTHS[c.key] || 16}mm;"/>`
  ).join('');

  // Header row
  const thHTML = cols.map(c =>
    `<th style="background:${ACCENT};color:#fff;padding:5px 4px;border:1px solid #666;font-size:8px;font-weight:700;text-align:center;vertical-align:middle;line-height:1.3;">${esc(c.label)}</th>`
  ).join('');

  // Data rows — photo cell uses overflow:hidden to clip image strictly inside
  const trHTML = rows.map(r => {
    const tds = cols.map(col => {
      const val = r[col.key] || '';
      if (col.isPhoto) {
        return val
          ? `<td style="padding:2px;border:1px solid #ccc;text-align:center;vertical-align:middle;overflow:hidden;max-width:${COL_WIDTHS.photo}mm;">
               <img src="${val}" style="max-width:100%;max-height:60px;width:auto;height:auto;object-fit:contain;display:block;margin:0 auto;" onerror="this.style.display='none'"/>
             </td>`
          : `<td style="border:1px solid #ccc;"></td>`;
      }
      return `<td style="padding:3px 4px;border:1px solid #ccc;font-size:8px;text-align:center;vertical-align:middle;line-height:1.35;overflow-wrap:break-word;word-break:break-word;">${esc(String(val))}</td>`;
    }).join('');
    return `<tr style="height:68px;">${tds}</tr>`;
  }).join('');

  const now = new Date().toLocaleString('en-MY', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head>
    <title>MJM Groups Worker Profiles</title>
    <style>
      @page { size: A4 landscape; margin: 8mm 6mm 10mm 6mm; }
      * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; box-sizing:border-box; }
      body { margin:0; font-family:Calibri,Arial,sans-serif; font-size:8px; }
      table { border-collapse:collapse; width:100%; table-layout:fixed; }
      th, td { overflow:hidden; }
      td img { max-width:100%; max-height:60px; display:block; margin:0 auto; }
      .screen-only { display:flex; }
      @media print { .screen-only { display:none !important; } }
    </style>
  </head><body>

  <div class="screen-only" style="padding:10px 14px;background:#f0f4f0;border-bottom:2px solid ${ACCENT};gap:14px;align-items:center;position:sticky;top:0;z-index:10;">
    <button onclick="window.print()" style="background:${ACCENT};color:#fff;border:none;padding:10px 24px;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;">🖨 Print / Save as PDF</button>
    <span style="font-size:12px;color:#444;">Select <strong>Save as PDF</strong> · paper: <strong>A4 Landscape</strong>.</span>
  </div>

  <div style="text-align:center;font-size:12px;font-weight:700;margin:4px 0 4px;">MJM Groups Worker Profiles</div>
  <table style="margin-bottom:5px;border:none;width:auto;">
    <tr><td style="font-size:8.5px;font-weight:700;border:none;padding:1px 8px 1px 0;white-space:nowrap;">AP Quota Company :</td><td style="font-size:8.5px;border:none;">${esc(companyFilter || 'All')}</td></tr>
    <tr><td style="font-size:8.5px;font-weight:700;border:none;padding:1px 8px 1px 0;white-space:nowrap;">Work Location :</td><td style="font-size:8.5px;border:none;">${esc(locationFilter || 'All')}</td></tr>
    <tr><td style="font-size:8.5px;color:#666;border:none;padding:1px 8px 1px 0;white-space:nowrap;">Generated :</td><td style="font-size:8.5px;color:#666;border:none;">${now} &nbsp;·&nbsp; ${rows.length} record${rows.length!==1?'s':''}</td></tr>
  </table>

  <table>
    <colgroup>${colgroupHTML}</colgroup>
    <thead><tr>${thHTML}</tr></thead>
    <tbody>${trHTML}</tbody>
  </table>

  </body></html>`);
  win.document.close();
}

// ── XLSX EXPORT using ExcelJS (supports images + full styling) ──
async function exportWorkersXLSX(cols, rows, locationFilter, companyFilter) {
  showToast('Generating Excel file…');

  // Load ExcelJS from CDN
  if (!window.ExcelJS) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MJM Groups WMS';
  const ws  = wb.addWorksheet('Worker Profiles', {
    pageSetup: { paperSize: 8, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ showGridLines: false }],
  });

  const now     = new Date().toLocaleDateString('en-MY', { day:'2-digit', month:'2-digit', year:'numeric' });
  const nowFull = new Date().toLocaleString('en-MY', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });

  // ── STYLES ──────────────────────────────────────────────────
  const THIN_BORDER = {
    top:    { style:'thin', color:{ argb:'FF999999' } },
    bottom: { style:'thin', color:{ argb:'FF999999' } },
    left:   { style:'thin', color:{ argb:'FF999999' } },
    right:  { style:'thin', color:{ argb:'FF999999' } },
  };
  const CENTER  = { horizontal:'center', vertical:'middle', wrapText:true };
  const LEFT    = { horizontal:'left',   vertical:'middle', wrapText:true };
  const HDR_FILL = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF1A5C2A' } };

  // ── COLUMN WIDTHS ────────────────────────────────────────────
  ws.columns = cols.map(c => ({ width: c.width }));

  // ── ROW 1: Title — merged, bold, underlined, centered ───────
  const titleRow = ws.addRow(['MJM Groups Worker Profiles']);
  ws.mergeCells(1, 1, 1, cols.length);
  const titleCell = titleRow.getCell(1);
  titleCell.font      = { name:'Calibri', size:13, bold:true, underline:true };
  titleCell.alignment = CENTER;
  titleRow.height = 22;

  // ── ROW 2: AP Quota Company ──────────────────────────────────
  const compRow = ws.addRow(['AP Quota Company(ies) :', companyFilter || 'All']);
  ws.mergeCells(2, 2, 2, cols.length); // merge B2 to last col
  compRow.getCell(1).font      = { name:'Calibri', size:10, bold:true };
  compRow.getCell(1).alignment = LEFT;
  compRow.getCell(2).font      = { name:'Calibri', size:10 };
  compRow.getCell(2).alignment = LEFT;
  compRow.height = 37.5; // ~50px

  // ── ROW 3: Work Location ─────────────────────────────────────
  const locRow = ws.addRow(['Work Location(s) :', locationFilter || 'All']);
  ws.mergeCells(3, 2, 3, cols.length); // merge B3 to last col
  locRow.getCell(1).font      = { name:'Calibri', size:10, bold:true };
  locRow.getCell(1).alignment = LEFT;
  locRow.getCell(2).font      = { name:'Calibri', size:10 };
  locRow.getCell(2).alignment = LEFT;
  locRow.height = 37.5;  // ~50px

  // ── ROW 4: Generated info ─────────────────────────────────────
  const genRow = ws.addRow([`Generated: ${nowFull}   ·   ${rows.length} record${rows.length!==1?'s':''}`]);
  ws.mergeCells(4, 1, 4, cols.length);
  genRow.getCell(1).font      = { name:'Calibri', size:9, italic:true, color:{ argb:'FF666666' } };
  genRow.getCell(1).alignment = LEFT;
  genRow.height = 14;

  // ── ROW 5: Header row ─────────────────────────────────────────
  const hdrRow = ws.addRow(cols.map(c => c.label));
  hdrRow.height = 30;
  hdrRow.eachCell((cell) => {
    cell.font      = { name:'Calibri', size:9, bold:true, color:{ argb:'FFFFFFFF' } };
    cell.fill      = HDR_FILL;
    cell.alignment = CENTER;
    cell.border    = THIN_BORDER;
  });

  // ── DATA ROWS ─────────────────────────────────────────────────
  const photoColIdx = cols.findIndex(c => c.isPhoto); // 0-based

  for (let ri = 0; ri < rows.length; ri++) {
    const r        = rows[ri];
    const excelRow = ri + 6; // Excel row number (1-based, rows 1-5 are header)
    const ROW_H    = 75;     // points — tall enough for photo

    // Build row values (empty string for photo column — image added separately)
    const vals = cols.map(c => c.isPhoto ? '' : (r[c.key] || ''));
    const dataRow = ws.addRow(vals);
    dataRow.height = ROW_H;

    // Style all cells
    dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const col = cols[colNumber - 1];
      cell.font      = { name:'Calibri', size:9 };
      cell.alignment = (col && col.isPhoto) ? CENTER : CENTER;
      cell.border    = THIN_BORDER;
    });

    // ── Embed profile photo if column is selected and photo exists ──
    if (photoColIdx >= 0 && r.photo) {
      try {
        // Convert data URI to base64
        const dataUri = r.photo;
        const base64  = dataUri.split(',')[1];
        const mimeMatch = dataUri.match(/data:([^;]+);/);
        const ext = mimeMatch ? (mimeMatch[1].includes('png') ? 'png' : 'jpeg') : 'jpeg';

        const imgId = wb.addImage({ base64, extension: ext });

        // Position image in the photo cell
        // ExcelJS uses 0-based col/row for positioning
        const colIdx = photoColIdx; // 0-based
        // Calculate proper aspect ratio from image
        const imgEl = new Image();
        imgEl.src = dataUri;
        await new Promise(res => { imgEl.onload = res; imgEl.onerror = res; });
        const imgW = imgEl.naturalWidth  || 100;
        const imgH = imgEl.naturalHeight || 120;
        const ratio = imgW / imgH;

        // Cell dimensions (approximate): col width in chars * 7px, row height in pt * 1.33px
        const cellW_px = (cols[colIdx].width || 16) * 7;
        const cellH_px = ROW_H * 1.33;

        // Fit image maintaining aspect ratio within cell with padding
        const padX = 4, padY = 4;
        const availW = cellW_px - padX * 2;
        const availH = cellH_px - padY * 2;
        let drawW = availW;
        let drawH = drawW / ratio;
        if (drawH > availH) { drawH = availH; drawW = drawH * ratio; }

        // Convert px back to EMU for ExcelJS (1px = 9525 EMU)
        const EMU = 9525;
        // Centre image within cell
        const offsetX = Math.max(padX, Math.round((cellW_px - drawW) / 2));
        const offsetY = Math.max(padY, Math.round((cellH_px - drawH) / 2));

        ws.addImage(imgId, {
          tl: { col: colIdx, row: excelRow - 1, nativeCol: colIdx, nativeRow: excelRow - 1, nativeColOff: offsetX * EMU, nativeRowOff: offsetY * EMU },
          ext: { width: Math.round(drawW), height: Math.round(drawH) },
          editAs: 'oneCell',
        });
      } catch(e) {
        // Photo embed failed — leave cell empty
        console.warn('Photo embed failed:', e.message);
      }
    }
  }

  // ── PAGE MARGINS (match template) ────────────────────────────
  ws.pageSetup.margins = {
    left: 0.24, right: 0.24,
    top: 0.24,  bottom: 0.75,
    header: 0.31, footer: 0.31,
  };

  // ── DOWNLOAD ──────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href       = url;
  a.download   = `MJM_Worker_Profiles_${now.replace(/\//g,'-')}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  showToast('Excel file downloaded.');
}