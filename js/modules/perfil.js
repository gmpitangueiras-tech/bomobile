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
  // Verificar se o usuário está logado
  if (typeof authManager === "undefined" || !authManager.isLoggedIn()) {
    container.innerHTML = `
      <div class="container">
        <div style="text-align:center;padding:40px 20px;color:var(--cinza-medio);">
          <div style="font-size:48px;color:var(--cinza-claro);margin-bottom:12px;">
            <i class="fas fa-user-slash"></i>
          </div>
          <p style="font-weight:500;">Usuário não autenticado</p>
          <button onclick="window.app.navigateTo('login')" class="btn-primary" style="margin-top:16px;max-width:200px;">
            Fazer Login
          </button>
        </div>
      </div>
    `;
    return;
  }

  const user = authManager.getUser();
  if (!user) {
    container.innerHTML = `<p style="color:var(--erro);">Usuário não encontrado</p>`;
    return;
  }

  const isSupervisor = authManager.isSupervisor();
  const podeEditarMatricula = isSupervisor;

  // Calcular tempo de sessão restante
  let tempoRestante = "--";
  if (
    typeof sessionManager !== "undefined" &&
    sessionManager.getTimeRemaining
  ) {
    const minutos = sessionManager.getTimeRemaining();
    if (minutos >= 60) {
      const horas = Math.floor(minutos / 60);
      const mins = minutos % 60;
      tempoRestante = `${horas}h ${mins}min`;
    } else {
      tempoRestante = `${Math.round(minutos)}min`;
    }
  }

  // Obter data do último login
  let ultimoLogin = "Nunca";
  if (user.ultimo_login) {
    try {
      const date = new Date(user.ultimo_login);
      if (!isNaN(date.getTime())) {
        ultimoLogin = date.toLocaleString("pt-BR", {
          timeZone: "America/Sao_Paulo",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
    } catch (e) {
      ultimoLogin = "Data inválida";
    }
  }

  const html = `
    <div class="container" style="padding-bottom:120px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h2 style="color:var(--azul-bandeira);margin:0;">
          <i class="fas fa-user" style="margin-right:8px;"></i>
          Meu Perfil
        </h2>
        <button onclick="window.app.navigateTo('dashboard')" class="btn-secondary" style="padding:4px 12px;font-size:12px;min-height:auto;width:auto;border-radius:8px;">
          <i class="fas fa-arrow-left"></i> Voltar
        </button>
      </div>

      <!-- Card do Perfil -->
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:20px;box-shadow:var(--sombra-media);margin-bottom:20px;text-align:center;">
        <div style="width:80px;height:80px;border-radius:50%;background:var(--gradiente-principal);color:var(--branco);display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:700;margin:0 auto 12px;box-shadow:0 4px 20px rgba(0,63,135,0.3);">
          ${user.nome_completo?.charAt(0) || "U"}
        </div>
        <h3 style="margin:0;font-size:18px;color:var(--cinza-escuro);">${user.nome_completo}</h3>
        <p style="color:var(--cinza-medio);font-size:14px;margin:4px 0;">
          <span class="badge ${user.perfil === "supervisor" ? "badge-azul" : "badge-verde"}" style="font-size:12px;padding:4px 16px;">
            ${user.perfil === "supervisor" ? "Supervisor" : "Guarda"}
          </span>
        </p>
        <p style="color:var(--cinza-medio);font-size:13px;margin:4px 0;">
          <i class="fas fa-id-card" style="margin-right:6px;"></i>
          ${user.matricula ? `Matrícula: ${user.matricula}` : "Sem matrícula"}
        </p>
        <p style="color:var(--cinza-medio);font-size:13px;margin:4px 0;">
          <i class="fas fa-id-card" style="margin-right:6px;"></i>
          ${formatarCPFSeguro(user.cpf)}
        </p>
        ${
          user.ultimo_login
            ? `
          <p style="color:var(--cinza-medio);font-size:12px;margin:4px 0;">
            <i class="fas fa-clock" style="margin-right:4px;"></i>
            Último acesso: ${ultimoLogin}
          </p>
        `
            : ""
        }
        ${
          typeof sessionManager !== "undefined"
            ? `
          <p style="color:var(--cinza-medio);font-size:12px;margin:4px 0;">
            <i class="fas fa-hourglass-half" style="margin-right:4px;"></i>
            Sessão expira em: ${tempoRestante}
          </p>
        `
            : ""
        }
      </div>

      <!-- Formulário de Edição -->
      <form id="formPerfil" style="margin-top:8px;" onsubmit="event.preventDefault();">
        <div style="background:var(--branco);border-radius:var(--border-radius);padding:16px;box-shadow:var(--sombra-suave);">
          <h4 style="color:var(--azul-bandeira);margin:0 0 16px 0;font-size:14px;">
            <i class="fas fa-edit" style="margin-right:8px;"></i>
            Editar Dados Pessoais
          </h4>

          <div class="form-group" style="margin-bottom:14px;">
            <label for="perfil_nome" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              Nome Completo <span class="required" style="color:var(--erro);">*</span>
            </label>
            <input type="text" id="perfil_nome" class="form-control" 
              value="${user.nome_completo || ""}" required
              style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;">
          </div>

          <div class="form-group" style="margin-bottom:14px;">
            <label for="perfil_cpf" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              CPF
            </label>
            <input type="text" id="perfil_cpf" class="form-control" 
              value="${formatarCPFSeguro(user.cpf, true)}" disabled
              style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:#eef2f6;color:var(--cinza-escuro);font-family:inherit;opacity:0.8;cursor:not-allowed;">
          </div>

          <div class="form-group" style="margin-bottom:14px;">
            <label for="perfil_matricula" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              Matrícula
            </label>
            <input type="text" id="perfil_matricula" class="form-control" 
              value="${user.matricula || ""}" 
              ${podeEditarMatricula ? "" : "disabled"}
              style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;${podeEditarMatricula ? "background:var(--branco);color:var(--cinza-escuro);" : "background:#eef2f6;color:var(--cinza-escuro);opacity:0.8;cursor:not-allowed;"}font-family:inherit;">
            ${
              podeEditarMatricula
                ? `
              <div class="input-hint" style="font-size:11px;color:var(--cinza-medio);margin-top:3px;display:flex;align-items:center;gap:4px;">
                <i class="fas fa-info-circle" style="font-size:12px;color:var(--cinza-medio);"></i>
                Apenas supervisores podem editar a matrícula
              </div>
            `
                : ""
            }
          </div>

          <div class="form-group" style="margin-bottom:14px;">
            <label for="perfil_email" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              Email
            </label>
            <input type="email" id="perfil_email" class="form-control" 
              value="${user.email || ""}" 
              style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;">
          </div>

          <div class="form-group" style="margin-bottom:14px;">
            <label for="perfil_telefone" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              Telefone
            </label>
            <input type="text" id="perfil_telefone" class="form-control" 
              value="${user.telefone || ""}" 
              style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;">
          </div>

          <div class="form-group" style="margin-bottom:14px;">
            <label for="perfil_perfil" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              Perfil
            </label>
            <input type="text" id="perfil_perfil" class="form-control" 
              value="${user.perfil === "supervisor" ? "Supervisor" : "Guarda"}" disabled
              style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:#eef2f6;color:var(--cinza-escuro);font-family:inherit;opacity:0.8;cursor:not-allowed;">
          </div>

          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;">
            <button type="button" onclick="window._perfilSalvar()" class="btn-primary" style="flex:1;border-radius:12px;">
              <i class="fas fa-save" style="margin-right:6px;"></i> Salvar Alterações
            </button>
            <button type="button" onclick="window._perfilAlterarSenha()" class="btn-secondary" style="flex:1;border-radius:12px;background:var(--azul-muito-claro);color:var(--azul-bandeira);border:1px solid var(--azul-bandeira);">
              <i class="fas fa-key" style="margin-right:6px;"></i> Alterar Senha
            </button>
          </div>
        </div>
      </form>

      <!-- Opção de logout -->
      <div style="margin-top:16px;">
        <button onclick="window._perfilLogout()" class="btn-danger" style="border-radius:12px;">
          <i class="fas fa-sign-out-alt" style="margin-right:6px;"></i> 
          Sair do Sistema
        </button>
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Registrar funções no escopo global
  window._perfilSalvar = () => salvarPerfil(appInstance);
  window._perfilAlterarSenha = () => modalAlterarSenha(appInstance);
  window._perfilLogout = async () => {
    if (appInstance && appInstance.confirmar) {
      const confirmado = await appInstance.confirmar(
        "Deseja realmente sair do sistema?",
      );
      if (!confirmado) return;
    } else {
      if (!confirm("Deseja realmente sair do sistema?")) return;
    }
    if (typeof authManager !== "undefined") {
      await authManager.logout();
      if (appInstance && appInstance.route) {
        appInstance.route();
      }
      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Logout realizado com sucesso!", "info");
      }
    }
  };

  // Máscara de telefone
  const telefoneInput = document.getElementById("perfil_telefone");
  if (telefoneInput) {
    telefoneInput.addEventListener("input", function (e) {
      let value = this.value.replace(/\D/g, "");
      if (value.length > 11) value = value.slice(0, 11);
      if (value.length > 0) {
        if (value.length <= 2) {
          this.value = `(${value}`;
        } else if (value.length <= 6) {
          this.value = `(${value.slice(0, 2)}) ${value.slice(2)}`;
        } else if (value.length <= 10) {
          this.value = `(${value.slice(0, 2)}) ${value.slice(2, 6)}-${value.slice(6)}`;
        } else {
          this.value = `(${value.slice(0, 2)}) ${value.slice(2, 7)}-${value.slice(7, 11)}`;
        }
      }
    });
  }
}

// ============================================
// SALVAR PERFIL
// ============================================

export async function salvarPerfil(appInstance) {
  const nome = document.getElementById("perfil_nome")?.value?.trim();
  const email = document.getElementById("perfil_email")?.value?.trim();
  const telefone = document.getElementById("perfil_telefone")?.value?.trim();
  const matricula = document.getElementById("perfil_matricula")?.value?.trim();

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

  const dados = { nome_completo: nome };
  if (email !== undefined && email !== "") dados.email = email;
  if (telefone !== undefined && telefone !== "") dados.telefone = telefone;

  // Apenas supervisor pode editar matrícula
  if (authManager.isSupervisor() && matricula !== undefined) {
    dados.matricula = matricula;
  }

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
      const { data: senhaValida } = await client.rpc("verificar_senha", {
        p_cpf: user.cpf,
        p_senha: senhaAtual,
      });

      if (!senhaValida) {
        if (appInstance && appInstance.showToast) {
          appInstance.showToast("Senha atual incorreta", "warning");
        } else {
          showToast("Senha atual incorreta", "warning");
        }
        return;
      }

      // Gerar hash da nova senha
      const { data: hashData } = await client.rpc("criar_hash_senha", {
        p_senha: novaSenha,
      });

      // Atualizar senha
      const result = await authManager.atualizarUsuario(user.id, {
        senha_hash: hashData,
        primeiro_acesso: false,
        status: "ativo",
      });

      if (!result.success) {
        if (appInstance && appInstance.showToast) {
          appInstance.showToast(
            "Erro ao alterar senha: " + result.error,
            "error",
          );
        } else {
          showToast("Erro ao alterar senha: " + result.error, "error");
        }
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
  toast.innerHTML = message;
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
