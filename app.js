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
const teacherList = document.getElementById("teacher-list");
const roleSelect = document.getElementById("role-select");
const homeroomFields = document.getElementById("homeroom-fields");
const departmentField = document.getElementById("department-field");

let userSession = null;
let adminSessionToken = "";
let cachedState = { caseCode: "SI", reports: [], cases: [], users: [] };
let activeCaseDepartment = "";

async function api(path, options = {}, token = "") {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const effectiveToken = token || userSession?.token || adminSessionToken;
  if (effectiveToken) {
    headers["X-Session-Token"] = effectiveToken;
  }

  const response = await fetch(path, { ...options, headers });
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

function showPanel(panelId) {
  panels.forEach((panel) => panel.classList.add("hidden"));
  const target = document.getElementById(panelId);
  if (target) {
    target.classList.remove("hidden");
  }
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

function isProfileComplete(profile) {
  if (!profile || !profile.role) {
    return false;
  }
  if (profile.role === "담임교사") {
    return Boolean(profile.homeroomGrade && profile.homeroomClass);
  }
  if (profile.role === "부장교사") {
    return Boolean(profile.department);
  }
  return false;
}

function toggleRoleFields(role) {
  const isHomeroom = role === "담임교사";
  const isHead = role === "부장교사";
  homeroomFields.classList.toggle("hidden", !isHomeroom);
  departmentField.classList.toggle("hidden", !isHead);
}

function setLoggedUserUI() {
  const label = document.getElementById("logged-user");
  const reportForm = document.getElementById("report-form");
  const caseForm = document.getElementById("case-form");
  if (!userSession) {
    label.textContent = "";
    reportForm.teacherName.value = "";
    return;
  }

  const profileText = userSession.role
    ? userSession.role === "담임교사"
      ? `담임 ${userSession.homeroomGrade}학년 ${userSession.homeroomClass}반`
      : `${userSession.department} / 부장교사`
    : "직책 미입력";

  label.textContent = `로그인 사용자: ${userSession.name} (${profileText})`;
  reportForm.teacherName.value = userSession.name;
  if (!caseForm.department.value.trim()) {
    caseForm.department.value = userSession.role === "부장교사" ? userSession.department : `${userSession.name} 담당부서`;
  }
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function reportRowTemplate(report) {
  const header = `${report.grade}학년 ${report.classNumber}반 ${report.studentName} / 담임 ${report.teacherName}`;
  const suggestedCaseNumber = `${new Date().getFullYear()}-${cachedState.caseCode || "SI"}-`;
  return `
    <li class="record-item">
      <p><strong>${escapeHtml(header)}</strong></p>
      <p>유형: ${escapeHtml(report.issueType)}</p>
      <p>담임의견: ${escapeHtml(report.teacherOpinion)}</p>
      <p class="meta">접수: ${formatDate(report.createdAt)}</p>
      ${
        report.caseNumber
          ? `<p class="badge">사례번호 생성 완료: ${escapeHtml(report.caseNumber)}</p>`
          : `
            <label>
              수동 사례번호 (선택)
              <input class="manual-case-number" data-report-id="${report.id}" placeholder="${escapeHtml(suggestedCaseNumber)}001" />
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
      <p><strong>${escapeHtml(caseItem.caseNumber)}</strong></p>
      <p>${escapeHtml(reportInfo)}</p>
      <p>상태: <strong>${escapeHtml(caseItem.status)}</strong></p>
      <p>부서 의견 수: ${caseItem.departmentPlans.length}</p>
      <div class="field-grid two compact">
        <button class="ghost status-btn" data-case-number="${caseItem.caseNumber}" data-status="지원 진행 중">지원 진행 중</button>
        <button class="ghost status-btn" data-case-number="${caseItem.caseNumber}" data-status="점검 단계">점검 단계</button>
      </div>
      <button class="ghost status-btn" data-case-number="${caseItem.caseNumber}" data-status="종결">종결</button>
      <button class="ghost delete-btn" data-case-number="${caseItem.caseNumber}">사례 삭제</button>
      <button class="primary print-btn" data-case-number="${caseItem.caseNumber}">예쁜 사례 출력</button>
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
              <h4>${escapeHtml(plan.department)} (${escapeHtml(plan.authorName || "")})</h4>
              <p>${escapeHtml(plan.plan)}</p>
              <small>${formatDate(plan.updatedAt || plan.createdAt)}</small>
            </li>
          `,
        )
        .join("")
    : "<li><p>등록된 부서 지원방향이 없습니다.</p></li>";

  const html = `<!doctype html><html lang="ko"><head><meta charset="UTF-8" /><title>${escapeHtml(
    caseItem.caseNumber,
  )} 사례 요약</title><style>body{font-family:'Pretendard','Malgun Gothic',sans-serif;margin:0;background:#f3f6ff;color:#1f2b45}.sheet{max-width:920px;margin:30px auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 18px 50px rgba(13,24,61,.16)}.header{padding:30px;background:linear-gradient(135deg,#2f5fff,#55b3ff);color:#fff}.header h1{margin:0 0 8px;font-size:28px}.header p{margin:0;opacity:.95}.section{padding:24px 30px;border-top:1px solid #e7ecff}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.card{background:#f8faff;border:1px solid #dbe6ff;border-radius:14px;padding:12px}h2{margin:0 0 12px;font-size:20px;color:#2440a8}h3{margin:0 0 8px;font-size:15px;color:#3a4d85}ul{margin:0;padding:0;list-style:none;display:grid;gap:10px}li{border:1px solid #dbe6ff;border-radius:12px;padding:12px;background:#fbfdff}li h4{margin:0 0 6px;color:#2746b8}li p{margin:0 0 6px;line-height:1.5;white-space:pre-wrap}small{color:#6d7dab}.stamp{margin-top:14px;font-size:13px;color:#576485}@media print{body{background:#fff}.sheet{box-shadow:none;margin:0;max-width:none;border-radius:0}}</style></head><body><article class="sheet"><header class="header"><h1>학생맞춤통합지원 사례 요약</h1><p>사례번호: ${escapeHtml(
    caseItem.caseNumber,
  )} · 상태: ${escapeHtml(caseItem.status)}</p></header><section class="section"><h2>기본 정보</h2><div class="grid"><div class="card"><h3>학생</h3><p>${escapeHtml(
    `${report.grade}학년 ${report.classNumber}반 ${report.studentName}`,
  )}</p></div><div class="card"><h3>담임교사</h3><p>${escapeHtml(report.teacherName)}</p></div><div class="card"><h3>발견 유형</h3><p>${escapeHtml(
    report.issueType,
  )}</p></div><div class="card"><h3>사례 생성일</h3><p>${formatDate(
    caseItem.createdAt,
  )}</p></div></div></section><section class="section"><h2>담임교사 의견</h2><div class="card"><p>${escapeHtml(
    report.teacherOpinion,
  )}</p></div></section><section class="section"><h2>부서별 지원 방향</h2><ul>${planItems}</ul><p class="stamp">출력 시각: ${formatDate(
    new Date().toISOString(),
  )}</p></section></article><script>window.onload=()=>window.print();</script></body></html>`;

  const printWindow = window.open("", "_blank", "width=1024,height=900");
  if (!printWindow) {
    showToast("팝업 차단으로 출력 창을 열 수 없습니다.", true);
    return;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

function renderTeacherList() {
  teacherList.innerHTML = (cachedState.users || []).length
    ? cachedState.users
        .map(
          (user) => `
      <li class="record-item">
        <p><strong>${escapeHtml(user.name)}</strong></p>
        <p class="meta">최초 로그인 비밀번호 변경 필요: ${user.mustChangePassword ? "예" : "아니오"}</p>
      </li>
    `,
        )
        .join("")
    : '<li class="record-item">등록된 선생님 계정이 없습니다.</li>';
}

function renderAdminDashboard() {
  caseCodeForm.caseCode.value = cachedState.caseCode || "SI";

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

  renderTeacherList();

  reportQueue.querySelectorAll(".create-case-button").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const input = reportQueue.querySelector(`.manual-case-number[data-report-id="${button.dataset.reportId}"]`);
        const manualCaseNumber = input ? input.value.trim() : "";
        const result = await api(
          "/api/case/create",
          { method: "POST", body: JSON.stringify({ reportId: button.dataset.reportId, manualCaseNumber }) },
          adminSessionToken,
        );
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
      if (!window.confirm("이 신규 제보를 삭제할까요? 연결된 사례도 함께 삭제됩니다.")) {
        return;
      }
      try {
        const result = await api(
          "/api/report/delete",
          { method: "POST", body: JSON.stringify({ reportId: button.dataset.reportId }) },
          adminSessionToken,
        );
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
        const result = await api(
          "/api/case/status",
          {
            method: "POST",
            body: JSON.stringify({ caseNumber: button.dataset.caseNumber, status: button.dataset.status }),
          },
          adminSessionToken,
        );
        cachedState = result.state;
        renderAdminDashboard();
        showToast(`${button.dataset.caseNumber} 상태를 '${button.dataset.status}'로 변경했습니다.`);
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });

  caseDashboard.querySelectorAll(".delete-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const caseNumber = button.dataset.caseNumber;
      if (!window.confirm(`${caseNumber} 사례를 삭제할까요?`)) {
        return;
      }
      try {
        const result = await api(
          "/api/case/delete",
          { method: "POST", body: JSON.stringify({ caseNumber }) },
          adminSessionToken,
        );
        cachedState = result.state;
        renderAdminDashboard();
        showToast(`${caseNumber} 사례를 삭제했습니다.`);
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });

  caseDashboard.querySelectorAll(".print-btn").forEach((button) => {
    button.addEventListener("click", () => openPrintPreview(button.dataset.caseNumber));
  });
}

function renderCaseWorkspace(caseData) {
  caseWorkspace.classList.remove("hidden");
  caseTitle.textContent = `${caseData.case.caseNumber} 사례 협업 공간`;

  caseSummary.innerHTML = `
    <p><strong>학생:</strong> ${escapeHtml(`${caseData.report.grade}학년 ${caseData.report.classNumber}반 ${caseData.report.studentName}`)}</p>
    <p><strong>담임:</strong> ${escapeHtml(caseData.report.teacherName)}</p>
    <p><strong>발견유형:</strong> ${escapeHtml(caseData.report.issueType)}</p>
    <p><strong>담임 의견:</strong> ${escapeHtml(caseData.report.teacherOpinion)}</p>
    <p><strong>현재 상태:</strong> ${escapeHtml(caseData.case.status)}</p>
    <p><strong>로그인 사용자:</strong> ${escapeHtml(userSession?.name || "")}</p>
  `;

  departmentPlanForm.caseNumber.value = caseData.case.caseNumber;
  departmentPlanForm.department.value = activeCaseDepartment;

  departmentPlanList.innerHTML = caseData.case.departmentPlans.length
    ? caseData.case.departmentPlans
        .map((plan) => {
          const mine = plan.authorName === userSession?.name;
          return `
            <li class="record-item">
              <p><strong>${escapeHtml(plan.department)}</strong> · 작성자: ${escapeHtml(plan.authorName || "")}</p>
              <textarea class="edit-plan-input" data-note-id="${plan.id}" ${mine ? "" : "disabled"}>${escapeHtml(plan.plan)}</textarea>
              <p class="meta">수정: ${formatDate(plan.updatedAt || plan.createdAt)}</p>
              ${
                mine
                  ? `<div class="panel-actions"><button class="ghost note-update-btn" data-note-id="${plan.id}" data-case-number="${caseData.case.caseNumber}">내 글 수정</button><button class="ghost note-delete-btn" data-note-id="${plan.id}" data-case-number="${caseData.case.caseNumber}">내 글 삭제</button></div>`
                  : '<p class="meta">본인 작성 항목만 수정/삭제할 수 있습니다.</p>'
              }
            </li>
          `;
        })
        .join("")
    : '<li class="record-item">아직 공유된 지원방향이 없습니다.</li>';

  departmentPlanList.querySelectorAll(".note-update-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const input = departmentPlanList.querySelector(`.edit-plan-input[data-note-id="${button.dataset.noteId}"]`);
      const plan = input ? input.value.trim() : "";
      try {
        const result = await api("/api/case/note/update", {
          method: "POST",
          body: JSON.stringify({ caseNumber: button.dataset.caseNumber, noteId: button.dataset.noteId, plan }),
        });
        renderCaseWorkspace(result);
        showToast("내 지원방향을 수정했습니다.");
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });

  departmentPlanList.querySelectorAll(".note-delete-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!window.confirm("내 지원방향을 삭제할까요?")) {
        return;
      }
      try {
        const result = await api("/api/case/note/delete", {
          method: "POST",
          body: JSON.stringify({ caseNumber: button.dataset.caseNumber, noteId: button.dataset.noteId }),
        });
        renderCaseWorkspace(result);
        showToast("내 지원방향을 삭제했습니다.");
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });
}

async function refreshState() {
  const result = await api("/api/state");
  cachedState = { ...cachedState, ...result.state };
}

document.querySelectorAll("[data-target]").forEach((button) => {
  button.addEventListener("click", () => {
    showPanel(button.dataset.target);
    showToast("");
    if (button.dataset.target === "case-access") {
      caseWorkspace.classList.add("hidden");
    }
  });
});

document.getElementById("show-reset").addEventListener("click", () => {
  showPanel("reset-password");
  showToast("");
});

document.getElementById("user-login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = Object.fromEntries(new FormData(event.target).entries());
    const result = await api("/api/user/login", { method: "POST", body: JSON.stringify(payload) }, "");
    userSession = {
      name: result.user.name,
      token: result.token,
      role: result.user.role || "",
      homeroomGrade: result.user.homeroomGrade || "",
      homeroomClass: result.user.homeroomClass || "",
      department: result.user.department || "",
    };
    cachedState = { ...cachedState, ...result.state };
    event.target.reset();
    setLoggedUserUI();

    if (result.user.mustChangePassword) {
      showPanel("force-password");
      showToast("최초 로그인입니다. 비밀번호를 먼저 변경해주세요.");
      return;
    }

    if (!isProfileComplete(userSession)) {
      showPanel("role-setup");
      toggleRoleFields(userSession.role);
      showToast("직책 정보를 입력해주세요.");
      return;
    }

    showPanel("home");
    showToast(`${result.user.name} 선생님, 환영합니다.`);
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById("reset-password-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = Object.fromEntries(new FormData(event.target).entries());
    await api("/api/user/reset-password", { method: "POST", body: JSON.stringify(payload) }, "");
    event.target.reset();
    showPanel("user-login");
    showToast("비밀번호가 재설정되었습니다. 새 비밀번호로 로그인해주세요.");
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById("user-password-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = Object.fromEntries(new FormData(event.target).entries());
    if (payload.newPassword !== payload.confirmPassword) {
      throw new Error("새 비밀번호가 서로 다릅니다.");
    }
    await api("/api/user/password", { method: "POST", body: JSON.stringify(payload) });
    event.target.reset();
    showPanel("role-setup");
    toggleRoleFields(userSession?.role || "");
    showToast("비밀번호 변경이 완료되었습니다. 직책 정보를 입력해주세요.");
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById("user-logout").addEventListener("click", () => {
  userSession = null;
  setLoggedUserUI();
  showPanel("user-login");
  showToast("로그아웃했습니다.");
});

document.getElementById("report-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = Object.fromEntries(new FormData(event.target).entries());
    const result = await api("/api/report", { method: "POST", body: JSON.stringify(data) });
    cachedState = { ...cachedState, ...result.state };
    event.target.reset();
    setLoggedUserUI();
    showToast("담임 제보가 등록되었습니다.");
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById("case-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = Object.fromEntries(new FormData(event.target).entries());
    activeCaseDepartment = data.department.trim();
    const result = await api(`/api/case/${encodeURIComponent(data.caseNumber.trim())}`);
    renderCaseWorkspace(result);
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
    const result = await api("/api/case/note", { method: "POST", body: JSON.stringify(data) });
    renderCaseWorkspace(result);
    event.target.plan.value = "";
    showToast("부서 지원방향이 공유되었습니다.");
    await refreshState();
    if (adminSessionToken) {
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
    const result = await api("/api/admin/login", { method: "POST", body: JSON.stringify(payload) }, "");
    adminSessionToken = result.token;
    cachedState = { ...cachedState, ...result.state };
    event.target.reset();
    showPanel("admin");
    switchAdminView("reports");
    renderAdminDashboard();
    showToast("관리자 대시보드에 진입했습니다.");
  } catch (error) {
    adminSessionToken = "";
    showToast(error.message, true);
  }
});

document.getElementById("admin-password-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = Object.fromEntries(new FormData(event.target).entries());
    if (payload.newPassword !== payload.confirmPassword) {
      throw new Error("새 비밀번호가 서로 다릅니다.");
    }
    await api("/api/admin/password", { method: "POST", body: JSON.stringify(payload) }, adminSessionToken);
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
    const result = await api("/api/case/config", { method: "POST", body: JSON.stringify(payload) }, adminSessionToken);
    cachedState = { ...cachedState, ...result.state };
    renderAdminDashboard();
    showToast(`사례번호 코드가 ${cachedState.caseCode}(으)로 변경되었습니다.`);
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById("teacher-create-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = Object.fromEntries(new FormData(event.target).entries());
    const result = await api(
      "/api/admin/user/create",
      { method: "POST", body: JSON.stringify({ ...payload, initialPassword: "1234" }) },
      adminSessionToken,
    );
    cachedState = { ...cachedState, ...result.state };
    event.target.reset();
    renderAdminDashboard();
    showToast(`등록 ${result.createdNames.length}명, 중복 제외 ${result.skippedNames.length}명 완료.`);
  } catch (error) {
    showToast(error.message, true);
  }
});


roleSelect.addEventListener("change", () => {
  toggleRoleFields(roleSelect.value);
});

document.getElementById("role-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = Object.fromEntries(new FormData(event.target).entries());
    await api("/api/user/profile", { method: "POST", body: JSON.stringify(payload) });
    userSession = {
      ...userSession,
      role: payload.role,
      homeroomGrade: payload.role === "담임교사" ? payload.homeroomGrade : "",
      homeroomClass: payload.role === "담임교사" ? payload.homeroomClass : "",
      department: payload.role === "부장교사" ? payload.department : "",
    };
    setLoggedUserUI();
    showPanel("home");
    showToast("직책 정보가 저장되었습니다.");
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById("admin-logout").addEventListener("click", () => {
  adminSessionToken = "";
  showPanel("user-login");
  showToast("관리자 모드에서 로그아웃했습니다.");
});

adminTabs.forEach((tab) => {
  tab.addEventListener("click", () => switchAdminView(tab.dataset.adminView));
});

refreshState().catch(() => {
  showToast("서버 연결에 실패했습니다. start_webapp.bat로 서버를 실행해주세요.", true);
});
