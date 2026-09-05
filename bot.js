require("dotenv").config();

const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const token = process.env.BOT_TOKEN;
const webAppUrl = process.env.WEBAPP_URL;
const port = process.env.PORT || 3000;

if (!token || !webAppUrl) {
  console.error("Set BOT_TOKEN and WEBAPP_URL in .env");
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use(express.static("public"));

app.post("/api/order", (req, res) => {
  const { fromRank, toRank } = req.body;

  if (!fromRank || !toRank) {
    return res.status(400).json({ ok: false, error: "Choose both ranks" });
  }

  // Demo only: payment/database are not connected yet.
  console.log("New demo order:", { fromRank, toRank });

  res.json({
    ok: true,
    message: "Заявка создана. Оплата и обработка заказа будут подключены позже."
  });
});

app.listen(port, () => {
  console.log(`Mini App server: http://localhost:${port}`);
});

const bot = new TelegramBot(token, { polling: true });

bot.onText(/\/start/, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
    "🚀 Добро пожаловать в NOVA BOOST!\n\nВыберите буст в Mini App:",
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🚀 Открыть NOVA BOOST", web_app: { url: webAppUrl } }]
        ]
      }
    }
  );
});
