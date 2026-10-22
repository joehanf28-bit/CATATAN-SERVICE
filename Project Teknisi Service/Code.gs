/**
 * Catatan Servis - Google Apps Script Backend (Code.gs)
 * ----------------------------------------------------
 * Web App backend untuk aplikasi PWA "Catatan Servis".
 * Menyimpan data pekerjaan teknisi servis HP ke Google Sheets.
 * 
 * Panduan Deployment:
 * 1. Buat Google Spreadsheet baru di https://sheets.new
 * 2. Beri nama spreadsheet, contoh: "Database Catatan Servis"
 * 3. Buka menu: Ekstensi > Apps Script (Extensions > Apps Script)
 * 4. Hapus kode default di Code.gs dan tempel SELURUH isi file ini.
 * 5. Ubah variabel SECRET_TOKEN di bawah ini sesuai keinginan Anda (contoh: "ServisTeknisi2026!").
 * 6. Klik tombol "Simpan" (ikon disket / Ctrl+S).
 * 7. Klik tombol "Deploy" di kanan atas > "Deployment baru" (New deployment).
 * 8. Klik ikon roda gigi > pilih jenis "Aplikasi Web" (Web app).
 * 9. Konfigurasi:
 *    - Deskripsi: Catatan Servis API v1
 *    - Jalankan sebagai: Saya (email Anda)
 *    - Yang memiliki akses: Siapa saja (Anyone)
 * 10. Klik "Deploy". Jika diminta otorisasi izin akun Google, klik "Tinjau izin",
 *     pilih akun Anda, klik "Lanjutan" (Advanced), lalu klik "Buka Catatan Servis (tidak aman)".
 * 11. Salin "URL Aplikasi Web" (Web App URL) yang berakhiran `/exec`.
 * 12. Buka PWA Catatan Servis > Menu Pengaturan > Tempel URL dan Token Rahasia Anda.
 */

// GANTI TOKEN INI DENGAN KATA KUNCI RAHASIA ANDA SENDIRI:
var SECRET_TOKEN = "ServisAman2026";

/**
 * Handler HTTP GET: Digunakan untuk pengecekan tes koneksi dan membaca data bulan tertentu.
 */
function doGet(e) {
  try {
    var params = e ? e.parameter : {};
    var token = params.token;
    var action = params.action;
    
    // Jika URL dibuka langsung di browser tanpa token atau parameter
    if (!token && !action) {
      return ContentService.createTextOutput(
        "✅ Backend Google Apps Script 'Catatan Servis' berhasil aktif!\n\n" +
        "Catatan:\n" +
        "Link ini adalah URL API Backend (penghubung ke Google Sheets), BUKAN tampilan aplikasi web.\n\n" +
        "Langkah selanjutnya:\n" +
        "1. Salin URL di address bar browser Anda ini.\n" +
        "2. Buka aplikasi web Catatan Servis (file index.html atau link hosting Anda).\n" +
        "3. Masuk ke menu 'Pengaturan'.\n" +
        "4. Tempelkan URL ini dan ketikkan Token Rahasia yang telah Anda tentukan di Code.gs.\n" +
        "5. Klik 'Simpan Pengaturan' lalu klik 'Uji Koneksi'."
      ).setMimeType(ContentService.MimeType.TEXT);
    }
    
    if (token !== SECRET_TOKEN) {
      return responseJSON({ 
        success: false, 
        message: "Token rahasia tidak valid atau salah! Pastikan token di menu Pengaturan web sama dengan variabel SECRET_TOKEN di Code.gs." 
      });
    }
    
    if (action === "test") {
      return responseJSON({
        success: true,
        message: "Koneksi berhasil! Terhubung ke Google Spreadsheet: " + SpreadsheetApp.getActiveSpreadsheet().getName()
      });
    }
    
    if (action === "getMonths") {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheets = ss.getSheets();
      var monthNames = [];
      for (var i = 0; i < sheets.length; i++) {
        var name = sheets[i].getName();
        // Cek format nama YYYY-MM
        if (/^\d{4}-\d{2}$/.test(name)) {
          monthNames.push(name);
        }
      }
      monthNames.sort().reverse();
      return responseJSON({ success: true, months: monthNames });
    }
    
    if (action === "getEntries") {
      var month = params.month || getCurrentMonthString();
      var entries = loadEntriesFromMonth(month);
      return responseJSON({ success: true, month: month, data: entries });
    }
    
    return responseJSON({ success: false, message: "Aksi GET tidak dikenali: " + action });
  } catch (err) {
    return responseJSON({ success: false, error: err.toString() });
  }
}

/**
 * Handler HTTP POST: Digunakan untuk menyimpan, mengedit, menghapus, atau sinkronisasi batch.
 */
function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      try {
        body = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        // Fallback jika dikirim x-www-form-urlencoded
        body = e.parameter || {};
      }
    }
    
    var token = body.token;
    if (token !== SECRET_TOKEN) {
      return responseJSON({ success: false, message: "Token rahasia tidak valid atau salah!" });
    }
    
    var action = body.action;
    
    if (action === "test") {
      return responseJSON({
        success: true,
        message: "Koneksi POST berhasil! Terhubung ke Google Sheets."
      });
    }
    
    if (action === "saveEntry") {
      var entry = body.entry;
      if (!entry || !entry.tanggal) {
        return responseJSON({ success: false, message: "Data entri tidak lengkap!" });
      }
      var savedId = saveOrUpdateEntry(entry);
      return responseJSON({ success: true, message: "Entri berhasil disimpan", id: savedId });
    }
    
    if (action === "deleteEntry") {
      var idToDelete = body.id;
      var entryMonth = body.month || getCurrentMonthString();
      var deleted = deleteEntryById(entryMonth, idToDelete);
      return responseJSON({ success: deleted, message: deleted ? "Entri berhasil dihapus" : "Entri tidak ditemukan" });
    }
    
    if (action === "batchSync") {
      // Sinkronisasi antrean transaksi offline sekaligus
      var queue = body.queue || [];
      var results = [];
      for (var q = 0; q < queue.length; q++) {
        var op = queue[q];
        try {
          if (op.type === "save") {
            var newId = saveOrUpdateEntry(op.entry);
            results.push({ tempId: op.entry.id, id: newId, status: "ok" });
          } else if (op.type === "delete") {
            deleteEntryById(op.month, op.id);
            results.push({ id: op.id, status: "deleted" });
          }
        } catch (itemErr) {
          results.push({ id: op.id, status: "error", error: itemErr.toString() });
        }
      }
      return responseJSON({ success: true, results: results });
    }
    
    return responseJSON({ success: false, message: "Aksi POST tidak dikenali: " + action });
  } catch (err) {
    return responseJSON({ success: false, error: err.toString() });
  }
}

/**
 * Format output JSON dengan header CORS yang tepat
 */
function responseJSON(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Mengambil nama bulan berjalan format YYYY-MM
 */
function getCurrentMonthString() {
  var d = new Date();
  var year = d.getFullYear();
  var month = ("0" + (d.getMonth() + 1)).slice(-2);
  return year + "-" + month;
}

/**
 * Mengambil atau membuat sheet tab untuk bulan tertentu (contoh: "2026-10")
 */
function getOrCreateMonthSheet(monthStr) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(monthStr);
  
  if (!sheet) {
    sheet = ss.insertSheet(monthStr, 0);
    
    // Tulis Header Kolom
    // 1: Tanggal, 2: Nama User, 3: Perbaikan, 4: Modal, 5: Harga Jual, 6: Profit, 7: Rincian (JSON), 8: ID
    var headers = [["Tanggal", "Nama User", "Perbaikan", "Modal", "Harga Jual", "Profit", "Rincian", "ID"]];
    var headerRange = sheet.getRange(1, 1, 1, 8);
    headerRange.setValues(headers);
    
    // Format Header bergaya modern iOS / Apple clean
    headerRange.setBackground("#F2F2F7");
    headerRange.setFontColor("#1C1C1E");
    headerRange.setFontWeight("bold");
    headerRange.setHorizontalAlignment("center");
    sheet.setFrozenRows(1);
    
    // Format mata uang untuk kolom Modal, Harga Jual, Profit (Kolom D, E, F)
    sheet.getRange("D2:F1000").setNumberFormat('"Rp"#,##0');
    
    // Sembunyikan kolom Rincian (kolom 7) dan ID (kolom 8) agar pengguna tidak bingung
    sheet.hideColumns(7, 2);
    
    // Atur lebar default kolom agar rapi
    sheet.setColumnWidth(1, 110); // Tanggal
    sheet.setColumnWidth(2, 160); // Nama User
    sheet.setColumnWidth(3, 220); // Perbaikan
    sheet.setColumnWidth(4, 120); // Modal
    sheet.setColumnWidth(5, 130); // Harga Jual
    sheet.setColumnWidth(6, 130); // Profit
  }
  return sheet;
}

/**
 * Menyimpan data entri baru atau memperbarui entri yang sudah ada berdasarkan ID
 */
function saveOrUpdateEntry(entry) {
  // Tentukan bulan dari tanggal entri (format YYYY-MM-DD)
  var monthStr = entry.tanggal ? entry.tanggal.substring(0, 7) : getCurrentMonthString();
  var sheet = getOrCreateMonthSheet(monthStr);
  
  var id = entry.id || ("srv_" + new Date().getTime() + "_" + Math.floor(Math.random() * 1000));
  var rincianJSON = typeof entry.rincian === "string" ? entry.rincian : JSON.stringify(entry.rincian || []);
  
  // Format perbaikan teks dipisah baris baru dalam satu sel
  var perbaikanText = "";
  if (Array.isArray(entry.rincian) && entry.rincian.length > 0) {
    perbaikanText = entry.rincian.map(function(item) {
      return item.nama || item.perbaikan || "";
    }).filter(Boolean).join("\n");
  } else {
    perbaikanText = entry.perbaikan || "";
  }
  
  var modal = Number(entry.modal) || 0;
  var hargaJual = Number(entry.hargaJual) || 0;
  
  // Cek apakah entri sudah ada di sheet (kolom H / 8 adalah ID)
  var lastRow = sheet.getLastRow();
  var existingRowIndex = -1;
  
  if (lastRow > 1) {
    var ids = sheet.getRange(2, 8, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(id)) {
        existingRowIndex = i + 2; // baris aktual di sheets
        break;
      }
    }
  }
  
  var targetRow = existingRowIndex > 0 ? existingRowIndex : (lastRow + 1);
  var profitFormula = "=E" + targetRow + "-D" + targetRow;
  
  var rowValues = [
    entry.tanggal,
    entry.namaUser,
    perbaikanText,
    modal,
    hargaJual,
    profitFormula,
    rincianJSON,
    id
  ];
  
  sheet.getRange(targetRow, 1, 1, 8).setValues([rowValues]);
  
  // Bungkus teks (wrap text) di kolom perbaikan agar baris baru tampil rapi
  sheet.getRange(targetRow, 3).setWrap(true);
  
  return id;
}

/**
 * Menghapus entri berdasarkan ID
 */
function deleteEntryById(monthStr, id) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(monthStr);
  if (!sheet) return false;
  
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return false;
  
  var ids = sheet.getRange(2, 8, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      sheet.deleteRow(i + 2);
      return true;
    }
  }
  return false;
}

/**
 * Membaca semua entri dari sheet bulan tertentu
 */
function loadEntriesFromMonth(monthStr) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(monthStr);
  if (!sheet) return [];
  
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  
  // Baca semua data dari baris 2
  var data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  var entries = [];
  
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var tanggal = row[0];
    if (tanggal instanceof Date) {
      tanggal = Utilities.formatDate(tanggal, Session.getScriptTimeZone() || "GMT+7", "yyyy-MM-dd");
    }
    
    var rincian = [];
    try {
      if (row[6]) {
        rincian = JSON.parse(row[6]);
      }
    } catch(e) {
      rincian = [];
    }
    
    entries.push({
      id: String(row[7] || ("row_" + (i + 2))),
      tanggal: String(tanggal),
      namaUser: String(row[1] || ""),
      perbaikan: String(row[2] || ""),
      modal: Number(row[3]) || 0,
      hargaJual: Number(row[4]) || 0,
      profit: Number(row[5]) || 0,
      rincian: rincian
    });
  }
  
  // Urutkan tanggal menurun (terbaru di atas)
  entries.sort(function(a, b) {
    return b.tanggal.localeCompare(a.tanggal);
  });
  
  return entries;
}
