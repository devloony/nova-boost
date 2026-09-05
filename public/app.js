const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const ranks = ["Phoenix", "Ranger", "Champion", "Master", "Elite", "Legend"];
let fromRank = null;
let toRank = null;

// Пока цены не заданы пользователем.
// Здесь можно позже поставить реальные цены для каждого перехода.
const PRICE_PER_STEP = 0;

const fromRanks = document.getElementById("fromRanks");
const toRanks = document.getElementById("toRanks");
const selection = document.getElementById("selection");
const price = document.getElementById("price");
const orderBtn = document.getElementById("orderBtn");
const message = document.getElementById("message");

function renderRanks() {
  fromRanks.innerHTML = "";
  toRanks.innerHTML = "";

  ranks.forEach((rank, index) => {
    const from = createRankButton(rank, index, "from");
    const to = createRankButton(rank, index, "to");

    fromRanks.appendChild(from);
    toRanks.appendChild(to);
  });
}

function createRankButton(rank, index, type) {
  const btn = document.createElement("button");
  btn.className = "rank";
  btn.innerHTML = `
    <span class="rank-name">${rank}</span>
    <span class="rank-num">${index + 1}/6</span>
  `;

  if (type === "from" && fromRank === rank) btn.classList.add("selected");
  if (type === "to" && toRank === rank) btn.classList.add("selected");

  // Желаемое звание должно быть выше текущего.
  if (type === "to" && fromRank !== null && index <= ranks.indexOf(fromRank)) {
    btn.classList.add("disabled");
    btn.disabled = true;
  }

  btn.addEventListener("click", () => {
    if (type === "from") {
      fromRank = rank;

      // Сбрасываем цель, если она теперь недопустима.
      if (toRank && ranks.indexOf(toRank) <= index) {
        toRank = null;
      }
    } else {
      toRank = rank;
    }

    update();
  });

  return btn;
}

function update() {
  renderRanks();

  if (fromRank && toRank) {
    const steps = ranks.indexOf(toRank) - ranks.indexOf(fromRank);
    selection.textContent = `${fromRank} → ${toRank}`;
    price.textContent = PRICE_PER_STEP > 0
      ? `${steps * PRICE_PER_STEP} ₽`
      : "Цена скоро";

    orderBtn.disabled = false;
  } else {
    selection.textContent = "Выберите два звания";
    price.textContent = "— ₽";
    orderBtn.disabled = true;
  }
}

orderBtn.addEventListener("click", async () => {
  if (!fromRank || !toRank) return;

  orderBtn.disabled = true;
  orderBtn.textContent = "ОБРАБОТКА...";

  try {
    const response = await fetch("/api/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromRank, toRank })
    });

    const data = await response.json();

    message.textContent = data.message || "Заявка создана.";
    message.style.display = "block";

    if (tg?.HapticFeedback) {
      tg.HapticFeedback.notificationOccurred("success");
    }
  } catch (error) {
    message.textContent = "Не удалось отправить заявку. Попробуйте ещё раз.";
    message.style.display = "block";
  } finally {
    orderBtn.disabled = false;
    orderBtn.textContent = "ЗАКАЗАТЬ БУСТ";
  }
});

document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", () => {
    const target = item.dataset.page;

    document.querySelectorAll(".page").forEach((page) => {
      page.classList.toggle("active", page.id === target);
    });

    document.querySelectorAll(".nav-item").forEach((nav) => {
      nav.classList.toggle("active", nav === item);
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

renderRanks();
update();
