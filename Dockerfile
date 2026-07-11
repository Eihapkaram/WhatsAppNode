# 1. استخدام نسخة Node مستقرة وخفيفة مبنية على Debian
FROM node:18-slim

# 2. تثبيت الحزم والمتصفح الخفي (Chromium) والخطوط اللازمة لتفادي مشاكل الـ Sandbox في لينكس
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    libgconf-2-4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libgdk-pixbuf2.0-0 \
    libgtk-3-0 \
    libgbm-dev \
    libnss3 \
    libasound2 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 3. توجيه بيئة الـ Puppeteer لاستخدام المتصفح المثبت في السيرفر مباشرة لتوفير المساحة والرام
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# 4. تحديد مجلد العمل داخل الحاوية
WORKDIR /usr/src/app

# 5. نسخ ملفات الحزم أولاً لتسريع الـ Caching أثناء الـ Build
COPY package*.json ./

# 6. تثبيت مصفوفة الموديولات الخاصة بالـ Production فقط لتوفير المساحة
RUN npm ci --only=production

# 7. نسخ باقي ملفات السورس كود بالكامل إلى الحاوية
COPY . .

# 8. إتاحة البورت 3000 لـ Railway لربط الـ Proxy الداخلي
EXPOSE 3000

# 9. أمر التشغيل الأساسي للمشروع موجه لملف index.js لإنهاء مشكلة عدم الاستجابة
CMD ["node", "index.js"]
