// Draws the menu bar template icon (a gauge ring with a filled wedge) as PNG files.
// macOS treats files named *Template.png as monochrome masks: only the alpha channel matters.
// Run: node scripts/make-icon.mjs  →  src/main/assets/trayTemplate.png and trayTemplate@2x.png
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

function draw(size) {
  const samples = 4;
  const center = size / 2;
  const outer = size * 0.44;
  const ring = size * 0.1;
  const wedge = size * 0.3;
  const wedgeTurns = 0.35; // fraction of the circle filled, clockwise from 12 o'clock
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < samples; sy++)
        for (let sx = 0; sx < samples; sx++) {
          const px = x + (sx + 0.5) / samples - center;
          const py = y + (sy + 0.5) / samples - center;
          const r = Math.hypot(px, py);
          const turns = (Math.atan2(px, -py) / (2 * Math.PI) + 1) % 1;
          if ((r <= outer && r >= outer - ring) || (r <= wedge && turns <= wedgeTurns)) hits++;
        }
      const alpha = Math.round((255 * hits) / (samples * samples));
      row.writeUInt32BE(alpha, 1 + x * 4); // r=g=b=0, alpha last
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('src/main/assets', { recursive: true });
writeFileSync('src/main/assets/trayTemplate.png', draw(16));
writeFileSync('src/main/assets/trayTemplate@2x.png', draw(32));
