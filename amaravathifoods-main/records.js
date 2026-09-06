const STORAGE_KEY = 'amaravathiFoods.orders.v1';
const DRIVE_SYNC_URL = window.AMARAVATHI_CONFIG?.driveSyncUrl || '';
const fmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

const els = {
  body: document.getElementById('recordsBody'),
  empty: document.getElementById('recordsEmpty'),
  exportAllBtn: document.getElementById('exportAllBtn'),
  billCount: document.getElementById('recordBillCount'),
  subtotal: document.getElementById('recordSubtotal'),
  paid: document.getElementById('recordPaid'),
  balance: document.getElementById('recordBalance'),
};

function loadOrders() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

async function loadOrdersFromServer() {
  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (!isLocal && DRIVE_SYNC_URL) {
    return new Promise((resolve) => {
      const callbackName = `amaravathiRecords${Date.now()}`;
      const script = document.createElement('script');
      const timeout = window.setTimeout(() => {
        delete window[callbackName];
        script.remove();
        resolve(loadOrders());
      }, 10000);
      window[callbackName] = (snapshot) => {
        window.clearTimeout(timeout);
        delete window[callbackName];
        script.remove();
        resolve(Array.isArray(snapshot?.orders) ? snapshot.orders : loadOrders());
      };
      script.src = `${DRIVE_SYNC_URL}${DRIVE_SYNC_URL.includes('?') ? '&' : '?'}callback=${callbackName}&t=${Date.now()}`;
      script.onerror = () => {
        window.clearTimeout(timeout);
        delete window[callbackName];
        script.remove();
        resolve(loadOrders());
      };
      document.head.appendChild(script);
    });
  }
  const url = isLocal ? '/api/snapshot' : '';
  if (!url) return loadOrders();

  try {
      const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return loadOrders();
    const snapshot = await response.json();
    return Array.isArray(snapshot.orders) ? snapshot.orders : loadOrders();
  } catch {
    return loadOrders();
  }
}

function money(value) {
  return fmt.format(Number(value || 0));
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function orderRows(orders) {
  return orders.flatMap((order) => {
    const rows = order.rows?.length ? order.rows : [{}];
    return rows.map((row, index) => ({
      billDate: order.billDate || '',
      hotelName: order.hotelName || '',
      rowNo: index + 1,
      item: row.item || '',
      qty: Number(row.qty || 0),
      rate: Number(row.rate || 0),
      amount: Number(row.amount || 0),
      paid: Number(row.paid || 0),
      balance: Number(row.balance || 0),
      savedAt: order.savedAt ? new Date(order.savedAt).toLocaleString('en-IN') : '',
        id: order.id || '',
    }));
  });
}

async function render() {
  const orders = (await loadOrdersFromServer()).sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));
  const rows = orderRows(orders);
  const totals = orders.reduce((sum, order) => {
    sum.subtotal += Number(order.totals?.subtotal || 0);
    sum.paid += Number(order.totals?.paid || 0);
    sum.balance += Number(order.totals?.balance || 0);
    return sum;
  }, { subtotal: 0, paid: 0, balance: 0 });

  els.billCount.textContent = String(orders.length);
  els.subtotal.textContent = money(totals.subtotal);
  els.paid.textContent = money(totals.paid);
  els.balance.textContent = money(totals.balance);
  els.empty.hidden = rows.length > 0;

  els.body.innerHTML = rows.map((row) => `
    <tr>
      <td>${row.billDate}</td>
      <td>${row.hotelName}</td>
      <td>${row.rowNo}</td>
      <td>${row.item}</td>
      <td>${row.qty}</td>
      <td>${money(row.rate)}</td>
      <td>${money(row.amount)}</td>
      <td>${money(row.paid)}</td>
      <td>${money(row.balance)}</td>
      <td>${row.savedAt}</td>
      <td><a class="btn btn-small btn-primary" href="index.html?edit=${encodeURIComponent(row.id)}">Edit</a></td>
    </tr>
  `).join('');
}

async function exportAllCsv() {
  const rows = orderRows(await loadOrdersFromServer());
  const lines = [
    ['Bill Date', 'Hotel', '#', 'Item', 'Qty', 'Rate', 'Amount', 'Paid', 'Balance', 'Saved At'],
    ...rows.map((row) => [
      row.billDate,
      row.hotelName,
      row.rowNo,
      row.item,
      row.qty,
      row.rate,
      row.amount,
      row.paid,
      row.balance,
      row.savedAt,
    ]),
  ];

  const csv = lines.map((line) => line.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'amaravathi-foods-records.csv';
  link.click();
  URL.revokeObjectURL(url);
}

els.exportAllBtn.addEventListener('click', () => {
  exportAllCsv();
});
render();
