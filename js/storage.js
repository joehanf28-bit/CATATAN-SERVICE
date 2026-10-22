/**
 * storage.js - Pengelola Data, Sinkronisasi Google Sheets & Antrean Offline
 * Catatan Servis
 */

const STORAGE_KEYS = {
  CONFIG: 'cs_config',
  ENTRIES_PREFIX: 'cs_entries_',
  QUEUE: 'cs_offline_queue',
  ACCENT: 'cs_accent_color',
  SHOW_CHARTS_MOBILE: 'cs_show_charts_mobile',
  INITIALIZED_DEMO: 'cs_demo_initialized'
};

const DEFAULT_CONFIG = {
  scriptUrl: '',
  secretToken: '',
  accentColor: 'blue',
  showChartsMobile: false
};

const ACCENT_COLORS = {
  blue: { light: '#007AFF', dark: '#0A84FF', name: 'Biru' },
  green: { light: '#34C759', dark: '#30D158', name: 'Hijau' },
  orange: { light: '#FF9500', dark: '#FF9F0A', name: 'Oranye' },
  red: { light: '#FF3B30', dark: '#FF453A', name: 'Merah' },
  purple: { light: '#AF52DE', dark: '#BF5AF2', name: 'Ungu' },
  pink: { light: '#FF2D55', dark: '#FF375F', name: 'Merah Muda' }
};

class StorageService {
  constructor() {
    this.config = this.loadConfig();
    this.syncListeners = [];
    this.syncStatus = 'synced'; // 'synced', 'syncing', 'pending', 'offline'
    this.isOnline = navigator.onLine;

    // Listen to network changes
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.syncPendingQueue();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.updateSyncStatus();
    });

    // Cek antrean saat pertama kali dibuka
    this.checkPendingQueue();
  }

  // --- Konfigurasi ---
  loadConfig() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CONFIG);
      return saved ? { ...DEFAULT_CONFIG, ...JSON.parse(saved) } : { ...DEFAULT_CONFIG };
    } catch (e) {
      return { ...DEFAULT_CONFIG };
    }
  }

  saveConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(this.config));
    this.applyAccentColor(this.config.accentColor);
    return this.config;
  }

  applyAccentColor(colorName) {
    const selected = ACCENT_COLORS[colorName] || ACCENT_COLORS.blue;
    document.documentElement.style.setProperty('--ios-accent', selected.light);
    document.documentElement.style.setProperty('--ios-accent-dark', selected.dark);
    document.documentElement.setAttribute('data-accent', colorName);
  }

  // --- Status Sinkronisasi ---
  onSyncChange(fn) {
    this.syncListeners.push(fn);
    fn(this.getSyncStatusInfo());
  }

  getPendingQueue() {
    try {
      const q = localStorage.getItem(STORAGE_KEYS.QUEUE);
      return q ? JSON.parse(q) : [];
    } catch (e) {
      return [];
    }
  }

  savePendingQueue(queue) {
    localStorage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify(queue));
    this.updateSyncStatus();
  }

  getSyncStatusInfo() {
    const queue = this.getPendingQueue();
    const count = queue.length;

    if (!this.isOnline) {
      return { status: 'offline', text: count > 0 ? `Offline (${count} antrean)` : 'Offline', count };
    }
    if (this.syncStatus === 'syncing') {
      return { status: 'syncing', text: 'Menyinkronkan...', count };
    }
    if (count > 0) {
      return { status: 'pending', text: `Belum terkirim (${count})`, count };
    }
    return { status: 'synced', text: 'Tersinkron', count: 0 };
  }

  updateSyncStatus(newStatus) {
    if (newStatus) this.syncStatus = newStatus;
    const info = this.getSyncStatusInfo();
    this.syncListeners.forEach((fn) => {
      try { fn(info); } catch (e) {}
    });
  }

  // --- Helper Bulan & Tanggal ---
  getCurrentMonthString() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  getMonthKey(month) {
    return `${STORAGE_KEYS.ENTRIES_PREFIX}${month || this.getCurrentMonthString()}`;
  }

  // --- Entri Data Lokal ---
  getEntries(month) {
    const targetMonth = month || this.getCurrentMonthString();
    try {
      const saved = localStorage.getItem(this.getMonthKey(targetMonth));
      if (!saved) return [];
      const entries = JSON.parse(saved);
      return entries.sort((a, b) => b.tanggal.localeCompare(a.tanggal));
    } catch (e) {
      return [];
    }
  }

  saveLocalEntries(month, entries) {
    const targetMonth = month || this.getCurrentMonthString();
    localStorage.setItem(this.getMonthKey(targetMonth), JSON.stringify(entries));
  }

  // --- Simpan Entri Baru atau Edit ---
  async saveEntry(entry) {
    // Validasi dan normalisasi profit
    const modal = Number(entry.modal) || 0;
    const hargaJual = Number(entry.hargaJual) || 0;
    const profit = hargaJual - modal;

    const normalizedEntry = {
      id: entry.id || `srv_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      tanggal: entry.tanggal || new Date().toISOString().split('T')[0],
      namaUser: (entry.namaUser || '').trim(),
      perbaikan: entry.perbaikan || (entry.rincian ? entry.rincian.map(r => r.nama).join('\n') : ''),
      modal,
      hargaJual,
      profit,
      rincian: entry.rincian || []
    };

    const month = normalizedEntry.tanggal.substring(0, 7);
    const entries = this.getEntries(month);
    const existingIndex = entries.findIndex(e => e.id === normalizedEntry.id);

    if (existingIndex >= 0) {
      entries[existingIndex] = normalizedEntry;
    } else {
      entries.unshift(normalizedEntry);
    }

    this.saveLocalEntries(month, entries);

    // Kirim ke Google Apps Script jika URL terisi dan online
    if (this.config.scriptUrl && this.isOnline) {
      this.sendSaveToSheet(normalizedEntry, month).catch(() => {
        this.enqueueOperation({ type: 'save', entry: normalizedEntry, month });
      });
    } else if (this.config.scriptUrl) {
      this.enqueueOperation({ type: 'save', entry: normalizedEntry, month });
    }

    return normalizedEntry;
  }

  // --- Hapus Entri ---
  async deleteEntry(id, month) {
    const targetMonth = month || this.getCurrentMonthString();
    const entries = this.getEntries(targetMonth);
    const updated = entries.filter(e => e.id !== id);
    this.saveLocalEntries(targetMonth, updated);

    if (this.config.scriptUrl && this.isOnline) {
      this.sendDeleteToSheet(id, targetMonth).catch(() => {
        this.enqueueOperation({ type: 'delete', id, month: targetMonth });
      });
    } else if (this.config.scriptUrl) {
      this.enqueueOperation({ type: 'delete', id, month: targetMonth });
    }

    return true;
  }

  // --- Antrean Offline ---
  enqueueOperation(op) {
    const queue = this.getPendingQueue();
    // Jika ada update pada id yang sama, gantikan operasi sebelumnya
    const existingIdx = queue.findIndex(item => item.entry && item.entry.id === op.id);
    if (existingIdx >= 0) {
      queue[existingIdx] = op;
    } else {
      queue.push({ ...op, queuedAt: Date.now() });
    }
    this.savePendingQueue(queue);
  }

  checkPendingQueue() {
    const queue = this.getPendingQueue();
    if (queue.length > 0 && this.isOnline && this.config.scriptUrl) {
      this.syncPendingQueue();
    } else {
      this.updateSyncStatus();
    }
  }

  async syncPendingQueue() {
    const queue = this.getPendingQueue();
    if (queue.length === 0 || !this.config.scriptUrl || !this.isOnline) {
      this.updateSyncStatus('synced');
      return;
    }

    this.updateSyncStatus('syncing');

    try {
      const payload = {
        action: 'batchSync',
        token: this.config.secretToken,
        queue: queue
      };

      const response = await fetch(this.config.scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });

      const res = await response.json();
      if (res.success) {
        // Kosongkan antrean
        this.savePendingQueue([]);
        this.updateSyncStatus('synced');
      } else {
        throw new Error(res.message || 'Gagal sinkronisasi');
      }
    } catch (err) {
      console.warn('Gagal sync antrean:', err);
      this.updateSyncStatus('pending');
    }
  }

  // --- Komunikasi Langsung dengan Google Apps Script ---
  async sendSaveToSheet(entry, month) {
    this.updateSyncStatus('syncing');
    try {
      const response = await fetch(this.config.scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'saveEntry',
          token: this.config.secretToken,
          entry: entry,
          month: month
        })
      });
      const res = await response.json();
      if (!res.success) throw new Error(res.message);
      this.updateSyncStatus('synced');
      return res;
    } catch (err) {
      this.updateSyncStatus('pending');
      throw err;
    }
  }

  async sendDeleteToSheet(id, month) {
    this.updateSyncStatus('syncing');
    try {
      const response = await fetch(this.config.scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'deleteEntry',
          token: this.config.secretToken,
          id: id,
          month: month
        })
      });
      const res = await response.json();
      if (!res.success) throw new Error(res.message);
      this.updateSyncStatus('synced');
      return res;
    } catch (err) {
      this.updateSyncStatus('pending');
      throw err;
    }
  }

  async fetchEntriesFromSheet(month) {
    if (!this.config.scriptUrl) return null;
    try {
      const url = new URL(this.config.scriptUrl);
      url.searchParams.set('action', 'getEntries');
      url.searchParams.set('token', this.config.secretToken);
      url.searchParams.set('month', month || this.getCurrentMonthString());

      const res = await fetch(url.toString(), { method: 'GET' });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        // Perbarui cache lokal
        this.saveLocalEntries(month || this.getCurrentMonthString(), data.data);
        return data.data;
      }
      return null;
    } catch (err) {
      console.warn('Gagal fetch dari Sheets:', err);
      return null;
    }
  }

  async testConnection(url, token) {
    const targetUrl = url || this.config.scriptUrl;
    const targetToken = token || this.config.secretToken;

    if (!targetUrl) throw new Error('URL Apps Script belum diisi!');

    const testUrl = new URL(targetUrl);
    testUrl.searchParams.set('action', 'test');
    testUrl.searchParams.set('token', targetToken);

    const res = await fetch(testUrl.toString(), { method: 'GET' });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.message || 'Koneksi gagal atau token tidak cocok!');
    }
    return data.message || 'Koneksi berhasil!';
  }

  // --- Autocomplete Data ---
  getAutocompleteData() {
    const names = new Set();
    const repairs = new Set();

    // Scan all keys in localStorage for entries
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_KEYS.ENTRIES_PREFIX)) {
        try {
          const list = JSON.parse(localStorage.getItem(key)) || [];
          list.forEach(item => {
            if (item.namaUser) names.add(item.namaUser.trim());
            if (Array.isArray(item.rincian)) {
              item.rincian.forEach(r => {
                if (r.nama) repairs.add(r.nama.trim());
              });
            } else if (item.perbaikan) {
              item.perbaikan.split('\n').forEach(p => {
                if (p.trim()) repairs.add(p.trim());
              });
            }
          });
        } catch (e) {}
      }
    }

    return {
      names: Array.from(names).sort(),
      repairs: Array.from(repairs).sort()
    };
  }

  // --- Ekspor CSV ---
  exportToCSV(month) {
    const targetMonth = month || this.getCurrentMonthString();
    const entries = this.getEntries(targetMonth);

    if (entries.length === 0) {
      throw new Error(`Tidak ada data transaksi pada bulan ${targetMonth}`);
    }

    const headers = ['Tanggal', 'Nama User', 'Perbaikan', 'Modal', 'Harga Jual', 'Profit'];
    const rows = entries.map(e => [
      e.tanggal,
      `"${(e.namaUser || '').replace(/"/g, '""')}"`,
      `"${(e.perbaikan || '').replace(/"/g, '""')}"`,
      e.modal || 0,
      e.hargaJual || 0,
      e.profit || 0
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Catatan_Servis_${targetMonth}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // --- Demo Data ---
  initDemoDataIfEmpty() {
    const currentMonth = this.getCurrentMonthString();
    const currentEntries = this.getEntries(currentMonth);

    // Inisialisasi jika benar-benar belum ada data bulan ini dan belum pernah diinisialisasi
    if (currentEntries.length === 0 && !localStorage.getItem(STORAGE_KEYS.INITIALIZED_DEMO)) {
      this.loadDemoData();
      localStorage.setItem(STORAGE_KEYS.INITIALIZED_DEMO, 'true');
    }
  }

  loadDemoData() {
    const currentMonth = this.getCurrentMonthString();
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');

    // Buat beberapa tanggal dalam bulan berjalan
    const formatDate = (day) => `${year}-${month}-${String(day).padStart(2, '0')}`;

    const demoEntries = [
      {
        id: `demo_${Date.now()}_1`,
        tanggal: formatDate(Math.min(today.getDate(), 20)),
        namaUser: 'Ahmad Faisal',
        perbaikan: 'Ganti LCD OLED iPhone 11\nPasang Tempered Glass',
        modal: 320000,
        hargaJual: 550000,
        profit: 230000,
        rincian: [
          { nama: 'Ganti LCD OLED iPhone 11', modal: 310000, hargaJual: 520000 },
          { nama: 'Pasang Tempered Glass', modal: 10000, hargaJual: 30000 }
        ]
      },
      {
        id: `demo_${Date.now()}_2`,
        tanggal: formatDate(Math.min(today.getDate(), 18)),
        namaUser: 'Budi Santoso',
        perbaikan: 'Ganti Baterai Original Samsung A52',
        modal: 140000,
        hargaJual: 270000,
        profit: 130000,
        rincian: [
          { nama: 'Ganti Baterai Original Samsung A52', modal: 140000, hargaJual: 270000 }
        ]
      },
      {
        id: `demo_${Date.now()}_3`,
        tanggal: formatDate(Math.min(today.getDate(), 15)),
        namaUser: 'Dewi Lestari',
        perbaikan: 'Service Konektor Cas Xiaomi Redmi Note 10\nCleaning Speaker Atas',
        modal: 45000,
        hargaJual: 150000,
        profit: 105000,
        rincian: [
          { nama: 'Service Konektor Cas Xiaomi Redmi Note 10', modal: 35000, hargaJual: 120000 },
          { nama: 'Cleaning Speaker Atas', modal: 10000, hargaJual: 30000 }
        ]
      },
      {
        id: `demo_${Date.now()}_4`,
        tanggal: formatDate(Math.min(today.getDate(), 12)),
        namaUser: 'Rian Pratama',
        perbaikan: 'Flash Ulang & Bypass Akun Oppo Reno 5',
        modal: 0,
        hargaJual: 100000,
        profit: 100000,
        rincian: [
          { nama: 'Flash Ulang & Bypass Akun Oppo Reno 5', modal: 0, hargaJual: 100000 }
        ]
      },
      {
        id: `demo_${Date.now()}_5`,
        tanggal: formatDate(Math.min(today.getDate(), 8)),
        namaUser: 'Siti Rahma',
        perbaikan: 'Ganti Flexible On/Off Vivo Y20',
        modal: 25000,
        hargaJual: 90000,
        profit: 65000,
        rincian: [
          { nama: 'Ganti Flexible On/Off Vivo Y20', modal: 25000, hargaJual: 90000 }
        ]
      }
    ];

    this.saveLocalEntries(currentMonth, demoEntries);
    return demoEntries;
  }

  clearDemoData() {
    const currentMonth = this.getCurrentMonthString();
    localStorage.removeItem(this.getMonthKey(currentMonth));
    localStorage.removeItem(STORAGE_KEYS.INITIALIZED_DEMO);
  }

  clearAllData() {
    // Bersihkan semua entries dan antrean
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith(STORAGE_KEYS.ENTRIES_PREFIX) || k === STORAGE_KEYS.QUEUE || k === STORAGE_KEYS.INITIALIZED_DEMO)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  }
}

window.storageService = new StorageService();
