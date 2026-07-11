const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const express = require("express");
const axios = require("axios");
const qrImage = require("qr-image");

const app = express();
app.use(express.json());

// 🛡️ إعداد الـ Puppeteer بأقصى وضع تقشير وتوفير للذاكرة لمنع الـ Crash
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: '/tmp/.wwebjs_auth'
  }),
  puppeteer: {
    headless: true,
    executablePath: '/usr/bin/chromium', 
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
      "--single-process", 
      "--no-first-run",
      "--ignore-certificate-errors",
      "--no-default-browser-check",
      "--disable-extensions",
      "--blink-settings=imagesEnabled=false", // منع الصور
      "--disable-audio-output" // تعطيل الصوت
    ],
  },
});

let currentQrBase64 = null;
let connectionStatus = "DISCONNECTED";

// ✨ الـ Root Endpoint معدلة لإجبار الـ Proxy على قفل الكاش والرد الفوري
app.get("/", (req, res) => {
  res.set({
    'Content-Type': 'text/plain',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Connection': 'close'
  });
  res.status(200).send("WhatsApp Node Bridge is Alive and Running!");
});

client.on("qr", (qr) => {
  connectionStatus = "QR_READY";
  try {
    const image = qrImage.imageSync(qr, { type: "png" });
    currentQrBase64 = `data:image/png;base64,${image.toString("base64")}`;
    qrcode.generate(qr, { small: true });
    console.log("=> QR Code Ready for Scanning!");
  } catch (err) {
    console.error("خطأ أثناء توليد الـ QR:", err.message);
  }
});

client.on("ready", () => {
  connectionStatus = "CONNECTED";
  currentQrBase64 = null;
  console.log("تم اتصال رقمك بالواتساب بنجاح واكتمل التوثيق!");
});

client.on("disconnected", () => {
  connectionStatus = "DISCONNECTED";
  currentQrBase64 = null;
  console.log("تم تسجيل الخروج أو فصل جلسة الواتساب.");
});

app.get("/whatsapp-status", (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    status: connectionStatus,
    qr: currentQrBase64,
  });
});

client.on("message", async (msg) => {
  if (msg.from.includes("@g.us")) return;
  try {
    const laravelUrl = process.env.LARAVEL_API_URL || "https://whatsapplaravel-production.up.railway.app";
    await axios.post(`${laravelUrl}/api/webhook/receive`, {
      phone: msg.from.replace("@c.us", ""),
      message: msg.body,
    });
    console.log(`تم تحويل رسالة مستلمة من ${msg.from} إلى Laravel`);
  } catch (error) {
    console.error("فشل إرسال الرسالة المستلمة للارافل:", error.message);
  }
});

app.post("/send-message", async (req, res) => {
  const { phone, message } = req.body;
  const formattedPhone = `${phone}@c.us`;
  try {
    await client.sendMessage(formattedPhone, message);
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🚀 تشغيل الخادم والربط الفوري بالبورت
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Node Webhook Bridge Server is fully bound to port ${PORT}`);
  
  // تأخير تشغيل الواتساب 8 ثواني كاملة عشان السيرفر يستقر تماماً في Railway ويعدي الـ Health Check
  setTimeout(() => {
    console.log("جاري إطلاق عميل الواتساب في الخلفية...");
    client.initialize().catch(err => {
       console.error("خطأ حرج أثناء تشغيل عميل الواتساب ويب:", err.message);
    });
  }, 8000);
});
