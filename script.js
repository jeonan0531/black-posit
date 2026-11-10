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
  const canvas =
