const SIZE = 800;
const DISCARD_KEY = "blackpostit-discarded";
const PADS = [
  { id: "yellow", color: "#ffe45c", mid: "#ecd13f", back: "#d9bd2e" },
  { id: "pink",   color: "#ffa6c9", mid: "#f28db5", back: "#e07fa6" }
];

let tool = "pen";

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch (e) { return fallback; }
}
function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    alert("저장 공간이 가득 찼어요. 휴지통을 비워주세요.");
  }
}

let discarded = load(DISCARD_KEY, []);
const badge = document.getElementById("badge");
const overlay = document.getElementById("overlay");
const grid = document.getElementById("grid");
const bar = document.getElementById("bar");
const selBtn = document.getElementById("selBtn");
const delBtn = document.getElementById("delBtn");

function updateBadge() {
  badge.textContent = discarded.length;
}

function addDiscard(cfg, canvas) {
  const tmp = document.createElement("canvas");
  tmp.width = 400;
  tmp.height = 400;
  const t = tmp.getContext("2d");
  t.fillStyle = cfg.color;
  t.fillRect(0, 0, 400, 400);
  t.drawImage(canvas, 0, 0, 400, 400);
  discarded.push({ img: tmp.toDataURL("image/jpeg", 0.8) });
  if (discarded.length > 100) discarded.shift();
  save(DISCARD_KEY, discarded);
  updateBadge();
}

/* ----- 포스트잇 뭉치 ----- */
function buildPad(cfg) {
  const pad = document.createElement("div");
  pad.className = "pad";
  pad.style.setProperty("--c", cfg.color);
  pad.style.setProperty("--mid", cfg.mid);
  pad.style.setProperty("--back", cfg.back);
  pad.innerHTML =
    '<div class="layer back"></div>' +
    '<div class="layer mid"></div>' +
    '<div class="sheet"><canvas width="' + SIZE + '" height="' + SIZE + '"></canvas>' +
    '<div class="peel"></div></div>';
  document.getElementById("board").appendChild(pad);

  const sheet = pad.querySelector(".sheet");
  const canvas = pad.querySelector("canvas");
  const peel = pad.querySelector(".peel");
  const ctx = canvas.getContext("2d");
  const padKey = "blackpostit-pad-" + cfg.id;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#1a1a1a";

  let hasInk = false;
  let drawing = false;
  let last = null;

  const saved = load(padKey, null);
  if (saved) {
    const img = new Image();
    img.onload = function () {
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
      hasInk = true;
    };
    img.src = saved;
  }

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * SIZE / r.width,
      y: (e.clientY - r.top) * SIZE / r.height
    };
  }

  canvas.addEventListener("pointerdown", function (e) {
    drawing = true;
    canvas.setPointerCapture(e.pointerId);
    last = pos(e);
    ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    ctx.lineWidth = tool === "eraser" ? 40 : 7;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(last.x + 0.01, last.y);
    ctx.stroke();
    hasInk = true;
  });

  canvas.addEventListener("pointermove", function (e) {
    if (!drawing) return;
    const p = pos(e);
    ctx.lineWidth = tool === "eraser" ? 40 : (e.pointerType === "pen" ? 4 + (e.pressure || 0.5) * 8 : 7);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
  });

  function endDraw() {
    if (!drawing) return;
    drawing = false;
    save(padKey, canvas.toDataURL("image/png"));
  }
  canvas.addEventListener("pointerup", endDraw);
  canvas.addEventListener("pointercancel", endDraw);

  let startY = null;
  let dy = 0;

  peel.addEventListener("pointerdown", function (e) {
    startY = e.clientY;
    dy = 0;
    peel.setPointerCapture(e.pointerId);
    sheet.style.transition = "none";
  });

  peel.addEventListener("pointermove", function (e) {
    if (startY === null) return;
    dy = Math.min(0, e.clientY - startY);
    sheet.style.transform = "translateY(" + dy + "px) rotate(" + dy / 200 + "deg)";
  });

  function endPeel() {
    if (startY === null) return;
    startY = null;
    if (-dy > sheet.offsetHeight * 0.3) {
      tear();
    } else {
      sheet.style.transition = "transform 0.25s";
      sheet.style.transform = "";
    }
  }
  peel.addEventListener("pointerup", endPeel);
  peel.addEventListener("pointercancel", endPeel);

  function tear() {
    sheet.style.transition = "transform 0.3s, opacity 0.3s";
    sheet.style.transform = "translateY(-" + sheet.offsetHeight * 1.2 + "px)";
    sheet.style.opacity = "0";
    setTimeout(function () {
      if (hasInk) addDiscard(cfg, canvas);
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, SIZE, SIZE);
      hasInk = false;
      localStorage.removeItem(padKey);
      sheet.style.transition = "none";
      sheet.style.transform = "";
      sheet.offsetHeight;
      sheet.style.transition = "opacity 0.25s";
      sheet.style.opacity = "1";
    }, 300);
  }
}

/* ----- 연필 / 지우개 ----- */
const penBtn = document.getElementById("penBtn");
const eraserBtn = document.getElementById("eraserBtn");

function setTool(name) {
  tool = name;
  penBtn.classList.toggle("on", name === "pen");
  eraserBtn.classList.toggle("on", name === "eraser");
}
penBtn.addEventListener("click", function () { setTool("pen"); });
eraserBtn.addEventListener("click", function () { setTool("eraser"); });

/* ----- 휴지통 화면 ----- */
let selMode = false;
let picked = {};
let menuOpen = -1;

function removeItems(list) {
  discarded = discarded.filter(function (_, i) {
    return list.indexOf(i) < 0;
  });
  save(DISCARD_KEY, discarded);
  picked = {};
  menuOpen = -1;
  updateBadge();
  renderTrash();
}

function renderTrash() {
  grid.innerHTML = "";
  const n = discarded.length;

  if (n === 0) {
    const p = document.createElement("div");
    p.className = "empty";
    p.textContent = "버린 포스트잇이 없어요";
    grid.appendChild(p);
  }

  for (let pos = 0; pos < n; pos++) {
    const real = n - 1 - pos;
    const item = document.createElement("div");
    item.className = "item";

    const thumb = document.createElement("button");
    thumb.className = "thumb" + (picked[real] ? " on" : "");
    thumb.innerHTML = '<img src="' + discarded[real].img + '" alt=""><span class="check">✓</span>';
    thumb.addEventListener("click", function () {
      if (!selMode) return;
      if (picked[real]) delete picked[real];
      else picked[real] = true;
      renderTrash();
    });

    const label = document.createElement("div");
    label.className = "label";
    const num = document.createElement("span");
    num.textContent = pos + 1;
    const more = document.createElement("button");
    more.textContent = "⌄";
    more.setAttribute("aria-label", (pos + 1) + "번 메뉴");
    more.addEventListener("click", function () {
      menuOpen = (menuOpen === real) ? -1 : real;
      renderTrash();
    });
    label.appendChild(num);
    label.appendChild(more);

    item.appendChild(thumb);
    item.appendChild(label);

    if (menuOpen === real && !selMode) {
      const menu = document.createElement("div");
      menu.className = "menu";
      const del = document.createElement("button");
      del.textContent = "삭제";
      del.addEventListener("click", function () {
        removeItems([real]);
      });
      menu.appendChild(del);
      item.appendChild(menu);
    }
    grid.appendChild(item);
  }

  bar.hidden = !selMode;
  selBtn.textContent = selMode ? "완료" : "선택";
  delBtn.textContent = "삭제 (" + Object.keys(picked).length + ")";
}

document.getElementById("trashBtn").addEventListener("click", function () {
  selMode = false;
  picked = {};
  menuOpen = -1;
  renderTrash();
  overlay.hidden = false;
});
document.getElementById("closeBtn").addEventListener("click", function () {
  overlay.hidden = true;
});
selBtn.addEventListener("click", function () {
  selMode = !selMode;
  picked = {};
  menuOpen = -1;
  renderTrash();
});
document.getElementById("allBtn").addEventListener("click", function () {
  picked = {};
  discarded.forEach(function (_, i) { picked[i] = true; });
  renderTrash();
});
delBtn.addEventListener("click", function () {
  const list = Object.keys(picked).map(Number);
  if (list.length > 0) removeItems(list);
});

PADS.forEach(buildPad);
updateBadge();