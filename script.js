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

// 아이패드의 데스크톱 모드도 포함
const IS_APPLE_TOUCH =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (
    navigator.platform === "MacIntel" &&
    navigator.maxTouchPoints > 1
  );

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
    alert("저장하지 못했어요. 저장 공간과 브라우저 설정을 확인해주세요.");
    return false;
  }
}

let discarded = load(DISCARD_KEY, []);

if (!Array.isArray(discarded)) {
  discarded = [];
}

const board = document.getElementById("board");
const badge = document.getElementById("badge");
const overlay = document.getElementById("overlay");
const grid = document.getElementById("grid");
const bar = document.getElementById("bar");
const selBtn = document.getElementById("selBtn");
const delBtn = document.getElementById("delBtn");
const penBtn = document.getElementById("penBtn");
const eraserBtn = document.getElementById("eraserBtn");

function updateBadge() {
  badge.textContent = discarded.length;
}

function addDiscard(cfg, canvas) {
  const thumbnail = document.createElement("canvas");
  thumbnail.width = 400;
  thumbnail.height = 400;

  const ctx = thumbnail.getContext("2d");

  ctx.fillStyle = cfg.color;
  ctx.fillRect(0, 0, 400, 400);
  ctx.drawImage(canvas, 0, 0, 400, 400);

  const next = discarded.concat({
    img: thumbnail.toDataURL("image/jpeg", 0.8)
  });

  if (next.length > 100) {
    next.shift();
  }

  if (!save(DISCARD_KEY, next)) {
    return false;
  }

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

  board.appendChild(pad);

  const sheet = pad.querySelector(".sheet");
  const canvas = pad.querySelector("canvas");
  const peel = pad.querySelector(".peel");
  const ctx = canvas.getContext("2d");
  const padKey = "blackpostit-pad-" + cfg.id;

  canvas.style.touchAction = "none";
  sheet.style.touchAction = "none";

  // 투명 넘기기 영역이 펜슬 필기를 가로막지 않도록 처리.
  // 손가락 넘기기는 아래의 sheet 이벤트에서 처리.
  peel.style.pointerEvents = "none";

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#1a1a1a";

  let hasInk = false;
  let dirty = false;
  let restoring = false;
  let tearing = false;

  let drawing = false;
  let inputKind = null;
  let inputId = null;
  let strokeTool = "pen";
  let lastPoint = null;

  let saveTimer = null;

  let peelId = null;
  let peelStartY = null;
  let peelDy = 0;

  /* ----- 保存 ----- */

  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;

    if (!dirty || restoring || tearing) {
      return;
    }

    if (save(padKey, canvas.toDataURL("image/png"))) {
      dirty = false;
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);

    saveTimer = setTimeout(function () {
      saveTimer = null;

      if (!drawing && peelId === null) {
        saveNow();
      }
    }, 1000);
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      saveNow();
    }
  });

  window.addEventListener("pagehide", saveNow);

  /* ----- 저장된 메모 불러오기 ----- */

  const saved = load(padKey, null);

  if (typeof saved === "string" && saved) {
    restoring = true;

    const image = new Image();

    image.onload = function () {
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(image, 0, 0, SIZE, SIZE);
      hasInk = true;
      restoring = false;
    };

    image.onerror = function () {
      restoring = false;
    };

    image.src = saved;
  }

  /* ----- 공통 필기 처리 ----- */

  function getPoint(input) {
    const rect = canvas.getBoundingClientRect();

    return {
      x: (input.clientX - rect.left) * SIZE / rect.width,
      y: (input.clientY - rect.top) * SIZE / rect.height
    };
  }

  function beginStroke(input, kind, id) {
    if (restoring || tearing) {
      return;
    }

    clearTimeout(saveTimer);
    saveTimer = null;

    // 남아 있는 이전 획 상태가 새 획을 막지 않도록 초기화
    drawing = true;
    inputKind = kind;
    inputId = id;
    strokeTool = tool;
    lastPoint = getPoint(input);

    ctx.globalCompositeOperation =
      strokeTool === "eraser"
        ? "destination-out"
        : "source-over";

    // 우선 일정한 굵기로 필기하여 획 시작을 안정적으로 표시
    ctx.lineWidth = strokeTool === "eraser" ? 40 : 7;

    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(lastPoint.x + 0.01, lastPoint.y);
    ctx.stroke();

    dirty = true;

    if (strokeTool === "pen") {
      hasInk = true;
    }
  }

  function moveStroke(input) {
    if (!drawing || !lastPoint) {
      return;
    }

    const point = getPoint(input);

    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();

    lastPoint = point;
    dirty = true;
  }

  function finishStroke() {
    if (!drawing) {
      return;
    }

    drawing = false;
    inputKind = null;
    inputId = null;
    lastPoint = null;

    scheduleSave();
  }

  /* ----- 종이 넘기기 ----- */

  function resetSheet() {
    sheet.style.transition =
      "transform 0.25s, opacity 0.25s";

    sheet.style.transform = "";
    sheet.style.opacity = "1";
  }

  function beginPeel(input, id) {
    if (
      drawing ||
      tearing ||
      restoring ||
      peelId !== null
    ) {
      return false;
    }

    const rect = sheet.getBoundingClientRect();

    // 손가락이 종이 아래쪽에서 시작할 때만 넘기기
    if (input.clientY < rect.top + rect.height * 0.84) {
      return false;
    }

    clearTimeout(saveTimer);
    saveTimer = null;

    peelId = id;
    peelStartY = input.clientY;
    peelDy = 0;

    sheet.style.transition = "none";

    return true;
  }

  function movePeel(input) {
    if (peelId === null) {
      return;
    }

    peelDy = Math.min(0, input.clientY - peelStartY);

    sheet.style.transform =
      "translateY(" + peelDy + "px) rotate(" +
      peelDy / 200 + "deg)";
  }

  function finishPeel(cancelled) {
    if (peelId === null) {
      return;
    }

    const shouldTear =
      !cancelled &&
      -peelDy > sheet.offsetHeight * 0.3;

    peelId = null;
    peelStartY = null;
    peelDy = 0;

    if (shouldTear) {
      tear();
    } else {
      resetSheet();

      if (dirty) {
        scheduleSave();
      }
    }
  }

  function tear() {
    if (drawing || tearing || restoring) {
      return;
    }

    clearTimeout(saveTimer);
    saveTimer = null;

    if (hasInk && !addDiscard(cfg, canvas)) {
      resetSheet();
      scheduleSave();
      return;
    }

    tearing = true;
    dirty = false;

    try {
      localStorage.removeItem(padKey);
    } catch (e) {
      // メモは休止せず画面更新を継続
    }

    sheet.style.transition =
      "transform 0.3s, opacity 0.3s";

    sheet.style.transform =
      "translateY(-" + sheet.offsetHeight * 1.2 + "px)";

    sheet.style.opacity = "0";

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

  /* ----- 아이패드: Touch Events로 펜슬 처리 ----- */

  if (IS_APPLE_TOUCH) {
    function findTouch(list, id) {
      for (let i = 0; i < list.length; i++) {
        if (list[i].identifier === id) {
          return list[i];
        }
      }

      return null;
    }

    sheet.addEventListener("touchstart", function (e) {
      if (e.cancelable) {
        e.preventDefault();
      }

      // 펜슬을 손가락·손바닥보다 우선 처리
      let pencil = null;

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];

        if (touch.touchType === "stylus") {
          pencil = touch;
          break;
        }
      }

      if (pencil) {
        finishPeel(true);

        beginStroke(
          pencil,
          "pencil-touch",
          pencil.identifier
        );

        return;
      }

      if (drawing || tearing || restoring) {
        return;
      }

      // 손가락은 아래쪽 넘기기만 사용
      if (peelId === null) {
        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i];

          if (beginPeel(touch, touch.identifier)) {
            break;
          }
        }
      }
    }, { passive: false });

    sheet.addEventListener("touchmove", function (e) {
      if (e.cancelable) {
        e.preventDefault();
      }

      if (drawing && inputKind === "pencil-touch") {
        const pencil = findTouch(
          e.changedTouches,
          inputId
        );

        if (pencil) {
          moveStroke(pencil);
        }

        return;
      }

      if (peelId !== null) {
        const finger = findTouch(
          e.changedTouches,
          peelId
        );

        if (finger) {
          movePeel(finger);
        }
      }
    }, { passive: false });

    function endTouch(e) {
      if (e.cancelable) {
        e.preventDefault();
      }

      if (drawing && inputKind === "pencil-touch") {
        const pencil = findTouch(
          e.changedTouches,
          inputId
        );

        if (pencil) {
          if (e.type === "touchend") {
            moveStroke(pencil);
          }

          finishStroke();
        }
      }

      if (
        peelId !== null &&
        findTouch(e.changedTouches, peelId)
      ) {
        finishPeel(e.type === "touchcancel");
      }
    }

    sheet.addEventListener(
      "touchend",
      endTouch,
      { passive: false }
    );

    sheet.addEventListener(
      "touchcancel",
      endTouch,
      { passive: false }
    );
  }

  /* ----- 맥북·기타 기기: Pointer Events ----- */

  sheet.addEventListener("pointerdown", function (e) {
    // 아이패드의 펜슬·손가락은 위 Touch Events에서 처리
    if (IS_APPLE_TOUCH && e.pointerType !== "mouse") {
      return;
    }

    if (e.pointerType === "mouse" && e.button !== 0) {
      return;
    }

    if (tearing || restoring) {
      return;
    }

    e.preventDefault();

    if (e.pointerType === "touch") {
      if (beginPeel(e, e.pointerId)) {
        sheet.setPointerCapture(e.pointerId);
      }

      return;
    }

    finishPeel(true);

    beginStroke(e, "pointer", e.pointerId);
    sheet.setPointerCapture(e.pointerId);
  }, { passive: false });

  sheet.addEventListener("pointermove", function (e) {
    if (IS_APPLE_TOUCH && e.pointerType !== "mouse") {
      return;
    }

    if (
      drawing &&
      inputKind === "pointer" &&
      e.pointerId === inputId
    ) {
      e.preventDefault();

      const points =
        typeof e.getCoalescedEvents === "function"
          ? e.getCoalescedEvents()
          : [];

      const samples = points.length ? points : [e];

      for (const sample of samples) {
        moveStroke(sample);
      }

      return;
    }

    if (peelId === e.pointerId) {
      e.preventDefault();
      movePeel(e);
    }
  }, { passive: false });

  function endPointer(e) {
    if (IS_APPLE_TOUCH && e.pointerType !== "mouse") {
      return;
    }

    if (
      drawing &&
      inputKind === "pointer" &&
      e.pointerId === inputId
    ) {
      if (e.type === "pointerup") {
        moveStroke(e);
      }

      finishStroke();
    }

    if (peelId === e.pointerId) {
      finishPeel(e.type !== "pointerup");
    }

    // キャプチャはpointerup / pointercancel時に自動解除
  }

  sheet.addEventListener("pointerup", endPointer);
  sheet.addEventListener("pointercancel", endPointer);
  sheet.addEventListener("lostpointercapture", endPointer);

  sheet.addEventListener("contextmenu", function (e) {
    e.preventDefault();
  });

  window.addEventListener("blur", function () {
    finishStroke();
    finishPeel(true);
    saveNow();
  });
}

/* ----- 연필 / 지우개 ----- */

function setTool(name) {
  tool = name;

  penBtn.classList.toggle("on", name === "pen");
  eraserBtn.classList.toggle("on", name === "eraser");

  penBtn.setAttribute(
    "aria-pressed",
    String(name === "pen")
  );

  eraserBtn.setAttribute(
    "aria-pressed",
    String(name === "eraser")
  );
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

  if (!save(DISCARD_KEY, next)) {
    return;
  }

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
    thumb.className =
      "thumb" + (picked[real] ? " on" : "");

    thumb.setAttribute(
      "aria-label",
      (pos + 1) + "번 포스트잇"
    );

    const img = document.createElement("img");
    img.src = discarded[real].img;
    img.alt = "";

    const check = document.createElement("span");
    check.className = "check";
    check.textContent = "✓";

    thumb.appendChild(img);
    thumb.appendChild(check);

    thumb.addEventListener("click", function () {
      if (!selMode) {
        return;
      }

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

    more.setAttribute(
      "aria-label",
      (pos + 1) + "번 메뉴"
    );

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

document.getElementById("trashBtn").addEventListener(
  "click",
  function () {
    selMode = false;
    picked = {};
    menuOpen = -1;

    renderTrash();
    overlay.hidden = false;
  }
);

document.getElementById("closeBtn").addEventListener(
  "click",
  function () {
    overlay.hidden = true;
  }
);

selBtn.addEventListener("click", function () {
  selMode = !selMode;
  picked = {};
  menuOpen = -1;

  renderTrash();
});

document.getElementById("allBtn").addEventListener(
  "click",
  function () {
    picked = {};

    discarded.forEach(function (_, i) {
      picked[i] = true;
    });

    renderTrash();
  }
);

delBtn.addEventListener("click", function () {
  const list = Object.keys(picked).map(Number);

  if (list.length > 0) {
    removeItems(list);
  }
});

/* ----- 시작 ----- */

board.innerHTML = "";
PADS.forEach(buildPad);
setTool("pen");
updateBadge();

// 현재 코드 적용 여부 표시
const hint = document.querySelector(".hint");

if (hint) {
  hint.textContent =
    "펜슬로 쓰고, 손가락으로 종이 아래쪽을 위로 밀어 넘겨요 · v4";
}
