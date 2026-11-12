# 📦 Bigant Sklad — Telegram bot + Mini App

Ombor (sklad) hisob-kitobi: sotuvchilar qarzdorligi, to'lovlar, chek/platyojkani
sun'iy intellekt bilan o'qish, Excel hisobotlar. Cloudflare Workers ustida ishlaydi.

> ⚠️ **Ma'lumot haqida:** bu ochiq repozitoriy. Barcha Telegram ID lari **soxta**
> (`7000000001`…), guruh ID lari soxta, boshlang'ich qarz raqamlari **namuna**.
> Bot tokeni va API kalitlari kodda yo'q — ular Cloudflare secret'ida turadi.

## Nima qiladi

| Bo'lim | Ish |
|---|---|
| 📊 **Qarzdorlik** | Har sotuvchining qarzi — dollarda, sana oralig'i bo'yicha |
| 🧾 **Chek o'qish** | Platyojka rasmini AI o'qiydi: summa, sana, firma, INN |
| 💵 **Pul chiqarish** | Sotuvchi so'rov yuboradi → buxgalter chek tashlaydi → tasdiq |
| 📥 **Sklad fayli** | Buxgalteriyaning .xlsx fayli yuklanadi, qatorlar sotuvchilarga bo'linadi |
| 🔍 **Xato topish** | Tizim shubhali qatorlarni o'zi topadi; qidirish, tahrir, o'chirish |
| 📑 **Excel** | Batafsil hisobot — mahsulotlar so'mda, to'lovlar va jami dollarda |

## Muhim qoidalar (jonli xatolardan chiqqan)

1. **Summa ikki joydan o'qiladi** — raqamda va so'zda. Farq qilsa **so'zdagisi to'g'ri**
   (bank qoidasi; AI raqamda nol qo'shib/tushirib yuboradi).
2. **Chek summasi so'rovdagiga AYNAN teng** bo'lishi shart. Kam yoki ko'p bo'lsa —
   buxgalter va superadminga ogohlantirish + bekor qilish tugmasi.
3. **AI summani o'ylab topishi mumkin.** 2026-yil oktyabrda bir model 13,6 mln lik
   chekka «20 000 000» degan. Shuning uchun model javobi kutilgan summa bilan
   solishtiriladi va shubhali bo'lsa 2–3 marta qayta o'qiladi.
4. **Eski chek tekshiriladi** — chek sanasi so'rov sanasidan oldin bo'lsa, ogohlantiradi.
5. **Dollar hisobi:** har mahsulot o'z davrining muhrlangan kursiga bo'linadi,
   har to'lov o'z kursiga. Kurs keyin o'zgarsa, o'tgan hisob o'zgarmaydi.
6. **KV eventually consistent** — kutilayotgan fayl yozuvi D1 (SQL) da saqlanadi,
   aks holda salbiy o'qish ~60 sekund keshlanib, foydalanuvchi kutib qoladi.

## Tuzilishi

```
src/
  ombor.js        ombor yadrosi: qarz, to'lov, chek o'qish (chekOqi), Excel
  pdfkut.js       botga tashlangan faylni kutish (D1 — strongly consistent)
  sklad.js        buxgalteriya faylini o'qish, sotuvchi bloklarini ajratish
  sotuvchilar.js  sotuvchilar ro'yxati va nomlari
  sorovnoma.js    pul chiqarish so'rovlari
  xlsx.js         .xlsx o'qish          xlsxout.js   .xlsx yozish (stillar bilan)
  pdfoqi.js       PDF matnini olish     sozsumma.js  «o'n uch million» → 13600000
  gemini.js       zaxira AI o'quvchi    taqiq.js     yozish taqig'i (bo'sh namuna)
src/app/          Mini App tomoni
  mahsulot.js     yuklangan ma'lumotlar: tasdiq, tekshirish, qidiruv, tahrir
  sorov.js        so'rovlar: pul, karta, fayldan summa
  umumiy.js       batafsil Excel (uchta blok yonma-yon)
  hisob.js        davr bo'yicha qarz, to'lov tarixi, batafsil
  excel.js        Excel jadvallari         omborexcel.js  Excel havolalari
  rollar.js       rollar va kurs           tgapi.js       Telegram API
  tma.js          Mini App initData tekshiruvi
app/src/          Svelte 5 (runes) ekranlari
```

## Ishga tushirish

```bash
cp wrangler.toml.example wrangler.toml   # id larni o'zingiznikiga almashtiring
npx wrangler secret put BOT_TOKEN
npx wrangler deploy
```

## Nima kirmagan

- **Ma'lumot** — hech qanday jonli qarz, to'lov, sotuvchi yozuvi yo'q
- **HTTP router** (`src/app/api.js`) — ishchi loyihada u sherigimning boshqa
  moduli bilan bitta faylda turadi, shuning uchun bu repozitoriyga kirmadi
- **Sherigimning moduli** — umuman kirmagan

---

Muallif: **Doston Bunyodov** · [@dostonbunyodov0006](https://github.com/dostonbunyodov0006)
