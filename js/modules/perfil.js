/**
 * MÓDULO PERFIL - Gerenciamento de Perfil Próprio
 * Guarda Municipal de Pitangueiras - PR
 *
 * Este módulo gerencia:
 * - Visualização do perfil do usuário logado
 * - Edição de dados pessoais (nome, email, telefone)
 * - Edição de matrícula (apenas para supervisores)
 * - Alteração de senha com validação
 * - Exibição de informações do perfil (avatar, perfil, matrícula)
 *
 * Depende de: authManager (global), supabaseClient (global),
 *             utils, ui
 */

// ============================================
// IMPORTAÇÕES
// ============================================

// Usamos os objetos globais disponíveis
// (authManager, supabaseClient)
// e funções dos módulos utils e ui

// ============================================
// FUNÇÕES PRINCIPAIS
// ============================================

/**
 * Renderiza a página de perfil do usuário
 * @param {HTMLElement} container - Elemento onde renderizar
 * @param {Object} appInstance - Instância do app
 */
export async function renderPerfil(container, appInstance) {
  if (typeof authManager === "undefined" || !authManager.isLoggedIn()) {
    container.innerHTML = `
      <main class="perfil-shell">
        <section class="perfil-empty-state">
          <div class="perfil-empty-icon"><i class="fas fa-user-lock" aria-hidden="true"></i></div>
          <p class="perfil-eyebrow">Acesso à conta</p>
          <h1>Entre para ver seu perfil</h1>
          <p>Faça login para consultar e atualizar suas informações.</p>
          <button onclick="window.app.navigateTo('login')" class="btn-primary perfil-button perfil-button-primary" type="button">
            <i class="fas fa-sign-in-alt" aria-hidden="true"></i> Fazer login
          </button>
        </section>
      </main>`;
    return;
  }

  const user = authManager.getUser();
  if (!user) {
    container.innerHTML = `<main class="perfil-shell"><div class="perfil-notice perfil-notice-error" role="alert">Não foi possível carregar os dados do usuário.</div></main>`;
    return;
  }

  const isSupervisor = authManager.isSupervisor();
  const name = String(user.nome_completo || "Usuário").trim() || "Usuário";
  const initial = name.charAt(0).toLocaleUpperCase("pt-BR") || "U";
  const roleLabel = isSupervisor ? "Supervisor" : "Guarda municipal";
  const podeEditarMatricula = isSupervisor;
  const safeAvatar = obterUrlFotoSegura(user.foto_url);
  const matricula = user.matricula ? String(user.matricula) : "Não informada";

  let ultimoLogin = "Ainda não registrado";
  if (user.ultimo_login) {
    const date = new Date(user.ultimo_login);
    if (!Number.isNaN(date.getTime())) {
      ultimoLogin = date.toLocaleString("pt-BR", {
        timeZone: globalThis.CONFIG?.TIMEZONE || "America/Sao_Paulo",
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    }
  }

  let tempoRestante = "Indisponível";
  if (typeof sessionManager !== "undefined" && sessionManager.getTimeRemaining) {
    const minutos = Number(sessionManager.getTimeRemaining());
    if (Number.isFinite(minutos) && minutos >= 0) {
      tempoRestante = minutos >= 60
        ? `${Math.floor(minutos / 60)}h ${Math.round(minutos % 60)}min`
        : `${Math.round(minutos)} min`;
    }
  }

  container.innerHTML = `
    <main class="perfil-shell">
      <header class="perfil-page-heading">
        <div>
          <p class="perfil-eyebrow">Conta e preferências</p>
          <h1>Meu Perfil</h1>
          <p class="perfil-page-subtitle">Seus dados de identificação e acesso ao sistema.</p>
        </div>
        <button onclick="window.app.navigateTo('dashboard')" class="btn-secondary perfil-back-button" type="button">
          <i class="fas fa-arrow-left" aria-hidden="true"></i><span>Voltar ao painel</span>
        </button>
      </header>

      <section class="perfil-identity-card" aria-labelledby="perfilNomeExibicao">
        <div class="perfil-identity-accent" aria-hidden="true"></div>
        <div class="perfil-identity-content">
          <div class="perfil-avatar-wrap">
            <div class="perfil-avatar" id="perfilAvatar" aria-label="Foto de perfil">
              ${safeAvatar ? `<img class="perfil-avatar-image" src="${escaparHtml(safeAvatar)}" alt="Foto de perfil de ${escaparHtml(name)}" referrerpolicy="no-referrer">` : ""}
              <span class="perfil-avatar-fallback"${safeAvatar ? " hidden" : ""} aria-hidden="true">${escaparHtml(initial)}</span>
            </div>
            <button type="button" class="perfil-avatar-edit" onclick="window._perfilEscolherFoto()" aria-label="Alterar foto de perfil" title="Alterar foto de perfil">
              <i class="fas fa-camera" aria-hidden="true"></i>
            </button>
          </div>
          <div class="perfil-identity-text">
            <p class="perfil-eyebrow">Identificação funcional</p>
            <h2 id="perfilNomeExibicao">${escaparHtml(name)}</h2>
            <div class="perfil-identity-meta">
              <span class="perfil-role-pill ${isSupervisor ? "perfil-role-supervisor" : "perfil-role-guarda"}"><i class="fas ${isSupervisor ? "fa-shield-alt" : "fa-user-shield"}" aria-hidden="true"></i>${escaparHtml(roleLabel)}</span>
              <span class="perfil-meta-item"><i class="fas fa-id-badge" aria-hidden="true"></i>Matrícula ${escaparHtml(matricula)}</span>
            </div>
          </div>
          <div class="perfil-avatar-actions">
            <input id="perfilFotoInput" class="perfil-file-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Selecionar imagem de perfil">
            <button type="button" class="btn-secondary perfil-button perfil-button-outline" onclick="window._perfilEscolherFoto()">
              <i class="fas fa-camera" aria-hidden="true"></i> Alterar foto
            </button>
            <p>JPG, PNG ou WebP · até 1 MiB após otimização</p>
          </div>
        </div>
        <div class="perfil-public-photo-note"><i class="fas fa-globe-americas" aria-hidden="true"></i> A foto fica em uma URL pública para ser exibida no sistema. Evite imagens com informações sensíveis ao fundo.</div>
      </section>

      <div class="perfil-layout-grid">
        <section class="perfil-panel perfil-data-panel">
          <div class="perfil-panel-heading">
            <div class="perfil-panel-icon"><i class="fas fa-address-card" aria-hidden="true"></i></div>
            <div><p class="perfil-eyebrow">Informações pessoais</p><h2>Dados do perfil</h2><p>Atualize os contatos associados à sua conta.</p></div>
          </div>
          <form id="formPerfil" class="perfil-form" onsubmit="event.preventDefault();">
            <div class="perfil-fields-grid">
              <div class="perfil-field-group perfil-field-wide">
                <label for="perfil_apelido">Apelido operacional</label>
                <input type="text" id="perfil_apelido" class="form-control" value="${escaparHtml(String(user.apelido || "").replace(/^GM\s+/i, "").trim())}" autocomplete="nickname" maxlength="60" placeholder="Digite o apelido que deseja exibir" aria-describedby="perfilApelidoHint">
                <small id="perfilApelidoHint">O cabeçalho mostrará “GM” seguido do apelido que você digitar. Informe só o apelido; seu nome completo oficial não muda.</small>
                <small id="perfilApelidoPreview" aria-live="polite"></small>
              </div>
              <div class="perfil-field-group perfil-field-wide">
                <label for="perfil_nome">Nome completo <span aria-hidden="true">*</span></label>
                <input type="text" id="perfil_nome" class="form-control" value="${escaparHtml(name)}" autocomplete="name" maxlength="160" required>
              </div>
              <div class="perfil-field-group">
                <label for="perfil_matricula">Matrícula</label>
                <input type="text" id="perfil_matricula" class="form-control ${podeEditarMatricula ? "" : "perfil-readonly-field"}" value="${escaparHtml(user.matricula || "")}" ${podeEditarMatricula ? "maxlength=\"40\"" : "disabled"}>
                ${podeEditarMatricula ? "<small>Alteração disponível para supervisores.</small>" : "<small>Para solicitar alteração, procure a supervisão.</small>"}
              </div>
              <div class="perfil-field-group">
                <label for="perfil_email">E-mail</label>
                <input type="email" id="perfil_email" class="form-control" value="${escaparHtml(user.email || "")}" autocomplete="email" maxlength="254" placeholder="nome@exemplo.com">
              </div>
              <div class="perfil-field-group">
                <label for="perfil_telefone">Telefone</label>
                <input type="tel" id="perfil_telefone" class="form-control" value="${escaparHtml(user.telefone || "")}" autocomplete="tel" inputmode="tel" maxlength="16" placeholder="(00) 00000-0000">
              </div>
            </div>
            <div class="perfil-form-actions">
              <button type="button" onclick="window._perfilSalvar()" class="btn-primary perfil-button perfil-button-primary">
                <i class="fas fa-check" aria-hidden="true"></i> Salvar alterações
              </button>
              <span class="perfil-form-hint"><i class="fas fa-lock" aria-hidden="true"></i> Seus dados são usados para identificação e contato funcional.</span>
            </div>
          </form>
        </section>

        <aside class="perfil-side-column" aria-label="Segurança e sessão">
          <section class="perfil-panel perfil-security-panel">
            <div class="perfil-panel-heading perfil-panel-heading-compact">
              <div class="perfil-panel-icon perfil-panel-icon-green"><i class="fas fa-shield-alt" aria-hidden="true"></i></div>
              <div><p class="perfil-eyebrow">Acesso</p><h2>Segurança</h2></div>
            </div>
            <p class="perfil-panel-copy">Mantenha sua senha protegida e não a compartilhe com outras pessoas.</p>
            <button type="button" onclick="window._perfilAlterarSenha()" class="btn-secondary perfil-button perfil-button-security">
              <i class="fas fa-key" aria-hidden="true"></i> Alterar senha
            </button>
          </section>

          <section class="perfil-panel perfil-session-panel">
            <div class="perfil-panel-heading perfil-panel-heading-compact">
              <div class="perfil-panel-icon"><i class="fas fa-clock" aria-hidden="true"></i></div>
              <div><p class="perfil-eyebrow">Atividade</p><h2>Sessão atual</h2></div>
            </div>
            <dl class="perfil-session-list">
              <div><dt>Último acesso</dt><dd>${escaparHtml(ultimoLogin)}</dd></div>
              <div><dt>Expira em</dt><dd>${escaparHtml(tempoRestante)}</dd></div>
            </dl>
          </section>

          <section class="perfil-logout-panel">
            <div><h2>Encerrar acesso</h2><p>Saia ao terminar de usar o sistema neste dispositivo.</p></div>
            <button type="button" onclick="window._perfilLogout()" class="btn-danger perfil-button perfil-button-logout">
              <i class="fas fa-sign-out-alt" aria-hidden="true"></i> Sair do sistema
            </button>
          </section>
        </aside>
      </div>
    </main>`;

  window._perfilSalvar = () => salvarPerfil(appInstance);
  window._perfilAlterarSenha = () => modalAlterarSenha(appInstance);
  window._perfilEscolherFoto = () => document.getElementById("perfilFotoInput")?.click();
  window._perfilLogout = async () => {
    let confirmado = false;
    if (appInstance && appInstance.confirmar) {
      confirmado = await appInstance.confirmar("Deseja realmente sair do sistema?");
    } else {
      confirmado = window.confirm("Deseja realmente sair do sistema?");
    }
    if (!confirmado) return;
    if (typeof authManager !== "undefined") {
      await authManager.logout();
      if (appInstance && appInstance.route) appInstance.route();
      if (appInstance && appInstance.showToast) appInstance.showToast("Logout realizado com sucesso!", "info");
    }
  };

  const avatarImage = container.querySelector(".perfil-avatar-image");
  avatarImage?.addEventListener("error", () => {
    avatarImage.hidden = true;
    const fallback = container.querySelector(".perfil-avatar-fallback");
    if (fallback) fallback.hidden = false;
  }, { once: true });

  const apelidoInput = container.querySelector("#perfil_apelido");
  const apelidoPreview = container.querySelector("#perfilApelidoPreview");
  const atualizarPreviaApelido = () => {
    if (!apelidoPreview) return;
    const apelidoDigitado = String(apelidoInput?.value || "").trim().replace(/^GM\s+/i, "").replace(/\s+/g, " ");
    apelidoPreview.textContent = apelidoDigitado
      ? `Prévia do cabeçalho: GM ${apelidoDigitado}`
      : `Prévia do cabeçalho: ${name}`;
  };
  apelidoInput?.addEventListener("input", atualizarPreviaApelido);
  atualizarPreviaApelido();

  const telefoneInput = container.querySelector("#perfil_telefone");
  telefoneInput?.addEventListener("input", function () {
    let digits = this.value.replace(/\D/g, "").slice(0, 11);
    if (!digits) { this.value = ""; return; }
    if (digits.length <= 2) this.value = `(${digits}`;
    else if (digits.length <= 6) this.value = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    else if (digits.length <= 10) this.value = `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    else this.value = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  });

  const photoInput = container.querySelector("#perfilFotoInput");
  photoInput?.addEventListener("change", async () => {
    const file = photoInput.files?.[0];
    photoInput.value = "";
    if (file) await selecionarFotoPerfil(file, user, appInstance);
  });
}

// ============================================
// SALVAR PERFIL
// ============================================

export async function salvarPerfil(appInstance) {
  const nome = document.getElementById("perfil_nome")?.value?.trim();
  const apelido = String(document.getElementById("perfil_apelido")?.value || "").trim().replace(/^GM\s+/i, "").replace(/\s+/g, " ");
  const email = document.getElementById("perfil_email")?.value?.trim();
  const telefone = document.getElementById("perfil_telefone")?.value?.trim();

  if (!nome) {
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Nome é obrigatório", "warning");
    } else {
      showToast("Nome é obrigatório", "warning");
    }
    return;
  }

  // Validar email se foi preenchido
  if (email && !validarEmail(email)) {
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Email inválido", "warning");
    } else {
      showToast("Email inválido", "warning");
    }
    return;
  }

  if (apelido.length > 60) {
    const message = "O apelido deve ter no máximo 60 caracteres.";
    if (appInstance && appInstance.showToast) appInstance.showToast(message, "warning");
    else showToast(message, "warning");
    return;
  }
  const dados = { nome_completo: nome, apelido: apelido || null };
  if (email !== undefined && email !== "") dados.email = email;
  if (telefone !== undefined && telefone !== "") dados.telefone = telefone;


  const user = authManager.getUser();
  const result = await authManager.atualizarUsuario(user.id, dados);

  if (!result.success) {
    if (appInstance && appInstance.showToast) {
      appInstance.showToast(
        "Erro ao atualizar perfil: " + result.error,
        "error",
      );
    } else {
      showToast("Erro ao atualizar perfil: " + result.error, "error");
    }
    return;
  }

  if (appInstance && appInstance.showToast) {
    appInstance.showToast("Perfil atualizado com sucesso!", "success");
  } else {
    showToast("Perfil atualizado com sucesso!", "success");
  }

  // Atualizar header e recarregar perfil
  if (appInstance && appInstance.atualizarHeader) {
    appInstance.atualizarHeader();
  }

  // Recarregar a página de perfil
  if (appInstance && appInstance.loadPageContent) {
    appInstance.loadPageContent("perfil");
  } else {
    const container =
      document.getElementById("perfilContent") ||
      document.getElementById("page-perfil");
    if (container) renderPerfil(container, appInstance);
  }
}

// ============================================
// MODAL ALTERAR SENHA
// ============================================

export function modalAlterarSenha(appInstance) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.5);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    z-index: 999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px;
    animation: fadeIn 0.25s ease;
  `;

  overlay.innerHTML = `
    <div class="modal" style="max-width:400px;width:100%;">
      <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px 10px 16px;border-bottom:1px solid var(--cinza-claro);">
        <div class="title" style="font-size:16px;font-weight:700;color:var(--azul-bandeira);">
          <i class="fas fa-key" style="margin-right:8px;"></i>
          Alterar Senha
        </div>
        <button type="button" class="close-btn" onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--cinza-medio);padding:4px 8px;border-radius:50%;transition:all 0.3s ease;">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="modal-body" style="padding:14px 16px 4px 16px;">
        <form id="formAlterarSenha" onsubmit="event.preventDefault();">
          <div class="form-group" style="margin-bottom:14px;">
            <label for="senha_atual" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              Senha Atual <span class="required" style="color:var(--erro);">*</span>
            </label>
            <div style="position:relative;">
              <input type="password" id="senha_atual" class="form-control" placeholder="Digite sua senha atual" required style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;padding-right:40px;">
              <button type="button" onclick="togglePasswordVisibility('senha_atual')" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--cinza-medio);cursor:pointer;font-size:16px;padding:4px;">
                <i class="fas fa-eye"></i>
              </button>
            </div>
          </div>
          <div class="form-group" style="margin-bottom:14px;">
            <label for="nova_senha" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              Nova Senha <span class="required" style="color:var(--erro);">*</span>
            </label>
            <div style="position:relative;">
              <input type="password" id="nova_senha" class="form-control" placeholder="Nova senha" required minlength="6" style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;padding-right:40px;">
              <button type="button" onclick="togglePasswordVisibility('nova_senha')" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--cinza-medio);cursor:pointer;font-size:16px;padding:4px;">
                <i class="fas fa-eye"></i>
              </button>
            </div>
            <div class="input-hint" style="font-size:11px;color:var(--cinza-medio);margin-top:3px;display:flex;align-items:center;gap:4px;">
              <i class="fas fa-info-circle" style="font-size:12px;color:var(--cinza-medio);"></i>
              Mínimo 6 caracteres
            </div>
          </div>
          <div class="form-group" style="margin-bottom:14px;">
            <label for="confirmar_senha" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              Confirmar Nova Senha <span class="required" style="color:var(--erro);">*</span>
            </label>
            <div style="position:relative;">
              <input type="password" id="confirmar_senha" class="form-control" placeholder="Confirme a nova senha" required minlength="6" style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;padding-right:40px;">
              <button type="button" onclick="togglePasswordVisibility('confirmar_senha')" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--cinza-medio);cursor:pointer;font-size:16px;padding:4px;">
                <i class="fas fa-eye"></i>
              </button>
            </div>
          </div>
        </form>
      </div>
      <div class="modal-footer" style="padding:12px 16px 14px 16px;border-top:1px solid var(--cinza-claro);display:flex;flex-direction:column;gap:8px;">
        <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()" style="width:100%;padding:10px 16px;border-radius:16px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;border:none;min-height:42px;background:var(--cinza-claro);color:var(--cinza-escuro);">
          Cancelar
        </button>
        <button type="button" class="btn-primary" onclick="window._perfilConfirmarAlterarSenha()" style="width:100%;padding:10px 16px;border-radius:16px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;border:none;min-height:42px;background:var(--gradiente-principal);color:var(--branco);">
          <i class="fas fa-check" style="margin-right:6px;"></i> Alterar
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Registrar função de confirmação
  window._perfilConfirmarAlterarSenha = async function () {
    const senhaAtual = document.getElementById("senha_atual")?.value;
    const novaSenha = document.getElementById("nova_senha")?.value;
    const confirmarSenha = document.getElementById("confirmar_senha")?.value;

    if (!senhaAtual || !novaSenha || !confirmarSenha) {
      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Preencha todos os campos", "warning");
      } else {
        showToast("Preencha todos os campos", "warning");
      }
      return;
    }

    if (novaSenha.length < 6) {
      if (appInstance && appInstance.showToast) {
        appInstance.showToast(
          "A nova senha deve ter pelo menos 6 caracteres",
          "warning",
        );
      } else {
        showToast("A nova senha deve ter pelo menos 6 caracteres", "warning");
      }
      return;
    }

    if (novaSenha !== confirmarSenha) {
      if (appInstance && appInstance.showToast) {
        appInstance.showToast("As senhas não coincidem", "warning");
      } else {
        showToast("As senhas não coincidem", "warning");
      }
      return;
    }

    try {
      const user = authManager.getUser();
      const client =
        typeof supabaseClient !== "undefined"
          ? supabaseClient.getClient()
          : null;

      if (!client) {
        if (appInstance && appInstance.showToast) {
          appInstance.showToast("Erro ao conectar", "error");
        }
        return;
      }

      // Verificar senha atual
      const { data: senhaValida, error: verifyError } = await client.rpc("gm_verify_my_password", { p_password: senhaAtual });

      if (verifyError) throw verifyError;
      if (!senhaValida) {
        if (appInstance && appInstance.showToast) {
          appInstance.showToast("Senha atual incorreta", "warning");
        } else {
          showToast("Senha atual incorreta", "warning");
        }
        return;
      }

      // Persistir a senha do perfil exclusivamente pela RPC autorizada.
      const { data: hashData, error: hashError } = await client.rpc("criar_hash_senha", { p_senha: novaSenha });
      if (hashError) throw hashError;
      const { error: updateError } = await client.rpc("gm_update_my_password", { p_password_hash: hashData });
      if (updateError) throw updateError;
      // A RPC do perfil concluiu; Auth é sincronizado pelo mecanismo existente.
      const { error: authError } = await client.auth.updateUser({ password: novaSenha });
      if (authError) {
        const message = "Senha do perfil alterada, mas a senha Auth não foi sincronizada. Uma tentativa posterior de login pode falhar.";
        if (appInstance?.showToast) appInstance.showToast(message, "error");
        else showToast(message, "error");
        return;
      }
      // Fechar modal
      const modal = document.querySelector(".modal-overlay");
      if (modal) modal.remove();

      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Senha alterada com sucesso!", "success");
      } else {
        showToast("Senha alterada com sucesso!", "success");
      }
    } catch (error) {
      console.error("Erro ao alterar senha:", error);
      if (appInstance && appInstance.showToast) {
        appInstance.showToast(
          "Erro ao alterar senha: " + error.message,
          "error",
        );
      } else {
        showToast("Erro ao alterar senha: " + error.message, "error");
      }
    }
  };

  // Função para alternar visibilidade da senha
  window.togglePasswordVisibility = function (id) {
    const input = document.getElementById(id);
    const btn = input.parentElement.querySelector("button");
    const icon = btn.querySelector("i");
    if (input.type === "password") {
      input.type = "text";
      icon.className = "fas fa-eye-slash";
    } else {
      input.type = "password";
      icon.className = "fas fa-eye";
    }
  };

  // Suporte para Enter
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      window._perfilConfirmarAlterarSenha();
    }
  });
}

function escaparHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function obterUrlFotoSegura(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "wswezvcxfljzcttpqkch.supabase.co" ||
      !url.pathname.startsWith("/storage/v1/object/public/")
    ) return "";
    return url.href;
  } catch {
    return "";
  }
}

function toastPerfil(appInstance, message, type = "info") {
  if (appInstance && appInstance.showToast) appInstance.showToast(message, type);
  else showToast(message, type);
}

function converterCanvasParaBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Não foi possível processar a imagem.")), type, quality);
  });
}

async function redimensionarFotoPerfil(file) {
  if (!file.type || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Selecione uma imagem JPG, PNG ou WebP.");
  }
  if (file.size > 15 * 1024 * 1024) throw new Error("A imagem original deve ter até 15 MiB.");

  const objectUrl = URL.createObjectURL(file);
  let source;
  try {
    if (typeof createImageBitmap === "function") {
      source = await createImageBitmap(file);
    } else {
      source = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Não foi possível abrir essa imagem."));
        image.src = objectUrl;
      });
    }
    const width = source.width || source.naturalWidth;
    const height = source.height || source.naturalHeight;
    if (!width || !height) throw new Error("A imagem selecionada é inválida.");

    const square = Math.min(width, height);
    const left = (width - square) / 2;
    const top = (height - square) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Seu navegador não conseguiu processar a imagem.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 512, 512);
    context.drawImage(source, left, top, square, square, 0, 0, 512, 512);

    let blob = await converterCanvasParaBlob(canvas, "image/webp", 0.84);
    if (!blob.type || !["image/jpeg", "image/png", "image/webp"].includes(blob.type)) {
      blob = await converterCanvasParaBlob(canvas, "image/jpeg", 0.82);
    }
    if (blob.size > 1024 * 1024) blob = await converterCanvasParaBlob(canvas, blob.type, 0.68);
    if (blob.size > 1024 * 1024) blob = await converterCanvasParaBlob(canvas, blob.type, 0.5);
    if (blob.size > 1024 * 1024) throw new Error("Não foi possível reduzir a imagem para até 1 MiB.");
    return blob;
  } finally {
    if (source && typeof source.close === "function") source.close();
    URL.revokeObjectURL(objectUrl);
  }
}

async function selecionarFotoPerfil(file, user, appInstance) {
  try {
    const avatarBlob = await redimensionarFotoPerfil(file);
    abrirModalConfirmacaoFoto(avatarBlob, user, appInstance);
  } catch (error) {
    toastPerfil(appInstance, error.message || "Não foi possível processar a imagem.", "warning");
  }
}

function abrirModalConfirmacaoFoto(avatarBlob, user, appInstance) {
  document.querySelector(".perfil-upload-overlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "perfil-upload-overlay";
  overlay.setAttribute("role", "presentation");
  const previewUrl = URL.createObjectURL(avatarBlob);
  overlay.innerHTML = `
    <section class="perfil-upload-dialog" role="dialog" aria-modal="true" aria-labelledby="perfilUploadTitle">
      <button type="button" class="perfil-upload-close" aria-label="Fechar janela"><i class="fas fa-times" aria-hidden="true"></i></button>
      <div class="perfil-upload-preview"><img alt="Prévia da foto de perfil" src="${escaparHtml(previewUrl)}"></div>
      <p class="perfil-eyebrow">Confirmação de segurança</p>
      <h2 id="perfilUploadTitle">Confirmar alteração da foto</h2>
      <p class="perfil-upload-copy">Para proteger sua conta, confirme sua senha atual. Ela será validada no servidor e não será armazenada.</p>
      <label for="perfilUploadPassword">Senha atual</label>
      <div class="perfil-password-field">
        <input id="perfilUploadPassword" type="password" autocomplete="current-password" maxlength="128" required>
        <button type="button" class="perfil-password-toggle" aria-label="Mostrar senha"><i class="fas fa-eye" aria-hidden="true"></i></button>
      </div>
      <p class="perfil-upload-status" role="status" aria-live="polite">A imagem será publicada para exibição no sistema.</p>
      <div class="perfil-upload-actions">
        <button type="button" class="btn-secondary perfil-button perfil-button-outline perfil-upload-cancel">Cancelar</button>
        <button type="button" class="btn-primary perfil-button perfil-button-primary perfil-upload-submit"><i class="fas fa-cloud-upload-alt" aria-hidden="true"></i> Enviar foto</button>
      </div>
    </section>`;
  document.body.appendChild(overlay);

  const passwordInput = overlay.querySelector("#perfilUploadPassword");
  const submitButton = overlay.querySelector(".perfil-upload-submit");
  const status = overlay.querySelector(".perfil-upload-status");
  const close = () => {
    overlay.remove();
    URL.revokeObjectURL(previewUrl);
    if (window._perfilConfirmarUploadFoto === submitUpload) delete window._perfilConfirmarUploadFoto;
    if (window._perfilCancelarUploadFoto === close) delete window._perfilCancelarUploadFoto;
  };
  const submitUpload = async () => {
    const password = passwordInput.value;
    if (!password) {
      passwordInput.focus();
      status.textContent = "Digite sua senha atual para continuar.";
      return;
    }
    const currentUser = typeof authManager !== "undefined" ? authManager.getUser() : null;
    if (!currentUser?.id) {
      status.textContent = "Não foi possível confirmar a identificação da conta.";
      return;
    }

    submitButton.disabled = true;
    overlay.querySelector(".perfil-upload-cancel").disabled = true;
    passwordInput.disabled = true;
    status.textContent = "Validando sua conta e enviando a foto…";
    try {
      const client = typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
      const projectUrl = window.CONFIG?.SUPABASE_URL || client?.supabaseUrl;
      const publishableKey = window.CONFIG?.SUPABASE_ANON_KEY || client?.supabaseKey;
      if (!client || !projectUrl || !publishableKey) throw new Error("Serviço de upload indisponível.");
      const formData = new FormData();
      formData.append("password", password);
      formData.append("avatar", avatarBlob, "perfil." + (avatarBlob.type === "image/png" ? "png" : avatarBlob.type === "image/jpeg" ? "jpg" : "webp"));
      const response = await fetch(`${String(projectUrl).replace(/\/$/, "")}/functions/v1/upload-avatar`, {
        method: "POST",
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${(await client.auth.getSession()).data.session?.access_token || ""}`,
        },
        body: formData,
      });
      let data = null;
      try { data = await response.json(); } catch { /* Resposta sem JSON: erro genérico abaixo. */ }
      if (!response.ok || data?.success !== true || typeof data.avatar_url !== "string") {
        const statusCode = response.status;
        status.textContent = statusCode === 401
          ? "Senha incorreta ou conta sem permissão para alterar a foto."
          : (data?.message || "Não foi possível enviar a foto. Tente novamente.");
        submitButton.disabled = false;
        overlay.querySelector(".perfil-upload-cancel").disabled = false;
        passwordInput.disabled = false;
        passwordInput.value = "";
        passwordInput.focus();
        return;
      }

      const updatedUser = typeof authManager !== "undefined" ? authManager.getUser() : null;
      if (updatedUser && updatedUser.id === user.id) updatedUser.foto_url = data.avatar_url;

      const avatar = document.querySelector("#perfilAvatar");
      if (avatar) {
        let image = avatar.querySelector(".perfil-avatar-image");
        if (!image) {
          image = document.createElement("img");
          image.className = "perfil-avatar-image";
          image.alt = "Foto de perfil";
          image.referrerPolicy = "no-referrer";
          avatar.prepend(image);
        }
        image.src = data.avatar_url;
        image.hidden = false;
        const fallback = avatar.querySelector(".perfil-avatar-fallback");
        if (fallback) fallback.hidden = true;
      }
      if (appInstance && appInstance.atualizarHeader) appInstance.atualizarHeader();
      close();
      toastPerfil(appInstance, "Foto de perfil atualizada com sucesso.", "success");
    } catch (error) {
      status.textContent = "Falha de conexão. Confira a internet e tente novamente.";
      submitButton.disabled = false;
      overlay.querySelector(".perfil-upload-cancel").disabled = false;
      passwordInput.disabled = false;
      passwordInput.value = "";
      passwordInput.focus();
    }
  };

  window._perfilConfirmarUploadFoto = submitUpload;
  window._perfilCancelarUploadFoto = close;
  overlay.querySelector(".perfil-upload-close").addEventListener("click", close);
  overlay.querySelector(".perfil-upload-cancel").addEventListener("click", close);
  overlay.querySelector(".perfil-upload-submit").addEventListener("click", submitUpload);
  overlay.querySelector(".perfil-password-toggle").addEventListener("click", (event) => {
    const button = event.currentTarget;
    const icon = button.querySelector("i");
    passwordInput.type = passwordInput.type === "password" ? "text" : "password";
    button.setAttribute("aria-label", passwordInput.type === "password" ? "Mostrar senha" : "Ocultar senha");
    icon.className = passwordInput.type === "password" ? "fas fa-eye" : "fas fa-eye-slash";
  });
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
    if (event.key === "Enter" && event.target === passwordInput) {
      event.preventDefault();
      submitUpload();
    }
  });
  passwordInput.focus();
}

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

function formatarCPFSeguro(cpf, forceFull = false) {
  if (!cpf) return "***.***.***-**";
  const limpo = cpf.replace(/\D/g, "");
  if (limpo.length !== 11) return cpf;

  const isSupervisor =
    typeof authManager !== "undefined" && authManager.isSupervisor();
  if (isSupervisor || forceFull) {
    return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  return `***.${limpo.substring(3, 6)}.***-${limpo.substring(9, 11)}`;
}

function validarEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

function showToast(message, type = "info") {
  // Tenta usar o toast do app primeiro
  if (typeof window.app !== "undefined" && window.app.showToast) {
    window.app.showToast(message, type);
    return;
  }

  // Fallback: criar toast simples
  const container = document.getElementById("toastContainer");
  if (!container) {
    console.log(`${type}: ${message}`);
    return;
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  const cores = {
    success: "var(--verde-bandeira)",
    error: "var(--erro)",
    warning: "var(--aviso)",
    info: "var(--azul-bandeira)",
  };
  toast.style.background = cores[type] || cores.info;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("out");
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ============================================
// EXPORTAÇÕES
// ============================================

export default {
  renderPerfil,
  salvarPerfil,
  modalAlterarSenha,
};
