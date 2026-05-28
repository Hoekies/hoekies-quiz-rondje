import QRCode from "qrcode";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const url = "http://192.168.1.104:3000";
const out = join(__dirname, "../public/qr-speler.png");
await QRCode.toFile(out, url, { width: 400, margin: 2 });
console.log("✅ QR opgeslagen:", out);
process.exit(0);
