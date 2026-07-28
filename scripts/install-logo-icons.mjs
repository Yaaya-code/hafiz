import sharp from "sharp";
import { readdirSync } from "fs";
import { join } from "path";

const src = join(
  process.env.USERPROFILE || "",
  ".grok",
  "sessions",
  "C%3A%5CUsers%5CYAHYA%5CProjects%5Chafiz",
  "019f9c01-68d7-7410-9db5-be8365496ef1",
  "images",
  "4.jpg" // cleaner app-icon variant (mushaf + crescent, no letter)
);
const out = join(process.cwd(), "public");

const sizes = [
  ["logo.png", 1024],
  ["icon-512.png", 512],
  ["icon-192.png", 192],
  ["apple-touch-icon.png", 180],
  ["favicon-48.png", 48],
  ["favicon-32.png", 32],
];

for (const [name, size] of sizes) {
  await sharp(src)
    .resize(size, size, { fit: "cover", position: "centre" })
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(join(out, name));
  console.log("wrote", name, size);
}

// also copy as favicon.ico alternative via 32 png is fine
console.log(
  "public icons:",
  readdirSync(out).filter((f) => /icon|logo|favicon|apple/.test(f))
);
