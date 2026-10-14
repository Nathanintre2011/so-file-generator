const pasteArea   = document.getElementById('pasteArea');
const uploadArea  = document.getElementById('uploadArea');
const sourceCode  = document.getElementById('sourceCode');
const charCount   = document.getElementById('charCount');
const modeBtns    = document.querySelectorAll('.mode-btn');
const fileInput   = document.getElementById('fileInput');
const browseBtn   = document.getElementById('browseBtn');
const dropInner   = document.getElementById('dropInner');
const fileChip    = document.getElementById('fileChip');
const fileName    = document.getElementById('fileName');
const removeFile  = document.getElementById('removeFile');
const buildBtn    = document.getElementById('buildBtn');
const logWindow   = document.getElementById('logWindow');
const outputSub   = document.getElementById('outputSub');
const resultCard  = document.getElementById('resultCard');
const resultName  = document.getElementById('resultName');
const resultMeta  = document.getElementById('resultMeta');
const downloadBtn = document.getElementById('downloadBtn');
const outputName  = document.getElementById('outputName');
const abiSelect   = document.getElementById('abiSelect');
const stripToggle = document.getElementById('stripToggle');

let mode = 'paste';
let selectedFile = null;

// Mode switch
modeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    modeBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    mode = btn.dataset.mode;
    pasteArea.hidden = mode !== 'paste';
    uploadArea.hidden = mode !== 'upload';
  });
});

sourceCode.addEventListener('input', () => {
  charCount.textContent = `${sourceCode.value.length} karakter`;
});

// Upload handling
browseBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => handleFile(e.target.files[0]));

['dragover','dragenter'].forEach(evt =>
  uploadArea.addEventListener(evt, e => { e.preventDefault(); uploadArea.classList.add('drag-over'); })
);
['dragleave','dragend','drop'].forEach(evt =>
  uploadArea.addEventListener(evt, e => { e.preventDefault(); uploadArea.classList.remove('drag-over'); })
);
uploadArea.addEventListener('drop', e => {
  const f = e.dataTransfer.files[0];
  if (f) handleFile(f);
});

function handleFile(file) {
  if (!file) return;
  if (!/\.(cpp|cc|cxx|c)$/i.test(file.name)) {
    appendLog(`Ditolak: "${file.name}" bukan file C/C++.`, 'err');
    return;
  }
  selectedFile = file;
  fileName.textContent = file.name;
  dropInner.hidden = true;
  fileChip.hidden = false;
}

removeFile.addEventListener('click', () => {
  selectedFile = null;
  fileInput.value = '';
  fileChip.hidden = true;
  dropInner.hidden = false;
});

function appendLog(text, cls = '') {
  const empty = logWindow.querySelector('.log-empty');
  if (empty) empty.remove();
  const line = document.createElement('p');
  line.className = `log-line ${cls}`;
  line.textContent = text;
  logWindow.appendChild(line);
  logWindow.scrollTop = logWindow.scrollHeight;
}

function clearLog() {
  logWindow.innerHTML = '';
}

buildBtn.addEventListener('click', async () => {
  const name = (outputName.value || 'libgame').replace(/[^a-zA-Z0-9_\-]/g, '') || 'libgame';
  const abi = abiSelect.value;
  const strip = stripToggle.checked;

  let payload;
  if (mode === 'paste') {
    if (!sourceCode.value.trim()) {
      appendLog('Source code masih kosong.', 'err');
      return;
    }
    payload = { source: sourceCode.value, filename: `${name}.cpp`, abi, strip, outputName: name };
  } else {
    if (!selectedFile) {
      appendLog('Belum ada file yang dipilih.', 'err');
      return;
    }
    const text = await selectedFile.text();
    payload = { source: text, filename: selectedFile.name, abi, strip, outputName: name };
  }

  clearLog();
  resultCard.hidden = true;
  buildBtn.disabled = true;
  buildBtn.classList.add('working');
  buildBtn.querySelector('span').textContent = 'Compiling...';
  outputSub.textContent = `Build jalan — ${abi}, ${strip ? 'stripped' : 'unstripped'}`;

  appendLog(`$ clang++ --target=${abiToTarget(abi)} -shared -fPIC ${payload.filename} -o ${name}.so`);

  try {
    const res = await fetch('/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      appendLog(data.log || 'Compile gagal.', 'err');
      (data.errors || []).forEach(e => appendLog(e, 'err'));
      outputSub.textContent = 'Build gagal.';
      return;
    }

    (data.log || '').split('\n').filter(Boolean).forEach(l => appendLog(l));
    appendLog(`Build sukses: ${data.outputFile}`, 'ok');

    resultName.textContent = data.outputFile;
    resultMeta.textContent = `${abi} · ${strip ? 'stripped' : 'unstripped'} · ${data.sizeKb} KB`;
    downloadBtn.href = data.downloadUrl;
    downloadBtn.setAttribute('download', data.outputFile);
    resultCard.hidden = false;
    outputSub.textContent = 'Build selesai.';
  } catch (err) {
    appendLog(`Gagal konek ke backend compiler: ${err.message}`, 'err');
    outputSub.textContent = 'Backend tidak merespons.';
  } finally {
    buildBtn.disabled = false;
    buildBtn.classList.remove('working');
    buildBtn.querySelector('span').textContent = 'Compile ke .so';
  }
});

function abiToTarget(abi) {
  return {
    'arm64-v8a': 'aarch64-linux-android21',
    'armeabi-v7a': 'armv7a-linux-androideabi21',
    'x86_64': 'x86_64-linux-android21'
  }[abi] || abi;
}
