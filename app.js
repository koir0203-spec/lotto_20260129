function pickUniqueNumbers({ count, min, max }) {
  const picked = new Set();
  while (picked.size < count) {
    const n = Math.floor(Math.random() * (max - min + 1)) + min;
    picked.add(n);
  }
  return Array.from(picked);
}

function formatNow() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function numberColorStyle(n) {
  // 시각적으로 구분되는 고정 팔레트 (일반적인 로또 색상 느낌)
  if (n <= 10) return { bg: "rgba(250, 204, 21, .25)", bd: "rgba(250, 204, 21, .65)" }; // yellow
  if (n <= 20) return { bg: "rgba(59, 130, 246, .22)", bd: "rgba(59, 130, 246, .65)" }; // blue
  if (n <= 30) return { bg: "rgba(239, 68, 68, .20)", bd: "rgba(239, 68, 68, .60)" }; // red
  if (n <= 40) return { bg: "rgba(148, 163, 184, .18)", bd: "rgba(148, 163, 184, .55)" }; // gray
  return { bg: "rgba(34, 197, 94, .18)", bd: "rgba(34, 197, 94, .60)" }; // green
}

function ballThemeClass(n) {
  if (n <= 10) return "miniBall--y";
  if (n <= 20) return "miniBall--b";
  if (n <= 30) return "miniBall--r";
  if (n <= 40) return "miniBall--g";
  return "miniBall--gr";
}

function renderBalls(container, nums, { bonus = null } = {}) {
  container.innerHTML = "";

  const makeBall = (n, isBonus) => {
    const el = document.createElement("div");
    el.className = `ball${isBonus ? " ball--bonus" : ""}`;
    el.textContent = String(n);

    const { bg, bd } = numberColorStyle(n);
    // 공 배경은 CSS 3D 하이라이트 위에 깔리는 "기본 톤"만 설정
    el.style.background = `radial-gradient(circle at 30% 30%, rgba(255,255,255,.35), rgba(255,255,255,0) 40%), linear-gradient(180deg, ${bg}, rgba(0,0,0,0))`;
    el.style.borderColor = bd;
    return el;
  };

  for (const n of nums) container.appendChild(makeBall(n, false));
  if (bonus != null) container.appendChild(makeBall(bonus, true));
}

function toast(el, message) {
  el.textContent = message;
  el.classList.add("is-on");
  window.clearTimeout(toast._t);
  toast._t = window.setTimeout(() => el.classList.remove("is-on"), 1300);
}

const STORAGE_KEY = "lotto_history_v1";
const MAX_HISTORY = 30;

const OFFICIAL_KEY = "lotto_official_2025_v1";
const OFFICIAL_META_KEY = "lotto_official_2025_meta_v1";
const OFFICIAL_FROM_DATE = "2025-01-01";
const LOTTO_START_DATE = "2002-12-07"; // 1회차
const LOTTO_API = "https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=";

/**
 * @returns {{items: {drwNo:number, drwNoDate:string, nums:number[], bonus:number}[], meta: {updatedAt:string, fromDate:string, toDate:string, count:number} | null}}
 */
function loadOfficialCache() {
  try {
    const raw = window.localStorage.getItem(OFFICIAL_KEY);
    const metaRaw = window.localStorage.getItem(OFFICIAL_META_KEY);
    const items = raw ? JSON.parse(raw) : [];
    const meta = metaRaw ? JSON.parse(metaRaw) : null;
    if (!Array.isArray(items)) return { items: [], meta: null };
    const cleaned = items
      .filter(
        (x) =>
          x &&
          Number.isInteger(x.drwNo) &&
          typeof x.drwNoDate === "string" &&
          Array.isArray(x.nums) &&
          x.nums.length === 6 &&
          x.nums.every((n) => Number.isInteger(n)) &&
          Number.isInteger(x.bonus)
      )
      .map((x) => ({
        drwNo: x.drwNo,
        drwNoDate: x.drwNoDate,
        nums: x.nums,
        bonus: x.bonus,
      }));
    return { items: cleaned, meta };
  } catch {
    return { items: [], meta: null };
  }
}

function saveOfficialCache(items) {
  try {
    window.localStorage.setItem(OFFICIAL_KEY, JSON.stringify(items));
    const updatedAt = formatNow();
    const toDate = items[0]?.drwNoDate ?? formatNow().split(" ")[0];
    const meta = {
      updatedAt,
      fromDate: OFFICIAL_FROM_DATE,
      toDate,
      count: items.length,
    };
    window.localStorage.setItem(OFFICIAL_META_KEY, JSON.stringify(meta));
  } catch {
    // ignore
  }
}

function clearOfficialCache() {
  try {
    window.localStorage.removeItem(OFFICIAL_KEY);
    window.localStorage.removeItem(OFFICIAL_META_KEY);
  } catch {
    // ignore
  }
}

function parseYmdToDate(ymd) {
  // ymd: "YYYY-MM-DD"
  const [y, m, d] = ymd.split("-").map((x) => Number(x));
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function estimateLatestDrawNo() {
  const start = parseYmdToDate(LOTTO_START_DATE);
  const now = new Date();
  const weeks = Math.floor((now - start) / (7 * 24 * 60 * 60 * 1000));
  return weeks + 1;
}

async function fetchDraw(drwNo) {
  const res = await fetch(`${LOTTO_API}${drwNo}`, { cache: "no-store" });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || data.returnValue !== "success") return null;
  const nums = [
    data.drwtNo1,
    data.drwtNo2,
    data.drwtNo3,
    data.drwtNo4,
    data.drwtNo5,
    data.drwtNo6,
  ].map((n) => Number(n));
  return {
    drwNo: Number(data.drwNo),
    drwNoDate: String(data.drwNoDate), // YYYY-MM-DD
    nums,
    bonus: Number(data.bnusNo),
  };
}

async function loadOfficial2025ToNow(onProgress) {
  // 1) 최신 회차 감 잡고, 실제 성공하는 회차로 보정
  let latest = estimateLatestDrawNo();
  let latestData = null;
  for (let i = 0; i < 12; i++) {
    onProgress?.(`최신 회차 확인 중… (${latest})`);
    latestData = await fetchDraw(latest);
    if (latestData) break;
    latest -= 1;
  }
  if (!latestData) throw new Error("최신 회차를 찾지 못했어요. 인터넷 연결을 확인해 주세요.");

  // 2) 2025-01-01 이후만 역순으로 수집
  const from = parseYmdToDate(OFFICIAL_FROM_DATE);
  const items = [];

  let currentNo = latestData.drwNo;
  while (currentNo >= 1) {
    const item = currentNo === latestData.drwNo ? latestData : await fetchDraw(currentNo);
    if (!item) {
      currentNo -= 1;
      continue;
    }
    const d = parseYmdToDate(item.drwNoDate);
    if (d < from) break;
    items.push(item);
    onProgress?.(`불러오는 중… ${item.drwNo}회 (${item.drwNoDate})`);
    currentNo -= 1;
  }

  return items; // 최신이 앞
}

/**
 * @returns {{round:number, ts:string, nums:number[], bonus:number|null, sort:boolean, withBonus:boolean}[]}
 */
function loadHistory() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cleaned = parsed
      .filter(
        (x) =>
          x &&
          typeof x.ts === "string" &&
          Array.isArray(x.nums) &&
          x.nums.length === 6 &&
          x.nums.every((n) => Number.isInteger(n)) &&
          (x.bonus === null || Number.isInteger(x.bonus))
      )
      .map((x) => ({
        round: Number.isInteger(x.round) ? x.round : 0,
        ts: x.ts,
        nums: x.nums,
        bonus: x.bonus ?? null,
        sort: !!x.sort,
        withBonus: !!x.withBonus,
      }))
      .slice(0, MAX_HISTORY);

    // 마이그레이션: 예전 데이터(회차 없음)면 최신부터 1,2,3... 부여
    if (cleaned.length && cleaned.every((x) => x.round === 0)) {
      const migrated = cleaned.map((x, i) => ({ ...x, round: cleaned.length - i }));
      saveHistory(migrated);
      return migrated;
    }

    return cleaned;
  } catch {
    return [];
  }
}

/**
 * @param {{round:number, ts:string, nums:number[], bonus:number|null, sort:boolean, withBonus:boolean}[]} items
 */
function saveHistory(items) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_HISTORY)));
  } catch {
    // ignore
  }
}

function entryToText(entry) {
  return entry.bonus == null
    ? entry.nums.join(", ")
    : `${entry.nums.join(", ")} + 보너스 ${entry.bonus}`;
}

async function copyTextWithFallback(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ok = window.prompt("복사할 텍스트입니다. Ctrl+C로 복사하세요.", text);
    return ok !== null;
  }
}

function main() {
  const btnDraw = document.getElementById("btnDraw");
  const btnRedraw = document.getElementById("btnRedraw");
  const btnCopy = document.getElementById("btnCopy");
  const btnClearHistory = document.getElementById("btnClearHistory");
  const chkSort = document.getElementById("chkSort");
  const chkBonus = document.getElementById("chkBonus");

  const balls = document.getElementById("balls");
  const resultText = document.getElementById("resultText");
  const timestamp = document.getElementById("timestamp");
  const toastEl = document.getElementById("toast");
  const historyTbody = document.getElementById("historyTbody");
  const historyEmpty = document.getElementById("historyEmpty");

  const btnLoadOfficial = document.getElementById("btnLoadOfficial");
  const btnClearOfficial = document.getElementById("btnClearOfficial");
  const btnCompareNow = document.getElementById("btnCompareNow");
  const chkShowOnly3 = document.getElementById("chkShowOnly3");
  const officialStatus = document.getElementById("officialStatus");
  const compareSummary = document.getElementById("compareSummary");
  const compareWrap = document.getElementById("compareWrap");
  const compareTbody = document.getElementById("compareTbody");

  /** @type {{nums:number[], bonus:number|null} | null} */
  let last = null;

  /** @type {{round:number, ts:string, nums:number[], bonus:number|null, sort:boolean, withBonus:boolean}[]} */
  let history = loadHistory();

  /** @type {{drwNo:number, drwNoDate:string, nums:number[], bonus:number}[]} */
  let official = loadOfficialCache().items;
  let officialMeta = loadOfficialCache().meta;

  const renderOfficialStatus = () => {
    if (official.length === 0) {
      officialStatus.textContent =
        "인터넷이 연결되어 있어야 불러올 수 있어요. (불러온 데이터는 브라우저에 저장됩니다)";
      btnClearOfficial.disabled = true;
      btnCompareNow.disabled = true;
      return;
    }
    const updatedAt = officialMeta?.updatedAt ?? "";
    officialStatus.textContent = `저장된 당첨번호: ${official.length}개 (업데이트: ${updatedAt || "알 수 없음"})`;
    btnClearOfficial.disabled = false;
    btnCompareNow.disabled = last == null;
  };

  const compareWithOfficial = () => {
    if (!last || official.length === 0) return;
    const my = new Set(last.nums);
    const myBonus = last.bonus;

    const results = official.map((o) => {
      const hit = o.nums.filter((n) => my.has(n)).length;
      const bonusHit = myBonus != null && o.bonus === myBonus;
      return { ...o, hit, bonusHit };
    });

    const filtered = chkShowOnly3.checked ? results.filter((r) => r.hit >= 3) : results;
    filtered.sort((a, b) => (b.hit - a.hit) || (b.drwNo - a.drwNo));

    const top = filtered.slice(0, 50);
    compareTbody.innerHTML = "";
    top.forEach((r) => {
      const tr = document.createElement("tr");
      tr.dataset.drwno = String(r.drwNo);

      const tdRound = document.createElement("td");
      const roundBtn = document.createElement("button");
      roundBtn.type = "button";
      roundBtn.className = "roundLink";
      roundBtn.textContent = `${r.drwNo}회차`;
      roundBtn.dataset.action = "copyOfficial";
      const roundDate = document.createElement("div");
      roundDate.className = "roundDate";
      roundDate.textContent = `(${r.drwNoDate})`;
      tdRound.appendChild(roundBtn);
      tdRound.appendChild(roundDate);

      const tdNums = document.createElement("td");
      const numsWrap = document.createElement("div");
      numsWrap.className = "numsCell";
      r.nums.forEach((n) => {
        const el = document.createElement("div");
        el.className = `miniBall ${ballThemeClass(n)}`;
        el.textContent = String(n);
        // 내 번호와 일치하면 테두리 강조
        if (my.has(n)) el.style.outline = "2px solid rgba(26,115,232,.55)";
        numsWrap.appendChild(el);
      });
      const plus = document.createElement("span");
      plus.className = "plus";
      plus.textContent = "+";
      numsWrap.appendChild(plus);
      const bEl = document.createElement("div");
      bEl.className = `miniBall ${ballThemeClass(r.bonus)} miniBall--bonus`;
      bEl.textContent = String(r.bonus);
      if (myBonus != null && r.bonus === myBonus) bEl.style.outline = "2px solid rgba(34,197,94,.65)";
      numsWrap.appendChild(bEl);
      tdNums.appendChild(numsWrap);

      const tdHit = document.createElement("td");
      const pill = document.createElement("span");
      pill.className = "matchPill";
      pill.innerHTML = `<strong>${r.hit}</strong>개${r.bonusHit ? ' <span class="bonusHit">+B</span>' : ""}`;
      tdHit.appendChild(pill);

      const tdActions = document.createElement("td");
      const btns = document.createElement("div");
      btns.className = "rowBtns";
      const btnCopyRow = document.createElement("button");
      btnCopyRow.type = "button";
      btnCopyRow.className = "btn btn-mini";
      btnCopyRow.textContent = "복사";
      btnCopyRow.dataset.action = "copyRow";
      btns.appendChild(btnCopyRow);
      tdActions.appendChild(btns);

      tr.appendChild(tdRound);
      tr.appendChild(tdNums);
      tr.appendChild(tdHit);
      tr.appendChild(tdActions);
      compareTbody.appendChild(tr);
    });

    const shown = top.length;
    const total = filtered.length;
    compareSummary.textContent = `표시: ${shown}개 (조건 만족: ${total}개 / 전체: ${official.length}개)`;
    compareWrap.style.display = shown ? "" : "none";
    if (!shown) compareSummary.textContent = "조건에 맞는 회차가 없어요. (필터를 꺼보세요)";
  };

  const setCurrentFromEntry = (entry) => {
    chkSort.checked = !!entry.sort;
    chkBonus.checked = !!entry.withBonus;

    last = { nums: entry.nums, bonus: entry.bonus };
    renderBalls(balls, entry.nums, { bonus: entry.bonus });
    resultText.textContent = `결과: ${entryToText(entry)}`;
    timestamp.textContent = `마지막 추첨: ${entry.ts}`;
    btnRedraw.disabled = false;
    btnCopy.disabled = false;
  };

  const renderHistory = () => {
    historyTbody.innerHTML = "";
    historyEmpty.style.display = history.length === 0 ? "" : "none";
    btnClearHistory.disabled = history.length === 0;

    history.forEach((entry, idx) => {
      const tr = document.createElement("tr");
      tr.dataset.index = String(idx);

      const tdRound = document.createElement("td");
      const roundBtn = document.createElement("button");
      roundBtn.type = "button";
      roundBtn.className = "roundLink";
      roundBtn.textContent = `${entry.round}회차`;
      roundBtn.dataset.action = "load";
      const roundDate = document.createElement("div");
      roundDate.className = "roundDate";
      roundDate.textContent = `(${entry.ts.split(" ")[0]})`;
      tdRound.appendChild(roundBtn);
      tdRound.appendChild(roundDate);

      const tdNums = document.createElement("td");
      const numsWrap = document.createElement("div");
      numsWrap.className = "numsCell";
      const makeMini = (n, isBonus) => {
        const el = document.createElement("div");
        el.className = `miniBall ${ballThemeClass(n)}${isBonus ? " miniBall--bonus" : ""}`;
        el.textContent = String(n);
        return el;
      };
      entry.nums.forEach((n) => numsWrap.appendChild(makeMini(n, false)));
      if (entry.bonus != null) {
        const plus = document.createElement("span");
        plus.className = "plus";
        plus.textContent = "+";
        numsWrap.appendChild(plus);
        numsWrap.appendChild(makeMini(entry.bonus, true));
      }
      tdNums.appendChild(numsWrap);

      const tdActions = document.createElement("td");
      const btns = document.createElement("div");
      btns.className = "rowBtns";

      const btnLoad = document.createElement("button");
      btnLoad.type = "button";
      btnLoad.className = "btn btn-mini";
      btnLoad.textContent = "불러오기";
      btnLoad.dataset.action = "load";

      const btnCopyItem = document.createElement("button");
      btnCopyItem.type = "button";
      btnCopyItem.className = "btn btn-mini";
      btnCopyItem.textContent = "복사";
      btnCopyItem.dataset.action = "copy";

      btns.appendChild(btnLoad);
      btns.appendChild(btnCopyItem);
      tdActions.appendChild(btns);

      tr.appendChild(tdRound);
      tr.appendChild(tdNums);
      tr.appendChild(tdActions);
      historyTbody.appendChild(tr);
    });
  };

  const nextRound = () => {
    const max = history.reduce((m, x) => (x.round > m ? x.round : m), 0);
    return max + 1;
  };

  const draw = () => {
    let nums = pickUniqueNumbers({ count: 6, min: 1, max: 45 });
    let bonus = null;

    if (chkBonus.checked) {
      // 7개 중 마지막을 보너스로 분리
      const all = pickUniqueNumbers({ count: 7, min: 1, max: 45 });
      nums = all.slice(0, 6);
      bonus = all[6];
    }

    if (chkSort.checked) nums.sort((a, b) => a - b);

    last = { nums, bonus };
    renderBalls(balls, nums, { bonus });

    const bonusText = bonus != null ? ` + 보너스 ${bonus}` : "";
    resultText.textContent = `결과: ${nums.join(", ")}${bonusText}`;
    const ts = formatNow();
    timestamp.textContent = `마지막 추첨: ${ts}`;

    btnRedraw.disabled = false;
    btnCopy.disabled = false;
    renderOfficialStatus();

    // 기록 저장 (최신이 위로)
    const withBonus = chkBonus.checked;
    history.unshift({
      round: nextRound(),
      ts,
      nums,
      bonus,
      sort: chkSort.checked,
      withBonus,
    });
    history = history.slice(0, MAX_HISTORY);
    saveHistory(history);
    renderHistory();
  };

  const copy = async () => {
    if (!last) return;
    const text =
      last.bonus == null
        ? last.nums.join(", ")
        : `${last.nums.join(", ")} + 보너스 ${last.bonus}`;

    const ok = await copyTextWithFallback(text);
    toast(toastEl, ok ? "클립보드에 복사했어요." : "복사에 실패했어요.");
  };

  btnDraw.addEventListener("click", draw);
  btnRedraw.addEventListener("click", draw);
  btnCopy.addEventListener("click", copy);
  btnClearHistory.addEventListener("click", () => {
    history = [];
    saveHistory(history);
    renderHistory();
    toast(toastEl, "기록을 삭제했어요.");
  });

  historyTbody.addEventListener("click", async (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const tr = target.closest("tr");
    if (!tr) return;
    const idx = Number(tr.dataset.index);
    const entry = history[idx];
    if (!entry) return;

    const action = target.dataset.action;
    if (action === "load") {
      setCurrentFromEntry(entry);
      toast(toastEl, "기록을 불러왔어요.");
      return;
    }

    if (action === "copy") {
      const ok = await copyTextWithFallback(entryToText(entry));
      toast(toastEl, ok ? "클립보드에 복사했어요." : "복사에 실패했어요.");
      return;
    }

    // 버튼이 아닌 곳을 클릭하면 불러오기
    setCurrentFromEntry(entry);
    toast(toastEl, "기록을 불러왔어요.");
  });

  btnLoadOfficial.addEventListener("click", async () => {
    btnLoadOfficial.disabled = true;
    btnCompareNow.disabled = true;
    officialStatus.textContent = "불러오기 시작…";
    try {
      const items = await loadOfficial2025ToNow((msg) => {
        officialStatus.textContent = msg;
      });
      official = items;
      saveOfficialCache(items);
      officialMeta = loadOfficialCache().meta;
      toast(toastEl, `당첨번호 ${items.length}개를 저장했어요.`);
    } catch (err) {
      officialStatus.textContent = err instanceof Error ? err.message : "불러오기에 실패했어요.";
    } finally {
      btnLoadOfficial.disabled = false;
      renderOfficialStatus();
    }
  });

  btnClearOfficial.addEventListener("click", () => {
    clearOfficialCache();
    official = [];
    officialMeta = null;
    compareTbody.innerHTML = "";
    compareWrap.style.display = "none";
    compareSummary.textContent = "";
    renderOfficialStatus();
    toast(toastEl, "당첨번호 캐시를 삭제했어요.");
  });

  btnCompareNow.addEventListener("click", () => {
    compareWithOfficial();
    toast(toastEl, "비교를 완료했어요.");
  });

  chkShowOnly3.addEventListener("change", () => {
    if (!last || official.length === 0) return;
    compareWithOfficial();
  });

  compareTbody.addEventListener("click", async (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const tr = target.closest("tr");
    if (!tr) return;
    const drwNo = Number(tr.dataset.drwno);
    const row = official.find((x) => x.drwNo === drwNo);
    if (!row) return;

    const action = target.dataset.action;
    if (action === "copyRow" || action === "copyOfficial") {
      const text = `${row.drwNo}회(${row.drwNoDate}) ${row.nums.join(", ")} + 보너스 ${row.bonus}`;
      const ok = await copyTextWithFallback(text);
      toast(toastEl, ok ? "클립보드에 복사했어요." : "복사에 실패했어요.");
    }
  });

  // 초기 렌더
  renderHistory();
  if (history[0]) {
    // 가장 최근 기록을 자동 표시(원치 않으면 제거 가능)
    setCurrentFromEntry(history[0]);
  }
  renderOfficialStatus();

  // UX: Enter 키로 추첨
  window.addEventListener("keydown", (e) => {
    if (e.key === "Enter") draw();
  });
}

document.addEventListener("DOMContentLoaded", main);
