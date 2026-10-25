const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
const formatDate = (value) => {
  if (!value) return "—";
  try {
    if (typeof globalThis.formatarDataHoraOperacional === "function") return globalThis.formatarDataHoraOperacional(value);
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(new Date(String(value).replace(" ", "T") + (String(value).includes("Z") ? "" : "Z")));
  } catch { return String(value); }
};

function denied(container) {
  container.innerHTML = `<div class="container"><div class="alert alert-warning"><i class="fas fa-lock"></i> Acesso restrito ao administrador do sistema.</div></div>`;
}

function profileCounts(users) {
  return users.reduce((result, user) => {
    const perfil = String(user.perfil || "guarda").toLowerCase();
    result[perfil] = (result[perfil] || 0) + 1;
    return result;
  }, { guarda: 0, supervisor: 0, administrador: 0 });
}

function renderHealth(errors, version) {
  const count = errors.length;
  return `<div class="admin-health-row ${count ? "is-warning" : "is-ok"}">
    <span class="admin-health-dot"></span><div><strong>${count ? "Atenção necessária" : "Tudo em ordem"}</strong><span>${count ? `${count} ocorrência${count === 1 ? "" : "s"} técnica${count === 1 ? "" : "s"} aguardando análise.` : "Nenhum erro técnico aberto encontrado."}</span></div><span class="admin-health-version">${esc(version || "v53")}</span>
  </div>`;
}

function metric(label, value, icon, tone, detail = "") {
  return `<article class="admin-metric admin-metric-${tone}"><div class="admin-metric-icon"><i class="fas ${icon}" aria-hidden="true"></i></div><div><span>${esc(label)}</span><strong>${esc(value)}</strong>${detail ? `<small>${esc(detail)}</small>` : ""}</div></article>`;
}

export async function renderAdminGovernanca(container, app) {
  if (!window.authManager?.isAdministrador?.()) return denied(container);
  container.innerHTML = `<div class="container"><div class="admin-loading"><div class="spinner-azul"></div><p>Validando sessão administrativa...</p></div></div>`;
  try {
    const [summary, users, logs, errors] = await Promise.all([window.adminApi.summary(), window.adminApi.listUsers(), window.adminApi.listLogs(25, 0), window.adminApi.listErrors()]);
    const s = summary.data || {};
    const userRows = users.data || [];
    const logRows = logs.data || [];
    const errorRows = errors.data || [];
    const counts = profileCounts(userRows);
    const ativos = userRows.filter((user) => user.status === "ativo").length;
    const inativos = Math.max(0, userRows.length - ativos);
    const version = s.versao || "v53";
    const errorCount = Number(s.erros_abertos ?? errorRows.length ?? 0);
    container.innerHTML = `
      <div class="container admin-governance-page">
        <header class="admin-hero">
          <div class="admin-hero-copy"><span class="admin-eyebrow"><i class="fas fa-shield-halved"></i> ÁREA RESTRITA · ADMINISTRADOR</span><h2>Governança do sistema</h2><p>Visão técnica, segurança de acesso e saúde operacional do aplicativo.</p><div class="admin-hero-meta"><span><i class="fas fa-code-branch"></i> ${esc(version)}</span><span><i class="fas fa-clock"></i> Horário operacional: Brasil</span><span><i class="fas fa-user-shield"></i> Sessão administrativa ativa</span></div></div>
          <div class="admin-hero-actions"><span class="admin-live-badge"><i class="fas fa-circle"></i> ${errorCount ? "Atenção" : "Operacional"}</span><button class="btn-secondary" id="adminRefresh"><i class="fas fa-rotate"></i> Atualizar dados</button></div>
        </header>
        ${renderHealth(errorRows, version)}
        <nav class="admin-section-nav" aria-label="Seções da governança"><button class="is-active" data-admin-tab="adminOverview"><i class="fas fa-gauge-high"></i> Visão geral</button><button data-admin-tab="adminUsersSection"><i class="fas fa-users-gear"></i> Usuários</button><button data-admin-tab="adminLogsSection"><i class="fas fa-clock-rotate-left"></i> Acessos</button><button data-admin-tab="adminErrorsSection"><i class="fas fa-bug"></i> Erros técnicos</button></nav>
        <section id="adminOverview" class="admin-overview-grid">
          <div class="admin-metrics-grid">${metric("Usuários ativos", ativos || s.usuarios || 0, "fa-users", "blue", `${inativos} inativo${inativos === 1 ? "" : "s"}`)}${metric("Acessos registrados", s.logs ?? logRows.length, "fa-clock-rotate-left", "green", "histórico disponível")}${metric("Erros abertos", errorCount, "fa-triangle-exclamation", errorCount ? "red" : "green", errorCount ? "requer análise" : "sistema saudável")}${metric("Administradores", counts.administrador, "fa-user-shield", "purple", "contas privilegiadas")}</div>
          <aside class="admin-quick-card"><div class="admin-card-kicker">AÇÕES RÁPIDAS</div><h3>O que você precisa fazer?</h3><button id="adminCreateUser" class="admin-quick-action"><span class="admin-action-icon admin-action-blue"><i class="fas fa-user-plus"></i></span><span><strong>Criar usuário</strong><small>Adicionar uma nova conta ao sistema</small></span><i class="fas fa-chevron-right"></i></button><button id="adminFocusSearch" class="admin-quick-action"><span class="admin-action-icon admin-action-green"><i class="fas fa-magnifying-glass"></i></span><span><strong>Buscar usuário</strong><small>Localizar por nome, CPF ou matrícula</small></span><i class="fas fa-chevron-right"></i></button><button id="adminFocusErrors" class="admin-quick-action"><span class="admin-action-icon admin-action-red"><i class="fas fa-bug"></i></span><span><strong>Ver erros técnicos</strong><small>${errorCount ? `${errorCount} pendente${errorCount === 1 ? "" : "s"}` : "Nenhum erro pendente"}</small></span><i class="fas fa-chevron-right"></i></button></aside>
        </section>
        <section class="admin-card admin-users-card" id="adminUsersSection"><div class="admin-card-header"><div><span class="admin-card-kicker">CONTROLE DE ACESSO</span><h3><i class="fas fa-users-gear"></i> Usuários e perfis</h3><p>Gerencie contas, perfis, status e senhas temporárias.</p></div><button class="btn-primary" id="adminCreateUserSecondary"><i class="fas fa-user-plus"></i> Novo usuário</button></div><div class="admin-profile-summary"><span><i class="fas fa-user"></i> Guardas <strong>${counts.guarda}</strong></span><span><i class="fas fa-user-tie"></i> Supervisores <strong>${counts.supervisor}</strong></span><span><i class="fas fa-user-shield"></i> Administradores <strong>${counts.administrador}</strong></span><span><i class="fas fa-circle-check"></i> Ativos <strong>${ativos}</strong></span></div><div class="admin-search-row"><label class="admin-search-box"><i class="fas fa-search"></i><input id="adminUserSearch" class="form-control" placeholder="Buscar por nome, CPF ou matrícula" autocomplete="off"></label><button class="btn-primary" id="adminUserSearchBtn"><i class="fas fa-search"></i><span>Buscar</span></button></div><div id="adminUsersTable">${renderUsers(userRows)}</div></section>
        <div class="admin-lower-grid"><section class="admin-card" id="adminLogsSection"><div class="admin-card-header admin-card-header-compact"><div><span class="admin-card-kicker">AUDITORIA</span><h3><i class="fas fa-clock-rotate-left"></i> Últimos acessos</h3><p>Atividades administrativas recentes.</p></div><span class="admin-count-badge">${logRows.length}</span></div><div class="admin-table-scroll"><table class="admin-data-table"><thead><tr><th>Data e hora</th><th>Usuário</th><th>Ação</th></tr></thead><tbody>${renderLogs(logRows)}</tbody></table></div></section><section class="admin-card" id="adminErrorsSection"><div class="admin-card-header admin-card-header-compact"><div><span class="admin-card-kicker">MONITORAMENTO</span><h3><i class="fas fa-bug"></i> Erros técnicos</h3><p>Eventos que podem exigir investigação.</p></div><span class="admin-count-badge ${errorCount ? "is-danger" : "is-success"}">${errorCount}</span></div>${renderErrors(errorRows)}</section></div>
        <footer class="admin-footer"><span><i class="fas fa-lock"></i> Painel exclusivo do administrador do sistema</span><span>Último login administrativo: <strong>${esc(formatDate(s.ultimo_login?.data_hora))}</strong></span></footer>
      </div>`;
    bindAdminEvents(container, app);
  } catch (error) {
    container.innerHTML = `<div class="container"><div class="alert alert-danger"><i class="fas fa-triangle-exclamation"></i> ${esc(error.message)}</div><button class="btn-primary" onclick="app.navigateTo('dashboard')">Voltar</button></div>`;
  }
}

function roleClass(perfil) { return `admin-role-${String(perfil || "guarda").toLowerCase()}`; }
function renderUsers(users) {
  if (!users.length) return `<div class="admin-empty"><i class="fas fa-users-slash"></i><strong>Nenhum usuário encontrado</strong><span>Tente alterar os termos da busca.</span></div>`;
  return `<div class="admin-table-scroll"><table class="admin-data-table admin-users-table"><thead><tr><th>Usuário</th><th>Perfil</th><th>Status</th><th>Último acesso</th><th class="admin-actions-heading">Ações</th></tr></thead><tbody>${users.map((u) => `<tr><td data-label="Usuário"><div class="admin-user-cell"><span class="admin-avatar">${esc((u.nome_completo || "?").trim().charAt(0).toUpperCase())}</span><span><strong>${esc(u.nome_completo || "Sem nome")}</strong><small>${esc(u.matricula || u.cpf || "Sem identificação")}</small></span></div></td><td data-label="Perfil"><span class="admin-role-pill ${roleClass(u.perfil)}">${esc(u.perfil || "guarda")}</span></td><td data-label="Status"><span class="admin-status-pill ${u.status === "ativo" ? "is-active" : "is-inactive"}"><i class="fas fa-circle"></i>${esc(u.status || "—")}</span></td><td data-label="Último acesso">${esc(formatDate(u.ultimo_login))}</td><td data-label="Ações"><div class="admin-row-actions"><button class="admin-icon-button btn-edit-admin" data-id="${esc(u.id)}" title="Editar usuário"><i class="fas fa-pen"></i></button><button class="admin-icon-button btn-status-admin" data-id="${esc(u.id)}" data-status="${u.status === "ativo" ? "inativo" : "ativo"}" title="${u.status === "ativo" ? "Desativar" : "Ativar"}"><i class="fas ${u.status === "ativo" ? "fa-user-slash" : "fa-user-check"}"></i></button><button class="admin-icon-button btn-reset-admin" data-id="${esc(u.id)}" title="Gerar senha temporária"><i class="fas fa-key"></i></button></div></td></tr>`).join("")}</tbody></table></div>`;
}
function renderLogs(logs) { return logs.length ? logs.map((l) => `<tr><td data-label="Data e hora">${esc(formatDate(l.data_hora))}</td><td data-label="Usuário"><strong>${esc(l.usuarios?.nome_completo || l.usuario_id || "—")}</strong></td><td data-label="Ação"><span class="admin-action-label">${esc(l.acao || "—")}</span></td></tr>`).join("") : `<tr><td colspan="3" class="admin-empty-table">Nenhum acesso registrado.</td></tr>`; }
function renderErrors(errors) { return errors.length ? `<div class="admin-table-scroll"><table class="admin-data-table admin-errors-table"><thead><tr><th>Data</th><th>Nível</th><th>Origem</th><th>Mensagem</th></tr></thead><tbody>${errors.map((e) => `<tr><td data-label="Data">${esc(formatDate(e.criado_em))}</td><td data-label="Nível"><span class="admin-error-level">${esc(e.nivel || "erro")}</span></td><td data-label="Origem">${esc(e.origem || "—")}</td><td data-label="Mensagem" title="${esc(e.mensagem || "")}">${esc(e.mensagem || "—")}</td></tr>`).join("")}</tbody></table></div>` : `<div class="admin-empty admin-empty-success"><i class="fas fa-circle-check"></i><strong>Nenhum erro técnico aberto</strong><span>O sistema não apresenta alertas pendentes.</span></div>`; }

function promptUserData(defaults = {}) {
  const nome = window.prompt("Nome completo:", defaults.nome_completo || ""); if (!nome) return null;
  const cpf = defaults.cpf || window.prompt("CPF (somente números):", ""); if (!cpf) return null;
  const matricula = window.prompt("Matrícula (opcional):", defaults.matricula || "") || "";
  const email = window.prompt("E-mail (opcional):", defaults.email || "") || "";
  const telefone = window.prompt("Telefone (opcional):", defaults.telefone || "") || "";
  const perfil = window.prompt("Perfil: guarda, supervisor ou administrador", defaults.perfil || "guarda");
  if (!["guarda", "supervisor", "administrador"].includes(perfil)) throw new Error("Perfil inválido.");
  return { nome, cpf, matricula, email, telefone, perfil };
}

function createUser(container, app) {
  return (async () => { try { const payload = promptUserData(); if (!payload) return; const result = await window.adminApi.createUser(payload); alert(`Usuário criado. Senha temporária (exibida uma única vez):\n\n${result.senha_temporaria}\n\nAnote ou entregue a senha agora.`); await renderAdminGovernanca(container, app); } catch (error) { alert(error.message); } })();
}
function bindAdminEvents(container, app) {
  document.getElementById("adminRefresh")?.addEventListener("click", () => renderAdminGovernanca(container, app));
  document.getElementById("adminCreateUser")?.addEventListener("click", () => createUser(container, app));
  document.getElementById("adminCreateUserSecondary")?.addEventListener("click", () => createUser(container, app));
  document.getElementById("adminFocusSearch")?.addEventListener("click", () => { document.getElementById("adminUserSearch")?.focus(); document.getElementById("adminUsersSection")?.scrollIntoView({ behavior: "smooth", block: "start" }); });
  document.getElementById("adminFocusErrors")?.addEventListener("click", () => document.getElementById("adminErrorsSection")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  document.querySelectorAll("[data-admin-tab]").forEach((button) => button.addEventListener("click", () => { document.querySelectorAll("[data-admin-tab]").forEach((item) => item.classList.remove("is-active")); button.classList.add("is-active"); document.getElementById(button.dataset.adminTab)?.scrollIntoView({ behavior: "smooth", block: "start" }); }));
  document.getElementById("adminUserSearchBtn")?.addEventListener("click", async () => { try { const result = await window.adminApi.listUsers(document.getElementById("adminUserSearch")?.value || ""); document.getElementById("adminUsersTable").innerHTML = renderUsers(result.data || []); bindUserActions(container, app); } catch (error) { alert(error.message); } });
  document.getElementById("adminUserSearch")?.addEventListener("keydown", (event) => { if (event.key === "Enter") document.getElementById("adminUserSearchBtn")?.click(); });
  bindUserActions(container, app);
}
function bindUserActions(container, app) {
  document.querySelectorAll(".btn-edit-admin").forEach((button) => button.addEventListener("click", async () => { try { const result = await window.adminApi.listUsers(); const user = (result.data || []).find((item) => item.id === button.dataset.id); if (!user) throw new Error("Usuário não encontrado."); const data = promptUserData(user); if (!data) return; await window.adminApi.updateUser({ id: user.id, nome_completo: data.nome, matricula: data.matricula, email: data.email, telefone: data.telefone, perfil: data.perfil }); await renderAdminGovernanca(container, app); } catch (error) { alert(error.message); } }));
  document.querySelectorAll(".btn-status-admin").forEach((button) => button.addEventListener("click", async () => { if (!confirm(`${button.dataset.status === "ativo" ? "Ativar" : "Desativar"} este usuário?`)) return; try { await window.adminApi.updateUser({ id: button.dataset.id, status: button.dataset.status }); await renderAdminGovernanca(container, app); } catch (error) { alert(error.message); } }));
  document.querySelectorAll(".btn-reset-admin").forEach((button) => button.addEventListener("click", async () => { if (!confirm("Gerar uma nova senha temporária? A senha atual será invalidada.")) return; try { const result = await window.adminApi.resetPassword(button.dataset.id); alert(`Senha temporária (exibida uma única vez):\n\n${result.senha_temporaria}\n\nAnote ou entregue a senha agora. Ela não será exibida novamente.`); await renderAdminGovernanca(container, app); } catch (error) { alert(error.message); } }));
}
