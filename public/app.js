const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

const ranks = [
  { name: "Phoenix", image: "ranks/rank1.png?v=3" },
  { name: "Ranger", image: "ranks/rank2.png?v=3" },
  { name: "Champion", image: "ranks/rank3.png?v=3" },
  { name: "Master", image: "ranks/rank4.png?v=3" },
  { name: "Elite", image: "ranks/rank5.png?v=3" },
  { name: "The Legend", image: "ranks/rank6.png?v=3" }
];

let fromRank = null;
let toRank = null;
const PRICE_PER_STEP = 0; // Поставь цену за один переход, когда определишь прайс.

const fromSelect = document.getElementById("fromSelect");
const toSelect = document.getElementById("toSelect");
const fromOptions = document.getElementById("fromOptions");
const toOptions = document.getElementById("toOptions");
const fromSelectedText = document.getElementById("fromSelectedText");
const toSelectedText = document.getElementById("toSelectedText");
const selection = document.getElementById("selection");
const price = document.getElementById("price");
const orderBtn = document.getElementById("orderBtn");
const message = document.getElementById("message");

function haptic(type = "selectionChanged") {
  if (!tg?.HapticFeedback) return;
  if (type === "success" || type === "error") tg.HapticFeedback.notificationOccurred(type);
  else tg.HapticFeedback.impactOccurred("light");
}

function rankByName(name) { return ranks.find(r => r.name === name); }

function renderOptions(container, type) {
  container.innerHTML = "";
  ranks.forEach((rank, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rank-option";

    const selected = type === "from" ? fromRank === rank.name : toRank === rank.name;
    if (selected) button.classList.add("selected");

    const fromIndex = fromRank ? ranks.findIndex(r => r.name === fromRank) : -1;
    if (type === "to" && fromIndex >= 0 && index <= fromIndex) {
      button.classList.add("disabled");
      button.disabled = true;
    }

    button.innerHTML = `
      <img src="${rank.image}" alt="${rank.name}">
      <span>${rank.name}</span>
      <small>${index + 1}/6</small>
    `;

    button.addEventListener("click", () => {
      if (type === "from") {
        fromRank = rank.name;
        const newFromIndex = ranks.findIndex(r => r.name === fromRank);
        if (toRank && ranks.findIndex(r => r.name === toRank) <= newFromIndex) toRank = null;
      } else {
        toRank = rank.name;
      }
      closeAll();
      update();
      haptic();
    });

    container.appendChild(button);
  });
}

function updateSelected(selectText, type) {
  const selectedName = type === "from" ? fromRank : toRank;
  const rank = selectedName ? rankByName(selectedName) : null;
  const image = selectText.parentElement.querySelector(".selected-rank-image");

  if (rank) {
    selectText.textContent = rank.name;
    image.className = "selected-rank-image";
    image.style.backgroundImage = `url("${rank.image}")`;
    image.style.backgroundSize = "contain";
    image.style.backgroundPosition = "center";
    image.style.backgroundRepeat = "no-repeat";
  } else {
    selectText.textContent = "Выберите звание";
    image.className = "selected-rank-image empty-image";
    image.style.backgroundImage = "none";
  }
}

function update() {
  updateSelected(fromSelectedText, "from");
  updateSelected(toSelectedText, "to");
  renderOptions(fromOptions, "from");
  renderOptions(toOptions, "to");

  if (fromRank && toRank) {
    const steps = ranks.findIndex(r => r.name === toRank) - ranks.findIndex(r => r.name === fromRank);
    selection.textContent = `${fromRank} → ${toRank}`;
    price.textContent = PRICE_PER_STEP > 0 ? `${steps * PRICE_PER_STEP} ₽` : "Цена скоро";
    orderBtn.disabled = false;
  } else {
    selection.textContent = "Выберите два звания";
    price.textContent = "— ₽";
    orderBtn.disabled = true;
  }
}

function toggle(select, options) {
  const isOpen = options.classList.contains("open");
  closeAll();
  if (!isOpen) {
    options.classList.add("open");
    select.classList.add("open");
    select.setAttribute("aria-expanded", "true");
    haptic();
  }
}

function closeAll() {
  [fromSelect, toSelect].forEach(s => { s.classList.remove("open"); s.setAttribute("aria-expanded", "false"); });
  [fromOptions, toOptions].forEach(o => o.classList.remove("open"));
}

fromSelect.addEventListener("click", () => toggle(fromSelect, fromOptions));
toSelect.addEventListener("click", () => toggle(toSelect, toOptions));
fromSelect.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(fromSelect, fromOptions); } });
toSelect.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(toSelect, toOptions); } });
document.addEventListener("click", e => { if (!e.target.closest(".rank-card")) closeAll(); });

orderBtn.addEventListener("click", async () => {
  if (!fromRank || !toRank) return;
  orderBtn.disabled = true;
  orderBtn.querySelector("b").textContent = "ОБРАБОТКА...";
  try {
    const response = await fetch("/api/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromRank, toRank })
    });
    const data = await response.json();
    message.textContent = data.message || "Заявка создана.";
    message.style.display = "block";
    haptic("success");
  } catch (error) {
    message.textContent = "Не удалось отправить заявку. Попробуйте ещё раз.";
    message.style.display = "block";
    haptic("error");
  } finally {
    orderBtn.disabled = false;
    orderBtn.querySelector("b").textContent = "ОПЛАТИТЬ ПОВЫШЕНИЕ";
  }
});

document.querySelectorAll(".nav-item").forEach(item => {
  item.addEventListener("click", () => {
    const target = item.dataset.page;
    document.querySelectorAll(".page").forEach(page => page.classList.toggle("active", page.id === target));
    document.querySelectorAll(".nav-item").forEach(nav => nav.classList.toggle("active", nav === item));
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

update();
