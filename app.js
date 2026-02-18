/* ============================================
   Multi Send Signaturit — App Logic
   ============================================ */

const PROXY_URL = 'https://plejrqzzxnypnxxnamxj.supabase.co/functions/v1/signaturit-proxy';

const API_ENDPOINTS = {
  advanced: '/v3/signatures.json',
  simple:   '/v3/signatures.json',
  email:    '/v3/emails.json',
  sms:      '/v3/sms.json'
};

const OPERATION_LABELS = {
  advanced: 'Firma avanzada',
  simple:   'Firma simple',
  email:    'Email certificado',
  sms:      'SMS certificado'
};

/* ===== STATE ===== */
let operationType = null;
let currentStep = 1;
let dataRows = [], dataHeaders = [];
let pdfFiles = {};
let matchedData = [];
let sendLog = [];
let sending = false;
let customVariables = [];
let activeTextField = null;
let templatesList = [];
let useTemplate = false;
let bulkSignerCount = 1;

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
  { name: 'signers', desc: 'Lista de firmantes', category: 'firmante' }
];

/* ========================================
   LAUNCHER
   ======================================== */

function selectOperationType(el) {
  document.querySelectorAll('.launcher-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  operationType = el.dataset.type;
  document.getElementById('launcherStart').disabled = false;
}

function startApp() {
  if (!operationType) return;
  document.getElementById('launcherOverlay').classList.add('hidden');
  document.getElementById('appWrapper').classList.add('active');
  document.getElementById('badgeOperation').textContent = OPERATION_LABELS[operationType];
  setupBulkMode();
}

function resetLauncher() {
  operationType = null; currentStep = 1;
  dataRows = []; dataHeaders = []; pdfFiles = {};
  matchedData = []; sendLog = []; sending = false;
  templatesList = []; useTemplate = false;
  bulkSignerCount = 1;

  document.getElementById('appWrapper').classList.remove('active');
  document.getElementById('launcherOverlay').classList.remove('hidden');
  document.querySelectorAll('.launcher-option').forEach(o => o.classList.remove('selected'));
  document.getElementById('launcherStart').disabled = true;
}

/* ========================================
   TEMPLATES FETCH
   ======================================== */

async function fetchTemplates() {
  const env = document.getElementById('cfg-env').value;
  const token = document.getElementById('cfg-token').value.trim();
  if (!token) { alert('Ingresa el token API primero'); return; }

  const sel = document.getElementById('bulk-tpl-select');
  sel.innerHTML = '<option value="">⏳ Cargando...</option>';

  try {
    const resp = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'x-signaturit-token': token, 'x-api-url': env + '/v3/templates.json', 'x-method-override': 'GET', 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await resp.json();
    if (!Array.isArray(data)) {
      sel.innerHTML = '<option value="">❌ Error al obtener plantillas</option>';
      return;
    }
    templatesList = data;
    sel.innerHTML = '<option value="">— Selecciona una plantilla —</option>' +
      data.map(t => `<option value="${t.id}">${t.name || t.id}</option>`).join('');
  } catch (err) {
    sel.innerHTML = '<option value="">❌ Error de conexión</option>';
  }
}

/* ========================================
   BULK MODE
   ======================================== */

function setupBulkMode() {
  const isSMS = operationType === 'sms';
  document.getElementById('pdfUploadSection').style.display = isSMS ? 'none' : 'block';
  document.getElementById('bulk-sms-section').style.display = isSMS ? 'block' : 'none';
  document.getElementById('bulk-tpl-section').style.display = isSMS ? 'none' : 'block';

  setupDropZone('dataDropZone', 'dataInput', handleDataUpload);
  setupDropZone('pdfDropZone', 'pdfInput', handlePDFUpload);

  ['cfg-subject', 'cfg-body', 'cfg-sms-body'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('focus', () => { activeTextField = el; });
  });

  renderVariableChips();
  renderColumnDescriptions();
}

function toggleBulkTemplate() {
  useTemplate = document.getElementById('bulk-tpl-toggle').checked;
  document.getElementById('bulk-tpl-picker').style.display = useTemplate ? 'block' : 'none';
}

function renderColumnDescriptions() {
  const isSMS = operationType === 'sms';
  const isAdvanced = operationType === 'advanced';
  const el = document.getElementById('colDescriptions');

  let cols = [];
  if (isSMS) {
    cols = [
      { name: 'phone / telefono', info: 'Número de teléfono del destinatario', req: true },
      { name: 'name / nombre', info: 'Nombre del destinatario', req: false },
    ];
  } else {
    cols = [
      { name: 'email / correo', info: 'Email del destinatario principal', req: true },
      { name: 'name / nombre', info: 'Nombre del destinatario', req: false },
      { name: 'archivo / file', info: 'Nombre del PDF a adjuntar (sin extensión o con .pdf)', req: false },
    ];
    if (isAdvanced) {
      cols.push(
        { name: 'email_2, email_3...', info: 'Emails de firmantes adicionales', req: false },
        { name: 'name_2, name_3...', info: 'Nombres de firmantes adicionales', req: false }
      );
    }
  }

  el.innerHTML = cols.map(c =>
    `<div class="col-desc-item">
      <div><span class="col-name">${c.name}</span><span class="col-req ${c.req ? 'required' : 'optional'}">${c.req ? 'obligatorio' : 'opcional'}</span></div>
      <div class="col-info">${c.info}</div>
    </div>`
  ).join('');
}

/* ===== VARIABLES ===== */

function getAllVariables() {
  return [...OFFICIAL_VARIABLES, ...customVariables.map(v => ({ ...v, category: 'custom' }))];
}

function renderVariableChips() {
  const c = document.getElementById('varChips');
  if (!c) return;
  const all = getAllVariables();
  document.getElementById('varCount').textContent = all.length;
  let html = all.map(v =>
    `<span class="var-chip ${v.category !== 'custom' ? 'official' : ''}" title="${v.desc}" onclick="insertVariable('${v.name}')"><span class="var-icon">${v.category === 'custom' ? '⚙' : '📌'}</span>{{${v.name}}}</span>`
  ).join('');
  html += `<span class="var-chip var-chip-add" onclick="openVarModal()">+ Variable</span>`;
  c.innerHTML = html;
}

function insertVariable(name) {
  const target = activeTextField || document.getElementById('cfg-subject');
  if (!target || target.disabled) return;
  const tag = `{{${name}}}`;
  const s = target.selectionStart, e = target.selectionEnd;
  target.value = target.value.substring(0, s) + tag + target.value.substring(e);
  target.focus();
  target.selectionStart = target.selectionEnd = s + tag.length;
}

function openVarModal() {
  const list = document.getElementById('modalVarList');
  const all = getAllVariables();
  list.innerHTML = all.map((v, i) =>
    `<div class="modal-var-item"><div><span class="var-name">{{${v.name}}}</span> <span class="var-desc">${v.desc}</span></div>
    <div>${v.category === 'custom' ? `<button class="btn-remove-signer" onclick="removeCustomVar(${i - OFFICIAL_VARIABLES.length})">×</button>` : `<span class="var-badge">${v.category}</span>`}</div></div>`
  ).join('');
  document.getElementById('varModal').classList.add('active');
}
function closeVarModal() { document.getElementById('varModal').classList.remove('active'); }

function addCustomVariable() {
  const nameEl = document.getElementById('newVarName'), descEl = document.getElementById('newVarDesc');
  const name = nameEl.value.trim().replace(/\s+/g, '_').toLowerCase();
  const desc = descEl.value.trim() || name;
  if (!name) return;
  if (getAllVariables().find(v => v.name === name)) { alert('Variable ya existe'); return; }
  customVariables.push({ name, desc });
  nameEl.value = ''; descEl.value = '';
  renderVariableChips(); openVarModal();
}

function removeCustomVar(idx) {
  if (idx >= 0 && idx < customVariables.length) { customVariables.splice(idx, 1); renderVariableChips(); openVarModal(); }
}

/* ===== TOGGLES & DROP ZONES ===== */
function toggleField(id, t) { document.getElementById(id).disabled = !t.checked; }

function setupDropZone(zoneId, inputId, handler) {
  const zone = document.getElementById(zoneId), input = document.getElementById(inputId);
  if (!zone || !input) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragover'); handler(e.dataTransfer.files); });
  input.addEventListener('change', () => handler(input.files));
}

/* ========================================
   DATA PARSING — CSV, JSON, XLSX
   ======================================== */

function handleDataUpload(files) {
  if (!files.length) return;
  const file = files[0];
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'json') parseJSON(file);
  else if (ext === 'xlsx' || ext === 'xls') parseXLSX(file);
  else parseCSV(file);
}

function parseCSV(file) {
  const reader = new FileReader();
  reader.onload = e => {
    let text = e.target.result;
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const sep = text.split(';').length > text.split(',').length ? ';' : ',';
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) { alert('Archivo vacío o sin datos'); return; }

    dataHeaders = parseCsvLine(lines[0], sep).map(h => h.trim());
    dataRows = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = parseCsvLine(lines[i], sep);
      if (vals.length >= dataHeaders.length) {
        const row = {};
        dataHeaders.forEach((h, j) => { row[h] = (vals[j] || '').trim(); });
        dataRows.push(row);
      }
    }
    onDataLoaded(file.name, 'CSV');
  };
  reader.readAsText(file);
}

function parseCsvLine(line, sep) {
  const result = []; let current = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) { if (c === '"') { if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; } else inQ = false; } else current += c; }
    else { if (c === '"') inQ = true; else if (c === sep) { result.push(current); current = ''; } else current += c; }
  }
  result.push(current);
  return result;
}

function parseJSON(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      let data = JSON.parse(e.target.result);
      if (!Array.isArray(data)) { alert('El JSON debe ser un array de objetos'); return; }
      if (!data.length) { alert('JSON vacío'); return; }
      dataHeaders = Object.keys(data[0]);
      dataRows = data.map(obj => {
        const row = {};
        dataHeaders.forEach(h => { row[h] = String(obj[h] ?? ''); });
        return row;
      });
      onDataLoaded(file.name, 'JSON');
    } catch (err) { alert('Error al parsear JSON: ' + err.message); }
  };
  reader.readAsText(file);
}

function parseXLSX(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!raw.length) { alert('Hoja vacía'); return; }
      dataHeaders = Object.keys(raw[0]);
      dataRows = raw.map(obj => {
        const row = {};
        dataHeaders.forEach(h => { row[h] = String(obj[h] ?? ''); });
        return row;
      });
      onDataLoaded(file.name, 'XLSX');
    } catch (err) { alert('Error al leer XLSX: ' + err.message); }
  };
  reader.readAsArrayBuffer(file);
}

function onDataLoaded(fileName, format) {
  const zone = document.getElementById('dataDropZone');
  zone.classList.add('has-file');
  zone.innerHTML = `<div class="file-info">✅ ${fileName} (${format}) — ${dataRows.length} filas, ${dataHeaders.length} columnas</div>`;
}

/* ===== PDF ===== */
function handlePDFUpload(files) {
  for (const f of files) {
    if (f.name.toLowerCase().endsWith('.pdf')) pdfFiles[f.name.toLowerCase()] = { file: f, size: f.size };
  }
  renderPDFList();
}

function renderPDFList() {
  const names = Object.keys(pdfFiles);
  if (!names.length) return;
  document.getElementById('pdfListContainer').style.display = 'block';
  document.getElementById('pdfCount').textContent = `${names.length} archivos`;
  document.getElementById('pdfListBody').innerHTML = names.map(n => {
    const sz = pdfFiles[n].size;
    return `<div class="pdf-row"><span class="pdf-name">${n}</span><span class="pdf-size ${sz > 5e6 ? 'size-over' : sz > 3e6 ? 'size-warn' : 'size-ok'}">${formatSize(sz)}</span></div>`;
  }).join('');
}

/* ===== STEPS ===== */
function goToStep(n) {
  if (n === 3 && dataRows.length === 0) { alert('Primero sube un archivo de datos'); return; }
  if (n === 3) buildMapping();
  if (n === 4) buildSummary();
  currentStep = n;
  updateStepUI();
}

function updateStepUI() {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel' + currentStep).classList.add('active');
  const items = document.querySelectorAll('.step-item');
  const conns = document.querySelectorAll('.step-connector');
  items.forEach((it, i) => { it.classList.remove('active', 'completed'); if (i + 1 === currentStep) it.classList.add('active'); else if (i + 1 < currentStep) it.classList.add('completed'); });
  conns.forEach((c, i) => c.classList.toggle('active', i + 1 < currentStep));
}

/* ========================================
   MAPPING
   ======================================== */

function buildMapping() {
  const area = document.getElementById('mappingArea');
  const isSMS = operationType === 'sms';
  const isAdvanced = operationType === 'advanced';
  const hasPDFs = Object.keys(pdfFiles).length > 0;

  document.getElementById('mappingDesc').innerHTML = isSMS
    ? 'Asigna las columnas. Solo <strong>Teléfono</strong> es obligatorio.'
    : 'Asigna las columnas. Solo <strong>Email</strong> es obligatorio.';

  let html = '';

  if (isSMS) {
    html += buildMappingGroup('Destinatario', [
      { key: 'phone', label: 'Teléfono', req: true },
      { key: 'name', label: 'Nombre', req: false }
    ]);
  } else {
    // Signer 1
    html += buildMappingGroup('Firmante 1', [
      { key: 'email', label: 'Email', req: true },
      { key: 'name', label: 'Nombre', req: false }
    ]);

    // Additional signers for advanced
    if (isAdvanced) {
      for (let s = 2; s <= bulkSignerCount; s++) {
        html += buildMappingGroup(`Firmante ${s}`, [
          { key: `email_${s}`, label: `Email ${s}`, req: false },
          { key: `name_${s}`, label: `Nombre ${s}`, req: false }
        ], true, s);
      }
      html += `<div style="margin-bottom:14px"><button class="btn-add" onclick="addBulkSigner()">+ Añadir firmante</button></div>`;
    }

    // File mapping (only if PDFs were uploaded)
    if (hasPDFs) {
      html += buildMappingGroup('Documento', [
        { key: 'fileName', label: 'Archivo PDF', req: false }
      ]);
    }
  }

  area.innerHTML = html;
  updatePreview();
}

function buildMappingGroup(title, fields, removable, signerNum) {
  const removeBtn = removable ? `<button class="btn-remove-signer" onclick="removeBulkSigner(${signerNum})" style="font-size:12px">×</button>` : '';
  let html = `<div class="mapping-group"><div class="mapping-group-title"><span>${title}</span>${removeBtn}</div><div class="mapping-grid">`;
  fields.forEach(f => {
    const opts = ['<option value="">— Sin asignar —</option>']
      .concat(dataHeaders.map(h => `<option value="${h}" ${autoMatch(f.key, h) ? 'selected' : ''}>${h}</option>`)).join('');
    html += `<div class="mapping-card"><span class="mapping-label">${f.label} ${f.req ? '<span class="req">*</span>' : ''}</span><select id="map-${f.key}" onchange="updatePreview()">${opts}</select></div>`;
  });
  html += '</div></div>';
  return html;
}

function addBulkSigner() { bulkSignerCount++; buildMapping(); }
function removeBulkSigner(n) {
  if (bulkSignerCount <= 1) return;
  bulkSignerCount--;
  buildMapping();
}

function autoMatch(key, header) {
  const h = header.toLowerCase();
  // Exact suffix match for numbered signers
  const numMatch = key.match(/^(email|name)_(\d+)$/);
  if (numMatch) {
    const base = numMatch[1], num = numMatch[2];
    if (base === 'email') return h === `email_${num}` || h === `correo_${num}` || h === `email${num}`;
    if (base === 'name') return h === `nombre_${num}` || h === `name_${num}` || h === `nombre${num}`;
  }
  if (key === 'email') return (h.includes('email') || h.includes('correo') || h.includes('mail')) && !/\d/.test(h);
  if (key === 'name') return (h.includes('nombre') || h.includes('name')) && !/\d/.test(h);
  if (key === 'fileName') return h.includes('archivo') || h.includes('file') || h.includes('pdf') || h.includes('documento');
  if (key === 'phone') return h.includes('phone') || h.includes('tele') || h.includes('móvil') || h.includes('movil') || h.includes('cel');
  return false;
}

function updatePreview() {
  const isSMS = operationType === 'sms';
  const isAdvanced = operationType === 'advanced';
  const hasPDFs = Object.keys(pdfFiles).length > 0;

  matchedData = dataRows.map(row => {
    const item = { rawRow: row, signers: [] };

    if (isSMS) {
      const pc = document.getElementById('map-phone')?.value;
      const nc = document.getElementById('map-name')?.value;
      item.phone = pc ? row[pc] : '';
      item.name = nc ? row[nc] : '';
    } else {
      // Signer 1
      const ec = document.getElementById('map-email')?.value;
      const nc = document.getElementById('map-name')?.value;
      item.email = ec ? row[ec] : '';
      item.name = nc ? row[nc] : '';
      item.signers.push({ email: item.email, name: item.name });

      // Additional signers
      if (isAdvanced) {
        for (let s = 2; s <= bulkSignerCount; s++) {
          const e2 = document.getElementById(`map-email_${s}`)?.value;
          const n2 = document.getElementById(`map-name_${s}`)?.value;
          const se = e2 ? row[e2] : '';
          const sn = n2 ? row[n2] : '';
          if (se) item.signers.push({ email: se, name: sn });
        }
      }

      // File
      if (hasPDFs) {
        const fc = document.getElementById('map-fileName')?.value;
        item.fileName = fc ? row[fc] : '';
        if (item.fileName && !item.fileName.toLowerCase().endsWith('.pdf')) item.fileName += '.pdf';
        item.fileMatch = item.fileName ? !!pdfFiles[item.fileName.toLowerCase()] : true;
        item.fileSize = item.fileName && pdfFiles[item.fileName.toLowerCase()] ? pdfFiles[item.fileName.toLowerCase()].size : 0;
      } else {
        item.fileMatch = true;
        item.fileSize = 0;
      }
    }
    return item;
  });

  renderPreviewTable();
}

function renderPreviewTable() {
  const c = document.getElementById('previewContainer');
  const isSMS = operationType === 'sms';
  const isAdvanced = operationType === 'advanced';
  const hasPDFs = Object.keys(pdfFiles).length > 0;
  if (!matchedData.length) { c.style.display = 'none'; return; }
  c.style.display = 'block';

  let valid, missing;
  if (isSMS) {
    valid = matchedData.filter(d => d.phone).length;
    missing = matchedData.length - valid;
  } else {
    valid = matchedData.filter(d => d.email && d.fileMatch).length;
    missing = matchedData.length - valid;
  }

  document.getElementById('previewStats').innerHTML = `<span class="stat-badge success">✓ ${valid}</span>` + (missing ? `<span class="stat-badge error">✗ ${missing}</span>` : '');

  if (isSMS) {
    document.getElementById('previewHead').innerHTML = '<tr><th>#</th><th>Estado</th><th>Teléfono</th><th>Nombre</th></tr>';
    document.getElementById('previewBody').innerHTML = matchedData.map((d, i) => {
      const ok = !!d.phone;
      return `<tr><td>${i+1}</td><td><span class="status-dot ${ok?'matched':'missing'}"></span>${ok?'OK':'Falta'}</td><td>${d.phone||'—'}</td><td>${d.name||'—'}</td></tr>`;
    }).join('');
  } else {
    const signersCol = isAdvanced ? '<th>Firmantes</th>' : '';
    const fileCol = hasPDFs ? '<th>Archivo</th><th>Tamaño</th>' : '';
    document.getElementById('previewHead').innerHTML = `<tr><th>#</th><th>Estado</th><th>Email</th><th>Nombre</th>${signersCol}${fileCol}</tr>`;
    document.getElementById('previewBody').innerHTML = matchedData.map((d, i) => {
      const ok = d.email && d.fileMatch;
      const sigTd = isAdvanced ? `<td>${d.signers.length} firmante(s)</td>` : '';
      const fileTd = hasPDFs ? `<td>${d.fileName||'—'}</td><td class="${d.fileSize>5e6?'size-over':d.fileSize>3e6?'size-warn':'size-ok'}">${d.fileSize?formatSize(d.fileSize):'—'}</td>` : '';
      return `<tr><td>${i+1}</td><td><span class="status-dot ${ok?'matched':'missing'}"></span>${ok?'OK':'Falta'}</td><td>${d.email||'—'}</td><td>${d.name||'—'}</td>${sigTd}${fileTd}</tr>`;
    }).join('');
  }
}

/* ===== SUMMARY ===== */
function buildSummary() {
  const isSMS = operationType === 'sms';
  const env = document.getElementById('cfg-env').value;
  const validCount = isSMS ? matchedData.filter(d => d.phone).length : matchedData.filter(d => d.email && d.fileMatch).length;

  let html = '<div class="summary-grid">';
  html += `<span>Operación:</span><code>${OPERATION_LABELS[operationType]}</code>`;
  html += `<span>Entorno:</span><code>${env.includes('sandbox') ? 'Sandbox' : 'Producción'}</code>`;
  html += `<span>Envíos válidos:</span><code>${validCount} de ${matchedData.length}</code>`;

  if (useTemplate) {
    const sel = document.getElementById('bulk-tpl-select');
    html += `<span>Plantilla:</span><code>${sel?.options[sel.selectedIndex]?.text || '—'}</code>`;
  }

  if (!isSMS) {
    const subj = document.getElementById('toggle-subject')?.checked ? document.getElementById('cfg-subject').value : '';
    const body = document.getElementById('toggle-body')?.checked ? document.getElementById('cfg-body').value : '';
    const brand = document.getElementById('toggle-branding')?.checked ? document.getElementById('cfg-branding').value : '';
    if (subj) html += `<span>Asunto:</span><code>${esc(subj)}</code>`;
    if (body) html += `<span>Body:</span><code>${esc(body.substring(0, 50))}${body.length > 50 ? '...' : ''}</code>`;
    if (brand) html += `<span>Branding:</span><code>${esc(brand)}</code>`;
  }

  html += '</div>';
  document.getElementById('summaryBox').innerHTML = html;
}

/* ===== RESOLVE VARS ===== */
function resolveVars(text, item) {
  if (!text) return text;
  return text
    .replace(/\{\{signer_name\}\}/gi, item.name || '')
    .replace(/\{\{signer_email\}\}/gi, item.email || '')
    .replace(/\{\{filename\}\}/gi, item.fileName || '')
    .replace(/\{\{email\}\}/gi, item.email || '')
    .replace(/\{\{nombre\}\}/gi, item.name || '')
    .replace(/\{\{phone\}\}/gi, item.phone || '')
    .replace(/\{\{(\w+)\}\}/gi, (m, k) => item.rawRow?.[k] || m);
}

/* ========================================
   BULK SEND
   ======================================== */

async function startBulkSend() {
  const token = document.getElementById('cfg-token').value.trim();
  if (!token) { alert('Falta el token API'); return; }

  const isSMS = operationType === 'sms';
  const hasPDFs = Object.keys(pdfFiles).length > 0;

  const validItems = isSMS
    ? matchedData.filter(d => d.phone)
    : matchedData.filter(d => d.email && d.fileMatch);

  if (!validItems.length) { alert('No hay envíos válidos'); return; }

  if (useTemplate && !isSMS) {
    const tplId = document.getElementById('bulk-tpl-select')?.value;
    if (!tplId) { alert('Selecciona una plantilla'); return; }
  }

  if (hasPDFs && !isSMS) {
    const big = validItems.filter(d => d.fileSize > 5e6);
    if (big.length && !confirm(`${big.length} archivo(s) superan 5 MB. ¿Continuar?`)) return;
  }

  // Validar URLs en subject/body (Signaturit no las permite)
  const urlRegex = /https?:\/\/|www\./i;
  const preSubj = document.getElementById('toggle-subject')?.checked ? document.getElementById('cfg-subject').value.trim() : '';
  const preBody = document.getElementById('toggle-body')?.checked ? document.getElementById('cfg-body').value.trim() : '';
  const preSmsBody = document.getElementById('cfg-sms-body')?.value?.trim() || '';

  const fieldsWithUrls = [];
  if (urlRegex.test(preSubj)) fieldsWithUrls.push('Asunto');
  if (urlRegex.test(preBody)) fieldsWithUrls.push('Cuerpo del email');
  if (isSMS && urlRegex.test(preSmsBody)) fieldsWithUrls.push('Cuerpo del SMS');

  if (fieldsWithUrls.length) {
    alert(`⚠️ Signaturit no permite URLs en: ${fieldsWithUrls.join(', ')}.\n\nElimina los enlaces (http://, https://, www.) antes de enviar.`);
    return;
  }

  sending = true; sendLog = [];
  const delay = parseInt(document.getElementById('cfg-delay').value) || 2;
  const env = document.getElementById('cfg-env').value;
  const apiUrl = env + API_ENDPOINTS[operationType];

  document.getElementById('btnSend').disabled = true;
  document.getElementById('btnStop').style.display = 'inline-flex';
  document.getElementById('progressArea').style.display = 'block';
  const logEl = document.getElementById('logArea');
  logEl.style.display = 'block';
  logEl.innerHTML = `<div class="log-header"><span class="log-header-title">Log de envío</span><div class="log-header-stats" id="logLiveStats"></div></div><div class="log-body" id="logBody"></div>`;
  const logBody = document.getElementById('logBody');

  const startTime = Date.now();
  const ts = () => new Date().toLocaleTimeString();

  const log = (msg, badge, cls) => {
    logBody.innerHTML += `<div class="log-line ${cls||''}"><span class="log-time">${ts()}</span><span class="log-badge ${badge}">${badge === 'send' ? 'SEND' : badge === 'ok' ? 'OK' : badge === 'err' ? 'ERR' : badge === 'stop' ? 'STOP' : badge === 'done' ? 'FIN' : 'SYS'}</span><span class="log-msg">${msg}</span></div>`;
    logEl.scrollTop = logEl.scrollHeight;
  };

  const updateLiveStats = () => {
    document.getElementById('logLiveStats').innerHTML =
      `<span class="log-stat ok">${ok} ok</span><span class="log-stat fail">${err} err</span>`;
  };

  const envLabel = env.includes('sandbox') ? 'Sandbox' : 'Producción';
  log(`Iniciando ${validItems.length} envío(s) de <strong>${OPERATION_LABELS[operationType]}</strong> en ${envLabel}`, 'sys', 'dim');

  const subj = preSubj;
  const body = preBody;
  const brand = document.getElementById('toggle-branding')?.checked ? document.getElementById('cfg-branding').value.trim() : '';
  const smsBody = document.getElementById('cfg-sms-body')?.value?.trim() || '';
  const tplId = document.getElementById('bulk-tpl-select')?.value || '';

  let ok = 0, err = 0;

  for (let i = 0; i < validItems.length; i++) {
    if (!sending) { log('Detenido por el usuario', 'stop', 'error'); break; }

    const item = validItems[i];
    const pct = Math.round(((i + 1) / validItems.length) * 100);
    document.getElementById('progressFill').style.width = pct + '%';
    document.getElementById('progressText').textContent = `${i+1}/${validItems.length}`;
    document.getElementById('progressPct').textContent = pct + '%';

    const fd = new FormData();
    const dest = isSMS ? item.phone : item.email;
    const destName = item.name || '';
    const destLabel = destName ? `${destName} &lt;${dest}&gt;` : dest;

    if (isSMS) {
      fd.append('recipients[0][phone]', item.phone);
      if (item.name) fd.append('recipients[0][name]', item.name);
      fd.append('body', resolveVars(smsBody, item));
    } else {
      item.signers.forEach((s, si) => {
        fd.append(`recipients[${si}][name]`, s.name || s.email.split('@')[0]);
        fd.append(`recipients[${si}][email]`, s.email);
      });
      if (operationType === 'advanced') fd.append('type', 'advanced');
      if (useTemplate && tplId) {
        fd.append('templates[0]', tplId);
      } else if (item.fileName && pdfFiles[item.fileName.toLowerCase()]) {
        fd.append('files[0]', pdfFiles[item.fileName.toLowerCase()].file, item.fileName);
      }
      const rs = resolveVars(subj, item);
      const rb = resolveVars(body, item);
      if (rs) fd.append('subject', rs);
      if (rb) fd.append('body', rb);
      if (brand) fd.append('branding_id', brand);
    }

    const extra = !isSMS && item.signers.length > 1 ? ` — ${item.signers.length} firmantes` : '';
    const fileInfo = !isSMS && item.fileName ? ` — ${item.fileName}` : '';
    log(`[${i+1}/${validItems.length}] ${destLabel}${extra}${fileInfo}`, 'send', 'info');

    const t0 = Date.now();
    try {
      const resp = await fetch(PROXY_URL, { method: 'POST', headers: { 'x-signaturit-token': token, 'x-api-url': apiUrl }, body: fd });
      const data = await resp.json();
      const elapsed = Date.now() - t0;
      if (resp.ok && data.id) {
        ok++;
        log(`${destLabel} <span class="log-id">ID: ${data.id}</span> <span class="log-detail">${elapsed}ms</span>`, 'ok', 'success');
        sendLog.push({ ...item, status: 'ok', id: data.id });
      } else {
        err++;
        const m = data.message || data.error || JSON.stringify(data);
        log(`${destLabel} — ${m} <span class="log-detail">${elapsed}ms</span>`, 'err', 'error');
        sendLog.push({ ...item, status: 'error', error: m });
      }
    } catch (e) {
      err++;
      log(`${destLabel} — ${e.message}`, 'err', 'error');
      sendLog.push({ ...item, status: 'error', error: e.message });
    }

    updateLiveStats();
    if (i < validItems.length - 1 && sending) await sleep(delay * 1000);
  }

  sending = false;
  document.getElementById('btnSend').disabled = false;
  document.getElementById('btnStop').style.display = 'none';

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const rate = validItems.length > 0 ? ((ok / validItems.length) * 100).toFixed(0) : 0;
  log(`Completado en ${elapsed}s — ${ok} enviados, ${err} errores — Tasa de éxito: ${rate}%`, 'done', 'summary');
  updateLiveStats();
  renderResults(isSMS);
}

function stopSending() { sending = false; }

function renderResults(isSMS) {
  const c = document.getElementById('resultsContainer');
  c.style.display = 'block';
  const okN = sendLog.filter(l => l.status === 'ok').length;
  const errN = sendLog.filter(l => l.status === 'error').length;
  document.getElementById('resultsStats').innerHTML = `<span class="stat-badge success">✓ ${okN}</span>` + (errN ? `<span class="stat-badge error">✗ ${errN}</span>` : '');

  const dest = isSMS ? 'Teléfono' : 'Email';
  document.getElementById('resultsHead').innerHTML = `<tr><th>#</th><th>Estado</th><th>${dest}</th><th>ID / Error</th></tr>`;
  document.getElementById('resultsBody').innerHTML = sendLog.map((l, i) =>
    `<tr><td>${i+1}</td><td><span class="status-dot ${l.status === 'ok' ? 'sent' : 'failed'}"></span>${l.status === 'ok' ? 'Enviado' : 'Error'}</td><td>${l.email || l.phone}</td><td>${l.id || l.error}</td></tr>`
  ).join('');
  document.getElementById('exportArea').style.display = 'block';
}

function exportLog() {
  const lines = ['estado,destinatario,id_o_error'];
  sendLog.forEach(l => lines.push(`${l.status},${l.email || l.phone || ''},${l.id || l.error || ''}`));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `signaturit-log-${Date.now()}.csv`; a.click();
}

/* ===== TEMPLATE DOWNLOADS ===== */

function getTemplateSampleData() {
  const isSMS = operationType === 'sms';
  const isAdvanced = operationType === 'advanced';

  if (isSMS) {
    return {
      headers: ['phone', 'name'],
      rows: [
        ['+34600111222', 'Joe Doe'],
        ['+34600333444', 'Jane Smith'],
        ['+34600555666', 'Carlos Garcia'],
        ['+34600777888', 'Maria Lopez'],
        ['+34600999000', 'Pedro Martinez']
      ]
    };
  }

  if (isAdvanced) {
    return {
      headers: ['email', 'name', 'email_2', 'name_2', 'file'],
      rows: [
        ['joe.doe@example.com', 'Joe Doe', 'jane.smith@example.com', 'Jane Smith', 'contrato_joe.pdf'],
        ['carlos.garcia@example.com', 'Carlos Garcia', 'maria.lopez@example.com', 'Maria Lopez', 'contrato_carlos.pdf'],
        ['pedro.martinez@example.com', 'Pedro Martinez', 'ana.ruiz@example.com', 'Ana Ruiz', 'contrato_pedro.pdf'],
        ['luis.fernandez@example.com', 'Luis Fernandez', 'sofia.torres@example.com', 'Sofia Torres', 'contrato_luis.pdf'],
        ['elena.moreno@example.com', 'Elena Moreno', 'david.jimenez@example.com', 'David Jimenez', 'contrato_elena.pdf']
      ]
    };
  }

  // simple / email
  return {
    headers: ['email', 'name', 'file'],
    rows: [
      ['joe.doe@example.com', 'Joe Doe', 'contrato_joe.pdf'],
      ['jane.smith@example.com', 'Jane Smith', 'contrato_jane.pdf'],
      ['carlos.garcia@example.com', 'Carlos Garcia', 'contrato_carlos.pdf'],
      ['maria.lopez@example.com', 'Maria Lopez', 'contrato_maria.pdf'],
      ['pedro.martinez@example.com', 'Pedro Martinez', 'contrato_pedro.pdf']
    ]
  };
}

function downloadTemplate(format) {
  const { headers, rows } = getTemplateSampleData();
  const fileName = `plantilla_${operationType}`;

  if (format === 'csv') {
    const lines = [headers.join(',')];
    rows.forEach(r => lines.push(r.join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, `${fileName}.csv`);
  }

  else if (format === 'json') {
    const data = rows.map(r => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = r[i]; });
      return obj;
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    downloadBlob(blob, `${fileName}.json`);
  }

  else if (format === 'xlsx') {
    const wsData = [headers, ...rows];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    // Auto-size columns
    ws['!cols'] = headers.map((h, i) => {
      const maxLen = Math.max(h.length, ...rows.map(r => (r[i] || '').length));
      return { wch: maxLen + 2 };
    });
    XLSX.utils.book_append_sheet(wb, ws, 'Datos');
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  }
}

function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

/* ===== UTILS ===== */
function formatSize(b) { return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : (b / 1024).toFixed(1) + ' KB'; }
function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
