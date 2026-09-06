const http = require('http');
const fs = require('fs');
const path = require('path');

const DEFAULT_PORT = Number(process.env.PORT || 3000);
const HAS_CUSTOM_PORT = Boolean(process.env.PORT);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const BILL_DIR = path.join(DATA_DIR, 'bills');
const SNAPSHOT_FILE = path.join(DATA_DIR, 'snapshot.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const ORDERS_CSV_FILE = path.join(DATA_DIR, 'orders.csv');

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 5_000_000) {
        req.destroy();
        reject(new Error('Request body is too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function ordersToCsv(orders = []) {
  const rows = [
    ['Bill Date', 'Hotel', '#', 'Item', 'Qty', 'Rate', 'Amount', 'Paid', 'Balance', 'Saved At'],
  ];

  orders.forEach((order) => {
    const lineItems = Array.isArray(order.rows) && order.rows.length ? order.rows : [{}];
    lineItems.forEach((row, index) => {
      rows.push([
        order.billDate || '',
        order.hotelName || '',
        index + 1,
        row.item || '',
        row.qty || 0,
        row.rate || 0,
        row.amount || 0,
        row.paid || 0,
        row.balance || 0,
        order.savedAt || '',
      ]);
    });
  });

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

function orderToCsv(order = {}) {
  const rows = [
    ['Hotel', order.hotelName || ''],
    ['Bill Date', order.billDate || ''],
    ['Saved At', order.savedAt || ''],
    [],
    ['#', 'Item', 'Qty', 'Rate', 'Amount', 'Paid', 'Balance'],
  ];

  const lineItems = Array.isArray(order.rows) && order.rows.length ? order.rows : [{}];
  lineItems.forEach((row, index) => {
    rows.push([
      index + 1,
      row.item || '',
      row.qty || 0,
      row.rate || 0,
      row.amount || 0,
      row.paid || 0,
      row.balance || 0,
    ]);
  });

  rows.push(
    [],
    ['Subtotal', order.totals?.subtotal || 0],
    ['Paid', order.totals?.paid || 0],
    ['Balance', order.totals?.balance || 0],
  );

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

function cleanFileName(value) {
  return String(value || 'file')
    .trim()
    .replace(/[\\/:*?"<>|#%{}~&]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120) || 'file';
}

async function saveBillFiles(orders = []) {
  await fs.promises.mkdir(BILL_DIR, { recursive: true });

  await Promise.all(orders.map((order, index) => {
    const date = cleanFileName(order.billDate || 'no-date');
    const hotel = cleanFileName(order.hotelName || 'hotel');
    const id = cleanFileName(order.id || `bill-${index + 1}`);
    const basePath = path.join(BILL_DIR, `${date}-${hotel}-${id}`);

    return Promise.all([
      fs.promises.writeFile(`${basePath}.json`, JSON.stringify(order, null, 2), 'utf8'),
      fs.promises.writeFile(`${basePath}.csv`, orderToCsv(order), 'utf8'),
    ]);
  }));
}

async function saveSnapshot(req, res) {
  try {
    const body = await readBody(req);
    const snapshot = JSON.parse(body || '{}');
    const cleanSnapshot = {
      orders: Array.isArray(snapshot.orders) ? snapshot.orders : [],
      drafts: snapshot.drafts && typeof snapshot.drafts === 'object' ? snapshot.drafts : {},
      balances: snapshot.balances && typeof snapshot.balances === 'object' ? snapshot.balances : {},
      updatedAt: new Date().toISOString(),
    };

    await fs.promises.mkdir(DATA_DIR, { recursive: true });
    await Promise.all([
      fs.promises.writeFile(SNAPSHOT_FILE, JSON.stringify(cleanSnapshot, null, 2), 'utf8'),
      fs.promises.writeFile(ORDERS_FILE, JSON.stringify(cleanSnapshot.orders, null, 2), 'utf8'),
      fs.promises.writeFile(ORDERS_CSV_FILE, ordersToCsv(cleanSnapshot.orders), 'utf8'),
      saveBillFiles(cleanSnapshot.orders),
    ]);

    send(res, 200, JSON.stringify({ ok: true, updatedAt: cleanSnapshot.updatedAt }), 'application/json; charset=utf-8');
  } catch (error) {
    send(res, 400, JSON.stringify({ ok: false, error: error.message }), 'application/json; charset=utf-8');
  }
}

function readSnapshot(res) {
  fs.readFile(SNAPSHOT_FILE, (err, data) => {
    if (err) {
      send(res, 200, JSON.stringify({ orders: [], drafts: {}, balances: {}, updatedAt: null }), 'application/json; charset=utf-8');
      return;
    }

    send(res, 200, data, 'application/json; charset=utf-8');
  });
}

function handleRequest(req, res) {
  let requestPath;

  try {
    requestPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname);
  } catch {
    send(res, 400, 'Bad request');
    return;
  }

  if (requestPath === '/api/snapshot') {
    if (req.method === 'POST') {
      saveSnapshot(req, res);
      return;
    }

    if (req.method === 'GET') {
      readSnapshot(res);
      return;
    }

    send(res, 405, 'Method not allowed');
    return;
  }

  const cleanPath = requestPath === '/' ? '/index.html' : requestPath;
  const filePath = path.normalize(path.join(ROOT, cleanPath));
  const relativePath = path.relative(ROOT, filePath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    send(res, 403, 'Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      send(res, 404, 'Not found');
      return;
    }

    send(res, 200, data, types[path.extname(filePath)] || 'application/octet-stream');
  });
}

function start(port, attemptsLeft = 10) {
  const server = http.createServer(handleRequest);

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE' && !HAS_CUSTOM_PORT && attemptsLeft > 0) {
      const nextPort = port + 1;
      console.log(`Port ${port} is busy. Trying http://localhost:${nextPort}`);
      start(nextPort, attemptsLeft - 1);
      return;
    }

    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Close the other server or run with another PORT.`);
      process.exit(1);
    }

    console.error(error);
    process.exit(1);
  });

  server.listen(port, () => {
    console.log(`Amaravathi Foods running at http://localhost:${port}`);
  });
}

start(DEFAULT_PORT);
