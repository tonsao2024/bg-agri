/* Shared data functions for the static dashboard. No backend is required. */

export const CURRENT_YEAR = 2569;
export const BILLION = 1e9;
export const MILLION = 1e6;

const TH_NUMBER = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 });
const TH_DECIMAL = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function sum(rows) {
  return rows.reduce((total, row) => total + number(row.AMOUNT), 0);
}

export function formatMoney(value, digits = 2) {
  const n = number(value);
  if (Math.abs(n) >= BILLION) return `${(n / BILLION).toFixed(digits)} พันล้าน`;
  if (Math.abs(n) >= MILLION) return `${(n / MILLION).toFixed(1)} ล้าน`;
  return `${TH_NUMBER.format(n)} บาท`;
}

export function formatBaht(value) {
  return `${TH_NUMBER.format(number(value))} บาท`;
}

export function formatPercent(value, digits = 1) {
  return `${number(value).toFixed(digits)}%`;
}

export function formatCount(value) {
  return TH_NUMBER.format(number(value));
}

export function formatCompactNumber(value) {
  const n = number(value);
  if (Math.abs(n) >= BILLION) return `${(n / BILLION).toFixed(1)}B`;
  if (Math.abs(n) >= MILLION) return `${(n / MILLION).toFixed(0)}M`;
  return TH_NUMBER.format(n);
}

export function formatSignedRatio(value) {
  return TH_DECIMAL.format(number(value));
}

export async function loadBudget(url = "data/budget.json") {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`ไม่พบไฟล์ ${url} (HTTP ${response.status})`);
  }
  const payload = await response.json();
  if (!payload || !Array.isArray(payload.rows)) {
    throw new Error("รูปแบบ budget.json ไม่ถูกต้อง: ต้องมี rows เป็น array");
  }

  const rows = payload.rows.map((row) => ({
    ...row,
    AMOUNT: number(row.AMOUNT),
    YEAR_BE: Number.isFinite(Number(row.YEAR_BE)) ? Number(row.YEAR_BE) : null,
  }));
  return { rows, meta: payload.meta || {} };
}

export function normaliseText(value) {
  return String(value ?? "").trim().toLocaleLowerCase("th-TH");
}

export function matchesText(row, query) {
  const q = normaliseText(query);
  if (!q) return true;
  return [
    row.ITEM_DESCRIPTION,
    row.DELIVERABLE,
    row.BUDGETARY_UNIT,
    row.BUDGET_PLAN,
    row.CATEGORY_LV1,
    row.PROVINCE,
    row.AMPHOE,
    row.TAMBON,
  ].some((value) => normaliseText(value).includes(q));
}

/**
 * Applies every active filter. Set includeYear=false for cross-year commitment charts,
 * while retaining organisation, category, geography and free-text filtering.
 */
export function filterRows(rows, state, { includeYear = true } = {}) {
  return rows.filter((row) => (
    (!includeYear || !state.YEAR_TYPE || row.YEAR_TYPE === state.YEAR_TYPE) &&
    (!state.BUDGETARY_UNIT || row.BUDGETARY_UNIT === state.BUDGETARY_UNIT) &&
    (!state.BUDGET_PLAN || row.BUDGET_PLAN === state.BUDGET_PLAN) &&
    (!state.CATEGORY_LV1 || row.CATEGORY_LV1 === state.CATEGORY_LV1) &&
    (!state.REGION || row.REGION === state.REGION) &&
    (!state.PROVINCE || row.PROVINCE === state.PROVINCE) &&
    matchesText(row, state.q)
  ));
}

export function rollup(rows, key, limit = 0) {
  const totals = new Map();
  for (const row of rows) {
    const label = row[key] || "ไม่ระบุ";
    totals.set(label, (totals.get(label) || 0) + number(row.AMOUNT));
  }
  const result = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  return limit ? result.slice(0, limit) : result;
}

export function countBy(rows, key) {
  const totals = new Map();
  for (const row of rows) {
    const label = row[key] || "ไม่ระบุ";
    totals.set(label, (totals.get(label) || 0) + 1);
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1]);
}

export function unique(rows, key) {
  return [...new Set(rows.map((row) => row[key]).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b), "th"));
}

export function median(values) {
  if (!values.length) return 0;
  const sorted = values.map(number).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Gini coefficient over non-negative values. 0 = perfectly equal, 1 = maximally unequal. */
export function gini(values) {
  const sorted = values.map(number).filter((value) => value >= 0).sort((a, b) => a - b);
  const n = sorted.length;
  const total = sorted.reduce((acc, value) => acc + value, 0);
  if (!n || !total) return 0;
  let weightedTotal = 0;
  sorted.forEach((value, index) => { weightedTotal += (index + 1) * value; });
  return ((2 * weightedTotal) / (n * total)) - ((n + 1) / n);
}

/** Herfindahl–Hirschman index on a 0–10,000 scale. */
export function hhi(rows, key = "BUDGETARY_UNIT") {
  const total = sum(rows);
  if (!total) return 0;
  return rollup(rows, key).reduce((score, [, value]) => {
    const share = value / total;
    return score + (share * share * 10000);
  }, 0);
}

export function hierarchy(rows, keys) {
  const root = new Map();
  for (const row of rows) {
    let node = root;
    for (const key of keys) {
      const label = row[key] || "ไม่ระบุ";
      if (!node.has(label)) node.set(label, { value: 0, children: new Map() });
      const entry = node.get(label);
      entry.value += number(row.AMOUNT);
      node = entry.children;
    }
  }
  const convert = (tree) => [...tree.entries()].map(([name, value]) => {
    const children = convert(value.children);
    return children.length ? { name, value: value.value, children } : { name, value: value.value };
  }).sort((a, b) => b.value - a.value);
  return convert(root);
}

export function percentileCount(rows, threshold = 0.8) {
  const values = rows.map((row) => number(row.AMOUNT)).filter((value) => value > 0).sort((a, b) => b - a);
  const total = values.reduce((acc, value) => acc + value, 0);
  if (!total) return { count: 0, ratio: 0 };
  let running = 0;
  for (let index = 0; index < values.length; index += 1) {
    running += values[index];
    if (running / total >= threshold) return { count: index + 1, ratio: running / total };
  }
  return { count: values.length, ratio: 1 };
}

export function isTruthy(value) {
  return value === true || value === 1 || value === "true" || value === "True";
}

export function calculateMetrics(rows) {
  const total = sum(rows);
  const investment = rows.filter((row) => row.CATEGORY_LV1 === "งบลงทุน");
  const geoRows = rows.filter((row) => row.PROVINCE);
  const pooled = rows.filter((row) => isTruthy(row.IS_POOLED));
  const royal = rows.filter((row) => isTruthy(row.IS_ROYAL));
  const sorted = [...rows].sort((a, b) => number(b.AMOUNT) - number(a.AMOUNT));
  const top10 = sum(sorted.slice(0, 10));
  const average = rows.length ? total / rows.length : 0;
  const values = rows.map((row) => number(row.AMOUNT));
  const med = median(values);
  const pareto80 = percentileCount(rows, 0.8);

  return {
    total,
    count: rows.length,
    investment: sum(investment),
    investmentRatio: total ? (sum(investment) / total) * 100 : 0,
    geo: sum(geoRows),
    geoRatio: total ? (sum(geoRows) / total) * 100 : 0,
    geoRowRatio: rows.length ? (geoRows.length / rows.length) * 100 : 0,
    pooled: sum(pooled),
    pooledRatio: total ? (sum(pooled) / total) * 100 : 0,
    royal: sum(royal),
    top10,
    top10Ratio: total ? (top10 / total) * 100 : 0,
    hhi: hhi(rows),
    giniProvince: gini(rollup(geoRows, "PROVINCE").map(([, value]) => value)),
    median: med,
    mean: average,
    meanMedianRatio: med ? average / med : 0,
    pareto80,
    sorted,
  };
}

export function commitmentSummary(rows) {
  const byYear = new Map();
  for (const row of rows) {
    if (!row.YEAR_BE) continue;
    const current = byYear.get(row.YEAR_BE) || { year: row.YEAR_BE, amount: 0, count: 0, types: new Set() };
    current.amount += number(row.AMOUNT);
    current.count += 1;
    if (row.YEAR_TYPE) current.types.add(row.YEAR_TYPE);
    byYear.set(row.YEAR_BE, current);
  }
  const years = [...byYear.values()].sort((a, b) => a.year - b.year).map((entry) => ({
    ...entry,
    type: [...entry.types].join(", ") || "ไม่ระบุ",
  }));
  const current = years.find((entry) => entry.year === CURRENT_YEAR)?.amount || 0;
  const next = years.find((entry) => entry.year === CURRENT_YEAR + 1)?.amount || 0;
  const previous = years.filter((entry) => entry.year < CURRENT_YEAR).reduce((acc, entry) => acc + entry.amount, 0);
  const future = years.filter((entry) => entry.year > CURRENT_YEAR).reduce((acc, entry) => acc + entry.amount, 0);
  return { years, current, next, previous, future, forwardRatio: current ? (next / current) * 100 : 0 };
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;",
  }[char]));
}

export function csvFromRows(rows) {
  const columns = [
    "BUDGETARY_UNIT", "BUDGET_PLAN", "PLAN_TYPE", "DELIVERABLE", "DELIV_TYPE",
    "CATEGORY_LV1", "CATEGORY_LV2", "CATEGORY_LV3", "CATEGORY_LV4", "ITEM_DESCRIPTION",
    "PROVINCE", "AMPHOE", "TAMBON", "REGION", "YEAR_BE", "YEAR_TYPE", "AMOUNT",
  ];
  const escapeCsv = (value) => `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
  return `\uFEFF${[columns.join(","), ...rows.map((row) => columns.map((key) => escapeCsv(row[key])).join(","))].join("\n")}`;
}

export function downloadCsv(rows, filename = "agri_budget_filtered.csv") {
  const url = URL.createObjectURL(new Blob([csvFromRows(rows)], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
