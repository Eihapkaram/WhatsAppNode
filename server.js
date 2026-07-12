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
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
      "--single-process",
      "--no-first-run",
      "--ignore-certificate-errors",
      "--no-default-browser-check",
      "--disable-extensions",
      "--deterministic-mode",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
      "--blink-settings=imagesEnabled=false",
      "--disable-audio-output",
      "--disable-gl-drawing-for-tests",
      "--disable-software-rasterizer"
    ],
  },
});

let currentQrBase64 = null;
let connectionStatus = "DISCONNECTED";

app.get("/", (req, res) => {
  res.status(200).send("WhatsApp Node Bridge is Alive and Running!");
});

client.on("qr", (qr) => {
  connectionStatus = "QR_READY";
  const image = qrImage.imageSync(qr, { type: "png" });
  currentQrBase64 = `data:image/png;base64,${image.toString("base64")}`;
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  connectionStatus = "CONNECTED";
  currentQrBase64 = null;
  console.log("تم اتصال رقمك بالواتساب بنجاح واكتمل التوثيق!");
});

client.on("disconnected", () => {
  connectionStatus = "DISCONNECTED";
  currentQrBase64 = null;
});

app.get("/whatsapp-status", (req, res) => {
  res.json({ status: connectionStatus, qr: currentQrBase64 });
});

// الاستماع للرسايل الجديدة وإرسالها للارافل فوراً
client.on("message", async (msg) => {
  if (msg.from.includes("@g.us")) return; // تجاهل المجموعات

  try {
    const laravelUrl = process.env.LARAVEL_API_URL || "https://whatsapplaravel-production.up.railway.app";

    // الاحتفاظ بالـ ID كامل كما جاء من واتساب لضمان القدرة على الرد عليه لاحقاً
    const cleanPhone = msg.from.split('@')[0];

    await axios.post(`${laravelUrl}/api/webhook/receive`, {
      phone: cleanPhone,
      message: msg.body,
    });
    console.log(`تم تحويل الرسالة إلى Laravel من: ${cleanPhone}`);
  } catch (error) {
    console.error("فشل إرسال الرسالة للارافل:", error.message);
  }
});

// الـ Endpoint الخاص بإرسال الرسائل (يدعم الأرقام العادية والـ IDs المخفية)
app.post("/send-message", async (req, res) => {
  const { phone, message } = req.body;
  
  // ✨ ذكاء اصطناعي برمجياً: لو الرقم طويل جداً (معرف LID خفي)، واتساب بتطلب توجيهه لـ @lid وليس @c.us
  const suffix = phone.length > 13 ? '@lid' : '@c.us';
  const formattedPhone = phone.includes('@') ? phone : `${phone}${suffix}`;

  try {
    await client.sendMessage(formattedPhone, message);
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Node Server running on port ${PORT}`);
  setTimeout(() => {
    client.initialize().catch(err => console.error("خطأ تشغيل الواتساب:", err.message));
  }, 5000);
});
