/**
 * charts.js - Visualisasi Data Chart.js (Grafik Profit Harian & Komposisi Modal vs Profit)
 * Bergaya Apple iOS / macOS
 */

class ChartManager {
  constructor() {
    this.barChart = null;
    this.doughnutChart = null;
  }

  getDaysInMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
  }

  isDarkMode() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  getThemeColors() {
    const isDark = this.isDarkMode();
    const style = getComputedStyle(document.documentElement);
    const accent = (isDark ? style.getPropertyValue('--ios-accent-dark') : style.getPropertyValue('--ios-accent')) || '#007AFF';

    return {
      accent: accent.trim(),
      textColor: isDark ? '#EBEBF5' : '#1C1C1E',
      secondaryTextColor: isDark ? '#8E8E93' : '#8E8E93',
      gridColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
      cardBg: isDark ? '#1C1C1E' : '#FFFFFF',
      modalColor: isDark ? '#FF9F0A' : '#FF9500',
      profitColor: accent.trim()
    };
  }

  formatRupiah(value) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }

  renderCharts(entries, monthStr) {
    if (typeof Chart === 'undefined') {
      console.warn('Chart.js belum siap atau sedang dimuat dari CDN');
      return;
    }

    const [yearStr, mStr] = (monthStr || window.storageService.getCurrentMonthString()).split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(mStr, 10) - 1;
    const totalDays = this.getDaysInMonth(year, month);

    // Siapkan data per hari (default 0 untuk hari tanpa transaksi)
    const dailyProfits = new Array(totalDays).fill(0);
    const dayLabels = [];

    for (let d = 1; d <= totalDays; d++) {
      dayLabels.push(`${d}`);
    }

    let totalModal = 0;
    let totalProfit = 0;

    entries.forEach((e) => {
      const parts = (e.tanggal || '').split('-');
      if (parts.length === 3) {
        const day = parseInt(parts[2], 10);
        if (day >= 1 && day <= totalDays) {
          dailyProfits[day - 1] += (Number(e.profit) || 0);
        }
      }
      totalModal += (Number(e.modal) || 0);
      totalProfit += (Number(e.profit) || 0);
    });

    const colors = this.getThemeColors();

    this.renderBarChart(dayLabels, dailyProfits, colors);
    this.renderDoughnutChart(totalModal, totalProfit, colors);
  }

  renderBarChart(labels, data, colors) {
    const canvas = document.getElementById('dailyProfitChart');
    if (!canvas) return;

    if (this.barChart) {
      this.barChart.destroy();
    }

    const ctx = canvas.getContext('2d');

    // Create subtle gradient for bars
    const gradient = ctx.createLinearGradient(0, 0, 0, 240);
    gradient.addColorStop(0, colors.accent);
    gradient.addColorStop(1, colors.accent + '88');

    this.barChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Profit Harian',
          data: data,
          backgroundColor: gradient,
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: 16
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: colors.cardBg,
            titleColor: colors.textColor,
            bodyColor: colors.textColor,
            borderColor: colors.gridColor,
            borderWidth: 1,
            cornerRadius: 10,
            padding: 10,
            displayColors: false,
            callbacks: {
              title: (items) => `Tgl ${items[0].label}`,
              label: (item) => `Profit: ${this.formatRupiah(item.raw)}`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: colors.secondaryTextColor,
              font: { family: '-apple-system, system-ui', size: 10 },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 16
            }
          },
          y: {
            grid: {
              color: colors.gridColor,
              drawBorder: false
            },
            ticks: {
              color: colors.secondaryTextColor,
              font: { family: '-apple-system, system-ui', size: 10 },
              callback: (value) => {
                if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
                if (value >= 1000) return (value / 1000).toFixed(0) + 'K';
                return value;
              }
            }
          }
        }
      }
    });
  }

  renderDoughnutChart(totalModal, totalProfit, colors) {
    const canvas = document.getElementById('compositionChart');
    if (!canvas) return;

    if (this.doughnutChart) {
      this.doughnutChart.destroy();
    }

    const ctx = canvas.getContext('2d');
    const isZero = (totalModal === 0 && totalProfit === 0);

    const chartData = isZero ? [1] : [totalModal, Math.max(0, totalProfit)];
    const chartColors = isZero ? ['#8E8E9344'] : [colors.modalColor, colors.profitColor];

    this.doughnutChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: isZero ? ['Belum ada data'] : ['Total Modal', 'Total Profit'],
        datasets: [{
          data: chartData,
          backgroundColor: chartColors,
          borderWidth: 0,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: colors.textColor,
              font: { family: '-apple-system, system-ui', size: 12 },
              padding: 12,
              usePointStyle: true,
              pointStyle: 'circle'
            }
          },
          tooltip: {
            backgroundColor: colors.cardBg,
            titleColor: colors.textColor,
            bodyColor: colors.textColor,
            borderColor: colors.gridColor,
            borderWidth: 1,
            cornerRadius: 10,
            padding: 10,
            callbacks: {
              label: (item) => {
                if (isZero) return 'Belum ada data';
                return `${item.label}: ${this.formatRupiah(item.raw)}`;
              }
            }
          }
        }
      }
    });
  }
}

window.chartManager = new ChartManager();
