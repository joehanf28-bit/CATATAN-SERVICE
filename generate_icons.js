const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

function createPNG(width, height) {
  // Simple PNG encoder in pure Node without external deps
  // Generates an iOS style icon with blue rounded rectangle and phone/wrench
  const buffer = Buffer.alloc(width * (height * 4 + height));
  let pos = 0;

  const r_corner = Math.round(width * 0.22);
  const cx = width / 2;
  const cy = height / 2;

  // Precompute rounded rect distance
  function inRoundedRect(x, y, rx, ry, rw, rh, r) {
    if (x < rx || x >= rx + rw || y < ry || y >= ry + rh) return false;
    let dx = 0, dy = 0;
    if (x < rx + r) dx = rx + r - x;
    else if (x > rx + rw - r) dx = x - (rx + rw - r);
    if (y < ry + r) dy = ry + r - y;
    else if (y > ry + rh - r) dy = y - (ry + rh - r);
    return (dx * dx + dy * dy) <= (r * r);
  }

  const phoneW = Math.round(width * 0.46);
  const phoneH = Math.round(height * 0.66);
  const phoneX = Math.round(cx - phoneW / 2);
  const phoneY = Math.round(cy - phoneH / 2);
  const phoneR = Math.round(phoneW * 0.18);

  const screenMargin = Math.max(3, Math.round(width * 0.025));
  const screenX = phoneX + screenMargin;
  const screenY = phoneY + screenMargin * 2;
  const screenW = phoneW - screenMargin * 2;
  const screenH = phoneH - screenMargin * 4;

  const badgeR = Math.round(width * 0.11);
  const badgeCx = cx;
  const badgeCy = cy + Math.round(height * 0.02);

  for (let y = 0; y < height; y++) {
    buffer[pos++] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;

      // Outer squircle background
      if (inRoundedRect(x, y, 0, 0, width, height, r_corner)) {
        // Gradient from #0A84FF to #0056D2
        const t = (x + y) / (width + height);
        r = Math.round(10 * (1 - t) + 0 * t);
        g = Math.round(132 * (1 - t) + 86 * t);
        b = Math.round(255 * (1 - t) + 210 * t);
        a = 255;

        // Phone body
        if (inRoundedRect(x, y, phoneX, phoneY, phoneW, phoneH, phoneR)) {
          r = 245; g = 247; b = 250; a = 255;

          // Inner screen
          if (inRoundedRect(x, y, screenX, screenY, screenW, screenH, Math.round(phoneR * 0.8))) {
            const st = (y - screenY) / screenH;
            r = Math.round(210 * (1 - st) + 190 * st);
            g = Math.round(225 * (1 - st) + 210 * st);
            b = Math.round(245 * (1 - st) + 235 * st);

            // Badge circle
            const dBadge = Math.hypot(x - badgeCx, y - badgeCy);
            if (dBadge <= badgeR) {
              r = 10; g = 132; b = 255;
              // Center tool symbol (wrench cross)
              const dx = Math.abs(x - badgeCx);
              const dy = Math.abs(y - badgeCy);
              if ((dx < badgeR * 0.28 && dy < badgeR * 0.65) || 
                  (dy < badgeR * 0.28 && dx < badgeR * 0.65) ||
                  (Math.abs(dx - dy) < badgeR * 0.25 && dx + dy < badgeR * 0.85)) {
                r = 255; g = 255; b = 255;
              }
            }

            // Top speaker notch
            const notchW = Math.round(phoneW * 0.3);
            const notchH = Math.max(3, Math.round(height * 0.018));
            if (x >= cx - notchW / 2 && x <= cx + notchW / 2 && y >= phoneY + screenMargin && y <= phoneY + screenMargin + notchH) {
              r = 30; g = 30; b = 35;
            }
          }
        }
      }

      buffer[pos++] = r;
      buffer[pos++] = g;
      buffer[pos++] = b;
      buffer[pos++] = a;
    }
  }

  // PNG structure
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const chunkType = Buffer.from(type);
    const crcVal = crc32(Buffer.concat([chunkType, data]));
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crcVal, 0);
    return Buffer.concat([len, chunkType, data, crc]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8-bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const idatData = zlib.deflateSync(buffer);
  const idat = makeChunk('IDAT', idatData);
  const ihdrChunk = makeChunk('IHDR', ihdr);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idat, iendChunk]);
}

// CRC-32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) c = 0xedb88320 ^ (c >>> 1);
    else c = c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

fs.writeFileSync(path.join(iconsDir, 'icon-192.png'), createPNG(192, 192));
fs.writeFileSync(path.join(iconsDir, 'icon-512.png'), createPNG(512, 512));
fs.writeFileSync(path.join(iconsDir, 'apple-touch-icon.png'), createPNG(180, 180));
fs.writeFileSync(path.join(iconsDir, 'favicon.ico'), createPNG(64, 64));

console.log('Semua ikon PNG berhasil dibuat!');
