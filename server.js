const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const { randomUUID } = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const WORK_DIR = path.join(__dirname, 'work');
const OUTPUT_DIR = path.join(__dirname, 'output');

// Root of the Android NDK toolchain. Set via env var when deploying.
// Example: /opt/android-ndk-r26d
const NDK_ROOT = process.env.ANDROID_NDK_ROOT;
const HOST_TAG = process.env.NDK_HOST_TAG || 'linux-x86_64';

const ABI_TARGETS = {
  'arm64-v8a': 'aarch64-linux-android21',
  'armeabi-v7a': 'armv7a-linux-androideabi21',
  'x86_64': 'x86_64-linux-android21',
};

function toolchainBin() {
  return path.join(NDK_ROOT, 'toolchains', 'llvm', 'prebuilt', HOST_TAG, 'bin');
}

async function ensureDirs() {
  await fs.mkdir(WORK_DIR, { recursive: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

app.post('/api/compile', async (req, res) => {
  const { source, filename = 'source.cpp', abi = 'arm64-v8a', strip = true, outputName = 'libgame' } = req.body || {};

  if (!NDK_ROOT) {
    return res.status(500).json({
      log: 'Server belum dikonfigurasi: ANDROID_NDK_ROOT belum di-set. Lihat README untuk setup NDK.',
    });
  }
  if (!source || typeof source !== 'string') {
    return res.status(400).json({ log: 'Source code kosong atau tidak valid.' });
  }
  if (!ABI_TARGETS[abi]) {
    return res.status(400).json({ log: `ABI tidak dikenal: ${abi}` });
  }

  const target = ABI_TARGETS[abi];
  const jobId = randomUUID();
  const jobDir = path.join(WORK_DIR, jobId);
  const safeOutputName = outputName.replace(/[^a-zA-Z0-9_\-]/g, '') || 'libgame';
  const srcExt = path.extname(filename) || '.cpp';
  const srcPath = path.join(jobDir, `source${srcExt}`);
  const soName = `${safeOutputName}.so`;
  const soPath = path.join(jobDir, soName);

  const clangxx = path.join(toolchainBin(), `${target}-clang++`);
  const stripBin = path.join(toolchainBin(), 'llvm-strip');

  const log = [];

  try {
    await fs.mkdir(jobDir, { recursive: true });
    await fs.writeFile(srcPath, source, 'utf8');

    log.push(`$ ${path.basename(clangxx)} -shared -fPIC -O2 -o ${soName} ${path.basename(srcPath)}`);
    await execFileAsync(clangxx, [
      '-shared', '-fPIC', '-O2',
      '-o', soPath,
      srcPath,
    ], { cwd: jobDir });
    log.push('Compile OK.');

    if (strip) {
      log.push(`$ llvm-strip --strip-all ${soName}`);
      await execFileAsync(stripBin, ['--strip-all', soPath], { cwd: jobDir });
      log.push('Strip OK — simbol & debug info dibuang.');
    }

    const finalName = `${jobId}-${soName}`;
    const finalPath = path.join(OUTPUT_DIR, finalName);
    await fs.copyFile(soPath, finalPath);

    const stat = await fs.stat(finalPath);

    res.json({
      log: log.join('\n'),
      outputFile: soName,
      downloadUrl: `/download/${finalName}`,
      sizeKb: Math.max(1, Math.round(stat.size / 1024)),
    });
  } catch (err) {
    const stderr = err.stderr ? String(err.stderr) : err.message;
    res.status(422).json({
      log: log.join('\n') || 'Compile gagal.',
      errors: stderr.split('\n').filter(Boolean),
    });
  } finally {
    fs.rm(jobDir, { recursive: true, force: true }).catch(() => {});
  }
});

app.get('/download/:file', async (req, res) => {
  const file = req.params.file;
  if (!/^[a-zA-Z0-9_\-]+\.so$/.test(file.replace(/^[0-9a-f-]+-/, ''))) {
    return res.status(400).end();
  }
  const filePath = path.join(OUTPUT_DIR, file);
  try {
    await fs.access(filePath);
    res.download(filePath, file.replace(/^[0-9a-f-]+-/, ''));
  } catch {
    res.status(404).send('File sudah tidak ada / expired.');
  }
});

ensureDirs().then(() => {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`So File Generator jalan di http://localhost:${port}`);
    console.log(NDK_ROOT ? `NDK: ${NDK_ROOT}` : 'WARNING: ANDROID_NDK_ROOT belum di-set, /api/compile akan gagal.');
  });
});
