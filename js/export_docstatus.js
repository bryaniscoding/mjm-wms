// ══════════════════════════════════════════════════════════════
//  DOCUMENT STATUS EXPORT — PDF & XLSX
//  Template: MJM Groups Worker Legal Documents Status
// ══════════════════════════════════════════════════════════════

// Fixed columns — no picker for this export (structure is fixed by template)
// But we allow column selection for the "fixed" worker info columns
const DOCSTATUS_INFO_COLS = [
  { key: 'workerId',    label: 'Worker ID',        width: 11.5 },
  { key: 'name',        label: 'Name',             width: 12.5 },
  { key: 'status',      label: 'Status',           width: 8.9  },
  { key: 'gender',      label: 'Gender',           width: 8.9  },
  { key: 'category',    label: 'Category',         width: 10.3 },
  { key: 'quotaCompany',label: 'AP Quota Company', width: 23   },
  { key: 'location',    label: 'Work Location',    width: 16.5 },
  { key: 'joiningDate', label: 'Joining Date',     width: 12.4 },
  { key: 'socso',       label: 'SOCSO No.',        width: 13.5 },
  { key: 'yearsService',label: 'Years',            width: 8.9, group: 'service' },
  { key: 'monthsService',label:'Months',           width: 8.9, group: 'service' },
  { key: 'daysService', label: 'Days',             width: 8.9, group: 'service' },
  { key: 'passportNo',  label: 'Number',           width: 18,   group: 'passport' },
  { key: 'passportExpiry', label: 'Expiry Date',   width: 13.2, group: 'passport' },
  { key: 'passportDays',   label: 'Remaining Days',width: 14.9, group: 'passport' },
  { key: 'licenseNo',   label: 'Number',           width: 33,   group: 'license'  },
  { key: 'licenseExpiry',  label: 'Expiry Date',   width: 13.2, group: 'license'  },
  { key: 'licenseDays',    label: 'Remaining Days',width: 14.9, group: 'license'  },
  { key: 'permitNo',    label: 'Number',           width: 22,   group: 'permit'   },
  { key: 'permitExpiry',   label: 'Expiry Date',   width: 13.2, group: 'permit'   },
  { key: 'permitDays',     label: 'Remaining Days',width: 14.9, group: 'permit'   },
];

let _docExportSelectedCols = null;

// Compute service period from joining date to today
function computeServicePeriod(joining) {
  if (!joining) return { years: '', months: '', days: '' };
  const start = new Date(joining); const now = new Date();
  let y = now.getFullYear() - start.getFullYear();
  let m = now.getMonth()    - start.getMonth();
  let d = now.getDate()     - start.getDate();
  if (d < 0) { m--; d += new Date(now.getFullYear(), now.getMonth(), 0).getDate(); }
  if (m < 0) { y--; m += 12; }
  return { years: y, months: m, days: d };
}

// Days remaining from today to expiry date
function daysRemaining(expiryStr) {
  if (!expiryStr) return '';
  const exp   = new Date(expiryStr); exp.setHours(0,0,0,0);
  const today = new Date();          today.setHours(0,0,0,0);
  return Math.floor((exp - today) / 86400000);
}

// Build row data for each worker
function buildDocStatusRow(w) {
  const g  = w.general || {};
  const l  = w.legal   || {};
  const sp = computeServicePeriod(g.joining);
  return {
    workerId:      g.workerId      || '',
    name:          g.name          || '',
    status:        deriveStatus(w),
    gender:        g.gender        || '',
    category:      deriveCategory(w),
    quotaCompany:  l.quota?.company || '',
    location:      g.location      || '',
    joiningDate:   formatDate(g.joining) || '',
    socso:         l.socso?.reg    || '',
    yearsService:  sp.years,
    monthsService: sp.months,
    daysService:   sp.days,
    passportNo:    l.passport?.number || g.passport || '',
    passportExpiry: formatDate(l.passport?.expiry) || '',
    passportDays:  daysRemaining(l.passport?.expiry),
    licenseNo:     l.license?.reg  || '',
    licenseExpiry: formatDate(l.license?.expiry) || '',
    licenseDays:   daysRemaining(l.license?.expiry),
    permitNo:      l.permit?.reg   || '',
    permitExpiry:  formatDate(l.permit?.expiry) || '',
    permitDays:    daysRemaining(l.permit?.expiry),
  };
}

// Get filtered + sorted workers (same logic as worker profiles)
function getDocStatusExportWorkers() {
  const query = (document.getElementById('workerSearch')?.value  || '').toLowerCase().trim();
  const catF  = document.getElementById('categoryFilter')?.value || '';
  const staF  = document.getElementById('statusFilter')?.value   || '';
  const locF  = document.getElementById('locationFilter')?.value || '';
  const compF = document.getElementById('companyFilter')?.value  || '';

  let list = workers.filter(w => {
    const g = w.general || {};
    const cat = deriveCategory(w); const sta = deriveStatus(w);
    const co  = w.legal?.quota?.company || '';
    const loc = g.location || '';
    if (catF && cat !== catF) return false;
    if (staF && sta !== staF) return false;
    if (locF && loc !== locF) return false;
    if (compF && co !== compF) return false;
    if (query) {
      const hay = [g.name,g.workerId,g.nationality,g.passport,loc,cat,sta,co].join(' ').toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });

  if (typeof workerSort !== 'undefined' && typeof applySort === 'function') {
    list = applySort(list, workerSort, (w, col) => {
      const g = w.general || {};
      switch(col) {
        case 'name':     return (g.name||'').toLowerCase();
        case 'category': return deriveCategory(w);
        case 'status':   return deriveStatus(w);
        case 'location': return (g.location||'').toLowerCase();
        default:         return '';
      }
    });
  }
  return list;
}

// ── COLUMN PICKER ─────────────────────────────────────────────
function openDocStatusExportPicker() {
  const modal = document.getElementById('docStatusExportPickerModal');
  if (!modal) return;
  const list     = document.getElementById('dsp-col-list');
  const selected = _docExportSelectedCols || DOCSTATUS_INFO_COLS.map(c => c.key);

  list.innerHTML = DOCSTATUS_INFO_COLS.map(col => `
    <label style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid var(--border-default);cursor:pointer;transition:background .12s;" onmouseover="this.style.background='rgba(139,105,20,.04)'" onmouseout="this.style.background=''">
      <input type="checkbox" value="${col.key}" ${selected.includes(col.key)?'checked':''}
        style="width:16px;height:16px;accent-color:var(--accent-primary);cursor:pointer;flex-shrink:0;"
        onchange="updateDspSelectAll()"/>
      <span style="font-size:13.5px;color:var(--text-primary);font-family:var(--font-body);">${col.group ? `<span style="font-size:11px;color:var(--text-tertiary);margin-right:4px;">[${col.group}]</span>` : ''}${esc(col.label)}</span>
    </label>`).join('');

  updateDspSelectAll();
  openModal('docStatusExportPickerModal');
}

function updateDspSelectAll() {
  const boxes  = document.querySelectorAll('#dsp-col-list input[type="checkbox"]');
  const allBox = document.getElementById('dsp-select-all');
  if (!allBox) return;
  const checked = [...boxes].filter(b=>b.checked).length;
  allBox.checked       = checked === boxes.length;
  allBox.indeterminate = checked > 0 && checked < boxes.length;
}

function toggleDspAll(cb) {
  document.querySelectorAll('#dsp-col-list input[type="checkbox"]').forEach(b => b.checked = cb.checked);
}

function closeDocStatusExportPicker()          { closeModal('docStatusExportPickerModal'); }
function closeDocStatusExportPickerOutside(e)  { closeModalOutsideStack(e,'docStatusExportPickerModal'); }

function doDocStatusExport(format) {
  const keys = [...document.querySelectorAll('#dsp-col-list input[type="checkbox"]:checked')].map(b=>b.value);
  if (!keys.length) { showToast('Please select at least one column.',true); return; }
  _docExportSelectedCols = keys;
  const cols = DOCSTATUS_INFO_COLS.filter(c => keys.includes(c.key));
  const rows = getDocStatusExportWorkers().map(buildDocStatusRow);
  const locF  = document.getElementById('locationFilter')?.value || '';
  const compF = document.getElementById('companyFilter')?.value  || '';
  const catF  = document.getElementById('categoryFilter')?.value || '';
  const staF  = document.getElementById('statusFilter')?.value   || '';
  closeDocStatusExportPicker();
  if (format === 'pdf')  exportDocStatusPDF(cols, rows, locF, compF, catF, staF);
  if (format === 'xlsx') exportDocStatusXLSX(cols, rows, locF, compF, catF, staF);
}

// ── PDF EXPORT ────────────────────────────────────────────────
function exportDocStatusPDF(cols, rows, locF, compF, catF, staF) {
  const ACCENT = '#1a5c2a';
  const now = new Date().toLocaleString('en-MY',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});

  // Group columns for double-row header
  const groups = [
    { label:'Service Period', keys:['yearsService','monthsService','daysService'] },
    { label:'Passport',       keys:['passportNo','passportExpiry','passportDays'] },
    { label:'Labour License', keys:['licenseNo','licenseExpiry','licenseDays']   },
    { label:'Work Permit',    keys:['permitNo','permitExpiry','permitDays']       },
  ];

  const COL_WIDTHS_MM = {
    workerId:12, name:14, status:10, gender:10, category:11,
    quotaCompany:26, location:17, joiningDate:13, socso:14,
    yearsService:9, monthsService:9, daysService:9,
    passportNo:20, passportExpiry:13, passportDays:13,
    licenseNo:30, licenseExpiry:13, licenseDays:13,
    permitNo:22, permitExpiry:13, permitDays:13,
  };

  const colgroupHTML = cols.map(c => `<col style="width:${COL_WIDTHS_MM[c.key]||12}mm;"/>`).join('');

  // Build header rows
  // Row 1: group spans + single cols spanning 2 rows
  const singleKeys = cols.filter(c => !c.group).map(c => c.key);
  const th1 = cols.map(c => {
    if (!c.group) return `<th rowspan="2" style="${thStyle(ACCENT)}">${esc(c.label)}</th>`;
    // First col of each group → span 3
    const grpCols = cols.filter(x => x.group === c.group);
    if (grpCols[0].key !== c.key) return ''; // skip non-first group cols
    const grpLabel = groups.find(g => g.keys.includes(c.key))?.label || c.group;
    return `<th colspan="${grpCols.length}" style="${thStyle(ACCENT)}">${grpLabel}</th>`;
  }).join('');

  const th2 = cols.filter(c => c.group).map(c => `<th style="${thStyle(ACCENT)}">${esc(c.label)}</th>`).join('');

  const trHTML = rows.map(r => {
    const tds = cols.map(c => `<td style="padding:3px 4px;border:1px solid #ccc;font-size:7.5px;text-align:center;vertical-align:middle;line-height:1.3;overflow-wrap:break-word;word-break:break-word;">${esc(String(r[c.key] ?? ''))}</td>`).join('');
    return `<tr>${tds}</tr>`;
  }).join('');

  const win = window.open('','_blank');
  win.document.write(`<!DOCTYPE html><html><head>
    <title>MJM Groups Worker Legal Documents Status</title>
    <style>
      @page{size:A4 landscape;margin:7mm 5mm 10mm 5mm;}
      *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;box-sizing:border-box;}
      body{margin:0;font-family:Calibri,Arial,sans-serif;font-size:7.5px;}
      table{border-collapse:collapse;width:100%;table-layout:fixed;}
      th,td{overflow:hidden;}
      thead{display:table-header-group;}
      .screen-only{display:flex;}
      @media print{.screen-only{display:none!important;}}
    </style>
  </head><body>
  <div class="screen-only" style="padding:10px 14px;background:#f0f4f0;border-bottom:2px solid ${ACCENT};gap:14px;align-items:center;position:sticky;top:0;z-index:10;">
    <button onclick="window.print()" style="background:${ACCENT};color:#fff;border:none;padding:10px 24px;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;">🖨 Print / Save as PDF</button>
    <span style="font-size:12px;color:#444;">Select <strong>Save as PDF</strong> · paper: <strong>A4 Landscape</strong></span>
  </div>
  <table>
    <colgroup>${colgroupHTML}</colgroup>
    <thead>
      <tr><td colspan="${cols.length}" style="text-align:center;font-size:11px;font-weight:700;padding:3px;border:none;">MJM Groups Worker Legal Documents Status</td></tr>
      <tr><td style="font-size:8px;font-weight:700;border:none;white-space:nowrap;padding:1px 6px 1px 0;">AP Quota Company :</td><td colspan="${cols.length-1}" style="font-size:8px;border:none;padding:1px 0;">${esc(compF||'All')}</td></tr>
      <tr><td style="font-size:8px;font-weight:700;border:none;white-space:nowrap;padding:1px 6px 1px 0;">Work Location :</td><td colspan="${cols.length-1}" style="font-size:8px;border:none;padding:1px 0;">${esc(locF||'All')}</td></tr>
      <tr><td style="font-size:8px;font-weight:700;border:none;white-space:nowrap;padding:1px 6px 1px 0;">Document Types :</td><td colspan="${cols.length-1}" style="font-size:8px;border:none;padding:1px 0;">All</td></tr>
      <tr><td style="font-size:8px;font-weight:700;border:none;white-space:nowrap;padding:1px 6px 1px 0;">Expiry Date Range :</td><td colspan="${cols.length-1}" style="font-size:8px;border:none;padding:1px 0;">All</td></tr>
      <tr><td colspan="${cols.length}" style="font-size:7.5px;color:#666;border:none;padding:1px 0 3px;">${now} &nbsp;·&nbsp; ${rows.length} record${rows.length!==1?'s':''}</td></tr>
      <tr>${th1}</tr>
      <tr>${th2}</tr>
    </thead>
    <tbody>${trHTML}</tbody>
  </table>
  </body></html>`);
  win.document.close();
}

function thStyle(accent){return `background:${accent};color:#fff;padding:4px 3px;border:1px solid #555;font-size:7.5px;font-weight:700;text-align:center;vertical-align:middle;line-height:1.3;`;}

// ── XLSX EXPORT ───────────────────────────────────────────────
async function exportDocStatusXLSX(cols, rows, locF, compF, catF, staF) {
  showToast('Generating Excel file…');
  if (!window.ExcelJS) {
    await new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
      s.onload=resolve;s.onerror=reject;
      document.head.appendChild(s);
    });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator='MJM Groups WMS';
  const ws = wb.addWorksheet('Document Status',{
    pageSetup:{paperSize:8,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0},
    views:[{showGridLines:false}],
  });

  const now     = new Date().toLocaleDateString('en-MY',{day:'2-digit',month:'2-digit',year:'numeric'});
  const nowFull = new Date().toLocaleString('en-MY',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const N = cols.length;

  const THIN = {top:{style:'thin',color:{argb:'FF999999'}},bottom:{style:'thin',color:{argb:'FF999999'}},left:{style:'thin',color:{argb:'FF999999'}},right:{style:'thin',color:{argb:'FF999999'}}};
  const GREEN_FILL = {type:'pattern',pattern:'solid',fgColor:{argb:'FF1A5C2A'}};
  const CENTER = {horizontal:'center',vertical:'middle',wrapText:true};
  const LEFT   = {horizontal:'left',  vertical:'middle',wrapText:true};
  const WHT_BOLD = {name:'Calibri',size:9,bold:true,color:{argb:'FFFFFFFF'}};
  const NORM     = {name:'Calibri',size:9};
  const BOLD     = {name:'Calibri',size:10,bold:true};

  // Set column widths
  ws.columns = cols.map(c=>({width:c.width||10}));

  // Helper to style a cell
  function styleCell(cell, font, alignment, fill, border) {
    if(font)      cell.font      = font;
    if(alignment) cell.alignment = alignment;
    if(fill)      cell.fill      = fill;
    if(border)    cell.border    = border;
  }

  // ── ROW 1: Title ─────────────────────────────────────────────
  const r1 = ws.addRow(['MJM Groups Worker Legal Documents Status']);
  ws.mergeCells(1,1,1,N);
  styleCell(r1.getCell(1),{name:'Calibri',size:13,bold:true,underline:true},CENTER);
  r1.height=24;

  // ── ROW 2-5: Filters ─────────────────────────────────────────
  const filterRows=[
    ['AP Quota Company :',compF||'All'],
    ['Work Location :',   locF||'All'],
    ['Document Types :',  'All'],
    ['Expiry Date Range :','All'],
  ];
  filterRows.forEach((fr,i)=>{
    const row=ws.addRow([fr[0],null,fr[1]]);
    const rn=2+i;
    ws.mergeCells(rn,3,rn,N);
    styleCell(row.getCell(1),BOLD,LEFT);
    styleCell(row.getCell(3),NORM,LEFT);
    row.height=24;
  });

  // ── ROW 6: Generated ─────────────────────────────────────────
  const r6=ws.addRow([`Generated :`,null,`${nowFull}   ·   ${rows.length} record${rows.length!==1?'s':''}`]);
  ws.mergeCells(6,1,6,2);
  ws.mergeCells(6,3,6,N);
  styleCell(r6.getCell(1),BOLD,LEFT);
  styleCell(r6.getCell(3),{name:'Calibri',size:9,italic:true,color:{argb:'FF666666'}},LEFT);
  r6.height=24;

  // ── ROW 7: Main headers (with group spans) ───────────────────
  const groups={service:{label:'Service Period',keys:['yearsService','monthsService','daysService']},passport:{label:'Passport',keys:['passportNo','passportExpiry','passportDays']},license:{label:'Labour License',keys:['licenseNo','licenseExpiry','licenseDays']},permit:{label:'Work Permit',keys:['permitNo','permitExpiry','permitDays']}};

  const r7vals=cols.map(c=>c.group?null:''); // placeholders
  const r7=ws.addRow(r7vals.map(()=>null));
  r7.height=18;

  const r8=ws.addRow(cols.map(()=>null));
  r8.height=18;

  // Fill row 7 cells
  let ci=1;
  for(const col of cols){
    const cell7=r7.getCell(ci);
    const cell8=r8.getCell(ci);
    if(!col.group){
      // Single col spans rows 7-8
      cell7.value=col.label;
      styleCell(cell7,WHT_BOLD,CENTER,GREEN_FILL,THIN);
      styleCell(cell8,WHT_BOLD,CENTER,GREEN_FILL,THIN);
      ws.mergeCells(7,ci,8,ci);
    } else {
      // Check if first in group
      const grpCols=cols.filter(c=>c.group===col.group);
      if(grpCols[0].key===col.key){
        const grpLabel=groups[col.group]?.label||col.group;
        const span=grpCols.length;
        cell7.value=grpLabel;
        styleCell(cell7,WHT_BOLD,CENTER,GREEN_FILL,THIN);
        if(span>1) ws.mergeCells(7,ci,7,ci+span-1);
        // Fill borders on remaining row-7 cells in group
        for(let k=1;k<span;k++) styleCell(r7.getCell(ci+k),WHT_BOLD,CENTER,GREEN_FILL,THIN);
      }
      // Row 8 sub-header
      cell8.value=col.label;
      styleCell(cell8,WHT_BOLD,CENTER,GREEN_FILL,THIN);
    }
    ci++;
  }

  // ── DATA ROWS ─────────────────────────────────────────────────
  rows.forEach(r=>{
    const dataRow=ws.addRow(cols.map(c=>r[c.key]??''));
    dataRow.height=20;
    dataRow.eachCell({includeEmpty:true},(cell)=>{
      styleCell(cell,NORM,CENTER,null,THIN);
    });
  });

  ws.pageSetup.margins={left:0.2,right:0.2,top:0.2,bottom:0.75,header:0.3,footer:0.3};

  const buffer=await wb.xlsx.writeBuffer();
  const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=`MJM_Document_Status_${now.replace(/\//g,'-')}.xlsx`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
  showToast('Excel file downloaded.');
}