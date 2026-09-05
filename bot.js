require("dotenv").config();

const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const token = process.env.BOT_TOKEN;
const webAppUrl = process.env.WEBAPP_URL || (process.env.DOMAIN ? `https://${process.env.DOMAIN}` : "");
const port = process.env.PORT || 3000;

if (!token) {
  console.error("BOT_TOKEN is not set.");
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use(express.static("public"));

app.get("/health", (req, res) => res.json({ ok: true }));

app.post("/api/order", (req, res) => {
  const { fromRank, toRank } = req.body;
  if (!fromRank || !toRank) return res.status(400).json({ ok: false, error: "Choose both ranks" });
  console.log("New demo order:", { fromRank, toRank });
  res.json({ ok: true, message: "Заявка создана. Оплата и обработка заказа будут подключены позже." });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Mini App server started on port ${port}`);
});

const bot = new TelegramBot(token, { polling: true });

bot.onText(/\/start/, async (msg) => {
  const text = `🚀 Nova Boost — сервис буста в Standoff 2

Помогаем быстро достичь желаемого ранга. Надёжное выполнение, опытные бустеры и удобное оформление заказа.

👇 Выбери нужную услугу в Mini App и оформи заказ за пару минут.`;

  const options = webAppUrl
    ? {
        reply_markup: {
          keyboard: [[{ text: "🛒 Открыть Nova Boost", web_app: { url: webAppUrl } }]],
          resize_keyboard: true,
          is_persistent: true
        }
      }
    : {};

  await bot.sendMessage(msg.chat.id, text, options);
});

bot.on("polling_error", (error) => console.error("Telegram polling error:", error.message));
