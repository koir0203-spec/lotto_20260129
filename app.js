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

// 오프라인용 내장 데이터(window.OFFICIAL_2025_NOW)를 사용합니다.
// 데이터 출처: https://smok95.github.io/lotto/results/all.json

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

  /** @type {{drawNo:number, date:string, nums:number[], bonus:number}[]} */
  let official = Array.isArray(window.OFFICIAL_2025_NOW) ? window.OFFICIAL_2025_NOW : [];

  const renderOfficialStatus = () => {
    if (official.length === 0) {
      officialStatus.textContent = "오프라인 당첨번호 데이터가 없습니다. (`official_2025_now.js` 확인)";
      btnCompareNow.disabled = true;
      return;
    }
    const first = official[0];
    const lastItem = official[official.length - 1];
    officialStatus.textContent = `내장 당첨번호: ${official.length}개 (${lastItem?.date} ~ ${first?.date})`;
    btnCompareNow.disabled = history.length === 0;
  };

  const bestMatchForMyEntry = (entry) => {
    const mySet = new Set(entry.nums);
    const myBonus = entry.bonus;
    let best = null;
    for (const o of official) {
      const hit = o.nums.filter((n) => mySet.has(n)).length;
      const bonusHit = myBonus != null && o.bonus === myBonus;
      if (!best) {
        best = { o, hit, bonusHit };
        continue;
      }
      if (hit > best.hit) best = { o, hit, bonusHit };
      else if (hit === best.hit) {
        // 동점이면 더 최신 회차 우선
        if (o.drawNo > best.o.drawNo) best = { o, hit, bonusHit };
      }
    }
    return best;
  };

  const compareMyHistory = () => {
    if (official.length === 0) return;
    if (history.length === 0) return;

    const rows = history
      .map((h) => {
        const best = bestMatchForMyEntry(h);
        return { h, best };
      })
      .filter((x) => x.best);

    const filtered = chkShowOnly3.checked
      ? rows.filter((x) => x.best.hit >= 3)
      : rows;

    // 내 기록 중 "가장 잘 맞은 것" 위로
    filtered.sort((a, b) => (b.best.hit - a.best.hit) || (b.h.round - a.h.round));

    compareTbody.innerHTML = "";
    filtered.forEach(({ h, best }) => {
      const tr = document.createElement("tr");

      const tdMy = document.createElement("td");
      const myBtn = document.createElement("button");
      myBtn.type = "button";
      myBtn.className = "roundLink";
      myBtn.textContent = `${h.round}회차`;
      myBtn.dataset.action = "loadMy";
      const myDate = document.createElement("div");
      myDate.className = "roundDate";
      myDate.textContent = `(${h.ts})`;
      tdMy.appendChild(myBtn);
      tdMy.appendChild(myDate);

      const tdMyNums = document.createElement("td");
      const myWrap = document.createElement("div");
      myWrap.className = "numsCell";
      h.nums.forEach((n) => {
        const el = document.createElement("div");
        el.className = `miniBall ${ballThemeClass(n)}`;
        el.textContent = String(n);
        myWrap.appendChild(el);
      });
      if (h.bonus != null) {
        const plus = document.createElement("span");
        plus.className = "plus";
        plus.textContent = "+";
        myWrap.appendChild(plus);
        const b = document.createElement("div");
        b.className = `miniBall ${ballThemeClass(h.bonus)} miniBall--bonus`;
        b.textContent = String(h.bonus);
        myWrap.appendChild(b);
      }
      tdMyNums.appendChild(myWrap);

      const tdOff = document.createElement("td");
      const offBtn = document.createElement("button");
      offBtn.type = "button";
      offBtn.className = "roundLink";
      offBtn.textContent = `${best.o.drawNo}회차`;
      offBtn.dataset.action = "copyOfficial";
      const offDate = document.createElement("div");
      offDate.className = "roundDate";
      offDate.textContent = `(${best.o.date})`;
      tdOff.appendChild(offBtn);
      tdOff.appendChild(offDate);

      const tdHit = document.createElement("td");
      const pill = document.createElement("span");
      pill.className = "matchPill";
      pill.innerHTML = `<strong>${best.hit}</strong>개${best.bonusHit ? ' <span class="bonusHit">+B</span>' : ""}`;
      tdHit.appendChild(pill);

      tr.appendChild(tdMy);
      tr.appendChild(tdMyNums);
      tr.appendChild(tdOff);
      tr.appendChild(tdHit);
      compareTbody.appendChild(tr);
    });

    const shown = filtered.length;
    compareSummary.textContent = shown
      ? `일치 기록: ${shown}개 / 내 기록: ${history.length}개`
      : "조건에 맞는 일치 기록이 없어요. (필터를 꺼보세요)";
    compareWrap.style.display = shown ? "" : "none";
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

  btnCompareNow.addEventListener("click", () => {
    compareMyHistory();
    toast(toastEl, "비교를 완료했어요.");
  });

  chkShowOnly3.addEventListener("change", () => {
    if (official.length === 0 || history.length === 0) return;
    compareMyHistory();
  });

  compareTbody.addEventListener("click", async (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const tr = target.closest("tr");
    if (!tr) return;
    const action = target.dataset.action;
    if (action === "loadMy") {
      // 행의 첫 번째 버튼은 해당 내 기록을 상단에 표시
      const label = target.textContent || "";
      const round = Number(label.replace(/\D/g, "")) || null;
      const entry = round != null ? history.find((h) => h.round === round) : null;
      if (entry) {
        setCurrentFromEntry(entry);
        toast(toastEl, "기록을 불러왔어요.");
      }
      return;
    }

    if (action === "copyOfficial") {
      // 텍스트에서 회차 추출
      const label = target.textContent || "";
      const drawNo = Number(label.replace(/\D/g, "")) || null;
      const row = drawNo != null ? official.find((x) => x.drawNo === drawNo) : null;
      if (!row) return;
      const text = `${row.drawNo}회(${row.date}) ${row.nums.join(", ")} + 보너스 ${row.bonus}`;
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
