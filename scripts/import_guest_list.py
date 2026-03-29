#!/usr/bin/env python3
"""Import Guest List.xlsx into Supabase guests table without third-party deps.

Usage:
  SUPABASE_URL=... SUPABASE_ANON_KEY=... [TENANT_ID=...] \
  python scripts/import_guest_list.py "Guest List.xlsx"
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile


def normalize_col(name: str) -> str:
    key = re.sub(r"[^a-z0-9]+", "_", (name or "").strip().lower()).strip("_")
    aliases = {
        "full_name": "name",
        "guest_name": "name",
        "mobile": "phone",
        "phone_no": "phone",
        "phone_number": "phone",
        "id": "id_number",
        "id_no": "id_number",
        "nid": "id_number",
        "national_id": "id_number",
        "email_address": "email",
        "nationality": "country",
        "id_card": "id_card",
    }
    return aliases.get(key, key)


def normalize_supabase_url(raw: str) -> str:
    value = (raw or "").strip().rstrip("/")
    if "supabase.com/dashboard/project/" in value:
        project_ref = value.split("/project/")[-1].split("/")[0]
        return f"https://{project_ref}.supabase.co"
    return value


def col_letters_to_index(ref: str) -> int:
    letters = "".join(ch for ch in ref if ch.isalpha())
    idx = 0
    for ch in letters:
        idx = idx * 26 + (ord(ch.upper()) - ord("A") + 1)
    return idx - 1


def to_int(value: str, default: int = 0) -> int:
    try:
        return int(str(value).strip())
    except Exception:
        return default


def read_xlsx_rows(path: str) -> list[dict[str, str]]:
    with zipfile.ZipFile(path) as zf:
        shared_strings = []
        if "xl/sharedStrings.xml" in zf.namelist():
            root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            ns = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
            for si in root.findall("a:si", ns):
                texts = [t.text or "" for t in si.findall(".//a:t", ns)]
                shared_strings.append("".join(texts))

        sheet_name = "xl/worksheets/sheet1.xml"
        if sheet_name not in zf.namelist():
            raise RuntimeError("Could not find sheet1.xml in workbook")

        root = ET.fromstring(zf.read(sheet_name))
        ns = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        rows = root.findall(".//a:sheetData/a:row", ns)

        parsed_rows: list[list[str]] = []
        for row in rows:
            values_by_idx: dict[int, str] = {}
            for cell in row.findall("a:c", ns):
                ref = cell.get("r", "A1")
                idx = col_letters_to_index(ref)
                ctype = cell.get("t")
                v = cell.find("a:v", ns)
                text = ""
                if ctype == "s" and v is not None and v.text is not None:
                    s_idx = int(v.text)
                    text = shared_strings[s_idx] if 0 <= s_idx < len(shared_strings) else ""
                elif ctype == "inlineStr":
                    t = cell.find("a:is/a:t", ns)
                    text = t.text if t is not None and t.text is not None else ""
                elif v is not None and v.text is not None:
                    text = v.text
                values_by_idx[idx] = text.strip()

            if not values_by_idx:
                continue
            max_idx = max(values_by_idx.keys())
            row_values = [values_by_idx.get(i, "") for i in range(max_idx + 1)]
            parsed_rows.append(row_values)

    if not parsed_rows:
        return []

    headers = [normalize_col(h) for h in parsed_rows[0]]
    out: list[dict[str, str]] = []
    for raw in parsed_rows[1:]:
        item = {}
        for i, val in enumerate(raw):
            if i >= len(headers):
                continue
            key = headers[i]
            if not key:
                continue
            item[key] = val.strip()
        if any(v for v in item.values()):
            out.append(item)
    return out


def request_json(method: str, url: str, key: str, payload: dict[str, str] | None = None):
    req = urllib.request.Request(
        url,
        method=method,
        data=json.dumps(payload).encode("utf-8") if payload is not None else None,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation" if payload is not None else "return=minimal",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        body = resp.read().decode("utf-8", errors="ignore")
        return json.loads(body) if body else []


def detect_tenant_id(supabase_url: str, key: str) -> str | None:
    checks = [
        f"{supabase_url}/rest/v1/hotel_settings?select=tenant_id&tenant_id=not.is.null&limit=1",
        f"{supabase_url}/rest/v1/guests?select=tenant_id&tenant_id=not.is.null&limit=1",
    ]
    for url in checks:
        try:
            data = request_json("GET", url, key)
            if isinstance(data, list) and data and data[0].get("tenant_id"):
                return str(data[0]["tenant_id"])
        except Exception:
            continue
    return None


def post_guest(supabase_url: str, key: str, payload: dict[str, str]) -> None:
    endpoint = f"{supabase_url}/rest/v1/guests"
    request_json("POST", endpoint, key, payload)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("xlsx_path", nargs="?", default="Guest List.xlsx")
    parser.add_argument("--dry-run", action="store_true", help="Parse workbook and print row count only")
    args = parser.parse_args()

    if not os.path.exists(args.xlsx_path):
        print(f"❌ File not found: {args.xlsx_path}", file=sys.stderr)
        return 1

    raw_url = os.getenv("SUPABASE_URL", "")
    supabase_url = normalize_supabase_url(raw_url)
    supabase_key = os.getenv("SUPABASE_ANON_KEY")
    tenant_id = os.getenv("TENANT_ID")

    if not supabase_url or not supabase_key:
        print("❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars", file=sys.stderr)
        return 1

    if not tenant_id:
        tenant_id = detect_tenant_id(supabase_url, supabase_key)
        if tenant_id:
            print(f"ℹ️ Detected TENANT_ID={tenant_id}")

    if not tenant_id:
        print("❌ TENANT_ID missing and could not auto-detect from database", file=sys.stderr)
        return 1

    rows = read_xlsx_rows(args.xlsx_path)
    if not rows:
        print("⚠️ No data rows found in workbook")
        return 0

    if args.dry_run:
        print(f"✅ Parsed workbook successfully. Rows found: {len(rows)}")
        return 0

    inserted = 0
    for row in rows:
        name = row.get("name", "").strip()
        if not name:
            continue
        payload = {
            "tenant_id": tenant_id,
            "name": name,
            "phone": row.get("phone", ""),
            "email": row.get("email", ""),
            "id_type": row.get("id_type", "NID") or "NID",
            "id_number": row.get("id_number", "") or row.get("id_card", ""),
            "id_card": row.get("id_card", "") or row.get("id_number", ""),
            "country": row.get("country", ""),
            "city": row.get("city", ""),
            "address": row.get("address", ""),
            "preferences": row.get("preferences", ""),
            "id_image_url": row.get("id_image_url", ""),
            "outstanding_balance": to_int(row.get("outstanding_balance", "0"), 0),
        }
        try:
            post_guest(supabase_url, supabase_key, payload)
            inserted += 1
        except urllib.error.HTTPError as e:
            msg = e.read().decode("utf-8", errors="ignore")
            print(f"⚠️ Failed for {name}: HTTP {e.code} {msg}")
        except Exception as e:
            print(f"⚠️ Failed for {name}: {e}")

    print(f"✅ Import finished. Inserted {inserted} guests.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
