import QRCode from "qrcode";
const url = "http://192.168.1.104:3000";
const qr = await QRCode.toString(url, { type: "terminal", small: true });
console.log(qr);
console.log("URL:", url);
process.exit(0);
