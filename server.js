const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const PORT = process.env.PORT || 3000;
const NISSY_PATH = process.env.NISSY_PATH || path.join(__dirname, 'nissy');
const TIMEOUT = 18000000; // 5 hours

// Only allow safe cube notation characters
const SAFE_INPUT = /^[A-Za-z0-9' ()\-\[\]]*$/;


function sanitize(input) {
  if (typeof input !== 'string') return '';
  const trimmed = input.trim();
  if (!SAFE_INPUT.test(trimmed)) {
    throw new Error('Invalid characters in input');
  }
  return trimmed;
}

function filterWarnings(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const filtered = [];
  let inWarning = false;
  for (const line of lines) {
    if (line.startsWith('--- Warning ---')) { inWarning = true; continue; }
    if (line.startsWith('---------------')) { inWarning = false; continue; }
    if (!inWarning) filtered.push(line);
  }
  return filtered.join('\n').trim();
}

function runNissy(args) {
  return new Promise((resolve, reject) => {
    execFile(NISSY_PATH, args, { timeout: TIMEOUT }, (err, stdout, stderr) => {
      // Always check stdout first — nissy may exit non-zero due to
      // missing optional tables but still produce valid output
      const out = filterWarnings(stdout || '');
      if (out) {
        resolve(out);
        return;
      }
      if (err) {
        if (err.killed) {
          reject(new Error('Process timed out'));
        } else {
          const msg = filterWarnings(stderr || err.message);
          reject(new Error(msg || 'No solution found'));
        }
        return;
      }
      resolve('');
    });
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function handleAPI(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const route = url.pathname;

  try {
    if (route === '/api/steps' && req.method === 'GET') {
      const output = await runNissy(['steps']);
      // Filter out steps that require the nxopt31 table (crashes on <8GB RAM)
      const SKIP = new Set(['optimal', 'light']);
      const steps = output.split('\n')
        .map(line => {
          const match = line.match(/^(\S+)\s+(.+)$/);
          if (match && !SKIP.has(match[1])) return { id: match[1], description: match[2].trim() };
          return null;
        })
        .filter(Boolean);
      sendJSON(res, 200, { steps });
      return;
    }

    if (req.method !== 'POST') {
      sendJSON(res, 405, { error: 'Method not allowed' });
      return;
    }

    const body = await readBody(req);

    if (route === '/api/solve') {
      const step = sanitize(body.step);
      const scramble = sanitize(body.scramble);
      if (!step || !scramble) {
        sendJSON(res, 400, { error: 'step and scramble are required' });
        return;
      }
      const args = ['solve', step];
      if (body.options) {
        const opts = sanitize(body.options);
        if (opts) args.push(...opts.split(/\s+/));
      }
      args.push(scramble);
      const output = await runNissy(args);
      sendJSON(res, 200, { result: output });
      return;
    }

    if (route === '/api/scramble') {
      const args = ['scramble'];
      if (body.type) args.push(sanitize(body.type));
      if (body.count) args.push('-n', String(parseInt(body.count, 10) || 1));
      const output = await runNissy(args);
      sendJSON(res, 200, { result: output });
      return;
    }

    if (route === '/api/invert') {
      const scramble = sanitize(body.scramble);
      if (!scramble) { sendJSON(res, 400, { error: 'scramble is required' }); return; }
      const output = await runNissy(['invert', scramble]);
      sendJSON(res, 200, { result: output });
      return;
    }

    if (route === '/api/print') {
      const scramble = sanitize(body.scramble);
      if (!scramble) { sendJSON(res, 400, { error: 'scramble is required' }); return; }
      const output = await runNissy(['print', scramble]);
      sendJSON(res, 200, { result: output });
      return;
    }

    if (route === '/api/cleanup') {
      const scramble = sanitize(body.scramble);
      if (!scramble) { sendJSON(res, 400, { error: 'scramble is required' }); return; }
      const output = await runNissy(['cleanup', scramble]);
      sendJSON(res, 200, { result: output });
      return;
    }

    if (route === '/api/unniss') {
      const scramble = sanitize(body.scramble);
      if (!scramble) { sendJSON(res, 400, { error: 'scramble is required' }); return; }
      const output = await runNissy(['unniss', scramble]);
      sendJSON(res, 200, { result: output });
      return;
    }

    sendJSON(res, 404, { error: 'Not found' });
  } catch (err) {
    sendJSON(res, 500, { error: err.message });
  }
}

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
};

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/')) {
    return handleAPI(req, res);
  }

  // Serve static files
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, 'public', path.normalize(filePath));

  // Prevent directory traversal
  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'text/plain';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

// STEP 1: Start HTTP server FIRST so Fly.io health checks pass immediately
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Nissy Web running at http://0.0.0.0:${PORT}`);
  console.log(`Using executable: ${NISSY_PATH}`);
});

// Tables are pre-generated on the persistent volume.
// The nxopt31 table (for optimal/light steps) requires >8GB RAM to generate
// and is excluded. All other tables are present.
