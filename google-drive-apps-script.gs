const DRIVE_FOLDER_ID = '1slg0oJDBrBks0tjU6qNSWOVpDZWz9CEd';
const SNAPSHOT_FILE_NAME = 'amaravathi-foods-snapshot.json';
const ORDERS_FILE_NAME = 'amaravathi-foods-orders.json';
const ORDERS_CSV_FILE_NAME = 'amaravathi-foods-orders.csv';

function doPost(e) {
  try {
    const snapshot = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const orders = Array.isArray(snapshot.orders) ? snapshot.orders : [];
    const cleanSnapshot = {
      orders,
      drafts: snapshot.drafts || {},
      balances: snapshot.balances || {},
      updatedAt: new Date().toISOString(),
    };

    upsertFile(SNAPSHOT_FILE_NAME, JSON.stringify(cleanSnapshot, null, 2), MimeType.PLAIN_TEXT);
    upsertFile(ORDERS_FILE_NAME, JSON.stringify(orders, null, 2), MimeType.PLAIN_TEXT);
    upsertFile(ORDERS_CSV_FILE_NAME, ordersToCsv(orders), MimeType.CSV);
    saveEachBill(orders);

    return jsonOutput({ ok: true, updatedAt: cleanSnapshot.updatedAt, orderCount: orders.length });
  } catch (error) {
    return jsonOutput({ ok: false, error: error.message });
  }
}

function doGet(e) {
  let snapshot;
  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const files = folder.getFilesByName(SNAPSHOT_FILE_NAME);
  if (files.hasNext()) {
    snapshot = JSON.parse(files.next().getBlob().getDataAsString());
  } else {
    snapshot = {
      orders: [],
      drafts: {},
      balances: {},
      updatedAt: null,
    };
  }
  const callback = (e && e.parameter && e.parameter.callback) || '';
  const body = JSON.stringify(snapshot).replace(/</g, '\\u003c');
  if (callback && /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    return ContentService.createTextOutput(`${callback}(${body});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

function saveEachBill(orders) {
  orders.forEach((order, index) => {
    const baseName = billFileBaseName(order, index + 1);
    upsertFile(`${baseName}.csv`, orderToCsv(order), MimeType.CSV);
    upsertFile(`${baseName}.json`, JSON.stringify(order, null, 2), MimeType.PLAIN_TEXT);
  });
}

function upsertFile(name, content, mimeType) {
  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const files = folder.getFilesByName(name);

  if (files.hasNext()) {
    files.next().setContent(content);
    return;
  }

  folder.createFile(name, content, mimeType);
}

function billFileBaseName(order, number) {
  const date = cleanName(order.billDate || 'no-date');
  const hotel = cleanName(order.hotelName || 'hotel');
  const id = cleanName(order.id || `bill-${number}`);
  return `${date}-${hotel}-${id}`;
}

function cleanName(value) {
  return String(value)
    .trim()
    .replace(/[\\/:*?"<>|#%{}~&]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120) || 'file';
}

function ordersToCsv(orders) {
  const rows = [
    ['Bill Date', 'Hotel', '#', 'Item', 'Qty', 'Rate', 'Amount', 'Paid', 'Balance', 'Saved At'],
  ];

  orders.forEach((order) => {
    orderRows(order).forEach((row) => rows.push(row));
  });

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

function orderToCsv(order) {
  return [
    ['Hotel', order.hotelName || ''],
    ['Bill Date', order.billDate || ''],
    ['Saved At', order.savedAt || ''],
    [],
    ['#', 'Item', 'Qty', 'Rate', 'Amount', 'Paid', 'Balance'],
    ...orderRows(order).map((row) => row.slice(2, 9)),
    [],
    ['Subtotal', order.totals && order.totals.subtotal ? order.totals.subtotal : 0],
    ['Paid', order.totals && order.totals.paid ? order.totals.paid : 0],
    ['Balance', order.totals && order.totals.balance ? order.totals.balance : 0],
  ].map((row) => row.map(csvCell).join(',')).join('\n');
}

function orderRows(order) {
  const lineItems = Array.isArray(order.rows) && order.rows.length ? order.rows : [{}];

  return lineItems.map((row, index) => [
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
}

function csvCell(value) {
  return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"';
}

function jsonOutput(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
