const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const express = require("express");
const axios = require("axios");
const qrImage = require("qr-image");

const app = express();
app.use(express.json());

// 🛠️ إعداد الـ Puppeteer بأقصى وضع لتوفير الرام وحماية الحاوية من الـ Crash
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: '/tmp/.wwebjs_auth' // حفظ الجلسة في مجلد الـ /tmp الآمن على لينكس
  }),
  puppeteer: {
    headless: true,
    executablePath: '/usr/bin/chromium', 
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage", // يمنع قفل المتصفح بسبب نقص الذاكرة المشتركة
      "--disable-gpu",
      "--no-zygote",
      "--single-process", // إجبار الكروميوم على العمل في عملية واحدة لتوفير الرام
      "--no-first-run",
      "--ignore-certificate-errors",
      "--no-default-browser-check",
      "--disable-extensions",
      "--deterministic-mode",
      
      // ✨ أعلام جبارة لمنع تحميل المكونات الثقيلة وتوفير الرام:
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
      "--blink-settings=imagesEnabled=false", // منع تحميل الصور تماماً داخل المتصفح الخفي لتوفير الرام
      "--disable-audio-output", // تعطيل الصوت
      "--disable-gl-drawing-for-tests",
      "--disable-software-rasterizer"
    ],
  },
});

let currentQrBase64 = null;
let connectionStatus = "DISCONNECTED"; // DISCONNECTED, QR_READY, CONNECTED

// ✨ الـ Root Endpoint الأساسية للرد الفوري على الـ Proxy ومنع الـ 502 نهائياً
app.get("/", (req, res) => {
  res.status(200).send("WhatsApp Node Bridge is Alive and Running!");
});

client.on("qr", (qr) => {
  connectionStatus = "QR_READY";
  const image = qrImage.imageSync(qr, { type: "png" });
  currentQrBase64 = `data:image/png;base64,${image.toString("base64")}`;

  qrcode.generate(qr, { small: true });
  console.log("=> QR Code Ready for Scanning!");
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

// Endpoint لمتابعة الحالة والـ QR من الـ Vue عبر لارافل
app.get("/whatsapp-status", (req, res) => {
  res.json({
    status: connectionStatus,
    qr: currentQrBase64,
  });
});

// الاستماع للرسايل الجديدة وإرسالها للارافل فوراً
client.on("message", async (msg) => {
  if (msg.from.includes("@g.us")) return; // تجاهل المجموعات لتقليل الضغط

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

// 🚀 1. تشغيل خادم الـ Express أولاً لربط البورت بالمنصة فوراً وقبول الـ Traffic ومنع الـ 502
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Node Webhook Bridge Server is fully bound to port ${PORT}`);
  
  // ⏳ 2. تأخير تشغيل Puppeteer لمدة 5 ثواني كاملة لضمان استقرار الـ Proxy واختفاء الـ 502 تماماً
  console.log("بانتظار استقرار الـ Proxy (5 ثواني)...");
  setTimeout(() => {
    console.log("جاري تشغيل Puppeteer و WhatsApp Web في الخلفية الآمنة...");
    client.initialize().catch(err => {
       console.error("خطأ حرج أثناء تشغيل عميل الواتساب ويب:", err.message);
    });
  }, 5000); // 5000 ملي ثانية تعطي السيرفر وقت كامل للاستقرار الشبكي أولاً
});
