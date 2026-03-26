#!/usr/bin/env python3
"""학생맞춤통합지원 웹앱 서버.

- 정적 파일 제공(index.html, app.js, styles.css)
- 제보/사례/관리자 비밀번호를 파일 기반(JSON)으로 저장해
  같은 인트라넷 사용자 간 협업 데이터 공유
"""

from __future__ import annotations

import argparse
import http.server
import json
import os
import re
import socket
from datetime import datetime
from pathlib import Path
from threading import Lock
from urllib.parse import unquote

DB_FILE = Path("data.json")
DB_LOCK = Lock()


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def default_state() -> dict:
    return {
        "adminPassword": "1234",
        "caseCode": "SI",
        "reports": [],
        "cases": [],
    }


def read_state() -> dict:
    if not DB_FILE.exists():
        return default_state()

    with DB_FILE.open("r", encoding="utf-8") as file:
        return json.load(file)


def write_state(state: dict) -> None:
    with DB_FILE.open("w", encoding="utf-8") as file:
        json.dump(state, file, ensure_ascii=False, indent=2)


def generate_case_number(cases: list[dict], case_code: str) -> str:
    year = datetime.now().year
    pattern = re.compile(rf"^{year}-{re.escape(case_code)}-(\d{{3}})$")
    seq = 1

    for case_item in cases:
        matched = pattern.match(case_item["caseNumber"])
        if matched:
            seq = max(seq, int(matched.group(1)) + 1)

    return f"{year}-{case_code}-{seq:03d}"


def get_local_ip() -> str:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        sock.close()


def normalize_state_for_client(state: dict) -> dict:
    return {
        "caseCode": state.get("caseCode", "SI"),
        "reports": state["reports"],
        "cases": state["cases"],
    }


class StudentSupportHandler(http.server.SimpleHTTPRequestHandler):
    def cleaned_path(self) -> str:
        path = self.path.split("?", 1)[0]
        if path != "/" and path.endswith("/"):
            path = path[:-1]
        return path

    def json_response(self, status_code: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def parse_json_body(self) -> dict:
        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length).decode("utf-8")
        return json.loads(raw_body or "{}")

    def do_GET(self) -> None:
        path = self.cleaned_path()

        if path == "/api/state":
            with DB_LOCK:
                state = read_state()
            return self.json_response(200, {"state": normalize_state_for_client(state)})

        if path.startswith("/api/case/"):
            case_number = unquote(path.removeprefix("/api/case/")).strip().upper()
            with DB_LOCK:
                state = read_state()
                case_item = next((item for item in state["cases"] if item["caseNumber"] == case_number), None)
                if not case_item:
                    return self.json_response(404, {"error": "해당 사례번호를 찾을 수 없습니다."})

                report = next((item for item in state["reports"] if item["id"] == case_item["reportId"]), None)

            return self.json_response(200, {"case": case_item, "report": report})

        return super().do_GET()

    def do_POST(self) -> None:
        path = self.cleaned_path()

        try:
            data = self.parse_json_body()
        except json.JSONDecodeError:
            return self.json_response(400, {"error": "요청 본문이 올바른 JSON 형식이 아닙니다."})

        if path == "/api/report":
            required = ["teacherName", "grade", "classNumber", "studentName", "issueType", "teacherOpinion"]
            if not all(data.get(field) for field in required):
                return self.json_response(400, {"error": "필수 항목이 누락되었습니다."})

            report = {
                "id": f"R{int(datetime.now().timestamp() * 1000)}",
                "teacherName": data["teacherName"].strip(),
                "grade": str(data["grade"]).strip(),
                "classNumber": str(data["classNumber"]).strip(),
                "studentName": data["studentName"].strip(),
                "issueType": data["issueType"].strip(),
                "teacherOpinion": data["teacherOpinion"].strip(),
                "createdAt": now_iso(),
                "caseNumber": None,
            }

            with DB_LOCK:
                state = read_state()
                state["reports"].insert(0, report)
                write_state(state)

            return self.json_response(201, {"report": report, "state": normalize_state_for_client(state)})

        if path == "/api/report/delete":
            report_id = str(data.get("reportId", "")).strip()
            if not report_id:
                return self.json_response(400, {"error": "삭제할 제보 ID가 필요합니다."})

            with DB_LOCK:
                state = read_state()
                report_index = next((i for i, item in enumerate(state["reports"]) if item["id"] == report_id), None)
                if report_index is None:
                    return self.json_response(404, {"error": "삭제할 제보를 찾을 수 없습니다."})

                report = state["reports"][report_index]
                if report.get("caseNumber"):
                    state["cases"] = [item for item in state["cases"] if item["caseNumber"] != report["caseNumber"]]

                del state["reports"][report_index]
                write_state(state)

            return self.json_response(200, {"ok": True, "state": normalize_state_for_client(state)})

        if path == "/api/admin/login":
            with DB_LOCK:
                state = read_state()

            if data.get("password") != state["adminPassword"]:
                return self.json_response(401, {"error": "관리자 비밀번호가 올바르지 않습니다."})

            return self.json_response(200, {"ok": True, "state": normalize_state_for_client(state)})

        if path == "/api/admin/password":
            with DB_LOCK:
                state = read_state()

                if data.get("currentPassword") != state["adminPassword"]:
                    return self.json_response(400, {"error": "현재 비밀번호가 일치하지 않습니다."})

                if not data.get("newPassword"):
                    return self.json_response(400, {"error": "새 비밀번호를 입력해주세요."})

                state["adminPassword"] = data["newPassword"]
                write_state(state)

            return self.json_response(200, {"ok": True})

        if path == "/api/case/create":
            report_id = str(data.get("reportId", "")).strip()
            manual_case_number = str(data.get("manualCaseNumber", "")).strip().upper()

            with DB_LOCK:
                state = read_state()
                report = next((item for item in state["reports"] if item["id"] == report_id), None)

                if not report:
                    return self.json_response(404, {"error": "해당 제보를 찾을 수 없습니다."})

                if report["caseNumber"]:
                    return self.json_response(400, {"error": "이미 사례번호가 생성된 제보입니다."})

                if manual_case_number:
                    duplicate = next((item for item in state["cases"] if item["caseNumber"] == manual_case_number), None)
                    if duplicate:
                        return self.json_response(400, {"error": "이미 사용 중인 사례번호입니다."})
                    case_number = manual_case_number
                else:
                    case_code = str(state.get("caseCode", "SI")).strip().upper() or "SI"
                    case_number = generate_case_number(state["cases"], case_code)

                case_item = {
                    "caseNumber": case_number,
                    "reportId": report_id,
                    "status": "지원 계획 수립",
                    "createdAt": now_iso(),
                    "updatedAt": now_iso(),
                    "departmentPlans": [],
                }

                state["cases"].insert(0, case_item)
                report["caseNumber"] = case_number
                write_state(state)

            return self.json_response(201, {"case": case_item, "state": normalize_state_for_client(state)})

        if path == "/api/case/config":
            case_code = str(data.get("caseCode", "")).strip().upper()
            if not case_code:
                return self.json_response(400, {"error": "사례번호 코드를 입력해주세요."})

            if not re.fullmatch(r"[A-Z0-9]{1,6}", case_code):
                return self.json_response(400, {"error": "코드는 영문 대문자/숫자 1~6자리만 가능합니다."})

            with DB_LOCK:
                state = read_state()
                state["caseCode"] = case_code
                write_state(state)

            return self.json_response(200, {"ok": True, "state": normalize_state_for_client(state)})

        if path == "/api/case/status":
            case_number = str(data.get("caseNumber", "")).strip().upper()
            status = str(data.get("status", "")).strip()

            if not case_number or not status:
                return self.json_response(400, {"error": "사례번호와 상태를 모두 입력해주세요."})

            with DB_LOCK:
                state = read_state()
                case_item = next((item for item in state["cases"] if item["caseNumber"] == case_number), None)

                if not case_item:
                    return self.json_response(404, {"error": "해당 사례를 찾을 수 없습니다."})

                case_item["status"] = status
                case_item["updatedAt"] = now_iso()
                write_state(state)

            return self.json_response(200, {"ok": True, "state": normalize_state_for_client(state)})

        if path == "/api/case/delete":
            case_number = str(data.get("caseNumber", "")).strip().upper()
            if not case_number:
                return self.json_response(400, {"error": "삭제할 사례번호를 입력해주세요."})

            with DB_LOCK:
                state = read_state()
                case_index = next(
                    (index for index, item in enumerate(state["cases"]) if item["caseNumber"] == case_number),
                    None,
                )

                if case_index is None:
                    return self.json_response(404, {"error": "삭제할 사례를 찾을 수 없습니다."})

                target_case = state["cases"][case_index]
                linked_report = next(
                    (item for item in state["reports"] if item["id"] == target_case["reportId"]),
                    None,
                )

                if linked_report:
                    linked_report["caseNumber"] = None

                del state["cases"][case_index]
                write_state(state)

            return self.json_response(200, {"ok": True, "state": normalize_state_for_client(state)})

        if path == "/api/case/note":
            case_number = str(data.get("caseNumber", "")).strip().upper()
            department = str(data.get("department", "")).strip()
            plan = str(data.get("plan", "")).strip()

            if not case_number or not department or not plan:
                return self.json_response(400, {"error": "사례번호, 부서, 지원방향을 모두 입력해주세요."})

            with DB_LOCK:
                state = read_state()
                case_item = next((item for item in state["cases"] if item["caseNumber"] == case_number), None)
                if not case_item:
                    return self.json_response(404, {"error": "해당 사례를 찾을 수 없습니다."})

                case_item["departmentPlans"].insert(
                    0,
                    {
                        "department": department,
                        "plan": plan,
                        "createdAt": now_iso(),
                    },
                )
                case_item["updatedAt"] = now_iso()

                report = next((item for item in state["reports"] if item["id"] == case_item["reportId"]), None)
                write_state(state)

            return self.json_response(200, {"case": case_item, "report": report})

        return self.json_response(404, {"error": f"지원하지 않는 API 경로입니다: {path}"})


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="학생맞춤통합지원 웹앱 서버")
    parser.add_argument("--port", type=int, default=8000, help="서버 포트 (기본값: 8000)")
    return parser.parse_args()


def run_server(port: int) -> None:
    local_ip = get_local_ip()
    server = http.server.ThreadingHTTPServer(("0.0.0.0", port), StudentSupportHandler)

    print("=" * 64)
    print("학생맞춤통합지원 웹앱 서버가 실행되었습니다.")
    print(f"- 이 PC 접속 주소: http://localhost:{port}")
    print(f"- 인트라넷 접속 주소: http://{local_ip}:{port}")
    print("- 종료하려면 Ctrl + C 를 누르세요.")
    print("=" * 64)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n서버를 종료합니다.")


def ensure_db_file() -> None:
    if not DB_FILE.exists():
        write_state(default_state())


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    ensure_db_file()
    args = parse_args()
    run_server(args.port)
