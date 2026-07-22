/**
 * MÓDULO BUSCA PROFUNDA - Busca em todo o sistema
 * Guarda Municipal de Pitangueiras - PR
 *
 * Este módulo gerencia:
 * - Busca por CPF, RG, Nome completo ou Placa
 * - Busca em todas as tabelas do sistema (ocorrências, envolvidos, abordagens, etc.)
 * - Agrupamento de resultados por tipo
 * - Detecção automática de reincidência
 * - Exportação de resultados para CSV
 * - Navegação para detalhes de ocorrências
 * - Interface responsiva e modal
 *
 * Depende de: authManager (global), supabaseClient (global),
 *             appInstance (para navegação e toasts)
 */

// ============================================
// CONSTANTES
// ============================================

const TIPOS_BUSCA = {
  CPF: "cpf",
  RG: "rg",
  NOME: "nome",
  PLACA: "placa",
};

const TIPOS_OCORRENCIA = [
  { value: "furto", label: "Furto" },
  { value: "roubo", label: "Roubo" },
  { value: "vandalismo", label: "Vandalismo" },
  { value: "dano_ao_patrimonio", label: "Dano ao Patrimônio" },
  { value: "ameaca", label: "Ameaça" },
  { value: "lesao_corporal", label: "Lesão Corporal" },
  { value: "perturbacao", label: "Perturbação" },
  { value: "acidente", label: "Acidente" },
  { value: "incendio", label: "Incêndio" },
  { value: "desaparecimento", label: "Desaparecimento" },
  { value: "atendimento_social", label: "Atendimento Social" },
  { value: "outro", label: "Outro" },
];

// ============================================
// ESTADO DO MÓDULO
// ============================================

let buscaEmAndamento = false;
let ultimaBusca = null;

// ============================================
// FUNÇÃO PRINCIPAL - ABRIR MODAL
// ============================================

/**
 * Abre o modal de busca profunda
 * @param {Object} appInstance - Instância do app
 */
export function abrirBuscaProfunda(appInstance) {
  // Verificar se já existe um modal aberto
  const modalExistente = document.querySelector(".busca-profunda-modal");
  if (modalExistente) {
    modalExistente.remove();
  }

  const overlay = document.createElement("div");
  overlay.className = "busca-profunda-modal";
  overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.6);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 12px;
        animation: fadeIn 0.25s ease;
    `;

  overlay.innerHTML = `
        <div class="modal" style="max-width: 720px; width: 100%; max-height: 95vh; display: flex; flex-direction: column; background: var(--branco); border-radius: 20px; box-shadow: var(--sombra-forte);">
            <!-- Header -->
            <div class="modal-header" style="display:flex; justify-content:space-between; align-items:center; padding:16px 20px 12px 20px; border-bottom:1px solid var(--cinza-claro); flex-shrink: 0; border-radius: 20px 20px 0 0; background: var(--branco);">
                <div class="title" style="font-size:18px; font-weight:700; color:var(--azul-bandeira); display:flex; align-items:center; gap:10px;">
                    <i class="fas fa-search" style="color:#8b5cf6; font-size:20px;"></i>
                    Busca Profunda
                </div>
                <button type="button" class="close-btn" onclick="this.closest('.busca-profunda-modal').remove()" 
                    style="background:none; border:none; font-size:24px; cursor:pointer; color:var(--cinza-medio); padding:4px 8px; border-radius:50%; transition:all 0.3s ease; line-height:1;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <!-- Body -->
            <div class="modal-body" style="padding: 20px; overflow-y: auto; flex: 1; background: var(--branco-fumaca);">
                <!-- Descrição -->
                <p style="color:var(--cinza-medio); font-size:14px; margin-bottom:16px; display:flex; align-items:center; gap:8px;">
                    <i class="fas fa-info-circle" style="color:var(--azul-bandeira);"></i>
                    Digite CPF, RG, Nome completo ou Placa para buscar em todo o sistema.
                </p>
                
                <!-- Campo de busca -->
                <div class="form-group" style="margin-bottom:16px;">
                    <label for="buscaTermo" style="display:block; font-size:13px; font-weight:600; color:var(--cinza-escuro); margin-bottom:6px;">
                        <i class="fas fa-edit" style="margin-right:6px; color:var(--azul-bandeira);"></i>
                        Termo de busca <span class="required" style="color:var(--erro);">*</span>
                    </label>
                    <div style="display:flex; gap:10px; flex-wrap:wrap;">
                        <input type="text" id="buscaTermo" class="form-control" 
                            placeholder="Ex: 123.456.789-00, João Silva, ABC1D23..."
                            style="flex:1; min-width:200px; padding:12px 16px; border:2px solid var(--cinza-claro); border-radius:12px; font-size:16px; background:var(--branco); color:var(--cinza-escuro); min-height:48px; transition:border-color 0.3s ease;"
                            autofocus
                            onkeydown="if(event.key==='Enter') window._buscaProfundaExecutar()">
                        <button onclick="window._buscaProfundaExecutar()" class="btn-primary" 
                            style="padding:12px 24px; border-radius:12px; font-size:15px; font-weight:700; background:var(--gradiente-principal); color:var(--branco); border:none; cursor:pointer; transition:all 0.3s ease; min-height:48px; white-space:nowrap;">
                            <i class="fas fa-search" style="margin-right:8px;"></i> 
                            Buscar
                        </button>
                    </div>
                </div>
                
                <!-- Opções de busca -->
                <div style="display:flex; flex-wrap:wrap; gap:12px; margin-bottom:16px; padding:12px 16px; background:var(--branco); border-radius:12px; border:1px solid var(--cinza-claro);">
                    <span style="font-size:12px; font-weight:600; color:var(--cinza-medio); display:flex; align-items:center; margin-right:4px;">
                        <i class="fas fa-filter" style="margin-right:4px;"></i> Buscar por:
                    </span>
                    <label style="display:flex; align-items:center; gap:6px; font-size:13px; cursor:pointer;">
                        <input type="checkbox" id="buscaCpf" checked value="cpf" style="width:18px; height:18px; accent-color:var(--azul-bandeira);">
                        CPF
                    </label>
                    <label style="display:flex; align-items:center; gap:6px; font-size:13px; cursor:pointer;">
                        <input type="checkbox" id="buscaRg" checked value="rg" style="width:18px; height:18px; accent-color:var(--azul-bandeira);">
                        RG
                    </label>
                    <label style="display:flex; align-items:center; gap:6px; font-size:13px; cursor:pointer;">
                        <input type="checkbox" id="buscaNome" checked value="nome" style="width:18px; height:18px; accent-color:var(--azul-bandeira);">
                        Nome
                    </label>
                    <label style="display:flex; align-items:center; gap:6px; font-size:13px; cursor:pointer;">
                        <input type="checkbox" id="buscaPlaca" checked value="placa" style="width:18px; height:18px; accent-color:var(--azul-bandeira);">
                        Placa
                    </label>
                </div>
                
                <!-- Área de resultados -->
                <div id="buscaResultadosArea" style="display:none; margin-top:4px;"></div>
                
                <!-- Loading (inicialmente oculto) -->
                <div id="buscaLoadingArea" style="display:none; text-align:center; padding:30px;">
                    <div class="spinner-azul" style="margin:0 auto; width:40px; height:40px; border-width:4px; border-color:var(--cinza-claro); border-top-color:var(--azul-bandeira); border-radius:50%; animation:spin 0.8s linear infinite;"></div>
                    <p style="margin-top:16px; color:var(--cinza-medio); font-size:14px; font-weight:500;">Buscando em todo o sistema...</p>
                    <p style="color:var(--cinza-medio); font-size:12px;">Isso pode levar alguns segundos</p>
                </div>
            </div>
            
            <!-- Footer -->
            <div class="modal-footer" style="padding:12px 20px 16px 20px; border-top:1px solid var(--cinza-claro); display:flex; gap:10px; flex-shrink: 0; border-radius: 0 0 20px 20px; background: var(--branco);">
                <button onclick="this.closest('.busca-profunda-modal').remove()" class="btn-secondary" 
                    style="flex:1; padding:12px; border-radius:12px; font-size:14px; font-weight:600; background:var(--cinza-claro); color:var(--cinza-escuro); border:none; cursor:pointer; transition:all 0.3s ease; min-height:44px;">
                    <i class="fas fa-times" style="margin-right:6px;"></i> Fechar
                </button>
                <button onclick="window._buscaProfundaLimpar()" class="btn-secondary" 
                    style="flex:1; padding:12px; border-radius:12px; font-size:14px; font-weight:600; background:var(--azul-muito-claro); color:var(--azul-bandeira); border:none; cursor:pointer; transition:all 0.3s ease; min-height:44px;">
                    <i class="fas fa-undo" style="margin-right:6px;"></i> Limpar
                </button>
            </div>
        </div>
    `;

  document.body.appendChild(overlay);

  // Registrar funções globais
  window._buscaProfundaExecutar = async function () {
    await executarBuscaProfunda(appInstance);
  };

  window._buscaProfundaLimpar = function () {
    const termo = document.getElementById("buscaTermo");
    const area = document.getElementById("buscaResultadosArea");
    const loading = document.getElementById("buscaLoadingArea");
    if (termo) termo.value = "";
    if (area) {
      area.style.display = "none";
      area.innerHTML = "";
    }
    if (loading) loading.style.display = "none";
    if (termo) termo.focus();
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Campos limpos", "info");
    }
  };

  // Foco no campo de busca
  setTimeout(() => {
    const termo = document.getElementById("buscaTermo");
    if (termo) termo.focus();
  }, 400);

  // Fechar ao clicar fora
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      overlay.remove();
      // Limpar funções globais
      delete window._buscaProfundaExecutar;
      delete window._buscaProfundaLimpar;
    }
  });

  // Fechar com ESC
  const keyHandler = (e) => {
    if (e.key === "Escape") {
      overlay.remove();
      document.removeEventListener("keydown", keyHandler);
      delete window._buscaProfundaExecutar;
      delete window._buscaProfundaLimpar;
    }
  };
  document.addEventListener("keydown", keyHandler);
}

// ============================================
// EXECUTAR BUSCA PROFUNDA
// ============================================

async function executarBuscaProfunda(appInstance) {
  if (buscaEmAndamento) {
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Aguarde a busca atual terminar", "warning");
    }
    return;
  }

  const termo = document.getElementById("buscaTermo")?.value?.trim();
  if (!termo) {
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Digite um termo para buscar", "warning");
    }
    return;
  }

  if (termo.length < 2) {
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Digite pelo menos 2 caracteres", "warning");
    }
    return;
  }

  // Verificar quais tipos estão selecionados
  const tipos = [];
  if (document.getElementById("buscaCpf")?.checked) tipos.push("cpf");
  if (document.getElementById("buscaRg")?.checked) tipos.push("rg");
  if (document.getElementById("buscaNome")?.checked) tipos.push("nome");
  if (document.getElementById("buscaPlaca")?.checked) tipos.push("placa");

  if (tipos.length === 0) {
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Selecione pelo menos um tipo de busca", "warning");
    }
    return;
  }

  // Mostrar loading
  const area = document.getElementById("buscaResultadosArea");
  const loading = document.getElementById("buscaLoadingArea");
  if (area) area.style.display = "none";
  if (loading) loading.style.display = "block";

  buscaEmAndamento = true;
  ultimaBusca = { termo, tipos };

  try {
    const client = supabaseClient.getClient();
    if (!client) throw new Error("Erro ao conectar ao servidor");

    // Buscar em todas as tabelas
    const results = await buscarEmTodasTabelas(client, termo, tipos);

    // Esconder loading
    if (loading) loading.style.display = "none";

    // Renderizar resultados
    if (area) {
      area.style.display = "block";
      area.innerHTML = renderizarResultados(results, termo, appInstance);

      // Adicionar eventos aos itens clicáveis
      area.querySelectorAll(".busca-item-clickable").forEach((el) => {
        el.addEventListener("click", function () {
          const tipo = this.dataset.tipo;
          const id = this.dataset.id;
          if (tipo === "ocorrencia" && id) {
            if (appInstance && appInstance.navigateTo) {
              appInstance.navigateTo("detalhe-ocorrencia", { id });
              // Fechar modal
              const modal = document.querySelector(".busca-profunda-modal");
              if (modal) modal.remove();
            }
          } else if (tipo === "envolvido") {
            // Mostrar ocorrência relacionada
            const ocorrenciaId = this.dataset.ocorrenciaId;
            if (ocorrenciaId && appInstance && appInstance.navigateTo) {
              appInstance.navigateTo("detalhe-ocorrencia", {
                id: ocorrenciaId,
              });
              const modal = document.querySelector(".busca-profunda-modal");
              if (modal) modal.remove();
            }
          } else if (tipo === "abordagem") {
            if (appInstance && appInstance.showToast) {
              appInstance.showToast(
                "Detalhes da abordagem disponíveis na Consulta Operacional",
                "info",
              );
            }
            // Navegar para consulta
            if (appInstance && appInstance.navigateTo) {
              appInstance.navigateTo("consulta");
              const modal = document.querySelector(".busca-profunda-modal");
              if (modal) modal.remove();
            }
          }
        });
      });

      // Botão de exportar
      const btnExport = area.querySelector("#btnExportarResultados");
      if (btnExport) {
        btnExport.addEventListener("click", () => {
          exportarResultados(results, termo, appInstance);
        });
      }

      // Botão de fechar resultados
      const btnFecharResultados = area.querySelector("#btnFecharResultados");
      if (btnFecharResultados) {
        btnFecharResultados.addEventListener("click", () => {
          if (area) {
            area.style.display = "none";
            area.innerHTML = "";
          }
          const termoInput = document.getElementById("buscaTermo");
          if (termoInput) termoInput.focus();
        });
      }
    }

    if (appInstance && appInstance.showToast) {
      const total = contarTotalResultados(results);
      appInstance.showToast(`🔍 ${total} registro(s) encontrado(s)`, "success");
    }
  } catch (error) {
    console.error("Erro na busca profunda:", error);
    if (loading) loading.style.display = "none";
    if (area) {
      area.style.display = "block";
      area.innerHTML = `
                <div style="text-align:center; padding:30px; color:var(--erro); background:var(--erro-claro); border-radius:var(--border-radius); border:1px solid var(--erro);">
                    <i class="fas fa-exclamation-triangle" style="font-size:36px; display:block; margin-bottom:12px;"></i>
                    <p style="font-size:15px; font-weight:600;">Erro ao realizar busca</p>
                    <p style="font-size:13px; color:var(--cinza-escuro);">${error.message}</p>
                    <button onclick="window._buscaProfundaExecutar()" class="btn-primary" style="margin-top:12px; padding:8px 20px; border-radius:8px; font-size:13px;">
                        <i class="fas fa-redo" style="margin-right:6px;"></i> Tentar novamente
                    </button>
                </div>
            `;
    }
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Erro na busca: " + error.message, "error");
    }
  } finally {
    buscaEmAndamento = false;
  }
}

// ============================================
// BUSCAR EM TODAS AS TABELAS
// ============================================

async function buscarEmTodasTabelas(client, termo, tipos) {
  const results = {
    ocorrencias: [],
    envolvidos: [],
    abordagens_veiculos: [],
    abordagens_pessoas: [],
    usuarios: [],
  };

  const termoLike = `%${termo}%`;
  const termoExact = termo;

  // --- BUSCAR EM OCORRÊNCIAS ---
  if (tipos.includes("cpf") || tipos.includes("nome")) {
    try {
      let query = client
        .from("ocorrencias")
        .select("*, usuarios(nome_completo)");
      const conditions = [];
      if (tipos.includes("cpf")) {
        conditions.push(`cpf_solicitante.ilike.${termoLike}`);
      }
      if (tipos.includes("nome")) {
        conditions.push(`nome_solicitante.ilike.${termoLike}`);
      }
      if (conditions.length > 0) {
        query = query.or(conditions.join(","));
        const { data, error } = await query
          .order("criado_em", { ascending: false })
          .limit(30);
        if (!error && data) {
          results.ocorrencias = data;
        }
      }
    } catch (e) {
      console.warn("Erro ao buscar ocorrências:", e);
    }
  }

  // --- BUSCAR EM ENVOLVIDOS ---
  if (tipos.includes("cpf") || tipos.includes("rg") || tipos.includes("nome")) {
    try {
      let query = client
        .from("envolvidos")
        .select(
          "*, ocorrencias(id, numero_ocorrencia, numero_temporario, status, tipo_ocorrencia, local_ocorrencia, criado_em)",
        );
      const conditions = [];
      if (tipos.includes("cpf")) {
        conditions.push(`cpf.ilike.${termoLike}`);
      }
      if (tipos.includes("rg")) {
        conditions.push(`rg.ilike.${termoLike}`);
      }
      if (tipos.includes("nome")) {
        conditions.push(`nome_completo.ilike.${termoLike}`);
      }
      if (conditions.length > 0) {
        query = query.or(conditions.join(","));
        const { data, error } = await query
          .order("criado_em", { ascending: false })
          .limit(30);
        if (!error && data) {
          results.envolvidos = data;
        }
      }
    } catch (e) {
      console.warn("Erro ao buscar envolvidos:", e);
    }
  }

  // --- BUSCAR EM ABORDAGENS DE VEÍCULOS ---
  if (
    tipos.includes("placa") ||
    tipos.includes("cpf") ||
    tipos.includes("nome")
  ) {
    try {
      let query = client
        .from("abordagens_veiculos")
        .select("*, usuarios(nome_completo)");
      const conditions = [];
      if (tipos.includes("placa")) {
        conditions.push(`placa.ilike.${termoLike}`);
      }
      if (tipos.includes("cpf")) {
        conditions.push(`condutor_cpf.ilike.${termoLike}`);
      }
      if (tipos.includes("nome")) {
        conditions.push(`condutor_nome.ilike.${termoLike}`);
      }
      if (conditions.length > 0) {
        query = query.or(conditions.join(","));
        const { data, error } = await query
          .order("criado_em", { ascending: false })
          .limit(30);
        if (!error && data) {
          results.abordagens_veiculos = data;
        }
      }
    } catch (e) {
      console.warn("Erro ao buscar abordagens de veículos:", e);
    }
  }

  // --- BUSCAR EM ABORDAGENS DE PESSOAS ---
  if (tipos.includes("cpf") || tipos.includes("rg") || tipos.includes("nome")) {
    try {
      let query = client
        .from("abordagens_pessoas")
        .select("*, usuarios(nome_completo)");
      const conditions = [];
      if (tipos.includes("cpf")) {
        conditions.push(`cpf.ilike.${termoLike}`);
      }
      if (tipos.includes("rg")) {
        conditions.push(`rg.ilike.${termoLike}`);
      }
      if (tipos.includes("nome")) {
        conditions.push(`nome.ilike.${termoLike}`);
        conditions.push(`alcunha.ilike.${termoLike}`);
      }
      if (conditions.length > 0) {
        query = query.or(conditions.join(","));
        const { data, error } = await query
          .order("criado_em", { ascending: false })
          .limit(30);
        if (!error && data) {
          results.abordagens_pessoas = data;
        }
      }
    } catch (e) {
      console.warn("Erro ao buscar abordagens de pessoas:", e);
    }
  }

  // --- BUSCAR EM USUÁRIOS (apenas para supervisores) ---
  if (
    authManager.isSupervisor() &&
    (tipos.includes("cpf") || tipos.includes("nome"))
  ) {
    try {
      let query = client
        .from("usuarios")
        .select("id, nome_completo, cpf, matricula, perfil, status");
      const conditions = [];
      if (tipos.includes("cpf")) {
        conditions.push(`cpf.ilike.${termoLike}`);
      }
      if (tipos.includes("nome")) {
        conditions.push(`nome_completo.ilike.${termoLike}`);
      }
      if (conditions.length > 0) {
        query = query.or(conditions.join(","));
        const { data, error } = await query.limit(10);
        if (!error && data) {
          results.usuarios = data;
        }
      }
    } catch (e) {
      console.warn("Erro ao buscar usuários:", e);
    }
  }

  return results;
}

// ============================================
// RENDERIZAR RESULTADOS
// ============================================

function renderizarResultados(results, termo, appInstance) {
  const total = contarTotalResultados(results);

  if (total === 0) {
    return `
            <div style="text-align:center; padding:40px 20px; background:var(--branco); border-radius:var(--border-radius); border:1px solid var(--cinza-claro);">
                <i class="fas fa-search" style="font-size:48px; display:block; margin-bottom:16px; color:var(--cinza-claro);"></i>
                <p style="font-size:16px; font-weight:600; color:var(--cinza-escuro);">Nenhum resultado encontrado</p>
                <p style="font-size:14px; color:var(--cinza-medio); margin-top:4px;">Para "<strong>${termo}</strong>"</p>
                <p style="font-size:13px; color:var(--cinza-medio); margin-top:8px;">
                    <i class="fas fa-lightbulb" style="margin-right:4px;"></i>
                    Dica: Verifique os filtros selecionados ou tente outro termo
                </p>
                <button onclick="window._buscaProfundaLimpar()" class="btn-secondary" style="margin-top:16px; padding:8px 20px; border-radius:8px; font-size:13px;">
                    <i class="fas fa-undo" style="margin-right:6px;"></i> Nova busca
                </button>
            </div>
        `;
  }

  let html = `
        <div style="background:var(--branco); border-radius:var(--border-radius); padding:16px; border:1px solid var(--cinza-claro);">
            <!-- Cabeçalho -->
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
                <div>
                    <h4 style="margin:0; color:var(--azul-bandeira); font-size:15px; display:flex; align-items:center; gap:8px;">
                        <i class="fas fa-file-alt"></i>
                        Resultados para "<strong>${termo}</strong>"
                        <span style="font-weight:400; color:var(--cinza-medio); font-size:13px; margin-left:4px;">
                            (${total} registros)
                        </span>
                    </h4>
                </div>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    <button id="btnExportarResultados" class="btn-secondary" 
                        style="padding:6px 14px; font-size:11px; min-height:auto; width:auto; border-radius:8px; background:var(--verde-muito-claro); color:var(--verde-escuro); border:1px solid var(--verde-bandeira);">
                        <i class="fas fa-file-export" style="margin-right:4px;"></i> Exportar CSV
                    </button>
                    <button id="btnFecharResultados" class="btn-secondary" 
                        style="padding:6px 14px; font-size:11px; min-height:auto; width:auto; border-radius:8px; background:var(--cinza-claro); color:var(--cinza-escuro); border:1px solid var(--cinza-claro);">
                        <i class="fas fa-times"></i> Fechar
                    </button>
                </div>
            </div>
    `;

  // --- OCORRÊNCIAS ---
  if (results.ocorrencias.length > 0) {
    html += `
            <div style="margin-bottom:14px; background:var(--azul-muito-claro); border-radius:var(--border-radius); padding:10px 14px; border-left:4px solid var(--azul-bandeira);">
                <h5 style="margin:0 0 8px 0; font-size:13px; color:var(--azul-bandeira); display:flex; align-items:center; gap:8px;">
                    <i class="fas fa-file-alt"></i>
                    Ocorrências (${results.ocorrencias.length})
                </h5>
                ${results.ocorrencias
                  .slice(0, 10)
                  .map((occ) => {
                    const numero =
                      occ.numero_ocorrencia ||
                      occ.numero_temporario ||
                      "Rascunho";
                    const tipoLabel = getTipoLabel(occ.tipo_ocorrencia);
                    const statusLabel = getStatusLabel(occ.status);
                    const statusClass = getStatusClass(occ.status);
                    const data = occ.criado_em
                      ? formatarDataHoraLocal(occ.criado_em)
                      : "";
                    const criador =
                      occ.usuarios?.nome_completo || "Desconhecido";

                    return `
                        <div class="busca-item-clickable" data-tipo="ocorrencia" data-id="${occ.id}"
                            style="padding:8px 12px; margin-bottom:4px; background:var(--branco); border-radius:8px; cursor:pointer; border:1px solid var(--cinza-claro); transition:all 0.15s ease; display:flex; justify-content:space-between; align-items:center; font-size:13px; flex-wrap:wrap; gap:4px;">
                            <span style="display:flex; align-items:center; flex-wrap:wrap; gap:6px;">
                                <strong style="color:var(--azul-bandeira);">#${numero}</strong>
                                <span class="badge badge-${statusClass}" style="font-size:9px; padding:2px 10px;">${statusLabel}</span>
                                <span style="color:var(--cinza-escuro);">${tipoLabel}</span>
                            </span>
                            <span style="display:flex; align-items:center; gap:8px; font-size:11px; color:var(--cinza-medio); flex-wrap:wrap;">
                                <span><i class="fas fa-map-marker-alt"></i> ${occ.local_ocorrencia || "N/A"}</span>
                                <span><i class="fas fa-user"></i> ${criador}</span>
                                <span><i class="fas fa-calendar"></i> ${data}</span>
                            </span>
                        </div>
                    `;
                  })
                  .join("")}
                ${results.ocorrencias.length > 10 ? `<div style="font-size:11px; color:var(--cinza-medio); text-align:center; padding:4px; background:var(--branco); border-radius:6px;">+ ${results.ocorrencias.length - 10} outras ocorrências</div>` : ""}
            </div>
        `;
  }

  // --- ENVOLVIDOS ---
  if (results.envolvidos.length > 0) {
    html += `
            <div style="margin-bottom:14px; background:var(--verde-muito-claro); border-radius:var(--border-radius); padding:10px 14px; border-left:4px solid var(--verde-bandeira);">
                <h5 style="margin:0 0 8px 0; font-size:13px; color:var(--verde-escuro); display:flex; align-items:center; gap:8px;">
                    <i class="fas fa-users"></i>
                    Envolvidos (${results.envolvidos.length})
                </h5>
                ${results.envolvidos
                  .slice(0, 10)
                  .map((env) => {
                    const tipoLabel = getTipoEnvolvidoLabel(env.tipo);
                    const occNumero =
                      env.ocorrencias?.numero_ocorrencia ||
                      env.ocorrencias?.numero_temporario ||
                      "Sem número";
                    const occId = env.ocorrencias?.id;
                    const data = env.criado_em
                      ? formatarDataHoraLocal(env.criado_em)
                      : "";

                    return `
                        <div class="busca-item-clickable" data-tipo="envolvido" data-id="${env.id}" data-ocorrencia-id="${occId || ""}"
                            style="padding:8px 12px; margin-bottom:4px; background:var(--branco); border-radius:8px; cursor:pointer; border:1px solid var(--cinza-claro); transition:all 0.15s ease; display:flex; justify-content:space-between; align-items:center; font-size:13px; flex-wrap:wrap; gap:4px;">
                            <span style="display:flex; align-items:center; flex-wrap:wrap; gap:6px;">
                                <strong>${env.nome_completo}</strong>
                                <span class="badge badge-azul" style="font-size:9px; padding:2px 10px;">${tipoLabel}</span>
                                ${env.cpf ? `<span style="color:var(--cinza-medio); font-size:11px;">${env.cpf}</span>` : ""}
                            </span>
                            <span style="display:flex; align-items:center; gap:6px; font-size:11px; color:var(--cinza-medio); flex-wrap:wrap;">
                                <span><i class="fas fa-hashtag"></i> ${occNumero}</span>
                                <span><i class="fas fa-calendar"></i> ${data}</span>
                                <span style="font-size:10px; color:var(--azul-bandeira);"><i class="fas fa-arrow-right"></i> Ver ocorrência</span>
                            </span>
                        </div>
                    `;
                  })
                  .join("")}
                ${results.envolvidos.length > 10 ? `<div style="font-size:11px; color:var(--cinza-medio); text-align:center; padding:4px; background:var(--branco); border-radius:6px;">+ ${results.envolvidos.length - 10} outros envolvidos</div>` : ""}
            </div>
        `;
  }

  // --- ABORDAGENS DE VEÍCULOS ---
  if (results.abordagens_veiculos.length > 0) {
    html += `
            <div style="margin-bottom:14px; background:#e0f2fe; border-radius:var(--border-radius); padding:10px 14px; border-left:4px solid #0284c7;">
                <h5 style="margin:0 0 8px 0; font-size:13px; color:#0284c7; display:flex; align-items:center; gap:8px;">
                    <i class="fas fa-motorcycle"></i>
                    Abordagens de Veículos (${results.abordagens_veiculos.length})
                </h5>
                ${results.abordagens_veiculos
                  .slice(0, 10)
                  .map((ab) => {
                    const faseLabel =
                      ab.fase === "multa" ? "💰 Multa" : "⚠️ Advertência";
                    const faseClass =
                      ab.fase === "multa" ? "badge-cancelled" : "badge-pending";
                    const data = ab.criado_em
                      ? formatarDataHoraLocal(ab.criado_em)
                      : "";
                    const guarda = ab.usuarios?.nome_completo || "Desconhecido";

                    return `
                        <div class="busca-item-clickable" data-tipo="abordagem" data-id="${ab.id}"
                            style="padding:8px 12px; margin-bottom:4px; background:var(--branco); border-radius:8px; cursor:pointer; border:1px solid var(--cinza-claro); transition:all 0.15s ease; display:flex; justify-content:space-between; align-items:center; font-size:13px; flex-wrap:wrap; gap:4px;">
                            <span style="display:flex; align-items:center; flex-wrap:wrap; gap:6px;">
                                <strong style="color:#0284c7;">${ab.placa}</strong>
                                ${ab.marca_modelo ? `<span style="color:var(--cinza-escuro);">${ab.marca_modelo}</span>` : ""}
                                <span class="badge ${faseClass}" style="font-size:9px; padding:2px 10px;">${faseLabel}</span>
                            </span>
                            <span style="display:flex; align-items:center; gap:6px; font-size:11px; color:var(--cinza-medio); flex-wrap:wrap;">
                                <span><i class="fas fa-user"></i> ${guarda}</span>
                                <span><i class="fas fa-calendar"></i> ${data}</span>
                                ${ab.motivo ? `<span style="max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${ab.motivo}</span>` : ""}
                            </span>
                        </div>
                    `;
                  })
                  .join("")}
                ${results.abordagens_veiculos.length > 10 ? `<div style="font-size:11px; color:var(--cinza-medio); text-align:center; padding:4px; background:var(--branco); border-radius:6px;">+ ${results.abordagens_veiculos.length - 10} outras abordagens</div>` : ""}
            </div>
        `;
  }

  // --- ABORDAGENS DE PESSOAS ---
  if (results.abordagens_pessoas.length > 0) {
    html += `
            <div style="margin-bottom:14px; background:#fce7f3; border-radius:var(--border-radius); padding:10px 14px; border-left:4px solid #db2777;">
                <h5 style="margin:0 0 8px 0; font-size:13px; color:#db2777; display:flex; align-items:center; gap:8px;">
                    <i class="fas fa-user-friends"></i>
                    Abordagens de Pessoas (${results.abordagens_pessoas.length})
                </h5>
                ${results.abordagens_pessoas
                  .slice(0, 10)
                  .map((ab) => {
                    const faseLabel =
                      ab.fase === "multa" ? "💰 Multa" : "⚠️ Advertência";
                    const faseClass =
                      ab.fase === "multa" ? "badge-cancelled" : "badge-pending";
                    const data = ab.criado_em
                      ? formatarDataHoraLocal(ab.criado_em)
                      : "";
                    const guarda = ab.usuarios?.nome_completo || "Desconhecido";

                    return `
                        <div class="busca-item-clickable" data-tipo="abordagem" data-id="${ab.id}"
                            style="padding:8px 12px; margin-bottom:4px; background:var(--branco); border-radius:8px; cursor:pointer; border:1px solid var(--cinza-claro); transition:all 0.15s ease; display:flex; justify-content:space-between; align-items:center; font-size:13px; flex-wrap:wrap; gap:4px;">
                            <span style="display:flex; align-items:center; flex-wrap:wrap; gap:6px;">
                                <strong style="color:#db2777;">${ab.nome}</strong>
                                ${ab.alcunha ? `<span style="color:var(--cinza-medio); font-size:11px;">(${ab.alcunha})</span>` : ""}
                                <span class="badge ${faseClass}" style="font-size:9px; padding:2px 10px;">${faseLabel}</span>
                            </span>
                            <span style="display:flex; align-items:center; gap:6px; font-size:11px; color:var(--cinza-medio); flex-wrap:wrap;">
                                <span><i class="fas fa-user"></i> ${guarda}</span>
                                <span><i class="fas fa-calendar"></i> ${data}</span>
                                ${ab.motivo ? `<span style="max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${ab.motivo}</span>` : ""}
                            </span>
                        </div>
                    `;
                  })
                  .join("")}
                ${results.abordagens_pessoas.length > 10 ? `<div style="font-size:11px; color:var(--cinza-medio); text-align:center; padding:4px; background:var(--branco); border-radius:6px;">+ ${results.abordagens_pessoas.length - 10} outras abordagens</div>` : ""}
            </div>
        `;
  }

  // --- USUÁRIOS (apenas supervisor) ---
  if (results.usuarios.length > 0 && authManager.isSupervisor()) {
    html += `
            <div style="margin-bottom:14px; background:#f3e8ff; border-radius:var(--border-radius); padding:10px 14px; border-left:4px solid #8b5cf6;">
                <h5 style="margin:0 0 8px 0; font-size:13px; color:#8b5cf6; display:flex; align-items:center; gap:8px;">
                    <i class="fas fa-user-shield"></i>
                    Usuários (${results.usuarios.length})
                </h5>
                ${results.usuarios
                  .map((u) => {
                    const perfilLabel =
                      u.perfil === "supervisor" ? "Supervisor" : "Guarda";
                    const perfilClass =
                      u.perfil === "supervisor" ? "badge-azul" : "badge-verde";
                    const statusLabel =
                      u.status === "ativo"
                        ? "Ativo"
                        : u.status === "inativo"
                          ? "Inativo"
                          : "Bloqueado";
                    const statusClass =
                      u.status === "ativo"
                        ? "badge-synced"
                        : u.status === "inativo"
                          ? "badge-cancelled"
                          : "badge-error";

                    return `
                        <div style="padding:6px 12px; margin-bottom:2px; background:var(--branco); border-radius:6px; display:flex; justify-content:space-between; align-items:center; font-size:13px; flex-wrap:wrap; gap:4px; border:1px solid var(--cinza-claro);">
                            <span style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                <strong>${u.nome_completo}</strong>
                                <span class="badge ${perfilClass}" style="font-size:9px; padding:2px 10px;">${perfilLabel}</span>
                                <span class="badge ${statusClass}" style="font-size:9px; padding:2px 10px;">${statusLabel}</span>
                            </span>
                            <span style="display:flex; align-items:center; gap:6px; font-size:11px; color:var(--cinza-medio);">
                                <span><i class="fas fa-id-card"></i> ${u.cpf}</span>
                                ${u.matricula ? `<span><i class="fas fa-hashtag"></i> ${u.matricula}</span>` : ""}
                            </span>
                        </div>
                    `;
                  })
                  .join("")}
            </div>
        `;
  }

  // --- REINCIDÊNCIA ---
  const reincidentes = detectarReincidencia(results);
  if (reincidentes.length > 0) {
    html += `
            <div style="margin-top:12px; padding:10px 14px; background:#fef3c7; border-radius:var(--border-radius); border-left:4px solid var(--aviso);">
                <p style="margin:0; font-size:13px; color:#92400e; display:flex; align-items:flex-start; gap:8px;">
                    <i class="fas fa-exclamation-triangle" style="color:var(--aviso); margin-top:2px;"></i>
                    <span>
                        <strong>Reincidência detectada:</strong> 
                        ${reincidentes
                          .map(
                            (r, i) =>
                              `<span style="font-weight:600;">${r.nome}</span> (${r.total} registros)${i < reincidentes.length - 1 ? ", " : ""}`,
                          )
                          .join("")}
                        <span style="display:block; font-size:12px; color:#92400e; margin-top:4px;">
                            <i class="fas fa-lightbulb" style="margin-right:4px;"></i>
                            Recomenda-se atenção especial a estes casos.
                        </span>
                    </span>
                </p>
            </div>
        `;
  }

  // --- RODAPÉ ---
  html += `
            <div style="margin-top:12px; padding-top:10px; border-top:1px solid var(--cinza-claro); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                <span style="font-size:11px; color:var(--cinza-medio);">
                    <i class="fas fa-clock" style="margin-right:4px;"></i>
                    Busca realizada em ${new Date().toLocaleString("pt-BR")}
                </span>
                <span style="font-size:11px; color:var(--cinza-medio);">
                    <i class="fas fa-database" style="margin-right:4px;"></i>
                    ${total} registro(s) encontrado(s)
                </span>
            </div>
        </div>
    `;

  return html;
}

// ============================================
// DETECTAR REINCIDÊNCIA
// ============================================

function detectarReincidencia(results) {
  const contagem = {};

  // Contar por nome em ocorrências
  results.ocorrencias.forEach((occ) => {
    if (occ.nome_solicitante) {
      const nome = occ.nome_solicitante.trim().toLowerCase();
      if (!contagem[nome]) {
        contagem[nome] = { nome: occ.nome_solicitante, total: 0, tipos: [] };
      }
      contagem[nome].total++;
      if (
        occ.tipo_ocorrencia &&
        !contagem[nome].tipos.includes(occ.tipo_ocorrencia)
      ) {
        contagem[nome].tipos.push(occ.tipo_ocorrencia);
      }
    }
  });

  // Contar por nome em envolvidos
  results.envolvidos.forEach((env) => {
    if (env.nome_completo) {
      const nome = env.nome_completo.trim().toLowerCase();
      if (!contagem[nome]) {
        contagem[nome] = { nome: env.nome_completo, total: 0, tipos: [] };
      }
      contagem[nome].total++;
    }
  });

  // Contar por nome em abordagens de pessoas
  results.abordagens_pessoas.forEach((ab) => {
    if (ab.nome) {
      const nome = ab.nome.trim().toLowerCase();
      if (!contagem[nome]) {
        contagem[nome] = { nome: ab.nome, total: 0, tipos: [] };
      }
      contagem[nome].total++;
    }
  });

  // Filtrar reincidentes (mais de 1 ocorrência)
  return Object.values(contagem)
    .filter((r) => r.total > 1)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
}

// ============================================
// EXPORTAR RESULTADOS
// ============================================

function exportarResultados(results, termo, appInstance) {
  const dados = [];

  // Ocorrências
  results.ocorrencias.forEach((o) => {
    dados.push({
      tipo: "Ocorrência",
      numero: o.numero_ocorrencia || o.numero_temporario || "Rascunho",
      tipo_ocorrencia: getTipoLabel(o.tipo_ocorrencia),
      local: o.local_ocorrencia || "N/A",
      status: getStatusLabel(o.status),
      data: o.criado_em ? formatarDataHoraLocal(o.criado_em) : "N/A",
      solicitante: o.nome_solicitante || "N/A",
    });
  });

  // Envolvidos
  results.envolvidos.forEach((e) => {
    dados.push({
      tipo: "Envolvido",
      nome: e.nome_completo || "N/A",
      papel: getTipoEnvolvidoLabel(e.tipo),
      cpf: e.cpf || "N/A",
      telefone: e.telefone || "N/A",
      ocorrencia: e.ocorrencias?.numero_ocorrencia || "N/A",
      data: e.criado_em ? formatarDataHoraLocal(e.criado_em) : "N/A",
    });
  });

  // Abordagens de veículos
  results.abordagens_veiculos.forEach((a) => {
    dados.push({
      tipo: "Abordagem Veículo",
      placa: a.placa || "N/A",
      modelo: a.marca_modelo || "N/A",
      condutor: a.condutor_nome || "N/A",
      fase: a.fase === "multa" ? "Multa" : "Advertência",
      motivo: a.motivo || "N/A",
      data: a.criado_em ? formatarDataHoraLocal(a.criado_em) : "N/A",
    });
  });

  // Abordagens de pessoas
  results.abordagens_pessoas.forEach((a) => {
    dados.push({
      tipo: "Abordagem Pessoa",
      nome: a.nome || "N/A",
      alcunha: a.alcunha || "N/A",
      fase: a.fase === "multa" ? "Multa" : "Advertência",
      motivo: a.motivo || "N/A",
      data: a.criado_em ? formatarDataHoraLocal(a.criado_em) : "N/A",
    });
  });

  if (dados.length === 0) {
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Nenhum dado para exportar", "warning");
    }
    return;
  }

  // Gerar CSV
  const headers = Object.keys(dados[0]);
  let csv = headers.join(",") + "\n";
  dados.forEach((row) => {
    csv +=
      headers
        .map((h) => {
          const val = row[h] || "";
          if (
            typeof val === "string" &&
            (val.includes(",") || val.includes('"') || val.includes("\n"))
          ) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        })
        .join(",") + "\n";
  });

  // Download
  try {
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `busca_profunda_${termo.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`,
    );
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    if (appInstance && appInstance.showToast) {
      appInstance.showToast(
        `✅ ${dados.length} registros exportados com sucesso!`,
        "success",
      );
    }
  } catch (error) {
    console.error("Erro ao exportar:", error);
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Erro ao exportar resultados", "error");
    }
  }
}

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

function contarTotalResultados(results) {
  return (
    results.ocorrencias.length +
    results.envolvidos.length +
    results.abordagens_veiculos.length +
    results.abordagens_pessoas.length +
    results.usuarios.length
  );
}

function getStatusClass(status) {
  const map = {
    draft: "draft",
    pending_sync: "pending",
    syncing: "pending",
    synced: "synced",
    cancelled: "cancelled",
    rectified: "rectified",
    pending_rectification: "pending_rectification",
    rectification_rejected: "rectification_rejected",
    sync_error: "error",
  };
  return map[status] || "draft";
}

function getStatusLabel(status) {
  const map = {
    draft: "Rascunho",
    pending_sync: "Pendente",
    syncing: "Sincronizando",
    synced: "Finalizada",
    cancelled: "Cancelada",
    rectified: "Retificada",
    pending_rectification: "Retif. Pendente",
    rectification_rejected: "Retif. Rejeitada",
    sync_error: "Erro",
  };
  return map[status] || status;
}

function getTipoLabel(value) {
  const encontrado = TIPOS_OCORRENCIA.find((t) => t.value === value);
  return encontrado ? encontrado.label : value || "Não informado";
}

function getTipoEnvolvidoLabel(tipo) {
  const map = {
    autor: "Autor",
    vitima: "Vítima",
    testemunha: "Testemunha",
    solicitante: "Solicitante",
    outro: "Outro",
  };
  return map[tipo] || tipo;
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

// ============================================
// EXPORTAÇÕES
// ============================================

export default {
  abrirBuscaProfunda,
  executarBuscaProfunda,
};
