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
function card(label, value, icon, tone = "#003f87") {
  return `<div style="background:#fff;border:1px solid var(--cinza-claro);border-left:4px solid ${tone};border-radius:12px;padding:16px;box-shadow:0 2px 8px rgba(0,0,0,.06)"><div style="color:var(--cinza-medio);font-size:12px;text-transform:uppercase;font-weight:700"><i class="fas ${icon}"></i> ${esc(label)}</div><strong style="display:block;font-size:26px;color:${tone};margin-top:6px">${esc(value)}</strong></div>`;
}

export async function renderAdminGovernanca(container, app) {
  if (!window.authManager?.isAdministrador?.()) return denied(container);
  container.innerHTML = `<div class="container"><div style="text-align:center;padding:36px"><div class="spinner-azul" style="margin:auto"></div><p>Validando sessão administrativa...</p></div></div>`;
  try {
    const [summary, users, logs, errors] = await Promise.all([window.adminApi.summary(), window.adminApi.listUsers(), window.adminApi.listLogs(25, 0), window.adminApi.listErrors()]);
    const s = summary.data || {};
    container.innerHTML = `
      <div class="container" style="padding-bottom:32px">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap"><div><h2 style="margin-bottom:4px;color:var(--azul-bandeira)"><i class="fas fa-shield-halved"></i> Governança do sistema</h2><p style="margin:0;color:var(--cinza-medio)">Painel técnico do administrador — ${esc(s.versao || "v50")}</p></div><button class="btn-secondary" id="adminRefresh"><i class="fas fa-rotate"></i> Atualizar</button></div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:20px 0">${card("Usuários", s.usuarios ?? 0, "fa-users")} ${card("Acessos registrados", s.logs ?? 0, "fa-clock-rotate-left", "#0f766e")} ${card("Erros abertos", s.erros_abertos ?? 0, "fa-triangle-exclamation", s.erros_abertos ? "#b91c1c" : "#15803d")} ${card("Fuso operacional", "Brasil", "fa-clock", "#7c3aed")}</div>
        <section class="card" style="margin-bottom:16px"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap"><div><h3 style="margin-bottom:4px"><i class="fas fa-users-gear"></i> Usuários e perfis</h3><p style="margin:0;color:var(--cinza-medio);font-size:13px">O administrador pode criar, editar, ativar/desativar, alterar perfil e resetar senha.</p></div><button class="btn-primary" id="adminCreateUser"><i class="fas fa-user-plus"></i> Novo usuário</button></div><div style="display:flex;gap:8px;margin:16px 0 10px"><input id="adminUserSearch" class="form-control" placeholder="Buscar nome, CPF ou matrícula"><button class="btn-primary" id="adminUserSearchBtn"><i class="fas fa-search"></i></button></div><div id="adminUsersTable">${renderUsers(users.data || [])}</div></section>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px">
          <section class="card"><h3><i class="fas fa-clock-rotate-left"></i> Últimos acessos</h3><div style="overflow:auto"><table style="width:100%;font-size:12px"><thead><tr><th>Data</th><th>Usuário</th><th>Ação</th></tr></thead><tbody>${renderLogs(logs.data || [])}</tbody></table></div></section>
          <section class="card"><h3><i class="fas fa-bug"></i> Erros técnicos</h3>${renderErrors(errors.data || [])}</section>
        </div>
        <p style="font-size:11px;color:var(--cinza-medio);margin-top:16px">Último login: ${esc(formatDate(s.ultimo_login?.data_hora))}. O administrador não recebe acesso automático às operações de BO.</p>
      </div>`;
    bindAdminEvents(container, app);
  } catch (error) {
    container.innerHTML = `<div class="container"><div class="alert alert-danger"><i class="fas fa-triangle-exclamation"></i> ${esc(error.message)}</div><button class="btn-primary" onclick="app.navigateTo('dashboard')">Voltar</button></div>`;
  }
}

function renderUsers(users) {
  if (!users.length) return `<p style="color:var(--cinza-medio)">Nenhum usuário encontrado.</p>`;
  return `<div style="overflow:auto"><table style="width:100%;font-size:12px"><thead><tr><th>Nome</th><th>Perfil</th><th>Status</th><th>Último login</th><th>Ações</th></tr></thead><tbody>${users.map((u) => `<tr><td><strong>${esc(u.nome_completo)}</strong><br><span style="color:var(--cinza-medio)">${esc(u.matricula || u.cpf)}</span></td><td><span class="badge-azul">${esc(u.perfil)}</span></td><td>${esc(u.status)}</td><td>${esc(formatDate(u.ultimo_login))}</td><td><div style="display:flex;gap:4px;flex-wrap:wrap"><button class="btn-secondary btn-edit-admin" data-id="${esc(u.id)}" title="Editar usuário"><i class="fas fa-pen"></i></button><button class="btn-secondary btn-status-admin" data-id="${esc(u.id)}" data-status="${u.status === "ativo" ? "inativo" : "ativo"}" title="${u.status === "ativo" ? "Desativar" : "Ativar"}"><i class="fas ${u.status === "ativo" ? "fa-user-slash" : "fa-user-check"}"></i></button><button class="btn-secondary btn-reset-admin" data-id="${esc(u.id)}" title="Gerar senha temporária"><i class="fas fa-key"></i></button></div></td></tr>`).join("")}</tbody></table></div>`;
}
function renderLogs(logs) { return logs.length ? logs.map((l) => `<tr><td>${esc(formatDate(l.data_hora))}</td><td>${esc(l.usuarios?.nome_completo || l.usuario_id || "—")}</td><td>${esc(l.acao || "—")}</td></tr>`).join("") : `<tr><td colspan="3">Nenhum acesso.</td></tr>`; }
function renderErrors(errors) { return errors.length ? `<div style="overflow:auto"><table style="width:100%;font-size:12px"><thead><tr><th>Data</th><th>Nível</th><th>Origem</th><th>Mensagem</th></tr></thead><tbody>${errors.map((e) => `<tr><td>${esc(formatDate(e.criado_em))}</td><td>${esc(e.nivel)}</td><td>${esc(e.origem)}</td><td>${esc(e.mensagem)}</td></tr>`).join("")}</tbody></table></div>` : `<p style="color:#15803d"><i class="fas fa-check-circle"></i> Nenhum erro técnico aberto.</p>`; }

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

function bindAdminEvents(container, app) {
  document.getElementById("adminRefresh")?.addEventListener("click", () => renderAdminGovernanca(container, app));
  document.getElementById("adminCreateUser")?.addEventListener("click", async () => { try { const payload = promptUserData(); if (!payload) return; const result = await window.adminApi.createUser(payload); alert(`Usuário criado. Senha temporária (exibida uma única vez):\n\n${result.senha_temporaria}\n\nAnote ou entregue a senha agora.`); await renderAdminGovernanca(container, app); } catch (error) { alert(error.message); } });
  document.getElementById("adminUserSearchBtn")?.addEventListener("click", async () => { try { const result = await window.adminApi.listUsers(document.getElementById("adminUserSearch")?.value || ""); document.getElementById("adminUsersTable").innerHTML = renderUsers(result.data || []); bindUserActions(container, app); } catch (error) { alert(error.message); } });
  bindUserActions(container, app);
}
function bindUserActions(container, app) {
  document.querySelectorAll(".btn-edit-admin").forEach((button) => button.addEventListener("click", async () => { try { const result = await window.adminApi.listUsers(); const user = (result.data || []).find((item) => item.id === button.dataset.id); if (!user) throw new Error("Usuário não encontrado."); const data = promptUserData(user); if (!data) return; await window.adminApi.updateUser({ id: user.id, nome_completo: data.nome, matricula: data.matricula, email: data.email, telefone: data.telefone, perfil: data.perfil }); await renderAdminGovernanca(container, app); } catch (error) { alert(error.message); } }));
  document.querySelectorAll(".btn-status-admin").forEach((button) => button.addEventListener("click", async () => { if (!confirm(`${button.dataset.status === "ativo" ? "Ativar" : "Desativar"} este usuário?`)) return; try { await window.adminApi.updateUser({ id: button.dataset.id, status: button.dataset.status }); await renderAdminGovernanca(container, app); } catch (error) { alert(error.message); } }));
  document.querySelectorAll(".btn-reset-admin").forEach((button) => button.addEventListener("click", async () => { if (!confirm("Gerar uma nova senha temporária? A senha atual será invalidada.")) return; try { const result = await window.adminApi.resetPassword(button.dataset.id); alert(`Senha temporária (exibida uma única vez):\n\n${result.senha_temporaria}\n\nAnote ou entregue a senha agora. Ela não será exibida novamente.`); await renderAdminGovernanca(container, app); } catch (error) { alert(error.message); } }));
}
