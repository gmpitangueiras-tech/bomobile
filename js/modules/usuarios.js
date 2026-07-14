/**
 * MÓDULO USUÁRIOS - Gerenciamento de Usuários
 * Guarda Municipal de Pitangueiras - PR
 *
 * Este módulo gerencia:
 * - Listagem de usuários com filtros
 * - Criação de novos usuários (supervisor)
 * - Edição de usuários (supervisor ou próprio perfil)
 * - Ativação/Desativação de usuários
 * - Reset de senha
 * - Visualização de logs por usuário
 * - Gerenciamento de perfil próprio
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
// ESTADO DO MÓDULO
// ============================================

let estado = {
  filtroSearch: "",
  usuariosCache: [],
  usuariosFiltrados: [],
};

// ============================================
// FUNÇÕES PRINCIPAIS
// ============================================

/**
 * Renderiza a página de gerenciamento de usuários
 * @param {HTMLElement} container - Elemento onde renderizar
 * @param {Object} appInstance - Instância do app
 */
export async function renderUsuarios(container, appInstance) {
  // Verificar permissão
  if (typeof authManager === "undefined" || !authManager.isSupervisor()) {
    container.innerHTML = renderAcessoNegado(appInstance);
    return;
  }

  // Mostrar loader
  container.innerHTML = `
    <div class="container" style="text-align:center;padding:40px 20px;">
      <div class="spinner-azul" style="margin:0 auto;"></div>
      <p style="margin-top:12px;color:var(--cinza-medio);">Carregando usuários...</p>
    </div>
  `;

  try {
    // Buscar usuários
    const result = await authManager.listarUsuarios({
      search: estado.filtroSearch || "",
    });

    if (!result.success) {
      container.innerHTML = `
        <div class="container">
          <h2 style="color:var(--azul-bandeira);">
            <i class="fas fa-users" style="margin-right:8px;"></i>
            Gerenciar Usuários
          </h2>
          <p style="color:var(--erro);">Erro ao carregar usuários: ${result.error}</p>
          <button onclick="window._usuariosRecarregar()" class="btn-primary" style="margin-top:16px;max-width:200px;">
            Tentar novamente
          </button>
        </div>
      `;
      return;
    }

    estado.usuariosCache = result.data || [];
    estado.usuariosFiltrados = estado.usuariosCache;

    renderizarListaUsuarios(container, appInstance);

    // Registrar funções no escopo global
    window._usuariosRecarregar = () => renderUsuarios(container, appInstance);
    window._usuariosFiltrar = () =>
      aplicarFiltroUsuarios(container, appInstance);
    window._usuariosLimparFiltro = () =>
      limparFiltroUsuarios(container, appInstance);
    window._usuariosCriar = () => modalCriarUsuario(appInstance);
    window._usuariosEditar = (id) => modalEditarUsuario(id, appInstance);
    window._usuariosToggleStatus = (id) => toggleStatusUsuario(id, appInstance);
    window._usuariosResetSenha = (id) => resetarSenhaUsuario(id, appInstance);
    window._usuariosVerLogs = (id) => verLogsUsuario(id, appInstance);
  } catch (error) {
    console.error("Erro ao renderizar usuários:", error);
    container.innerHTML = `
      <div class="container">
        <h2 style="color:var(--azul-bandeira);">
          <i class="fas fa-users" style="margin-right:8px;"></i>
          Gerenciar Usuários
        </h2>
        <p style="color:var(--erro);">Erro ao carregar: ${error.message}</p>
        <button onclick="window._usuariosRecarregar()" class="btn-primary" style="margin-top:16px;max-width:200px;">
          Tentar novamente
        </button>
      </div>
    `;
  }
}

// ============================================
// RENDERIZAÇÃO DA LISTA DE USUÁRIOS
// ============================================

function renderizarListaUsuarios(container, appInstance) {
  const usuarios = estado.usuariosFiltrados;
  const totalUsuarios = estado.usuariosCache.length;
  const filtroAtivo = estado.filtroSearch && estado.filtroSearch.trim() !== "";

  let html = `
    <div class="container" style="padding-bottom:120px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
        <div>
          <h2 style="color:var(--azul-bandeira);margin:0;">
            <i class="fas fa-users" style="margin-right:8px;"></i>
            Gerenciar Usuários
          </h2>
          <p style="color:var(--cinza-medio);margin-top:4px;font-size:14px;">
            ${totalUsuarios} usuário(s) cadastrado(s)
            ${filtroAtivo ? ` <span style="color:var(--azul-bandeira);">(filtrado: ${usuarios.length})</span>` : ""}
          </p>
        </div>
        <button onclick="window._usuariosCriar()" class="btn-primary" style="padding:8px 16px;font-size:13px;min-height:auto;width:auto;border-radius:12px;">
          <i class="fas fa-plus" style="margin-right:4px;"></i> Novo
        </button>
      </div>

      <!-- Filtro de busca -->
      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
        <input type="text" id="filtroSearchUser" placeholder="Buscar por nome, CPF ou matrícula..." 
          value="${estado.filtroSearch || ""}"
          style="flex:1;min-width:150px;padding:8px 12px;border:2px solid var(--cinza-claro);border-radius:var(--border-radius);font-size:14px;background:var(--branco-fumaca);"
          onkeydown="if(event.key==='Enter') window._usuariosFiltrar()">
        <button onclick="window._usuariosFiltrar()" class="btn-primary" style="padding:6px 14px;font-size:12px;min-height:auto;width:auto;border-radius:8px;">
          <i class="fas fa-search"></i>
        </button>
        <button onclick="window._usuariosLimparFiltro()" class="btn-secondary" style="padding:6px 14px;font-size:12px;min-height:auto;width:auto;border-radius:8px;">
          <i class="fas fa-undo"></i>
        </button>
      </div>

      <!-- Tabela de usuários -->
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);overflow-x:auto;">
        <div class="table-wrapper">
          <table style="width:100%;font-size:12px;border-collapse:collapse;">
            <thead>
              <tr style="background:var(--cinza-claro);">
                <th style="padding:8px 10px;text-align:left;">Nome</th>
                <th style="padding:8px 10px;text-align:left;">Matrícula</th>
                <th style="padding:8px 10px;text-align:center;">Perfil</th>
                <th style="padding:8px 10px;text-align:center;">Status</th>
                <th style="padding:8px 10px;text-align:center;">Ações</th>
              </tr>
            </thead>
            <tbody>
  `;

  if (usuarios.length === 0) {
    html += `
      <tr>
        <td colspan="5" style="padding:30px;text-align:center;color:var(--cinza-medio);">
          <i class="fas fa-search" style="font-size:24px;display:block;margin-bottom:8px;opacity:0.3;"></i>
          ${filtroAtivo ? "Nenhum usuário encontrado com este filtro" : "Nenhum usuário cadastrado"}
          ${filtroAtivo ? `<br><button onclick="window._usuariosLimparFiltro()" class="btn-secondary" style="margin-top:8px;padding:4px 12px;font-size:12px;min-height:auto;width:auto;">Limpar Filtro</button>` : ""}
        </td>
      </tr>
    `;
  } else {
    usuarios.forEach((user) => {
      const statusClass =
        user.status === "ativo"
          ? "synced"
          : user.status === "inativo"
            ? "cancelled"
            : user.status === "bloqueado"
              ? "error"
              : "draft";

      const statusLabel =
        user.status === "ativo"
          ? "Ativo"
          : user.status === "inativo"
            ? "Inativo"
            : user.status === "bloqueado"
              ? "Bloqueado"
              : user.status === "primeiro_acesso"
                ? "Primeiro Acesso"
                : user.status;

      const perfilLabel =
        user.perfil === "supervisor" ? "Supervisor" : "Guarda";
      const ehAtual = user.id === authManager.getUserId();
      const cpfExibido = formatarCPFSeguro(user.cpf);

      html += `
        <tr style="border-bottom:1px solid var(--cinza-claro);">
          <td style="padding:8px 10px;">
            <div style="font-weight:500;">${user.nome_completo}</div>
            <div style="font-size:10px;color:var(--cinza-medio);">${cpfExibido}</div>
          </td>
          <td style="padding:8px 10px;">${user.matricula || "-"}</td>
          <td style="padding:8px 10px;text-align:center;">
            <span class="badge ${user.perfil === "supervisor" ? "badge-azul" : "badge-verde"}">${perfilLabel}</span>
          </td>
          <td style="padding:8px 10px;text-align:center;">
            <span class="badge badge-${statusClass}">${statusLabel}</span>
          </td>
          <td style="padding:8px 10px;">
            <div style="display:flex;gap:4px;justify-content:center;flex-wrap:wrap;">
              <button onclick="window._usuariosEditar('${user.id}')" class="btn-secondary info" title="Editar" style="padding:4px 8px;font-size:12px;min-height:auto;width:auto;border-radius:6px;">
                <i class="fas fa-edit"></i>
              </button>
              <button onclick="window._usuariosToggleStatus('${user.id}')" class="btn-secondary ${user.status === "ativo" ? "danger" : "success"}" title="${user.status === "ativo" ? "Desativar" : "Ativar"}" style="padding:4px 8px;font-size:12px;min-height:auto;width:auto;border-radius:6px;">
                <i class="fas ${user.status === "ativo" ? "fa-user-slash" : "fa-user-check"}"></i>
              </button>
              ${
                !ehAtual
                  ? `
                <button onclick="window._usuariosResetSenha('${user.id}')" class="btn-secondary warning" title="Resetar senha" style="padding:4px 8px;font-size:12px;min-height:auto;width:auto;border-radius:6px;">
                  <i class="fas fa-key"></i>
                </button>
              `
                  : ""
              }
              <button onclick="window._usuariosVerLogs('${user.id}')" class="btn-secondary info" title="Ver logs" style="padding:4px 8px;font-size:12px;min-height:auto;width:auto;border-radius:6px;">
                <i class="fas fa-history"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    });
  }

  html += `
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

// ============================================
// FILTROS
// ============================================

export function aplicarFiltroUsuarios(container, appInstance) {
  const search = document.getElementById("filtroSearchUser")?.value || "";
  estado.filtroSearch = search.trim();
  renderUsuarios(container, appInstance);
}

export function limparFiltroUsuarios(container, appInstance) {
  estado.filtroSearch = "";
  const input = document.getElementById("filtroSearchUser");
  if (input) input.value = "";
  renderUsuarios(container, appInstance);
}

// ============================================
// MODAL CRIAR USUÁRIO
// ============================================

export function modalCriarUsuario(appInstance) {
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
    <div class="modal" style="max-width:500px;width:100%;max-height:95vh;overflow-y:auto;">
      <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px 10px 16px;border-bottom:1px solid var(--cinza-claro);position:sticky;top:0;background:var(--branco);border-radius:20px 20px 0 0;z-index:1;">
        <div class="title" style="font-size:16px;font-weight:700;color:var(--azul-bandeira);">
          <i class="fas fa-user-plus" style="margin-right:8px;"></i>
          Criar Usuário
        </div>
        <button type="button" class="close-btn" onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--cinza-medio);padding:4px 8px;border-radius:50%;transition:all 0.3s ease;">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="modal-body" style="padding:14px 16px 4px 16px;">
        <form id="formCriarUsuario" onsubmit="event.preventDefault();">
          <div class="form-group" style="margin-bottom:14px;">
            <label for="new_nome" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              Nome Completo <span class="required" style="color:var(--erro);">*</span>
            </label>
            <input type="text" id="new_nome" class="form-control" placeholder="Nome completo" required style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;">
          </div>
          <div class="form-group" style="margin-bottom:14px;">
            <label for="new_cpf" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              CPF <span class="required" style="color:var(--erro);">*</span>
            </label>
            <input type="text" id="new_cpf" class="form-control" placeholder="123.456.789-00" required maxlength="14" style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;">
          </div>
          <div class="form-group" style="margin-bottom:14px;">
            <label for="new_matricula" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              Matrícula
            </label>
            <input type="text" id="new_matricula" class="form-control" placeholder="Matrícula" style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;">
          </div>
          <div class="form-group" style="margin-bottom:14px;">
            <label for="new_email" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              Email
            </label>
            <input type="email" id="new_email" class="form-control" placeholder="email@exemplo.com" style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;">
          </div>
          <div class="form-group" style="margin-bottom:14px;">
            <label for="new_telefone" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              Telefone
            </label>
            <input type="text" id="new_telefone" class="form-control" placeholder="(44) 99999-9999" style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;">
          </div>
          <div class="form-group" style="margin-bottom:14px;">
            <label for="new_perfil" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              Perfil <span class="required" style="color:var(--erro);">*</span>
            </label>
            <select id="new_perfil" class="form-control" required style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;appearance:none;-webkit-appearance:none;background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2364758B' d='M6 8L1 3h10z'/%3E%3C/svg%3E\");background-repeat:no-repeat;background-position:right 10px center;padding-right:32px;cursor:pointer;">
              <option value="guarda">Guarda</option>
              <option value="supervisor">Supervisor</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:14px;">
            <label for="new_senha" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              Senha (opcional)
            </label>
            <input type="text" id="new_senha" class="form-control" placeholder="Deixe em branco para gerar automática" style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;">
            <div class="input-hint" style="font-size:11px;color:var(--cinza-medio);margin-top:3px;display:flex;align-items:center;gap:4px;">
              <i class="fas fa-info-circle" style="font-size:12px;color:var(--cinza-medio);"></i>
              Se não preencher, uma senha temporária será gerada
            </div>
          </div>
        </form>
      </div>
      <div class="modal-footer" style="padding:12px 16px 14px 16px;border-top:1px solid var(--cinza-claro);display:flex;flex-direction:column;gap:8px;position:sticky;bottom:0;background:var(--branco);border-radius:0 0 20px 20px;">
        <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()" style="width:100%;padding:10px 16px;border-radius:16px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;border:none;min-height:42px;background:var(--cinza-claro);color:var(--cinza-escuro);">
          Cancelar
        </button>
        <button type="button" class="btn-primary" onclick="window._confirmarCriarUsuario()" style="width:100%;padding:10px 16px;border-radius:16px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;border:none;min-height:42px;background:var(--gradiente-principal);color:var(--branco);">
          <i class="fas fa-save" style="margin-right:6px;"></i> Criar
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Máscara de CPF
  const cpfInput = document.getElementById("new_cpf");
  if (cpfInput) {
    cpfInput.addEventListener("input", function (e) {
      let value = this.value.replace(/\D/g, "");
      if (value.length > 11) value = value.slice(0, 11);
      if (value.length > 0) {
        this.value = value.replace(
          /(\d{3})(\d{3})(\d{3})(\d{2})/,
          "$1.$2.$3-$4",
        );
        if (value.length <= 3) this.value = value;
        else if (value.length <= 6)
          this.value = value.replace(/(\d{3})(\d{1,3})/, "$1.$2");
        else if (value.length <= 9)
          this.value = value.replace(/(\d{3})(\d{3})(\d{1,3})/, "$1.$2.$3");
      }
    });
  }

  // Máscara de telefone
  const telefoneInput = document.getElementById("new_telefone");
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

  // Registrar função de confirmação
  window._confirmarCriarUsuario = async function () {
    const nome = document.getElementById("new_nome")?.value?.trim();
    const cpf = document.getElementById("new_cpf")?.value?.trim();
    const matricula = document.getElementById("new_matricula")?.value?.trim();
    const email = document.getElementById("new_email")?.value?.trim();
    const telefone = document.getElementById("new_telefone")?.value?.trim();
    const perfil = document.getElementById("new_perfil")?.value;
    const senha = document.getElementById("new_senha")?.value?.trim();

    if (!nome || !cpf) {
      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Preencha nome e CPF", "warning");
      } else {
        showToast("Preencha nome e CPF", "warning");
      }
      return;
    }

    // Validar CPF
    if (!validarCPF(cpf)) {
      if (appInstance && appInstance.showToast) {
        appInstance.showToast("CPF inválido", "warning");
      } else {
        showToast("CPF inválido", "warning");
      }
      return;
    }

    const result = await authManager.criarUsuario({
      nome,
      cpf,
      matricula,
      email,
      telefone,
      perfil,
      senha: senha || undefined,
    });

    if (!result.success) {
      if (appInstance && appInstance.showToast) {
        appInstance.showToast(
          "Erro ao criar usuário: " + result.error,
          "error",
        );
      } else {
        showToast("Erro ao criar usuário: " + result.error, "error");
      }
      return;
    }

    const modal = document.querySelector(".modal-overlay");
    if (modal) modal.remove();

    let msg = "Usuário criado com sucesso!";
    if (result.senha_temporaria) {
      msg += ` Senha temporária: ${result.senha_temporaria}`;
    }

    if (appInstance && appInstance.showToast) {
      appInstance.showToast(msg, "success");
    } else {
      showToast(msg, "success");
    }

    // Recarregar a lista
    renderUsuarios(
      document.getElementById("page-usuarios") ||
        document.getElementById("usuariosContent"),
      appInstance,
    );
  };
}

// ============================================
// MODAL EDITAR USUÁRIO
// ============================================

export async function modalEditarUsuario(id, appInstance) {
  try {
    // Buscar dados do usuário
    const result = await authManager.listarUsuarios({ search: "" });
    if (!result.success) {
      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Erro ao carregar dados do usuário", "error");
      }
      return;
    }

    const user = result.data.find((u) => u.id === id);
    if (!user) {
      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Usuário não encontrado", "error");
      }
      return;
    }

    const isSelf = user.id === authManager.getUserId();
    const isSupervisor = authManager.isSupervisor();

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
      <div class="modal" style="max-width:500px;width:100%;max-height:95vh;overflow-y:auto;">
        <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px 10px 16px;border-bottom:1px solid var(--cinza-claro);position:sticky;top:0;background:var(--branco);border-radius:20px 20px 0 0;z-index:1;">
          <div class="title" style="font-size:16px;font-weight:700;color:var(--azul-bandeira);">
            <i class="fas fa-user-edit" style="margin-right:8px;"></i>
            Editar Usuário
          </div>
          <button type="button" class="close-btn" onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--cinza-medio);padding:4px 8px;border-radius:50%;transition:all 0.3s ease;">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body" style="padding:14px 16px 4px 16px;">
          <form id="formEditarUsuario" onsubmit="event.preventDefault();">
            <div class="form-group" style="margin-bottom:14px;">
              <label for="edit_nome" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
                Nome Completo <span class="required" style="color:var(--erro);">*</span>
              </label>
              <input type="text" id="edit_nome" class="form-control" value="${user.nome_completo || ""}" required style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;">
            </div>
            <div class="form-group" style="margin-bottom:14px;">
              <label for="edit_cpf" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
                CPF
              </label>
              <input type="text" id="edit_cpf" class="form-control" value="${formatarCPFSeguro(user.cpf, true)}" disabled style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:#eef2f6;color:var(--cinza-escuro);font-family:inherit;opacity:0.8;cursor:not-allowed;">
            </div>
            ${
              isSupervisor
                ? `
              <div class="form-group" style="margin-bottom:14px;">
                <label for="edit_matricula" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
                  Matrícula
                </label>
                <input type="text" id="edit_matricula" class="form-control" value="${user.matricula || ""}" style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;">
              </div>
              <div class="form-group" style="margin-bottom:14px;">
                <label for="edit_perfil" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
                  Perfil
                </label>
                <select id="edit_perfil" class="form-control" style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;appearance:none;-webkit-appearance:none;background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2364758B' d='M6 8L1 3h10z'/%3E%3C/svg%3E\");background-repeat:no-repeat;background-position:right 10px center;padding-right:32px;cursor:pointer;">
                  <option value="guarda" ${user.perfil === "guarda" ? "selected" : ""}>Guarda</option>
                  <option value="supervisor" ${user.perfil === "supervisor" ? "selected" : ""}>Supervisor</option>
                </select>
              </div>
            `
                : `
              <div class="form-group" style="margin-bottom:14px;">
                <label style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
                  Matrícula
                </label>
                <input type="text" class="form-control" value="${user.matricula || ""}" disabled style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:#eef2f6;color:var(--cinza-escuro);font-family:inherit;opacity:0.8;cursor:not-allowed;">
              </div>
              <div class="form-group" style="margin-bottom:14px;">
                <label style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
                  Perfil
                </label>
                <input type="text" class="form-control" value="${user.perfil === "supervisor" ? "Supervisor" : "Guarda"}" disabled style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:#eef2f6;color:var(--cinza-escuro);font-family:inherit;opacity:0.8;cursor:not-allowed;">
              </div>
            `
            }
            <div class="form-group" style="margin-bottom:14px;">
              <label for="edit_email" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
                Email
              </label>
              <input type="email" id="edit_email" class="form-control" value="${user.email || ""}" style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;">
            </div>
            <div class="form-group" style="margin-bottom:14px;">
              <label for="edit_telefone" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
                Telefone
              </label>
              <input type="text" id="edit_telefone" class="form-control" value="${user.telefone || ""}" style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;">
            </div>
            ${
              isSupervisor && !isSelf
                ? `
              <div class="form-group" style="margin-bottom:14px;">
                <label for="edit_status" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
                  Status
                </label>
                <select id="edit_status" class="form-control" style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;appearance:none;-webkit-appearance:none;background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2364758B' d='M6 8L1 3h10z'/%3E%3C/svg%3E\");background-repeat:no-repeat;background-position:right 10px center;padding-right:32px;cursor:pointer;">
                  <option value="ativo" ${user.status === "ativo" ? "selected" : ""}>Ativo</option>
                  <option value="inativo" ${user.status === "inativo" ? "selected" : ""}>Inativo</option>
                  <option value="bloqueado" ${user.status === "bloqueado" ? "selected" : ""}>Bloqueado</option>
                </select>
              </div>
            `
                : `
              <div class="form-group" style="margin-bottom:14px;">
                <label style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
                  Status
                </label>
                <input type="text" class="form-control" value="${user.status === "ativo" ? "Ativo" : user.status === "inativo" ? "Inativo" : user.status === "bloqueado" ? "Bloqueado" : user.status}" disabled style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:#eef2f6;color:var(--cinza-escuro);font-family:inherit;opacity:0.8;cursor:not-allowed;">
              </div>
            `
            }
          </form>
        </div>
        <div class="modal-footer" style="padding:12px 16px 14px 16px;border-top:1px solid var(--cinza-claro);display:flex;flex-direction:column;gap:8px;position:sticky;bottom:0;background:var(--branco);border-radius:0 0 20px 20px;">
          <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()" style="width:100%;padding:10px 16px;border-radius:16px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;border:none;min-height:42px;background:var(--cinza-claro);color:var(--cinza-escuro);">
            Cancelar
          </button>
          <button type="button" class="btn-primary" onclick="window._confirmarEditarUsuario('${id}')" style="width:100%;padding:10px 16px;border-radius:16px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;border:none;min-height:42px;background:var(--gradiente-principal);color:var(--branco);">
            <i class="fas fa-save" style="margin-right:6px;"></i> Salvar
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Máscara de telefone no modal de edição
    const telefoneEdit = document.getElementById("edit_telefone");
    if (telefoneEdit) {
      telefoneEdit.addEventListener("input", function (e) {
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

    // Registrar função de confirmação de edição
    window._confirmarEditarUsuario = async function (userId) {
      const nome = document.getElementById("edit_nome")?.value?.trim();
      const email = document.getElementById("edit_email")?.value?.trim();
      const telefone = document.getElementById("edit_telefone")?.value?.trim();

      if (!nome) {
        if (appInstance && appInstance.showToast) {
          appInstance.showToast("Nome é obrigatório", "warning");
        } else {
          showToast("Nome é obrigatório", "warning");
        }
        return;
      }

      const dados = { nome_completo: nome };
      if (email !== undefined) dados.email = email;
      if (telefone !== undefined) dados.telefone = telefone;

      // Se for supervisor e não estiver editando a si mesmo, permite editar mais campos
      if (authManager.isSupervisor() && userId !== authManager.getUserId()) {
        const matricula = document
          .getElementById("edit_matricula")
          ?.value?.trim();
        const perfil = document.getElementById("edit_perfil")?.value;
        const status = document.getElementById("edit_status")?.value;

        if (matricula !== undefined) dados.matricula = matricula;
        if (perfil !== undefined) dados.perfil = perfil;
        if (status !== undefined) dados.status = status;
      }

      const result = await authManager.atualizarUsuario(userId, dados);

      if (!result.success) {
        if (appInstance && appInstance.showToast) {
          appInstance.showToast("Erro ao atualizar: " + result.error, "error");
        } else {
          showToast("Erro ao atualizar: " + result.error, "error");
        }
        return;
      }

      const modal = document.querySelector(".modal-overlay");
      if (modal) modal.remove();

      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Usuário atualizado com sucesso!", "success");
      } else {
        showToast("Usuário atualizado com sucesso!", "success");
      }

      // Se atualizou a si mesmo, atualizar o header
      if (
        userId === authManager.getUserId() &&
        appInstance &&
        appInstance.atualizarHeader
      ) {
        appInstance.atualizarHeader();
      }

      // Recarregar a lista
      renderUsuarios(
        document.getElementById("page-usuarios") ||
          document.getElementById("usuariosContent"),
        appInstance,
      );
    };
  } catch (error) {
    console.error("Erro ao abrir modal de edição:", error);
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Erro ao carregar dados do usuário", "error");
    }
  }
}

// ============================================
// TOGGLE STATUS DO USUÁRIO
// ============================================

export async function toggleStatusUsuario(id, appInstance) {
  try {
    const result = await authManager.listarUsuarios({ search: "" });
    if (!result.success) {
      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Erro ao carregar dados", "error");
      }
      return;
    }

    const user = result.data.find((u) => u.id === id);
    if (!user) {
      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Usuário não encontrado", "error");
      }
      return;
    }

    const novoStatus = user.status === "ativo" ? "inativo" : "ativo";
    const acao = novoStatus === "ativo" ? "ativar" : "desativar";

    // Confirmar com o usuário
    const confirmado = await confirmarModal(
      `Deseja ${acao} o usuário "${user.nome_completo}"?`,
      `Confirmar ${acao === "ativar" ? "Ativação" : "Desativação"}`,
    );

    if (!confirmado) return;

    const res = await authManager.ativarDesativarUsuario(id, novoStatus);

    if (!res.success) {
      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Erro: " + res.error, "error");
      } else {
        showToast("Erro: " + res.error, "error");
      }
      return;
    }

    if (appInstance && appInstance.showToast) {
      appInstance.showToast(
        `Usuário ${acao === "ativar" ? "ativado" : "desativado"} com sucesso!`,
        "success",
      );
    } else {
      showToast(
        `Usuário ${acao === "ativar" ? "ativado" : "desativado"} com sucesso!`,
        "success",
      );
    }

    // Recarregar a lista
    renderUsuarios(
      document.getElementById("page-usuarios") ||
        document.getElementById("usuariosContent"),
      appInstance,
    );
  } catch (error) {
    console.error("Erro ao alterar status:", error);
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Erro ao alterar status", "error");
    }
  }
}

// ============================================
// RESETAR SENHA DO USUÁRIO
// ============================================

export async function resetarSenhaUsuario(id, appInstance) {
  try {
    const result = await authManager.listarUsuarios({ search: "" });
    if (!result.success) {
      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Erro ao carregar dados", "error");
      }
      return;
    }

    const user = result.data.find((u) => u.id === id);
    if (!user) {
      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Usuário não encontrado", "error");
      }
      return;
    }

    const confirmado = await confirmarModal(
      `Deseja resetar a senha do usuário "${user.nome_completo}"?\n\nUma nova senha temporária será gerada.`,
      "Resetar Senha",
    );

    if (!confirmado) return;

    const res = await authManager.resetarSenha(id);

    if (!res.success) {
      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Erro ao resetar senha: " + res.error, "error");
      } else {
        showToast("Erro ao resetar senha: " + res.error, "error");
      }
      return;
    }

    if (appInstance && appInstance.showToast) {
      appInstance.showToast(
        `Senha resetada! Senha temporária: ${res.senha_temporaria}`,
        "success",
      );
    } else {
      showToast(
        `Senha resetada! Senha temporária: ${res.senha_temporaria}`,
        "success",
      );
    }

    // Recarregar a lista
    renderUsuarios(
      document.getElementById("page-usuarios") ||
        document.getElementById("usuariosContent"),
      appInstance,
    );
  } catch (error) {
    console.error("Erro ao resetar senha:", error);
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Erro ao resetar senha", "error");
    }
  }
}

// ============================================
// VER LOGS DO USUÁRIO
// ============================================

export async function verLogsUsuario(id, appInstance) {
  try {
    const result = await authManager.listarLogsAcesso({
      usuario_id: id,
      limit: 50,
    });

    if (!result.success) {
      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Erro ao carregar logs", "error");
      }
      return;
    }

    const logs = result.data || [];

    // Buscar nome do usuário
    const userResult = await authManager.listarUsuarios({ search: "" });
    let nomeUsuario = "Usuário";
    if (userResult.success) {
      const user = userResult.data.find((u) => u.id === id);
      if (user) nomeUsuario = user.nome_completo;
    }

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

    let logsHTML = "";
    if (logs.length === 0) {
      logsHTML = `
        <p style="color:var(--cinza-medio);text-align:center;padding:20px;">
          <i class="fas fa-info-circle" style="font-size:24px;display:block;margin-bottom:8px;opacity:0.3;"></i>
          Nenhum log encontrado para este usuário
        </p>
      `;
    } else {
      logsHTML = `
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:var(--cinza-claro);">
              <th style="padding:6px 8px;text-align:left;">Data/Hora</th>
              <th style="padding:6px 8px;text-align:left;">Ação</th>
              <th style="padding:6px 8px;text-align:left;">IP</th>
            </tr>
          </thead>
          <tbody>
            ${logs
              .map(
                (log) => `
              <tr style="border-bottom:1px solid var(--cinza-claro);">
                <td style="padding:6px 8px;font-size:11px;color:var(--cinza-medio);">
                  ${formatarDataHoraLocal(log.data_hora)}
                </td>
                <td style="padding:6px 8px;">
                  <span class="badge ${getLogBadgeClass(log.acao)}" style="font-size:9px;padding:2px 8px;">
                    ${getLogLabel(log.acao)}
                  </span>
                </td>
                <td style="padding:6px 8px;font-size:11px;color:var(--cinza-medio);">${log.ip || "-"}</td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      `;
    }

    overlay.innerHTML = `
      <div class="modal" style="max-width:600px;width:100%;max-height:95vh;overflow-y:auto;">
        <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px 10px 16px;border-bottom:1px solid var(--cinza-claro);position:sticky;top:0;background:var(--branco);border-radius:20px 20px 0 0;z-index:1;">
          <div class="title" style="font-size:16px;font-weight:700;color:var(--azul-bandeira);">
            <i class="fas fa-history" style="margin-right:8px;"></i>
            Logs de Acesso - ${nomeUsuario}
          </div>
          <button type="button" class="close-btn" onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--cinza-medio);padding:4px 8px;border-radius:50%;transition:all 0.3s ease;">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body" style="padding:14px 16px 4px 16px;max-height:60vh;overflow-y:auto;">
          ${logsHTML}
          ${logs.length > 0 ? `<p style="font-size:11px;color:var(--cinza-medio);text-align:right;margin-top:8px;">${logs.length} registro(s) encontrado(s)</p>` : ""}
        </div>
        <div class="modal-footer" style="padding:12px 16px 14px 16px;border-top:1px solid var(--cinza-claro);display:flex;flex-direction:column;gap:8px;position:sticky;bottom:0;background:var(--branco);border-radius:0 0 20px 20px;">
          <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()" style="width:100%;padding:10px 16px;border-radius:16px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;border:none;min-height:42px;background:var(--cinza-claro);color:var(--cinza-escuro);">
            Fechar
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
  } catch (error) {
    console.error("Erro ao carregar logs:", error);
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Erro ao carregar logs", "error");
    }
  }
}

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

function renderAcessoNegado(appInstance) {
  return `
    <div class="container">
      <div style="text-align:center;padding:40px 20px;color:var(--cinza-medio);">
        <div style="font-size:48px;color:var(--cinza-claro);margin-bottom:12px;">
          <i class="fas fa-lock"></i>
        </div>
        <p style="font-weight:500;">Acesso restrito a supervisores</p>
        <button onclick="window.app.navigateTo('dashboard')" class="btn-primary" style="margin-top:16px;max-width:200px;">
          Voltar
        </button>
      </div>
    </div>
  `;
}

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

function validarCPF(cpf) {
  const limpo = cpf.replace(/\D/g, "");
  if (limpo.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(limpo)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) {
    soma += parseInt(limpo.charAt(i)) * (10 - i);
  }
  let resto = 11 - (soma % 11);
  let digito1 = resto >= 10 ? 0 : resto;
  if (digito1 !== parseInt(limpo.charAt(9))) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) {
    soma += parseInt(limpo.charAt(i)) * (11 - i);
  }
  resto = 11 - (soma % 11);
  let digito2 = resto >= 10 ? 0 : resto;
  return digito2 === parseInt(limpo.charAt(10));
}

function formatarDataHoraLocal(date) {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getLogBadgeClass(acao) {
  const map = {
    login: "badge-synced",
    logout: "badge-draft",
    primeiro_acesso: "badge-pending",
    criar_ocorrencia: "badge-azul",
    finalizar_ocorrencia: "badge-verde",
    cancelar_ocorrencia: "badge-cancelled",
    solicitar_retificacao: "badge-pending",
    aprovar_retificacao: "badge-synced",
    rejeitar_retificacao: "badge-cancelled",
    criar_usuario: "badge-azul",
    editar_usuario: "badge-azul",
    resetar_senha: "badge-pending",
    ativar_desativar_usuario: "badge-azul",
  };
  return map[acao] || "badge-draft";
}

function getLogLabel(acao) {
  const map = {
    login: "Login",
    logout: "Logout",
    primeiro_acesso: "Primeiro Acesso",
    criar_ocorrencia: "Criar Ocorrência",
    finalizar_ocorrencia: "Finalizar Ocorrência",
    cancelar_ocorrencia: "Cancelar Ocorrência",
    solicitar_retificacao: "Solicitar Retificação",
    aprovar_retificacao: "Aprovar Retificação",
    rejeitar_retificacao: "Rejeitar Retificação",
    criar_usuario: "Criar Usuário",
    editar_usuario: "Editar Usuário",
    resetar_senha: "Resetar Senha",
    ativar_desativar_usuario: "Ativar/Desativar Usuário",
  };
  return map[acao] || acao;
}

/**
 * Modal de confirmação (fallback)
 */
function confirmarModal(mensagem, titulo = "Confirmar") {
  return new Promise((resolve) => {
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
            <i class="fas fa-question-circle" style="margin-right:8px;"></i>
            ${titulo}
          </div>
          <button type="button" class="close-btn" onclick="this.closest('.modal-overlay').remove(); window._confirmModalResolve(false);" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--cinza-medio);padding:4px 8px;border-radius:50%;transition:all 0.3s ease;">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body" style="padding:14px 16px 4px 16px;">
          <p style="font-size:15px;color:var(--cinza-escuro);margin:0;text-align:center;line-height:1.6;white-space:pre-wrap;">${mensagem}</p>
        </div>
        <div class="modal-footer" style="padding:12px 16px 14px 16px;border-top:1px solid var(--cinza-claro);display:flex;flex-direction:row;gap:10px;">
          <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove(); window._confirmModalResolve(false);" style="flex:1;padding:10px 16px;border-radius:16px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;border:none;min-height:42px;background:var(--cinza-claro);color:var(--cinza-escuro);">
            Cancelar
          </button>
          <button type="button" class="btn-primary" onclick="this.closest('.modal-overlay').remove(); window._confirmModalResolve(true);" style="flex:1;padding:10px 16px;border-radius:16px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;border:none;min-height:42px;background:var(--gradiente-principal);color:var(--branco);">
            <i class="fas fa-check" style="margin-right:6px;"></i> Confirmar
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    window._confirmModalResolve = resolve;

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.remove();
        resolve(false);
      }
    });
  });
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
  renderUsuarios,
  aplicarFiltroUsuarios,
  limparFiltroUsuarios,
  modalCriarUsuario,
  modalEditarUsuario,
  toggleStatusUsuario,
  resetarSenhaUsuario,
  verLogsUsuario,
};
