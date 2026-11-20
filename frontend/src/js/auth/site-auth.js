function setAuthPanel(panel) {
  loginForm.hidden = panel !== "login";
  recoveryForm.hidden = panel !== "recovery";
  updatePasswordForm.hidden = panel !== "update";
  authTitle.textContent = panel === "update"
    ? "Cambiar contraseña"
    : panel === "recovery"
      ? "Recuperar contraseña"
      : "Inicia sesión";
  setAuthStatus("");
}

async function handleSession(session) {
  if (!session?.user) {
    currentUser = null;
    appShell.hidden = true;
    authScreen.hidden = false;
    accountPopover.hidden = true;
    accountToggle.setAttribute("aria-expanded", "false");
    accountToggle.setAttribute("aria-label", "Mostrar nombre de usuario");
    if (!recoveryActive) {
      setAuthPanel("login");
      if (persistentAuthMessage) setAuthStatus(persistentAuthMessage, true);
    }
    return;
  }

  if (currentUser?.id === session.user.id && !appShell.hidden) {
    if (recoveryActive) {
      appShell.hidden = true;
      authScreen.hidden = false;
    }
    return;
  }

  const { data: profile, error } = await client
    .from("profiles")
    .select("username, blocked")
    .eq("id", session.user.id)
    .maybeSingle();
  if (error || !profile) {
    appShell.hidden = true;
    authScreen.hidden = false;
    setAuthPanel("login");
    persistentAuthMessage =
      error
        ? `No se pudo verificar el estado de la cuenta: ${error.message}`
        : "No se encontró el perfil de esta cuenta.";
    const { error: signOutError } = await client.auth.signOut();
    if (signOutError) persistentAuthMessage += ` No se pudo cerrar la sesión: ${signOutError.message}`;
    setAuthStatus(persistentAuthMessage, true);
    return;
  }
  if (profile.blocked) {
    appShell.hidden = true;
    authScreen.hidden = false;
    persistentAuthMessage = "Tu usuario ha sido bloqueado. Solicita acceso al administrador.";
    const { error: signOutError } = await client.auth.signOut();
    if (signOutError) persistentAuthMessage += ` No se pudo cerrar la sesión: ${signOutError.message}`;
    setAuthPanel("login");
    setAuthStatus(persistentAuthMessage, true);
    return;
  }

  persistentAuthMessage = "";
  currentUser = session.user;
  if (recoveryActive) {
    appShell.hidden = true;
    authScreen.hidden = false;
    return;
  }
  recoveryActive = false;
  authScreen.hidden = true;
  appShell.hidden = false;
  const username = profile.username?.trim() || "Usuario";
  accountPopoverName.textContent = username;
  accountPopover.hidden = true;
  accountToggle.textContent = username.charAt(0).toUpperCase();
  accountToggle.setAttribute("aria-expanded", "false");
  accountToggle.setAttribute("aria-label", "Mostrar nombre de usuario");
  await loadNotes();
}

async function submitLogin(event) {
  event.preventDefault();
  const submit = loginForm.querySelector('button[type="submit"]');
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  persistentAuthMessage = "";
  submit.disabled = true;
  setAuthStatus("Iniciando sesión...");

  const { data: email, error: lookupError } = await client.rpc(
    "get_auth_email_by_username",
    { target_username: username },
  );
  if (lookupError || !email) {
    submit.disabled = false;
    setAuthStatus("Usuario o contraseña incorrectos.", true);
    return;
  }

  const { error } = await client.auth.signInWithPassword({ email, password });
  submit.disabled = false;
  if (error) setAuthStatus("Usuario o contraseña incorrectos.", true);
}

async function submitRecovery(event) {
  event.preventDefault();
  const submit = recoveryForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  setAuthStatus("Enviando enlace...");
  const { error } = await client.auth.resetPasswordForEmail(
    document.getElementById("recoveryEmail").value.trim(),
    { redirectTo: `${window.location.origin}${window.location.pathname}` },
  );
  submit.disabled = false;
  if (error) {
    setAuthStatus(error.message, true);
    return;
  }
  setAuthStatus("Revisa tu correo y abre el enlace para cambiar la contraseña.");
  recoveryForm.reset();
}

async function submitPasswordUpdate(event) {
  event.preventDefault();
  const password = document.getElementById("newPassword").value;
  const confirmation = document.getElementById("confirmPassword").value;
  if (password !== confirmation) {
    setAuthStatus("Las contraseñas no coinciden.", true);
    return;
  }
  const submit = updatePasswordForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  setAuthStatus("Guardando contraseña...");
  const { error } = await client.auth.updateUser({ password });
  submit.disabled = false;
  if (error) {
    setAuthStatus(error.message, true);
    return;
  }
  recoveryActive = false;
  updatePasswordForm.reset();
  setAuthStatus("Contraseña actualizada.");
  const { data, error: sessionError } = await client.auth.getSession();
  if (sessionError) {
    setAuthStatus(`No se pudo recuperar la sesión: ${sessionError.message}`, true);
    return;
  }
  await handleSession(data?.session);
}

