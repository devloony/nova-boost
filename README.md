# NOVA BOOST — Bothost

## Запуск
1. Node.js 20/22.
2. Главный файл: `bot.js`.
3. Порт: `3000` (или значение `PORT`).
4. Переменные: `BOT_TOKEN`, `PORT`, `WEBAPP_URL`, `DATA_DIR`.

## Что внутри
- Mini App с режимами Allies/MM.
- Переход только на следующее звание.
- Варианты «Со входом/Без входа».
- Оплата: рубли, Gold, Telegram Stars.
- Telegram Stars через `createInvoiceLink`, pre-checkout и successful payment.
- Заказы хранятся в `data/orders.json`.
- Отзывы и модерация в `data/reviews.json`.
- Админ-панель `/admin`, доступ только Telegram ID `7859115911`.
- Поддержка: `@tacxsa`.

## Важно
Рубли и Gold в этой версии оформляются как заказ с переходом к `@tacxsa`; автоматическая оплата для них не подключена. Stars оплачиваются через Telegram.
