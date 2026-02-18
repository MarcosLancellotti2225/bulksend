// ============================================
// Signaturit Bulk Sender v2 — App Logic
// ============================================

// ===== STATE =====
let currentStep = 1;
let csvData = [], csvHeaders = [];
let pdfFiles = {};   // name.lower() → { file, size }
let matchedData = [];
let sendLog = [];
let sending = false;

// ===== SIGNATURIT OFFICIAL VARIABLES =====
const OFFICIAL_VARIABLES = [
  { name: 'signer_name', desc: 'Nombre del firmante', category: 'firmante' },
  { name: 'signer_email', desc: 'Email del firmante', category: 'firmante' },
  { name: 'sender_email', desc: 'Email del remitente', category: 'email' },
  { name: 'filename', desc: 'Nombre del archivo', category: 'documento' },
  { name: 'sign_button', desc: 'Botón de firma', category: 'email' },
  { name: 'validate_button', desc: 'Botón de validación', category: 'email' },
  { name: 'email_button', desc: 'Botón de email', category: 'email' },
  { name: 'email_body', desc: 'Cuerpo del email', category: 'email' },
  { name: 'logo', desc: 'Logo del branding', category: 'branding' },
  { name: 'remaining_time', desc: 'Tiempo restante', category: 'documento' },
  { name: 'code', desc: 'Código SMS', category: 'validación' },
  { name: 'reason', desc: 'Razón de rechazo', category: 'documento' },
  { name: 'dashboard_button', desc: 'Botón al dashboard', category: 'email' },
  { name: 'signers', desc: 'Lista de firmantes (NAME - EMAIL)', category: 'firmante' },
];

let customVariables = []; // User-added variables
let activeTextField = null; // Track which text field to insert into

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  renderVariableChips();
});

// ===== HELPERS =====
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(2) + ' MB';
}

function sizeClass(bytes) {
  if (bytes > 5242880) return 'size-over';
  if (bytes > 3145728) return 'size-warn';
  return 'size-ok';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ===== TOGGLE HELPERS =====
function toggleField(name) {
  const on = document.getElementById(`tog-${name}`).checked;
  const el = document.getElementById(`cfg-${name}`);
  if (el) el.disabled = !on;
}

function toggleMap(name) {
  const on = document.getElementById(`mtog-${name}`).checked;
  const el = document.getElementById(`map-${name}`);
  if (el) {
    el.disabled = !on;
    if (!on) el.value = '';
  }
}

// ===== VARIABLE SYSTEM =====
function getAllVariables() {
  return [
    ...OFFICIAL_VARIABLES.map(v => ({ ...v, official: true })),
    ...customVariables.map(v => ({ ...v, official: false }))
  ];
}

function renderVariableChips() {
  const container = document.getElementById('var-chips');
  if (!container) return;

  const allVars = getAllVariables();
  const count = document.getElementById('var-count');
  if (count) count.textContent = allVars.length;

  container.innerHTML = allVars.map(v =>
    `<span class="var-chip ${v.official ? 'official' : ''}" 
          onclick="insertVariable('${v.name}')" 
          title="${v.desc || v.name}">
      <span class="var-icon">${v.official ? '⚙️' : '🏷️'}</span>
      {{${v.name}}}
    </span>`
  ).join('') +
    `<span class="var-chip var-chip-add" onclick="openVariableModal()">+ Añadir</span>`;
}

function insertVariable(name) {
  const fields = ['cfg-subject', 'cfg-body'];
  // Find the last focused text field, or fallback to subject
  let target = null;
  for (const id of fields) {
    const el = document.getElementById(id);
    if (el && !el.disabled && document.activeElement === el) {
      target = el;
      break;
    }
  }
  if (!target) {
    // Try the last one that was focused
    if (activeTextField) target = activeTextField;
    else target = document.getElementById('cfg-subject');
  }
  if (!target || target.disabled) {
    showToast('Activá el campo Subject o Body primero para insertar variables');
    return;
  }

  const tag = `{{${name}}}`;
  const start = target.selectionStart || target.value.length;
  const end = target.selectionEnd || target.value.length;
  target.value = target.value.substring(0, start) + tag + target.value.substring(end);
  target.focus();
  target.setSelectionRange(start + tag.length, start + tag.length);
  showToast(`✓ {{${name}}} insertada`);
}

// Track which text field was last focused
document.addEventListener('focusin', (e) => {
  if (['cfg-subject', 'cfg-body'].includes(e.target?.id)) {
    activeTextField = e.target;
  }
});

function openVariableModal() {
  document.getElementById('variable-modal').classList.add('active');
  renderVariableModalList();
}

function closeVariableModal() {
  document.getElementById('variable-modal').classList.remove('active');
}

function renderVariableModalList() {
  const list = document.getElementById('modal-var-list');
  const allVars = getAllVariables();

  list.innerHTML = allVars.map((v, i) =>
    `<div class="modal-var-item">
      <div>
        <span class="var-name">{{${v.name}}}</span>
        <div class="var-desc">${v.desc || ''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="var-badge">${v.official ? 'Oficial' : 'Custom'}</span>
        ${!v.official ? `<button class="btn-remove-field" onclick="removeCustomVariable(${i - OFFICIAL_VARIABLES.length})" title="Eliminar">×</button>` : ''}
      </div>
    </div>`
  ).join('');
}

function addCustomVariable() {
  const input = document.getElementById('new-var-input');
  const name = input.value.trim().replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
  if (!name) return;
  if (getAllVariables().some(v => v.name === name)) {
    showToast('⚠️ Esa variable ya existe');
    return;
  }
  customVariables.push({ name, desc: 'Variable personalizada', category: 'custom' });
  input.value = '';
  renderVariableChips();
  renderVariableModalList();
  showToast(`✓ {{${name}}} añadida`);
}

function removeCustomVariable(idx) {
  customVariables.splice(idx, 1);
  renderVariableChips();
  renderVariableModalList();
}

// Toast notification
function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#0D1F3C;color:white;padding:10px 20px;border-radius:8px;font-size:13px;z-index:9999;opacity:0;transition:opacity 0.3s;pointer-events:none;';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  setTimeout(() => toast.style.opacity = '0', 2000);
}

// ===== STEP NAVIGATION =====
function goToStep(step) {
  if (sending) return;
  currentStep = step;
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`panel-${step}`).classList.add('active');
  document.querySelectorAll('.step-item').forEach(s => {
    const n = parseInt(s.dataset.step);
    s.classList.remove('active', 'completed');
    if (n === step) s.classList.add('active');
    else if (n < step) s.classList.add('completed');
  });
  for (let i = 1; i <= 3; i++) {
    const c = document.getElementById(`conn-${i}-${i + 1}`);
    if (c) c.classList.toggle('active', i < step);
  }
  if (step === 3) populateMappingSelects();
  if (step === 4) prepareSendSummary();
}

function validateStep1() {
  if (!document.getElementById('cfg-token').value) { alert('Falta el Access Token'); return false; }
  if (!document.getElementById('cfg-proxy').value) { alert('Falta la URL de la Supabase Function'); return false; }
  return true;
}

// ===== CSV =====
function parseCSV(text) {
  text = text.replace(/^\ufeff/, '');
  const lines = text.trim().split('\n');
  const first = lines[0];
  const sep = first.split(';').length > first.split(',').length ? ';' : ',';
  const headers = first.split(sep).map(h => h.trim().replace(/^["']|["']$/g, ''));
  if (headers.some(h => h.includes('@') || /^\d{6,}$/.test(h))) {
    alert('La primera fila parece datos, no encabezados. Usá la plantilla CSV.');
    return { headers: [], rows: [] };
  }
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = lines[i].split(sep).map(v => v.trim().replace(/^["']|["']$/g, ''));
    const row = {};
    headers.forEach((h, idx) => row[h] = vals[idx] || '');
    rows.push(row);
  }
  return { headers, rows };
}

function handleCSVFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const p = parseCSV(e.target.result);
    if (!p.headers.length) return;
    csvHeaders = p.headers;
    csvData = p.rows;
    showCSVPreview();
    updateZone('csv-zone', `✓ ${file.name} — ${csvData.length} filas, ${csvHeaders.length} columnas`);
    checkStep2();
  };
  reader.readAsText(file);
}
function handleCSVDrop(e) { handleCSVFile(e.dataTransfer.files[0]); }

function showCSVPreview() {
  document.getElementById('csv-preview').style.display = 'block';
  document.getElementById('csv-stats').innerHTML =
    `<span class="stat-badge">${csvData.length} filas</span><span class="stat-badge">${csvHeaders.length} cols</span>`;
  const max = Math.min(csvData.length, 8);
  let html = '<table><thead><tr><th>#</th>' + csvHeaders.map(h => `<th>${h}</th>`).join('') + '</tr></thead><tbody>';
  for (let i = 0; i < max; i++) {
    html += `<tr><td>${i + 1}</td>` + csvHeaders.map(h => `<td title="${csvData[i][h]}">${csvData[i][h]}</td>`).join('') + '</tr>';
  }
  if (csvData.length > max) html += `<tr><td colspan="${csvHeaders.length + 1}" style="text-align:center;color:var(--text-dim)">...y ${csvData.length - max} más</td></tr>`;
  html += '</tbody></table>';
  document.getElementById('csv-table-scroll').innerHTML = html;
}

// ===== PDFs =====
function handlePDFFiles(files) {
  if (!files || !files.length) return;
  for (const f of files) {
    if (f.name.toLowerCase().endsWith('.pdf')) {
      pdfFiles[f.name.toLowerCase()] = { file: f, size: f.size };
    }
  }
  renderPDFList();
  checkStep2();
}
function handlePDFDrop(e) { handlePDFFiles(e.dataTransfer.files); }

function renderPDFList() {
  const entries = Object.entries(pdfFiles).sort((a, b) => a[0].localeCompare(b[0]));
  const count = entries.length;
  const totalSize = entries.reduce((sum, [, v]) => sum + v.size, 0);
  const overSize = entries.filter(([, v]) => v.size > 5242880).length;

  document.getElementById('pdf-list-area').style.display = 'block';
  document.getElementById('pdf-total-stats').innerHTML =
    `<span class="stat-badge">${count} archivos</span>` +
    `<span class="stat-badge">${formatSize(totalSize)} total</span>` +
    (overSize > 0 ? `<span class="stat-badge error">${overSize} > 5MB</span>` : '');

  let html = '';
  entries.forEach(([name, data]) => {
    html += `<div class="pdf-row">
      <span class="pdf-name" title="${name}">${name}</span>
      <span class="pdf-size ${sizeClass(data.size)}">${formatSize(data.size)}</span>
    </div>`;
  });
  document.getElementById('pdf-list-scroll').innerHTML = html;
  updateZone('pdf-zone', `✓ ${count} PDFs · ${formatSize(totalSize)} total${overSize > 0 ? ` · ⚠️ ${overSize} superan 5MB` : ''}`);
}

function updateZone(id, msg) {
  const z = document.getElementById(id);
  z.classList.add('has-file');
  z.innerHTML = `<div class="file-info">${msg}</div>`;
}

function checkStep2() {
  document.getElementById('btn-to-mapping').disabled = csvData.length === 0;
}

// ===== MAPPING =====
function populateMappingSelects() {
  const autoMap = {
    'map-email': ['email', 'correo', 'mail', 'e-mail'],
    'map-name': ['nombre', 'name', 'destinatario'],
    'map-phone': ['telefono', 'phone', 'tel', 'movil'],
    'map-file': ['archivo', 'file', 'documento', 'pdf', 'nombre_archivo']
  };
  document.querySelectorAll('.map-select').forEach(sel => {
    const prev = sel.value;
    sel.innerHTML = '<option value="">— No enviar —</option>' + csvHeaders.map(h => `<option value="${h}">${h}</option>`).join('');
    if (prev && csvHeaders.includes(prev)) { sel.value = prev; return; }
    const keys = autoMap[sel.id];
    if (keys) {
      const m = csvHeaders.find(h => keys.some(k => h.toLowerCase().includes(k)));
      if (m && !sel.disabled) sel.value = m;
    }
  });
}

function addCustomField() {
  const list = document.getElementById('custom-fields-list');
  const div = document.createElement('div');
  div.className = 'custom-field-row';
  div.innerHTML = `<input type="text" placeholder="Key (ej: crm_id)" class="custom-key" />
    <select class="custom-col"><option value="">— Columna —</option>${csvHeaders.map(h => `<option value="${h}">${h}</option>`).join('')}</select>
    <button class="btn-remove-field" onclick="this.parentElement.remove()">×</button>`;
  list.appendChild(div);
}

// ===== PREVIEW =====
function generatePreview() {
  const mapEmail = document.getElementById('map-email').value;
  if (!mapEmail) { alert('Asigná al menos la columna de email.'); return; }

  const useFile = document.getElementById('mtog-file').checked;
  const useName = document.getElementById('mtog-name').checked;
  const usePhone = document.getElementById('mtog-phone').checked;
  const mapFile = useFile ? document.getElementById('map-file').value : '';
  const mapName = useName ? document.getElementById('map-name').value : '';
  const mapPhone = usePhone ? document.getElementById('map-phone').value : '';

  matchedData = csvData.map((row, idx) => {
    let file = null, fileMatched = false, fileSize = 0;
    const rawFileName = mapFile ? (row[mapFile] || '').trim() : '';

    if (mapFile && rawFileName) {
      const fKey = rawFileName.toLowerCase();
      const fKeyPdf = fKey.endsWith('.pdf') ? fKey : fKey + '.pdf';
      const found = pdfFiles[fKeyPdf] || pdfFiles[fKey] || null;
      if (found) { file = found.file; fileMatched = true; fileSize = found.size; }
    }

    return {
      index: idx + 1,
      email: row[mapEmail] || '',
      name: mapName ? (row[mapName] || '') : '',
      phone: mapPhone ? (row[mapPhone] || '') : '',
      fileName: rawFileName,
      fileMatched, file, fileSize,
      useFile: !!mapFile,
      rawRow: row
    };
  });

  const total = matchedData.length;
  const hasEmail = matchedData.filter(m => m.email).length;
  const noEmail = total - hasEmail;
  const filesMissing = matchedData.filter(m => m.useFile && !m.fileMatched).length;
  const overSize = matchedData.filter(m => m.fileSize > 5242880).length;
  const ready = matchedData.filter(m => m.email && (!m.useFile || m.fileMatched)).length;

  document.getElementById('match-preview').style.display = 'block';
  document.getElementById('match-stats').innerHTML =
    `<span class="stat-badge success">✓ ${ready} listos</span>` +
    (noEmail > 0 ? `<span class="stat-badge error">✗ ${noEmail} sin email</span>` : '') +
    (filesMissing > 0 ? `<span class="stat-badge error">✗ ${filesMissing} sin PDF</span>` : '') +
    (overSize > 0 ? `<span class="stat-badge warning">⚠ ${overSize} > 5MB</span>` : '');

  const showName = useName && mapName;
  const showPhone = usePhone && mapPhone;
  const showFile = useFile && mapFile;

  let html = '<table><thead><tr><th>#</th>' +
    (showName ? '<th>Nombre</th>' : '') +
    '<th>Email</th>' +
    (showPhone ? '<th>Tel</th>' : '') +
    (showFile ? '<th>Archivo</th><th>Peso</th>' : '') +
    '<th>Estado</th></tr></thead><tbody>';

  matchedData.forEach(m => {
    let status = 'OK', statusClass = 'matched';
    if (!m.email) { status = 'Sin email'; statusClass = 'missing'; }
    else if (m.useFile && !m.fileMatched) { status = 'Sin PDF'; statusClass = 'missing'; }

    html += `<tr><td>${m.index}</td>` +
      (showName ? `<td>${m.name || '—'}</td>` : '') +
      `<td>${m.email || '<span style="color:var(--error)">vacío</span>'}</td>` +
      (showPhone ? `<td>${m.phone || '—'}</td>` : '') +
      (showFile ? `<td>${m.fileName || '—'}</td><td class="${m.fileMatched ? sizeClass(m.fileSize) : ''}">${m.fileMatched ? formatSize(m.fileSize) : '—'}</td>` : '') +
      `<td><span class="status-dot ${statusClass}"></span>${status}</td></tr>`;
  });
  html += '</tbody></table>';
  document.getElementById('match-table-scroll').innerHTML = html;
  document.getElementById('btn-to-send').disabled = ready === 0;
}

// ===== SEND SUMMARY =====
function prepareSendSummary() {
  const env = document.getElementById('cfg-env').value;
  const ready = matchedData.filter(m => m.email && (!m.useFile || m.fileMatched) && m.status !== 'sent').length;
  const totalSize = matchedData.filter(m => m.fileMatched).reduce((s, m) => s + m.fileSize, 0);

  const enabled = [];
  ['delivery', 'type', 'branding', 'signing-mode', 'subject', 'body'].forEach(f => {
    if (document.getElementById(`tog-${f}`)?.checked) enabled.push(f);
  });
  const mapEnabled = [];
  ['name', 'phone', 'file'].forEach(f => {
    if (document.getElementById(`mtog-${f}`)?.checked && document.getElementById(`map-${f}`)?.value) mapEnabled.push(f);
  });

  document.getElementById('send-summary').innerHTML = `<div class="summary-grid">
    <div><span>Entorno:</span> <code>${env}</code></div>
    <div><span>Envíos pendientes:</span> <code>${ready}</code></div>
    <div><span>Proxy:</span> <code>Supabase Edge Function</code></div>
    <div><span>Peso total PDFs:</span> <code>${formatSize(totalSize)}</code></div>
    <div><span>Campos mapeados:</span> <code>email${mapEnabled.length ? ', ' + mapEnabled.join(', ') : ''}</code></div>
    <div><span>Config opcionales:</span> <code>${enabled.length ? enabled.join(', ') : 'ninguno'}</code></div>
  </div>`;
}

// ===== RESOLVE VARIABLES IN TEXT =====
function resolveVars(text, item) {
  if (!text) return text;
  return text
    .replace(/\{\{signer_name\}\}/gi, item.name || '')
    .replace(/\{\{signer_email\}\}/gi, item.email || '')
    .replace(/\{\{sender_email\}\}/gi, document.getElementById('cfg-token')?.value ? 'sender' : '')
    .replace(/\{\{filename\}\}/gi, item.fileName || '')
    .replace(/\{\{email\}\}/gi, item.email || '')
    .replace(/\{\{nombre\}\}/gi, item.name || '')
    // Custom variables from CSV data
    .replace(/\{\{(\w+)\}\}/gi, (match, key) => {
      return item.rawRow?.[key] || match;
    });
}

// ===== SENDING =====
async function startSending() {
  const token = document.getElementById('cfg-token').value;
  const proxyUrl = document.getElementById('cfg-proxy').value;
  const env = document.getElementById('cfg-env').value;
  const delay = parseInt(document.getElementById('cfg-delay').value) || 1000;

  if (!token || !proxyUrl) { alert('Falta token o URL del proxy'); return; }

  const apiUrl = env === 'sandbox'
    ? 'https://api.sandbox.signaturit.com/v3/signatures.json'
    : 'https://api.signaturit.com/v3/signatures.json';

  const getOpt = (tog, cfg) => document.getElementById(tog)?.checked ? document.getElementById(cfg)?.value : null;
  const delivery = getOpt('tog-delivery', 'cfg-delivery');
  const sigType = getOpt('tog-type', 'cfg-type');
  const branding = getOpt('tog-branding', 'cfg-branding');
  const signingMode = getOpt('tog-signing-mode', 'cfg-signing-mode');
  const subject = getOpt('tog-subject', 'cfg-subject');
  const body = getOpt('tog-body', 'cfg-body');

  const useName = document.getElementById('mtog-name').checked && document.getElementById('map-name').value;
  const usePhone = document.getElementById('mtog-phone').checked && document.getElementById('map-phone').value;
  const useFile = document.getElementById('mtog-file').checked && document.getElementById('map-file').value;

  const customFields = [];
  document.querySelectorAll('.custom-field-row').forEach(row => {
    const key = row.querySelector('.custom-key').value;
    const col = row.querySelector('.custom-col').value;
    if (key && col) customFields.push({ key, col });
  });

  const toSend = matchedData.filter(m => m.email && (!m.useFile || m.fileMatched) && m.status !== 'sent');
  if (!toSend.length) { alert('No hay registros pendientes'); return; }

  const overSized = toSend.filter(m => m.fileSize > 5242880);
  if (overSized.length > 0) {
    if (!confirm(`⚠️ ${overSized.length} archivo(s) superan 5MB y podrían fallar.\n¿Continuar de todos modos?`)) return;
  }

  sending = true;
  sendLog = [];
  document.getElementById('btn-send').disabled = true;
  document.getElementById('btn-back-send').disabled = true;
  document.getElementById('progress-area').style.display = 'block';
  document.getElementById('log-area').style.display = 'block';
  document.getElementById('log-area').innerHTML = '';

  let sent = 0, failed = 0;

  for (let i = 0; i < toSend.length; i++) {
    const item = toSend[i];
    const pct = ((i + 1) / toSend.length * 100).toFixed(1);
    document.getElementById('progress-fill').style.width = pct + '%';
    document.getElementById('progress-text').textContent = `${i + 1} / ${toSend.length}`;
    document.getElementById('progress-percent').textContent = pct + '%';

    const sizeInfo = item.fileSize ? ` (${formatSize(item.fileSize)})` : '';
    addLog(`[${i + 1}/${toSend.length}] Enviando a ${item.email}${sizeInfo}...`, 'info');

    try {
      const form = new FormData();
      form.append('recipients[0][email]', item.email);

      if (useName && item.name) form.append('recipients[0][name]', item.name);
      if (usePhone && item.phone) form.append('recipients[0][phone]', item.phone);
      if (useFile && item.file) form.append('files[0]', item.file, item.file.name);

      if (delivery) form.append('delivery_type', delivery);
      if (sigType) form.append('type', sigType);
      if (branding) form.append('branding_id', branding);
      if (signingMode) form.append('signing_mode', signingMode);
      if (subject) form.append('subject', resolveVars(subject, item));
      if (body) form.append('body', resolveVars(body, item));

      customFields.forEach(cf => form.append(`data[${cf.key}]`, item.rawRow[cf.col] || ''));

      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'x-signaturit-token': token, 'x-api-url': apiUrl },
        body: form
      });

      const result = await response.json();

      if (response.ok && result.id) {
        item.status = 'sent';
        item.responseId = result.id;
        sent++;
        addLog(`✓ ${item.email} → OK (${result.id})`, 'success');
      } else {
        item.status = 'failed';
        item.error = result.message || result.error || JSON.stringify(result);
        failed++;
        addLog(`✗ ${item.email} → ${item.error}`, 'error');
      }
    } catch (err) {
      item.status = 'failed';
      item.error = err.message;
      failed++;
      addLog(`✗ ${item.email} → ${err.message}`, 'error');
    }

    if (i < toSend.length - 1) await sleep(delay);
  }

  addLog(`\n=== COMPLETADO: ${sent} OK, ${failed} fallidos ===`, sent === toSend.length ? 'success' : 'error');
  showResults(toSend, sent, failed);

  sending = false;
  document.getElementById('btn-send').disabled = false;
  document.getElementById('btn-back-send').disabled = false;
  document.getElementById('btn-export-log').style.display = 'flex';

  if (failed > 0) {
    document.getElementById('btn-send').textContent = 'Reintentar fallidos';
  }
}

function showResults(data, sent, failed) {
  document.getElementById('send-results').style.display = 'block';
  document.getElementById('results-stats').innerHTML =
    `<span class="stat-badge success">✓ ${sent}</span>` +
    (failed > 0 ? `<span class="stat-badge error">✗ ${failed}</span>` : '');
  let html = '<table><thead><tr><th>#</th><th>Email</th><th>Archivo</th><th>Peso</th><th>Estado</th><th>ID / Error</th></tr></thead><tbody>';
  data.forEach(m => {
    html += `<tr><td>${m.index}</td><td>${m.email}</td>
      <td>${m.fileName || '—'}</td>
      <td class="${m.fileSize ? sizeClass(m.fileSize) : ''}">${m.fileSize ? formatSize(m.fileSize) : '—'}</td>
      <td><span class="status-dot ${m.status === 'sent' ? 'sent' : 'failed'}"></span>${m.status === 'sent' ? 'OK' : 'Error'}</td>
      <td style="max-width:300px">${m.status === 'sent' ? m.responseId : (m.error || '')}</td></tr>`;
  });
  html += '</tbody></table>';
  document.getElementById('results-table-scroll').innerHTML = html;
}

// ===== LOG & UTILS =====
function addLog(msg, type = '') {
  const area = document.getElementById('log-area');
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  area.appendChild(line);
  area.scrollTop = area.scrollHeight;
  sendLog.push(line.textContent);
}

function exportLog() {
  const blob = new Blob([sendLog.join('\n')], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `signaturit_log_${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
}

function downloadTemplate() {
  const csv = 'email,nombre,telefono,archivo,crm_id,departamento\njuan@empresa.com,Juan García,34666111222,contrato_juan.pdf,CRM-001,Ventas\nmaria@empresa.com,María López,34666333444,contrato_maria.pdf,CRM-002,RRHH\n';
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'plantilla_signaturit.csv';
  a.click();
}
