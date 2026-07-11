const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const express = require("express");
const axios = require("axios");
const qrImage = require("qr-image");

const app = express();
app.use(express.json());

// 🛠️ إعداد الـ Puppeteer المطور لبيئات الحاويات (Railway) لمنع تجميد الذاكرة المشتركة
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    executablePath: '/usr/bin/chromium', 
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage", // يمنع قفل المتصفح بسبب مساحة الـ /dev/shm الصغيرة في الحاويات
      "--disable-gpu",
      "--no-zygote",
      "--single-process",
      "--no-first-run",
      "--ignore-certificate-errors",
      "--no-default-browser-check"
    ],
  },
});

let currentQrBase64 = null;
let connectionStatus = "DISCONNECTED"; // DISCONNECTED, QR_READY, CONNECTED

// ✨ الـ Root Endpoint الأساسية للرد الفوري على الـ Proxy ومنع الـ 502
app.get("/", (req, res) => {
  res.status(200).send("WhatsApp Node Bridge is Alive and Running!");
});

client.on("qr", (qr) => {
  connectionStatus = "QR_READY";
  const image = qrImage.imageSync(qr, { type: "png" });
  currentQrBase64 = `data:image/png;base64,${image.toString("base64")}`;

  qrcode.generate(qr, { small: true });
  console.log("تم توليد QR Code جديد وبانتظار المسح...");
});

client.on("ready", () => {
  connectionStatus = "CONNECTED";
  currentQrBase64 = null;
  console.log("تم اتصال رقمك بالواتساب بنجاح!");
});

client.on("disconnected", () => {
  connectionStatus = "DISCONNECTED";
  currentQrBase64 = null;
  console.log("تم تسجيل الخروج من الواتساب.");
});

// Endpoint لمتابعة الحالة والـ QR من الـ Vue عبر لارافل
app.get("/whatsapp-status", (req, res) => {
  res.json({
    status: connectionStatus,
    qr: currentQrBase64,
  });
});

// الاستماع للرسايل الجديدة وإرسالها للارافل فوراً
client.on("message", async (msg) => {
  if (msg.from.includes("@g.us")) return; // تجاهل المجموعات

  try {
    const laravelUrl = process.env.LARAVEL_API_URL || "http://localhost:8000";

    await axios.post(`${laravelUrl}/api/webhook/receive`, {
      phone: msg.from.replace("@c.us", ""),
      message: msg.body,
    });
    console.log(`تم تحويل رسالة مستلمة من ${msg.from} إلى Laravel`);
  } catch (error) {
    console.error("فشل إرسال الرسالة المستلمة للارافل:", error.message);
  }
});

// الـ Endpoint الخاص بإرسال الرسائل المجدولة من طوابير لارافل
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

// 🚀 1. تشغيل خادم الـ Web أولاً لربط البورت بالمنصة فوراً ومنع الـ 502
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Node Webhook Bridge Server running on port ${PORT}`);
  
  // ⏳ 2. تشغيل الـ Puppeteer والواتساب في الخلفية بعد استقرار الخادم تماماً
  console.log("جاري تشغيل Puppeteer و WhatsApp Web في الخلفية...");
  client.initialize().catch(err => {
     console.error("خطأ أثناء تشغيل عميل الواتساب ويب:", err.message);
  });
});
