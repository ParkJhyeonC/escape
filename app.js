const STORAGE_KEY = "student-support-admin-password";
const DEFAULT_PASSWORD = "1234";

const home = document.getElementById("home");
const panels = document.querySelectorAll(".panel");
const toast = document.getElementById("toast");

function getAdminPassword() {
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_PASSWORD;
}

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.classList.toggle("error", isError);
}

function showHome() {
  panels.forEach((panel) => panel.classList.add("hidden"));
  home.classList.remove("hidden");
}

function showPanel(panelId) {
  panels.forEach((panel) => panel.classList.add("hidden"));
  home.classList.add("hidden");
  document.getElementById(panelId).classList.remove("hidden");
}

document.querySelectorAll(".action-button").forEach((button) => {
  button.addEventListener("click", () => {
    showPanel(button.dataset.target);
    showToast("");
  });
});

document.querySelectorAll("[data-back]").forEach((button) => {
  button.addEventListener("click", () => {
    showHome();
    showToast("");
  });
});

document.getElementById("report-form").addEventListener("submit", (event) => {
  event.preventDefault();
  showToast("제보가 등록되었습니다. 담당자에게 전달됩니다.");
  event.target.reset();
});

document.getElementById("case-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.target);
  showToast(`${data.get("department")} 부서가 ${data.get("caseNumber")} 사례에 접속했습니다.`);
  event.target.reset();
});

document.getElementById("admin-login-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const password = new FormData(event.target).get("password");

  if (password !== getAdminPassword()) {
    showToast("비밀번호가 올바르지 않습니다.", true);
    return;
  }

  event.target.reset();
  showPanel("admin");
  showToast("관리자 모드에 진입했습니다.");
});

document.getElementById("password-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.target);
  const currentPassword = data.get("currentPassword");
  const newPassword = data.get("newPassword");
  const confirmPassword = data.get("confirmPassword");

  if (currentPassword !== getAdminPassword()) {
    showToast("현재 비밀번호가 일치하지 않습니다.", true);
    return;
  }

  if (newPassword !== confirmPassword) {
    showToast("새 비밀번호가 서로 다릅니다.", true);
    return;
  }

  localStorage.setItem(STORAGE_KEY, newPassword);
  event.target.reset();
  showToast("관리자 비밀번호가 변경되었습니다.");
});

document.getElementById("admin-logout").addEventListener("click", () => {
  showHome();
  showToast("관리자 모드에서 로그아웃했습니다.");
});
