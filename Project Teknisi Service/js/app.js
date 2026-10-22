/**
 * app.js - Logika Antarmuka, Manajemen Form Dinamis, Pintasan Keyboard, dan PWA
 * Catatan Servis
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- Inisialisasi Service Worker untuk PWA Offline ---
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      console.log('[PWA] Service Worker terdaftar:', reg.scope);
    }).catch((err) => {
      console.warn('[PWA] Gagal mendaftarkan Service Worker:', err);
    });
  }

  // --- State Aplikasi ---
  const state = {
    currentView: 'home',
    activeMonth: window.storageService.getCurrentMonthString(),
    historyMonth: window.storageService.getCurrentMonthString(),
    searchQuery: '',
    editingId: null,
    showChartsMobile: localStorage.getItem('cs_show_charts_mobile') === 'true'
  };

  // Muat data demo jika baru pertama kali dipasang
  window.storageService.initDemoDataIfEmpty();

  // Terapkan warna aksen dari config tersimpan
  window.storageService.applyAccentColor(window.storageService.config.accentColor);

  // --- Formatters ---
  const rupiahFormatter = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });

  function formatRp(val) {
    return rupiahFormatter.format(Number(val) || 0);
  }

  function formatTanggalIndo(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const year = parts[0];
    const monthIndex = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
      'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'
    ];
    return `${day} ${months[monthIndex]} ${year}`;
  }

  function getMonthNameIndo(yearMonth) {
    const [y, m] = yearMonth.split('-');
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    return `${months[parseInt(m, 10) - 1]} ${y}`;
  }

  // --- Toast Notification ---
  let toastTimeout;
  function showToast(message) {
    const banner = document.getElementById('toastBanner');
    const msg = document.getElementById('toastMessage');
    if (!banner || !msg) return;

    msg.textContent = message;
    banner.classList.add('show');

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      banner.classList.remove('show');
    }, 2800);
  }

  // --- Manajemen Tampilan (Views) ---
  function switchView(viewName) {
    state.currentView = viewName;

    // Update active class on views
    document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(`view-${viewName}`);
    if (target) target.classList.add('active');

    // Update nav links
    document.querySelectorAll('.sidebar-link').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-view') === viewName);
    });
    document.querySelectorAll('.tab-bar-item').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-view') === viewName);
    });

    // Update Navbar Title
    const pageTitle = document.getElementById('pageTitle');
    if (viewName === 'home') {
      pageTitle.textContent = getMonthNameIndo(state.activeMonth);
      renderHomeData();
    } else if (viewName === 'history') {
      pageTitle.textContent = 'Riwayat Bulan';
      renderHistoryData();
    } else if (viewName === 'settings') {
      pageTitle.textContent = 'Pengaturan';
      loadSettingsUI();
    }
  }

  // --- Listeners Navigasi ---
  document.querySelectorAll('[data-view]').forEach(el => {
    el.addEventListener('click', () => {
      const view = el.getAttribute('data-view');
      if (view) switchView(view);
    });
  });

  // --- Status Sinkronisasi ---
  const syncBadge = document.getElementById('syncStatusBadge');
  const syncText = document.getElementById('syncStatusText');

  window.storageService.onSyncChange((info) => {
    syncBadge.className = `sync-badge ${info.status}`;
    syncText.textContent = info.text;
  });

  syncBadge.addEventListener('click', () => {
    if (!window.storageService.isOnline) {
      showToast('Perangkat sedang offline');
      return;
    }
    if (!window.storageService.config.scriptUrl) {
      showToast('URL Apps Script belum diisi di Pengaturan');
      return;
    }
    showToast('Menyinkronkan data...');
    window.storageService.syncPendingQueue().then(() => {
      showToast('Sinkronisasi selesai!');
      renderHomeData();
    });
  });

  // --- Render Beranda (Bulan Berjalan) ---
  function renderHomeData() {
    let entries = window.storageService.getEntries(state.activeMonth);

    // Filter pencarian
    if (state.searchQuery.trim()) {
      const q = state.searchQuery.toLowerCase();
      entries = entries.filter(e => 
        (e.namaUser && e.namaUser.toLowerCase().includes(q)) ||
        (e.perbaikan && e.perbaikan.toLowerCase().includes(q))
      );
    }

    // Hitung ringkasan
    let totalModal = 0;
    let totalJual = 0;
    let totalProfit = 0;

    entries.forEach(e => {
      totalModal += (Number(e.modal) || 0);
      totalJual += (Number(e.hargaJual) || 0);
      totalProfit += (Number(e.profit) || 0);
    });

    document.getElementById('statModal').textContent = formatRp(totalModal);
    document.getElementById('statPenjualan').textContent = formatRp(totalJual);
    document.getElementById('statProfit').textContent = formatRp(totalProfit);
    document.getElementById('statPelanggan').textContent = entries.length;

    // Update grafik
    window.chartManager.renderCharts(entries, state.activeMonth);

    // Render tabel desktop & kartu mobile
    renderDesktopTable(entries, 'desktopTableBody');
    renderMobileCards(entries, 'mobileCardsContainer');

    const emptyState = document.getElementById('emptyState');
    if (entries.length === 0) {
      emptyState.style.display = 'flex';
    } else {
      emptyState.style.display = 'none';
    }

    // Refresh datalist autocomplete
    updateAutocompleteLists();
  }

  // --- Render Tabel Desktop ---
  function renderDesktopTable(entries, containerId) {
    const tbody = document.getElementById(containerId);
    if (!tbody) return;

    if (entries.length === 0) {
      tbody.innerHTML = '';
      return;
    }

    tbody.innerHTML = entries.map(e => `
      <tr data-id="${e.id}">
        <td><strong>${formatTanggalIndo(e.tanggal)}</strong></td>
        <td><strong>${escapeHtml(e.namaUser)}</strong></td>
        <td class="table-repairs-cell">${escapeHtml(e.perbaikan)}</td>
        <td class="table-num">${formatRp(e.modal)}</td>
        <td class="table-num">${formatRp(e.hargaJual)}</td>
        <td class="table-num table-profit">${formatRp(e.profit)}</td>
        <td style="text-align: center;">
          <div style="display: inline-flex; gap: 4px;">
            <button class="btn-icon btn-edit" data-id="${e.id}" title="Edit Entri">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button class="btn-icon delete btn-delete" data-id="${e.id}" title="Hapus Entri">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    bindActionButtons(tbody);
  }

  // --- Render Kartu Mobile Dikelompokkan per Tanggal ---
  function renderMobileCards(entries, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (entries.length === 0) {
      container.innerHTML = '';
      return;
    }

    // Kelompokkan per tanggal
    const grouped = {};
    entries.forEach(e => {
      const tgl = e.tanggal;
      if (!grouped[tgl]) grouped[tgl] = [];
      grouped[tgl].push(e);
    });

    const dates = Object.keys(grouped).sort().reverse();

    container.innerHTML = dates.map(tgl => {
      const items = grouped[tgl];
      const dailyProfit = items.reduce((acc, curr) => acc + (Number(curr.profit) || 0), 0);

      const itemsHtml = items.map(e => `
        <div class="transaction-card" data-id="${e.id}">
          <div class="tx-main-info">
            <div class="tx-customer-name">${escapeHtml(e.namaUser)}</div>
            <div class="tx-repairs">${escapeHtml(e.perbaikan)}</div>
            <div class="tx-actions">
              <button class="btn-icon btn-edit" data-id="${e.id}" title="Edit Transaksi">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button class="btn-icon delete btn-delete" data-id="${e.id}" title="Hapus Transaksi">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>
          <div class="tx-right-info">
            <div class="tx-profit">${formatRp(e.profit)}</div>
            <div class="tx-meta">Jual: ${formatRp(e.hargaJual)}</div>
            <div class="tx-meta">Modal: ${formatRp(e.modal)}</div>
          </div>
        </div>
      `).join('');

      return `
        <div class="date-group">
          <div class="date-group-header">
            <span>${formatTanggalIndo(tgl)}</span>
            <span class="date-group-profit">${formatRp(dailyProfit)}</span>
          </div>
          <div class="card-group">
            ${itemsHtml}
          </div>
        </div>
      `;
    }).join('');

    bindActionButtons(container);
  }

  function bindActionButtons(container) {
    container.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        openEditModal(id);
      });
    });

    container.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        confirmDelete(id);
      });
    });
  }

  // --- Render Riwayat Bulan ---
  const historyMonthInput = document.getElementById('historyMonthSelect');
  historyMonthInput.value = state.historyMonth;

  historyMonthInput.addEventListener('change', () => {
    state.historyMonth = historyMonthInput.value;
    renderHistoryData();
  });

  function renderHistoryData() {
    const entries = window.storageService.getEntries(state.historyMonth);

    let totalModal = 0;
    let totalJual = 0;
    let totalProfit = 0;

    entries.forEach(e => {
      totalModal += (Number(e.modal) || 0);
      totalJual += (Number(e.hargaJual) || 0);
      totalProfit += (Number(e.profit) || 0);
    });

    document.getElementById('histModal').textContent = formatRp(totalModal);
    document.getElementById('histPenjualan').textContent = formatRp(totalJual);
    document.getElementById('histProfit').textContent = formatRp(totalProfit);
    document.getElementById('histPelanggan').textContent = entries.length;

    renderMobileCards(entries, 'historyCardsContainer');

    const empty = document.getElementById('historyEmptyState');
    empty.style.display = entries.length === 0 ? 'flex' : 'none';
  }

  // --- Autocomplete Lists ---
  function updateAutocompleteLists() {
    const { names, repairs } = window.storageService.getAutocompleteData();

    const customerDatalist = document.getElementById('customerNamesList');
    if (customerDatalist) {
      customerDatalist.innerHTML = names.map(n => `<option value="${escapeHtml(n)}"></option>`).join('');
    }

    const repairDatalist = document.getElementById('repairTypesList');
    if (repairDatalist) {
      repairDatalist.innerHTML = repairs.map(r => `<option value="${escapeHtml(r)}"></option>`).join('');
    }
  }

  // --- Pengaturan Grafik di Layar HP (Mobile Switch) ---
  const toggleChartsSwitch = document.getElementById('toggleChartsSwitch');
  const chartsContainer = document.getElementById('chartsContainer');

  function updateChartsVisibility() {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      chartsContainer.style.display = state.showChartsMobile ? 'grid' : 'none';
      toggleChartsSwitch.checked = state.showChartsMobile;
    } else {
      chartsContainer.style.display = 'grid';
      toggleChartsSwitch.checked = true;
    }
  }

  toggleChartsSwitch.addEventListener('change', (e) => {
    state.showChartsMobile = e.target.checked;
    localStorage.setItem('cs_show_charts_mobile', String(state.showChartsMobile));
    updateChartsVisibility();
    if (state.showChartsMobile) {
      // Re-render chart agar ukurannya pas
      const entries = window.storageService.getEntries(state.activeMonth);
      window.chartManager.renderCharts(entries, state.activeMonth);
    }
  });

  window.addEventListener('resize', updateChartsVisibility);
  updateChartsVisibility();

  // --- Pencarian Transaksi ---
  const searchInput = document.getElementById('searchInput');
  searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderHomeData();
  });

  // --- Modal Form & Baris Item Dinamis ---
  const modalOverlay = document.getElementById('entryModalOverlay');
  const repairItemsContainer = document.getElementById('repairItemsContainer');
  const liveProfitValue = document.getElementById('liveProfitValue');

  function openNewModal() {
    state.editingId = null;
    document.getElementById('entryModalTitle').textContent = 'Entri Servis Baru';
    document.getElementById('entryId').value = '';
    
    // Set tanggal hari ini format YYYY-MM-DD
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('entryTanggal').value = today;
    document.getElementById('entryNamaUser').value = '';

    // Reset items: buat 1 item kosong pertama
    repairItemsContainer.innerHTML = '';
    addRepairItemRow('', 0, 0);

    calculateLiveProfit();
    modalOverlay.classList.add('open');
    setTimeout(() => document.getElementById('entryNamaUser').focus(), 150);
  }

  function openEditModal(id) {
    const month = state.currentView === 'history' ? state.historyMonth : state.activeMonth;
    const entries = window.storageService.getEntries(month);
    const entry = entries.find(e => e.id === id);
    if (!entry) return;

    state.editingId = id;
    document.getElementById('entryModalTitle').textContent = 'Edit Entri Servis';
    document.getElementById('entryId').value = entry.id;
    document.getElementById('entryTanggal').value = entry.tanggal;
    document.getElementById('entryNamaUser').value = entry.namaUser;

    repairItemsContainer.innerHTML = '';

    if (Array.isArray(entry.rincian) && entry.rincian.length > 0) {
      entry.rincian.forEach(item => {
        addRepairItemRow(item.nama || item.perbaikan || '', item.modal || 0, item.hargaJual || 0);
      });
    } else {
      // Fallback jika tidak ada JSON rincian
      const repairs = (entry.perbaikan || '').split('\n');
      if (repairs.length > 1) {
        repairs.forEach((rep, idx) => {
          // Bagi modal & harga rata
          addRepairItemRow(rep, idx === 0 ? entry.modal : 0, idx === 0 ? entry.hargaJual : 0);
        });
      } else {
        addRepairItemRow(entry.perbaikan || '', entry.modal, entry.hargaJual);
      }
    }

    calculateLiveProfit();
    modalOverlay.classList.add('open');
  }

  function closeModal() {
    modalOverlay.classList.remove('open');
  }

  function addRepairItemRow(nama = '', modal = 0, hargaJual = 0) {
    const itemIndex = repairItemsContainer.children.length + 1;
    const card = document.createElement('div');
    card.className = 'repair-item-card';

    card.innerHTML = `
      <div class="repair-item-header">
        <span class="repair-item-index">Item ${itemIndex}</span>
        ${itemIndex > 1 ? '<button type="button" class="btn-remove-item">Hapus</button>' : ''}
      </div>
      <div class="form-group">
        <input type="text" class="form-input item-nama" placeholder="Jenis Perbaikan (contoh: Ganti LCD)" list="repairTypesList" value="${escapeHtml(nama)}" required autocomplete="off">
      </div>
      <div class="item-fields-grid">
        <div class="form-group">
          <label class="form-label" style="font-size: 11px;">Modal (Rp)</label>
          <input type="number" class="form-input item-modal" placeholder="0" min="0" step="1000" value="${modal || ''}">
        </div>
        <div class="form-group">
          <label class="form-label" style="font-size: 11px;">Harga Jual (Rp)</label>
          <input type="number" class="form-input item-jual" placeholder="0" min="0" step="1000" value="${hargaJual || ''}">
        </div>
      </div>
    `;

    // Pasang listener input untuk live profit calculation
    card.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('input', calculateLiveProfit);
    });

    const removeBtn = card.querySelector('.btn-remove-item');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        card.remove();
        reindexRepairItems();
        calculateLiveProfit();
      });
    }

    repairItemsContainer.appendChild(card);
    reindexRepairItems();
  }

  function reindexRepairItems() {
    const cards = repairItemsContainer.querySelectorAll('.repair-item-card');
    cards.forEach((card, idx) => {
      const idxLabel = card.querySelector('.repair-item-index');
      if (idxLabel) idxLabel.textContent = `Item ${idx + 1}`;
    });
  }

  function calculateLiveProfit() {
    let totalModal = 0;
    let totalJual = 0;

    const cards = repairItemsContainer.querySelectorAll('.repair-item-card');
    cards.forEach(card => {
      const modalInp = card.querySelector('.item-modal');
      const jualInp = card.querySelector('.item-jual');

      const modal = Number(modalInp ? modalInp.value : 0) || 0;
      const jual = Number(jualInp ? jualInp.value : 0) || 0;

      totalModal += modal;
      totalJual += jual;
    });

    const profit = totalJual - totalModal;
    liveProfitValue.textContent = formatRp(profit);
  }

  // Tombol tambah item
  document.getElementById('btnAddItemRow').addEventListener('click', () => {
    addRepairItemRow('', 0, 0);
  });

  // Tombol batal / close modal
  document.getElementById('btnCloseModal').addEventListener('click', closeModal);
  document.getElementById('btnCancelModal').addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // Tombol Buka Modal
  document.getElementById('btnSidebarAdd').addEventListener('click', openNewModal);
  document.getElementById('btnMobileFab').addEventListener('click', openNewModal);
  document.getElementById('btnEmptyAdd').addEventListener('click', openNewModal);

  // --- Simpan Entri ---
  document.getElementById('btnSaveEntry').addEventListener('click', async () => {
    const tanggal = document.getElementById('entryTanggal').value;
    const namaUser = document.getElementById('entryNamaUser').value.trim();

    if (!tanggal) {
      alert('Pilih tanggal transaksi terlebih dahulu!');
      return;
    }
    if (!namaUser) {
      alert('Nama pelanggan tidak boleh kosong!');
      document.getElementById('entryNamaUser').focus();
      return;
    }

    const cards = repairItemsContainer.querySelectorAll('.repair-item-card');
    const rincian = [];
    let totalModal = 0;
    let totalJual = 0;

    cards.forEach(card => {
      const nama = card.querySelector('.item-nama').value.trim();
      const modal = Number(card.querySelector('.item-modal').value) || 0;
      const jual = Number(card.querySelector('.item-jual').value) || 0;

      if (nama) {
        rincian.push({ nama, modal, hargaJual: jual });
        totalModal += modal;
        totalJual += jual;
      }
    });

    if (rincian.length === 0) {
      alert('Masukkan minimal 1 jenis perbaikan!');
      return;
    }

    const perbaikanText = rincian.map(r => r.nama).join('\n');
    const entryData = {
      id: state.editingId || undefined,
      tanggal,
      namaUser,
      perbaikan: perbaikanText,
      modal: totalModal,
      hargaJual: totalJual,
      rincian
    };

    try {
      await window.storageService.saveEntry(entryData);
      closeModal();
      showToast(state.editingId ? 'Transaksi diperbarui!' : 'Transaksi berhasil disimpan!');
      renderHomeData();
      if (state.currentView === 'history') renderHistoryData();
    } catch (err) {
      console.error(err);
      alert('Gagal menyimpan transaksi: ' + err.message);
    }
  });

  // --- Hapus Entri ---
  async function confirmDelete(id) {
    const month = state.currentView === 'history' ? state.historyMonth : state.activeMonth;
    const entries = window.storageService.getEntries(month);
    const entry = entries.find(e => e.id === id);

    const name = entry ? entry.namaUser : 'entri ini';
    if (!confirm(`Yakin ingin menghapus catatan servis untuk "${name}"?`)) {
      return;
    }

    try {
      await window.storageService.deleteEntry(id, month);
      showToast('Transaksi berhasil dihapus');
      renderHomeData();
      if (state.currentView === 'history') renderHistoryData();
    } catch (err) {
      alert('Gagal menghapus entri: ' + err.message);
    }
  }

  // --- Pintasan Keyboard (macOS / PC) ---
  window.addEventListener('keydown', (e) => {
    // Tombol 'N' untuk buat entri baru jika tidak sedang mengetik di input/textarea
    const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    const isTyping = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';

    if (e.key === 'n' || e.key === 'N') {
      if (!isTyping && !modalOverlay.classList.contains('open')) {
        e.preventDefault();
        openNewModal();
      }
    }

    // Tombol Escape untuk menutup modal
    if (e.key === 'Escape') {
      if (modalOverlay.classList.contains('open')) {
        closeModal();
      }
    }

    // Enter untuk simpan saat form modal terbuka (kecuali di tombol batal)
    if (e.key === 'Enter' && modalOverlay.classList.contains('open')) {
      if (activeTag === 'input') {
        e.preventDefault();
        document.getElementById('btnSaveEntry').click();
      }
    }
  });

  // --- Ekspor CSV ---
  document.getElementById('btnExportCSV').addEventListener('click', () => {
    try {
      window.storageService.exportToCSV(state.activeMonth);
      showToast('File CSV berhasil diunduh!');
    } catch (e) {
      alert(e.message);
    }
  });

  document.getElementById('btnSettingsExportCSV').addEventListener('click', () => {
    try {
      window.storageService.exportToCSV(state.activeMonth);
      showToast('File CSV berhasil diunduh!');
    } catch (e) {
      alert(e.message);
    }
  });

  // --- Manajemen Pengaturan ---
  function loadSettingsUI() {
    const config = window.storageService.config;
    document.getElementById('settingScriptUrl').value = config.scriptUrl || '';
    document.getElementById('settingSecretToken').value = config.secretToken || '';

    // Tandai warna yang aktif
    document.querySelectorAll('.color-option-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-color') === config.accentColor);
    });
  }

  document.getElementById('btnSaveBackendSettings').addEventListener('click', () => {
    const url = document.getElementById('settingScriptUrl').value.trim();
    const token = document.getElementById('settingSecretToken').value.trim();

    window.storageService.saveConfig({
      scriptUrl: url,
      secretToken: token
    });

    showToast('Pengaturan Google Sheets disimpan!');
  });

  document.getElementById('btnTestConnection').addEventListener('click', async () => {
    const url = document.getElementById('settingScriptUrl').value.trim();
    const token = document.getElementById('settingSecretToken').value.trim();

    if (!url) {
      alert('Masukkan URL Apps Script terlebih dahulu!');
      return;
    }

    const testBtn = document.getElementById('btnTestConnection');
    testBtn.disabled = true;
    testBtn.textContent = 'Menguji...';

    try {
      const msg = await window.storageService.testConnection(url, token);
      alert('✅ ' + msg);
    } catch (err) {
      alert('❌ Koneksi gagal: ' + err.message);
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = 'Uji Koneksi';
    }
  });

  // Pemilih Warna Aksen
  document.querySelectorAll('.color-option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const color = btn.getAttribute('data-color');
      window.storageService.saveConfig({ accentColor: color });

      document.querySelectorAll('.color-option-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Refresh chart colors
      const entries = window.storageService.getEntries(state.activeMonth);
      window.chartManager.renderCharts(entries, state.activeMonth);

      showToast(`Warna aksen diubah ke ${color}!`);
    });
  });

  // Tombol Muat / Hapus Data Demo
  document.getElementById('btnReloadDemo').addEventListener('click', () => {
    if (confirm('Muat ulang data contoh bulan ini? Data yang ada akan ditimpa contoh.')) {
      window.storageService.loadDemoData();
      showToast('Data contoh berhasil dimuat!');
      renderHomeData();
    }
  });

  document.getElementById('btnClearDemo').addEventListener('click', () => {
    if (confirm('Hapus seluruh data transaksi bulan ini?')) {
      window.storageService.clearDemoData();
      showToast('Data bulan ini telah dibersihkan');
      renderHomeData();
    }
  });

  // Escape HTML helper
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Render awal saat pertama dimuat
  renderHomeData();
});
