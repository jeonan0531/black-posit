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

  // 저장에 실패하면 원래 메모를 유지
  if (!save(DISCARD_KEY, next)) return false;

  discarded = next;
  updateBadge();
  return true;
}

/* ----- 포스트잇 뭉치 ----- */

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

  /* 저장된 필기 불러오기 */

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

  /* ----- 애플펜슬 / 마우스 필기 ----- */

  canvas.addEventListener("pointerdown", function (e) {
    // 손가락과 손바닥은 필기에 사용하지 않음
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

    // 펜슬을 살짝 찍어도 점이 남도록 처리
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(last.x + 0.01, last.y);
    ctx.stroke();

    if (strokeTool === "pen") hasInk = true;
  }, { passive: false });

  canvas.addEventListener("pointermove", function (e) {
    // 현재 필기 중인 펜슬 입력만 처리
    if (!drawing || e.pointerId !== activePointerId) return;

    e.preventDefault();

    // 브라우저가 모아둔 세부 이동 좌표를 함께 사용
    const points =
      typeof e.getCoalescedEvents === "function"
        ? e.getCoalescedEvents()
        : [];

    const samples = points.length ? points : [e];

    for (const sample of samples) {
      const p = pos(sample);

      ctx.lineWidth = lineWidth(sample);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();

      last = p;
    }
  }, { passive: false });

  function endDraw(e) {
    // 손바닥이 떨어지는 이벤트로 필기를 끝내지 않음
    if (e.pointerId !== activePointerId) return;

    const pointerId = activePointerId;

    drawing = false;
    activePointerId = null;
    last = null;

    if (canvas.hasPointerCapture(pointerId)) {
      canvas.releasePointerCapture(pointerId);
    }

    save(padKey, canvas.toDataURL("image/png"));
  }

  canvas.addEventListener("pointerup", endDraw);
  canvas.addEventListener("pointercancel", endDraw);
  canvas.addEventListener("lostpointercapture", endDraw);

  /* ----- 종이 아래쪽을 밀어 넘기기 ----- */

  let startY = null;
  let dy = 0;
  let peelPointerId = null;

  peel.addEventListener("pointerdown", function (e) {
    // 필기 중 손바닥이 닿아도 종이를 넘기지 않음
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

  function resetSheet() {
    sheet.style.transition = "transform 0.25s, opacity 0.25s";
    sheet.style.transform = "";
    sheet.style.opacity = "1";
  }

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

    // 先に保存し、失敗した場合は元のメモを残す
    if (hasInk && !addDiscard(cfg, canvas)) {
      resetSheet();
      return;
    }

    tearing = true;

    sheet.style.transition = "transform 0.3s, opacity 0.3s";
    sheet.style.transform =
      "translateY(-" + sheet.offsetHeight * 1.2 + "px)";
    sheet.style.opacity = "0";

    setTimeout(function () {
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, SIZE, SIZE);
      hasInk = false;

      try {
        localStorage.removeItem(padKey);
      } catch (e) {
        // 화면 초기화는 계속 진행
      }

      sheet.style.transition = "none";
      sheet.style.transform = "";

      // 위치를 먼저 되돌린 뒤 새 종이를 표시
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

/* ----- 휴지통 화면 ----- */

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
