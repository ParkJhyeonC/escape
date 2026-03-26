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

let isAdminAuthenticated = false;
let cachedState = { reports: [], cases: [] };

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

function formatDate(isoText) {
  return new Date(isoText).toLocaleString("ko-KR", { hour12: false });
}

function reportRowTemplate(report) {
  const header = `${report.grade}학년 ${report.classNumber}반 ${report.studentName} / 담임 ${report.teacherName}`;
  return `
    <li class="record-item">
      <p><strong>${header}</strong></p>
      <p>유형: ${report.issueType}</p>
      <p>담임의견: ${report.teacherOpinion}</p>
      <p class="meta">접수: ${formatDate(report.createdAt)}</p>
      ${
        report.caseNumber
          ? `<p class="badge">사례번호 생성 완료: ${report.caseNumber}</p>`
          : `<button class="primary create-case-button" data-report-id="${report.id}">사례번호 생성</button>`
      }
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
      <div class="field-grid two compact">
        <button class="ghost status-btn" data-case-number="${caseItem.caseNumber}" data-status="지원 진행 중">지원 진행 중</button>
        <button class="ghost status-btn" data-case-number="${caseItem.caseNumber}" data-status="점검 단계">점검 단계</button>
      </div>
      <button class="ghost status-btn" data-case-number="${caseItem.caseNumber}" data-status="종결">종결</button>
      <p class="meta">최근 수정: ${formatDate(caseItem.updatedAt)}</p>
    </li>
  `;
}

function renderAdminDashboard() {
  reportQueue.innerHTML = cachedState.reports.length
    ? cachedState.reports.map((report) => reportRowTemplate(report)).join("")
    : '<li class="record-item">아직 접수된 제보가 없습니다.</li>';

  caseDashboard.innerHTML = cachedState.cases.length
    ? cachedState.cases
        .map((caseItem) => {
          const linkedReport = cachedState.reports.find((report) => report.id === caseItem.reportId);
          return caseRowTemplate(caseItem, linkedReport);
        })
        .join("")
    : '<li class="record-item">아직 생성된 사례가 없습니다.</li>';

  reportQueue.querySelectorAll(".create-case-button").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const result = await api("/api/case/create", {
          method: "POST",
          body: JSON.stringify({ reportId: button.dataset.reportId }),
        });
        cachedState = result.state;
        renderAdminDashboard();
        showToast(`사례번호 ${result.case.caseNumber}가 생성되었습니다.`);
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

document.getElementById("admin-logout").addEventListener("click", () => {
  isAdminAuthenticated = false;
  showHome();
  showToast("관리자 모드에서 로그아웃했습니다.");
});

refreshState().catch(() => {
  showToast("서버 연결에 실패했습니다. start_webapp.bat로 서버를 실행해주세요.", true);
});
