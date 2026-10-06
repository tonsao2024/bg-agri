import { hierarchy, formatBaht, formatCompactNumber, rollup, sum } from "./data.js";

const COLORS = {
  ink: "#17342e",
  muted: "#667e76",
  line: "#d6ddd2",
  surface: "#fffdf8",
  green: "#1f705c",
  greenDark: "#164a3e",
  mint: "#97d5b3",
  lime: "#ccda62",
  orange: "#ee8d4a",
  red: "#c95745",
  pale: "#edf1e9",
};
const FONT = 'Sarabun, Tahoma, sans-serif';
const MONO = '"DM Mono", monospace';

function requireEcharts() {
  if (!window.echarts) throw new Error("ไม่สามารถโหลด ECharts ได้");
  return window.echarts;
}

export function createCharts(ids) {
  const echarts = requireEcharts();
  const charts = {};
  ids.forEach((id) => {
    const element = document.getElementById(id);
    if (element) charts[id] = echarts.init(element, null, { renderer: "canvas" });
  });
  return charts;
}

export function resizeCharts(charts) {
  Object.values(charts).forEach((chart) => chart?.resize());
}

function tooltip(formatter) {
  return {
    backgroundColor: "rgba(22, 74, 62, .96)",
    borderWidth: 0,
    padding: [8, 10],
    textStyle: { color: "#f8fcf7", fontFamily: FONT, fontSize: 12 },
    formatter,
  };
}

function emptyOption(message) {
  return {
    backgroundColor: "transparent",
    graphic: [{
      type: "text",
      left: "center",
      top: "middle",
      style: { text: message, fill: COLORS.muted, font: `13px ${FONT}`, textAlign: "center", lineHeight: 20 },
    }],
  };
}

export function showEmpty(chart, message = "ไม่มีข้อมูลตามตัวกรอง") {
  chart?.setOption(emptyOption(message), true);
}

function set(chart, option) {
  if (!chart) return;
  chart.setOption(option, true);
}

export function drawHorizontalBar(chart, data, { limit = 15, color = COLORS.green, label = "" } = {}) {
  const items = (limit ? data.slice(0, limit) : data).reverse();
  if (!items.length) return showEmpty(chart);
  set(chart, {
    animationDuration: 380,
    backgroundColor: "transparent",
    tooltip: tooltip((params) => `${params.name}<br><b>${formatBaht(params.value)}</b>`),
    grid: { left: 4, right: 18, top: 4, bottom: 12, containLabel: true },
    xAxis: {
      type: "value", splitNumber: 4,
      axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: "#e2e7df", type: "dashed" } },
      axisLabel: { color: COLORS.muted, fontSize: 10, formatter: formatCompactNumber },
    },
    yAxis: {
      type: "category", data: items.map(([name]) => name),
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: COLORS.ink, fontFamily: FONT, fontSize: 11, width: 150, overflow: "truncate" },
    },
    series: [{
      name: label, type: "bar", data: items.map(([, value]) => value), barMaxWidth: 20,
      itemStyle: { color, borderRadius: [0, 4, 4, 0] },
      emphasis: { itemStyle: { color: COLORS.orange } },
    }],
  });
}

export function drawDonut(chart, data) {
  if (!data.length) return showEmpty(chart);
  const colors = [COLORS.green, COLORS.lime, COLORS.orange, COLORS.mint, "#6e9d91", COLORS.red, "#c5d5cc"];
  set(chart, {
    animationDuration: 380,
    backgroundColor: "transparent",
    color: colors,
    tooltip: tooltip((p) => `${p.name}<br><b>${formatBaht(p.value)}</b> · ${p.percent.toFixed(1)}%`),
    legend: {
      type: "scroll", bottom: 0, left: "center", right: 0, itemWidth: 9, itemHeight: 9, itemGap: 11,
      textStyle: { color: COLORS.ink, fontFamily: FONT, fontSize: 10 },
    },
    series: [{
      type: "pie", radius: ["43%", "68%"], center: ["50%", "43%"], minAngle: 2,
      itemStyle: { borderColor: COLORS.surface, borderWidth: 3, borderRadius: 3 },
      label: { show: false },
      emphasis: { scale: true, scaleSize: 6, label: { show: true, formatter: "{b}\n{d}%", color: COLORS.ink, fontFamily: FONT, fontSize: 11 } },
      data: data.map(([name, value]) => ({ name, value })),
    }],
  });
}

export function drawTreemap(chart, rows) {
  if (!rows.length) return showEmpty(chart);
  set(chart, {
    animationDuration: 400,
    backgroundColor: "transparent",
    tooltip: tooltip((p) => `${p.name}<br><b>${formatBaht(p.value)}</b>`),
    series: [{
      type: "treemap", data: hierarchy(rows, ["BUDGETARY_UNIT", "CATEGORY_LV1", "CATEGORY_LV2"]),
      roam: false, nodeClick: "zoomToNode", sort: "desc", visibleMin: 1,
      breadcrumb: { show: true, bottom: 0, height: 20, itemStyle: { color: COLORS.pale, borderColor: COLORS.line }, textStyle: { color: COLORS.ink, fontFamily: FONT, fontSize: 10 } },
      label: { show: true, color: "#f9fdf9", fontFamily: FONT, fontSize: 11, overflow: "truncate" },
      upperLabel: { show: true, height: 18, color: COLORS.ink, fontFamily: FONT, fontSize: 11 },
      itemStyle: { borderColor: COLORS.surface, borderWidth: 3, gapWidth: 3 },
      levels: [
        { itemStyle: { borderColor: COLORS.surface, borderWidth: 4, gapWidth: 4 }, upperLabel: { show: false }, color: [COLORS.green, "#478c79", "#739b55", "#b2a842", "#d27a45"] },
        { itemStyle: { borderColor: COLORS.surface, borderWidth: 2, gapWidth: 2 }, colorSaturation: [0.3, 0.68] },
        { itemStyle: { borderColor: COLORS.surface, borderWidth: 1, gapWidth: 1 }, colorSaturation: [0.22, 0.56] },
      ],
    }],
  });
}

export function drawSunburst(chart, rows) {
  if (!rows.length) return showEmpty(chart);
  set(chart, {
    animationDuration: 420,
    backgroundColor: "transparent",
    color: [COLORS.green, COLORS.lime, COLORS.orange, COLORS.mint, "#6e9d91", "#b6a34e", "#c9d9c8"],
    tooltip: tooltip((p) => `${p.treePathInfo.map((item) => item.name).filter(Boolean).join(" › ")}<br><b>${formatBaht(p.value)}</b>`),
    series: [{
      type: "sunburst", data: hierarchy(rows, ["PLAN_TYPE", "BUDGET_PLAN", "DELIVERABLE"]),
      radius: [0, "91%"], center: ["50%", "50%"], nodeClick: "rootToNode", sort: "desc",
      emphasis: { focus: "ancestor" },
      label: { color: COLORS.ink, fontFamily: FONT, fontSize: 10, minAngle: 9, rotate: "radial" },
      itemStyle: { borderColor: COLORS.surface, borderWidth: 2 },
      levels: [{ r0: "0%", r: "24%", label: { rotate: 0, fontWeight: 700 } }, { r0: "24%", r: "57%", label: { rotate: "tangential" } }, { r0: "57%", r: "91%", label: { fontSize: 9 } }],
    }],
  });
}

export function drawHeatmap(chart, rows) {
  const units = rollup(rows, "BUDGETARY_UNIT", 12).map(([name]) => name);
  const categories = rollup(rows, "CATEGORY_LV1").map(([name]) => name);
  if (!units.length || !categories.length) return showEmpty(chart);
  const map = new Map();
  rows.forEach((row) => {
    if (!units.includes(row.BUDGETARY_UNIT || "ไม่ระบุ") || !categories.includes(row.CATEGORY_LV1 || "ไม่ระบุ")) return;
    const key = `${row.BUDGETARY_UNIT || "ไม่ระบุ"}|||${row.CATEGORY_LV1 || "ไม่ระบุ"}`;
    map.set(key, (map.get(key) || 0) + Number(row.AMOUNT || 0));
  });
  const data = []; let maximum = 0;
  units.forEach((unit, y) => categories.forEach((category, x) => {
    const value = map.get(`${unit}|||${category}`) || 0;
    maximum = Math.max(maximum, value);
    data.push([x, y, value]);
  }));
  set(chart, {
    animationDuration: 350,
    backgroundColor: "transparent",
    tooltip: tooltip((p) => `${units[p.value[1]]}<br>${categories[p.value[0]]}<br><b>${formatBaht(p.value[2])}</b>`),
    grid: { left: 2, right: 4, top: 57, bottom: 5, containLabel: true },
    xAxis: { type: "category", data: categories, position: "top", axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: COLORS.ink, fontFamily: FONT, fontSize: 10, rotate: 28, interval: 0, width: 90, overflow: "truncate" } },
    yAxis: { type: "category", data: units, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: COLORS.ink, fontFamily: FONT, fontSize: 10, width: 126, overflow: "truncate" } },
    visualMap: { min: 0, max: maximum || 1, show: false, inRange: { color: ["#edf1e9", "#b6dbc4", "#4f9c82", "#164a3e"] } },
    series: [{ type: "heatmap", data, itemStyle: { borderColor: COLORS.surface, borderWidth: 2 } }],
  });
}

export function drawPareto(chart, sortedRows) {
  if (!sortedRows.length) return showEmpty(chart);
  const rows = sortedRows.slice(0, 300);
  const total = sum(sortedRows) || 1;
  let running = 0;
  const values = rows.map((row) => {
    running += Number(row.AMOUNT || 0);
    return +(running / total * 100).toFixed(2);
  });
  set(chart, {
    animationDuration: 400,
    backgroundColor: "transparent",
    tooltip: tooltip((params) => `รายการอันดับ 1–${params[0].axisValue}<br>สะสม <b>${params[0].data}%</b> ของงบที่กรอง`),
    grid: { left: 6, right: 15, top: 21, bottom: 5, containLabel: true },
    xAxis: { type: "category", data: rows.map((_, index) => index + 1), name: "อันดับรายการ", nameTextStyle: { color: COLORS.muted, fontSize: 10, padding: [10, 0, 0, 0] }, axisLine: { lineStyle: { color: COLORS.line } }, axisTick: { show: false }, axisLabel: { color: COLORS.muted, fontSize: 10, formatter: (value) => (value % 50 === 0 ? value : "") } },
    yAxis: { type: "value", min: 0, max: 100, axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: "#e2e7df", type: "dashed" } }, axisLabel: { color: COLORS.muted, fontSize: 10, formatter: "{value}%" } },
    series: [{ type: "line", data: values, symbol: "none", smooth: true, lineStyle: { color: COLORS.orange, width: 2 }, areaStyle: { color: "rgba(238,141,74,.16)" }, markLine: { symbol: "none", silent: true, lineStyle: { color: COLORS.red, type: "dashed" }, label: { color: COLORS.red, formatter: "80%" }, data: [{ yAxis: 80 }] } }],
  });
}

export function drawYearBars(chart, yearSummary, currentYear) {
  if (!yearSummary.length) return showEmpty(chart, "ไม่มีข้อมูลปีงบประมาณ");
  const years = yearSummary.map((item) => item.year);
  set(chart, {
    animationDuration: 380,
    backgroundColor: "transparent",
    tooltip: tooltip((p) => {
      const item = yearSummary[p.dataIndex];
      return `ปีงบประมาณ ${p.name}<br>${item.type}<br><b>${formatBaht(p.value)}</b><br><span style="color:#c9d9d0">${item.count.toLocaleString("th-TH")} รายการ</span>`;
    }),
    grid: { left: 8, right: 13, top: 18, bottom: 6, containLabel: true },
    xAxis: { type: "category", data: years, axisLine: { lineStyle: { color: COLORS.line } }, axisTick: { show: false }, axisLabel: { color: COLORS.ink, fontFamily: MONO, fontSize: 10 } },
    yAxis: { type: "value", axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: "#e2e7df", type: "dashed" } }, axisLabel: { color: COLORS.muted, fontSize: 10, formatter: formatCompactNumber } },
    series: [{ type: "bar", data: yearSummary.map((item) => ({ value: item.amount, itemStyle: { color: item.year === currentYear ? COLORS.orange : (item.year > currentYear ? COLORS.green : "#8ca9a0"), borderRadius: [4, 4, 0, 0] } })), barMaxWidth: 46 }],
  });
}

const ENGLISH_TO_THAI = {
  "amnat charoen": "อำนาจเจริญ", "ang thong": "อ่างทอง", "bangkok": "กรุงเทพมหานคร", "bangkok metropolis": "กรุงเทพมหานคร", "bueng kan": "บึงกาฬ", "buriram": "บุรีรัมย์", "chachoengsao": "ฉะเชิงเทรา", "chai nat": "ชัยนาท", "chaiyaphum": "ชัยภูมิ", "chanthaburi": "จันทบุรี", "chiang mai": "เชียงใหม่", "chiang rai": "เชียงราย", "chon buri": "ชลบุรี", "chonburi": "ชลบุรี", "chumphon": "ชุมพร", "kalasin": "กาฬสินธุ์", "kamphaeng phet": "กำแพงเพชร", "kanchanaburi": "กาญจนบุรี", "khon kaen": "ขอนแก่น", "krabi": "กระบี่", "lampang": "ลำปาง", "lamphun": "ลำพูน", "loei": "เลย", "lop buri": "ลพบุรี", "lopburi": "ลพบุรี", "maha sarakham": "มหาสารคาม", "mukdahan": "มุกดาหาร", "nakhon nayok": "นครนายก", "nakhon pathom": "นครปฐม", "nakhon phanom": "นครพนม", "nakhon ratchasima": "นครราชสีมา", "nakhon si thammarat": "นครศรีธรรมราช", "nakhon sawan": "นครสวรรค์", "nonthaburi": "นนทบุรี", "narathiwat": "นราธิวาส", "nan": "น่าน", "nong bua lamphu": "หนองบัวลำภู", "nong khai": "หนองคาย", "pathum thani": "ปทุมธานี", "pattani": "ปัตตานี", "phang nga": "พังงา", "phangnga": "พังงา", "phatthalung": "พัทลุง", "phayao": "พะเยา", "phetchabun": "เพชรบูรณ์", "phetchaburi": "เพชรบุรี", "phichit": "พิจิตร", "phitsanulok": "พิษณุโลก", "phra nakhon si ayutthaya": "พระนครศรีอยุธยา", "ayutthaya": "พระนครศรีอยุธยา", "phrae": "แพร่", "phuket": "ภูเก็ต", "prachin buri": "ปราจีนบุรี", "prachuap khiri khan": "ประจวบคีรีขันธ์", "ranong": "ระนอง", "ratchaburi": "ราชบุรี", "rayong": "ระยอง", "roi et": "ร้อยเอ็ด", "sa kaeo": "สระแก้ว", "sakon nakhon": "สกลนคร", "samut prakan": "สมุทรปราการ", "samut sakhon": "สมุทรสาคร", "samut songkhram": "สมุทรสงคราม", "saraburi": "สระบุรี", "satun": "สตูล", "sing buri": "สิงห์บุรี", "singburi": "สิงห์บุรี", "sisaket": "ศรีสะเกษ", "sukhothai": "สุโขทัย", "suphan buri": "สุพรรณบุรี", "surat thani": "สุราษฎร์ธานี", "surin": "สุรินทร์", "tak": "ตาก", "trang": "ตรัง", "trat": "ตราด", "ubon ratchathani": "อุบลราชธานี", "udon thani": "อุดรธานี", "uthai thani": "อุทัยธานี", "uttaradit": "อุตรดิตถ์", "yala": "ยะลา", "yasothon": "ยโสธร", "mae hong son": "แม่ฮ่องสอน",
};

function cleanGeoName(value) {
  return String(value || "").toLowerCase().trim().replace(/^changwat\s+/, "").replace(/^province of\s+/, "").replace(/[-_]/g, " ").replace(/\s+/g, " ");
}

function thaiGeoName(properties) {
  const candidates = ["NAME_TH", "NAME_1", "name_th", "name", "NAME", "province", "PROV_NAM_T", "ADM1_TH"];
  for (const key of candidates) {
    const source = properties?.[key];
    if (!source) continue;
    if (/^[ก-๙]/.test(String(source).trim())) return String(source).trim().replace(/^จังหวัด/, "");
    const mapped = ENGLISH_TO_THAI[cleanGeoName(source)];
    if (mapped) return mapped;
  }
  return null;
}

/**
 * Imports a province GeoJSON if it exists. The normalisation makes common Thai and
 * English property names work with the Thai names extracted from the budget rows.
 */
export async function loadThailandMap(url = "data/thailand.geojson") {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const geojson = await response.json();
  if (!Array.isArray(geojson.features)) throw new Error("GeoJSON ไม่มี features");
  let mapped = 0;
  geojson.features.forEach((feature) => {
    feature.properties ||= {};
    const thai = thaiGeoName(feature.properties);
    if (thai) { feature.properties.name = thai; mapped += 1; }
  });
  if (!mapped) throw new Error("ไม่พบชื่อจังหวัดที่จับคู่ได้ใน GeoJSON");
  requireEcharts().registerMap("TH_BUDGET", geojson);
  return { mapped, total: geojson.features.length };
}

export function drawThailandMap(chart, provinceData, available) {
  if (!available) return showEmpty(chart, "ยังไม่มีไฟล์ data/thailand.geojson\nสามารถใช้งานกราฟจังหวัดด้านขวาได้");
  if (!provinceData.length) return showEmpty(chart, "ไม่มีงบที่ระบุจังหวัดตามตัวกรอง");
  const values = provinceData.map(([, value]) => value);
  const max = Math.max(...values, 1);
  set(chart, {
    animationDuration: 420,
    backgroundColor: "transparent",
    tooltip: tooltip((p) => `${p.name}<br><b>${p.value == null ? "ไม่พบรายการที่ระบุจังหวัด" : formatBaht(p.value)}</b>`),
    visualMap: { min: 0, max, left: 8, bottom: 6, calculable: false, orient: "horizontal", itemWidth: 10, itemHeight: 76, text: ["สูง", "ต่ำ"], textStyle: { color: COLORS.muted, fontFamily: FONT, fontSize: 10 }, inRange: { color: ["#eaf0e9", "#b5dbc3", "#62a989", COLORS.greenDark] } },
    series: [{ type: "map", map: "TH_BUDGET", roam: true, nameProperty: "name", data: provinceData.map(([name, value]) => ({ name, value })), label: { show: false, color: COLORS.ink, fontFamily: FONT, fontSize: 9 }, emphasis: { label: { show: true }, itemStyle: { areaColor: COLORS.orange } }, itemStyle: { areaColor: "#edf1e9", borderColor: COLORS.surface, borderWidth: 1 } }],
  });
}
