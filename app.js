const HOTEL_NAMES = [
  'trupti', 'IBM surya', 'market', 'IBM hostel', 'మహబూబ్ mess', 'peacock', 'srivalli', 'MLP ganesh',
  'SN Puram', 'Db Durgadevi', 'lakshimi ganapathi', 'KCL ramesh', 'KCL vijay durga', 'KCL Sales siva',
  'KCL vijay', 'KCL hotel', 'KCL V Grand', 'KCL Peragalupadu', 'KS nagaya', 'KS Madhan', 'KS rk', 'KS suresh',
  'NDG shiva', 'NDG Gopi', 'NDG lalu', 'NDG Dollyhotel', 'NDG market', 'NDG Mahitha', 'NDG Hanuman',
  'NDG Vijaya Prasad', 'NDG dosa', 'NDG busstand', 'NDG Krishna', 'NDG Bargvu', 'coffe Villa',
  'NDG brundhavanam', 'TT Srinu', 'SR coffe', 'Chowdary', 'గోవురవారం Shop', 'PNR', 'CL Murali', 'CL Ramarao',
  'JPT hotel', 'JPT sale', 'JPT milk booth', 'V nanee', 'V aunty', 'KKD Durga', 'PP అనిల్', 'PP వెంకట్సాయ్',
  'PP టెంపుల్', 'PP అచ్చాయా', 'PP ముచింతల', 'MDR మద్దిపల్లి', 'MDR Amora', 'MDR vijaya', 'maynolu suresh',
  'Mic college', 'BVM amma', 'BVM కుంభస్థలం', 'BVM swathi', 'BVM rtc', 'Sheet61', 'Sheet62'
];

const ITEM_OPTIONS = [
  ['PAROTA', 75],
  ['SMALL CHAPATHI', 35],
  ['BIG CHAPATHI', 60],
  ['COIN PAROTA', 50],
  ['5 PICS PAROTA', 40],
  ['PULKA', 35],
  ['BOBUTULLU', 30],
  ['POORI', 40],
];

const PRICE_LIST = Object.fromEntries(ITEM_OPTIONS);
const STORAGE_KEY = 'amaravathiFoods.orders.v1';
const DRAFT_KEY = 'amaravathiFoods.drafts.v1';
const BALANCE_KEY = 'amaravathiFoods.balances.v1';
const FILE_SYNC_DELAY = 300;
const DRIVE_SYNC_URL = window.AMARAVATHI_CONFIG?.driveSyncUrl || '';
const DRIVE_FOLDER_ID = window.AMARAVATHI_CONFIG?.driveFolderId || '';

const fmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const $ = (id) => document.getElementById(id);

const els = {
  hotelCount: $('hotelCount'),
  itemCount: $('itemCount'),
  orderCount: $('orderCount'),
  hotelSearch: $('hotelSearch'),
  hotelName: $('hotelName'),
  billDate: $('billDate'),
  selectedHotelLabel: $('selectedHotelLabel'),
  hotelNames: $('hotelNames'),
  lineItems: $('lineItems'),
  hotelHistorySummary: $('hotelHistorySummary'),
  hotelHistoryList: $('hotelHistoryList'),
  subtotal: $('subtotal'),
  paidTotal: $('paidTotal'),
  balanceTotal: $('balanceTotal'),
  addRowBtn: $('addRowBtn'),
  sampleBtn: $('sampleBtn'),
  saveBtn: $('saveBtn'),
  clearBtn: $('clearBtn'),
  exportBtn: $('exportBtn'),
  resetBtn: $('resetBtn'),
  syncStatus: $('syncStatus'),
  searchFeedback: $('hotelSearchFeedback'),
  hotelOptions: $('hotelOptions'),
  oldBalance: $('oldBalance'),
  editOldBalanceBtn: $('editOldBalanceBtn'),
  saveOldBalanceBtn: $('saveOldBalanceBtn'),
  cancelOldBalanceBtn: $('cancelOldBalanceBtn'),
  cancelEditBtn: $('cancelEditBtn'),
  rowTemplate: $('rowTemplate'),
  orderTemplate: $('orderTemplate'),
};

const state = {
  orders: loadJson(STORAGE_KEY, []),
  drafts: loadJson(DRAFT_KEY, {}),
  balances: loadJson(BALANCE_KEY, {}),
  activeHotel: HOTEL_NAMES[0],
  editingOrderId: null,
  balanceBeforeEdit: 0,
};

let fileSyncTimer;
let driveSyncTimer;

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  queueFileSync();
  queueDriveSync();
}

function canUseLocalFileSync() {
  return ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

function storageSnapshot() {
  return {
    orders: state.orders,
    drafts: state.drafts,
    balances: state.balances,
    driveFolderId: DRIVE_FOLDER_ID,
    updatedAt: new Date().toISOString(),
  };
}

function setSyncStatus(message, tone = '') {
  if (!els.syncStatus) return;
  els.syncStatus.textContent = message;
  els.syncStatus.dataset.tone = tone;
}

function queueFileSync() {
  if (!canUseLocalFileSync()) return;
  window.clearTimeout(fileSyncTimer);
  fileSyncTimer = window.setTimeout(async () => {
    try {
      await fetch('/api/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(storageSnapshot()),
      });
    } catch {
      setSyncStatus('Shared server unavailable; local cache retained', 'error');
    }
  }, FILE_SYNC_DELAY);
}

function queueDriveSync() {
  if (!DRIVE_SYNC_URL) {
    setSyncStatus('Drive: setup needed', 'warn');
    return;
  }

  setSyncStatus('Drive: syncing...', '');
  window.clearTimeout(driveSyncTimer);
  driveSyncTimer = window.setTimeout(async () => {
    try {
      await fetch(DRIVE_SYNC_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(storageSnapshot()),
      });
      setSyncStatus('Drive: sync sent', 'ok');
    } catch {
      setSyncStatus('Drive: sync failed', 'error');
    }
  }, FILE_SYNC_DELAY);
}

function hasRemoteSync() {
  return canUseLocalFileSync() || Boolean(DRIVE_SYNC_URL);
}

async function loadSharedSnapshot() {
  if (!hasRemoteSync()) return null;
  if (!canUseLocalFileSync()) {
    return new Promise((resolve) => {
      const callbackName = `amaravathiSnapshot${Date.now()}`;
      const script = document.createElement('script');
      const timeout = window.setTimeout(() => {
        delete window[callbackName];
        script.remove();
        setSyncStatus('Shared data unavailable: request timed out', 'error');
        resolve(null);
      }, 10000);
      window[callbackName] = (snapshot) => {
        window.clearTimeout(timeout);
        delete window[callbackName];
        script.remove();
        resolve(Array.isArray(snapshot?.orders) ? snapshot : null);
      };
      script.src = `${DRIVE_SYNC_URL}${DRIVE_SYNC_URL.includes('?') ? '&' : '?'}callback=${callbackName}&t=${Date.now()}`;
      script.onerror = () => {
        window.clearTimeout(timeout);
        delete window[callbackName];
        script.remove();
        setSyncStatus('Shared data unavailable: request failed', 'error');
        resolve(null);
      };
      document.head.appendChild(script);
    });
  }
  const url = '/api/snapshot';
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Snapshot request failed (${response.status})`);
    const snapshot = await response.json();
    if (!Array.isArray(snapshot.orders)) throw new Error('Invalid shared snapshot');
    return snapshot;
  } catch (error) {
    setSyncStatus(`Shared data unavailable: ${error.message}`, 'error');
    return null;
  }
}

async function saveSharedSnapshot() {
  if (canUseLocalFileSync()) return;
  if (!DRIVE_SYNC_URL) return;
  await fetch(DRIVE_SYNC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(storageSnapshot()),
  });
}

function money(value) {
  return fmt.format(Number(value || 0));
}

function today() {
  const value = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function getCurrentHotel() {
  return (els.hotelName.value || els.hotelSearch.value || state.activeHotel || HOTEL_NAMES[0]).trim();
}

function setActiveHotel(name) {
  const requested = (name || '').trim();
  const hotel = HOTEL_NAMES.find((entry) => entry.toLocaleLowerCase() === requested.toLocaleLowerCase()) || requested || HOTEL_NAMES[0];
  if (!HOTEL_NAMES.includes(hotel)) return false;
  state.activeHotel = hotel;
  els.hotelName.value = hotel;
  els.hotelSearch.value = hotel;
  els.selectedHotelLabel.textContent = hotel;
  restoreDraft(hotel);
  renderSelectedHotelHistory(hotel);
  renderHotelOptions(els.hotelSearch.value);
  return true;
}

function renderHotelList() {
  els.hotelNames.innerHTML = '';
  HOTEL_NAMES.forEach((hotel) => {
    const option = document.createElement('option');
    option.value = hotel;
    els.hotelNames.appendChild(option);
  });
  renderHotelOptions('');
}

function renderHotelOptions(query = '') {
  const normalized = query.trim().toLocaleLowerCase();
  const matches = HOTEL_NAMES.filter((hotel) => hotel.toLocaleLowerCase().includes(normalized));
  els.hotelOptions.innerHTML = matches.map((hotel) => `<button class="pill${hotel === state.activeHotel ? ' active' : ''}" type="button" data-hotel="${encodeURIComponent(hotel)}">${hotel}</button>`).join('');
  els.searchFeedback.textContent = normalized ? `${matches.length} hotel${matches.length === 1 ? '' : 's'} found` : `${matches.length} hotels available`;
  els.hotelOptions.querySelectorAll('[data-hotel]').forEach((button) => {
    button.addEventListener('click', () => setActiveHotel(decodeURIComponent(button.dataset.hotel)));
  });
}

function createRow(data = {}) {
  const fragment = els.rowTemplate.content.cloneNode(true);
  const row = fragment.querySelector('tr');
  const item = fragment.querySelector('.item');
  const qty = fragment.querySelector('.qty');
  const rate = fragment.querySelector('.rate');
  const amount = fragment.querySelector('.amount');
  const paid = fragment.querySelector('.paid');
  const balance = fragment.querySelector('.balance');
  const remove = fragment.querySelector('.remove-row');

  item.innerHTML = ITEM_OPTIONS.map(([name]) => `<option value="${name}">${name}</option>`).join('');
  item.value = data.item || ITEM_OPTIONS[0][0];
  qty.value = Number(data.qty ?? 1);
  paid.value = Number(data.paid ?? 0);

  const update = () => {
    rate.value = PRICE_LIST[item.value] ?? 0;
    amount.value = Number(qty.value || 0) * Number(rate.value || 0);
    updateSheetNumbers();
    updateSummary();
    saveDraft();
  };

  item.addEventListener('change', update);
  qty.addEventListener('input', update);
  paid.addEventListener('input', update);
  remove.addEventListener('click', () => {
    row.remove();
    updateSheetNumbers();
    updateSummary();
    saveDraft();
    if (!els.lineItems.children.length) addRow();
  });

  els.lineItems.appendChild(fragment);
  update();
}

function addRow(data = {}) {
  createRow(data);
}

function updateSheetNumbers() {
  [...els.lineItems.querySelectorAll('tr')].forEach((row, index) => {
    row.querySelector('.row-no').textContent = index + 1;
  });
}

function readRows() {
  return [...els.lineItems.querySelectorAll('tr')].map((row) => ({
    item: row.querySelector('.item').value,
    qty: Number(row.querySelector('.qty').value || 0),
    rate: Number(row.querySelector('.rate').value || 0),
    amount: Number(row.querySelector('.amount').value || 0),
    paid: Number(row.querySelector('.paid').value || 0),
    balance: Number(row.querySelector('.balance').value || 0),
  }));
}

function updateSummary() {
  let subtotal = 0;
  let paid = 0;
  let running = Number(els.oldBalance.value || 0);
  const oldBalance = Number(els.oldBalance.value || 0);

  [...els.lineItems.querySelectorAll('tr')].forEach((row) => {
    const qty = Number(row.querySelector('.qty').value || 0);
    const rate = Number(row.querySelector('.rate').value || 0);
    const rowPaid = Number(row.querySelector('.paid').value || 0);
    const amount = qty * rate;
    running += amount - rowPaid;
    subtotal += amount;
    paid += rowPaid;
    row.querySelector('.amount').value = amount;
    row.querySelector('.balance').value = running;
  });

  els.subtotal.textContent = money(subtotal);
  els.paidTotal.textContent = money(paid);
  els.balanceTotal.textContent = money(running);
  return { subtotal, paid, balance: running, oldBalance };
}

function draftFromForm() {
  return {
    hotelName: getCurrentHotel(),
    billDate: els.billDate.value,
    oldBalance: Number(els.oldBalance.value || 0),
    rows: readRows(),
    totals: updateSummary(),
    updatedAt: new Date().toISOString(),
  };
}

function saveDraft() {
  const hotel = getCurrentHotel();
  state.drafts[hotel] = draftFromForm();
  saveJson(DRAFT_KEY, state.drafts);
}

function restoreDraft(hotel) {
  const draft = state.drafts[hotel];
  els.lineItems.innerHTML = '';
  els.billDate.value = draft?.billDate || today();
  els.hotelName.value = hotel;
  els.hotelSearch.value = hotel;
  els.selectedHotelLabel.textContent = hotel;
  els.oldBalance.value = String(draft?.oldBalance ?? state.balances[hotel] ?? 0);
  els.oldBalance.readOnly = true;
  els.editOldBalanceBtn.hidden = false;
  els.saveOldBalanceBtn.hidden = true;
  els.cancelOldBalanceBtn.hidden = true;

  if (draft?.rows?.length) {
    draft.rows.forEach((row) => addRow(row));
  } else {
    addRow();
  }

  updateSheetNumbers();
  updateSummary();
}

function clearDraft() {
  const hotel = getCurrentHotel();
  delete state.drafts[hotel];
  saveJson(DRAFT_KEY, state.drafts);
  restoreDraft(hotel);
}

function editOldBalance() {
  state.balanceBeforeEdit = Number(els.oldBalance.value || 0);
  els.oldBalance.readOnly = false;
  els.oldBalance.focus();
  els.editOldBalanceBtn.hidden = true;
  els.saveOldBalanceBtn.hidden = false;
  els.cancelOldBalanceBtn.hidden = false;
}

function saveOldBalance() {
  const value = Number(els.oldBalance.value);
  if (!Number.isFinite(value) || value < 0) {
    alert('Enter a valid non-negative Old Balance.');
    return;
  }
  const hotel = getCurrentHotel();
  state.balances[hotel] = value;
  els.oldBalance.value = String(value);
  els.oldBalance.readOnly = true;
  els.editOldBalanceBtn.hidden = false;
  els.saveOldBalanceBtn.hidden = true;
  els.cancelOldBalanceBtn.hidden = true;
  saveJson(BALANCE_KEY, state.balances);
  saveDraft();
  updateSummary();
  renderSelectedHotelHistory(hotel);
}

function cancelOldBalance() {
  els.oldBalance.value = String(state.balanceBeforeEdit);
  els.oldBalance.readOnly = true;
  els.editOldBalanceBtn.hidden = false;
  els.saveOldBalanceBtn.hidden = true;
  els.cancelOldBalanceBtn.hidden = true;
  updateSummary();
}

function resetRows() {
  els.lineItems.innerHTML = '';
  addRow();
  updateSheetNumbers();
  updateSummary();
  saveDraft();
}

function getOrdersForHotel(hotel) {
  return state.orders
    .filter(o => (o.hotelName || '').trim() === (hotel || '').trim())
    .slice()
    .sort((a, b) => new Date(b.savedAt || b.updatedAt || 0) - new Date(a.savedAt || a.updatedAt || 0));
}

function renderSelectedHotelHistory(hotel) {
  const selectedHotel = (hotel || getCurrentHotel() || HOTEL_NAMES[0]).trim();
  const orders = getOrdersForHotel(selectedHotel);
  const latest = orders[0];
  const latestBalance = Number(state.balances[selectedHotel] ?? latest?.oldBalance ?? 0);
  const totalBalance = orders.reduce((sum, order) => sum + Number(order.totals?.balance || order.totals?.subtotal || 0), 0);

  els.hotelHistorySummary.innerHTML = `
    <div><span>Hotel</span><strong>${selectedHotel}</strong></div>
    <div><span>Saved Bills</span><strong>${orders.length}</strong></div>
    <div><span>Old Balance</span><strong>${money(latestBalance)}</strong></div>
    <div><span>Total History</span><strong>${money(totalBalance)}</strong></div>
  `;

  if (!orders.length) {
    els.hotelHistoryList.innerHTML = '<div class="empty-state">No saved bills for this hotel yet.</div>';
    return;
  }

  els.hotelHistoryList.innerHTML = '';
  orders.forEach((order) => {
    const rowsHtml = (order.rows || []).map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${r.item || ''}</td>
        <td>${r.qty ?? ''}</td>
        <td>${money(r.rate ?? 0)}</td>
        <td>${money(r.amount ?? 0)}</td>
        <td>${money(r.paid ?? 0)}</td>
        <td>${money(r.balance ?? 0)}</td>
      </tr>
    `).join('');

    const card = document.createElement('article');
    card.className = 'history-card';
    card.innerHTML = `
      <div class="history-card-head">
        <div>
          <strong>${order.billDate || 'No date'}</strong>
          <div class="hotel-bill-meta">Saved ${order.savedAt ? new Date(order.savedAt).toLocaleString('en-IN') : 'now'}</div>
        </div>
        <div class="history-card-total">${money(order.totals?.balance || order.totals?.subtotal || 0)}</div>
      </div>
      <div class="history-card-actions">
        <button class="btn btn-small restore-order" data-id="${order.id}">Open</button>
        <button class="btn btn-small btn-primary edit-order" data-id="${order.id}">Edit</button>
        <button class="btn btn-small btn-ghost delete-order" data-id="${order.id}">Delete</button>
      </div>
      <div class="history-table-wrap">
        <table class="details-table">
          <thead><tr><th>#</th><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th><th>Paid</th><th>Balance</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;
    els.hotelHistoryList.appendChild(card);
  });

  els.hotelHistoryList.querySelectorAll('.restore-order').forEach((btn) => {
    btn.addEventListener('click', (event) => loadOrder(event.currentTarget.dataset.id));
  });
  els.hotelHistoryList.querySelectorAll('.edit-order').forEach((btn) => {
    btn.addEventListener('click', (event) => loadOrder(event.currentTarget.dataset.id, true));
  });
  els.hotelHistoryList.querySelectorAll('.delete-order').forEach((btn) => {
    btn.addEventListener('click', (event) => deleteOrder(event.currentTarget.dataset.id));
  });
}

function saveOrder() {
  const order = draftFromForm();
  if (!order.hotelName) {
    alert('Please choose a hotel name first.');
    return;
  }
  const wasEditing = Boolean(state.editingOrderId);
  order.id = state.editingOrderId || crypto?.randomUUID?.() || `order-${Date.now()}`;
  order.savedAt = state.orders.find((entry) => entry.id === order.id)?.savedAt || new Date().toISOString();
  order.updatedAt = new Date().toISOString();
  if (state.editingOrderId) {
    const index = state.orders.findIndex((entry) => entry.id === state.editingOrderId);
    if (index >= 0) state.orders[index] = order;
    else state.orders.push(order);
  } else {
    state.orders.push(order);
  }
  saveJson(STORAGE_KEY, state.orders);
  state.balances[order.hotelName] = order.oldBalance;
  saveJson(BALANCE_KEY, state.balances);
  state.editingOrderId = null;
  els.saveBtn.textContent = 'Save bill';
  els.cancelEditBtn.hidden = true;
  renderSelectedHotelHistory(order.hotelName);
  $('orderCount').textContent = String(state.orders.length);
  saveDraft();
  alert(`${wasEditing ? 'Order updated' : 'Order saved'} for ${order.hotelName}.`);
}

function loadOrder(id, edit = false) {
  const order = state.orders.find((entry) => entry.id === id);
  if (!order) return;
  setActiveHotel(order.hotelName);
  els.billDate.value = order.billDate || today();
  els.oldBalance.value = String(order.oldBalance ?? state.balances[order.hotelName] ?? 0);
  els.lineItems.innerHTML = '';
  (order.rows || []).forEach((row) => addRow(row));
  updateSheetNumbers();
  updateSummary();
  state.editingOrderId = edit ? id : null;
  els.saveBtn.textContent = edit ? 'Update bill' : 'Save bill';
  els.cancelEditBtn.hidden = !edit;
  saveDraft();
}

function deleteOrder(id) {
  if (!window.confirm('Delete this saved bill? This cannot be undone.')) return;
  state.orders = state.orders.filter((entry) => entry.id !== id);
  saveJson(STORAGE_KEY, state.orders);
  renderSelectedHotelHistory(getCurrentHotel());
  $('orderCount').textContent = String(state.orders.length);
}

function cancelOrderEdit() {
  state.editingOrderId = null;
  els.saveBtn.textContent = 'Save bill';
  els.cancelEditBtn.hidden = true;
  restoreDraft(getCurrentHotel());
}

function exportCsv() {
  const data = draftFromForm();
  const rows = [
    ['Hotel', data.hotelName],
    ['Bill Date', data.billDate],
    [],
    ['#', 'Item', 'Qty', 'Rate', 'Amount', 'Paid', 'Balance'],
    ...data.rows.map((row, index) => [index + 1, row.item, row.qty, row.rate, row.amount, row.paid, row.balance]),
    [],
    ['Subtotal', data.totals.subtotal],
    ['Paid', data.totals.paid],
    ['Balance', data.totals.balance],
  ];

  const csv = rows
    .map((line) => line.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${data.hotelName || 'amaravathi-foods'}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function fillSample() {
  setActiveHotel(HOTEL_NAMES[0]);
  els.billDate.value = today();
  els.lineItems.innerHTML = '';
  [
    { item: 'PAROTA', qty: 4, paid: 100 },
    { item: 'PULKA', qty: 6, paid: 0 },
    { item: 'POORI', qty: 3, paid: 40 },
  ].forEach(addRow);
  updateSheetNumbers();
  updateSummary();
  saveDraft();
}

function bindEvents() {
  els.addRowBtn.addEventListener('click', () => { addRow(); saveDraft(); });
  els.sampleBtn.addEventListener('click', fillSample);
  els.saveBtn.addEventListener('click', saveOrder);
  els.cancelEditBtn.addEventListener('click', cancelOrderEdit);
  els.editOldBalanceBtn.addEventListener('click', editOldBalance);
  els.saveOldBalanceBtn.addEventListener('click', saveOldBalance);
  els.cancelOldBalanceBtn.addEventListener('click', cancelOldBalance);
  els.clearBtn.addEventListener('click', clearDraft);
  els.exportBtn.addEventListener('click', exportCsv);
  els.resetBtn.addEventListener('click', resetRows);
  els.hotelSearch.addEventListener('input', () => {
    const query = els.hotelSearch.value.trim();
    renderHotelOptions(query);
    const exact = HOTEL_NAMES.find((hotel) => hotel.toLocaleLowerCase() === query.toLocaleLowerCase());
    const partialMatches = HOTEL_NAMES.filter((hotel) => hotel.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    if (exact) setActiveHotel(exact);
    else if (query && partialMatches.length === 1) setActiveHotel(partialMatches[0]);
  });
  els.hotelSearch.addEventListener('focus', () => {
    renderHotelOptions('');
    els.searchFeedback.textContent = 'Select a hotel from the complete list, or type to filter.';
  });
  els.hotelSearch.addEventListener('click', () => {
    renderHotelOptions('');
  });
  els.hotelSearch.addEventListener('change', () => {
    if (!setActiveHotel(els.hotelSearch.value)) {
      els.searchFeedback.textContent = 'Hotel not found. Choose one from the list.';
      els.hotelSearch.value = state.activeHotel;
    }
  });

  ['input', 'change'].forEach((evt) => {
    [els.billDate].forEach((field) => {
      field.addEventListener(evt, saveDraft);
    });
  });

  window.addEventListener('beforeunload', saveDraft);
}

function renderCounts() {
  els.hotelCount.textContent = String(HOTEL_NAMES.length);
  els.itemCount.textContent = String(ITEM_OPTIONS.length);
}

async function init() {
  const sharedSnapshot = await loadSharedSnapshot();
  if (sharedSnapshot) {
    state.orders = sharedSnapshot.orders;
    state.drafts = sharedSnapshot.drafts && typeof sharedSnapshot.drafts === 'object' ? sharedSnapshot.drafts : {};
    state.balances = sharedSnapshot.balances && typeof sharedSnapshot.balances === 'object' ? sharedSnapshot.balances : {};
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.orders));
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state.drafts));
    localStorage.setItem(BALANCE_KEY, JSON.stringify(state.balances));
    setSyncStatus('Shared data loaded', 'ok');
  }
  renderCounts();
  renderHotelList();
  bindEvents();
  els.billDate.value = today();
  setActiveHotel(HOTEL_NAMES[0]);
  renderSelectedHotelHistory(HOTEL_NAMES[0]);
  updateSheetNumbers();
  const editId = new URLSearchParams(window.location.search).get('edit');
  if (editId) loadOrder(editId, true);
}

init();
