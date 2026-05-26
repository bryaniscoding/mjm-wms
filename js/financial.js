// ============================================================
//  financial.js — Financial Report page
//  Depends on: utils.js, data.js
// ============================================================

let finSort = { col: 'date', dir: 2 };  // default: newest first

// ── POPULATE FILTERS ──────────────────────────────────────────
function populateFinFilters() {
  const locs   = [...new Set(workers.map(w => w.general?.location).filter(Boolean))].sort();
  const locSel = document.getElementById('finLocFilter');
  if (locSel) locSel.innerHTML = `<option value="">All Locations</option>` + locs.map(l => `<option>${esc(l)}</option>`).join('');
}

// ── SORT / FILTER ─────────────────────────────────────────────
function sortFin(col)       { handleSort(finSort, col, renderFinancialTable); }
function filterFinancial()  { renderFinancialTable(); }
function clearFinFilters()  {
  ['finSearch','finDocFilter','finLocFilter','finDateFrom','finDateTo']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  renderFinancialTable();
}

// ── RENDER TABLE ──────────────────────────────────────────────
function renderFinancialTable() {
  const query    = (document.getElementById('finSearch')?.value    || '').toLowerCase().trim();
  const docF     = document.getElementById('finDocFilter')?.value  || '';
  const locF     = document.getElementById('finLocFilter')?.value  || '';
  const dateFrom = document.getElementById('finDateFrom')?.value   || '';
  const dateTo   = document.getElementById('finDateTo')?.value     || '';

  let rows = getFinancials();
  if (query)    rows = rows.filter(r => [r.workerName, r.docType, r.appType, r.location].join(' ').toLowerCase().includes(query));
  if (docF)     rows = rows.filter(r => r.docType  === docF);
  if (locF)     rows = rows.filter(r => r.location === locF);
  if (dateFrom) rows = rows.filter(r => r.date >= dateFrom);
  if (dateTo)   rows = rows.filter(r => r.date <= dateTo);

  rows = applySort(rows, finSort, (r, col) => r[col] !== undefined ? String(r[col]) : '');
  updateSortIcons('page-financial-report', finSort);

  // Summary cards
  const totalAmount = rows.reduce((s, r) => s + (parseFloat(r.total)  || 0), 0);
  const totalQty    = rows.reduce((s, r) => s + (parseInt(r.qty)      || 0), 0);

  document.getElementById('fin-summary').innerHTML = `
    <div class="fin-card">
      <div class="fin-card-label">Total Transactions</div>
      <div class="fin-card-value">${rows.length}</div>
    </div>
    <div class="fin-card">
      <div class="fin-card-label">Total Quantity</div>
      <div class="fin-card-value">${totalQty}</div>
    </div>
    <div class="fin-card">
      <div class="fin-card-label">Total Amount</div>
      <div class="fin-card-value">RM ${totalAmount.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</div>
    </div>`;

  const tbody = document.getElementById('fin-table-body');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">💰</div>
      <p>No financial records yet. Submit applications to generate records.</p>
    </div></td></tr>`;
    document.getElementById('fin-count').textContent = ''; return;
  }

  tbody.innerHTML = rows.map(r => `<tr>
    <td>${formatDate(r.date)}</td>
    <td>${esc(r.workerName || '—')}</td>
    <td><span class="doc-type-badge">${esc(r.docType)}</span></td>
    <td>${esc(r.appType)}</td>
    <td>${esc(r.location  || '—')}</td>
    <td style="text-align:center;">${r.qty || 1}</td>
    <td style="text-align:right;">RM ${(parseFloat(r.unitPrice) || 0).toFixed(2)}</td>
    <td style="text-align:right;font-weight:600;color:var(--green);">RM ${(parseFloat(r.total) || 0).toFixed(2)}</td>
  </tr>`).join('');

  document.getElementById('fin-count').textContent =
    ` ${rows.length} record${rows.length !== 1 ? 's' : ''} · Total: RM ${totalAmount.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`;
}

// ── GENERATE / EXPORT REPORT ──────────────────────────────────
function generateFinReport() {
  const rows = document.querySelectorAll('#fin-table-body tr');
  if (!rows.length) { showToast('No data to export.', true); return; }

  const headers = ['Date','Worker Name','Document Type','Application Type','Work Location','Qty','Unit Price (RM)','Total (RM)'];
  let csv = headers.join(',') + '\n';
  rows.forEach(r => {
    const cells = [...r.querySelectorAll('td')].map(td => '"' + td.textContent.replace(/"/g, '""') + '"');
    csv += cells.join(',') + '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `MJM_Financial_Report_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  showToast('Report exported as CSV.');
}
