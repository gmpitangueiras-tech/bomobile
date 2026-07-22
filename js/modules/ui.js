/**
 * MÓDULO UI - Componentes de Interface
 * Guarda Municipal de Pitangueiras - PR
 *
 * Este módulo contém todos os componentes reutilizáveis de UI:
 * - Toasts (notificações)
 * - Bottom Sheet (menu "Mais") - CRIADO DINAMICAMENTE
 * - Gestos de Deslize (Swipe entre abas)
 * - Badges e contadores
 * - Modais (reutilizáveis)
 * - Spinners e loaders
 * - Animações
 *
 * MELHORIAS APLICADAS:
 * - Gestos de Deslize (swipe para navegar entre abas)
 * - Bottom Sheet dinâmico com estilos inline
 * - 🔥 NOVO: Link para Notificações no bottom sheet
 * - 🔥 NOVO: Link para Minhas Ocorrências no bottom sheet
 * - 🔥 NOVO: Link para Retificações de Abordagens no bottom sheet
 * - 🔥 NOVO: Badge de notificações no bottom nav
 * - 🔥 NOVO: Atualização automática do badge de notificações
 * - 🔥 NOVO: Função atualizarBadgeNotificacoes com fallback
 * - 🔥 NOVO: Função iniciarVerificacaoNotificacoes
 * - 🔥 NOVO: Função pararVerificacaoNotificacoes
 * - 🔥 REMOVIDO: FAB Contextual (botão flutuante removido completamente)
 *
 * Depende de: authManager (global), app (para navegação)
 */

// ============================================
// VARIÁVEIS GLOBAIS DO MÓDULO
// ============================================

let bottomSheetOverlay = null;
let bottomSheet = null;
let bottomSheetItemsContainer = null;
let isBottomSheetOpen = false;
let isAnimating = false;

let swipeStartX = 0;
let swipeStartY = 0;
let isSwiping = false;
let swipeThreshold = 50;

// 🔥 NOVO: Estado de notificações
let notificacoesNaoLidas = 0;
let notificacoesInterval = null;

// ============================================
// TOASTS - NOTIFICAÇÕES
// ============================================

/**
 * Exibe uma notificação toast na tela
 * @param {string} message - Mensagem a ser exibida
 * @param {string} type - Tipo: 'success', 'error', 'warning', 'info'
 * @param {number} duration - Duração em ms (padrão: 4000)
 */
export function showToast(message, type = "info", duration = 4000) {
  const container = document.getElementById("toastContainer");
  if (!container) {
    const newContainer = document.createElement("div");
    newContainer.id = "toastContainer";
    newContainer.style.cssText = `
      position: fixed;
      bottom: 90px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      width: 92%;
      max-width: 380px;
      pointer-events: none;
    `;
    document.body.appendChild(newContainer);
    showToast(message, type, duration);
    return;
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.style.cssText = `
    padding: 10px 14px;
    border-radius: 16px;
    color: #fff;
    font-weight: 500;
    font-size: 13px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.18);
    animation: toastIn 0.3s ease;
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  `;

  const cores = {
    success: "var(--verde-bandeira)",
    error: "var(--erro)",
    warning: "var(--aviso)",
    info: "var(--azul-bandeira)",
  };
  toast.style.background = cores[type] || cores.info;

  const iconMap = {
    success: "fa-check-circle",
    error: "fa-exclamation-circle",
    warning: "fa-exclamation-triangle",
    info: "fa-info-circle",
  };
  toast.innerHTML = `<i class="fas ${iconMap[type] || iconMap.info}" style="margin-right:8px;"></i> ${message}`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("out");
    toast.style.animation = "toastOut 0.3s ease forwards";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Alias para showToast (compatibilidade)
 */
export function toast(message, type = "info", duration = 4000) {
  return showToast(message, type, duration);
}

// ============================================
// CRIAÇÃO DO BOTTOM SHEET DINAMICAMENTE
// ============================================

function criarBottomSheet() {
  console.log("🔧 Criando bottom sheet dinamicamente...");

  const oldOverlay = document.getElementById("bottomSheetOverlay");
  if (oldOverlay) oldOverlay.remove();

  bottomSheetOverlay = document.createElement("div");
  bottomSheetOverlay.id = "bottomSheetOverlay";
  bottomSheetOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    z-index: 999999;
    display: none;
    animation: fadeIn 0.25s ease;
  `;

  bottomSheet = document.createElement("div");
  bottomSheet.id = "bottomSheet";
  bottomSheet.style.cssText = `
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: #ffffff;
    border-radius: 20px 20px 0 0;
    z-index: 1000000;
    transform: translateY(100%);
    transition: transform 0.35s cubic-bezier(0.32, 0.72, 0, 1);
    max-height: 70vh;
    overflow-y: auto;
    padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
    box-shadow: 0 -8px 40px rgba(0, 0, 0, 0.3);
    padding: 0;
  `;

  bottomSheetItemsContainer = document.createElement("div");
  bottomSheetItemsContainer.className = "bottom-sheet-items";
  bottomSheetItemsContainer.style.cssText = `
    display: block;
    padding: 0;
    margin: 0;
    background: #ffffff;
  `;

  bottomSheet.appendChild(bottomSheetItemsContainer);
  bottomSheetOverlay.appendChild(bottomSheet);

  document.body.appendChild(bottomSheetOverlay);

  bottomSheetOverlay.addEventListener("click", (e) => {
    if (e.target === bottomSheetOverlay) {
      closeBottomSheet();
    }
  });

  console.log("✅ Bottom sheet criado dinamicamente");
}

// ============================================
// BOTTOM SHEET - CONTROLE
// ============================================

/**
 * Alterna a abertura/fechamento do bottom sheet
 */
export function toggleBottomSheet() {
  console.log("🔄 toggleBottomSheet chamado");

  if (!bottomSheetOverlay || !bottomSheet) {
    criarBottomSheet();
  }

  if (isAnimating) {
    console.log("⏳ Aguardando animação terminar...");
    return;
  }

  if (isBottomSheetOpen) {
    closeBottomSheet();
  } else {
    openBottomSheet();
  }
}

/**
 * Abre o bottom sheet
 */
export function openBottomSheet() {
  console.log("🚀 openBottomSheet chamado");

  if (!bottomSheetOverlay || !bottomSheet) {
    criarBottomSheet();
  }

  if (isBottomSheetOpen) {
    console.log("ℹ️ Bottom sheet já está aberto");
    return;
  }

  isAnimating = true;

  renderBottomSheetItems();

  bottomSheetOverlay.style.display = "block";
  void bottomSheetOverlay.offsetHeight;
  bottomSheet.style.transform = "translateY(0)";

  document.body.style.overflow = "hidden";
  document.body.style.position = "fixed";
  document.body.style.width = "100%";

  isBottomSheetOpen = true;

  setTimeout(() => {
    isAnimating = false;
  }, 400);

  console.log("✅ Bottom sheet aberto");
}

/**
 * Fecha o bottom sheet
 */
export function closeBottomSheet() {
  console.log("🔚 closeBottomSheet chamado");

  if (!bottomSheetOverlay || !bottomSheet) {
    isBottomSheetOpen = false;
    isAnimating = false;
    return;
  }

  if (!isBottomSheetOpen) {
    console.log("ℹ️ Bottom sheet já está fechado");
    return;
  }

  isAnimating = true;

  bottomSheet.style.transform = "translateY(100%)";

  setTimeout(() => {
    bottomSheetOverlay.style.display = "none";
    isBottomSheetOpen = false;
    isAnimating = false;
  }, 350);

  document.body.style.overflow = "";
  document.body.style.position = "";
  document.body.style.width = "";

  console.log("✅ Bottom sheet fechado");
}

// ============================================
// 🔥 NOVO: ATUALIZAR BADGE DE NOTIFICAÇÕES
// ============================================

/**
 * Atualiza o badge de notificações no bottom nav e bottom sheet
 * @returns {Promise<number>} - Número de notificações não lidas
 */
export async function atualizarBadgeNotificacoes() {
  try {
    const user =
      typeof authManager !== "undefined" ? authManager.getUser() : null;
    if (!user) {
      notificacoesNaoLidas = 0;
      _atualizarBadgeNotificacoesUI(0);
      return 0;
    }

    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) {
      notificacoesNaoLidas = 0;
      _atualizarBadgeNotificacoesUI(0);
      return 0;
    }

    const { data, error } = await client
      .from("notificacoes")
      .select("id", { count: "exact" })
      .eq("usuario_id", user.id)
      .eq("lida", false);

    if (error) throw error;

    notificacoesNaoLidas = data?.length || 0;
    _atualizarBadgeNotificacoesUI(notificacoesNaoLidas);

    return notificacoesNaoLidas;
  } catch (error) {
    console.warn("Erro ao atualizar badge de notificações:", error);
    notificacoesNaoLidas = 0;
    _atualizarBadgeNotificacoesUI(0);
    return 0;
  }
}

/**
 * 🔥 NOVO: Atualiza UI do badge de notificações
 * @param {number} count - Número de notificações não lidas
 */
function _atualizarBadgeNotificacoesUI(count) {
  // Badge no bottom nav
  const badgeNav = document.getElementById("badge-notificacoes");
  if (badgeNav) {
    if (count > 0) {
      badgeNav.textContent = count > 9 ? "9+" : count;
      badgeNav.style.display = "flex";
    } else {
      badgeNav.style.display = "none";
    }
  }

  // Badge no bottom sheet
  const badgeSheet = document.getElementById("sheetBadgeNotificacoes");
  if (badgeSheet) {
    if (count > 0) {
      badgeSheet.textContent = count > 9 ? "9+" : count;
      badgeSheet.style.display = "inline";
    } else {
      badgeSheet.style.display = "none";
    }
  }

  // Disparar evento para outros módulos
  const event = new CustomEvent("badge_notificacoes_atualizado", {
    detail: { count },
  });
  document.dispatchEvent(event);

  // Atualizar também via notificacoes global se disponível
  if (typeof window.notificacoes !== "undefined" && window.notificacoes) {
    window.notificacoes.notificacoesNaoLidas = count;
  }
}

// ============================================
// 🔥 NOVO: INICIAR VERIFICAÇÃO PERIÓDICA DE NOTIFICAÇÕES
// ============================================

/**
 * Inicia a verificação periódica de notificações
 * @param {number} intervalo - Intervalo em milissegundos (padrão: 30000)
 */
export function iniciarVerificacaoNotificacoes(intervalo = 30000) {
  if (notificacoesInterval) {
    clearInterval(notificacoesInterval);
  }

  // Verificar a cada X segundos
  notificacoesInterval = setInterval(() => {
    atualizarBadgeNotificacoes();
  }, intervalo);

  // Verificar imediatamente após iniciar
  setTimeout(() => {
    atualizarBadgeNotificacoes();
  }, 1000);

  console.log(
    `🔔 Verificação periódica de notificações iniciada (${intervalo / 1000}s)`,
  );
}

/**
 * Para a verificação periódica de notificações
 */
export function pararVerificacaoNotificacoes() {
  if (notificacoesInterval) {
    clearInterval(notificacoesInterval);
    notificacoesInterval = null;
    console.log("🔔 Verificação periódica de notificações parada");
  }
}

// ============================================
// BOTTOM SHEET - RENDERIZAÇÃO (CORRIGIDO COM OCORRÊNCIAS)
// ============================================

/**
 * Renderiza os itens do bottom sheet dinamicamente
 */
export function renderBottomSheetItems() {
  console.log("📋 renderBottomSheetItems chamado");

  if (!bottomSheetItemsContainer) {
    if (!bottomSheet) {
      criarBottomSheet();
    }
    if (bottomSheet) {
      bottomSheetItemsContainer = document.createElement("div");
      bottomSheetItemsContainer.className = "bottom-sheet-items";
      bottomSheetItemsContainer.style.cssText = `
        display: block;
        padding: 0;
        margin: 0;
        background: #ffffff;
      `;
      bottomSheet.appendChild(bottomSheetItemsContainer);
    }
  }

  if (!bottomSheetItemsContainer) {
    console.error("❌ Não foi possível criar o container de itens");
    return;
  }

  const isSupervisor =
    typeof authManager !== "undefined" && authManager.isSupervisor();

  // 🔥 NOVO: Atualizar badge de notificações
  atualizarBadgeNotificacoes();

  let html = `
    <div style="width:40px;height:4px;background:#e0e4ea;border-radius:4px;margin:10px auto 8px;flex-shrink:0;"></div>
    <div style="font-size:14px;font-weight:700;color:#94a3b8;text-align:center;padding:4px 16px 12px;border-bottom:1px solid #e0e4ea;margin-bottom:8px;">Menu</div>
  `;

  // 🔥 MINHAS OCORRÊNCIAS (agora no "Mais")
  html += `
    <button data-page="ocorrencias" style="display:flex;align-items:center;gap:14px;padding:14px 20px;width:100%;border:none;background:none;font-size:15px;color:#1e293b;cursor:pointer;text-align:left;border-bottom:1px solid #e0e4ea;font-family:inherit;transition:background 0.15s ease;">
      <i class="fas fa-list-ul" style="width:24px;text-align:center;font-size:18px;color:#003f87;"></i>
      <span style="flex:1;">Minhas Ocorrências</span>
    </button>
  `;

  html += `
    <button data-page="consulta" style="display:flex;align-items:center;gap:14px;padding:14px 20px;width:100%;border:none;background:none;font-size:15px;color:#1e293b;cursor:pointer;text-align:left;border-bottom:1px solid #e0e4ea;font-family:inherit;transition:background 0.15s ease;">
      <i class="fas fa-search" style="width:24px;text-align:center;font-size:18px;color:#003f87;"></i>
      <span style="flex:1;">Consulta Operacional</span>
    </button>
  `;

  if (isSupervisor) {
    html += `
      <button data-page="retificacoes" style="display:flex;align-items:center;gap:14px;padding:14px 20px;width:100%;border:none;background:none;font-size:15px;color:#1e293b;cursor:pointer;text-align:left;border-bottom:1px solid #e0e4ea;font-family:inherit;transition:background 0.15s ease;">
        <i class="fas fa-sync-alt" style="width:24px;text-align:center;font-size:18px;color:#003f87;"></i>
        <span style="flex:1;">Retificações de BO</span>
        <span id="sheetBadgeRetificacoes" style="background:#dc2626;color:white;font-size:11px;font-weight:700;padding:2px 10px;border-radius:9999px;display:none;">0</span>
      </button>
    `;

    // 🔥 Retificações de Abordagens
    html += `
      <button data-page="retificacoes-abordagens" style="display:flex;align-items:center;gap:14px;padding:14px 20px;width:100%;border:none;background:none;font-size:15px;color:#1e293b;cursor:pointer;text-align:left;border-bottom:1px solid #e0e4ea;font-family:inherit;transition:background 0.15s ease;">
        <i class="fas fa-car" style="width:24px;text-align:center;font-size:18px;color:#003f87;"></i>
        <span style="flex:1;">Retificações de Abordagens</span>
        <span id="sheetBadgeRetificacoesAbordagens" style="background:#dc2626;color:white;font-size:11px;font-weight:700;padding:2px 10px;border-radius:9999px;display:none;">0</span>
      </button>
    `;

    html += `
      <button data-page="relatorios" style="display:flex;align-items:center;gap:14px;padding:14px 20px;width:100%;border:none;background:none;font-size:15px;color:#1e293b;cursor:pointer;text-align:left;border-bottom:1px solid #e0e4ea;font-family:inherit;transition:background 0.15s ease;">
        <i class="fas fa-chart-bar" style="width:24px;text-align:center;font-size:18px;color:#003f87;"></i>
        <span style="flex:1;">Relatórios</span>
      </button>
      <button data-page="logs" style="display:flex;align-items:center;gap:14px;padding:14px 20px;width:100%;border:none;background:none;font-size:15px;color:#1e293b;cursor:pointer;text-align:left;border-bottom:1px solid #e0e4ea;font-family:inherit;transition:background 0.15s ease;">
        <i class="fas fa-history" style="width:24px;text-align:center;font-size:18px;color:#003f87;"></i>
        <span style="flex:1;">Logs do Sistema</span>
      </button>
      <button data-page="usuarios" style="display:flex;align-items:center;gap:14px;padding:14px 20px;width:100%;border:none;background:none;font-size:15px;color:#1e293b;cursor:pointer;text-align:left;border-bottom:1px solid #e0e4ea;font-family:inherit;transition:background 0.15s ease;">
        <i class="fas fa-users" style="width:24px;text-align:center;font-size:18px;color:#003f87;"></i>
        <span style="flex:1;">Gerenciar Usuários</span>
      </button>
    `;
  }

  html += `
    <button data-page="perfil" style="display:flex;align-items:center;gap:14px;padding:14px 20px;width:100%;border:none;background:none;font-size:15px;color:#1e293b;cursor:pointer;text-align:left;border-bottom:1px solid #e0e4ea;font-family:inherit;transition:background 0.15s ease;">
      <i class="fas fa-user" style="width:24px;text-align:center;font-size:18px;color:#003f87;"></i>
      <span style="flex:1;">Meu Perfil</span>
    </button>
    <button id="btnLogoutSheet" style="display:flex;align-items:center;gap:14px;padding:14px 20px;width:100%;border:none;background:none;font-size:15px;color:#dc2626;cursor:pointer;text-align:left;font-family:inherit;transition:background 0.15s ease;">
      <i class="fas fa-sign-out-alt" style="width:24px;text-align:center;font-size:18px;color:#dc2626;"></i>
      <span style="flex:1;">Sair</span>
    </button>
  `;

  bottomSheetItemsContainer.innerHTML = html;
  console.log("✅ Bottom sheet items renderizados");

  bottomSheetItemsContainer
    .querySelectorAll("button[data-page]")
    .forEach((item) => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const page = item.dataset.page;
        console.log("📌 Navegando para:", page);
        closeBottomSheet();
        if (typeof window.app !== "undefined" && window.app.navigateTo) {
          setTimeout(() => {
            window.app.navigateTo(page);
          }, 400);
        } else {
          console.warn("⚠️ app.navigateTo não disponível");
        }
      });
    });

  const logoutBtn = document.getElementById("btnLogoutSheet");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      console.log("🚪 Logout clicado no bottom sheet");
      closeBottomSheet();
      if (typeof window.app !== "undefined" && window.app.handleLogout) {
        await window.app.handleLogout();
      } else if (typeof authManager !== "undefined") {
        await authManager.logout();
        if (typeof window.app !== "undefined" && window.app.route) {
          window.app.route();
        }
        showToast("Logout realizado", "info");
      }
    });
  }

  atualizarBadgeRetificacoes();
  // 🔥 NOVO: Atualizar badge de retificações de abordagens
  atualizarBadgeRetificacoesAbordagens();
  // 🔥 NOVO: Atualizar badge de notificações
  atualizarBadgeNotificacoes();
}

// ============================================
// BADGES - RETIFICAÇÕES
// ============================================

/**
 * Atualiza o badge de retificações pendentes no bottom sheet
 */
export async function atualizarBadgeRetificacoes() {
  console.log("🔄 atualizarBadgeRetificacoes chamado");
  if (typeof ocorrenciaManager === "undefined") return;
  if (typeof authManager === "undefined" || !authManager.isSupervisor()) return;

  try {
    const result = await ocorrenciaManager.buscarRetificacoesPendentes();
    if (result.success) {
      const count = result.data?.length || 0;
      const badge = document.getElementById("sheetBadgeRetificacoes");
      if (badge) {
        badge.textContent = count > 0 ? count : "0";
        badge.style.display = count > 0 ? "inline" : "none";
        console.log("✅ Badge de retificações atualizado:", count);
      }
    }
  } catch (error) {
    console.error("Erro ao atualizar badge de retificações:", error);
  }
}

/**
 * 🔥 NOVO: Atualiza o badge de retificações de abordagens pendentes
 */
export async function atualizarBadgeRetificacoesAbordagens() {
  console.log("🔄 atualizarBadgeRetificacoesAbordagens chamado");
  if (typeof authManager === "undefined" || !authManager.isSupervisor()) return;

  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) return;

    // Buscar retificações pendentes de veículos
    const { data: veiculos, error: errVeiculos } = await client
      .from("abordagens_veiculos")
      .select("id")
      .eq("status_retificacao", "pending_rectification");

    if (errVeiculos) throw errVeiculos;

    // Buscar retificações pendentes de pessoas
    const { data: pessoas, error: errPessoas } = await client
      .from("abordagens_pessoas")
      .select("id")
      .eq("status_retificacao", "pending_rectification");

    if (errPessoas) throw errPessoas;

    const count = (veiculos?.length || 0) + (pessoas?.length || 0);
    const badge = document.getElementById("sheetBadgeRetificacoesAbordagens");
    if (badge) {
      badge.textContent = count > 0 ? count : "0";
      badge.style.display = count > 0 ? "inline" : "none";
      console.log("✅ Badge de retificações de abordagens atualizado:", count);
    }
  } catch (error) {
    console.error(
      "Erro ao atualizar badge de retificações de abordagens:",
      error,
    );
  }
}

// ============================================
// GESTOS DE DESLIZE (SWIPE)
// ============================================

/**
 * Configura os gestos de deslize para navegação entre abas
 */
export function configurarGestosDeslize() {
  console.log("👆 Configurando gestos de deslize...");

  document.addEventListener(
    "touchstart",
    (e) => {
      swipeStartX = e.changedTouches[0].screenX;
      swipeStartY = e.changedTouches[0].screenY;
      isSwiping = false;
    },
    { passive: true },
  );

  document.addEventListener(
    "touchmove",
    (e) => {
      const touchEndX = e.changedTouches[0].screenX;
      const touchEndY = e.changedTouches[0].screenY;
      const diffX = touchEndX - swipeStartX;
      const diffY = touchEndY - swipeStartY;

      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 20) {
        isSwiping = true;
        e.preventDefault();
      }
    },
    { passive: false },
  );

  document.addEventListener(
    "touchend",
    (e) => {
      if (!isSwiping) return;

      const touchEndX = e.changedTouches[0].screenX;
      const diffX = touchEndX - swipeStartX;

      if (Math.abs(diffX) > swipeThreshold) {
        if (diffX < -swipeThreshold) {
          // Swipe para esquerda
          handleSwipeLeft();
        } else if (diffX > swipeThreshold) {
          // Swipe para direita
          handleSwipeRight();
        }
      }

      isSwiping = false;
    },
    { passive: true },
  );

  console.log("✅ Gestos de deslize configurados");
}

/**
 * Manipula swipe para esquerda (próxima aba)
 */
function handleSwipeLeft() {
  console.log("👈 Swipe para esquerda detectado");

  if (typeof window.app === "undefined" || !window.app.currentPage) return;

  const currentPage = window.app.currentPage;
  const swipePages = ["consulta", "mural", "ocorrencias"];

  if (!swipePages.includes(currentPage)) return;

  const pageOrder = ["consulta", "mural", "ocorrencias"];
  const currentIndex = pageOrder.indexOf(currentPage);

  if (currentIndex < pageOrder.length - 1) {
    const nextPage = pageOrder[currentIndex + 1];
    window.app.navigateTo(nextPage);
    const labels = {
      consulta: "Consulta Operacional",
      mural: "Mural",
      ocorrencias: "Ocorrências",
    };
    showToast(`→ ${labels[nextPage] || nextPage}`, "info", 1500);
  }
}

/**
 * Manipula swipe para direita (aba anterior)
 */
function handleSwipeRight() {
  console.log("👉 Swipe para direita detectado");

  if (typeof window.app === "undefined" || !window.app.currentPage) return;

  const currentPage = window.app.currentPage;
  const swipePages = ["consulta", "mural", "ocorrencias"];

  if (!swipePages.includes(currentPage)) return;

  const pageOrder = ["consulta", "mural", "ocorrencias"];
  const currentIndex = pageOrder.indexOf(currentPage);

  if (currentIndex > 0) {
    const prevPage = pageOrder[currentIndex - 1];
    window.app.navigateTo(prevPage);
    const labels = {
      consulta: "Consulta Operacional",
      mural: "Mural",
      ocorrencias: "Ocorrências",
    };
    showToast(`← ${labels[prevPage] || prevPage}`, "info", 1500);
  }
}

// ============================================
// BADGES E CONTADORES - MURAL
// ============================================

/**
 * Atualiza o badge do mural (avisos não lidos)
 */
export async function atualizarBadgeMural() {
  try {
    const user =
      typeof authManager !== "undefined" ? authManager.getUser() : null;
    if (!user) return;

    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) return;

    const { data: leitura, error: leituraError } = await client
      .from("mural_leituras")
      .select("ultimo_aviso_lido_id, lido_em")
      .eq("usuario_id", user.id)
      .maybeSingle();

    if (leituraError && leituraError.code !== "PGRST116") {
      console.error("Erro ao buscar leitura:", leituraError);
      return;
    }

    const { data: avisos, error: avisosError } = await client
      .from("mural_avisos")
      .select("id, criado_em")
      .order("criado_em", { ascending: false });

    if (avisosError) {
      console.error("Erro ao buscar avisos:", avisosError);
      return;
    }

    if (!avisos || avisos.length === 0) {
      _atualizarBadgeMuralUI(0);
      return;
    }

    if (!leitura) {
      _atualizarBadgeMuralUI(avisos.length);
      return;
    }

    const dataUltimaLeitura = new Date(leitura.lido_em);
    const naoLidos = avisos.filter((a) => {
      const dataAviso = new Date(a.criado_em);
      return dataAviso > dataUltimaLeitura;
    });

    _atualizarBadgeMuralUI(naoLidos.length);
  } catch (error) {
    console.error("Erro ao atualizar badge do mural:", error);
  }
}

function _atualizarBadgeMuralUI(count) {
  const badge = document.getElementById("badge-mural");
  if (badge) {
    if (count > 0) {
      badge.textContent = count > 9 ? "9+" : count;
      badge.style.display = "flex";
    } else {
      badge.style.display = "none";
    }
  }
}

/**
 * Marca todos os avisos do mural como lidos para o usuário atual
 */
export async function marcarMuralComoLido() {
  try {
    const user =
      typeof authManager !== "undefined" ? authManager.getUser() : null;
    if (!user) return;

    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) return;

    const { data: ultimoAviso, error } = await client
      .from("mural_avisos")
      .select("id")
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Erro ao buscar último aviso:", error);
      return;
    }

    await client.from("mural_leituras").upsert(
      {
        usuario_id: user.id,
        ultimo_aviso_lido_id: ultimoAviso?.id || null,
        lido_em: new Date().toISOString(),
      },
      { onConflict: "usuario_id" },
    );

    atualizarBadgeMural();
  } catch (error) {
    console.error("Erro ao marcar mural como lido:", error);
  }
}

// ============================================
// SPINNERS E LOADERS
// ============================================

export function criarSpinner(size = "medium", color = "var(--azul-bandeira)") {
  const sizes = {
    small: "24px",
    medium: "32px",
    large: "48px",
  };

  const spinner = document.createElement("div");
  spinner.className = "spinner-azul";
  spinner.style.cssText = `
    width: ${sizes[size] || sizes.medium};
    height: ${sizes[size] || sizes.medium};
    border: 3px solid var(--cinza-claro);
    border-top-color: ${color};
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    display: inline-block;
  `;
  return spinner;
}

export function criarLoader(texto = "Carregando...") {
  const container = document.createElement("div");
  container.style.cssText = `
    text-align: center;
    padding: 40px 20px;
  `;
  container.innerHTML = `
    <div style="margin: 0 auto;">
      ${criarSpinner("medium").outerHTML}
    </div>
    <p style="margin-top: 12px; color: var(--cinza-medio);">${texto}</p>
  `;
  return container;
}

// ============================================
// MODAIS REUTILIZÁVEIS
// ============================================

export function criarModal(options) {
  const {
    titulo = "Modal",
    conteudo = "",
    botoes = [],
    tamanho = "medium",
  } = options;

  const tamanhos = {
    small: "400px",
    medium: "500px",
    large: "650px",
  };

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
    <div class="modal" style="max-width: ${tamanhos[tamanho] || tamanhos.medium}; width: 100%; max-height: 95vh; overflow-y: auto;">
      <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; padding: 14px 16px 10px 16px; border-bottom: 1px solid var(--cinza-claro); position: sticky; top: 0; background: var(--branco); border-radius: 20px 20px 0 0; z-index: 1;">
        <div class="title" style="font-size: 16px; font-weight: 700; color: var(--azul-bandeira);">
          ${titulo}
        </div>
        <button type="button" class="close-btn" style="background: none; border: none; font-size: 22px; cursor: pointer; color: var(--cinza-medio); padding: 4px 8px; border-radius: 50%; transition: all 0.3s ease;">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="modal-body" style="padding: 14px 16px 4px 16px;">
        ${conteudo}
      </div>
      <div class="modal-footer" style="padding: 12px 16px 14px 16px; border-top: 1px solid var(--cinza-claro); display: flex; flex-direction: column; gap: 8px; position: sticky; bottom: 0; background: var(--branco); border-radius: 0 0 20px 20px;">
        ${botoes
          .map(
            (btn) => `
          <button type="button" class="${btn.class}" style="width: 100%; padding: 10px 16px; border-radius: 16px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.3s ease; border: none; min-height: 42px;">
            ${btn.label}
          </button>
        `,
          )
          .join("")}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });

  overlay.querySelector(".close-btn").addEventListener("click", () => {
    overlay.remove();
  });

  overlay.querySelectorAll(".modal-footer button").forEach((btn, index) => {
    if (botoes[index] && botoes[index].onClick) {
      btn.addEventListener("click", (e) => {
        botoes[index].onClick(e, overlay);
      });
    }
  });

  return overlay;
}

// ============================================
// ESTILOS DINÂMICOS (INJETAR CSS)
// ============================================

export function injetarEstilosUI() {
  if (document.getElementById("ui-styles")) return;

  const styles = document.createElement("style");
  styles.id = "ui-styles";
  styles.textContent = `
    @keyframes toastIn {
      from { opacity: 0; transform: translateY(20px) scale(0.95); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes toastOut {
      from { opacity: 1; transform: translateY(0) scale(1); }
      to { opacity: 0; transform: translateY(-20px) scale(0.95); }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(20px) scale(0.95); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    #toastContainer {
      position: fixed;
      bottom: 90px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      width: 92%;
      max-width: 380px;
      pointer-events: none;
    }

    .session-toast-fallback {
      position: fixed;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%);
      background: #f59e0b;
      color: #fff;
      padding: 12px 20px;
      border-radius: 12px;
      font-weight: 600;
      font-size: 14px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.2);
      z-index: 9999;
      max-width: 90%;
      text-align: center;
      animation: fadeIn 0.3s ease;
      pointer-events: none;
    }

    .badge-count {
      position: absolute;
      top: -6px;
      right: -10px;
      background: var(--erro);
      color: white;
      font-size: 9px;
      min-width: 18px;
      height: 18px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      border: 2px solid var(--branco);
      padding: 0 4px;
    }

    /* 🔥 NOVO: Badge de notificações no bottom nav */
    #badge-notificacoes {
      position: absolute;
      top: -6px;
      right: -10px;
      background: var(--erro);
      color: white;
      font-size: 9px;
      min-width: 18px;
      height: 18px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      border: 2px solid var(--branco);
      padding: 0 4px;
    }

    /* 🔥 NOVO: Badge de notificações no bottom sheet */
    #sheetBadgeNotificacoes {
      background: #dc2626;
      color: white;
      font-size: 10px;
      font-weight: 700;
      padding: 1px 10px;
      border-radius: 9999px;
      display: none;
      min-width: 20px;
      text-align: center;
      line-height: 20px;
    }
  `;

  document.head.appendChild(styles);
}

// ============================================
// INICIALIZAÇÃO DO UI
// ============================================

export function initUI() {
  console.log("🔧 Inicializando UI...");

  injetarEstilosUI();

  criarBottomSheet();

  configurarGestosDeslize();

  const navMais = document.getElementById("navMais");
  if (navMais) {
    const newNavMais = navMais.cloneNode(true);
    navMais.parentNode.replaceChild(newNavMais, navMais);

    newNavMais.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('🔘 Botão "Mais" clicado via UI');
      toggleBottomSheet();
    });
    console.log('✅ Evento do botão "Mais" configurado');
  } else {
    console.warn("⚠️ Elemento #navMais não encontrado no DOM");
  }

  // 🔥 NOVO: Iniciar verificação periódica de notificações
  iniciarVerificacaoNotificacoes();

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      console.log("⌨️ Tecla ESC pressionada");
      closeBottomSheet();
    }
  });

  // 🔥 NOVO: Atualizar badge de notificações quando a página ganhar foco
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      atualizarBadgeNotificacoes();
    }
  });

  console.log("✅ UI inicializado");
}

// ============================================
// EXPOSIÇÃO GLOBAL
// ============================================

window.toggleBottomSheet = toggleBottomSheet;
window.openBottomSheet = openBottomSheet;
window.closeBottomSheet = closeBottomSheet;
window.renderBottomSheetItems = renderBottomSheetItems;
window.showToast = showToast;
window.toast = toast;
// 🔥 REMOVIDO: window.atualizarFAB
// 🔥 REMOVIDO: window.esconderFAB
// 🔥 REMOVIDO: window.mostrarFAB
// 🔥 NOVO
window.atualizarBadgeNotificacoes = atualizarBadgeNotificacoes;
window.atualizarBadgeRetificacoesAbordagens =
  atualizarBadgeRetificacoesAbordagens;
window.iniciarVerificacaoNotificacoes = iniciarVerificacaoNotificacoes;
window.pararVerificacaoNotificacoes = pararVerificacaoNotificacoes;

console.log("✅ UI exposto globalmente");

// ============================================
// EXPORTAÇÕES
// ============================================

export default {
  showToast,
  toast,
  toggleBottomSheet,
  openBottomSheet,
  closeBottomSheet,
  renderBottomSheetItems,
  atualizarBadgeRetificacoes,
  // 🔥 NOVO
  atualizarBadgeNotificacoes,
  atualizarBadgeRetificacoesAbordagens,
  iniciarVerificacaoNotificacoes,
  pararVerificacaoNotificacoes,
  atualizarBadgeMural,
  marcarMuralComoLido,
  criarSpinner,
  criarLoader,
  criarModal,
  injetarEstilosUI,
  initUI,
  configurarGestosDeslize,
};
