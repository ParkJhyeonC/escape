const home = document.getElementById("home");
const panels = document.querySelectorAll(".panel");
const toast = document.getElementById("toast");
const reportQueue = document.getElementById("report-queue");
const caseDashboard = document.getElementById("case-dashboard");
const caseWorkspace = document.getElementById("case-workspace");
const caseTitle = document.getElementById("case-title");
const caseSummary = document.getElementById("case-summary");
const departmentPlanList = document.getElementById("department-plan-list");
const departmentPlanForm = document.getElementById("department-plan-form");
const caseCodeForm = document.getElementById("case-code-form");
const adminTabs = document.querySelectorAll(".admin-tab");
const adminViews = document.querySelectorAll(".admin-view");

let isAdminAuthenticated = false;
let cachedState = { caseCode: "SI", reports: [], cases: [] };

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "요청 처리 중 오류가 발생했습니다.");
  }

  return payload;
}

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.classList.toggle("error", isError);
}

function showHome() {
  panels.forEach((panel) => panel.classList.add("hidden"));
  caseWorkspace.classList.add("hidden");
  home.classList.remove("hidden");
}

function showPanel(panelId) {
  panels.forEach((panel) => panel.classList.add("hidden"));
  home.classList.add("hidden");
  document.getElementById(panelId).classList.remove("hidden");
}

function switchAdminView(viewName) {
  adminTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.adminView === viewName);
  });
  adminViews.forEach((view) => {
    view.classList.toggle("hidden", view.id !== `admin-view-${viewName}`);
  });
}

function formatDate(isoText) {
  return new Date(isoText).toLocaleString("ko-KR", { hour12: false });
}

function reportRowTemplate(report) {
  const header = `${report.grade}학년 ${report.classNumber}반 ${report.studentName} / 담임 ${report.teacherName}`;
  const suggestedCaseNumber = `${new Date().getFullYear()}-${cachedState.caseCode || "SI"}-`;
  return `
    <li class="record-item">
      <p><strong>${header}</strong></p>
      <p>유형: ${report.issueType}</p>
      <p>담임의견: ${report.teacherOpinion}</p>
      <p class="meta">접수: ${formatDate(report.createdAt)}</p>
      ${
        report.caseNumber
          ? `<p class="badge">사례번호 생성 완료: ${report.caseNumber}</p>`
          : `
            <label>
              수동 사례번호 (선택)
              <input class="manual-case-number" data-report-id="${report.id}" placeholder="${suggestedCaseNumber}001 또는 임의번호" />
            </label>
            <button class="primary create-case-button" data-report-id="${report.id}">사례번호 생성</button>
          `
      }
      <button class="ghost delete-report-btn" data-report-id="${report.id}">신규 제보 삭제</button>
    </li>
  `;
}

function caseRowTemplate(caseItem, report) {
  const reportInfo = report
    ? `${report.grade}학년 ${report.classNumber}반 ${report.studentName} (${report.teacherName})`
    : "연결 제보 정보 없음";

  return `
    <li class="record-item">
      <p><strong>${caseItem.caseNumber}</strong></p>
      <p>${reportInfo}</p>
      <p>상태: <strong>${caseItem.status}</strong></p>
      <p>부서 의견 수: ${caseItem.departmentPlans.length}</p>
      ${
        caseItem.isVirtual
          ? '<p class="meta">사례 동기화 중입니다. 잠시 후 새로고침해주세요.</p>'
          : `
            <div class="field-grid two compact">
              <button class="ghost status-btn" data-case-number="${caseItem.caseNumber}" data-status="지원 진행 중">지원 진행 중</button>
              <button class="ghost status-btn" data-case-number="${caseItem.caseNumber}" data-status="점검 단계">점검 단계</button>
            </div>
            <button class="ghost status-btn" data-case-number="${caseItem.caseNumber}" data-status="종결">종결</button>
            <button class="ghost delete-btn" data-case-number="${caseItem.caseNumber}">사례 삭제</button>
            <button class="primary print-btn" data-case-number="${caseItem.caseNumber}">예쁜 사례 출력</button>
          `
      }
      <p class="meta">최근 수정: ${formatDate(caseItem.updatedAt)}</p>
    </li>
  `;
}

function openPrintPreview(caseNumber) {
  const caseItem = cachedState.cases.find((item) => item.caseNumber === caseNumber);
  const report = cachedState.reports.find((item) => item.id === caseItem?.reportId);

  if (!caseItem || !report) {
    showToast("출력할 사례 데이터를 찾지 못했습니다.", true);
    return;
  }

  const planItems = caseItem.departmentPlans.length
    ? caseItem.departmentPlans
        .map(
          (plan) => `
            <li>
              <h4>${plan.department}</h4>
              <p>${plan.plan}</p>
              <small>${formatDate(plan.createdAt)}</small>
            </li>
          `,
        )
        .join("")
    : "<li><p>등록된 부서 지원방향이 없습니다.</p></li>";

  const html = `
    <!doctype html>
    <html lang="ko">
      <head>
        <meta charset="UTF-8" />
        <title>${caseItem.caseNumber} 사례 요약</title>
        <style>
          body { font-family: 'Pretendard', 'Malgun Gothic', sans-serif; margin: 0; background: #f3f6ff; color: #1f2b45; }
          .sheet { max-width: 920px; margin: 30px auto; background: #fff; border-radius: 20px; overflow: hidden; box-shadow: 0 18px 50px rgba(13,24,61,.16); }
          .header { padding: 30px; background: linear-gradient(135deg, #2f5fff, #55b3ff); color: #fff; }
          .header h1 { margin: 0 0 8px; font-size: 28px; }
          .header p { margin: 0; opacity: .95; }
          .section { padding: 24px 30px; border-top: 1px solid #e7ecff; }
          .grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; }
          .card { background: #f8faff; border: 1px solid #dbe6ff; border-radius: 14px; padding: 12px; }
          h2 { margin: 0 0 12px; font-size: 20px; color: #2440a8; }
          h3 { margin: 0 0 8px; font-size: 15px; color: #3a4d85; }
          ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 10px; }
          li { border: 1px solid #dbe6ff; border-radius: 12px; padding: 12px; background: #fbfdff; }
          li h4 { margin: 0 0 6px; color: #2746b8; }
          li p { margin: 0 0 6px; line-height: 1.5; white-space: pre-wrap; }
          small { color: #6d7dab; }
          .stamp { margin-top: 14px; font-size: 13px; color: #576485; }
          @media print {
            body { background: #fff; }
            .sheet { box-shadow: none; margin: 0; max-width: none; border-radius: 0; }
          }
        </style>
      </head>
      <body>
        <article class="sheet">
          <header class="header">
            <h1>학생맞춤통합지원 사례 요약</h1>
            <p>사례번호: ${caseItem.caseNumber} · 상태: ${caseItem.status}</p>
          </header>

          <section class="section">
            <h2>기본 정보</h2>
            <div class="grid">
              <div class="card"><h3>학생</h3><p>${report.grade}학년 ${report.classNumber}반 ${report.studentName}</p></div>
              <div class="card"><h3>담임교사</h3><p>${report.teacherName}</p></div>
              <div class="card"><h3>발견 유형</h3><p>${report.issueType}</p></div>
              <div class="card"><h3>사례 생성일</h3><p>${formatDate(caseItem.createdAt)}</p></div>
            </div>
          </section>

          <section class="section">
            <h2>담임교사 의견</h2>
            <div class="card"><p>${report.teacherOpinion}</p></div>
          </section>

          <section class="section">
            <h2>부서별 지원 방향</h2>
            <ul>${planItems}</ul>
            <p class="stamp">출력 시각: ${formatDate(new Date().toISOString())}</p>
          </section>
        </article>
        <script>window.onload = () => window.print();</script>
      </body>
    </html>
  `;

  const printWindow = window.open("", "_blank", "width=1024,height=900");
  if (!printWindow) {
    showToast("팝업 차단으로 출력 창을 열 수 없습니다.", true);
    return;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

function renderAdminDashboard() {
  caseCodeForm.caseCode.value = cachedState.caseCode || "SI";

  const linkedCaseDashboardItems = cachedState.reports
    .filter((report) => report.caseNumber)
    .map((report) => {
      const realCase = cachedState.cases.find((item) => item.caseNumber === report.caseNumber);
      if (realCase) {
        return realCase;
      }

      return {
        caseNumber: report.caseNumber,
        reportId: report.id,
        status: "지원 계획 수립",
        departmentPlans: [],
        updatedAt: report.createdAt,
        isVirtual: true,
      };
    })
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

  reportQueue.innerHTML = cachedState.reports.length
    ? cachedState.reports.map((report) => reportRowTemplate(report)).join("")
    : '<li class="record-item">아직 접수된 제보가 없습니다.</li>';

  caseDashboard.innerHTML = linkedCaseDashboardItems.length
    ? linkedCaseDashboardItems
        .map((caseItem) => {
          const linkedReport = cachedState.reports.find((report) => report.id === caseItem.reportId);
          return caseRowTemplate(caseItem, linkedReport);
        })
        .join("")
    : '<li class="record-item">아직 생성된 사례가 없습니다.</li>';

  reportQueue.querySelectorAll(".create-case-button").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const input = reportQueue.querySelector(`.manual-case-number[data-report-id="${button.dataset.reportId}"]`);
        const manualCaseNumber = input ? input.value.trim() : "";
        const result = await api("/api/case/create", {
          method: "POST",
          body: JSON.stringify({ reportId: button.dataset.reportId, manualCaseNumber }),
        });
        cachedState = result.state;
        renderAdminDashboard();
        showToast(`사례번호 ${result.case.caseNumber}가 생성되었습니다.`);
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });

  reportQueue.querySelectorAll(".delete-report-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const reportId = button.dataset.reportId;
      const shouldDelete = window.confirm("이 신규 제보를 삭제할까요? 연결된 사례도 함께 삭제됩니다.");
      if (!shouldDelete) {
        return;
      }

      try {
        const result = await api("/api/report/delete", {
          method: "POST",
          body: JSON.stringify({ reportId }),
        });
        cachedState = result.state;
        renderAdminDashboard();
        showToast("신규 제보를 삭제했습니다.");
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });

  caseDashboard.querySelectorAll(".status-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const result = await api("/api/case/status", {
          method: "POST",
          body: JSON.stringify({
            caseNumber: button.dataset.caseNumber,
            status: button.dataset.status,
          }),
        });
        cachedState = result.state;
        renderAdminDashboard();
        showToast(`${button.dataset.caseNumber} 상태를 '${button.dataset.status}'로 변경했습니다.`);
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });

  caseDashboard.querySelectorAll(".print-btn").forEach((button) => {
    button.addEventListener("click", () => {
      openPrintPreview(button.dataset.caseNumber);
    });
  });

  caseDashboard.querySelectorAll(".delete-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const caseNumber = button.dataset.caseNumber;
      const shouldDelete = window.confirm(`${caseNumber} 사례를 삭제할까요?`);

      if (!shouldDelete) {
        return;
      }

      try {
        const result = await api("/api/case/delete", {
          method: "POST",
          body: JSON.stringify({ caseNumber }),
        });
        cachedState = result.state;
        renderAdminDashboard();
        showToast(`${caseNumber} 사례를 삭제했습니다.`);
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });
}

function renderCaseWorkspace(caseData, department) {
  caseWorkspace.classList.remove("hidden");
  caseTitle.textContent = `${caseData.case.caseNumber} 사례 협업 공간`;

  caseSummary.innerHTML = `
    <p><strong>학생:</strong> ${caseData.report.grade}학년 ${caseData.report.classNumber}반 ${caseData.report.studentName}</p>
    <p><strong>담임:</strong> ${caseData.report.teacherName}</p>
    <p><strong>발견유형:</strong> ${caseData.report.issueType}</p>
    <p><strong>담임 의견:</strong> ${caseData.report.teacherOpinion}</p>
    <p><strong>현재 상태:</strong> ${caseData.case.status}</p>
  `;

  departmentPlanForm.caseNumber.value = caseData.case.caseNumber;
  departmentPlanForm.department.value = department;

  departmentPlanList.innerHTML = caseData.case.departmentPlans.length
    ? caseData.case.departmentPlans
        .map(
          (plan) => `
          <li class="record-item">
            <p><strong>${plan.department}</strong></p>
            <p>${plan.plan}</p>
            <p class="meta">${formatDate(plan.createdAt)}</p>
          </li>
        `,
        )
        .join("")
    : '<li class="record-item">아직 공유된 지원방향이 없습니다.</li>';
}

async function refreshState() {
  const result = await api("/api/state");
  cachedState = result.state;
}

document.querySelectorAll(".action-button").forEach((button) => {
  button.addEventListener("click", () => {
    showPanel(button.dataset.target);
    showToast("");
    if (button.dataset.target === "case-access") {
      caseWorkspace.classList.add("hidden");
    }
  });
});

document.querySelectorAll("[data-back]").forEach((button) => {
  button.addEventListener("click", () => {
    showHome();
    showToast("");
  });
});

document.getElementById("report-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const data = Object.fromEntries(new FormData(event.target).entries());
    const result = await api("/api/report", {
      method: "POST",
      body: JSON.stringify(data),
    });
    cachedState = result.state;
    event.target.reset();
    showToast("담임 제보가 등록되었습니다. 관리자가 검토 후 사례번호를 생성합니다.");
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById("case-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const data = Object.fromEntries(new FormData(event.target).entries());
    const result = await api(`/api/case/${encodeURIComponent(data.caseNumber.trim())}`);
    renderCaseWorkspace(result, data.department.trim());
    showToast(`${data.caseNumber} 사례를 불러왔습니다.`);
  } catch (error) {
    caseWorkspace.classList.add("hidden");
    showToast(error.message, true);
  }
});

departmentPlanForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const data = Object.fromEntries(new FormData(event.target).entries());
    const result = await api("/api/case/note", {
      method: "POST",
      body: JSON.stringify(data),
    });
    renderCaseWorkspace(result, data.department);
    event.target.plan.value = "";
    showToast("부서 지원방향이 공유되었습니다.");
    await refreshState();
    if (isAdminAuthenticated) {
      renderAdminDashboard();
    }
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById("admin-login-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const payload = Object.fromEntries(new FormData(event.target).entries());
    const result = await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    isAdminAuthenticated = true;
    cachedState = result.state;
    event.target.reset();
    showPanel("admin");
    switchAdminView("reports");
    renderAdminDashboard();
    showToast("관리자 대시보드에 진입했습니다.");
  } catch (error) {
    isAdminAuthenticated = false;
    showToast(error.message, true);
  }
});

document.getElementById("password-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const payload = Object.fromEntries(new FormData(event.target).entries());

    if (payload.newPassword !== payload.confirmPassword) {
      throw new Error("새 비밀번호가 서로 다릅니다.");
    }

    await api("/api/admin/password", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    event.target.reset();
    showToast("관리자 비밀번호가 변경되었습니다.");
  } catch (error) {
    showToast(error.message, true);
  }
});

caseCodeForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const payload = Object.fromEntries(new FormData(event.target).entries());
    const result = await api("/api/case/config", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    cachedState = result.state;
    renderAdminDashboard();
    showToast(`사례번호 코드가 ${cachedState.caseCode}(으)로 변경되었습니다.`);
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById("admin-logout").addEventListener("click", () => {
  isAdminAuthenticated = false;
  showHome();
  showToast("관리자 모드에서 로그아웃했습니다.");
});

adminTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    switchAdminView(tab.dataset.adminView);
  });
});

refreshState().catch(() => {
  showToast("서버 연결에 실패했습니다. start_webapp.bat로 서버를 실행해주세요.", true);
});
