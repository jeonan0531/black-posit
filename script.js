const SIZE = 800;
const DISCARD_KEY = "blackpostit-discarded";

const PADS = [
  {
    id: "yellow",
    color: "#ffe45c",
    mid: "#ecd13f",
    back: "#d9bd2e"
  },
  {
    id: "pink",
    color: "#ffa6c9",
    mid: "#f28db5",
    back: "#e07fa6"
  }
];

let tool = "pen";

function load(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (e) {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    alert("저장 공간이 가득 찼어요. 휴지통을 비워주세요.");
    return false;
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

  const ctx = tmp.getContext("2d");
  ctx.fillStyle = cfg.color;
  ctx.fillRect(0, 0, 400, 400);
  ctx.drawImage(canvas, 0, 0, 400, 400);

  const next = discarded.concat({
    img: tmp.toDataURL("image/jpeg", 0.8)
  });

  if (next.length > 100) next.shift();
  if (!save(DISCARD_KEY, next)) return false;

  discarded = next;
  updateBadge();
  return true;
}

/* ----- 포스트잇 ----- */

function buildPad(cfg) {
  const pad = document.createElement("div");
  pad.className = "pad";
  pad.style.setProperty("--c", cfg.color);
  pad.style.setProperty("--mid", cfg.mid);
  pad.style.setProperty("--back", cfg.back);

  pad.innerHTML = `
    <div class="layer back"></div>
    <div class="layer mid"></div>
    <div class="sheet">
      <canvas width="${SIZE}" height="${SIZE}"></canvas>
      <div class="peel"></div>
    </div>
  `;

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
  let activePointerId = null;
  let strokeTool = "pen";
  let tearing = false;
  let restoring = false;

  let saveTimer = null;
  let dirty = false;

  let startY = null;
  let dy = 0;
  let peelPointerId = null;

  /* ----- 저장 ----- */

  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;

    if (!dirty || restoring || tearing) return;

    if (save(padKey, canvas.toDataURL("image/png"))) {
      dirty = false;
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);

    saveTimer = setTimeout(function () {
      saveTimer = null;

      // 펜슬이 닿아 있는 동안에는 저장하지 않음
      if (drawing) return;

      saveNow();
    }, 800);
  }

  // 다른 앱으로 이동하거나 페이지를 떠날 때 저장 시도
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      saveNow();
    }
  });

  window.addEventListener("pagehide", saveNow);

  /* ----- 기존 필기 불러오기 ----- */

  const saved = load(padKey, null);

  if (saved) {
    restoring = true;

    const img = new Image();

    img.onload = function () {
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
      hasInk = true;
      restoring = false;
    };

    img.onerror = function () {
      restoring = false;
    };

    img.src = saved;
  }

  function pos(e) {
    const rect = canvas.getBoundingClientRect();

    return {
      x: (e.clientX - rect.left) * SIZE / rect.width,
      y: (e.clientY - rect.top) * SIZE / rect.height
    };
  }

  function lineWidth(e) {
    if (strokeTool === "eraser") return 40;

    if (e.pointerType === "pen") {
      const pressure = e.pressure > 0 ? e.pressure : 0.5;
      return 4 + pressure * 8;
    }

    return 7;
  }

  function drawTo(e) {
    const point = pos(e);

    ctx.lineWidth = lineWidth(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();

    last = point;
    dirty = true;
  }

  /* ----- 애플펜슬 / 마우스 필기 ----- */

  canvas.addEventListener("pointerdown", function (e) {
    // 손가락과 손바닥 입력 무시
    if (e.pointerType === "touch") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;

    if (
      activePointerId !== null ||
      tearing ||
      restoring ||
      startY !== null
    ) {
      return;
    }

    e.preventDefault();

    // 다음 획을 쓰기 시작하면 예약된 저장 취소
    clearTimeout(saveTimer);
    saveTimer = null;

    activePointerId = e.pointerId;
    drawing = true;
    strokeTool = tool;
    last = pos(e);

    canvas.setPointerCapture(e.pointerId);

    ctx.globalCompositeOperation =
      strokeTool === "eraser"
        ? "destination-out"
        : "source-over";

    ctx.lineWidth = lineWidth(e);

    // 짧게 찍어도 점이 남도록 처리
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(last.x + 0.01, last.y);
    ctx.stroke();

    dirty = true;

    if (strokeTool === "pen") {
      hasInk = true;
    }
  }, { passive: false });

  canvas.addEventListener("pointermove", function (e) {
    if (!drawing || e.pointerId !== activePointerId) return;

    e.preventDefault();

    const points =
      typeof e.getCoalescedEvents === "function"
        ? e.getCoalescedEvents()
        : [];

    const samples = points.length ? points : [e];

    for (const sample of samples) {
      drawTo(sample);
    }
  }, { passive: false });

  function endDraw(e) {
    // 손바닥의 이벤트로 펜슬 필기를 끝내지 않음
    if (e.pointerId !== activePointerId) return;

    if (e.type === "pointerup" && last) {
      drawTo(e);
    }

    const pointerId = activePointerId;

    drawing = false;
    activePointerId = null;
    last = null;

    if (canvas.hasPointerCapture(pointerId)) {
      canvas.releasePointerCapture(pointerId);
    }

    // 즉시 저장하지 않고 필기가 멈출 때까지 기다림
    scheduleSave();
  }

  canvas.addEventListener("pointerup", endDraw);
  canvas.addEventListener("pointercancel", endDraw);
  canvas.addEventListener("lostpointercapture", endDraw);

  /* ----- 종이 넘기기 ----- */

  function resetSheet() {
    sheet.style.transition = "transform 0.25s, opacity 0.25s";
    sheet.style.transform = "";
    sheet.style.opacity = "1";
  }

  peel.addEventListener("pointerdown", function (e) {
    if (
      drawing ||
      tearing ||
      restoring ||
      peelPointerId !== null
    ) {
      return;
    }

    if (e.pointerType === "mouse" && e.button !== 0) return;

    e.preventDefault();

    peelPointerId = e.pointerId;
    startY = e.clientY;
    dy = 0;

    peel.setPointerCapture(e.pointerId);
    sheet.style.transition = "none";
  }, { passive: false });

  peel.addEventListener("pointermove", function (e) {
    if (
      startY === null ||
      e.pointerId !== peelPointerId
    ) {
      return;
    }

    e.preventDefault();

    dy = Math.min(0, e.clientY - startY);

    sheet.style.transform =
      "translateY(" + dy + "px) rotate(" + dy / 200 + "deg)";
  }, { passive: false });

  function endPeel(e) {
    if (
      startY === null ||
      e.pointerId !== peelPointerId
    ) {
      return;
    }

    const shouldTear =
      e.type === "pointerup" &&
      -dy > sheet.offsetHeight * 0.3;

    const pointerId = peelPointerId;

    startY = null;
    peelPointerId = null;
    dy = 0;

    if (peel.hasPointerCapture(pointerId)) {
      peel.releasePointerCapture(pointerId);
    }

    if (shouldTear) {
      tear();
    } else {
      resetSheet();
    }
  }

  peel.addEventListener("pointerup", endPeel);
  peel.addEventListener("pointercancel", endPeel);
  peel.addEventListener("lostpointercapture", endPeel);

  function tear() {
    if (tearing || drawing || restoring) return;

    clearTimeout(saveTimer);
    saveTimer = null;

    // 휴지통 저장에 실패하면 원래 종이를 유지
    if (hasInk && !addDiscard(cfg, canvas)) {
      resetSheet();
      scheduleSave();
      return;
    }

    tearing = true;

    sheet.style.transition = "transform 0.3s, opacity 0.3s";
    sheet.style.transform =
      "translateY(-" + sheet.offsetHeight * 1.2 + "px)";
    sheet.style.opacity = "0";

    // 휴지통에 저장한 뒤 현재 메모 저장값 제거
    try {
      localStorage.removeItem(padKey);
    } catch (e) {
      // 애니메이션은 계속 진행
    }

    dirty = false;

    setTimeout(function () {
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, SIZE, SIZE);
      hasInk = false;

      sheet.style.transition = "none";
      sheet.style.transform = "";

      void sheet.offsetHeight;

      sheet.style.transition = "opacity 0.25s";
      sheet.style.opacity = "1";

      tearing = false;
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

  penBtn.setAttribute("aria-pressed", String(name === "pen"));
  eraserBtn.setAttribute("aria-pressed", String(name === "eraser"));
}

penBtn.addEventListener("click", function () {
  setTool("pen");
});

eraserBtn.addEventListener("click", function () {
  setTool("eraser");
});

/* ----- 휴지통 ----- */

let selMode = false;
let picked = {};
let menuOpen = -1;

function removeItems(list) {
  const next = discarded.filter(function (_, i) {
    return !list.includes(i);
  });

  if (!save(DISCARD_KEY, next)) return;

  discarded = next;
  picked = {};
  menuOpen = -1;

  updateBadge();
  renderTrash();
}

function renderTrash() {
  grid.innerHTML = "";

  const count = discarded.length;

  if (count === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "버린 포스트잇이 없어요";
    grid.appendChild(empty);
  }

  for (let pos = 0; pos < count; pos++) {
    const real = count - 1 - pos;

    const item = document.createElement("div");
    item.className = "item";

    const thumb = document.createElement("button");
    thumb.className = "thumb" + (picked[real] ? " on" : "");
    thumb.setAttribute("aria-label", (pos + 1) + "번 포스트잇");

    const img = document.createElement("img");
    img.src = discarded[real].img;
    img.alt = "";

    const check = document.createElement("span");
    check.className = "check";
    check.textContent = "✓";

    thumb.appendChild(img);
    thumb.appendChild(check);

    thumb.addEventListener("click", function () {
      if (!selMode) return;

      if (picked[real]) {
        delete picked[real];
      } else {
        picked[real] = true;
      }

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
      menuOpen = menuOpen === real ? -1 : real;
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
  delBtn.textContent =
    "삭제 (" + Object.keys(picked).length + ")";
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

  discarded.forEach(function (_, i) {
    picked[i] = true;
  });

  renderTrash();
});

delBtn.addEventListener("click", function () {
  const list = Object.keys(picked).map(Number);

  if (list.length > 0) {
    removeItems(list);
  }
});

/* ----- 시작 ----- */

PADS.forEach(buildPad);
setTool("pen");
updateBadge();
