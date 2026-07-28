/**
 * Generate PNG PWA icons from brand colors (no external deps).
 * Writes public/icon-192.png, icon-512.png, apple-touch-icon.png
 */
import { writeFileSync } from "fs";
import { deflateSync } from "zlib";
import { join } from "path";

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeB = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeB, data])));
  return Buffer.concat([len, typeB, data, crc]);
}

/** Minimal solid PNG with rounded-ish gold "ح" via simple raster */
function makePng(size) {
  // Background #020408, gold circle + letter approximation
  const bg = [0x02, 0x04, 0x08, 0xff];
  const gold = [0xd4, 0xaf, 0x37, 0xff];
  const goldLight = [0xf0, 0xd7, 0x8c, 0xff];
  const rows = [];
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size * 0.42;
  const rInner = size * 0.36;

  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let c = bg;
      // rounded square frame
      const margin = size * 0.06;
      const rx = size * 0.18;
      const inBox =
        x >= margin &&
        x < size - margin &&
        y >= margin &&
        y < size - margin;
      // soft ring
      if (dist < rOuter && dist > rInner) {
        c = gold;
      } else if (dist <= rInner) {
        // letter "ح" simplified as horizontal bars + curve
        const nx = dx / size;
        const ny = dy / size;
        const bar =
          (Math.abs(ny) < 0.04 && nx > -0.18 && nx < 0.18) ||
          (Math.abs(ny + 0.12) < 0.035 && nx > -0.18 && nx < 0.12) ||
          (Math.abs(nx + 0.16) < 0.035 && ny > -0.14 && ny < 0.16) ||
          (Math.abs(nx - 0.16) < 0.035 && ny > -0.14 && ny < 0.08) ||
          (Math.hypot(nx - 0.08, ny - 0.12) < 0.09 &&
            Math.hypot(nx - 0.08, ny - 0.12) > 0.05 &&
            ny > 0.04);
        c = bar ? goldLight : bg;
      } else if (!inBox) {
        c = bg;
      }
      const o = 1 + x * 4;
      row[o] = c[0];
      row[o + 1] = c[1];
      row[o + 2] = c[2];
      row[o + 3] = c[3];
    }
    rows.push(row);
  }

  const raw = Buffer.concat(rows);
  const compressed = deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const out = join(process.cwd(), "public");
for (const [name, size] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
  ["favicon-32.png", 32],
]) {
  writeFileSync(join(out, name), makePng(size));
  console.log("wrote", name, size);
}
