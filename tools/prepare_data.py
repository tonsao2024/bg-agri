# -*- coding: utf-8 -*-
"""Prepare data/Agr_Budget-2569.csv for the browser-only dashboard.

The source file holds the current appropriations in Buddhist Era years but stores
cross-year commitments in Gregorian years. This script normalises every record to
B.E. and deliberately keeps both sets of records while labelling them separately.

Run from the repository root:
    python tools/prepare_data.py

The default validation is intentional: FY 2569 must total 130,111,038,700 baht.
Use --skip-total-check only when deliberately processing a revised source file.
"""
from __future__ import annotations

import argparse
import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SRC = ROOT / "data" / "Agr_Budget-2569.csv"
DEFAULT_DST = ROOT / "data" / "budget.json"
CUR_YEAR_BE = 2569
EXPECTED_TOTAL = 130_111_038_700.0

PROVINCES = [
    "กรุงเทพมหานคร", "กระบี่", "กาญจนบุรี", "กาฬสินธุ์", "กำแพงเพชร", "ขอนแก่น", "จันทบุรี",
    "ฉะเชิงเทรา", "ชลบุรี", "ชัยนาท", "ชัยภูมิ", "ชุมพร", "เชียงราย", "เชียงใหม่", "ตรัง", "ตราด", "ตาก",
    "นครนายก", "นครปฐม", "นครพนม", "นครราชสีมา", "นครศรีธรรมราช", "นครสวรรค์", "นนทบุรี", "นราธิวาส",
    "น่าน", "บึงกาฬ", "บุรีรัมย์", "ปทุมธานี", "ประจวบคีรีขันธ์", "ปราจีนบุรี", "ปัตตานี", "พระนครศรีอยุธยา",
    "พะเยา", "พังงา", "พัทลุง", "พิจิตร", "พิษณุโลก", "เพชรบุรี", "เพชรบูรณ์", "แพร่", "ภูเก็ต", "มหาสารคาม",
    "มุกดาหาร", "แม่ฮ่องสอน", "ยโสธร", "ยะลา", "ร้อยเอ็ด", "ระนอง", "ระยอง", "ราชบุรี", "ลพบุรี", "ลำปาง",
    "ลำพูน", "เลย", "ศรีสะเกษ", "สกลนคร", "สงขลา", "สตูล", "สมุทรปราการ", "สมุทรสงคราม", "สมุทรสาคร",
    "สระแก้ว", "สระบุรี", "สิงห์บุรี", "สุโขทัย", "สุพรรณบุรี", "สุราษฎร์ธานี", "สุรินทร์", "หนองคาย",
    "หนองบัวลำภู", "อ่างทอง", "อำนาจเจริญ", "อุดรธานี", "อุตรดิตถ์", "อุทัยธานี", "อุบลราชธานี",
]

# Six-region grouping used in the dashboard. Every province must occur exactly once.
REGION = {
    "เหนือ": ["เชียงใหม่", "เชียงราย", "ลำปาง", "ลำพูน", "แม่ฮ่องสอน", "น่าน", "พะเยา", "แพร่", "อุตรดิตถ์"],
    "ตะวันออกเฉียงเหนือ": ["ขอนแก่น", "นครราชสีมา", "อุดรธานี", "อุบลราชธานี", "บุรีรัมย์", "สุรินทร์",
                          "ศรีสะเกษ", "ร้อยเอ็ด", "มหาสารคาม", "กาฬสินธุ์", "ชัยภูมิ", "สกลนคร", "นครพนม",
                          "มุกดาหาร", "เลย", "หนองคาย", "หนองบัวลำภู", "บึงกาฬ", "ยโสธร", "อำนาจเจริญ"],
    "กลาง": ["กรุงเทพมหานคร", "นนทบุรี", "ปทุมธานี", "พระนครศรีอยุธยา", "อ่างทอง", "ลพบุรี", "สิงห์บุรี",
              "ชัยนาท", "สระบุรี", "นครปฐม", "สมุทรปราการ", "สมุทรสาคร", "สมุทรสงคราม", "สุพรรณบุรี",
              "นครสวรรค์", "อุทัยธานี", "กำแพงเพชร", "ตาก", "สุโขทัย", "พิษณุโลก", "พิจิตร", "เพชรบูรณ์"],
    "ตะวันออก": ["ชลบุรี", "ระยอง", "จันทบุรี", "ตราด", "ฉะเชิงเทรา", "ปราจีนบุรี", "นครนายก", "สระแก้ว"],
    "ตะวันตก": ["ราชบุรี", "กาญจนบุรี", "เพชรบุรี", "ประจวบคีรีขันธ์"],
    "ใต้": ["นครศรีธรรมราช", "กระบี่", "พังงา", "ภูเก็ต", "สุราษฎร์ธานี", "ระนอง", "ชุมพร", "สงขลา", "สตูล",
            "ตรัง", "พัทลุง", "ปัตตานี", "ยะลา", "นราธิวาส"],
}
P2R = {province: region for region, provinces in REGION.items() for province in provinces}

# Match the longest province first, e.g. do not stop halfway through a long name.
PROVINCE_PATTERN = re.compile(r"จังหวัด\s*(" + "|".join(sorted(PROVINCES, key=len, reverse=True)) + r")")
AMPHOE_PATTERN = re.compile(r"อำเภอ\s*([ก-๙]+)")
TAMBON_PATTERN = re.compile(r"ตำบล\s*([ก-๙]+)")

REQUIRED_COLUMNS = {
    "BUDGETARY_UNIT", "BUDGET_PLAN", "OUTPUT", "PROJECT", "CATEGORY_LV1", "CATEGORY_LV2",
    "CATEGORY_LV3", "CATEGORY_LV4", "ITEM_DESCRIPTION", "AMOUNT", "FISCAL_YEAR",
}


def norm(value):
    """Return a clean text value, using None consistently for empty strings/NaN."""
    if pd.isna(value):
        return None
    value = unicodedata.normalize("NFC", str(value)).replace("\u200b", "").strip()
    return value or None


def to_year_be(value):
    """Convert a B.E. or C.E. fiscal-year cell to B.E.; missing values remain None."""
    if pd.isna(value):
        return None
    try:
        year = int(float(str(value).strip()))
    except (TypeError, ValueError):
        return None
    return year if year > 2400 else year + 543


def classify_year(year):
    if year is None:
        return "ไม่ระบุปี"
    if year == CUR_YEAR_BE:
        return f"ปีงบประมาณ {CUR_YEAR_BE}"
    return "ผูกพันปีก่อนหน้า" if year < CUR_YEAR_BE else "ผูกพันปีถัดไป"


def plan_type(plan):
    plan = plan or ""
    for keyword in ("บูรณาการ", "ยุทธศาสตร์", "พื้นฐาน", "บุคลากร"):
        if keyword in plan:
            return f"แผนงาน{keyword}"
    return "อื่น ๆ"


def extract_geography(text):
    text = text or ""
    province_match = PROVINCE_PATTERN.search(text)
    # Bangkok is frequently written without the word จังหวัด.
    province = province_match.group(1) if province_match else ("กรุงเทพมหานคร" if "กรุงเทพมหานคร" in text else None)
    amphoe_match = AMPHOE_PATTERN.search(text)
    tambon_match = TAMBON_PATTERN.search(text)
    return province, (amphoe_match.group(1) if amphoe_match else None), (tambon_match.group(1) if tambon_match else None)


def validate_regions():
    missing = sorted(set(PROVINCES) - set(P2R))
    duplicates = [province for province in PROVINCES if sum(province in provinces for provinces in REGION.values()) != 1]
    if missing or duplicates:
        raise RuntimeError(f"Region mapping is incomplete. Missing={missing}; duplicate={duplicates}")


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--src", type=Path, default=DEFAULT_SRC, help=f"CSV input (default: {DEFAULT_SRC})")
    parser.add_argument("--dst", type=Path, default=DEFAULT_DST, help=f"JSON output (default: {DEFAULT_DST})")
    parser.add_argument("--skip-total-check", action="store_true", help="Allow a FY2569 total other than the expected reference total")
    return parser.parse_args()


def main():
    args = parse_args()
    validate_regions()
    if not args.src.exists():
        raise SystemExit(f"Missing source CSV: {args.src}\nAdd Agr_Budget-2569.csv under data/ or pass --src PATH.")

    # utf-8-sig accepts normal UTF-8 and files carrying an Excel BOM.
    try:
        df = pd.read_csv(args.src, encoding="utf-8-sig")
    except UnicodeDecodeError:
        df = pd.read_csv(args.src, encoding="utf-8")

    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise SystemExit(f"CSV is missing required columns: {', '.join(sorted(missing))}")

    for column in df.columns:
        if df[column].dtype == object:
            df[column] = df[column].map(norm)

    # Amounts can be numbers or comma-formatted strings in exports from spreadsheets.
    df["AMOUNT"] = pd.to_numeric(df["AMOUNT"].astype(str).str.replace(",", "", regex=False), errors="coerce").fillna(0.0)

    # 1) Keep the commitments but normalise their C.E. years to B.E.
    df["YEAR_BE"] = df["FISCAL_YEAR"].map(to_year_be)
    df["YEAR_TYPE"] = df["YEAR_BE"].map(classify_year)

    # 2) A record normally has either a project or an output. Use one drill-down field.
    df["DELIVERABLE"] = df["PROJECT"].where(df["PROJECT"].notna(), df["OUTPUT"]).fillna("ไม่ระบุ")
    df["DELIV_TYPE"] = df["PROJECT"].notna().map({True: "โครงการ", False: "ผลผลิต"})

    # 3) Simplified policy-plan dimension.
    df["PLAN_TYPE"] = df["BUDGET_PLAN"].map(plan_type)

    # 4) Extract a geographic dimension from item descriptions.
    geographic = df["ITEM_DESCRIPTION"].apply(extract_geography).apply(pd.Series)
    geographic.columns = ["PROVINCE", "AMPHOE", "TAMBON"]
    df[["PROVINCE", "AMPHOE", "TAMBON"]] = geographic
    df["REGION"] = df["PROVINCE"].map(P2R)
    df["GEO_FLAG"] = df["PROVINCE"].notna().map({True: "ระบุพื้นที่", False: "ส่วนกลาง/ไม่ระบุ"})

    # 5) Extra analysis flags and a compact category path.
    item_text = df["ITEM_DESCRIPTION"].fillna("")
    deliverable_text = df["DELIVERABLE"].fillna("")
    df["IS_POOLED"] = item_text.str.contains(r"รายการ\s*\(รวม|ต่อหน่วยต่ำกว่า", regex=True, na=False)
    df["IS_ROYAL"] = item_text.str.contains("พระราชดำริ", regex=False, na=False) | deliverable_text.str.contains("พระราชดำริ", regex=False, na=False)
    category_columns = ["CATEGORY_LV1", "CATEGORY_LV2", "CATEGORY_LV3", "CATEGORY_LV4"]
    df["CAT_PATH"] = df[category_columns].fillna("").agg(lambda row: " > ".join(value for value in row if value), axis=1)

    current_total = float(df.loc[df["YEAR_BE"] == CUR_YEAR_BE, "AMOUNT"].sum())
    if not args.skip_total_check and abs(current_total - EXPECTED_TOTAL) > 0.01:
        raise SystemExit(
            f"FY{CUR_YEAR_BE} total is {current_total:,.2f}, not the expected {EXPECTED_TOTAL:,.2f}. "
            "Stop: check the CSV encoding/columns/year parsing, or explicitly use --skip-total-check for a revised source."
        )

    output_columns = [
        "BUDGETARY_UNIT", "BUDGET_PLAN", "PLAN_TYPE", "DELIVERABLE", "DELIV_TYPE",
        "CATEGORY_LV1", "CATEGORY_LV2", "CATEGORY_LV3", "CATEGORY_LV4", "CAT_PATH",
        "ITEM_DESCRIPTION", "AMOUNT", "YEAR_BE", "YEAR_TYPE", "PROVINCE", "AMPHOE",
        "TAMBON", "REGION", "GEO_FLAG", "IS_POOLED", "IS_ROYAL",
    ]
    output = df[output_columns].where(pd.notna(df[output_columns]), None)
    # A pandas JSON round trip gives json.dump only standard Python scalar types.
    records = json.loads(output.to_json(orient="records", force_ascii=False))
    payload = {
        "meta": {
            "fiscal_year": CUR_YEAR_BE,
            "rows": len(records),
            "total_cur": current_total,
            "source": args.src.name,
            "prepared_at": datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M %z"),
        },
        "rows": records,
    }

    args.dst.parent.mkdir(parents=True, exist_ok=True)
    with args.dst.open("w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, separators=(",", ":"))

    print(f"rows: {len(records):,}")
    print(f"FY{CUR_YEAR_BE} total: {current_total:.1f}")
    print(f"geocoded rows: {int(df['PROVINCE'].notna().sum()):,}")
    print(f"written: {args.dst} ({args.dst.stat().st_size / 1024 / 1024:.2f} MB)")


if __name__ == "__main__":
    main()
