# 학생맞춤통합지원 협업 웹앱 (Windows 배치파일 실행 지원)

`student_integrated_support_webapp_spec.md`를 기반으로 만든 로컬 인트라넷용 협업 웹앱입니다.

## 역할별 홈 진입 구조
- **담임교사 페이지**: 학생 발견/제보 등록
- **관리자 페이지**: 전체 사례 현황, 통계, 사례 생성
- **사례번호 접속 페이지**: 부서별 지원방향/조치 기록 입력

## 주요 기능
- 사례 생성(사례번호 자동 생성: `YYYY-JD-001`)
- 담임교사 발견 보고 접수
- 사례번호 기반 조회/접속
- 상태 관리(신규 접수~종결)
- 역할 분담 등록(담임/상담/보건/생활안전/학업/복지/진로)
- 부서별 지원방향 작성/조회
- 기록 입력(상담/관찰/회의/사후점검 등)
- 대시보드 통계(상태별 건수)

## Windows 실행 방법
1. `run_webapp.bat` 더블클릭
2. 브라우저에서 `http://localhost:5000` 접속

> 최초 실행 시 가상환경 생성 및 패키지 설치 시간이 필요할 수 있습니다.

## 개발 실행(직접)
```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

## 저장소 구성
- `app.py`: Flask 앱 본체 + SQLite 스키마 초기화
- `templates/`: 화면 템플릿
- `static/style.css`: 화면 스타일
- `run_webapp.bat`: Windows 원클릭 실행 스크립트
