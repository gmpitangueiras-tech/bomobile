/**
 * MÓDULO OCORRÊNCIAS LISTA - Listagem com layout moderno
 * Guarda Municipal de Pitangueiras - PR
 *
 * Layout baseado no design da imagem fornecida:
 * - Cabeçalho com título e subtítulo
 * - Filtros compactos: Status, Tipo, Período, Guarda
 * - Cards de ocorrência com miniatura, observações e botões
 * - Badge ⚡ RÁPIDO para ocorrências em modo rápido
 * - Botão "Completar" para BOs Rápidos não completados
 * - Botões: Ver, Retificar/Editar, Cancelar, Gerar PDF
 * - Cores das tags por tipo/gravidade
 * - Paginação: 5 registros por página
 * - Contador: "Mostrando X registros de Y"
 * - EXPORTAÇÃO EM LOTE: seleção múltipla e exportação de PDF
 * - 🔥 ALTERADO: Filtro para não mostrar assinaturas na galeria de anexos
 *
 * Depende de: authManager (global), supabaseClient (global),
 *             ocorrenciaManager (global), pdfExport (global), utils, ui
 */

// ============================================
// CONSTANTES
// ============================================

const ITENS_POR_PAGINA = 5;

const STATUS_OPCOES = [
  { value: "", label: "Todos os status" },
  { value: "draft", label: "Rascunho" },
  { value: "pending_sync", label: "Pendente" },
  { value: "synced", label: "Finalizada" },
  { value: "rectified", label: "Retificada" },
  { value: "pending_rectification", label: "Retificação Pendente" },
  { value: "cancelled", label: "Cancelada" },
];

const TIPOS_OCORRENCIA = [
  { value: "", label: "Todos os tipos" },
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

// Mapeamento de cores por tipo (gravidade)
const TIPO_CORES = {
  roubo: "badge-tipo-roubo",
  ameaca: "badge-tipo-ameaca",
  lesao_corporal: "badge-tipo-lesao_corporal",
  incendio: "badge-tipo-incendio",
  furto: "badge-tipo-furto",
  vandalismo: "badge-tipo-vandalismo",
  dano_ao_patrimonio: "badge-tipo-dano_ao_patrimonio",
  perturbacao: "badge-tipo-perturbacao",
  acidente: "badge-tipo-acidente",
  desaparecimento: "badge-tipo-desaparecimento",
  atendimento_social: "badge-tipo-atendimento_social",
  outro: "badge-tipo-outro",
};

// ============================================
// ESTADO DO MÓDULO
// ============================================

let estado = {
  filtros: {
    status: "",
    tipo: "",
    dataInicio: "",
    dataFim: "",
    guarda: "",
    search: "",
  },
  ocorrencias: [],
  totalRegistros: 0,
  totalPaginas: 0,
  paginaAtual: 1,
  carregando: false,
  listaGuardas: [],
  filtrosVisiveis: false,
  // Estado para seleção em lote
  selecionados: new Set(),
  modoSelecao: false,
};

// ============================================
// FUNÇÃO PRINCIPAL
// ============================================

/**
 * Renderiza a página de listagem de ocorrências com layout moderno
 * @param {HTMLElement} container - Elemento onde renderizar
 * @param {Object} appInstance - Instância do app
 */
export async function renderOcorrencias(container, appInstance) {
  // Verificar autenticação
  if (typeof authManager === "undefined" || !authManager.isLoggedIn()) {
    container.innerHTML = renderAcessoNegado(appInstance);
    return;
  }

  // Mostrar loader
  container.innerHTML = renderLoader();

  try {
    // Carregar lista de guardas para o filtro
    await carregarListaGuardas();

    // Carregar ocorrências
    await carregarOcorrencias();

    // Resetar seleção ao carregar a página
    estado.selecionados = new Set();
    estado.modoSelecao = false;

    // Renderizar
    renderizarLista(container, appInstance);

    // Registrar funções globais
    window._ocorrenciasAplicarFiltros = () =>
      aplicarFiltros(container, appInstance);
    window._ocorrenciasLimparFiltros = () =>
      limparFiltros(container, appInstance);
    window._ocorrenciasToggleFiltros = () =>
      toggleFiltros(container, appInstance);
    window._ocorrenciasVer = (id) => verOcorrencia(id, appInstance);
    window._ocorrenciasRetificar = (id) => retificarOcorrencia(id, appInstance);
    window._ocorrenciasEditar = (id) => editarOcorrencia(id, appInstance);
    window._ocorrenciasCancelar = (id) => cancelarOcorrencia(id, appInstance);
    window._ocorrenciasGerarPDF = (id) => gerarPDF(id, appInstance);
    window._ocorrenciasCompletar = (id) => completarOcorrencia(id, appInstance);
    window._ocorrenciasNova = () => appInstance.navigateTo("nova-ocorrencia");
    window._ocorrenciasRecarregar = () =>
      renderOcorrencias(container, appInstance);
    window._ocorrenciasPagina = (pagina) =>
      irParaPagina(pagina, container, appInstance);
    window._ocorrenciasVerMaisObservacoes = (id) =>
      verMaisObservacoes(id, appInstance);
    window._ocorrenciasBuscar = (termo) => {
      clearTimeout(estado._timeoutBusca);
      estado._timeoutBusca = setTimeout(() => {
        estado.filtros.search = termo.trim();
        estado.paginaAtual = 1;
        estado.selecionados = new Set();
        renderOcorrencias(container, appInstance);
      }, 400);
    };
    // NOVAS FUNÇÕES PARA EXPORTAÇÃO EM LOTE
    window._ocorrenciasSelecionarTodos = () =>
      selecionarTodos(container, appInstance);
    window._ocorrenciasDesselecionarTodos = () =>
      desselecionarTodos(container, appInstance);
    window._ocorrenciasToggleSelecao = (id) =>
      toggleSelecao(id, container, appInstance);
    window._ocorrenciasExportarSelecionados = () =>
      exportarSelecionados(appInstance);
    window._ocorrenciasExportarTodos = () => exportarTodos(appInstance);
  } catch (error) {
    console.error("❌ Erro ao renderizar ocorrências:", error);
    container.innerHTML = renderErro(error, appInstance);
  }
}

// ============================================
// CARREGAR DADOS
// ============================================

async function carregarListaGuardas() {
  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) return;

    const { data, error } = await client
      .from("usuarios")
      .select("id, nome_completo, matricula")
      .eq("status", "ativo")
      .order("nome_completo");

    if (error) throw error;
    estado.listaGuardas = data || [];
  } catch (error) {
    console.warn("Erro ao carregar lista de guardas:", error);
    estado.listaGuardas = [];
  }
}

async function carregarOcorrencias(pagina = 1) {
  estado.carregando = true;
  estado.paginaAtual = pagina;

  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) {
      estado.ocorrencias = [];
      estado.totalRegistros = 0;
      estado.totalPaginas = 1;
      estado.carregando = false;
      return;
    }

    const { status, tipo, dataInicio, dataFim, guarda, search } =
      estado.filtros;
    const offset = (pagina - 1) * ITENS_POR_PAGINA;

    // Construir a consulta
    let query = client
      .from("ocorrencias")
      .select("*", { count: "exact" })
      .eq("esta_ativa", true);

    if (status) {
      query = query.eq("status", status);
    }

    if (tipo) {
      query = query.eq("tipo_ocorrencia", tipo);
    }

    if (dataInicio) {
      query = query.gte("criado_em", dataInicio);
    }

    if (dataFim) {
      query = query.lte("criado_em", dataFim + "T23:59:59");
    }

    if (guarda) {
      query = query.eq("criado_por", guarda);
    }

    if (search && search.trim() !== "") {
      const termo = `%${search.trim()}%`;
      query = query.or(
        `numero_ocorrencia.ilike.${termo},numero_temporario.ilike.${termo},local_ocorrencia.ilike.${termo}`,
      );
    }

    // Ordenar e paginar
    query = query
      .order("criado_em", { ascending: false })
      .range(offset, offset + ITENS_POR_PAGINA - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    // Buscar dados dos criadores
    const ocorrencias = data || [];
    if (ocorrencias.length > 0) {
      const idsCriadores = ocorrencias
        .map((o) => o.criado_por)
        .filter((id) => id);
      const dadosUsuarios = await buscarDadosUsuariosEmLote(idsCriadores);

      // Buscar anexos para cada ocorrência
      const ocorrenciasComDados = await Promise.all(
        ocorrencias.map(async (occ) => {
          // Buscar anexos
          const anexosResult = await ocorrenciaManager.listarAnexos(occ.id);
          const anexos = anexosResult.success ? anexosResult.data : [];

          // 🔥 FILTRAR: Remover assinaturas dos anexos (elas são armazenadas separadamente)
          const anexosReais = anexos.filter((a) => a.tipo !== "assinatura");

          // Buscar envolvidos (apenas para contagem)
          const envResult = await ocorrenciaManager.listarEnvolvidos(occ.id);
          const envolvidos = envResult.success ? envResult.data : [];

          return {
            ...occ,
            criador: dadosUsuarios[occ.criado_por] || {
              nome_completo: "Desconhecido",
              cpf: null,
            },
            // 🔥 Usar apenas anexos reais (sem assinaturas)
            anexos: anexosReais,
            // 🔥 Manter assinaturas separadamente (para uso futuro)
            assinaturas: occ.assinaturas || [],
            envolvidos: envolvidos,
          };
        }),
      );

      estado.ocorrencias = ocorrenciasComDados;
    } else {
      estado.ocorrencias = [];
    }

    estado.totalRegistros = count || 0;
    estado.totalPaginas = Math.max(
      1,
      Math.ceil(estado.totalRegistros / ITENS_POR_PAGINA),
    );
  } catch (error) {
    console.error("Erro ao carregar ocorrências:", error);
    estado.ocorrencias = [];
    estado.totalRegistros = 0;
    estado.totalPaginas = 1;
  }

  estado.carregando = false;
}

async function buscarDadosUsuariosEmLote(ids) {
  if (!ids || ids.length === 0) return {};
  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) return {};

    const { data, error } = await client
      .from("usuarios")
      .select("id, nome_completo, cpf")
      .in("id", ids);

    if (error) throw error;
    const resultado = {};
    data.forEach((u) => {
      resultado[u.id] = u;
    });
    return resultado;
  } catch (error) {
    console.warn("Erro ao buscar usuários em lote:", error);
    return {};
  }
}

// ============================================
// RENDERIZAÇÃO PRINCIPAL
// ============================================

function renderizarLista(container, appInstance) {
  const { ocorrencias, totalRegistros, totalPaginas, paginaAtual, filtros } =
    estado;

  const temFiltros =
    filtros.status ||
    filtros.tipo ||
    filtros.dataInicio ||
    filtros.dataFim ||
    filtros.guarda ||
    filtros.search;

  const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA + 1;
  const fim = Math.min(paginaAtual * ITENS_POR_PAGINA, totalRegistros);

  const filtrosAbertos = estado.filtrosVisiveis;
  const totalSelecionados = estado.selecionados.size;

  // Verificar se todos os itens da página atual estão selecionados
  const todosSelecionados =
    ocorrencias.length > 0 &&
    ocorrencias.every((occ) => estado.selecionados.has(occ.id));

  let html = `
    <div class="container" style="padding-bottom:100px;" id="ocorrenciasContainer">
      <!-- Cabeçalho -->
      <div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
          <div>
            <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;font-weight:700;">
              <i class="fas fa-list-ul" style="margin-right:6px;color:var(--azul-bandeira);"></i>
              Minhas Ocorrências
            </h2>
            <p style="color:var(--cinza-medio);font-size:12px;margin:0;">
              Acompanhe e gerencie todos os seus boletins.
            </p>
          </div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            <button onclick="window._ocorrenciasNova()" class="btn-primary" 
              style="padding:6px 14px;font-size:12px;min-height:auto;width:auto;border-radius:30px;background:var(--gradiente-principal);box-shadow:0 2px 12px rgba(0,63,135,0.25);">
              <i class="fas fa-plus" style="margin-right:4px;"></i> Nova
            </button>
            ${
              totalSelecionados > 0
                ? `
              <button onclick="window._ocorrenciasExportarSelecionados()" class="btn-primary" 
                style="padding:6px 14px;font-size:12px;min-height:auto;width:auto;border-radius:30px;background:var(--verde-bandeira);">
                <i class="fas fa-file-pdf" style="margin-right:4px;"></i> 
                Exportar ${totalSelecionados}
              </button>
            `
                : `
              <button onclick="window._ocorrenciasExportarTodos()" class="btn-secondary" 
                style="padding:6px 14px;font-size:12px;min-height:auto;width:auto;border-radius:30px;background:var(--azul-muito-claro);color:var(--azul-bandeira);">
                <i class="fas fa-file-pdf" style="margin-right:4px;"></i> Exportar Tudo
              </button>
            `
            }
          </div>
        </div>
      </div>

      <!-- Filtros compactos -->
      <div class="filtros-ocorrencias" style="padding:8px 10px;margin-bottom:10px;">
        <!-- Linha 1: Filtros principais + toggle -->
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px;">
          <div style="flex:1;min-width:80px;">
            <select id="filtroStatus" style="width:100%;padding:4px 6px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:11px;background:var(--branco);color:var(--cinza-escuro);min-height:32px;" onchange="window._ocorrenciasAplicarFiltros()">
              ${STATUS_OPCOES.map(
                (op) => `
                <option value="${op.value}" ${filtros.status === op.value ? "selected" : ""}>
                  ${op.label}
                </option>
              `,
              ).join("")}
            </select>
          </div>
          <div style="flex:1;min-width:80px;">
            <select id="filtroTipo" style="width:100%;padding:4px 6px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:11px;background:var(--branco);color:var(--cinza-escuro);min-height:32px;" onchange="window._ocorrenciasAplicarFiltros()">
              ${TIPOS_OCORRENCIA.map(
                (op) => `
                <option value="${op.value}" ${filtros.tipo === op.value ? "selected" : ""}>
                  ${op.label}
                </option>
              `,
              ).join("")}
            </select>
          </div>
          <div style="flex:0 0 auto;display:flex;gap:4px;">
            <button onclick="window._ocorrenciasToggleFiltros()" 
              style="padding:4px 10px;min-height:32px;border:2px solid var(--cinza-claro);border-radius:8px;background:${filtrosAbertos ? "var(--azul-muito-claro)" : "var(--branco)"};color:${filtrosAbertos ? "var(--azul-bandeira)" : "var(--cinza-medio)"};font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;">
              <i class="fas fa-sliders-h" style="margin-right:4px;"></i>
              ${filtrosAbertos ? "▲ Menos" : "▼ Mais"}
            </button>
            ${
              temFiltros
                ? `<button onclick="window._ocorrenciasLimparFiltros()" style="padding:4px 8px;min-height:32px;border:2px solid var(--cinza-claro);border-radius:8px;background:var(--branco);color:var(--azul-bandeira);font-size:11px;font-weight:600;cursor:pointer;"><i class="fas fa-times"></i></button>`
                : ""
            }
          </div>
        </div>

        <!-- Linha 2: Busca -->
        <div style="position:relative;">
          <i class="fas fa-search" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--cinza-medio);font-size:12px;z-index:2;"></i>
          <input type="text" id="ocorrenciasBusca" placeholder="Buscar por número ou local..." 
            value="${filtros.search || ""}"
            style="width:100%;padding:6px 10px 6px 32px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:12px;background:var(--branco);color:var(--cinza-escuro);min-height:32px;"
            oninput="window._ocorrenciasBuscar(this.value)">
        </div>

        <!-- Filtros avançados (colapsáveis) -->
        <div id="filtrosAvancados" style="display:${filtrosAbertos ? "block" : "none"};margin-top:6px;padding-top:6px;border-top:1px solid var(--cinza-claro);">
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <div style="flex:1;min-width:80px;">
              <label style="display:block;font-size:9px;font-weight:600;color:var(--cinza-medio);text-transform:uppercase;letter-spacing:0.2px;margin-bottom:1px;">Início</label>
              <input type="date" id="filtroDataInicio" value="${filtros.dataInicio || ""}" 
                style="width:100%;padding:4px 6px;border:2px solid var(--cinza-claro);border-radius:6px;font-size:11px;background:var(--branco);color:var(--cinza-escuro);min-height:30px;"
                onchange="window._ocorrenciasAplicarFiltros()">
            </div>
            <div style="flex:1;min-width:80px;">
              <label style="display:block;font-size:9px;font-weight:600;color:var(--cinza-medio);text-transform:uppercase;letter-spacing:0.2px;margin-bottom:1px;">Fim</label>
              <input type="date" id="filtroDataFim" value="${filtros.dataFim || ""}" 
                style="width:100%;padding:4px 6px;border:2px solid var(--cinza-claro);border-radius:6px;font-size:11px;background:var(--branco);color:var(--cinza-escuro);min-height:30px;"
                onchange="window._ocorrenciasAplicarFiltros()">
            </div>
            <div style="flex:1;min-width:80px;">
              <label style="display:block;font-size:9px;font-weight:600;color:var(--cinza-medio);text-transform:uppercase;letter-spacing:0.2px;margin-bottom:1px;">Guarda</label>
              <select id="filtroGuarda" style="width:100%;padding:4px 6px;border:2px solid var(--cinza-claro);border-radius:6px;font-size:11px;background:var(--branco);color:var(--cinza-escuro);min-height:30px;" onchange="window._ocorrenciasAplicarFiltros()">
                <option value="">Todos</option>
                ${estado.listaGuardas
                  .map(
                    (g) => `
                  <option value="${g.id}" ${filtros.guarda === g.id ? "selected" : ""}>
                    ${g.nome_completo}
                  </option>
                `,
                  )
                  .join("")}
              </select>
            </div>
          </div>
          <div style="display:flex;gap:4px;margin-top:4px;justify-content:flex-end;">
            <button onclick="window._ocorrenciasAplicarFiltros()" class="btn-primary" style="padding:4px 12px;font-size:11px;min-height:30px;width:auto;border-radius:6px;">
              <i class="fas fa-check"></i> Aplicar
            </button>
          </div>
        </div>
      </div>

      <!-- Contador e ações de seleção -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:4px;">
        <span style="font-size:12px;color:var(--cinza-medio);font-weight:500;">
          <i class="fas fa-file-alt" style="margin-right:4px;"></i>
          ${
            totalRegistros > 0
              ? `Mostrando <strong>${inicio}</strong> a <strong>${fim}</strong> de <strong>${totalRegistros}</strong>`
              : "Nenhuma ocorrência encontrada"
          }
          ${temFiltros ? `<span style="color:var(--azul-bandeira);font-weight:600;">(filtrado)</span>` : ""}
        </span>
        <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">
          ${
            totalSelecionados > 0
              ? `
            <span style="font-size:11px;color:var(--azul-bandeira);font-weight:600;">
              ${totalSelecionados} selecionado(s)
            </span>
            <button onclick="window._ocorrenciasDesselecionarTodos()" 
              style="padding:2px 8px;font-size:10px;min-height:auto;width:auto;border:none;border-radius:4px;background:var(--cinza-claro);color:var(--cinza-escuro);cursor:pointer;">
              <i class="fas fa-times"></i> Limpar
            </button>
          `
              : ""
          }
          <button onclick="window._ocorrenciasSelecionarTodos()" 
            style="padding:2px 8px;font-size:10px;min-height:auto;width:auto;border:none;border-radius:4px;background:var(--azul-muito-claro);color:var(--azul-bandeira);cursor:pointer;">
            <i class="fas fa-check-double"></i> ${todosSelecionados ? "Desselecionar" : "Selecionar"} Todos
          </button>
        </div>
      </div>

      <!-- Lista de ocorrências -->
      <div id="listaOcorrencias">
  `;

  if (estado.carregando) {
    html += renderLoaderCards();
  } else if (ocorrencias.length === 0) {
    html += renderVazio(temFiltros);
  } else {
    ocorrencias.forEach((occ) => {
      html += renderOcorrenciaCard(occ, appInstance);
    });
  }

  html += `
      </div>

      <!-- Paginação -->
      ${totalPaginas > 1 ? renderPaginacao(paginaAtual, totalPaginas) : ""}

      <!-- Rodapé -->
      <div style="text-align:center;padding:8px 0;color:var(--cinza-medio);font-size:11px;">
        <i class="fas fa-database" style="margin-right:4px;"></i>
        ${
          totalRegistros > 0
            ? `Exibindo ${ocorrencias.length} de ${totalRegistros} ocorrências`
            : "Nenhuma ocorrência cadastrada"
        }
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Registrar função de busca com debounce
  window._ocorrenciasBuscar = (termo) => {
    clearTimeout(estado._timeoutBusca);
    estado._timeoutBusca = setTimeout(() => {
      estado.filtros.search = termo.trim();
      estado.paginaAtual = 1;
      estado.selecionados = new Set();
      renderOcorrencias(container, appInstance);
    }, 400);
  };

  // Ajustar scroll ao trocar de página
  if (paginaAtual > 1) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

// ============================================
// TOGGLE FILTROS AVANÇADOS
// ============================================

function toggleFiltros(container, appInstance) {
  estado.filtrosVisiveis = !estado.filtrosVisiveis;
  renderOcorrencias(container, appInstance);
}

// ============================================
// RENDERIZAÇÃO: CARD DE OCORRÊNCIA
// ============================================

function renderOcorrenciaCard(occ, appInstance) {
  const numero = occ.numero_ocorrencia || occ.numero_temporario || "Rascunho";
  const statusClass = getStatusClass(occ.status);
  const statusLabel = getStatusLabel(occ.status);
  const data = formatarDataHoraLocal(occ.criado_em);
  const tipoLabel = getTipoLabel(occ.tipo_ocorrencia);
  const tipoClass = TIPO_CORES[occ.tipo_ocorrencia] || "badge-tipo-outro";
  const local = occ.local_ocorrencia || "Local não informado";
  const guardaNome = occ.criador?.nome_completo || "Desconhecido";
  const cpfGuarda = occ.criador?.cpf || "";
  const cpfExibido = formatarCPFSeguro(cpfGuarda);

  const isSelecionado = estado.selecionados.has(occ.id);

  // Verificar se é BO Rápido e se pode ser completado
  const isRapido = occ.modo_criacao === "rapido";
  const isCompletado = !!occ.completado_em;
  const podeCompletar = isRapido && !isCompletado && occ.status !== "cancelled";

  // 🔥 Buscar primeira imagem dos anexos (IGNORANDO assinaturas)
  let primeiraImagem = null;
  let totalImagens = 0;
  let imagens = [];

  // 🔥 Usar anexos já filtrados (sem assinaturas)
  if (occ.anexos && Array.isArray(occ.anexos) && occ.anexos.length > 0) {
    // 🔥 FILTRAR: Apenas imagens que não são assinaturas
    imagens = occ.anexos.filter(
      (a) =>
        (a.tipo_arquivo === "image" || a.tipo === "image") &&
        a.tipo !== "assinatura",
    );
    totalImagens = imagens.length;
    if (totalImagens > 0) {
      primeiraImagem = imagens[0].url_thumb || imagens[0].url;
    }
  }

  // Observações (primeiros 100 caracteres)
  let observacoesPreview = "";
  let observacoesCompleta = "";
  let temObservacoes = false;

  if (occ.observacoes && occ.observacoes.trim() !== "") {
    observacoesCompleta = occ.observacoes.trim();
    temObservacoes = true;
    if (observacoesCompleta.length > 100) {
      observacoesPreview = observacoesCompleta.substring(0, 100) + "...";
    } else {
      observacoesPreview = observacoesCompleta;
    }
  }

  // Verificar permissões para os botões
  const podeRetificar = authManager.podeSolicitarRetificacao(occ);
  const podeCancelar = authManager.podeCancelar(occ);
  const podeEditar = authManager.podeEditar(occ);
  const isDraft = occ.status === "draft";
  const isSynced = occ.status === "synced";

  // Status color para borda
  const statusColor =
    occ.status === "synced"
      ? "var(--verde-bandeira)"
      : occ.status === "pending_sync"
        ? "var(--aviso)"
        : occ.status === "cancelled"
          ? "var(--erro)"
          : occ.status === "rectified"
            ? "var(--azul-bandeira)"
            : occ.status === "draft"
              ? "var(--cinza-medio)"
              : "var(--cinza-medio)";

  return `
    <div class="ocorrencia-card" style="border-left-color:${statusColor};padding:12px;margin-bottom:10px;">
      <!-- Cabeçalho do card com checkbox -->
      <div style="display:flex;gap:10px;align-items:flex-start;">
        <!-- Checkbox de seleção -->
        <div style="flex-shrink:0;padding-top:2px;">
          <input type="checkbox" 
            ${isSelecionado ? "checked" : ""}
            onchange="window._ocorrenciasToggleSelecao('${occ.id}')"
            style="width:18px;height:18px;accent-color:var(--azul-bandeira);cursor:pointer;">
        </div>
        
        <!-- Miniatura -->
        <div style="width:50px;height:50px;border-radius:8px;overflow:hidden;flex-shrink:0;background:var(--cinza-claro);position:relative;">
          ${
            primeiraImagem
              ? `
            <img src="${primeiraImagem}" alt="Anexo" loading="lazy" 
              style="width:100%;height:100%;object-fit:cover;"
              onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
            <div style="display:none;width:100%;height:100%;align-items:center;justify-content:center;background:var(--azul-muito-claro);color:var(--azul-bandeira);font-size:18px;">
              <i class="fas fa-file-alt"></i>
            </div>
            ${totalImagens > 1 ? `<span style="position:absolute;bottom:2px;right:4px;background:rgba(0,0,0,0.75);color:white;font-size:8px;font-weight:700;padding:0 5px;border-radius:3px;line-height:16px;">+${totalImagens - 1}</span>` : ""}
          `
              : `
            <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--azul-muito-claro);color:var(--azul-bandeira);font-size:18px;">
              <i class="fas fa-file-alt"></i>
            </div>
          `
          }
        </div>

        <!-- Informações -->
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-bottom:1px;">
            <span style="font-weight:700;font-size:13px;color:var(--azul-bandeira);">#${numero}</span>
            <span class="badge ${tipoClass}" style="font-size:8px;padding:1px 8px;">${tipoLabel}</span>
            <span class="badge badge-${statusClass}" style="font-size:8px;padding:1px 8px;">${statusLabel}</span>
            ${isRapido ? `<span class="badge" style="font-size:8px;padding:1px 8px;background:#fef3c7;color:#92400e;font-weight:700;">⚡ RÁPIDO</span>` : ""}
          </div>
          <div style="font-size:12px;color:var(--cinza-escuro);display:flex;align-items:center;gap:4px;margin:1px 0;">
            <i class="fas fa-map-marker-alt" style="color:var(--cinza-medio);font-size:10px;"></i>
            <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${local}</span>
          </div>
          <div style="font-size:11px;color:var(--cinza-medio);display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <span><i class="fas fa-user" style="font-size:10px;"></i> ${guardaNome}</span>
            <span style="font-size:9px;">${cpfExibido}</span>
            <span style="font-size:10px;"><i class="fas fa-calendar" style="font-size:10px;"></i> ${data}</span>
          </div>
        </div>
      </div>

      <!-- Observações -->
      ${
        temObservacoes
          ? `
        <div style="font-size:12px;color:var(--cinza-escuro);padding:6px 0 4px 0;border-top:1px solid var(--cinza-claro);margin-top:4px;display:flex;align-items:flex-start;gap:4px;">
          <i class="fas fa-pencil-alt" style="color:var(--cinza-medio);font-size:10px;margin-top:1px;flex-shrink:0;"></i>
          <span style="flex:1;word-break:break-word;">
            ${observacoesPreview}
          </span>
          ${
            observacoesCompleta.length > 100
              ? `
            <button onclick="event.stopPropagation(); window._ocorrenciasVerMaisObservacoes('${occ.id}')" 
              style="background:none;border:none;color:var(--azul-bandeira);font-weight:600;font-size:11px;cursor:pointer;padding:0 2px;white-space:nowrap;flex-shrink:0;">
              Ver mais
            </button>
          `
              : ""
          }
        </div>
      `
          : ""
      }

      <!-- Ações -->
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;padding-top:6px;border-top:1px solid var(--cinza-claro);">
        <button onclick="event.stopPropagation(); window._ocorrenciasVer('${occ.id}')" 
          style="flex:1;min-width:40px;padding:4px 6px;border:none;border-radius:6px;font-size:10px;font-weight:600;cursor:pointer;background:var(--azul-muito-claro);color:var(--azul-bandeira);min-height:28px;">
          <i class="fas fa-eye"></i> Ver
        </button>
        
        ${
          podeCompletar
            ? `
          <button onclick="event.stopPropagation(); window._ocorrenciasCompletar('${occ.id}')" 
            style="flex:1;min-width:40px;padding:4px 6px;border:none;border-radius:6px;font-size:10px;font-weight:600;cursor:pointer;background:var(--verde-muito-claro);color:var(--verde-escuro);min-height:28px;">
            <i class="fas fa-edit"></i> Completar
          </button>
        `
            : isDraft && podeEditar
              ? `
          <button onclick="event.stopPropagation(); window._ocorrenciasEditar('${occ.id}')" 
            style="flex:1;min-width:40px;padding:4px 6px;border:none;border-radius:6px;font-size:10px;font-weight:600;cursor:pointer;background:var(--verde-muito-claro);color:var(--verde-escuro);min-height:28px;">
            <i class="fas fa-edit"></i> Editar
          </button>
        `
              : isSynced && podeRetificar
                ? `
          <button onclick="event.stopPropagation(); window._ocorrenciasRetificar('${occ.id}')" 
            style="flex:1;min-width:40px;padding:4px 6px;border:none;border-radius:6px;font-size:10px;font-weight:600;cursor:pointer;background:var(--verde-muito-claro);color:var(--verde-escuro);min-height:28px;">
            <i class="fas fa-sync-alt"></i> Retificar
          </button>
        `
                : ""
        }

        ${
          podeCancelar && occ.status !== "cancelled"
            ? `
          <button onclick="event.stopPropagation(); window._ocorrenciasCancelar('${occ.id}')" 
            style="flex:1;min-width:40px;padding:4px 6px;border:none;border-radius:6px;font-size:10px;font-weight:600;cursor:pointer;background:var(--erro-claro);color:var(--erro);min-height:28px;">
            <i class="fas fa-times"></i> Cancelar
          </button>
        `
            : ""
        }

        <button onclick="event.stopPropagation(); window._ocorrenciasGerarPDF('${occ.id}')" 
          style="flex:1;min-width:40px;padding:4px 6px;border:none;border-radius:6px;font-size:10px;font-weight:600;cursor:pointer;background:var(--azul-muito-claro);color:var(--azul-bandeira);min-height:28px;">
          <i class="fas fa-file-pdf"></i> PDF
        </button>
      </div>
    </div>
  `;
}

// ============================================
// RENDERIZAÇÃO: PAGINAÇÃO
// ============================================

function renderPaginacao(atual, total) {
  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;flex-wrap:wrap;gap:6px;">
      <div style="font-size:12px;color:var(--cinza-medio);">
        <i class="fas fa-list"></i> Página ${atual} de ${total}
      </div>
      <div style="display:flex;gap:3px;align-items:center;flex-wrap:wrap;">
  `;

  // Primeira página
  html += `
    <button onclick="window._ocorrenciasPagina(1)" ${atual <= 1 ? "disabled" : ""}
      style="padding:4px 8px;border:1px solid var(--cinza-claro);border-radius:6px;background:var(--branco);color:var(--cinza-escuro);font-size:12px;cursor:pointer;min-height:30px;min-width:30px;${atual <= 1 ? "opacity:0.3;pointer-events:none;" : ""}">
      <i class="fas fa-angle-double-left"></i>
    </button>
  `;

  // Página anterior
  html += `
    <button onclick="window._ocorrenciasPagina(${atual - 1})" ${atual <= 1 ? "disabled" : ""}
      style="padding:4px 8px;border:1px solid var(--cinza-claro);border-radius:6px;background:var(--branco);color:var(--cinza-escuro);font-size:12px;cursor:pointer;min-height:30px;min-width:30px;${atual <= 1 ? "opacity:0.3;pointer-events:none;" : ""}">
      <i class="fas fa-angle-left"></i>
    </button>
  `;

  // Números das páginas
  const maxVisible = 5;
  let inicio = Math.max(1, atual - Math.floor(maxVisible / 2));
  let fim = Math.min(total, inicio + maxVisible - 1);

  if (fim - inicio < maxVisible - 1) {
    inicio = Math.max(1, fim - maxVisible + 1);
  }

  if (inicio > 1) {
    html += `<button onclick="window._ocorrenciasPagina(1)" style="padding:4px 8px;border:1px solid var(--cinza-claro);border-radius:6px;background:var(--branco);color:var(--cinza-escuro);font-size:12px;cursor:pointer;min-height:30px;min-width:30px;">1</button>`;
    if (inicio > 2) {
      html += `<span style="padding:0 2px;color:var(--cinza-medio);font-size:12px;">…</span>`;
    }
  }

  for (let i = inicio; i <= fim; i++) {
    html += `
      <button onclick="window._ocorrenciasPagina(${i})" 
        style="padding:4px 8px;border:1px solid ${i === atual ? "var(--azul-bandeira)" : "var(--cinza-claro)"};border-radius:6px;background:${i === atual ? "var(--azul-bandeira)" : "var(--branco)"};color:${i === atual ? "var(--branco)" : "var(--cinza-escuro)"};font-size:12px;cursor:pointer;min-height:30px;min-width:30px;font-weight:${i === atual ? "700" : "400"};">
        ${i}
      </button>
    `;
  }

  if (fim < total) {
    if (fim < total - 1) {
      html += `<span style="padding:0 2px;color:var(--cinza-medio);font-size:12px;">…</span>`;
    }
    html += `<button onclick="window._ocorrenciasPagina(${total})" style="padding:4px 8px;border:1px solid var(--cinza-claro);border-radius:6px;background:var(--branco);color:var(--cinza-escuro);font-size:12px;cursor:pointer;min-height:30px;min-width:30px;">${total}</button>`;
  }

  // Próxima página
  html += `
    <button onclick="window._ocorrenciasPagina(${atual + 1})" ${atual >= total ? "disabled" : ""}
      style="padding:4px 8px;border:1px solid var(--cinza-claro);border-radius:6px;background:var(--branco);color:var(--cinza-escuro);font-size:12px;cursor:pointer;min-height:30px;min-width:30px;${atual >= total ? "opacity:0.3;pointer-events:none;" : ""}">
      <i class="fas fa-angle-right"></i>
    </button>
  `;

  // Última página
  html += `
    <button onclick="window._ocorrenciasPagina(${total})" ${atual >= total ? "disabled" : ""}
      style="padding:4px 8px;border:1px solid var(--cinza-claro);border-radius:6px;background:var(--branco);color:var(--cinza-escuro);font-size:12px;cursor:pointer;min-height:30px;min-width:30px;${atual >= total ? "opacity:0.3;pointer-events:none;" : ""}">
      <i class="fas fa-angle-double-right"></i>
    </button>
  `;

  html += `
      </div>
    </div>
  `;

  return html;
}

// ============================================
// RENDERIZAÇÃO: LOADER, VAZIO, ERRO
// ============================================

function renderLoader() {
  return `
    <div class="container" style="text-align:center;padding:40px 20px;">
      <div class="spinner-azul" style="margin:0 auto;"></div>
      <p style="margin-top:12px;color:var(--cinza-medio);">Carregando ocorrências...</p>
    </div>
  `;
}

function renderLoaderCards() {
  let html = "";
  for (let i = 0; i < 3; i++) {
    html += `
      <div style="background:var(--branco);border-radius:var(--border-radius);padding:12px;margin-bottom:10px;box-shadow:var(--sombra-suave);opacity:0.6;">
        <div style="display:flex;gap:10px;margin-bottom:6px;">
          <div style="width:50px;height:50px;background:var(--cinza-claro);border-radius:8px;flex-shrink:0;"></div>
          <div style="flex:1;">
            <div style="background:var(--cinza-claro);height:14px;width:60%;border-radius:4px;margin-bottom:3px;"></div>
            <div style="background:var(--cinza-claro);height:12px;width:40%;border-radius:4px;margin-bottom:3px;"></div>
            <div style="background:var(--cinza-claro);height:10px;width:50%;border-radius:4px;"></div>
          </div>
        </div>
        <div style="background:var(--cinza-claro);height:14px;width:90%;border-radius:4px;margin-bottom:6px;"></div>
        <div style="display:flex;gap:4px;">
          ${[1, 2, 3, 4].map(() => `<div style="flex:1;background:var(--cinza-claro);height:28px;border-radius:6px;"></div>`).join("")}
        </div>
      </div>
    `;
  }
  return html;
}

function renderVazio(temFiltros) {
  return `
    <div style="text-align:center;padding:30px 20px;color:var(--cinza-medio);background:var(--branco);border-radius:var(--border-radius);box-shadow:var(--sombra-suave);">
      <div style="font-size:40px;color:var(--cinza-claro);margin-bottom:8px;">
        <i class="fas fa-inbox"></i>
      </div>
      <p style="font-weight:500;font-size:14px;">Nenhuma ocorrência encontrada</p>
      ${
        temFiltros
          ? `<p style="font-size:12px;">Tente ajustar os filtros aplicados</p>
             <button onclick="window._ocorrenciasLimparFiltros()" class="btn-secondary" style="margin-top:10px;padding:6px 14px;font-size:12px;min-height:auto;width:auto;border-radius:8px;">
               <i class="fas fa-undo" style="margin-right:4px;"></i> Limpar Filtros
             </button>`
          : `<p style="font-size:12px;">Clique em "Nova" para criar sua primeira ocorrência</p>
             <button onclick="window._ocorrenciasNova()" class="btn-primary" style="margin-top:10px;padding:6px 16px;font-size:12px;min-height:auto;width:auto;border-radius:30px;">
               <i class="fas fa-plus" style="margin-right:4px;"></i> Nova Ocorrência
             </button>`
      }
    </div>
  `;
}

function renderErro(error, appInstance) {
  return `
    <div class="container" style="text-align:center;padding:40px 20px;">
      <div style="font-size:48px;color:var(--erro);margin-bottom:12px;">
        <i class="fas fa-exclamation-triangle"></i>
      </div>
      <h3>Erro ao carregar ocorrências</h3>
      <p style="color:var(--cinza-medio);">${error.message}</p>
      <button onclick="window._ocorrenciasRecarregar()" class="btn-primary" style="margin-top:16px;border-radius:12px;">
        Tentar novamente
      </button>
    </div>
  `;
}

function renderAcessoNegado(appInstance) {
  return `
    <div class="container" style="text-align:center;padding:40px 20px;">
      <div style="font-size:48px;color:var(--cinza-claro);margin-bottom:12px;">
        <i class="fas fa-user-slash"></i>
      </div>
      <p style="font-weight:500;">Usuário não autenticado</p>
      <button onclick="window.app.navigateTo('login')" class="btn-primary" style="margin-top:16px;max-width:200px;">
        Fazer Login
      </button>
    </div>
  `;
}

// ============================================
// FILTROS
// ============================================

export function aplicarFiltros(container, appInstance) {
  const status = document.getElementById("filtroStatus")?.value || "";
  const tipo = document.getElementById("filtroTipo")?.value || "";
  const dataInicio = document.getElementById("filtroDataInicio")?.value || "";
  const dataFim = document.getElementById("filtroDataFim")?.value || "";
  const guarda = document.getElementById("filtroGuarda")?.value || "";

  // Validar datas
  if (dataInicio && dataFim && dataFim < dataInicio) {
    if (appInstance && appInstance.showToast) {
      appInstance.showToast(
        "Data final deve ser maior ou igual à data inicial",
        "warning",
      );
    }
    return;
  }

  estado.filtros = {
    ...estado.filtros,
    status,
    tipo,
    dataInicio,
    dataFim,
    guarda,
  };
  estado.paginaAtual = 1;
  estado.selecionados = new Set();

  renderOcorrencias(container, appInstance);
}

export function limparFiltros(container, appInstance) {
  estado.filtros = {
    status: "",
    tipo: "",
    dataInicio: "",
    dataFim: "",
    guarda: "",
    search: "",
  };
  estado.paginaAtual = 1;
  estado.selecionados = new Set();

  // Resetar campos do formulário
  const fields = [
    "filtroStatus",
    "filtroTipo",
    "filtroDataInicio",
    "filtroDataFim",
    "filtroGuarda",
    "ocorrenciasBusca",
  ];

  fields.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  renderOcorrencias(container, appInstance);

  if (appInstance && appInstance.showToast) {
    appInstance.showToast("Filtros removidos", "info");
  }
}

// ============================================
// PAGINAÇÃO
// ============================================

function irParaPagina(pagina, container, appInstance) {
  if (
    pagina < 1 ||
    pagina > estado.totalPaginas ||
    pagina === estado.paginaAtual
  )
    return;
  estado.selecionados = new Set();
  carregarOcorrencias(pagina).then(() => {
    renderizarLista(container, appInstance);
  });
}

// ============================================
// SELEÇÃO EM LOTE
// ============================================

function toggleSelecao(id, container, appInstance) {
  if (estado.selecionados.has(id)) {
    estado.selecionados.delete(id);
  } else {
    estado.selecionados.add(id);
  }
  renderizarLista(container, appInstance);
}

function selecionarTodos(container, appInstance) {
  const todosSelecionados =
    estado.ocorrencias.length > 0 &&
    estado.ocorrencias.every((occ) => estado.selecionados.has(occ.id));

  if (todosSelecionados) {
    // Desselecionar todos
    estado.ocorrencias.forEach((occ) => {
      estado.selecionados.delete(occ.id);
    });
  } else {
    // Selecionar todos
    estado.ocorrencias.forEach((occ) => {
      estado.selecionados.add(occ.id);
    });
  }
  renderizarLista(container, appInstance);
}

function desselecionarTodos(container, appInstance) {
  estado.selecionados = new Set();
  renderizarLista(container, appInstance);
}

// ============================================
// EXPORTAÇÃO EM LOTE
// ============================================

async function exportarSelecionados(appInstance) {
  const ids = Array.from(estado.selecionados);

  if (ids.length === 0) {
    appInstance.showToast("Nenhuma ocorrência selecionada", "warning");
    return;
  }

  try {
    if (
      typeof pdfExport === "undefined" ||
      typeof pdfExport.exportarLote !== "function"
    ) {
      appInstance.showToast("Módulo PDF não disponível", "error");
      return;
    }

    appInstance.showToast(
      `Gerando PDF para ${ids.length} ocorrência(s)...`,
      "info",
    );

    // Preparar opções com metadados
    const options = {
      integrity: {
        showHash: true,
        showVersion: true,
      },
      footer: {
        show: true,
        includePageNumbers: true,
        includeDate: true,
        includeHash: true,
      },
      watermark: {
        text: "CÓPIA OFICIAL - GUARDA MUNICIPAL DE PITANGUEIRAS/PR",
        opacity: 0.08,
        fontSize: 32,
        color: "#000000",
        angle: 45,
      },
    };

    const result = await pdfExport.exportarLote(ids, options);

    if (result.success) {
      appInstance.showToast(
        `${result.sucessos} PDF(s) gerado(s) com sucesso!`,
        "success",
      );
      if (result.falhas > 0) {
        appInstance.showToast(
          `${result.falhas} ocorrência(s) falharam na exportação`,
          "warning",
        );
      }
      // Limpar seleção após exportar
      estado.selecionados = new Set();
      const container = document.getElementById("page-ocorrencias");
      if (container) renderizarLista(container, appInstance);
    } else {
      appInstance.showToast("Erro ao exportar: " + result.error, "error");
    }
  } catch (error) {
    console.error("Erro ao exportar selecionados:", error);
    appInstance.showToast("Erro ao exportar PDFs", "error");
  }
}

async function exportarTodos(appInstance) {
  // Buscar todas as ocorrências da página atual
  const ids = estado.ocorrencias.map((occ) => occ.id);

  if (ids.length === 0) {
    appInstance.showToast("Nenhuma ocorrência para exportar", "warning");
    return;
  }

  try {
    if (
      typeof pdfExport === "undefined" ||
      typeof pdfExport.exportarLote !== "function"
    ) {
      appInstance.showToast("Módulo PDF não disponível", "error");
      return;
    }

    appInstance.showToast(
      `Gerando PDF para ${ids.length} ocorrência(s) da página...`,
      "info",
    );

    // Preparar opções com metadados
    const options = {
      integrity: {
        showHash: true,
        showVersion: true,
      },
      footer: {
        show: true,
        includePageNumbers: true,
        includeDate: true,
        includeHash: true,
      },
      watermark: {
        text: "CÓPIA OFICIAL - GUARDA MUNICIPAL DE PITANGUEIRAS/PR",
        opacity: 0.08,
        fontSize: 32,
        color: "#000000",
        angle: 45,
      },
    };

    const result = await pdfExport.exportarLote(ids, options);

    if (result.success) {
      appInstance.showToast(
        `${result.sucessos} PDF(s) gerado(s) com sucesso!`,
        "success",
      );
      if (result.falhas > 0) {
        appInstance.showToast(
          `${result.falhas} ocorrência(s) falharam na exportação`,
          "warning",
        );
      }
    } else {
      appInstance.showToast("Erro ao exportar: " + result.error, "error");
    }
  } catch (error) {
    console.error("Erro ao exportar todos:", error);
    appInstance.showToast("Erro ao exportar PDFs", "error");
  }
}

// ============================================
// AÇÕES
// ============================================

export function verOcorrencia(id, appInstance) {
  appInstance.navigateTo("detalhe-ocorrencia", { id });
}

export function editarOcorrencia(id, appInstance) {
  appInstance.navigateTo("nova-ocorrencia", { id });
}

export function completarOcorrencia(id, appInstance) {
  appInstance.navigateTo("nova-ocorrencia", { id, action: "completar" });
}

export async function retificarOcorrencia(id, appInstance) {
  try {
    const result = await ocorrenciaManager.buscar(id);
    if (!result.success || !result.data) {
      appInstance.showToast("Ocorrência não encontrada", "error");
      return;
    }

    const occ = result.data;

    if (!authManager.podeSolicitarRetificacao(occ)) {
      appInstance.showToast(
        "Não é possível solicitar retificação desta ocorrência",
        "warning",
      );
      return;
    }

    appInstance.navigateTo("detalhe-ocorrencia", { id, action: "retificar" });
  } catch (error) {
    console.error("Erro ao abrir retificação:", error);
    appInstance.showToast("Erro ao abrir retificação", "error");
  }
}

export async function cancelarOcorrencia(id, appInstance) {
  try {
    const result = await ocorrenciaManager.buscar(id);
    if (!result.success || !result.data) {
      appInstance.showToast("Ocorrência não encontrada", "error");
      return;
    }

    const occ = result.data;

    if (!authManager.podeCancelar(occ)) {
      appInstance.showToast(
        "Não é possível cancelar esta ocorrência",
        "warning",
      );
      return;
    }

    if (occ.status === "cancelled") {
      appInstance.showToast("Esta ocorrência já está cancelada", "warning");
      return;
    }

    const motivo = await appInstance.inputModal(
      "Informe o motivo do cancelamento:",
      "Cancelar Ocorrência",
      "Digite o motivo do cancelamento...",
      5,
    );

    if (!motivo) {
      appInstance.showToast("Operação cancelada", "info");
      return;
    }

    const confirmado = await appInstance.confirmar(
      `Deseja realmente cancelar esta ocorrência?\n\nMotivo: ${motivo}`,
      "Confirmar Cancelamento",
    );

    if (!confirmado) {
      appInstance.showToast("Operação cancelada", "info");
      return;
    }

    const cancelResult = await ocorrenciaManager.cancelar(id, motivo);

    if (cancelResult.success) {
      appInstance.showToast("Ocorrência cancelada com sucesso!", "success");
      await authManager.logCancelarOcorrencia(
        authManager.getUserId(),
        id,
        motivo,
      );

      await carregarOcorrencias(estado.paginaAtual);
      const container = document.getElementById("page-ocorrencias");
      if (container) renderizarLista(container, appInstance);
    } else {
      appInstance.showToast("Erro ao cancelar: " + cancelResult.error, "error");
    }
  } catch (error) {
    console.error("Erro ao cancelar ocorrência:", error);
    appInstance.showToast("Erro ao cancelar ocorrência", "error");
  }
}

export async function gerarPDF(id, appInstance) {
  try {
    if (
      typeof pdfExport === "undefined" ||
      typeof pdfExport.exportarOcorrencia !== "function"
    ) {
      appInstance.showToast("Módulo PDF não disponível", "error");
      return;
    }

    appInstance.showToast("Gerando PDF...", "info");

    // Preparar opções com metadados
    const options = {
      integrity: {
        showHash: true,
        showVersion: true,
      },
      footer: {
        show: true,
        includePageNumbers: true,
        includeDate: true,
        includeHash: true,
      },
      watermark: {
        text: "CÓPIA OFICIAL - GUARDA MUNICIPAL DE PITANGUEIRAS/PR",
        opacity: 0.08,
        fontSize: 32,
        color: "#000000",
        angle: 45,
      },
    };

    const result = await pdfExport.exportarOcorrencia(id, options);

    if (result.success) {
      appInstance.showToast("PDF gerado com sucesso!", "success");
    } else {
      appInstance.showToast("Erro ao gerar PDF: " + result.error, "error");
    }
  } catch (error) {
    console.error("Erro ao gerar PDF:", error);
    appInstance.showToast("Erro ao gerar PDF", "error");
  }
}

export function verMaisObservacoes(id, appInstance) {
  const occ = estado.ocorrencias.find((o) => o.id === id);
  if (!occ || !occ.observacoes) {
    appInstance.showToast("Observações não encontradas", "info");
    return;
  }

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.6);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    z-index: 999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px;
    animation: fadeIn 0.25s ease;
  `;

  const numero = occ.numero_ocorrencia || occ.numero_temporario || "Rascunho";

  overlay.innerHTML = `
    <div class="modal" style="max-width:460px;width:100%;max-height:80vh;overflow-y:auto;background:var(--branco);border-radius:16px;box-shadow:var(--sombra-forte);">
      <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px 8px 14px;border-bottom:1px solid var(--cinza-claro);position:sticky;top:0;background:var(--branco);border-radius:16px 16px 0 0;z-index:1;">
        <div class="title" style="font-size:15px;font-weight:700;color:var(--azul-bandeira);">
          <i class="fas fa-pencil-alt" style="margin-right:6px;"></i>
          Observações - #${numero}
        </div>
        <button type="button" class="close-btn" onclick="this.closest('.modal-overlay').remove()" 
          style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--cinza-medio);padding:2px 6px;border-radius:50%;">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="modal-body" style="padding:14px;">
        <div style="font-size:14px;color:var(--cinza-escuro);line-height:1.6;white-space:pre-wrap;word-break:break-word;">
          ${occ.observacoes}
        </div>
        <div style="margin-top:10px;font-size:11px;color:var(--cinza-medio);">
          <i class="fas fa-clock" style="margin-right:4px;"></i>
          ${formatarDataHoraLocal(occ.criado_em)}
        </div>
      </div>
      <div class="modal-footer" style="padding:10px 14px 12px 14px;border-top:1px solid var(--cinza-claro);">
        <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()" 
          style="width:100%;padding:8px 14px;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;border:none;min-height:36px;background:var(--cinza-claro);color:var(--cinza-escuro);">
          Fechar
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

function getStatusClass(status) {
  const map = {
    draft: "draft",
    pending_sync: "pending",
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
    pending_rectification: "Retificação Pendente",
    rectification_rejected: "Retificação Rejeitada",
    sync_error: "Erro",
  };
  return map[status] || status;
}

function getTipoLabel(value) {
  const encontrado = TIPOS_OCORRENCIA.find((t) => t.value === value);
  return encontrado ? encontrado.label : value || "Não informado";
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

function formatarCPFSeguro(cpf) {
  if (!cpf) return "***.***.***-**";
  const limpo = cpf.replace(/\D/g, "");
  if (limpo.length !== 11) return cpf;

  const isSupervisor =
    typeof authManager !== "undefined" && authManager.isSupervisor();
  if (isSupervisor) {
    return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  return `***.${limpo.substring(3, 6)}.***-${limpo.substring(9, 11)}`;
}

// ============================================
// EXPORTAÇÕES
// ============================================

export default {
  renderOcorrencias,
  aplicarFiltros,
  limparFiltros,
  verOcorrencia,
  editarOcorrencia,
  completarOcorrencia,
  retificarOcorrencia,
  cancelarOcorrencia,
  gerarPDF,
  verMaisObservacoes,
  carregarOcorrencias,
  // Novas funções para exportação em lote
  selecionarTodos,
  desselecionarTodos,
  toggleSelecao,
  exportarSelecionados,
  exportarTodos,
};
