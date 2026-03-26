#!/usr/bin/env python3
"""학생맞춤통합지원 웹앱 서버."""

from __future__ import annotations

import argparse
import http.server
import json
import os
import re
import secrets
import socket
from datetime import datetime
from pathlib import Path
from threading import Lock
from urllib.parse import unquote

DB_FILE = Path("data.json")
DB_LOCK = Lock()
SESSIONS: dict[str, dict] = {}


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def default_state() -> dict:
    return {
        "adminPassword": "1234",
        "caseCode": "SI",
        "reports": [],
        "cases": [],
        "users": [],
    }


def read_state() -> dict:
    if not DB_FILE.exists():
        return default_state()

    with DB_FILE.open("r", encoding="utf-8") as file:
        state = json.load(file)

    state.setdefault("caseCode", "SI")
    state.setdefault("reports", [])
    state.setdefault("cases", [])
    state.setdefault("users", [])

    for case_item in state["cases"]:
        case_item.setdefault("departmentPlans", [])
        case_item.setdefault("updatedAt", case_item.get("createdAt", now_iso()))
        for plan in case_item["departmentPlans"]:
            plan.setdefault("id", f"N{int(datetime.now().timestamp() * 1000)}")
            plan.setdefault("authorName", "알수없음")
            plan.setdefault("updatedAt", plan.get("createdAt", now_iso()))

    for user in state["users"]:
        user.setdefault("password", "1234")
        user.setdefault("securityAnswer", "")
        user.setdefault("mustChangePassword", True)
        user.setdefault("createdAt", now_iso())
        user.setdefault("role", "")
        user.setdefault("homeroomGrade", "")
        user.setdefault("homeroomClass", "")
        user.setdefault("department", "")
        user.setdefault("customRole", "")

    return state


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


def normalize_state_for_client(state: dict, include_users: bool = False) -> dict:
    payload = {
        "caseCode": state.get("caseCode", "SI"),
        "reports": state["reports"],
        "cases": state["cases"],
    }
    if include_users:
        payload["users"] = [
            {
                "name": user["name"],
                "mustChangePassword": bool(user.get("mustChangePassword", False)),
                "createdAt": user.get("createdAt", ""),
                "role": user.get("role", ""),
                "homeroomGrade": user.get("homeroomGrade", ""),
                "homeroomClass": user.get("homeroomClass", ""),
                "department": user.get("department", ""),
                "customRole": user.get("customRole", ""),
            }
            for user in state["users"]
        ]
    return payload


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

    def session_user(self) -> dict | None:
        token = self.headers.get("X-Session-Token", "").strip()
        if not token:
            return None
        return SESSIONS.get(token)

    def require_user(self) -> dict | None:
        session = self.session_user()
        if not session or session.get("isAdmin"):
            self.json_response(401, {"error": "로그인이 필요합니다."})
            return None
        return session

    def require_admin(self) -> dict | None:
        session = self.session_user()
        if not session or not session.get("isAdmin"):
            self.json_response(401, {"error": "관리자 인증이 필요합니다."})
            return None
        return session

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

        if path == "/api/user/login":
            name = str(data.get("name", "")).strip()
            password = str(data.get("password", "")).strip()
            if not name or not password:
                return self.json_response(400, {"error": "성함과 비밀번호를 입력해주세요."})

            with DB_LOCK:
                state = read_state()
                user = next((item for item in state["users"] if item["name"] == name), None)

            if not user or user.get("password") != password:
                return self.json_response(401, {"error": "로그인 정보가 올바르지 않습니다."})

            token = secrets.token_hex(24)
            SESSIONS[token] = {"name": user["name"], "isAdmin": False}
            return self.json_response(
                200,
                {
                    "ok": True,
                    "token": token,
                    "user": {
                        "name": user["name"],
                        "mustChangePassword": bool(user.get("mustChangePassword", False)),
                        "role": user.get("role", ""),
                        "homeroomGrade": user.get("homeroomGrade", ""),
                        "homeroomClass": user.get("homeroomClass", ""),
                        "department": user.get("department", ""),
                "customRole": user.get("customRole", ""),
                    },
                    "state": normalize_state_for_client(state),
                },
            )

        if path == "/api/user/password":
            session = self.require_user()
            if not session:
                return

            current_password = str(data.get("currentPassword", "")).strip()
            new_password = str(data.get("newPassword", "")).strip()
            if not new_password:
                return self.json_response(400, {"error": "새 비밀번호를 입력해주세요."})

            with DB_LOCK:
                state = read_state()
                user = next((item for item in state["users"] if item["name"] == session["name"]), None)
                if not user:
                    return self.json_response(404, {"error": "사용자 정보를 찾을 수 없습니다."})

                if user.get("password") != current_password:
                    return self.json_response(400, {"error": "현재 비밀번호가 일치하지 않습니다."})

                security_answer = str(data.get("securityAnswer", "")).strip()
                if user.get("mustChangePassword") and not security_answer:
                    return self.json_response(400, {"error": "최초 변경 시 비밀번호 찾기 확인 답안을 입력해주세요."})

                user["password"] = new_password
                if security_answer:
                    user["securityAnswer"] = security_answer
                user["mustChangePassword"] = False
                write_state(state)

            return self.json_response(200, {"ok": True})

        if path == "/api/user/reset-password":
            name = str(data.get("name", "")).strip()
            security_answer = str(data.get("securityAnswer", "")).strip()
            new_password = str(data.get("newPassword", "")).strip()
            if not name or not security_answer or not new_password:
                return self.json_response(400, {"error": "성함, 확인 답안, 새 비밀번호를 모두 입력해주세요."})

            with DB_LOCK:
                state = read_state()
                user = next((item for item in state["users"] if item["name"] == name), None)
                if not user:
                    return self.json_response(404, {"error": "등록된 선생님 성함을 찾지 못했습니다."})

                if not user.get("securityAnswer", ""):
                    return self.json_response(400, {"error": "아직 확인 답안이 설정되지 않았습니다. 최초 로그인 후 비밀번호를 변경해주세요."})

                if user.get("securityAnswer", "") != security_answer:
                    return self.json_response(400, {"error": "확인 답안이 일치하지 않습니다."})

                user["password"] = new_password
                user["mustChangePassword"] = False
                write_state(state)

            return self.json_response(200, {"ok": True})

        if path == "/api/user/profile":
            session = self.require_user()
            if not session:
                return

            role = str(data.get("role", "")).strip()
            homeroom_grade = str(data.get("homeroomGrade", "")).strip()
            homeroom_class = str(data.get("homeroomClass", "")).strip()
            department = str(data.get("department", "")).strip()
            custom_role = str(data.get("customRole", "")).strip()

            if role not in {"담임교사", "부장교사", "직접입력"}:
                return self.json_response(400, {"error": "직책은 담임교사, 부장교사, 직접입력 중에서 선택해주세요."})

            if role == "담임교사" and (not homeroom_grade or not homeroom_class):
                return self.json_response(400, {"error": "담임교사는 학년과 반을 입력해주세요."})

            if role == "부장교사" and not department:
                return self.json_response(400, {"error": "부장교사는 부서를 입력해주세요."})

            if role == "직접입력" and not custom_role:
                return self.json_response(400, {"error": "직접입력 직책명을 입력해주세요."})

            with DB_LOCK:
                state = read_state()
                user = next((item for item in state["users"] if item["name"] == session["name"]), None)
                if not user:
                    return self.json_response(404, {"error": "사용자 정보를 찾을 수 없습니다."})

                user["role"] = role
                user["homeroomGrade"] = homeroom_grade if role == "담임교사" else ""
                user["homeroomClass"] = homeroom_class if role == "담임교사" else ""
                user["department"] = department if role == "부장교사" else ""
                user["customRole"] = custom_role if role == "직접입력" else ""
                write_state(state)

            return self.json_response(200, {"ok": True})

        if path == "/api/report":
            session = self.require_user()
            if not session:
                return

            required = ["grade", "classNumber", "studentName", "issueType", "teacherOpinion"]
            if not all(data.get(field) for field in required):
                return self.json_response(400, {"error": "필수 항목이 누락되었습니다."})

            report = {
                "id": f"R{int(datetime.now().timestamp() * 1000)}",
                "teacherName": session["name"],
                "grade": str(data["grade"]).strip(),
                "classNumber": str(data["classNumber"]).strip(),
                "studentName": str(data["studentName"]).strip(),
                "issueType": str(data["issueType"]).strip(),
                "teacherOpinion": str(data["teacherOpinion"]).strip(),
                "createdAt": now_iso(),
                "caseNumber": None,
            }

            with DB_LOCK:
                state = read_state()
                state["reports"].insert(0, report)
                write_state(state)

            return self.json_response(201, {"report": report, "state": normalize_state_for_client(state)})

        if path == "/api/report/delete":
            if not self.require_admin():
                return

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

            token = secrets.token_hex(24)
            SESSIONS[token] = {"name": "관리자", "isAdmin": True}
            return self.json_response(200, {"ok": True, "token": token, "state": normalize_state_for_client(state, include_users=True)})

        if path == "/api/admin/password":
            if not self.require_admin():
                return

            with DB_LOCK:
                state = read_state()

                if data.get("currentPassword") != state["adminPassword"]:
                    return self.json_response(400, {"error": "현재 비밀번호가 일치하지 않습니다."})

                if not data.get("newPassword"):
                    return self.json_response(400, {"error": "새 비밀번호를 입력해주세요."})

                state["adminPassword"] = data["newPassword"]
                write_state(state)

            return self.json_response(200, {"ok": True})

        if path == "/api/admin/user/create":
            if not self.require_admin():
                return

            initial_password = str(data.get("initialPassword", "1234")).strip() or "1234"
            names_text = str(data.get("namesText", "")).strip()
            single_name = str(data.get("name", "")).strip()
            raw_names = [line.strip() for line in names_text.replace(",", "\n").splitlines() if line.strip()]
            if single_name:
                raw_names.append(single_name)

            unique_names = []
            seen = set()
            for name in raw_names:
                if name not in seen:
                    unique_names.append(name)
                    seen.add(name)

            if not unique_names:
                return self.json_response(400, {"error": "등록할 선생님 성함을 한 줄에 한 명씩 입력해주세요."})

            created_names = []
            skipped_names = []

            with DB_LOCK:
                state = read_state()
                existing_names = {item["name"] for item in state["users"]}

                for name in unique_names:
                    if name in existing_names:
                        skipped_names.append(name)
                        continue

                    state["users"].append(
                        {
                            "name": name,
                            "password": initial_password,
                            "securityAnswer": "",
                            "mustChangePassword": True,
                            "createdAt": now_iso(),
                            "role": "",
                            "homeroomGrade": "",
                            "homeroomClass": "",
                            "department": "",
                            "customRole": "",
                        }
                    )
                    existing_names.add(name)
                    created_names.append(name)

                write_state(state)

            return self.json_response(
                201,
                {
                    "ok": True,
                    "createdNames": created_names,
                    "skippedNames": skipped_names,
                    "state": normalize_state_for_client(state, include_users=True),
                },
            )

        if path == "/api/case/create":
            if not self.require_admin():
                return

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

            return self.json_response(201, {"case": case_item, "state": normalize_state_for_client(state, include_users=True)})

        if path == "/api/case/config":
            if not self.require_admin():
                return

            case_code = str(data.get("caseCode", "")).strip().upper()
            if not case_code:
                return self.json_response(400, {"error": "사례번호 코드를 입력해주세요."})

            if not re.fullmatch(r"[A-Z0-9]{1,6}", case_code):
                return self.json_response(400, {"error": "코드는 영문 대문자/숫자 1~6자리만 가능합니다."})

            with DB_LOCK:
                state = read_state()
                state["caseCode"] = case_code
                write_state(state)

            return self.json_response(200, {"ok": True, "state": normalize_state_for_client(state, include_users=True)})

        if path == "/api/case/status":
            if not self.require_admin():
                return

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

            return self.json_response(200, {"ok": True, "state": normalize_state_for_client(state, include_users=True)})

        if path == "/api/case/delete":
            if not self.require_admin():
                return

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

            return self.json_response(200, {"ok": True, "state": normalize_state_for_client(state, include_users=True)})

        if path == "/api/case/note":
            session = self.require_user()
            if not session:
                return

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
                        "id": f"N{int(datetime.now().timestamp() * 1000)}",
                        "department": department,
                        "plan": plan,
                        "authorName": session["name"],
                        "createdAt": now_iso(),
                        "updatedAt": now_iso(),
                    },
                )
                case_item["updatedAt"] = now_iso()

                report = next((item for item in state["reports"] if item["id"] == case_item["reportId"]), None)
                write_state(state)

            return self.json_response(200, {"case": case_item, "report": report})

        if path == "/api/case/note/update":
            session = self.require_user()
            if not session:
                return

            case_number = str(data.get("caseNumber", "")).strip().upper()
            note_id = str(data.get("noteId", "")).strip()
            plan_text = str(data.get("plan", "")).strip()
            if not case_number or not note_id or not plan_text:
                return self.json_response(400, {"error": "사례번호, 항목, 지원방향을 모두 입력해주세요."})

            with DB_LOCK:
                state = read_state()
                case_item = next((item for item in state["cases"] if item["caseNumber"] == case_number), None)
                if not case_item:
                    return self.json_response(404, {"error": "해당 사례를 찾을 수 없습니다."})

                note = next((item for item in case_item["departmentPlans"] if item.get("id") == note_id), None)
                if not note:
                    return self.json_response(404, {"error": "수정할 지원방향을 찾지 못했습니다."})

                if note.get("authorName") != session["name"]:
                    return self.json_response(403, {"error": "작성자 본인만 수정할 수 있습니다."})

                note["plan"] = plan_text
                note["updatedAt"] = now_iso()
                case_item["updatedAt"] = now_iso()

                report = next((item for item in state["reports"] if item["id"] == case_item["reportId"]), None)
                write_state(state)

            return self.json_response(200, {"case": case_item, "report": report})

        if path == "/api/case/note/delete":
            session = self.require_user()
            if not session:
                return

            case_number = str(data.get("caseNumber", "")).strip().upper()
            note_id = str(data.get("noteId", "")).strip()
            if not case_number or not note_id:
                return self.json_response(400, {"error": "사례번호와 삭제할 항목이 필요합니다."})

            with DB_LOCK:
                state = read_state()
                case_item = next((item for item in state["cases"] if item["caseNumber"] == case_number), None)
                if not case_item:
                    return self.json_response(404, {"error": "해당 사례를 찾을 수 없습니다."})

                note = next((item for item in case_item["departmentPlans"] if item.get("id") == note_id), None)
                if not note:
                    return self.json_response(404, {"error": "삭제할 지원방향을 찾지 못했습니다."})

                if note.get("authorName") != session["name"]:
                    return self.json_response(403, {"error": "작성자 본인만 삭제할 수 있습니다."})

                case_item["departmentPlans"] = [item for item in case_item["departmentPlans"] if item.get("id") != note_id]
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
