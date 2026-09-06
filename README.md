# Amaravathi Foods

Run `npm start`, then open `http://localhost:3000` in a browser.

You can also open `index.html` directly if you do not need the local server.

If port `3000` is already busy, the server will try the next available port and print the URL. You can also run `node index.js`.

## Records and shared data

- When running with `npm start`, the Node server is the shared source of truth and writes files into `data/`:
  - `data/snapshot.json`
  - `data/orders.json`
  - `data/orders.csv`
  - `data/bills/*.csv`
  - `data/bills/*.json`
- Open `records.html` or click `Open records` to view and edit saved bills in an Excel-style table.
- Browser storage is retained only as an offline fallback; it is not used as the shared database.

## Google Drive sync

The Google Drive folder link alone cannot save files. The website must post data to a deployed Google Apps Script Web App. If `config.js` has `driveSyncUrl: ''`, Drive sync is not connected yet and the folder will stay empty.

To sync every saved bill to Drive:

1. Open Google Apps Script.
2. Paste the code from `google-drive-apps-script.gs`.
3. Click `Deploy` > `New deployment`.
4. Choose `Web app`.
5. Set `Execute as` to `Me`.
6. Set access to `Anyone`.
7. Deploy and approve permissions.
8. Copy the Web App URL.
9. Paste that URL into `config.js` as `driveSyncUrl`.

The deployed Apps Script must be redeployed after updating `google-drive-apps-script.gs`. The app reads the shared snapshot through the script and writes changes back to the same Drive folder. Keep the web app access set to `Anyone` so other devices can read and write the same data.

The folder ID is already set to:

`1slg0oJDBrBks0tjU6qNSWOVpDZWz9CEd`

After setup, Drive will receive:

- `amaravathi-foods-snapshot.json`
- `amaravathi-foods-orders.json`
- `amaravathi-foods-orders.csv`
- one `.csv` file for each saved bill
- one `.json` file for each saved bill

## Features
- Workbook-style hotel selector
- Item price lookup and quantity totals
- Running balance per row
- Saved bill history in the shared server/Drive snapshot, with local fallback
- Per-hotel Old Balance editing and persistence
- Existing bill editing by stable record ID
- CSV export
