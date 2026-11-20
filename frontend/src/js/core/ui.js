function setAuthStatus(message, isError = false) {
  authStatus.textContent = message;
  authStatus.classList.toggle("is-error", isError);
}

function setSaveStatus(message, isError = false) {
  saveStatus.textContent = message;
  saveStatus.classList.toggle("is-error", isError);
}

function setGlobalStatus(message, isError = false) {
  globalStatus.textContent = message;
  globalStatus.classList.toggle("is-error", isError);
  window.clearTimeout(globalStatusTimer);
  if (message) {
    globalStatusTimer = window.setTimeout(() => {
      globalStatus.textContent = "";
      globalStatus.classList.remove("is-error");
    }, isError ? 7000 : 3200);
  }
}

function finishConfirmation(confirmed) {
  if (!pendingConfirmResolution) return;
  const resolve = pendingConfirmResolution;
  pendingConfirmResolution = null;
  confirmDialog.close();
  resolve(confirmed);
}

function requestConfirmation({ title, message, confirmLabel }) {
  if (confirmDialog.open) return Promise.resolve(false);
  confirmDialogTitle.textContent = title;
  confirmDialogMessage.textContent = message;
  acceptConfirmation.textContent = confirmLabel;
  return new Promise((resolve) => {
    pendingConfirmResolution = resolve;
    confirmDialog.showModal();
    cancelConfirmation.focus();
  });
}

