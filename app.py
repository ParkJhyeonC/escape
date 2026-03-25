from __future__ import annotations

import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

from flask import Flask, flash, g, redirect, render_template, request, url_for

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "support.db"

app = Flask(__name__)
app.config["SECRET_KEY"] = "school-support-local-secret"

STATUS_OPTIONS = [
    "신규 접수",
    "검토 중",
    "지원 계획 수립",
    "지원 진행 중",
    "외부기관 연계 중",
    "집중관리",
    "일반관리 전환",
    "종결",
]

ROLE_OPTIONS = [
    "담임",
    "전문상담교사",
    "보건교사",
    "생활안전부",
    "교무/학업 담당",
    "복지 담당",
    "진로 담당",
]

RISK_OPTIONS = [
    "학업",
    "출결",
    "정서·행동",
    "또래관계",
    "학교폭력",
    "자해·자살위험",
    "가정·경제",
    "건강",
    "복합위기",
]

DEPARTMENT_OPTIONS = [
    "교무부",
    "생활안전부",
    "창의인성부",
    "진로진학부",
    "보건",
    "전문상담",
    "복지",
]


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(_: Any) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    db = sqlite3.connect(DB_PATH)
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS discoveries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_name TEXT NOT NULL,
            grade INTEGER NOT NULL,
            class_no INTEGER NOT NULL,
            homeroom_teacher TEXT NOT NULL,
            risk_type TEXT NOT NULL,
            urgency TEXT NOT NULL,
            note TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS cases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_number TEXT UNIQUE NOT NULL,
            student_name TEXT NOT NULL,
            grade INTEGER NOT NULL,
            class_no INTEGER NOT NULL,
            homeroom_teacher TEXT,
            risk_type TEXT NOT NULL,
            urgency TEXT NOT NULL,
            status TEXT NOT NULL,
            owner_department TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id INTEGER NOT NULL,
            role_name TEXT NOT NULL,
            assignee TEXT,
            due_date TEXT,
            task_status TEXT NOT NULL,
            FOREIGN KEY(case_id) REFERENCES cases(id)
        );

        CREATE TABLE IF NOT EXISTS records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id INTEGER NOT NULL,
            record_type TEXT NOT NULL,
            author TEXT NOT NULL,
            body TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(case_id) REFERENCES cases(id)
        );

        CREATE TABLE IF NOT EXISTS support_directions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id INTEGER NOT NULL,
            department TEXT NOT NULL,
            author TEXT NOT NULL,
            direction_text TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(case_id) REFERENCES cases(id)
        );
        """
    )
    db.commit()
    db.close()


def generate_case_number() -> str:
    db = get_db()
    year = datetime.now().year
    prefix = f"{year}-JD-"
    row = db.execute(
        "SELECT case_number FROM cases WHERE case_number LIKE ? ORDER BY id DESC LIMIT 1",
        (f"{prefix}%",),
    ).fetchone()
    if not row:
        return f"{prefix}001"
    current = int(row["case_number"].split("-")[-1])
    return f"{prefix}{current + 1:03d}"


@app.route("/")
def home() -> str:
    return render_template("home.html")


@app.route("/admin")
def dashboard() -> str:
    db = get_db()
    cases = db.execute(
        "SELECT * FROM cases ORDER BY datetime(created_at) DESC LIMIT 20"
    ).fetchall()
    stats = {
        status: db.execute(
            "SELECT COUNT(*) AS cnt FROM cases WHERE status = ?", (status,)
        ).fetchone()["cnt"]
        for status in STATUS_OPTIONS
    }
    discoveries = db.execute(
        "SELECT * FROM discoveries ORDER BY datetime(created_at) DESC LIMIT 10"
    ).fetchall()
    return render_template("dashboard.html", cases=cases, stats=stats, discoveries=discoveries)


@app.route("/homeroom", methods=["GET", "POST"])
def homeroom_page() -> str:
    db = get_db()
    if request.method == "POST":
        db.execute(
            """
            INSERT INTO discoveries
            (student_name, grade, class_no, homeroom_teacher, risk_type, urgency, note, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                request.form["student_name"],
                int(request.form["grade"]),
                int(request.form["class_no"]),
                request.form["homeroom_teacher"],
                request.form["risk_type"],
                request.form["urgency"],
                request.form.get("note", ""),
                datetime.now().isoformat(timespec="seconds"),
            ),
        )
        db.commit()
        flash("담임교사 발견 보고가 접수되었습니다.")
        return redirect(url_for("homeroom_page"))

    return render_template("homeroom.html", risk_options=RISK_OPTIONS)


@app.route("/cases/new", methods=["GET", "POST"])
def new_case() -> str:
    if request.method == "POST":
        db = get_db()
        case_number = generate_case_number()
        db.execute(
            """
            INSERT INTO cases
            (case_number, student_name, grade, class_no, homeroom_teacher, risk_type, urgency, status, owner_department, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                case_number,
                request.form["student_name"],
                int(request.form["grade"]),
                int(request.form["class_no"]),
                request.form.get("homeroom_teacher", ""),
                request.form["risk_type"],
                request.form["urgency"],
                "신규 접수",
                request.form.get("owner_department", ""),
                datetime.now().isoformat(timespec="seconds"),
            ),
        )
        db.commit()
        flash(f"사례가 생성되었습니다. 사례번호: {case_number}")
        return redirect(url_for("dashboard"))

    return render_template(
        "new_case.html",
        risk_options=RISK_OPTIONS,
        urgency_options=["일반", "주의", "긴급"],
        department_options=DEPARTMENT_OPTIONS,
    )


@app.route("/cases/<case_number>", methods=["GET", "POST"])
def case_detail(case_number: str) -> str:
    db = get_db()
    case = db.execute("SELECT * FROM cases WHERE case_number = ?", (case_number,)).fetchone()
    if not case:
        flash("해당 사례를 찾을 수 없습니다.")
        return redirect(url_for("join_case"))

    if request.method == "POST":
        action = request.form.get("action")
        if action == "update_status":
            db.execute(
                "UPDATE cases SET status = ? WHERE id = ?",
                (request.form["status"], case["id"]),
            )
            db.commit()
            flash("상태가 변경되었습니다.")
        elif action == "add_record":
            db.execute(
                """
                INSERT INTO records (case_id, record_type, author, body, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    case["id"],
                    request.form["record_type"],
                    request.form["author"],
                    request.form["body"],
                    datetime.now().isoformat(timespec="seconds"),
                ),
            )
            db.commit()
            flash("기록이 저장되었습니다.")
        elif action == "add_direction":
            db.execute(
                """
                INSERT INTO support_directions (case_id, department, author, direction_text, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    case["id"],
                    request.form["department"],
                    request.form["author"],
                    request.form["direction_text"],
                    datetime.now().isoformat(timespec="seconds"),
                ),
            )
            db.commit()
            flash("부서 지원방향이 등록되었습니다.")
        return redirect(url_for("case_detail", case_number=case_number))

    records = db.execute(
        "SELECT * FROM records WHERE case_id = ? ORDER BY datetime(created_at) DESC", (case["id"],)
    ).fetchall()
    directions = db.execute(
        "SELECT * FROM support_directions WHERE case_id = ? ORDER BY datetime(created_at) DESC",
        (case["id"],),
    ).fetchall()
    return render_template(
        "case_detail.html",
        case=case,
        records=records,
        directions=directions,
        status_options=STATUS_OPTIONS,
        role_options=ROLE_OPTIONS,
        department_options=DEPARTMENT_OPTIONS,
    )


@app.route("/join", methods=["GET", "POST"])
def join_case() -> str:
    if request.method == "POST":
        case_number = request.form["case_number"].strip().upper()
        return redirect(url_for("case_detail", case_number=case_number))
    return render_template("join_case.html", department_options=DEPARTMENT_OPTIONS)


if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000, debug=True)
