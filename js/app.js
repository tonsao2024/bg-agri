import {
  CURRENT_YEAR, loadBudget, filterRows, unique, rollup, calculateMetrics, commitmentSummary,
  formatMoney, formatBaht, formatPercent, formatCount, escapeHtml, downloadCsv,
} from "./data.js";
import {
  createCharts, resizeCharts, drawHorizontalBar, drawDonut, drawTreemap, drawSunburst,
  drawHeatmap, drawPareto, drawYearBars, loadThailandMap, drawThailandMap, showEmpty,
} from "./charts.js";

const DEFAULT_STATE = Object.freeze({
  YEAR_TYPE: `ปีงบประมาณ ${CURRENT_YEAR}`,
  BUDGETARY_UNIT: "",
  BUDGET_PLAN: "",
  CATEGORY_LV1: "",
  REGION: "",
  PROVINCE: "",
  q: "",
});

const SELECTS = {
  YEAR_TYPE: { id: "fYearType", all: "ทุกช่วงปี" },
  BUDGETARY_UNIT: { id: "fUnit", all: "ทุกหน่วยงาน" },
  BUDGET_PLAN: { id: "fPlan", all: "ทุกแผนงาน" },
  CATEGORY_LV1: { id: "fCat", all: "ทุกหมวดรายจ่าย" },
  REGION: { id: "fRegion", all: "ทุกภาค" },
  PROVINCE: { id: "fProv", all: "ทุกจังหวัด" },
};

const CHART_IDS = ["chUnit", "chCat", "chTree", "chSun", "chHeat", "chMap", "chProv", "chRegion", "chYear", "chPareto"];

let rawRows = [];
let meta = {};
let charts = {};
let state = { ...DEFAULT_STATE };
let mapAvailable = false;
let latestRows = [];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function setStatus(text, isError = false) {
  $("#dataState").textContent = text;
  $(".data-dot")?.classList.toggle("error", isError);
}

function stateFromHash() {
  const values = new URLSearchParams(location.hash.slice(1));
  const next = { ...DEFAULT_STATE };
  Object.keys(next).forEach((key) => {
    if (values.has(key)) next[key] = values.get(key) || "";
  });
  return next;
}

function writeHash() {
  const values = new URLSearchParams();
  Object.entries(state).forEach(([key, value]) => {
    if (value) values.set(key, value);
  });
  const hash = values.toString();
  history.replaceState(null, "", `${location.pathname}${location.search}${hash ? `#${hash}` : ""}`);
}

function setSelectOptions(key) {
  const { id, all } = SELECTS[key];
  const select = document.getElementById(id);
  const source = key === "PROVINCE" && state.REGION
    ? rawRows.filter((row) => row.REGION === state.REGION)
    : rawRows;
  const values = unique(source, key);
  if (state[key] && !values.includes(state[key])) state[key] = "";

  const options = [{ value: "", label: all }, ...values.map((value) => ({ value, label: value }))];
  select.replaceChildren(...options.map(({ value, label }) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = value === state[key];
    return option;
  }));
}

function syncFilters() {
  Object.keys(SELECTS).forEach(setSelectOptions);
  $("#fText").value = state.q;
}

function setActiveTab(name) {
  $$(".tab").forEach((tab) => {
    const active = tab.dataset.tab === name;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  $$(".tab-panel").forEach((panel) => {
    const active = panel.dataset.panel === name;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  });
  requestAnimationFrame(() => resizeCharts(charts));
}

function bindEvents() {
  Object.entries(SELECTS).forEach(([key, { id }]) => {
    document.getElementById(id).addEventListener("change", (event) => {
      state[key] = event.target.value;
      if (key === "REGION" && state.PROVINCE) state.PROVINCE = "";
      syncFilters();
      writeHash();
      render();
    });
  });

  let queryTimer;
  $("#fText").addEventListener("input", (event) => {
    clearTimeout(queryTimer);
    queryTimer = setTimeout(() => {
      state.q = event.target.value.trim();
      writeHash();
      render();
    }, 220);
  });

  $("#reset").addEventListener("click", () => {
    state = { ...DEFAULT_STATE };
    syncFilters();
    writeHash();
    render();
  });
  $("#csv").addEventListener("click", () => downloadCsv(latestRows));
  $("#downloadTop").addEventListener("click", () => downloadCsv(latestRows));
  $$(".tab").forEach((tab) => tab.addEventListener("click", () => setActiveTab(tab.dataset.tab)));

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => resizeCharts(charts), 80);
  });
}

function kpi(label, value, detail, color) {
  return `<article class="kpi" style="--kpi-color:${color}"><span class="kpi-label">${label}</span><strong class="kpi-value">${value}</strong><span class="kpi-detail">${detail}</span></article>`;
}

function renderKpis(metrics, commitment) {
  const hhiText = metrics.hhi >= 2500 ? "กระจุกตัวสูง" : metrics.hhi >= 1500 ? "กระจุกตัวปานกลาง" : "กระจายตัว";
  $("#kpis").innerHTML = [
    kpi("งบที่กรอง", formatMoney(metrics.total), `${formatCount(metrics.count)} รายการ`, "#1f705c"),
    kpi("สัดส่วนงบลงทุน", formatPercent(metrics.investmentRatio), `${formatMoney(metrics.investment)} ของงบที่กรอง`, "#ccda62"),
    kpi("ระบุพื้นที่ได้", formatPercent(metrics.geoRatio), `${formatCount(metrics.geoRowRatio)}% ของรายการมีจังหวัด`, "#97d5b3"),
    kpi("Top 10 share", formatPercent(metrics.top10Ratio), "สัดส่วนของ 10 รายการแรก", "#ee8d4a"),
    kpi("HHI หน่วยงาน", formatCount(metrics.hhi), hhiText, "#c95745"),
    kpi("ผูกพันปีถัดไป", formatPercent(commitment.forwardRatio), `${formatMoney(commitment.next)} ในปี ${CURRENT_YEAR + 1}`, "#6e9d91"),
  ].join("");
}

function renderTopTable(rows, selector, limit = 10) {
  const tbody = document.querySelector(`${selector} tbody`);
  if (!rows.length) {
    tbody.innerHTML = '<tr><td class="empty-cell" colspan="6">ไม่มีข้อมูลตามตัวกรอง</td></tr>';
    return;
  }
  tbody.innerHTML = rows.slice(0, limit).map((row, index) => {
    const item = escapeHtml(row.ITEM_DESCRIPTION || row.DELIVERABLE || "ไม่ระบุรายการ");
    if (selector === "#topTable") {
      return `<tr><td class="item-name">${item}</td><td class="muted">${escapeHtml(row.BUDGETARY_UNIT || "-")}</td><td class="number">${formatBaht(row.AMOUNT)}</td></tr>`;
    }
    return `<tr><td class="muted">${index + 1}</td><td class="item-name">${item}</td><td>${escapeHtml(row.BUDGETARY_UNIT || "-")}</td><td>${escapeHtml(row.BUDGET_PLAN || "-")}</td><td>${escapeHtml(row.PROVINCE || "-")}</td><td class="number">${formatBaht(row.AMOUNT)}</td></tr>`;
  }).join("");
}

function renderStructureNarrative(rows, metrics) {
  const [topUnit = ["ไม่ระบุ", 0]] = rollup(rows, "BUDGETARY_UNIT", 1);
  const [topCategory = ["ไม่ระบุ", 0]] = rollup(rows, "CATEGORY_LV1", 1);
  $("#structureNarrative").innerHTML = `
    <p><strong>${escapeHtml(topUnit[0])}</strong><br><span>เป็นหน่วยงานที่มีงบสูงสุด ${formatMoney(topUnit[1])} หรือ ${formatPercent(metrics.total ? topUnit[1] / metrics.total * 100 : 0)} ของมุมมองปัจจุบัน</span></p>
    <p><strong>${escapeHtml(topCategory[0])}</strong><br><span>เป็นหมวดรายจ่ายหลัก ${formatMoney(topCategory[1])} หรือ ${formatPercent(metrics.total ? topCategory[1] / metrics.total * 100 : 0)} ของมุมมองปัจจุบัน</span></p>
    <p><strong>${formatMoney(metrics.median)}</strong><br><span>คือค่ากลางต่อรายการ ขณะที่ค่าเฉลี่ยสูงกว่า ${metrics.median ? `${metrics.meanMedianRatio.toFixed(1)} เท่า` : "คำนวณไม่ได้"} แสดงการกระจายที่เบ้</span></p>`;
}

function renderGeoDetail(rows, metrics) {
  const regions = rollup(rows.filter((row) => row.PROVINCE), "REGION", 6);
  const max = regions[0]?.[1] || 0;
  const list = regions.length ? regions.map(([region, amount]) => `<li><span>${escapeHtml(region)}</span><b>${formatPercent(max ? amount / metrics.geo : 0)} · ${formatMoney(amount)}</b></li>`).join("") : '<li><span>ไม่มีรายการระบุพื้นที่</span></li>';
  $("#geoDetail").innerHTML = `
    <div class="geo-score"><div><strong>${formatPercent(metrics.geoRatio)}</strong><span>งบที่ระบุจังหวัดได้</span></div></div>
    <ul class="geo-list">${list}</ul>`;
}

function renderCommitmentDetail(summary) {
  const currentRows = summary.years.find((entry) => entry.year === CURRENT_YEAR)?.count || 0;
  $("#commitmentDetail").innerHTML = `
    <div class="commitment-stat"><span class="label">งบปี ${CURRENT_YEAR}</span><b>${formatMoney(summary.current)}</b><small>${formatCount(currentRows)} รายการในตัวกรองข้ามปี</small></div>
    <div class="commitment-stat future"><span class="label">ภาระผูกพันปี ${CURRENT_YEAR + 1}</span><b>${formatMoney(summary.next)}</b><small>คิดเป็น ${formatPercent(summary.forwardRatio)} ของงบปี ${CURRENT_YEAR}</small></div>
    <div class="commitment-stat future"><span class="label">ภาระผูกพันอนาคตรวม</span><b>${formatMoney(summary.future)}</b><small>ไม่รวมงบปี ${CURRENT_YEAR} และปีก่อนหน้า ${formatMoney(summary.previous)}</small></div>`;
}

function renderYearTable(summary) {
  const tbody = $("#yearTable tbody");
  if (!summary.years.length) {
    tbody.innerHTML = '<tr><td class="empty-cell" colspan="5">ไม่มีข้อมูลภาระผูกพันตามตัวกรอง</td></tr>';
    return;
  }
  tbody.innerHTML = summary.years.map((entry) => `<tr>
    <td><strong>${entry.year}</strong></td><td>${escapeHtml(entry.type)}</td><td class="number">${formatCount(entry.count)}</td>
    <td class="number">${formatBaht(entry.amount)}</td><td class="number">${summary.current ? formatPercent(entry.amount / summary.current * 100) : "—"}</td>
  </tr>`).join("");
}

function renderRedFlags(metrics, summary) {
  const hhiLevel = metrics.hhi >= 2500 ? "danger" : metrics.hhi >= 1500 ? "warning" : "";
  const hhiDescription = metrics.hhi >= 2500
    ? "สูงกว่าเกณฑ์ 2,500 จึงสะท้อนการกระจุกตัวของงบระดับสูง"
    : metrics.hhi >= 1500 ? "อยู่ในช่วงกระจุกตัวปานกลางตามเกณฑ์ HHI" : "อยู่ในช่วงการกระจายตัวมากกว่าเกณฑ์กระจุกตัว";
  const poolDescription = metrics.pooled
    ? `มีรายการก้อนรวม/ต่อหน่วยต่ำกว่าเกณฑ์ ${formatMoney(metrics.pooled)} หรือ ${formatPercent(metrics.pooledRatio)} ของงบที่กรอง`
    : "ไม่พบธงรายการก้อนรวมจากข้อความในมุมมองที่กรอง";
  $("#redFlags").innerHTML = `
    <article class="flag ${hhiLevel}"><span class="flag-icon">01</span><div><h4>งบกระจุกตัวที่หน่วยงาน</h4><p>HHI <strong>${formatCount(metrics.hhi)}</strong> — ${hhiDescription}</p></div></article>
    <article class="flag warning"><span class="flag-icon">02</span><div><h4>พึ่งพารายการขนาดใหญ่</h4><p>10 รายการแรกกินงบ <strong>${formatPercent(metrics.top10Ratio)}</strong> และต้องใช้เพียง <strong>${formatCount(metrics.pareto80.count)}</strong> รายการเพื่อสะสมงบ 80%</p></div></article>
    <article class="flag ${metrics.geoRatio < 50 ? "warning" : ""}"><span class="flag-icon">03</span><div><h4>ติดตามเชิงพื้นที่ได้</h4><p>ระบุจังหวัดได้ <strong>${formatPercent(metrics.geoRatio)}</strong> ของวงเงิน และ <strong>${formatPercent(metrics.geoRowRatio)}</strong> ของจำนวนรายการ</p></div></article>
    <article class="flag ${metrics.pooledRatio > 5 ? "danger" : ""}"><span class="flag-icon">04</span><div><h4>งบก้อนรวมที่ต้องอ่านรายละเอียด</h4><p>${poolDescription}</p></div></article>
    <article class="flag ${summary.forwardRatio >= 30 ? "warning" : ""}"><span class="flag-icon">05</span><div><h4>พื้นที่งบปีถัดไป</h4><p>ภาระปี ${CURRENT_YEAR + 1} อยู่ที่ <strong>${formatPercent(summary.forwardRatio)}</strong> ของฐานงบปี ${CURRENT_YEAR}</p></div></article>`;
}

function renderMeta() {
  const totalCurrent = meta.total_cur ? formatBaht(meta.total_cur) : "—";
  const count = meta.rows ? `${formatCount(meta.rows)} รายการ` : "พร้อมวิเคราะห์";
  $("#dataSummary").textContent = `ข้อมูล ${count} · งบปี ${meta.fiscal_year || CURRENT_YEAR} รวม ${totalCurrent} แยกออกจากตารางภาระผูกพันข้ามปีแล้ว`;
  $("#sourceNote").textContent = meta.source || "ไฟล์งบประมาณรายจ่าย กระทรวงเกษตรและสหกรณ์";
  $("#updatedNote").textContent = meta.prepared_at ? `ประมวลผล ${meta.prepared_at}` : "ตรวจสอบวันที่ในไฟล์ต้นทาง";
}

function render() {
  if (!rawRows.length) return;
  latestRows = filterRows(rawRows, state);
  const crossYearRows = filterRows(rawRows, state, { includeYear: false });
  const metrics = calculateMetrics(latestRows);
  const commitment = commitmentSummary(crossYearRows);
  const provinceRollup = rollup(latestRows.filter((row) => row.PROVINCE), "PROVINCE", 20);

  $("#filterCount").textContent = `${formatCount(latestRows.length)} / ${formatCount(rawRows.length)} รายการ`;
  renderKpis(metrics, commitment);
  drawHorizontalBar(charts.chUnit, rollup(latestRows, "BUDGETARY_UNIT", 15));
  drawDonut(charts.chCat, rollup(latestRows, "CATEGORY_LV1"));
  drawTreemap(charts.chTree, latestRows);
  drawSunburst(charts.chSun, latestRows);
  drawHeatmap(charts.chHeat, latestRows);
  drawThailandMap(charts.chMap, provinceRollup, mapAvailable);
  drawHorizontalBar(charts.chProv, provinceRollup, { limit: 20, color: "#478c79" });
  drawHorizontalBar(charts.chRegion, rollup(latestRows.filter((row) => row.PROVINCE), "REGION", 6), { limit: 6, color: "#6e9d91" });
  drawYearBars(charts.chYear, commitment.years, CURRENT_YEAR);
  drawPareto(charts.chPareto, metrics.sorted);
  renderTopTable(metrics.sorted, "#topTable", 10);
  renderTopTable(metrics.sorted, "#fullTable", 50);
  renderStructureNarrative(latestRows, metrics);
  renderGeoDetail(latestRows, metrics);
  renderCommitmentDetail(commitment);
  renderYearTable(commitment);
  renderRedFlags(metrics, commitment);
}

function renderError(error) {
  setStatus("รอไฟล์ข้อมูล", true);
  $("#dataSummary").textContent = "ยังไม่พบ data/budget.json — เพิ่มไฟล์ Agr_Budget-2569.csv แล้วรัน tools/prepare_data.py เพื่อสร้างข้อมูลสำหรับหน้าเว็บ";
  $("#filterCount").textContent = "ไม่มีข้อมูล";
  $("#kpis").innerHTML = kpi("สถานะข้อมูล", "รอไฟล์", "ดูคำสั่งเตรียมข้อมูลใน README.md", "#ee8d4a");
  Object.values(charts).forEach((chart) => showEmpty(chart, "รอไฟล์ budget.json"));
  $("#mapNote").textContent = "รอข้อมูลแผนที่";
  console.warn(error);
}

async function boot() {
  bindEvents();
  try {
    const payload = await loadBudget();
    rawRows = payload.rows;
    meta = payload.meta;
    state = stateFromHash();
    syncFilters();
    charts = createCharts(CHART_IDS);
    setStatus(`${formatCount(rawRows.length)} รายการพร้อมวิเคราะห์`);
    renderMeta();
    render();

    loadThailandMap().then((mapInfo) => {
      mapAvailable = true;
      $("#mapNote").textContent = `จับคู่ชื่อจังหวัดได้ ${mapInfo.mapped}/${mapInfo.total}`;
      render();
    }).catch(() => {
      mapAvailable = false;
      $("#mapNote").textContent = "ยังไม่มีไฟล์ GeoJSON";
      drawThailandMap(charts.chMap, [], false);
    });
  } catch (error) {
    // Still initialise charts so the empty page explains exactly what is missing.
    syncFilters();
    charts = createCharts(CHART_IDS);
    renderError(error);
  }
}

boot();
