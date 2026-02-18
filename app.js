/* ============================================
   Signaturit Sender v2 — App Logic
   ============================================ */

// ===== PROXY =====
const PROXY_URL = 'https://plejrqzzxnypnxxnamxj.supabase.co/functions/v1/signaturit-proxy';

// ===== ENDPOINTS =====
const API_ENDPOINTS = {
  advanced:  '/v3/signatures.json',
  simple:    '/v3/signatures.json',
  email:     '/v3/emails.json',
  sms:       '/v3/sms.json',
  template:  '/v3/signatures.json'
};

const OPERATION_LABELS = {
  advanced:  'Firma avanzada',
  simple:    'Firma simple',
  email:     'Email certificado',
  sms:       'SMS certificado',
  template:  'Templates'
};

// ===== STATE =====
let operationType = null;
let sendMode = null;
let currentStep = 1;
let csvData = [], csvHeaders = [];
let pdfFiles = {};
let matchedData = [];
let sendLog = [];
let sending = false;
let customVariables = [];
let activeTextField = null;
let individualFile = null;
let templatesList = [];

// ===== OFFICIAL VARIABLES =====
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
  { name: 'signers', desc: 'Lista de firmantes (NAME - EMAIL)', category: 'firmante' }
];

/* ========================================
   LAUNCHER
   ======================================== */

function selectOperationType(el) {
  document.querySelectorAll('#launcherStep1 .launcher-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  operationType = el.dataset.type;
  document.getElementById('launcherNext1').disabled = false;
}

function selectSendMode(el) {
  document.querySelectorAll('#launcherStep2 .launcher-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  sendMode = el.dataset.mode;
  document.getElementById('launcherStart').disabled = false;
}

function goLauncherStep(n) {
  document.querySelectorAll('.launcher-step').forEach(s => s.classList.remove('active'));
  document.getElementById('launcherStep' + n).classList.add('active');
}

function startApp() {
  if (!operationType || !sendMode) return;
  document.getElementById('launcherOverlay').classList.add('hidden');
  document.getElementById('appWrapper').classList.add('active');

  document.getElementById('badgeOperation').textContent = OPERATION_LABELS[operationType];
  document.getElementById('badgeMode').textContent = sendMode === 'individual' ? 'Individual' : 'Masivo';

  if (sendMode === 'individual') {
    document.getElementById('individualMode').style.display = 'block';
    document.getElementById('bulkMode').style.display = 'none';
    setupIndividualMode();
  } else {
    document.getElementById('individualMode').style.display = 'none';
    document.getElementById('bulkMode').style.display = 'block';
    setupBulkMode();
  }
}

function resetLauncher() {
  operationType = null; sendMode = null; currentStep = 1;
  csvData = []; csvHeaders = []; pdfFiles = {};
  matchedData = []; sendLog = []; sending = false;
  individualFile = null; templatesList = [];

  document.getElementById('appWrapper').classList.remove('active');
  document.getElementById('launcherOverlay').classList.remove('hidden');
  document.querySelectorAll('.launcher-option').forEach(o => o.classList.remove('selected'));
  document.getElementById('launcherNext1').disabled = true;
  document.getElementById('launcherStart').disabled = true;
  goLauncherStep(1);
}

/* ========================================
   TEMPLATES — fetch via proxy
   ======================================== */

async function fetchTemplates(envId, tokenId, selectId) {
  const env = document.getElementById(envId).value;
  const token = document.getElementById(tokenId).value.trim();
  if (!token) { alert('Ingresa el token API primero'); return; }

  const sel = document.getElementById(selectId);
  sel.innerHTML = '<option value="">⏳ Cargando...</option>';

  try {
    const resp = await fetch(PROXY_URL, {
      method: 'POST',
      headers: {
        'x-signaturit-token': token,
        'x-api-url': env + '/v4/templates',
        'x-method-override': 'GET',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    const data = await resp.json();

    if (!Array.isArray(data)) {
      sel.innerHTML = '<option value="">❌ Error al obtener templates</option>';
      console.error('Templates response:', data);
      return;
    }

    templatesList = data;
    sel.innerHTML = '<option value="">— Selecciona un template —</option>' +
      data.map(t => `<option value="${t.id}">${t.name || t.id}</option>`).join('');

  } catch (err) {
    sel.innerHTML = '<option value="">❌ Error de conexión</option>';
    console.error(err);
  }
}

function fetchTemplatesIndividual() { fetchTemplates('ind-env', 'ind-token', 'ind-template-select'); }
function fetchTemplatesBulk() { fetchTemplates('cfg-env', 'cfg-token', 'bulk-template-select'); }

/* ========================================
   INDIVIDUAL MODE
   ======================================== */

function setupIndividualMode() {
  document.getElementById('individualTitle').textContent = `Envío individual — ${OPERATION_LABELS[operationType]}`;

  const isSMS = operationType === 'sms';
  const isTemplate = operationType === 'template';
  const needsFile = !isSMS && !isTemplate;

  document.getElementById('ind-sms-fields').style.display = isSMS ? 'block' : 'none';
  document.getElementById('ind-file-section').style.display = needsFile ? 'block' : 'none';
  document.getElementById('ind-template-section').style.display = isTemplate ? 'block' : 'none';

  // Toggle wiring
  ['subject', 'body', 'branding'].forEach(f => {
    const toggle = document.getElementById(`ind-${f}-toggle`);
    const input = document.getElementById(`ind-${f}`);
    if (toggle && input) toggle.onchange = () => { input.disabled = !toggle.checked; };
  });

  // File drop
  setupDropZone('indDropZone', 'indFileInput', handleIndividualFile);
}

function handleIndividualFile(files) {
  if (!files.length) return;
  const file = files[0];
  if (!file.name.toLowerCase().endsWith('.pdf')) { alert('Solo archivos PDF'); return; }
  individualFile = file;
  const zone = document.getElementById('indDropZone');
  zone.classList.add('has-file');
  zone.innerHTML = `<div class="file-info">✅ ${file.name} (${formatSize(file.size)})</div>`;
}

async function sendIndividual() {
  const env = document.getElementById('ind-env').value;
  const token = document.getElementById('ind-token').value.trim();
  const email = document.getElementById('ind-email').value.trim();
  const name = document.getElementById('ind-name').value.trim();
  const logEl = document.getElementById('indLog');
  logEl.style.display = 'block'; logEl.innerHTML = '';

  const ilog = (msg, cls) => {
    const t = new Date().toLocaleTimeString();
    logEl.innerHTML += `<div class="log-line ${cls || ''}">[${t}] ${msg}</div>`;
    logEl.scrollTop = logEl.scrollHeight;
  };

  if (!token) { ilog('❌ Falta el token API', 'error'); return; }

  // === SMS ===
  if (operationType === 'sms') {
    const phone = document.getElementById('ind-phone').value.trim();
    const smsBody = document.getElementById('ind-sms-body').value.trim();
    if (!phone) { ilog('❌ Falta el teléfono', 'error'); return; }
    if (!smsBody) { ilog('❌ Falta el cuerpo del SMS', 'error'); return; }

    ilog(`📤 Enviando SMS certificado a ${phone}...`, 'info');
    const fd = new FormData();
    fd.append('recipients[0][phone]', phone);
    if (name) fd.append('recipients[0][name]', name);
    fd.append('body', smsBody);

    try {
      const resp = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'x-signaturit-token': token, 'x-api-url': env + API_ENDPOINTS.sms },
        body: fd
      });
      const data = await resp.json();
      if (resp.ok && data.id) ilog(`✅ SMS enviado — ID: ${data.id}`, 'success');
      else ilog(`❌ Error: ${JSON.stringify(data)}`, 'error');
    } catch (err) { ilog(`❌ ${err.message}`, 'error'); }
    return;
  }

  // === TEMPLATE ===
  if (operationType === 'template') {
    const tplId = document.getElementById('ind-template-select').value;
    if (!tplId) { ilog('❌ Selecciona un template', 'error'); return; }
    if (!email) { ilog('❌ Falta el email', 'error'); return; }

    ilog(`📤 Enviando template a ${email}...`, 'info');
    const fd = new FormData();
    fd.append('recipients[0][name]', name || email.split('@')[0]);
    fd.append('recipients[0][email]', email);
    fd.append('templates[0]', tplId);
    appendOptionalFields(fd, 'ind');

    try {
      const resp = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'x-signaturit-token': token, 'x-api-url': env + API_ENDPOINTS.template },
        body: fd
      });
      const data = await resp.json();
      if (resp.ok && data.id) ilog(`✅ Enviado — ID: ${data.id}`, 'success');
      else ilog(`❌ Error: ${JSON.stringify(data)}`, 'error');
    } catch (err) { ilog(`❌ ${err.message}`, 'error'); }
    return;
  }

  // === SIGNATURE / EMAIL ===
  if (!email) { ilog('❌ Falta el email', 'error'); return; }
  if (!individualFile) { ilog('❌ Falta el archivo PDF', 'error'); return; }

  const endpoint = API_ENDPOINTS[operationType];
  const apiUrl = env + endpoint;
  ilog(`📤 Enviando ${OPERATION_LABELS[operationType]} a ${email}...`, 'info');

  const fd = new FormData();
  fd.append('recipients[0][name]', name || email.split('@')[0]);
  fd.append('recipients[0][email]', email);
  fd.append('files[0]', individualFile, individualFile.name);

  // For advanced signature, add type
  if (operationType === 'advanced') {
    fd.append('type', 'advanced');
  }

  appendOptionalFields(fd, 'ind');

  try {
    const resp = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'x-signaturit-token': token, 'x-api-url': apiUrl },
      body: fd
    });
    const data = await resp.json();
    if (resp.ok && data.id) ilog(`✅ Enviado — ID: ${data.id}`, 'success');
    else ilog(`❌ Error: ${JSON.stringify(data)}`, 'error');
  } catch (err) { ilog(`❌ ${err.message}`, 'error'); }
}

function appendOptionalFields(fd, prefix) {
  if (document.getElementById(`${prefix}-subject-toggle`).checked) {
    const v = document.getElementById(`${prefix}-subject`).value.trim();
    if (v) fd.append('subject', v);
  }
  if (document.getElementById(`${prefix}-body-toggle`).checked) {
    const v = document.getElementById(`${prefix}-body`).value.trim();
    if (v) fd.append('body', v);
  }
  if (document.getElementById(`${prefix}-branding-toggle`).checked) {
    const v = document.getElementById(`${prefix}-branding`).value.trim();
    if (v) fd.append('branding_id', v);
  }
}

/* ========================================
   BULK MODE
   ======================================== */

function setupBulkMode() {
  const isSMS = operationType === 'sms';
  const isTemplate = operationType === 'template';

  // Show/hide sections
  document.getElementById('pdfUploadSection').style.display = (isSMS || isTemplate) ? 'none' : 'block';
  document.getElementById('bulk-sms-body-section').style.display = isSMS ? 'block' : 'none';
  document.getElementById('bulk-template-section').style.display = isTemplate ? 'block' : 'none';

  // Drop zones
  setupDropZone('csvDropZone', 'csvInput', handleCSVUpload);
  if (!isSMS && !isTemplate) {
    setupDropZone('pdfDropZone', 'pdfInput', handlePDFUpload);
  }

  // Track focus
  ['cfg-subject', 'cfg-body', 'cfg-sms-body'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('focus', () => { activeTextField = el; });
  });

  renderVariableChips();
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
    `<span class="var-chip ${v.category !== 'custom' ? 'official' : ''}" title="${v.desc}" onclick="insertVariable('${v.name}')">
      <span class="var-icon">${v.category === 'custom' ? '⚙' : '📌'}</span>{{${v.name}}}
    </span>`
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
    `<div class="modal-var-item">
      <div><span class="var-name">{{${v.name}}}</span> <span class="var-desc">${v.desc}</span></div>
      <div>${v.category === 'custom'
        ? `<button class="btn-remove-field" onclick="removeCustomVar(${i - OFFICIAL_VARIABLES.length})">×</button>`
        : `<span class="var-badge">${v.category}</span>`}</div>
    </div>`
  ).join('');
  document.getElementById('varModal').classList.add('active');
}
function closeVarModal() { document.getElementById('varModal').classList.remove('active'); }

function addCustomVariable() {
  const nameEl = document.getElementById('newVarName');
  const descEl = document.getElementById('newVarDesc');
  const name = nameEl.value.trim().replace(/\s+/g, '_').toLowerCase();
  const desc = descEl.value.trim() || name;
  if (!name) return;
  if (getAllVariables().find(v => v.name === name)) { alert('Variable ya existe'); return; }
  customVariables.push({ name, desc });
  nameEl.value = ''; descEl.value = '';
  renderVariableChips(); openVarModal();
}

function removeCustomVar(idx) {
  if (idx >= 0 && idx < customVariables.length) {
    customVariables.splice(idx, 1);
    renderVariableChips(); openVarModal();
  }
}

/* ===== TOGGLES ===== */
function toggleField(fieldId, toggle) { document.getElementById(fieldId).disabled = !toggle.checked; }

/* ===== DROP ZONE ===== */
function setupDropZone(zoneId, inputId, handler) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  if (!zone || !input) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragover'); handler(e.dataTransfer.files); });
  input.addEventListener('change', () => handler(input.files));
}

/* ===== CSV ===== */
function handleCSVUpload(files) {
  if (!files.length) return;
  const file = files[0];
  const reader = new FileReader();
  reader.onload = e => {
    let text = e.target.result;
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const sep = text.split(';').length > text.split(',').length ? ';' : ',';
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) { alert('CSV vacío o sin datos'); return; }

    csvHeaders = parseCsvLine(lines[0], sep).map(h => h.trim());
    csvData = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = parseCsvLine(lines[i], sep);
      if (vals.length === csvHeaders.length) {
        const row = {};
        csvHeaders.forEach((h, j) => { row[h] = vals[j].trim(); });
        csvData.push(row);
      }
    }

    const zone = document.getElementById('csvDropZone');
    zone.classList.add('has-file');
    zone.innerHTML = `<div class="file-info">✅ ${file.name} — ${csvData.length} filas, ${csvHeaders.length} columnas</div>`;
  };
  reader.readAsText(file);
}

function parseCsvLine(line, sep) {
  const result = []; let current = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') { if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; } else inQ = false; }
      else current += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === sep) { result.push(current); current = ''; }
      else current += c;
    }
  }
  result.push(current);
  return result;
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
  document.getElementById('pdfListBody').innerHTML = names.map(name => {
    const sz = pdfFiles[name].size;
    const cls = sz > 5e6 ? 'size-over' : sz > 3e6 ? 'size-warn' : 'size-ok';
    return `<div class="pdf-row"><span class="pdf-name">${name}</span><span class="pdf-size ${cls}">${formatSize(sz)}</span></div>`;
  }).join('');
}

/* ===== STEPS ===== */
function goToStep(n) {
  if (n === 3 && csvData.length === 0) { alert('Primero sube un CSV'); return; }
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
  items.forEach((item, i) => {
    item.classList.remove('active', 'completed');
    if (i + 1 === currentStep) item.classList.add('active');
    else if (i + 1 < currentStep) item.classList.add('completed');
  });
  conns.forEach((c, i) => c.classList.toggle('active', i + 1 < currentStep));
}

/* ===== MAPPING ===== */
function buildMapping() {
  const grid = document.getElementById('mappingGrid');
  const isSMS = operationType === 'sms';
  const isTemplate = operationType === 'template';
  const needsFile = !isSMS && !isTemplate;

  const fields = [];
  if (isSMS) {
    fields.push({ key: 'phone', label: 'Teléfono', req: true });
    fields.push({ key: 'name', label: 'Nombre', req: false });
  } else {
    fields.push({ key: 'email', label: 'Email', req: true });
    fields.push({ key: 'name', label: 'Nombre', req: false });
    if (needsFile) fields.push({ key: 'fileName', label: 'Archivo PDF', req: false });
  }

  grid.innerHTML = fields.map(f => {
    const opts = ['<option value="">— Sin asignar —</option>']
      .concat(csvHeaders.map(h => {
        const sel = autoMatch(f.key, h) ? 'selected' : '';
        return `<option value="${h}" ${sel}>${h}</option>`;
      })).join('');
    return `<div class="mapping-card">
      <span class="mapping-label">${f.label} ${f.req ? '<span class="req">*</span>' : ''}</span>
      <select id="map-${f.key}" onchange="updatePreview()">${opts}</select>
    </div>`;
  }).join('');

  updatePreview();
}

function autoMatch(key, header) {
  const h = header.toLowerCase();
  if (key === 'email') return h.includes('email') || h.includes('correo') || h.includes('mail');
  if (key === 'name') return h.includes('nombre') || h.includes('name');
  if (key === 'fileName') return h.includes('archivo') || h.includes('file') || h.includes('pdf') || h.includes('documento');
  if (key === 'phone') return h.includes('phone') || h.includes('tele') || h.includes('móvil') || h.includes('movil') || h.includes('cel');
  return false;
}

function updatePreview() {
  const isSMS = operationType === 'sms';
  const needsFile = !isSMS && operationType !== 'template';

  matchedData = csvData.map(row => {
    const item = { rawRow: row };
    if (isSMS) {
      const pc = document.getElementById('map-phone')?.value;
      const nc = document.getElementById('map-name')?.value;
      item.phone = pc ? row[pc] : '';
      item.name = nc ? row[nc] : '';
    } else {
      const ec = document.getElementById('map-email')?.value;
      const nc = document.getElementById('map-name')?.value;
      item.email = ec ? row[ec] : '';
      item.name = nc ? row[nc] : '';

      if (needsFile) {
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
  const container = document.getElementById('previewContainer');
  const isSMS = operationType === 'sms';
  const needsFile = !isSMS && operationType !== 'template';
  if (!matchedData.length) { container.style.display = 'none'; return; }
  container.style.display = 'block';

  let valid, missing;
  if (isSMS) {
    valid = matchedData.filter(d => d.phone).length;
    missing = matchedData.length - valid;
  } else {
    valid = matchedData.filter(d => d.email && d.fileMatch).length;
    missing = matchedData.filter(d => !d.email || !d.fileMatch).length;
  }

  document.getElementById('previewStats').innerHTML =
    `<span class="stat-badge success">✓ ${valid}</span>` +
    (missing ? `<span class="stat-badge error">✗ ${missing}</span>` : '');

  if (isSMS) {
    document.getElementById('previewHead').innerHTML = '<tr><th>#</th><th>Estado</th><th>Teléfono</th><th>Nombre</th></tr>';
    document.getElementById('previewBody').innerHTML = matchedData.map((d, i) => {
      const ok = !!d.phone;
      return `<tr><td>${i + 1}</td><td><span class="status-dot ${ok ? 'matched' : 'missing'}"></span>${ok ? 'OK' : 'Sin tel.'}</td><td>${d.phone || '—'}</td><td>${d.name || '—'}</td></tr>`;
    }).join('');
  } else {
    const fileCols = needsFile ? '<th>Archivo</th><th>Tamaño</th>' : '';
    document.getElementById('previewHead').innerHTML = `<tr><th>#</th><th>Estado</th><th>Email</th><th>Nombre</th>${fileCols}</tr>`;
    document.getElementById('previewBody').innerHTML = matchedData.map((d, i) => {
      const ok = d.email && d.fileMatch;
      const fileTds = needsFile
        ? `<td>${d.fileName || '—'}</td><td class="${d.fileSize > 5e6 ? 'size-over' : d.fileSize > 3e6 ? 'size-warn' : 'size-ok'}">${d.fileSize ? formatSize(d.fileSize) : '—'}</td>`
        : '';
      return `<tr><td>${i + 1}</td><td><span class="status-dot ${ok ? 'matched' : 'missing'}"></span>${ok ? 'OK' : 'Falta'}</td><td>${d.email || '—'}</td><td>${d.name || '—'}</td>${fileTds}</tr>`;
    }).join('');
  }
}

/* ===== SUMMARY ===== */
function buildSummary() {
  const isSMS = operationType === 'sms';
  const env = document.getElementById('cfg-env').value;
  const envLabel = env.includes('sandbox') ? 'Sandbox' : 'Producción';

  const validCount = isSMS
    ? matchedData.filter(d => d.phone).length
    : matchedData.filter(d => d.email && d.fileMatch).length;

  let html = '<div class="summary-grid">';
  html += `<span>Operación:</span><code>${OPERATION_LABELS[operationType]}</code>`;
  html += `<span>Entorno:</span><code>${envLabel}</code>`;
  html += `<span>Envíos válidos:</span><code>${validCount} de ${matchedData.length}</code>`;

  if (operationType === 'template') {
    const sel = document.getElementById('bulk-template-select');
    const tplName = sel.options[sel.selectedIndex]?.text || '—';
    html += `<span>Template:</span><code>${tplName}</code>`;
  }

  if (!isSMS) {
    const subj = document.getElementById('toggle-subject')?.checked ? document.getElementById('cfg-subject').value : '';
    const body = document.getElementById('toggle-body')?.checked ? document.getElementById('cfg-body').value : '';
    const brand = document.getElementById('toggle-branding')?.checked ? document.getElementById('cfg-branding').value : '';
    if (subj) html += `<span>Asunto:</span><code>${esc(subj)}</code>`;
    if (body) html += `<span>Body:</span><code>${esc(body.substring(0, 50))}${body.length > 50 ? '...' : ''}</code>`;
    if (brand) html += `<span>Branding:</span><code>${esc(brand)}</code>`;
  } else {
    const smsB = document.getElementById('cfg-sms-body')?.value || '';
    html += `<span>SMS:</span><code>${esc(smsB.substring(0, 60))}${smsB.length > 60 ? '...' : ''}</code>`;
  }

  html += '</div>';
  document.getElementById('summaryBox').innerHTML = html;
}

/* ===== VARIABLE RESOLUTION ===== */
function resolveVars(text, item) {
  if (!text) return text;
  return text
    .replace(/\{\{signer_name\}\}/gi, item.name || '')
    .replace(/\{\{signer_email\}\}/gi, item.email || '')
    .replace(/\{\{sender_email\}\}/gi, '')
    .replace(/\{\{filename\}\}/gi, item.fileName || '')
    .replace(/\{\{email\}\}/gi, item.email || '')
    .replace(/\{\{nombre\}\}/gi, item.name || '')
    .replace(/\{\{phone\}\}/gi, item.phone || '')
    .replace(/\{\{(\w+)\}\}/gi, (match, key) => item.rawRow?.[key] || match);
}

/* ========================================
   BULK SEND
   ======================================== */

async function startBulkSend() {
  const token = document.getElementById('cfg-token').value.trim();
  if (!token) { alert('Falta el token API'); return; }

  const isSMS = operationType === 'sms';
  const isTemplate = operationType === 'template';
  const needsFile = !isSMS && !isTemplate;

  const validItems = isSMS
    ? matchedData.filter(d => d.phone)
    : matchedData.filter(d => d.email && d.fileMatch);

  if (!validItems.length) { alert('No hay envíos válidos'); return; }

  if (isTemplate) {
    const tplId = document.getElementById('bulk-template-select').value;
    if (!tplId) { alert('Selecciona un template primero'); return; }
  }

  // Warn large files
  if (needsFile) {
    const big = validItems.filter(d => d.fileSize > 5e6);
    if (big.length && !confirm(`${big.length} archivo(s) superan 5 MB. ¿Continuar?`)) return;
  }

  sending = true; sendLog = [];
  const delay = parseInt(document.getElementById('cfg-delay').value) || 2;
  const env = document.getElementById('cfg-env').value;
  const endpoint = API_ENDPOINTS[operationType];
  const apiUrl = env + endpoint;

  // UI
  document.getElementById('btnSend').disabled = true;
  document.getElementById('btnStop').style.display = 'inline-flex';
  document.getElementById('progressArea').style.display = 'block';
  const logEl = document.getElementById('logArea');
  logEl.style.display = 'block'; logEl.innerHTML = '';

  const log = (msg, cls) => {
    const t = new Date().toLocaleTimeString();
    logEl.innerHTML += `<div class="log-line ${cls || ''}">[${t}] ${msg}</div>`;
    logEl.scrollTop = logEl.scrollHeight;
  };

  log(`🚀 Iniciando envío de ${validItems.length} ${OPERATION_LABELS[operationType]}...`, 'info');

  // Get optional fields
  const subj = document.getElementById('toggle-subject')?.checked ? document.getElementById('cfg-subject').value.trim() : '';
  const body = document.getElementById('toggle-body')?.checked ? document.getElementById('cfg-body').value.trim() : '';
  const brand = document.getElementById('toggle-branding')?.checked ? document.getElementById('cfg-branding').value.trim() : '';
  const smsBody = document.getElementById('cfg-sms-body')?.value?.trim() || '';
  const tplId = document.getElementById('bulk-template-select')?.value || '';

  let successCount = 0, errorCount = 0;

  for (let i = 0; i < validItems.length; i++) {
    if (!sending) { log('⏹ Envío detenido por el usuario', 'error'); break; }

    const item = validItems[i];
    const pct = Math.round(((i + 1) / validItems.length) * 100);
    document.getElementById('progressFill').style.width = pct + '%';
    document.getElementById('progressText').textContent = `${i + 1}/${validItems.length}`;
    document.getElementById('progressPct').textContent = pct + '%';

    const fd = new FormData();

    if (isSMS) {
      fd.append('recipients[0][phone]', item.phone);
      if (item.name) fd.append('recipients[0][name]', item.name);
      fd.append('body', resolveVars(smsBody, item));
      log(`📤 [${i + 1}/${validItems.length}] SMS → ${item.phone}`, 'info');
    } else {
      fd.append('recipients[0][name]', item.name || item.email.split('@')[0]);
      fd.append('recipients[0][email]', item.email);

      if (isTemplate) {
        fd.append('templates[0]', tplId);
      } else if (item.fileName && pdfFiles[item.fileName.toLowerCase()]) {
        const pdfObj = pdfFiles[item.fileName.toLowerCase()];
        fd.append('files[0]', pdfObj.file, item.fileName);
      }

      if (operationType === 'advanced') fd.append('type', 'advanced');

      const resolvedSubj = resolveVars(subj, item);
      const resolvedBody = resolveVars(body, item);
      if (resolvedSubj) fd.append('subject', resolvedSubj);
      if (resolvedBody) fd.append('body', resolvedBody);
      if (brand) fd.append('branding_id', brand);

      const sizeStr = item.fileSize ? ` (${formatSize(item.fileSize)})` : '';
      log(`📤 [${i + 1}/${validItems.length}] → ${item.email}${sizeStr}`, 'info');
    }

    try {
      const resp = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'x-signaturit-token': token, 'x-api-url': apiUrl },
        body: fd
      });
      const data = await resp.json();

      if (resp.ok && data.id) {
        successCount++;
        log(`✅ ${isSMS ? item.phone : item.email} — ID: ${data.id}`, 'success');
        sendLog.push({ ...item, status: 'ok', id: data.id });
      } else {
        errorCount++;
        const errMsg = data.message || data.error || JSON.stringify(data);
        log(`❌ ${isSMS ? item.phone : item.email} — ${errMsg}`, 'error');
        sendLog.push({ ...item, status: 'error', error: errMsg });
      }
    } catch (err) {
      errorCount++;
      log(`❌ ${isSMS ? item.phone : item.email} — ${err.message}`, 'error');
      sendLog.push({ ...item, status: 'error', error: err.message });
    }

    if (i < validItems.length - 1 && sending) {
      await sleep(delay * 1000);
    }
  }

  sending = false;
  document.getElementById('btnSend').disabled = false;
  document.getElementById('btnStop').style.display = 'none';

  log(`\n🏁 Completado: ${successCount} ✅ — ${errorCount} ❌`, successCount === validItems.length ? 'success' : 'error');
  renderResults(isSMS);
}

function stopSending() { sending = false; }

function renderResults(isSMS) {
  const container = document.getElementById('resultsContainer');
  container.style.display = 'block';

  const ok = sendLog.filter(l => l.status === 'ok').length;
  const err = sendLog.filter(l => l.status === 'error').length;

  document.getElementById('resultsStats').innerHTML =
    `<span class="stat-badge success">✓ ${ok}</span>` +
    (err ? `<span class="stat-badge error">✗ ${err}</span>` : '');

  if (isSMS) {
    document.getElementById('resultsHead').innerHTML = '<tr><th>#</th><th>Estado</th><th>Teléfono</th><th>ID / Error</th></tr>';
    document.getElementById('resultsBody').innerHTML = sendLog.map((l, i) =>
      `<tr><td>${i + 1}</td><td><span class="status-dot ${l.status === 'ok' ? 'sent' : 'failed'}"></span>${l.status === 'ok' ? 'Enviado' : 'Error'}</td>
        <td>${l.phone}</td><td>${l.id || l.error}</td></tr>`
    ).join('');
  } else {
    document.getElementById('resultsHead').innerHTML = '<tr><th>#</th><th>Estado</th><th>Email</th><th>ID / Error</th></tr>';
    document.getElementById('resultsBody').innerHTML = sendLog.map((l, i) =>
      `<tr><td>${i + 1}</td><td><span class="status-dot ${l.status === 'ok' ? 'sent' : 'failed'}"></span>${l.status === 'ok' ? 'Enviado' : 'Error'}</td>
        <td>${l.email}</td><td>${l.id || l.error}</td></tr>`
    ).join('');
  }

  document.getElementById('exportArea').style.display = 'block';
}

function exportLog() {
  const lines = ['estado,destinatario,id_o_error'];
  sendLog.forEach(l => {
    const dest = l.email || l.phone || '';
    lines.push(`${l.status},${dest},${l.id || l.error || ''}`);
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `signaturit-log-${Date.now()}.csv`;
  a.click();
}

/* ===== UTILS ===== */
function formatSize(bytes) {
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1024).toFixed(1) + ' KB';
}

function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
