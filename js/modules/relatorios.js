/**
 * MÓDULO RELATÓRIOS - Relatórios Gerenciais
 * Guarda Municipal de Pitangueiras - PR
 *
 * Este módulo gerencia todos os relatórios do sistema:
 * - Executivo (visão geral com gráficos)
 * - Por Tipo de Ocorrência
 * - Por Localidade (bairros)
 * - Tempo Médio de Atendimento
 * - Desempenho por Guarda (unificado com abordagens)
 * - Retificações
 * - Cancelamentos
 * - Tendências e Sazonalidade
 * - Produtividade do Setor
 * - Ocorrências Detalhado (lista completa)
 * - Mapa de Ocorrências (com clusters)
 * - Por Guarda (ranking individual com abordagens)
 * - Previsão de Ocorrências
 * - Abordagens de Veículos (NOVO)
 * - Abordagens de Pessoas (NOVO)
 * - Abordagens Geral (NOVO)
 * - Eficiência Operacional (NOVO)
 *
 * Depende de: authManager (global), supabaseClient (global),
 *             ocorrenciaManager (global), utils, ui
 */

// ============================================
// IMPORTAÇÕES
// ============================================

// Usamos os objetos globais disponíveis
// (authManager, supabaseClient, ocorrenciaManager)

// ============================================
// CONSTANTES
// ============================================

const CORES_PIZZA = [
  "#003F87",
  "#00843D",
  "#DC2626",
  "#F59E0B",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#F97316",
  "#14B8A6",
  "#6366F1",
];
const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
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

let estado = {
  relatorioAtivo: null,
  filtros: {
    dataInicio: null,
    dataFim: null,
  },
  mapaInstance: null,
  chartInstances: {},
  previsaoCarregando: false,
};

// ============================================
// FUNÇÕES PRINCIPAIS
// ============================================

/**
 * Renderiza a página principal de relatórios
 * @param {HTMLElement} container - Elemento onde renderizar
 * @param {Object} appInstance - Instância do app
 */
export async function renderRelatorios(container, appInstance) {
  // Verificar permissão
  if (typeof authManager === "undefined" || !authManager.isSupervisor()) {
    container.innerHTML = renderAcessoNegado(appInstance);
    return;
  }

  // Se já tem um relatório ativo, mostra o detalhe
  if (estado.relatorioAtivo) {
    await renderRelatorioDetalhado(
      container,
      estado.relatorioAtivo,
      appInstance,
    );
    return;
  }

  // Definir datas padrão
  const dataInicio = estado.filtros.dataInicio || (await obterPrimeiroDiaMes());
  const dataFim = estado.filtros.dataFim || (await obterDataAtual());

  // Lista de relatórios disponíveis
  const relatorios = [
    {
      id: "executivo",
      nome: "Relatório Executivo",
      descricao: "Visão geral das ocorrências",
      icon: "fa-chart-pie",
      cor: "azul",
    },
    {
      id: "por-tipo",
      nome: "Ocorrências por Tipo",
      descricao: "Análise detalhada por natureza",
      icon: "fa-tag",
      cor: "verde",
    },
    {
      id: "por-local",
      nome: "Ocorrências por Localidade",
      descricao: "Distribuição geográfica",
      icon: "fa-map-marker-alt",
      cor: "vermelho",
    },
    {
      id: "atendimento",
      nome: "Tempo Médio de Atendimento",
      descricao: "Análise de eficiência operacional",
      icon: "fa-clock",
      cor: "amarelo",
    },
    {
      id: "desempenho",
      nome: "Desempenho por Guarda (Unificado)",
      descricao: "Avaliação com ocorrências e abordagens",
      icon: "fa-user-tie",
      cor: "roxo",
    },
    {
      id: "retificacoes",
      nome: "Relatório de Retificações",
      descricao: "Acompanhamento de correções",
      icon: "fa-sync-alt",
      cor: "azul",
    },
    {
      id: "cancelamentos",
      nome: "Relatório de Cancelamentos",
      descricao: "Análise de ocorrências canceladas",
      icon: "fa-times-circle",
      cor: "vermelho",
    },
    {
      id: "tendencias",
      nome: "Tendências e Sazonalidade",
      descricao: "Padrões temporais das ocorrências",
      icon: "fa-chart-line",
      cor: "verde",
    },
    {
      id: "produtividade",
      nome: "Produtividade do Setor",
      descricao: "Eficiência e capacidade de atendimento",
      icon: "fa-rocket",
      cor: "azul",
    },
    {
      id: "detalhado",
      nome: "Ocorrências Detalhado",
      descricao: "Listagem completa com todos os campos",
      icon: "fa-list-ul",
      cor: "cinza",
    },
    {
      id: "mapa",
      nome: "Mapa de Ocorrências (Clusters)",
      descricao: "Visualização geográfica com clusters",
      icon: "fa-map-marked-alt",
      cor: "azul",
    },
    {
      id: "por-guarda",
      nome: "Ocorrências por Guarda",
      descricao: "Produtividade individual com abordagens",
      icon: "fa-user-shield",
      cor: "roxo",
    },
    {
      id: "previsao",
      nome: "Previsão de Ocorrências",
      descricao: "Previsão baseada em histórico",
      icon: "fa-brain",
      cor: "verde",
    },
    {
      id: "abordagens-veiculos",
      nome: "Abordagens de Veículos",
      descricao: "Análise de abordagens de veículos",
      icon: "fa-motorcycle",
      cor: "azul",
    },
    {
      id: "abordagens-pessoas",
      nome: "Abordagens de Pessoas",
      descricao: "Análise de abordagens de pessoas",
      icon: "fa-user-friends",
      cor: "verde",
    },
    {
      id: "abordagens-geral",
      nome: "Abordagens Geral",
      descricao: "Consolidado de todas as abordagens",
      icon: "fa-chart-bar",
      cor: "roxo",
    },
    {
      id: "eficiencia",
      nome: "Eficiência Operacional",
      descricao: "Taxa de conversão abordagens em BOs",
      icon: "fa-rocket",
      cor: "amarelo",
    },
  ];

  const coresMap = {
    azul: { bg: "var(--azul-muito-claro)", color: "var(--azul-bandeira)" },
    verde: { bg: "var(--verde-muito-claro)", color: "var(--verde-bandeira)" },
    vermelho: { bg: "var(--erro-claro)", color: "var(--erro)" },
    amarelo: { bg: "#fef3c7", color: "var(--aviso)" },
    roxo: { bg: "#ede9fe", color: "#8b5cf6" },
    cinza: { bg: "var(--cinza-claro)", color: "var(--cinza-medio)" },
  };

  let html = `
    <div class="container" style="padding-bottom:120px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <h2 style="color:var(--azul-bandeira);margin:0;">
          <i class="fas fa-chart-bar" style="margin-right:8px;"></i>
          Relatórios
        </h2>
        <button onclick="window._relatoriosVoltar()" class="btn-secondary" style="padding:4px 12px;font-size:12px;min-height:auto;width:auto;border-radius:8px;">
          <i class="fas fa-arrow-left"></i> Voltar
        </button>
      </div>
      <p style="color:var(--cinza-medio);margin-bottom:16px;font-size:13px;">
        Selecione um relatório para visualizar
      </p>

      <!-- Filtros de período -->
      <div class="filtros-container" style="margin-bottom:16px;">
        <div class="filtros-row">
          <div class="filtro-group" style="flex:1;">
            <label><i class="fas fa-calendar-alt"></i> Data Início</label>
            <input type="date" id="relatorioDataInicio" value="${dataInicio}">
          </div>
          <div class="filtro-group" style="flex:1;">
            <label><i class="fas fa-calendar-alt"></i> Data Fim</label>
            <input type="date" id="relatorioDataFim" value="${dataFim}">
          </div>
          <div class="filtros-actions">
            <button onclick="window._relatoriosAplicarFiltros()" class="btn-primary" style="padding:6px 12px;font-size:12px;min-height:36px;width:auto;border-radius:8px;">
              <i class="fas fa-search"></i>
            </button>
          </div>
        </div>
      </div>

      <!-- Grid de relatórios -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
  `;

  relatorios.forEach((rel) => {
    const cor = coresMap[rel.cor] || coresMap.azul;
    const isNew = [
      "previsao",
      "abordagens-veiculos",
      "abordagens-pessoas",
      "abordagens-geral",
      "eficiencia",
    ].includes(rel.id);
    html += `
      <div class="relatorio-card" onclick="window._relatoriosAbrir('${rel.id}')" 
        style="background:var(--branco);border-radius:var(--border-radius);padding:12px;box-shadow:var(--sombra-suave);cursor:pointer;transition:all 0.15s ease;border-left:3px solid ${cor.color};display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;position:relative;">
        ${isNew ? `<span style="position:absolute;top:-6px;right:-6px;background:var(--verde-bandeira);color:white;font-size:8px;padding:2px 10px;border-radius:20px;font-weight:700;">NOVO</span>` : ""}
        <div style="width:40px;height:40px;border-radius:50%;background:${cor.bg};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <i class="fas ${rel.icon}" style="color:${cor.color};font-size:18px;"></i>
        </div>
        <div style="font-weight:600;font-size:12px;line-height:1.2;">${rel.nome}</div>
        <div style="font-size:10px;color:var(--cinza-medio);line-height:1.2;">${rel.descricao}</div>
      </div>
    `;
  });

  html += `
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Registrar funções no escopo global
  window._relatoriosVoltar = () => {
    estado.relatorioAtivo = null;
    renderRelatorios(container, appInstance);
  };

  window._relatoriosAbrir = (tipo) => {
    estado.relatorioAtivo = tipo;
    const dataInicio =
      document.getElementById("relatorioDataInicio")?.value ||
      obterPrimeiroDiaMes();
    const dataFim =
      document.getElementById("relatorioDataFim")?.value || obterDataAtual();
    estado.filtros = { dataInicio, dataFim };
    renderRelatorios(container, appInstance);
  };

  window._relatoriosAplicarFiltros = () => {
    const dataInicio = document.getElementById("relatorioDataInicio")?.value;
    const dataFim = document.getElementById("relatorioDataFim")?.value;
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
      dataInicio: dataInicio || obterPrimeiroDiaMes(),
      dataFim: dataFim || obterDataAtual(),
    };
    if (estado.relatorioAtivo) {
      renderRelatorios(container, appInstance);
    }
  };

  window._relatoriosVerDetalhes = (id) => {
    if (appInstance && appInstance.navigateTo) {
      appInstance.navigateTo("detalhe-ocorrencia", { id });
    }
  };
}

// ============================================
// RENDERIZAÇÃO DE RELATÓRIOS DETALHADOS
// ============================================

export async function renderRelatorioDetalhado(container, tipo, appInstance) {
  const dataInicio = estado.filtros.dataInicio || (await obterPrimeiroDiaMes());
  const dataFim = estado.filtros.dataFim || (await obterDataAtual());

  // Mostrar loader
  container.innerHTML = `
    <div class="container" style="text-align:center;padding:40px 20px;">
      <div class="spinner-azul" style="margin:0 auto;"></div>
      <p style="margin-top:12px;color:var(--cinza-medio);">Carregando relatório...</p>
    </div>
  `;

  try {
    // Buscar dados do período
    const ocorrencias = await buscarOcorrenciasPeriodo(dataInicio, dataFim);
    const abordagens = await buscarAbordagensPeriodo(dataInicio, dataFim);

    // Renderizar conforme o tipo
    switch (tipo) {
      case "executivo":
        await renderRelatorioExecutivo(
          container,
          ocorrencias,
          dataInicio,
          dataFim,
          appInstance,
        );
        break;
      case "por-tipo":
        await renderRelatorioPorTipo(
          container,
          ocorrencias,
          dataInicio,
          dataFim,
          appInstance,
        );
        break;
      case "por-local":
        await renderRelatorioPorLocal(
          container,
          ocorrencias,
          dataInicio,
          dataFim,
          appInstance,
        );
        break;
      case "atendimento":
        await renderRelatorioAtendimento(
          container,
          ocorrencias,
          dataInicio,
          dataFim,
          appInstance,
        );
        break;
      case "desempenho":
        await renderRelatorioDesempenhoUnificado(
          container,
          ocorrencias,
          dataInicio,
          dataFim,
          appInstance,
        );
        break;
      case "retificacoes":
        await renderRelatorioRetificacoes(
          container,
          ocorrencias,
          dataInicio,
          dataFim,
          appInstance,
        );
        break;
      case "cancelamentos":
        await renderRelatorioCancelamentos(
          container,
          ocorrencias,
          dataInicio,
          dataFim,
          appInstance,
        );
        break;
      case "tendencias":
        await renderRelatorioTendencias(
          container,
          ocorrencias,
          dataInicio,
          dataFim,
          appInstance,
        );
        break;
      case "produtividade":
        await renderRelatorioProdutividade(
          container,
          ocorrencias,
          dataInicio,
          dataFim,
          appInstance,
        );
        break;
      case "detalhado":
        await renderRelatorioDetalhadoLista(
          container,
          ocorrencias,
          dataInicio,
          dataFim,
          appInstance,
        );
        break;
      case "mapa":
        await renderRelatorioMapa(container, dataInicio, dataFim, appInstance);
        break;
      case "por-guarda":
        await renderRelatorioPorGuarda(
          container,
          ocorrencias,
          dataInicio,
          dataFim,
          appInstance,
        );
        break;
      case "previsao":
        await renderRelatorioPrevisao(
          container,
          ocorrencias,
          dataInicio,
          dataFim,
          appInstance,
        );
        break;
      case "abordagens-veiculos":
        await renderRelatorioAbordagensVeiculos(
          container,
          abordagens,
          dataInicio,
          dataFim,
          appInstance,
        );
        break;
      case "abordagens-pessoas":
        await renderRelatorioAbordagensPessoas(
          container,
          abordagens,
          dataInicio,
          dataFim,
          appInstance,
        );
        break;
      case "abordagens-geral":
        await renderRelatorioAbordagensGeral(
          container,
          abordagens,
          dataInicio,
          dataFim,
          appInstance,
        );
        break;
      case "eficiencia":
        await renderRelatorioEficiencia(
          container,
          ocorrencias,
          abordagens,
          dataInicio,
          dataFim,
          appInstance,
        );
        break;
      default:
        container.innerHTML = `<p>Relatório não encontrado</p>`;
    }
  } catch (error) {
    console.error("Erro ao renderizar relatório:", error);
    container.innerHTML = `
      <div class="container" style="text-align:center;padding:40px 20px;">
        <div style="font-size:48px;color:var(--erro);margin-bottom:12px;">
          <i class="fas fa-exclamation-triangle"></i>
        </div>
        <h3>Erro ao carregar relatório</h3>
        <p style="color:var(--cinza-medio);">${error.message}</p>
        <button onclick="window._relatoriosVoltar()" class="btn-primary" style="margin-top:16px;border-radius:12px;">
          Voltar
        </button>
      </div>
    `;
  }
}

// ============================================
// BUSCA DE DADOS POR PERÍODO
// ============================================

async function buscarOcorrenciasPeriodo(dataInicio, dataFim) {
  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) return [];

    const { data, error } = await client
      .from("ocorrencias")
      .select("*")
      .gte("criado_em", dataInicio)
      .lte("criado_em", dataFim + "T23:59:59");

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Erro ao buscar ocorrências:", error);
    return [];
  }
}

async function buscarAbordagensPeriodo(dataInicio, dataFim) {
  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) return { veiculos: [], pessoas: [] };

    const [veiculosResult, pessoasResult] = await Promise.all([
      client
        .from("abordagens_veiculos")
        .select("*, usuarios(nome_completo)")
        .gte("criado_em", dataInicio)
        .lte("criado_em", dataFim + "T23:59:59"),
      client
        .from("abordagens_pessoas")
        .select("*, usuarios(nome_completo)")
        .gte("criado_em", dataInicio)
        .lte("criado_em", dataFim + "T23:59:59"),
    ]);

    return {
      veiculos: veiculosResult.data || [],
      pessoas: pessoasResult.data || [],
    };
  } catch (error) {
    console.error("Erro ao buscar abordagens:", error);
    return { veiculos: [], pessoas: [] };
  }
}

// ============================================
// RELATÓRIO EXECUTIVO
// ============================================

async function renderRelatorioExecutivo(
  container,
  ocorrencias,
  dataInicio,
  dataFim,
  appInstance,
) {
  const stats = calcularEstatisticas(ocorrencias);
  const porTipo = agruparPorTipo(ocorrencias);
  const porMes = agruparPorMes(ocorrencias);
  const total = stats.total || 1;
  const taxaResolutividade = ((stats.finalizadas / total) * 100).toFixed(1);
  const mediaDiaria = calcularMediaDiaria(ocorrencias, dataInicio, dataFim);

  const html = `
    <div class="container" style="padding-bottom:120px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
          <i class="fas fa-chart-pie" style="margin-right:8px;"></i>
          Relatório Executivo
        </h2>
        <div style="display:flex;gap:4px;">
          <button onclick="window._relatoriosExportarPDF()" class="btn-secondary" style="padding:3px 10px;font-size:10px;min-height:auto;width:auto;border-radius:6px;">
            <i class="fas fa-file-pdf"></i>
          </button>
          <button onclick="window._relatoriosVoltar()" class="btn-secondary" style="padding:3px 10px;font-size:10px;min-height:auto;width:auto;border-radius:6px;">
            <i class="fas fa-arrow-left"></i>
          </button>
        </div>
      </div>
      <p style="color:var(--cinza-medio);margin-bottom:12px;font-size:12px;">
        <i class="fas fa-calendar" style="margin-right:4px;"></i>
        ${formatarData(dataInicio)} até ${formatarData(dataFim)}
      </p>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px;">
        <div style="background:var(--gradiente-principal);border-radius:var(--border-radius);padding:8px 6px;text-align:center;color:var(--branco);">
          <div style="font-size:18px;font-weight:800;">${total}</div>
          <div style="font-size:9px;opacity:0.8;">Total</div>
        </div>
        <div style="background:var(--verde-bandeira);border-radius:var(--border-radius);padding:8px 6px;text-align:center;color:var(--branco);">
          <div style="font-size:18px;font-weight:800;">${stats.finalizadas}</div>
          <div style="font-size:9px;opacity:0.8;">Finalizadas</div>
        </div>
        <div style="background:var(--aviso);border-radius:var(--border-radius);padding:8px 6px;text-align:center;color:var(--branco);">
          <div style="font-size:18px;font-weight:800;">${stats.pendentes}</div>
          <div style="font-size:9px;opacity:0.8;">Pendentes</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">
        <div style="background:var(--branco);border-radius:var(--border-radius);padding:8px;box-shadow:var(--sombra-suave);text-align:center;">
          <div style="font-size:16px;font-weight:800;color:var(--verde-bandeira);">${taxaResolutividade}%</div>
          <div style="font-size:9px;color:var(--cinza-medio);">Resolutividade</div>
        </div>
        <div style="background:var(--branco);border-radius:var(--border-radius);padding:8px;box-shadow:var(--sombra-suave);text-align:center;">
          <div style="font-size:16px;font-weight:800;color:var(--azul-bandeira);">${mediaDiaria}</div>
          <div style="font-size:9px;color:var(--cinza-medio);">Média Diária</div>
        </div>
      </div>

      <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);margin-bottom:10px;">
        <h4 style="color:var(--azul-bandeira);margin-bottom:6px;font-size:13px;">
          <i class="fas fa-chart-pie" style="margin-right:4px;"></i>
          Tipos de Ocorrência
        </h4>
        <div style="height:200px;position:relative;">
          <canvas id="chartRelatorioPizza"></canvas>
        </div>
      </div>

      <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);margin-bottom:10px;">
        <h4 style="color:var(--azul-bandeira);margin-bottom:6px;font-size:13px;">
          <i class="fas fa-chart-bar" style="margin-right:4px;"></i>
          Evolução Mensal
        </h4>
        <div style="height:150px;position:relative;">
          <canvas id="chartRelatorioMensal"></canvas>
        </div>
      </div>

      <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);">
        <h4 style="color:var(--azul-bandeira);margin-bottom:6px;font-size:13px;">
          <i class="fas fa-table" style="margin-right:4px;"></i>
          Detalhamento por Tipo
        </h4>
        <div class="table-wrapper">
          <table style="font-size:12px;">
            <thead>
              <tr>
                <th>Tipo</th>
                <th style="text-align:center;">Total</th>
                <th style="text-align:center;">%</th>
              </tr>
            </thead>
            <tbody>
              ${porTipo
                .slice(0, 8)
                .map(
                  (t) => `
                <tr>
                  <td style="font-size:11px;">${t.tipo}</td>
                  <td style="text-align:center;font-weight:600;">${t.total}</td>
                  <td style="text-align:center;color:var(--cinza-medio);">${t.percentual}%</td>
                </tr>
              `,
                )
                .join("")}
              ${
                porTipo.length > 8
                  ? `
                <tr>
                  <td colspan="3" style="text-align:center;color:var(--cinza-medio);font-size:11px;">
                    + ${porTipo.length - 8} outros tipos
                  </td>
                </tr>
              `
                  : ""
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;

  await renderizarGraficoPizza(
    "chartRelatorioPizza",
    porTipo.slice(0, 8),
    CORES_PIZZA,
  );
  await renderizarGraficoBarras("chartRelatorioMensal", porMes);
}

// ============================================
// RELATÓRIO POR TIPO
// ============================================

async function renderRelatorioPorTipo(
  container,
  ocorrencias,
  dataInicio,
  dataFim,
  appInstance,
) {
  const porTipo = agruparPorTipo(ocorrencias);

  let html = `
    <div class="container" style="padding-bottom:120px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
          <i class="fas fa-tag" style="margin-right:8px;"></i>
          Ocorrências por Tipo
        </h2>
        <button onclick="window._relatoriosVoltar()" class="btn-secondary" style="padding:3px 10px;font-size:10px;min-height:auto;width:auto;border-radius:6px;">
          <i class="fas fa-arrow-left"></i>
        </button>
      </div>
      <p style="color:var(--cinza-medio);margin-bottom:12px;font-size:12px;">
        <i class="fas fa-calendar" style="margin-right:4px;"></i>
        ${formatarData(dataInicio)} até ${formatarData(dataFim)}
      </p>

      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">
        ${porTipo
          .map(
            (t) => `
          <span class="badge" style="background:var(--azul-muito-claro);color:var(--azul-bandeira);font-size:11px;padding:4px 12px;">
            ${t.tipo}: ${t.total}
          </span>
        `,
          )
          .join("")}
      </div>

      <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);">
        <div class="table-wrapper">
          <table style="font-size:12px;">
            <thead>
              <tr>
                <th>Tipo</th>
                <th style="text-align:center;">Total</th>
                <th style="text-align:center;">%</th>
                <th style="text-align:center;">Finalizadas</th>
                <th style="text-align:center;">Pendentes</th>
              </tr>
            </thead>
            <tbody>
              ${porTipo
                .map(
                  (t) => `
                <tr>
                  <td>${t.tipo}</td>
                  <td style="text-align:center;font-weight:600;">${t.total}</td>
                  <td style="text-align:center;color:var(--cinza-medio);">${t.percentual}%</td>
                  <td style="text-align:center;color:var(--verde-bandeira);">${t.finalizadas}</td>
                  <td style="text-align:center;color:var(--aviso);">${t.pendentes}</td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

// ============================================
// RELATÓRIO POR LOCAL
// ============================================

async function renderRelatorioPorLocal(
  container,
  ocorrencias,
  dataInicio,
  dataFim,
  appInstance,
) {
  const porBairro = agruparPorBairro(ocorrencias);
  const topBairros = porBairro.slice(0, 10);

  let html = `
    <div class="container" style="padding-bottom:120px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
          <i class="fas fa-map-marker-alt" style="margin-right:8px;"></i>
          Ocorrências por Localidade
        </h2>
        <button onclick="window._relatoriosVoltar()" class="btn-secondary" style="padding:3px 10px;font-size:10px;min-height:auto;width:auto;border-radius:6px;">
          <i class="fas fa-arrow-left"></i>
        </button>
      </div>
      <p style="color:var(--cinza-medio);margin-bottom:12px;font-size:12px;">
        <i class="fas fa-calendar" style="margin-right:4px;"></i>
        ${formatarData(dataInicio)} até ${formatarData(dataFim)}
      </p>

      <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);margin-bottom:10px;">
        <h4 style="color:var(--azul-bandeira);margin-bottom:6px;font-size:13px;">
          <i class="fas fa-trophy" style="margin-right:4px;"></i>
          Top 10 Bairros
        </h4>
        ${topBairros
          .map(
            (b, index) => `
          <div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--cinza-claro);font-size:13px;">
            <span style="font-weight:700;color:var(--cinza-medio);min-width:20px;font-size:12px;">${index + 1}º</span>
            <span style="flex:1;font-weight:500;">${b.bairro}</span>
            <span style="font-weight:700;color:var(--azul-bandeira);">${b.total}</span>
            <span style="font-size:11px;color:var(--cinza-medio);">(${b.percentual}%)</span>
          </div>
        `,
          )
          .join("")}
      </div>

      <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);">
        <h4 style="color:var(--azul-bandeira);margin-bottom:6px;font-size:13px;">
          <i class="fas fa-chart-bar" style="margin-right:4px;"></i>
          Distribuição por Bairro
        </h4>
        <div style="height:200px;">
          <canvas id="chartRelatorioBairros"></canvas>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;

  await renderizarGraficoBarras(
    "chartRelatorioBairros",
    topBairros.map((b) => ({
      label: b.bairro.length > 15 ? b.bairro.slice(0, 12) + "..." : b.bairro,
      value: b.total,
    })),
  );
}

// ============================================
// RELATÓRIO DE ATENDIMENTO (TEMPO MÉDIO)
// ============================================

async function renderRelatorioAtendimento(
  container,
  ocorrencias,
  dataInicio,
  dataFim,
  appInstance,
) {
  const comTempo = ocorrencias.filter(
    (o) => o.data_hora_inicio && o.data_hora_encerramento,
  );
  const tempos = comTempo
    .map((o) => {
      const inicio = new Date(o.data_hora_inicio);
      const fim = new Date(o.data_hora_encerramento);
      const diff = (fim - inicio) / (1000 * 60);
      return { ...o, tempoMinutos: diff };
    })
    .filter((t) => t.tempoMinutos > 0);

  const mediaGeral =
    tempos.length > 0
      ? tempos.reduce((s, t) => s + t.tempoMinutos, 0) / tempos.length
      : 0;

  const maisRapida =
    tempos.length > 0
      ? tempos.reduce((a, b) => (a.tempoMinutos < b.tempoMinutos ? a : b))
      : null;

  const maisLenta =
    tempos.length > 0
      ? tempos.reduce((a, b) => (a.tempoMinutos > b.tempoMinutos ? a : b))
      : null;

  const porTipo = {};
  tempos.forEach((t) => {
    const tipo = t.tipo_ocorrencia || "Não informado";
    if (!porTipo[tipo]) porTipo[tipo] = [];
    porTipo[tipo].push(t.tempoMinutos);
  });

  const mediaPorTipo = Object.keys(porTipo)
    .map((key) => ({
      tipo: getTipoLabel(key),
      media: porTipo[key].reduce((s, v) => s + v, 0) / porTipo[key].length,
      total: porTipo[key].length,
    }))
    .sort((a, b) => b.media - a.media);

  const formatarTempo = (minutos) => {
    if (minutos < 1) return "< 1 min";
    if (minutos < 60) return `${Math.round(minutos)} min`;
    const horas = Math.floor(minutos / 60);
    const mins = Math.round(minutos % 60);
    return `${horas}h ${mins}min`;
  };

  let html = `
    <div class="container" style="padding-bottom:120px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
          <i class="fas fa-clock" style="margin-right:8px;"></i>
          Tempo Médio de Atendimento
        </h2>
        <button onclick="window._relatoriosVoltar()" class="btn-secondary" style="padding:3px 10px;font-size:10px;min-height:auto;width:auto;border-radius:6px;">
          <i class="fas fa-arrow-left"></i>
        </button>
      </div>
      <p style="color:var(--cinza-medio);margin-bottom:12px;font-size:12px;">
        <i class="fas fa-calendar" style="margin-right:4px;"></i>
        ${formatarData(dataInicio)} até ${formatarData(dataFim)}
      </p>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px;">
        <div style="background:var(--azul-bandeira);border-radius:var(--border-radius);padding:8px;text-align:center;color:var(--branco);">
          <div style="font-size:16px;font-weight:800;">${formatarTempo(mediaGeral)}</div>
          <div style="font-size:9px;opacity:0.8;">Média Geral</div>
        </div>
        <div style="background:var(--verde-bandeira);border-radius:var(--border-radius);padding:8px;text-align:center;color:var(--branco);">
          <div style="font-size:16px;font-weight:800;">${maisRapida ? formatarTempo(maisRapida.tempoMinutos) : "-"}</div>
          <div style="font-size:9px;opacity:0.8;">Mais Rápida</div>
        </div>
        <div style="background:var(--erro);border-radius:var(--border-radius);padding:8px;text-align:center;color:var(--branco);">
          <div style="font-size:16px;font-weight:800;">${maisLenta ? formatarTempo(maisLenta.tempoMinutos) : "-"}</div>
          <div style="font-size:9px;opacity:0.8;">Mais Lenta</div>
        </div>
      </div>

      <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);">
        <h4 style="color:var(--azul-bandeira);margin-bottom:6px;font-size:13px;">
          <i class="fas fa-chart-bar" style="margin-right:4px;"></i>
          Tempo Médio por Tipo
        </h4>
        <div class="table-wrapper">
          <table style="font-size:12px;">
            <thead>
              <tr>
                <th>Tipo</th>
                <th style="text-align:center;">Média</th>
                <th style="text-align:center;">Ocorrências</th>
              </tr>
            </thead>
            <tbody>
              ${mediaPorTipo
                .map(
                  (t) => `
                <tr>
                  <td>${t.tipo}</td>
                  <td style="text-align:center;font-weight:600;color:var(--azul-bandeira);">${formatarTempo(t.media)}</td>
                  <td style="text-align:center;color:var(--cinza-medio);">${t.total}</td>
                </tr>
              `,
                )
                .join("")}
              ${
                mediaPorTipo.length === 0
                  ? `
                <tr>
                  <td colspan="3" style="text-align:center;color:var(--cinza-medio);padding:16px;">
                    Nenhuma ocorrência com tempo registrado
                  </td>
                </tr>
              `
                  : ""
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

// ============================================
// RELATÓRIO DE DESEMPENHO UNIFICADO
// ============================================

async function renderRelatorioDesempenhoUnificado(
  container,
  ocorrencias,
  dataInicio,
  dataFim,
  appInstance,
) {
  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) throw new Error("Erro ao conectar");

    const { data: usuarios, error: userError } = await client
      .from("usuarios")
      .select("id, nome_completo, matricula, perfil")
      .eq("status", "ativo");

    if (userError) throw userError;

    const abordagens = await buscarAbordagensPeriodo(dataInicio, dataFim);
    const todasAbordagens = [
      ...abordagens.veiculos.map((v) => ({ ...v, tipo_abordagem: "veiculo" })),
      ...abordagens.pessoas.map((p) => ({ ...p, tipo_abordagem: "pessoa" })),
    ];

    const desempenho = {};
    usuarios.forEach((u) => {
      desempenho[u.id] = {
        id: u.id,
        nome: u.nome_completo,
        matricula: u.matricula || "-",
        perfil: u.perfil,
        ocorrencias: { total: 0, finalizadas: 0, pendentes: 0, canceladas: 0 },
        abordagens: { total: 0, veiculos: 0, pessoas: 0 },
        taxa_resolucao: 0,
        total_atendimentos: 0,
      };
    });

    ocorrencias.forEach((o) => {
      const id = o.criado_por;
      if (desempenho[id]) {
        desempenho[id].ocorrencias.total++;
        if (o.status === "synced") desempenho[id].ocorrencias.finalizadas++;
        if (o.status === "pending_sync") desempenho[id].ocorrencias.pendentes++;
        if (o.status === "cancelled") desempenho[id].ocorrencias.canceladas++;
      }
    });

    todasAbordagens.forEach((a) => {
      const id = a.criado_por;
      if (desempenho[id]) {
        desempenho[id].abordagens.total++;
        if (a.tipo_abordagem === "veiculo") {
          desempenho[id].abordagens.veiculos++;
        } else {
          desempenho[id].abordagens.pessoas++;
        }
      }
    });

    Object.values(desempenho).forEach((d) => {
      d.taxa_resolucao =
        d.ocorrencias.total > 0
          ? ((d.ocorrencias.finalizadas / d.ocorrencias.total) * 100).toFixed(1)
          : 0;
      d.total_atendimentos = d.ocorrencias.total + d.abordagens.total;
    });

    const ranking = Object.values(desempenho).sort(
      (a, b) => b.total_atendimentos - a.total_atendimentos,
    );

    const totalOcorrencias = ranking.reduce(
      (s, d) => s + d.ocorrencias.total,
      0,
    );
    const totalAbordagens = ranking.reduce((s, d) => s + d.abordagens.total, 0);
    const totalAtendimentos = totalOcorrencias + totalAbordagens;
    const mediaOcorrencias =
      ranking.length > 0 ? (totalOcorrencias / ranking.length).toFixed(1) : 0;
    const mediaAbordagens =
      ranking.length > 0 ? (totalAbordagens / ranking.length).toFixed(1) : 0;

    let html = `
      <div class="container" style="padding-bottom:120px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
            <i class="fas fa-chart-bar" style="margin-right:8px;"></i>
            Desempenho por Guarda (Unificado)
          </h2>
          <div style="display:flex;gap:4px;">
            <button onclick="window._relatoriosExportarDesempenhoPDF()" class="btn-secondary" style="padding:3px 10px;font-size:10px;min-height:auto;width:auto;border-radius:6px;">
              <i class="fas fa-file-pdf"></i> PDF
            </button>
            <button onclick="window._relatoriosVoltar()" class="btn-secondary" style="padding:3px 10px;font-size:10px;min-height:auto;width:auto;border-radius:6px;">
              <i class="fas fa-arrow-left"></i>
            </button>
          </div>
        </div>
        <p style="color:var(--cinza-medio);margin-bottom:12px;font-size:12px;">
          <i class="fas fa-calendar" style="margin-right:4px;"></i>
          ${formatarData(dataInicio)} até ${formatarData(dataFim)}
        </p>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:12px;">
          <div style="background:var(--gradiente-principal);border-radius:var(--border-radius);padding:10px;text-align:center;color:var(--branco);">
            <div style="font-size:20px;font-weight:800;">${totalAtendimentos}</div>
            <div style="font-size:10px;opacity:0.8;">Total de Atendimentos</div>
          </div>
          <div style="background:var(--verde-bandeira);border-radius:var(--border-radius);padding:10px;text-align:center;color:var(--branco);">
            <div style="font-size:20px;font-weight:800;">${totalOcorrencias}</div>
            <div style="font-size:10px;opacity:0.8;">Ocorrências</div>
            <div style="font-size:9px;opacity:0.7;">Média: ${mediaOcorrencias}/guarda</div>
          </div>
          <div style="background:var(--azul-bandeira);border-radius:var(--border-radius);padding:10px;text-align:center;color:var(--branco);">
            <div style="font-size:20px;font-weight:800;">${totalAbordagens}</div>
            <div style="font-size:10px;opacity:0.8;">Abordagens</div>
            <div style="font-size:9px;opacity:0.7;">Média: ${mediaAbordagens}/guarda</div>
          </div>
        </div>

        <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);margin-bottom:10px;">
          <h4 style="color:var(--azul-bandeira);margin-bottom:6px;font-size:13px;">
            <i class="fas fa-chart-bar" style="margin-right:4px;"></i>
            Atendimentos por Guarda
          </h4>
          <div style="height:200px;">
            <canvas id="chartDesempenhoBarras"></canvas>
          </div>
        </div>

        <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);overflow-x:auto;">
          <table style="width:100%;font-size:12px;border-collapse:collapse;">
            <thead>
              <tr style="background:var(--cinza-claro);">
                <th style="padding:6px 8px;text-align:left;">#</th>
                <th style="padding:6px 8px;text-align:left;">Guarda</th>
                <th style="padding:6px 8px;text-align:center;">Ocorr.</th>
                <th style="padding:6px 8px;text-align:center;">Final.</th>
                <th style="padding:6px 8px;text-align:center;">Taxa</th>
                <th style="padding:6px 8px;text-align:center;">Abord.</th>
                <th style="padding:6px 8px;text-align:center;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${ranking
                .map(
                  (d, i) => `
                <tr style="border-bottom:1px solid var(--cinza-claro);">
                  <td style="padding:6px 8px;font-weight:700;color:${i < 3 ? "var(--azul-bandeira)" : "var(--cinza-medio)"};">
                    ${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                  </td>
                  <td style="padding:6px 8px;font-weight:500;">
                    ${d.nome}
                    <span style="font-size:10px;color:var(--cinza-medio);display:block;">Mat: ${d.matricula}</span>
                  </td>
                  <td style="padding:6px 8px;text-align:center;font-weight:600;">${d.ocorrencias.total}</td>
                  <td style="padding:6px 8px;text-align:center;color:var(--verde-bandeira);">${d.ocorrencias.finalizadas}</td>
                  <td style="padding:6px 8px;text-align:center;font-weight:600;color:${d.taxa_resolucao >= 70 ? "var(--verde-bandeira)" : d.taxa_resolucao >= 50 ? "var(--aviso)" : "var(--erro)"};">
                    ${d.taxa_resolucao}%
                  </td>
                  <td style="padding:6px 8px;text-align:center;color:var(--azul-bandeira);">
                    ${d.abordagens.total}
                    <span style="font-size:9px;color:var(--cinza-medio);display:block;">
                      🚗${d.abordagens.veiculos} 👤${d.abordagens.pessoas}
                    </span>
                  </td>
                  <td style="padding:6px 8px;text-align:center;font-weight:700;color:var(--azul-bandeira);">
                    ${d.total_atendimentos}
                  </td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;">
          <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);">
            <h4 style="font-size:12px;color:var(--cinza-medio);margin:0 0 8px 0;">
              <i class="fas fa-motorcycle"></i> Top 5 Abordagens Veículos
            </h4>
            ${
              ranking
                .filter((d) => d.abordagens.veiculos > 0)
                .sort((a, b) => b.abordagens.veiculos - a.abordagens.veiculos)
                .slice(0, 5)
                .map(
                  (d, i) => `
                <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--cinza-claro);font-size:12px;">
                  <span>${i + 1}. ${d.nome}</span>
                  <span style="font-weight:600;color:var(--azul-bandeira);">${d.abordagens.veiculos}</span>
                </div>
              `,
                )
                .join("") ||
              '<p style="font-size:12px;color:var(--cinza-medio);">Nenhuma abordagem de veículo</p>'
            }
          </div>
          <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);">
            <h4 style="font-size:12px;color:var(--cinza-medio);margin:0 0 8px 0;">
              <i class="fas fa-user-friends"></i> Top 5 Abordagens Pessoas
            </h4>
            ${
              ranking
                .filter((d) => d.abordagens.pessoas > 0)
                .sort((a, b) => b.abordagens.pessoas - a.abordagens.pessoas)
                .slice(0, 5)
                .map(
                  (d, i) => `
                <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--cinza-claro);font-size:12px;">
                  <span>${i + 1}. ${d.nome}</span>
                  <span style="font-weight:600;color:var(--verde-bandeira);">${d.abordagens.pessoas}</span>
                </div>
              `,
                )
                .join("") ||
              '<p style="font-size:12px;color:var(--cinza-medio);">Nenhuma abordagem de pessoa</p>'
            }
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;

    await renderizarGraficoBarras(
      "chartDesempenhoBarras",
      ranking.map((d) => ({
        label: d.nome.length > 12 ? d.nome.slice(0, 10) + "..." : d.nome,
        value: d.total_atendimentos,
      })),
    );

    window._relatoriosExportarDesempenhoPDF = () =>
      exportarDesempenhoPDF(ranking, dataInicio, dataFim, appInstance);
  } catch (error) {
    console.error("Erro no relatório de desempenho:", error);
    container.innerHTML = `<p style="color:var(--erro);">Erro: ${error.message}</p>`;
  }
}

// ============================================
// RELATÓRIO DE RETIFICAÇÕES
// ============================================

async function renderRelatorioRetificacoes(
  container,
  ocorrencias,
  dataInicio,
  dataFim,
  appInstance,
) {
  const retificacoes = ocorrencias.filter((o) => o.status === "rectified");
  const pendentes = ocorrencias.filter(
    (o) => o.status === "pending_rectification",
  );
  const rejeitadas = ocorrencias.filter(
    (o) => o.status === "rectification_rejected",
  );

  const camposMaisAlterados = {};
  retificacoes.forEach((r) => {
    if (r.campos_alterados) {
      try {
        const campos = JSON.parse(r.campos_alterados);
        campos.forEach((c) => {
          const label = c.label || c.campo;
          if (!camposMaisAlterados[label]) camposMaisAlterados[label] = 0;
          camposMaisAlterados[label]++;
        });
      } catch (e) {}
    }
  });

  const topCampos = Object.keys(camposMaisAlterados)
    .map((key) => ({ campo: key, total: camposMaisAlterados[key] }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  let html = `
    <div class="container" style="padding-bottom:120px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
          <i class="fas fa-sync-alt" style="margin-right:8px;"></i>
          Relatório de Retificações
        </h2>
        <button onclick="window._relatoriosVoltar()" class="btn-secondary" style="padding:3px 10px;font-size:10px;min-height:auto;width:auto;border-radius:6px;">
          <i class="fas fa-arrow-left"></i>
        </button>
      </div>
      <p style="color:var(--cinza-medio);margin-bottom:12px;font-size:12px;">
        <i class="fas fa-calendar" style="margin-right:4px;"></i>
        ${formatarData(dataInicio)} até ${formatarData(dataFim)}
      </p>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px;">
        <div style="background:var(--verde-bandeira);border-radius:var(--border-radius);padding:8px;text-align:center;color:var(--branco);">
          <div style="font-size:16px;font-weight:800;">${retificacoes.length}</div>
          <div style="font-size:9px;opacity:0.8;">Aprovadas</div>
        </div>
        <div style="background:var(--aviso);border-radius:var(--border-radius);padding:8px;text-align:center;color:var(--branco);">
          <div style="font-size:16px;font-weight:800;">${pendentes.length}</div>
          <div style="font-size:9px;opacity:0.8;">Pendentes</div>
        </div>
        <div style="background:var(--erro);border-radius:var(--border-radius);padding:8px;text-align:center;color:var(--branco);">
          <div style="font-size:16px;font-weight:800;">${rejeitadas.length}</div>
          <div style="font-size:9px;opacity:0.8;">Rejeitadas</div>
        </div>
      </div>

      ${
        topCampos.length > 0
          ? `
        <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);margin-bottom:10px;">
          <h4 style="color:var(--azul-bandeira);margin-bottom:6px;font-size:13px;">
            <i class="fas fa-edit" style="margin-right:4px;"></i>
            Campos Mais Alterados
          </h4>
          ${topCampos
            .map(
              (c) => `
            <div style="display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid var(--cinza-claro);font-size:13px;">
              <span style="flex:1;">${c.campo}</span>
              <span style="font-weight:700;color:var(--azul-bandeira);">${c.total}</span>
              <span style="font-size:11px;color:var(--cinza-medio);">vezes</span>
            </div>
          `,
            )
            .join("")}
        </div>
      `
          : ""
      }

      <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);">
        <h4 style="color:var(--azul-bandeira);margin-bottom:6px;font-size:13px;">
          <i class="fas fa-list" style="margin-right:4px;"></i>
          Últimas Retificações
        </h4>
        ${retificacoes
          .slice(0, 10)
          .map(
            (r) => `
          <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--cinza-claro);font-size:12px;">
            <span>#${r.numero_ocorrencia || r.numero_temporario || "N/A"}</span>
            <span style="color:var(--cinza-medio);">${formatarData(r.criado_em)}</span>
          </div>
        `,
          )
          .join("")}
        ${
          retificacoes.length === 0
            ? `
          <p style="text-align:center;color:var(--cinza-medio);padding:12px;font-size:13px;">
            Nenhuma retificação no período
          </p>
        `
            : ""
        }
      </div>
    </div>
  `;

  container.innerHTML = html;
}

// ============================================
// RELATÓRIO DE CANCELAMENTOS
// ============================================

async function renderRelatorioCancelamentos(
  container,
  ocorrencias,
  dataInicio,
  dataFim,
  appInstance,
) {
  const canceladas = ocorrencias.filter((o) => o.status === "cancelled");

  const motivos = {};
  canceladas.forEach((o) => {
    const motivo = o.motivo_cancelamento || "Não informado";
    if (!motivos[motivo]) motivos[motivo] = 0;
    motivos[motivo]++;
  });

  const topMotivos = Object.keys(motivos)
    .map((key) => ({ motivo: key, total: motivos[key] }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  let html = `
    <div class="container" style="padding-bottom:120px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
          <i class="fas fa-times-circle" style="margin-right:8px;"></i>
          Relatório de Cancelamentos
        </h2>
        <button onclick="window._relatoriosVoltar()" class="btn-secondary" style="padding:3px 10px;font-size:10px;min-height:auto;width:auto;border-radius:6px;">
          <i class="fas fa-arrow-left"></i>
        </button>
      </div>
      <p style="color:var(--cinza-medio);margin-bottom:12px;font-size:12px;">
        <i class="fas fa-calendar" style="margin-right:4px;"></i>
        ${formatarData(dataInicio)} até ${formatarData(dataFim)}
      </p>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">
        <div style="background:var(--erro);border-radius:var(--border-radius);padding:8px;text-align:center;color:var(--branco);">
          <div style="font-size:18px;font-weight:800;">${canceladas.length}</div>
          <div style="font-size:9px;opacity:0.8;">Total Canceladas</div>
        </div>
        <div style="background:var(--azul-bandeira);border-radius:var(--border-radius);padding:8px;text-align:center;color:var(--branco);">
          <div style="font-size:18px;font-weight:800;">${ocorrencias.length > 0 ? ((canceladas.length / ocorrencias.length) * 100).toFixed(1) : 0}%</div>
          <div style="font-size:9px;opacity:0.8;">Taxa de Cancelamento</div>
        </div>
      </div>

      ${
        topMotivos.length > 0
          ? `
        <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);margin-bottom:10px;">
          <h4 style="color:var(--azul-bandeira);margin-bottom:6px;font-size:13px;">
            <i class="fas fa-list" style="margin-right:4px;"></i>
            Principais Motivos
          </h4>
          ${topMotivos
            .map(
              (m) => `
            <div style="display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid var(--cinza-claro);font-size:13px;">
              <span style="flex:1;">${m.motivo}</span>
              <span style="font-weight:700;color:var(--erro);">${m.total}</span>
            </div>
          `,
            )
            .join("")}
        </div>
      `
          : ""
      }
    </div>
  `;

  container.innerHTML = html;
}

// ============================================
// RELATÓRIO DE TENDÊNCIAS
// ============================================

async function renderRelatorioTendencias(
  container,
  ocorrencias,
  dataInicio,
  dataFim,
  appInstance,
) {
  const porDiaSemana = {};
  const porHora = {};
  const porMes = agruparPorMes(ocorrencias);

  ocorrencias.forEach((o) => {
    const data = new Date(o.criado_em);
    const diaSemana = data.getDay();
    const hora = data.getHours();
    if (!porDiaSemana[diaSemana]) porDiaSemana[diaSemana] = 0;
    porDiaSemana[diaSemana]++;
    if (!porHora[hora]) porHora[hora] = 0;
    porHora[hora]++;
  });

  const dadosDiaSemana = Object.keys(porDiaSemana)
    .map((key) => ({
      dia: DIAS_SEMANA[parseInt(key)],
      total: porDiaSemana[key],
    }))
    .sort((a, b) => DIAS_SEMANA.indexOf(a.dia) - DIAS_SEMANA.indexOf(b.dia));

  const dadosHora = Object.keys(porHora)
    .map((key) => ({ hora: parseInt(key), total: porHora[key] }))
    .sort((a, b) => a.hora - b.hora);

  let html = `
    <div class="container" style="padding-bottom:120px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
          <i class="fas fa-chart-line" style="margin-right:8px;"></i>
          Tendências e Sazonalidade
        </h2>
        <button onclick="window._relatoriosVoltar()" class="btn-secondary" style="padding:3px 10px;font-size:10px;min-height:auto;width:auto;border-radius:6px;">
          <i class="fas fa-arrow-left"></i>
        </button>
      </div>
      <p style="color:var(--cinza-medio);margin-bottom:12px;font-size:12px;">
        <i class="fas fa-calendar" style="margin-right:4px;"></i>
        ${formatarData(dataInicio)} até ${formatarData(dataFim)}
      </p>

      <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);margin-bottom:10px;">
        <h4 style="color:var(--azul-bandeira);margin-bottom:6px;font-size:13px;">
          <i class="fas fa-chart-bar" style="margin-right:4px;"></i>
          Evolução Mensal
        </h4>
        <div style="height:150px;">
          <canvas id="chartTendenciasMensal"></canvas>
        </div>
      </div>

      <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);margin-bottom:10px;">
        <h4 style="color:var(--azul-bandeira);margin-bottom:6px;font-size:13px;">
          <i class="fas fa-calendar-week" style="margin-right:4px;"></i>
          Ocorrências por Dia da Semana
        </h4>
        <div style="height:120px;">
          <canvas id="chartTendenciasDiaSemana"></canvas>
        </div>
      </div>

      <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);">
        <h4 style="color:var(--azul-bandeira);margin-bottom:6px;font-size:13px;">
          <i class="fas fa-clock" style="margin-right:4px;"></i>
          Ocorrências por Hora do Dia
        </h4>
        <div style="height:120px;">
          <canvas id="chartTendenciasHora"></canvas>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;

  await renderizarGraficoBarras("chartTendenciasMensal", porMes);
  await renderizarGraficoBarras(
    "chartTendenciasDiaSemana",
    dadosDiaSemana.map((d) => ({ label: d.dia, value: d.total })),
  );
  await renderizarGraficoBarras(
    "chartTendenciasHora",
    dadosHora.map((d) => ({
      label: String(d.hora).padStart(2, "0") + "h",
      value: d.total,
    })),
  );
}

// ============================================
// RELATÓRIO DE PRODUTIVIDADE
// ============================================

async function renderRelatorioProdutividade(
  container,
  ocorrencias,
  dataInicio,
  dataFim,
  appInstance,
) {
  const total = ocorrencias.length;
  const finalizadas = ocorrencias.filter((o) => o.status === "synced").length;
  const pendentes = ocorrencias.filter(
    (o) => o.status === "pending_sync",
  ).length;
  const totalDias = calcularDiasPeriodo(dataInicio, dataFim);
  const mediaDiaria = totalDias > 0 ? (total / totalDias).toFixed(1) : 0;
  const projecao = mediaDiaria * 30;

  const dataAnteriorInicio = calcularDataAnterior(dataInicio, dataFim);
  const dataAnteriorFim = dataInicio;
  const ocorrenciasAnterior = await buscarOcorrenciasPeriodo(
    dataAnteriorInicio,
    dataAnteriorFim,
  );
  const totalAnterior = ocorrenciasAnterior.length;
  const variacao =
    totalAnterior > 0
      ? (((total - totalAnterior) / totalAnterior) * 100).toFixed(1)
      : 0;

  let html = `
    <div class="container" style="padding-bottom:120px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
          <i class="fas fa-rocket" style="margin-right:8px;"></i>
          Produtividade do Setor
        </h2>
        <button onclick="window._relatoriosVoltar()" class="btn-secondary" style="padding:3px 10px;font-size:10px;min-height:auto;width:auto;border-radius:6px;">
          <i class="fas fa-arrow-left"></i>
        </button>
      </div>
      <p style="color:var(--cinza-medio);margin-bottom:12px;font-size:12px;">
        <i class="fas fa-calendar" style="margin-right:4px;"></i>
        ${formatarData(dataInicio)} até ${formatarData(dataFim)}
      </p>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">
        <div style="background:var(--azul-bandeira);border-radius:var(--border-radius);padding:8px;text-align:center;color:var(--branco);">
          <div style="font-size:16px;font-weight:800;">${total}</div>
          <div style="font-size:9px;opacity:0.8;">Ocorrências</div>
        </div>
        <div style="background:var(--verde-bandeira);border-radius:var(--border-radius);padding:8px;text-align:center;color:var(--branco);">
          <div style="font-size:16px;font-weight:800;">${mediaDiaria}</div>
          <div style="font-size:9px;opacity:0.8;">Média Diária</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">
        <div style="background:var(--branco);border-radius:var(--border-radius);padding:8px;box-shadow:var(--sombra-suave);text-align:center;">
          <div style="font-size:16px;font-weight:800;color:var(--cinza-escuro);">${projecao}</div>
          <div style="font-size:9px;color:var(--cinza-medio);">Projeção Mensal</div>
        </div>
        <div style="background:var(--branco);border-radius:var(--border-radius);padding:8px;box-shadow:var(--sombra-suave);text-align:center;">
          <div style="font-size:16px;font-weight:800;color:${variacao >= 0 ? "var(--verde-bandeira)" : "var(--erro)"};">${variacao >= 0 ? "+" : ""}${variacao}%</div>
          <div style="font-size:9px;color:var(--cinza-medio);">Variação vs Período Anterior</div>
        </div>
      </div>

      <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);">
        <h4 style="color:var(--azul-bandeira);margin-bottom:6px;font-size:13px;">
          <i class="fas fa-info-circle" style="margin-right:4px;"></i>
          Resumo do Período
        </h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:12px;">
          <div><span style="color:var(--cinza-medio);">Finalizadas:</span> <strong>${finalizadas}</strong></div>
          <div><span style="color:var(--cinza-medio);">Pendentes:</span> <strong>${pendentes}</strong></div>
          <div><span style="color:var(--cinza-medio);">Dias no período:</span> <strong>${totalDias}</strong></div>
          <div><span style="color:var(--cinza-medio);">Taxa resolução:</span> <strong>${total > 0 ? ((finalizadas / total) * 100).toFixed(1) : 0}%</strong></div>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

// ============================================
// RELATÓRIO DETALHADO (LISTA COMPLETA)
// ============================================

async function renderRelatorioDetalhadoLista(
  container,
  ocorrencias,
  dataInicio,
  dataFim,
  appInstance,
) {
  const porTipo = agruparPorTipo(ocorrencias);

  let html = `
    <div class="container" style="padding-bottom:120px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
          <i class="fas fa-list-ul" style="margin-right:8px;"></i>
          Ocorrências Detalhado
        </h2>
        <button onclick="window._relatoriosVoltar()" class="btn-secondary" style="padding:3px 10px;font-size:10px;min-height:auto;width:auto;border-radius:6px;">
          <i class="fas fa-arrow-left"></i>
        </button>
      </div>
      <p style="color:var(--cinza-medio);margin-bottom:12px;font-size:12px;">
        <i class="fas fa-calendar" style="margin-right:4px;"></i>
        ${formatarData(dataInicio)} até ${formatarData(dataFim)}
        <span style="margin-left:8px;font-weight:600;">${ocorrencias.length} ocorrências</span>
      </p>

      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;">
        ${porTipo
          .slice(0, 5)
          .map(
            (t) => `
          <span class="badge" style="background:var(--azul-muito-claro);color:var(--azul-bandeira);font-size:10px;padding:2px 10px;">
            ${t.tipo}: ${t.total}
          </span>
        `,
          )
          .join("")}
      </div>

      <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);">
        <div class="table-wrapper">
          <table style="font-size:11px;">
            <thead>
              <tr>
                <th>Nº</th>
                <th>Data</th>
                <th>Tipo</th>
                <th>Local</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${ocorrencias
                .slice(0, 50)
                .map(
                  (o) => `
                <tr onclick="window._relatoriosVerDetalhes('${o.id}')" style="cursor:pointer;">
                  <td style="font-weight:600;color:var(--azul-bandeira);">${o.numero_ocorrencia || o.numero_temporario || "Rascunho"}</td>
                  <td style="font-size:10px;color:var(--cinza-medio);">${formatarData(o.criado_em)}</td>
                  <td>${getTipoLabel(o.tipo_ocorrencia)}</td>
                  <td style="max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${o.local_ocorrencia || "-"}</td>
                  <td><span class="badge badge-${getStatusClass(o.status)}" style="font-size:9px;">${getStatusLabel(o.status)}</span></td>
                </tr>
              `,
                )
                .join("")}
              ${
                ocorrencias.length > 50
                  ? `
                <tr>
                  <td colspan="5" style="text-align:center;color:var(--cinza-medio);font-size:12px;padding:12px;">
                    + ${ocorrencias.length - 50} outras ocorrências
                  </td>
                </tr>
              `
                  : ""
              }
              ${
                ocorrencias.length === 0
                  ? `
                <tr>
                  <td colspan="5" style="text-align:center;color:var(--cinza-medio);padding:20px;font-size:13px;">
                    Nenhuma ocorrência no período
                  </td>
                </tr>
              `
                  : ""
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

// ============================================
// RELATÓRIO MAPA COM CLUSTERS
// ============================================

async function renderRelatorioMapa(
  container,
  dataInicio,
  dataFim,
  appInstance,
) {
  const filtros = {
    data_inicio: dataInicio,
    data_fim: dataFim,
    limit: 500,
  };

  let dadosMapa = [];
  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (client) {
      let query = client
        .from("ocorrencias")
        .select("*")
        .eq("esta_ativa", true)
        .not("latitude", "is", null)
        .not("longitude", "is", null)
        .gte("criado_em", dataInicio)
        .lte("criado_em", dataFim + "T23:59:59")
        .limit(500);

      const { data, error } = await query;
      if (!error && data) {
        dadosMapa = data.map((o) => ({
          id: o.id,
          latitude: o.latitude,
          longitude: o.longitude,
          tipo: o.tipo_ocorrencia,
          status: o.status,
          local: o.local_ocorrencia,
          data: o.criado_em,
          numero: o.numero_ocorrencia || o.numero_temporario || "Rascunho",
          criador: o.criador || { nome_completo: "Desconhecido" },
        }));
      }
    }
  } catch (error) {
    console.error("Erro ao buscar dados para o mapa:", error);
  }

  const html = `
    <div class="container" style="padding-bottom:120px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;flex-wrap:wrap;gap:8px;">
        <div>
          <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
            <i class="fas fa-map-marked-alt" style="margin-right:8px;"></i>
            Mapa de Ocorrências (Clusters)
          </h2>
          <p style="color:var(--cinza-medio);margin-top:2px;font-size:12px;">
            <i class="fas fa-calendar" style="margin-right:4px;"></i>
            ${formatarData(dataInicio)} até ${formatarData(dataFim)}
            <span style="margin-left:8px;font-weight:600;">${dadosMapa.length} ocorrências com localização</span>
          </p>
        </div>
        <button onclick="window._relatoriosVoltar()" class="btn-secondary" style="padding:4px 12px;font-size:12px;min-height:auto;width:auto;border-radius:6px;">
          <i class="fas fa-arrow-left"></i> Voltar
        </button>
      </div>

      <div id="mapaContainer" class="mapa-container" style="width:100%;height:400px;border-radius:var(--border-radius);overflow:hidden;box-shadow:var(--sombra-suave);margin-bottom:12px;position:relative;background:#f1f5f9;border:2px solid var(--cinza-claro);">
        ${
          dadosMapa.length === 0
            ? `
          <div class="mapa-sem-dados" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--cinza-medio);text-align:center;padding:20px;">
            <i class="fas fa-map" style="font-size:48px;color:var(--cinza-claro);margin-bottom:12px;"></i>
            <p>Nenhuma ocorrência com localização encontrada no período</p>
            <p style="font-size:12px;margin-top:4px;">Verifique se as ocorrências têm coordenadas de GPS</p>
          </div>
        `
            : `
          <div class="mapa-loading" id="mapaLoading" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:8px;color:var(--cinza-medio);z-index:1;pointer-events:none;">
            <div class="spinner" style="width:32px;height:32px;border:3px solid var(--cinza-claro);border-top-color:var(--azul-bandeira);border-radius:50%;animation:spin 0.8s linear infinite;"></div>
            <span>Carregando mapa com clusters...</span>
          </div>
        `
        }
      </div>

      ${
        dadosMapa.length > 0
          ? `
        <div class="mapa-heatmap-legend" style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:rgba(255,255,255,0.9);border-radius:var(--border-radius);font-size:11px;color:var(--cinza-escuro);box-shadow:var(--sombra-suave);margin-top:4px;flex-wrap:wrap;">
          <span><i class="fas fa-circle" style="color:#00ff00;"></i> Baixa</span>
          <span><i class="fas fa-circle" style="color:#ffff00;"></i> Média</span>
          <span><i class="fas fa-circle" style="color:#ff0000;"></i> Alta</span>
          <span class="gradiente" style="width:120px;height:10px;border-radius:4px;background:linear-gradient(to right, #00ff00, #ffff00, #ff0000);"></span>
          <span style="margin-left:auto;font-size:10px;color:var(--cinza-medio);">
            ${dadosMapa.length} ocorrências
          </span>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
          <div style="background:var(--branco);border-radius:var(--border-radius);padding:8px 12px;box-shadow:var(--sombra-suave);flex:1;text-align:center;min-width:80px;">
            <div style="font-size:18px;font-weight:800;color:var(--azul-bandeira);">${dadosMapa.length}</div>
            <div style="font-size:10px;color:var(--cinza-medio);">Com localização</div>
          </div>
          <div style="background:var(--branco);border-radius:var(--border-radius);padding:8px 12px;box-shadow:var(--sombra-suave);flex:1;text-align:center;min-width:80px;">
            <div style="font-size:18px;font-weight:800;color:var(--verde-bandeira);">
              ${new Set(dadosMapa.map((o) => o.tipo)).size}
            </div>
            <div style="font-size:10px;color:var(--cinza-medio);">Tipos diferentes</div>
          </div>
        </div>
      `
          : ""
      }
    </div>
  `;

  container.innerHTML = html;

  if (dadosMapa.length > 0) {
    setTimeout(() => {
      inicializarMapaComClusters(dadosMapa, container);
    }, 300);
  }
}

function inicializarMapaComClusters(dados, container) {
  const mapaContainer = document.getElementById("mapaContainer");
  if (!mapaContainer) return;

  if (typeof L === "undefined") {
    console.warn("⚠️ Leaflet não carregado");
    return;
  }

  const loading = document.getElementById("mapaLoading");
  if (loading) loading.style.display = "none";

  if (estado.mapaInstance) {
    try {
      estado.mapaInstance.remove();
    } catch (e) {}
    estado.mapaInstance = null;
  }

  const dadosValidos = dados.filter(
    (p) =>
      p.latitude &&
      p.longitude &&
      !isNaN(parseFloat(p.latitude)) &&
      !isNaN(parseFloat(p.longitude)),
  );

  if (dadosValidos.length === 0) {
    mapaContainer.innerHTML = `
      <div class="mapa-sem-dados" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--cinza-medio);text-align:center;padding:20px;">
        <i class="fas fa-map" style="font-size:48px;color:var(--cinza-claro);margin-bottom:12px;"></i>
        <p>Nenhuma coordenada válida encontrada</p>
      </div>
    `;
    return;
  }

  try {
    const centro = calcularCentroMapa(dadosValidos);
    const map = L.map(mapaContainer, {
      zoomControl: true,
      attributionControl: true,
      fadeAnimation: true,
      zoomAnimation: true,
      center: centro,
      zoom: 13,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    const markers = L.markerClusterGroup({
      showCoverageOnHover: true,
      zoomToBoundsOnClick: true,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 50,
      iconCreateFunction: function (cluster) {
        const count = cluster.getChildCount();
        let size = "small";
        let color = "#003F87";
        if (count > 20) {
          size = "large";
          color = "#DC2626";
        } else if (count > 10) {
          size = "medium";
          color = "#F59E0B";
        }
        return L.divIcon({
          html: `<div style="background:${color};color:white;border-radius:50%;width:${size === "large" ? 40 : size === "medium" ? 34 : 28}px;height:${size === "large" ? 40 : size === "medium" ? 34 : 28}px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${size === "large" ? 14 : 12}px;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);">${count}</div>`,
          className: "cluster-marker",
          iconSize: [
            size === "large" ? 40 : size === "medium" ? 34 : 28,
            size === "large" ? 40 : size === "medium" ? 34 : 28,
          ],
        });
      },
    });

    const cores = {
      furto: "#f97316",
      roubo: "#dc2626",
      vandalismo: "#f97316",
      dano_ao_patrimonio: "#f97316",
      ameaca: "#dc2626",
      lesao_corporal: "#dc2626",
      perturbacao: "#f97316",
      acidente: "#eab308",
      incendio: "#dc2626",
      desaparecimento: "#8b5cf6",
      atendimento_social: "#06b6d4",
      outro: "#6b7280",
    };

    dadosValidos.forEach((p) => {
      const tipo = p.tipo || "outro";
      const cor = cores[tipo] || "#6b7280";

      const icon = L.divIcon({
        className: "marcador-ocorrencia",
        html: `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${cor};display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 4px 20px rgba(0,0,0,0.18);">
          <i class="fas fa-circle" style="transform:rotate(45deg);font-size:10px;color:white;"></i>
        </div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        popupAnchor: [0, -28],
      });

      const popupContent = `
        <div style="font-weight:700;font-size:14px;color:var(--azul-bandeira);">#${p.numero || "Sem número"}</div>
        <div style="display:inline-block;padding:1px 10px;border-radius:9999px;font-size:10px;font-weight:600;text-transform:uppercase;color:#fff;background:${cor};margin-bottom:4px;">
          ${getTipoLabel(tipo)}
        </div>
        <div style="font-size:12px;color:var(--cinza-escuro);"><i class="fas fa-map-pin"></i> ${p.local || "Local não informado"}</div>
        <div style="font-size:11px;color:var(--cinza-medio);"><i class="fas fa-user"></i> ${p.criador?.nome_completo || "Desconhecido"}</div>
        <div style="font-size:11px;color:var(--cinza-medio);margin-top:4px;">
          ${p.data ? new Date(p.data).toLocaleDateString("pt-BR") : ""}
          ${p.status ? ` • <span class="badge badge-${getStatusClass(p.status)}" style="font-size:9px;">${getStatusLabel(p.status)}</span>` : ""}
        </div>
        <div style="margin-top:6px;">
          <button onclick="window._relatoriosVerDetalhes('${p.id}')" class="btn-secondary" style="padding:2px 10px;font-size:11px;min-height:auto;width:auto;border-radius:4px;">
            <i class="fas fa-eye"></i> Ver detalhes
          </button>
        </div>
      `;

      const marker = L.marker(
        [parseFloat(p.latitude), parseFloat(p.longitude)],
        { icon },
      );
      marker.bindPopup(popupContent, { maxWidth: 280 });
      markers.addLayer(marker);
    });

    map.addLayer(markers);

    if (dadosValidos.length > 1) {
      const bounds = L.latLngBounds(
        dadosValidos.map((p) => [
          parseFloat(p.latitude),
          parseFloat(p.longitude),
        ]),
      );
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }

    setTimeout(() => {
      try {
        map.invalidateSize();
      } catch (e) {}
    }, 500);

    estado.mapaInstance = map;
  } catch (error) {
    console.error("Erro ao inicializar mapa com clusters:", error);
    mapaContainer.innerHTML = `
      <div class="mapa-sem-dados" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--cinza-medio);text-align:center;padding:20px;">
        <i class="fas fa-exclamation-triangle" style="font-size:48px;color:var(--erro);margin-bottom:12px;"></i>
        <p>Erro ao carregar mapa: ${error.message}</p>
      </div>
    `;
  }
}

// ============================================
// RELATÓRIO POR GUARDA (COM ABORDAGENS)
// ============================================

async function renderRelatorioPorGuarda(
  container,
  ocorrencias,
  dataInicio,
  dataFim,
  appInstance,
) {
  const criadoresIds = [...new Set(ocorrencias.map((o) => o.criado_por))];
  const dadosUsuarios = await buscarDadosUsuariosEmLote(criadoresIds);

  const client =
    typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
  let abordagens = [];
  if (client) {
    try {
      const [veiculosResult, pessoasResult] = await Promise.all([
        client
          .from("abordagens_veiculos")
          .select("*")
          .gte("criado_em", dataInicio)
          .lte("criado_em", dataFim + "T23:59:59"),
        client
          .from("abordagens_pessoas")
          .select("*")
          .gte("criado_em", dataInicio)
          .lte("criado_em", dataFim + "T23:59:59"),
      ]);
      abordagens = [
        ...(veiculosResult.data || []).map((v) => ({
          ...v,
          tipo_abordagem: "veiculo",
        })),
        ...(pessoasResult.data || []).map((p) => ({
          ...p,
          tipo_abordagem: "pessoa",
        })),
      ];
    } catch (e) {
      console.warn("Erro ao buscar abordagens:", e);
    }
  }

  const agrupado = {};
  ocorrencias.forEach((o) => {
    const id = o.criado_por;
    const nome = dadosUsuarios[id]?.nome_completo || "Usuário não identificado";
    if (!agrupado[id]) {
      agrupado[id] = { nome, total: 0, tipos: {}, abordagens: 0 };
    }
    agrupado[id].total++;
    const tipo = getTipoLabel(o.tipo_ocorrencia);
    agrupado[id].tipos[tipo] = (agrupado[id].tipos[tipo] || 0) + 1;
  });

  abordagens.forEach((a) => {
    const id = a.criado_por;
    if (agrupado[id]) {
      agrupado[id].abordagens++;
    }
  });

  const ranking = Object.values(agrupado).sort(
    (a, b) => b.total + b.abordagens - (a.total + a.abordagens),
  );

  let html = `
    <div class="container" style="padding-bottom:100px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
          <i class="fas fa-user-shield" style="margin-right:8px;"></i>
          Por Guarda (com Abordagens)
        </h2>
        <div style="display:flex;gap:8px;">
          <button onclick="window._relatoriosExportarPorGuardaPDF()" class="btn-primary" style="padding:4px 12px;font-size:12px;min-height:auto;width:auto;background:var(--erro);border-radius:6px;">
            <i class="fas fa-file-pdf"></i> PDF
          </button>
          <button onclick="window._relatoriosVoltar()" class="btn-secondary" style="padding:4px 12px;font-size:12px;min-height:auto;width:auto;border-radius:6px;">
            <i class="fas fa-arrow-left"></i> Voltar
          </button>
        </div>
      </div>

      <div class="stats-card" style="margin-bottom:16px;background:var(--branco);padding:16px;border-radius:var(--border-radius);box-shadow:var(--sombra-suave);">
        <div style="font-size:12px;color:var(--cinza-medio);margin-bottom:4px;">Período</div>
        <div style="font-weight:600;color:var(--azul-bandeira);font-size:14px;">
          ${dataInicio.split("-").reverse().join("/")} até ${dataFim.split("-").reverse().join("/")}
        </div>
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--cinza-claro);display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <div>
            <div style="font-size:11px;color:var(--cinza-medio);">Total de Ocorrências</div>
            <div style="font-size:20px;font-weight:700;color:var(--azul-bandeira);">${ocorrencias.length}</div>
          </div>
          <div>
            <div style="font-size:11px;color:var(--cinza-medio);">Total de Abordagens</div>
            <div style="font-size:20px;font-weight:700;color:var(--verde-bandeira);">${abordagens.length}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px;color:var(--cinza-medio);">Agentes Ativos</div>
            <div style="font-size:20px;font-weight:700;color:var(--roxo);">${ranking.length}</div>
          </div>
        </div>
      </div>

      <div class="ranking-lista">
        ${
          ranking.length === 0
            ? `
          <div style="text-align:center;padding:40px 20px;color:var(--cinza-medio);">
            <i class="fas fa-info-circle" style="font-size:32px;margin-bottom:12px;opacity:0.3;"></i>
            <p>Nenhuma ocorrência encontrada neste período.</p>
          </div>
        `
            : ranking
                .map((item, index) => {
                  const medalha =
                    index === 0
                      ? "🥇"
                      : index === 1
                        ? "🥈"
                        : index === 2
                          ? "🥉"
                          : "";
                  const totalAtendimentos = item.total + item.abordagens;
                  return `
            <div style="background:var(--branco);border-radius:var(--border-radius);padding:12px;box-shadow:var(--sombra-suave);border-left:4px solid var(--roxo);margin-bottom:12px;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <div style="width:32px;height:32px;border-radius:50%;background:var(--roxo);color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;">
                    ${index + 1}
                  </div>
                  <div>
                    <div style="font-weight:700;color:var(--azul-bandeira);font-size:14px;">${medalha} ${item.nome}</div>
                    <div style="font-size:11px;color:var(--cinza-medio);">Agente da Guarda Municipal</div>
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:12px;">
                  <div style="text-align:right;">
                    <div style="font-size:18px;font-weight:800;color:var(--roxo);">${totalAtendimentos}</div>
                    <div style="font-size:10px;color:var(--cinza-medio);text-transform:uppercase;font-weight:600;">Total</div>
                  </div>
                </div>
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px;padding-top:8px;border-top:1px dashed var(--cinza-claro);">
                <span style="background:var(--azul-muito-claro);color:var(--azul-bandeira);padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;">
                  📋 Ocorrências: ${item.total}
                </span>
                <span style="background:var(--verde-muito-claro);color:var(--verde-escuro);padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;">
                  👮 Abordagens: ${item.abordagens}
                </span>
                ${Object.entries(item.tipos)
                  .map(
                    ([tipo, qtd]) => `
                  <span style="background:var(--cinza-claro);color:var(--cinza-escuro);padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;">
                    ${tipo}: ${qtd}
                  </span>
                `,
                  )
                  .join("")}
              </div>
            </div>
          `;
                })
                .join("")
        }
      </div>
    </div>
  `;

  container.innerHTML = html;

  window._relatoriosExportarPorGuardaPDF = () =>
    exportarPorGuardaPDF(ranking, dataInicio, dataFim, appInstance);
}

// ============================================
// RELATÓRIO DE PREVISÃO
// ============================================

async function renderRelatorioPrevisao(
  container,
  ocorrencias,
  dataInicio,
  dataFim,
  appInstance,
) {
  estado.previsaoCarregando = true;

  try {
    const total = ocorrencias.length;
    const dias = calcularDiasPeriodo(dataInicio, dataFim);
    const mediaDiaria = dias > 0 ? total / dias : 0;
    const projecaoMensal = mediaDiaria * 30;
    const projecaoSemanal = mediaDiaria * 7;

    const porDiaSemana = {};
    ocorrencias.forEach((o) => {
      const data = new Date(o.criado_em);
      const diaSemana = data.getDay();
      if (!porDiaSemana[diaSemana]) porDiaSemana[diaSemana] = 0;
      porDiaSemana[diaSemana]++;
    });

    const diasOrdenados = Object.keys(porDiaSemana)
      .map((key) => ({
        dia: DIAS_SEMANA[parseInt(key)],
        total: porDiaSemana[key],
      }))
      .sort((a, b) => b.total - a.total);

    const diaPico =
      diasOrdenados.length > 0 ? diasOrdenados[0] : { dia: "N/A", total: 0 };
    const segundoDia = diasOrdenados.length > 1 ? diasOrdenados[1] : null;

    const porHora = {};
    ocorrencias.forEach((o) => {
      const data = new Date(o.criado_em);
      const hora = data.getHours();
      if (!porHora[hora]) porHora[hora] = 0;
      porHora[hora]++;
    });

    const horasOrdenadas = Object.keys(porHora)
      .map((key) => ({ hora: parseInt(key), total: porHora[key] }))
      .sort((a, b) => b.total - a.total);

    const horaPico =
      horasOrdenadas.length > 0 ? horasOrdenadas[0] : { hora: 0, total: 0 };
    const tendencia =
      mediaDiaria > 0 ? ((mediaDiaria / 30) * 100).toFixed(1) : 0;

    const html = `
      <div class="container" style="padding-bottom:120px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
            <i class="fas fa-brain" style="margin-right:8px;"></i>
            Previsão de Ocorrências
          </h2>
          <button onclick="window._relatoriosVoltar()" class="btn-secondary" style="padding:3px 10px;font-size:10px;min-height:auto;width:auto;border-radius:6px;">
            <i class="fas fa-arrow-left"></i>
          </button>
        </div>
        <p style="color:var(--cinza-medio);margin-bottom:12px;font-size:12px;">
          <i class="fas fa-calendar" style="margin-right:4px;"></i>
          Baseado em ${formatarData(dataInicio)} até ${formatarData(dataFim)}
          <span style="margin-left:8px;font-weight:600;">${total} ocorrências analisadas</span>
        </p>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:12px;">
          <div style="background:var(--gradiente-principal);border-radius:var(--border-radius);padding:10px;text-align:center;color:var(--branco);">
            <div style="font-size:20px;font-weight:800;">${mediaDiaria.toFixed(1)}</div>
            <div style="font-size:10px;opacity:0.8;">Média Diária</div>
          </div>
          <div style="background:var(--verde-bandeira);border-radius:var(--border-radius);padding:10px;text-align:center;color:var(--branco);">
            <div style="font-size:20px;font-weight:800;">${projecaoSemanal.toFixed(0)}</div>
            <div style="font-size:10px;opacity:0.8;">Projeção Semanal</div>
          </div>
          <div style="background:var(--azul-bandeira);border-radius:var(--border-radius);padding:10px;text-align:center;color:var(--branco);">
            <div style="font-size:20px;font-weight:800;">${projecaoMensal.toFixed(0)}</div>
            <div style="font-size:10px;opacity:0.8;">Projeção Mensal</div>
          </div>
        </div>

        <div style="background:var(--branco);border-radius:var(--border-radius);padding:12px;box-shadow:var(--sombra-suave);margin-bottom:12px;">
          <h4 style="color:var(--azul-bandeira);margin:0 0 8px 0;font-size:14px;">
            <i class="fas fa-lightbulb" style="margin-right:6px;"></i>
            Insights e Padrões
          </h4>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">
            <div style="background:var(--azul-muito-claro);border-radius:var(--border-radius);padding:8px 12px;">
              <span style="color:var(--cinza-medio);">📊 Dia de Pico:</span>
              <strong style="color:var(--azul-bandeira);display:block;font-size:16px;margin-top:2px;">${diaPico.dia}</strong>
              <span style="font-size:11px;color:var(--cinza-medio);">${diaPico.total} ocorrências</span>
            </div>
            <div style="background:var(--verde-muito-claro);border-radius:var(--border-radius);padding:8px 12px;">
              <span style="color:var(--cinza-medio);">⏰ Horário de Pico:</span>
              <strong style="color:var(--verde-bandeira);display:block;font-size:16px;margin-top:2px;">${String(horaPico.hora).padStart(2, "0")}:00h</strong>
              <span style="font-size:11px;color:var(--cinza-medio);">${horaPico.total} ocorrências</span>
            </div>
          </div>
          ${
            segundoDia
              ? `
            <div style="margin-top:8px;padding:8px 12px;background:var(--aviso);border-radius:var(--border-radius);font-size:13px;color:var(--cinza-escuro);">
              <i class="fas fa-info-circle" style="color:var(--aviso);margin-right:4px;"></i>
              <strong>Segundo dia com mais ocorrências:</strong> ${segundoDia.dia} (${segundoDia.total} ocorrências)
            </div>
          `
              : ""
          }
          <div style="margin-top:8px;padding:8px 12px;background:var(--cinza-claro);border-radius:var(--border-radius);font-size:13px;color:var(--cinza-escuro);">
            <i class="fas fa-chart-line" style="color:var(--azul-bandeira);margin-right:4px;"></i>
            <strong>Tendência:</strong> ${tendencia >= 0 ? "📈 Crescente" : "📉 Decrescente"} 
            (${Math.abs(tendencia)}% de variação)
          </div>
        </div>

        <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);">
          <h4 style="color:var(--azul-bandeira);margin-bottom:6px;font-size:13px;">
            <i class="fas fa-chart-line" style="margin-right:4px;"></i>
            Projeção para os Próximos 30 Dias
          </h4>
          <div style="height:180px;">
            <canvas id="chartPrevisao"></canvas>
          </div>
          <div style="margin-top:8px;font-size:11px;color:var(--cinza-medio);text-align:center;">
            <i class="fas fa-info-circle"></i> Baseado na média diária de ${mediaDiaria.toFixed(1)} ocorrências/dia
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;

    const dadosProjecao = Array.from({ length: 30 }, (_, i) => ({
      label: `Dia ${i + 1}`,
      value: Math.max(
        0,
        mediaDiaria + (Math.random() - 0.5) * mediaDiaria * 0.4,
      ),
    }));

    await renderizarGraficoLinha(
      "chartPrevisao",
      dadosProjecao,
      "Projeção de Ocorrências",
    );
  } catch (error) {
    console.error("Erro no relatório de previsão:", error);
    container.innerHTML = `<p style="color:var(--erro);">Erro ao carregar previsão: ${error.message}</p>`;
  } finally {
    estado.previsaoCarregando = false;
  }
}

// ============================================
// RELATÓRIO DE ABORDAGENS DE VEÍCULOS (NOVO)
// ============================================

async function renderRelatorioAbordagensVeiculos(
  container,
  abordagens,
  dataInicio,
  dataFim,
  appInstance,
) {
  const veiculos = abordagens.veiculos || [];

  // Estatísticas
  const total = veiculos.length;
  const porPlaca = {};
  const porMotivo = {};
  const porFase = {};
  const porDia = {};

  veiculos.forEach((v) => {
    // Por placa
    if (!porPlaca[v.placa]) porPlaca[v.placa] = 0;
    porPlaca[v.placa]++;

    // Por motivo
    const motivo = v.motivo || "Não informado";
    if (!porMotivo[motivo]) porMotivo[motivo] = 0;
    porMotivo[motivo]++;

    // Por fase
    const fase = v.fase || "advertencia";
    if (!porFase[fase]) porFase[fase] = 0;
    porFase[fase]++;

    // Por dia
    const dia = new Date(v.criado_em).toLocaleDateString("pt-BR");
    if (!porDia[dia]) porDia[dia] = 0;
    porDia[dia]++;
  });

  const topPlacas = Object.keys(porPlaca)
    .map((key) => ({ placa: key, total: porPlaca[key] }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const topMotivos = Object.keys(porMotivo)
    .map((key) => ({ motivo: key, total: porMotivo[key] }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const fasesLabels = { advertencia: "Advertência", multa: "Multa" };

  let html = `
    <div class="container" style="padding-bottom:120px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
          <i class="fas fa-motorcycle" style="margin-right:8px;"></i>
          Abordagens de Veículos
        </h2>
        <button onclick="window._relatoriosVoltar()" class="btn-secondary" style="padding:3px 10px;font-size:10px;min-height:auto;width:auto;border-radius:6px;">
          <i class="fas fa-arrow-left"></i>
        </button>
      </div>
      <p style="color:var(--cinza-medio);margin-bottom:12px;font-size:12px;">
        <i class="fas fa-calendar" style="margin-right:4px;"></i>
        ${formatarData(dataInicio)} até ${formatarData(dataFim)}
        <span style="margin-left:8px;font-weight:600;">${total} abordagens</span>
      </p>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px;">
        <div style="background:var(--azul-bandeira);border-radius:var(--border-radius);padding:8px;text-align:center;color:var(--branco);">
          <div style="font-size:18px;font-weight:800;">${total}</div>
          <div style="font-size:9px;opacity:0.8;">Total</div>
        </div>
        <div style="background:var(--verde-bandeira);border-radius:var(--border-radius);padding:8px;text-align:center;color:var(--branco);">
          <div style="font-size:18px;font-weight:800;">${porFase.advertencia || 0}</div>
          <div style="font-size:9px;opacity:0.8;">Advertências</div>
        </div>
        <div style="background:var(--erro);border-radius:var(--border-radius);padding:8px;text-align:center;color:var(--branco);">
          <div style="font-size:18px;font-weight:800;">${porFase.multa || 0}</div>
          <div style="font-size:9px;opacity:0.8;">Multas</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
        <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);">
          <h4 style="color:var(--azul-bandeira);margin-bottom:6px;font-size:13px;">
            <i class="fas fa-trophy"></i> Top 10 Placas
          </h4>
          ${topPlacas
            .map(
              (p, i) => `
            <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--cinza-claro);font-size:12px;">
              <span>${i + 1}. ${p.placa}</span>
              <span style="font-weight:600;color:var(--azul-bandeira);">${p.total}</span>
            </div>
          `,
            )
            .join("")}
          ${topPlacas.length === 0 ? '<p style="font-size:12px;color:var(--cinza-medio);text-align:center;">Nenhuma abordagem</p>' : ""}
        </div>
        <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);">
          <h4 style="color:var(--azul-bandeira);margin-bottom:6px;font-size:13px;">
            <i class="fas fa-list"></i> Principais Motivos
          </h4>
          ${topMotivos
            .map(
              (m) => `
            <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--cinza-claro);font-size:12px;">
              <span>${m.motivo.length > 30 ? m.motivo.slice(0, 30) + "..." : m.motivo}</span>
              <span style="font-weight:600;color:var(--azul-bandeira);">${m.total}</span>
            </div>
          `,
            )
            .join("")}
          ${topMotivos.length === 0 ? '<p style="font-size:12px;color:var(--cinza-medio);text-align:center;">Nenhum motivo registrado</p>' : ""}
        </div>
      </div>

      <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);">
        <h4 style="color:var(--azul-bandeira);margin-bottom:6px;font-size:13px;">
          <i class="fas fa-chart-bar"></i> Distribuição por Fase
        </h4>
        <div style="height:120px;">
          <canvas id="chartAbordagensFases"></canvas>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;

  await renderizarGraficoBarras("chartAbordagensFases", [
    { label: "Advertência", value: porFase.advertencia || 0 },
    { label: "Multa", value: porFase.multa || 0 },
  ]);
}

// ============================================
// RELATÓRIO DE ABORDAGENS DE PESSOAS (NOVO)
// ============================================

async function renderRelatorioAbordagensPessoas(
  container,
  abordagens,
  dataInicio,
  dataFim,
  appInstance,
) {
  const pessoas = abordagens.pessoas || [];

  const total = pessoas.length;
  const porNome = {};
  const porMotivo = {};
  const porFase = {};

  pessoas.forEach((p) => {
    const nome = p.nome || "Não identificado";
    if (!porNome[nome]) porNome[nome] = 0;
    porNome[nome]++;

    const motivo = p.motivo || "Não informado";
    if (!porMotivo[motivo]) porMotivo[motivo] = 0;
    porMotivo[motivo]++;

    const fase = p.fase || "advertencia";
    if (!porFase[fase]) porFase[fase] = 0;
    porFase[fase]++;
  });

  const topNomes = Object.keys(porNome)
    .map((key) => ({ nome: key, total: porNome[key] }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const topMotivos = Object.keys(porMotivo)
    .map((key) => ({ motivo: key, total: porMotivo[key] }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  let html = `
    <div class="container" style="padding-bottom:120px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
          <i class="fas fa-user-friends" style="margin-right:8px;"></i>
          Abordagens de Pessoas
        </h2>
        <button onclick="window._relatoriosVoltar()" class="btn-secondary" style="padding:3px 10px;font-size:10px;min-height:auto;width:auto;border-radius:6px;">
          <i class="fas fa-arrow-left"></i>
        </button>
      </div>
      <p style="color:var(--cinza-medio);margin-bottom:12px;font-size:12px;">
        <i class="fas fa-calendar" style="margin-right:4px;"></i>
        ${formatarData(dataInicio)} até ${formatarData(dataFim)}
        <span style="margin-left:8px;font-weight:600;">${total} abordagens</span>
      </p>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px;">
        <div style="background:var(--verde-bandeira);border-radius:var(--border-radius);padding:8px;text-align:center;color:var(--branco);">
          <div style="font-size:18px;font-weight:800;">${total}</div>
          <div style="font-size:9px;opacity:0.8;">Total</div>
        </div>
        <div style="background:var(--azul-bandeira);border-radius:var(--border-radius);padding:8px;text-align:center;color:var(--branco);">
          <div style="font-size:18px;font-weight:800;">${porFase.advertencia || 0}</div>
          <div style="font-size:9px;opacity:0.8;">Advertências</div>
        </div>
        <div style="background:var(--erro);border-radius:var(--border-radius);padding:8px;text-align:center;color:var(--branco);">
          <div style="font-size:18px;font-weight:800;">${porFase.multa || 0}</div>
          <div style="font-size:9px;opacity:0.8;">Multas</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
        <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);">
          <h4 style="color:var(--azul-bandeira);margin-bottom:6px;font-size:13px;">
            <i class="fas fa-trophy"></i> Top 10 Pessoas
          </h4>
          ${topNomes
            .map(
              (p, i) => `
            <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--cinza-claro);font-size:12px;">
              <span>${i + 1}. ${p.nome}</span>
              <span style="font-weight:600;color:var(--azul-bandeira);">${p.total}</span>
            </div>
          `,
            )
            .join("")}
          ${topNomes.length === 0 ? '<p style="font-size:12px;color:var(--cinza-medio);text-align:center;">Nenhuma abordagem</p>' : ""}
        </div>
        <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);">
          <h4 style="color:var(--azul-bandeira);margin-bottom:6px;font-size:13px;">
            <i class="fas fa-list"></i> Principais Motivos
          </h4>
          ${topMotivos
            .map(
              (m) => `
            <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--cinza-claro);font-size:12px;">
              <span>${m.motivo.length > 30 ? m.motivo.slice(0, 30) + "..." : m.motivo}</span>
              <span style="font-weight:600;color:var(--azul-bandeira);">${m.total}</span>
            </div>
          `,
            )
            .join("")}
          ${topMotivos.length === 0 ? '<p style="font-size:12px;color:var(--cinza-medio);text-align:center;">Nenhum motivo registrado</p>' : ""}
        </div>
      </div>

      <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);">
        <h4 style="color:var(--azul-bandeira);margin-bottom:6px;font-size:13px;">
          <i class="fas fa-chart-bar"></i> Distribuição por Fase
        </h4>
        <div style="height:120px;">
          <canvas id="chartAbordagensPessoasFases"></canvas>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;

  await renderizarGraficoBarras("chartAbordagensPessoasFases", [
    { label: "Advertência", value: porFase.advertencia || 0 },
    { label: "Multa", value: porFase.multa || 0 },
  ]);
}

// ============================================
// RELATÓRIO DE ABORDAGENS GERAL (NOVO)
// ============================================

async function renderRelatorioAbordagensGeral(
  container,
  abordagens,
  dataInicio,
  dataFim,
  appInstance,
) {
  const veiculos = abordagens.veiculos || [];
  const pessoas = abordagens.pessoas || [];

  const totalVeiculos = veiculos.length;
  const totalPessoas = pessoas.length;
  const total = totalVeiculos + totalPessoas;

  const porDia = {};
  const todas = [...veiculos, ...pessoas];

  todas.forEach((a) => {
    const dia = new Date(a.criado_em).toLocaleDateString("pt-BR");
    if (!porDia[dia]) porDia[dia] = 0;
    porDia[dia]++;
  });

  const topDias = Object.keys(porDia)
    .map((key) => ({ dia: key, total: porDia[key] }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 7);

  let html = `
    <div class="container" style="padding-bottom:120px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
          <i class="fas fa-chart-bar" style="margin-right:8px;"></i>
          Abordagens Geral
        </h2>
        <button onclick="window._relatoriosVoltar()" class="btn-secondary" style="padding:3px 10px;font-size:10px;min-height:auto;width:auto;border-radius:6px;">
          <i class="fas fa-arrow-left"></i>
        </button>
      </div>
      <p style="color:var(--cinza-medio);margin-bottom:12px;font-size:12px;">
        <i class="fas fa-calendar" style="margin-right:4px;"></i>
        ${formatarData(dataInicio)} até ${formatarData(dataFim)}
        <span style="margin-left:8px;font-weight:600;">${total} abordagens</span>
      </p>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px;">
        <div style="background:var(--gradiente-principal);border-radius:var(--border-radius);padding:8px;text-align:center;color:var(--branco);">
          <div style="font-size:18px;font-weight:800;">${total}</div>
          <div style="font-size:9px;opacity:0.8;">Total</div>
        </div>
        <div style="background:var(--azul-bandeira);border-radius:var(--border-radius);padding:8px;text-align:center;color:var(--branco);">
          <div style="font-size:18px;font-weight:800;">${totalVeiculos}</div>
          <div style="font-size:9px;opacity:0.8;">Veículos</div>
        </div>
        <div style="background:var(--verde-bandeira);border-radius:var(--border-radius);padding:8px;text-align:center;color:var(--branco);">
          <div style="font-size:18px;font-weight:800;">${totalPessoas}</div>
          <div style="font-size:9px;opacity:0.8;">Pessoas</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
        <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);">
          <h4 style="color:var(--azul-bandeira);margin-bottom:6px;font-size:13px;">
            <i class="fas fa-calendar"></i> Top 7 Dias com Mais Abordagens
          </h4>
          ${topDias
            .map(
              (d, i) => `
            <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--cinza-claro);font-size:12px;">
              <span>${i + 1}. ${d.dia}</span>
              <span style="font-weight:600;color:var(--azul-bandeira);">${d.total}</span>
            </div>
          `,
            )
            .join("")}
          ${topDias.length === 0 ? '<p style="font-size:12px;color:var(--cinza-medio);text-align:center;">Nenhuma abordagem</p>' : ""}
        </div>
        <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);">
          <h4 style="color:var(--azul-bandeira);margin-bottom:6px;font-size:13px;">
            <i class="fas fa-chart-pie"></i> Distribuição por Tipo
          </h4>
          <div style="height:120px;">
            <canvas id="chartAbordagensPizza"></canvas>
          </div>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;

  await renderizarGraficoPizza(
    "chartAbordagensPizza",
    [
      { tipo: "Veículos", total: totalVeiculos },
      { tipo: "Pessoas", total: totalPessoas },
    ],
    ["#003F87", "#00843D"],
  );
}

// ============================================
// RELATÓRIO DE EFICIÊNCIA OPERACIONAL (NOVO)
// ============================================

async function renderRelatorioEficiencia(
  container,
  ocorrencias,
  abordagens,
  dataInicio,
  dataFim,
  appInstance,
) {
  const totalOcorrencias = ocorrencias.length;
  const totalAbordagens =
    abordagens.veiculos.length + abordagens.pessoas.length;

  // Calcular taxa de conversão (abordagens que viraram BOs)
  // Buscar ocorrências que foram criadas a partir de abordagens (via campo de referência)
  const client =
    typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
  let conversoes = 0;
  if (client) {
    try {
      const { data, error } = await client
        .from("ocorrencias")
        .select("id")
        .not("observacoes", "is", null)
        .ilike("observacoes", "%abordagem%")
        .gte("criado_em", dataInicio)
        .lte("criado_em", dataFim + "T23:59:59");
      if (!error) {
        conversoes = data?.length || 0;
      }
    } catch (e) {
      console.warn("Erro ao buscar conversões:", e);
    }
  }

  const taxaConversao =
    totalAbordagens > 0 ? ((conversoes / totalAbordagens) * 100).toFixed(1) : 0;
  const mediaOcorrencias =
    totalAbordagens > 0 ? (totalOcorrencias / totalAbordagens).toFixed(2) : 0;

  let html = `
    <div class="container" style="padding-bottom:120px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
          <i class="fas fa-rocket" style="margin-right:8px;"></i>
          Eficiência Operacional
        </h2>
        <button onclick="window._relatoriosVoltar()" class="btn-secondary" style="padding:3px 10px;font-size:10px;min-height:auto;width:auto;border-radius:6px;">
          <i class="fas fa-arrow-left"></i>
        </button>
      </div>
      <p style="color:var(--cinza-medio);margin-bottom:12px;font-size:12px;">
        <i class="fas fa-calendar" style="margin-right:4px;"></i>
        ${formatarData(dataInicio)} até ${formatarData(dataFim)}
      </p>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">
        <div style="background:var(--azul-bandeira);border-radius:var(--border-radius);padding:10px;text-align:center;color:var(--branco);">
          <div style="font-size:20px;font-weight:800;">${totalAbordagens}</div>
          <div style="font-size:10px;opacity:0.8;">Total de Abordagens</div>
        </div>
        <div style="background:var(--verde-bandeira);border-radius:var(--border-radius);padding:10px;text-align:center;color:var(--branco);">
          <div style="font-size:20px;font-weight:800;">${totalOcorrencias}</div>
          <div style="font-size:10px;opacity:0.8;">Total de Ocorrências</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px;">
        <div style="background:var(--gradiente-principal);border-radius:var(--border-radius);padding:10px;text-align:center;color:var(--branco);">
          <div style="font-size:20px;font-weight:800;">${taxaConversao}%</div>
          <div style="font-size:10px;opacity:0.8;">Taxa de Conversão</div>
        </div>
        <div style="background:var(--aviso);border-radius:var(--border-radius);padding:10px;text-align:center;color:var(--branco);">
          <div style="font-size:20px;font-weight:800;">${conversoes}</div>
          <div style="font-size:10px;opacity:0.8;">Abordagens → BOs</div>
        </div>
        <div style="background:var(--roxo);border-radius:var(--border-radius);padding:10px;text-align:center;color:var(--branco);">
          <div style="font-size:20px;font-weight:800;">${mediaOcorrencias}</div>
          <div style="font-size:10px;opacity:0.8;">Média BOs/Abordagem</div>
        </div>
      </div>

      <div style="background:var(--branco);border-radius:var(--border-radius);padding:12px;box-shadow:var(--sombra-suave);">
        <h4 style="color:var(--azul-bandeira);margin:0 0 8px 0;font-size:14px;">
          <i class="fas fa-lightbulb" style="margin-right:6px;"></i>
          Análise de Eficiência
        </h4>
        <div style="font-size:13px;color:var(--cinza-escuro);">
          <p><strong>📊 Taxa de Conversão:</strong> ${taxaConversao}% das abordagens geraram Boletins de Ocorrência.</p>
          <p><strong>📈 Produtividade:</strong> Cada abordagem gerou em média ${mediaOcorrencias} ocorrências.</p>
          <p><strong>🎯 Eficiência:</strong> ${taxaConversao >= 30 ? "✅ Alta eficiência na conversão de abordagens em BOs." : taxaConversao >= 15 ? "⚠️ Eficiência moderada. Considere treinamento para conversão." : "❌ Baixa eficiência. Revisar processo de abordagem e registro."}</p>
          ${conversoes > 0 ? `<p><strong>📋 Total de conversões:</strong> ${conversoes} abordagens convertidas em BOs.</p>` : "<p><strong>📋 Nenhuma conversão identificada neste período.</strong></p>"}
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

// ============================================
// EXPORTAÇÕES PDF
// ============================================

async function exportarDesempenhoPDF(
  ranking,
  dataInicio,
  dataFim,
  appInstance,
) {
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFillColor(0, 63, 135);
    doc.rect(0, 0, 210, 35, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text("GUARDA MUNICIPAL DE PITANGUEIRAS - PR", 105, 15, {
      align: "center",
    });
    doc.setFontSize(11);
    doc.text("Relatório de Desempenho por Guarda (Unificado)", 105, 25, {
      align: "center",
    });
    doc.setFontSize(9);
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 105, 33, {
      align: "center",
    });

    doc.autoTable({
      startY: 45,
      head: [
        [
          "Pos",
          "Guarda",
          "Matrícula",
          "Ocorr.",
          "Final.",
          "Taxa",
          "Abord.",
          "Total",
        ],
      ],
      body: ranking.map((d, i) => [
        i + 1,
        d.nome,
        d.matricula,
        d.ocorrencias.total,
        d.ocorrencias.finalizadas,
        `${d.taxa_resolucao}%`,
        `${d.abordagens.veiculos}🚗/${d.abordagens.pessoas}👤`,
        d.total_atendimentos,
      ]),
      headStyles: { fillColor: [0, 63, 135], halign: "center" },
      columnStyles: {
        0: { cellWidth: 15, halign: "center" },
        1: { cellWidth: 55 },
        2: { cellWidth: 20, halign: "center" },
        3: { cellWidth: 15, halign: "center" },
        4: { cellWidth: 15, halign: "center" },
        5: { cellWidth: 15, halign: "center" },
        6: { cellWidth: 25, halign: "center" },
        7: { cellWidth: 15, halign: "center" },
      },
      styles: { fontSize: 9, cellPadding: 3 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
    });

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Período: ${dataInicio.split("-").reverse().join("/")} a ${dataFim.split("-").reverse().join("/")} - Sistema G.M. Pitangueiras`,
        105,
        285,
        { align: "center" },
      );
    }

    doc.save(`Desempenho_Guardas_${dataInicio}.pdf`);
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("PDF gerado com sucesso!", "success");
    }
  } catch (error) {
    console.error("Erro ao gerar PDF:", error);
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Erro ao gerar arquivo PDF", "error");
    }
  }
}

async function exportarPorGuardaPDF(ranking, dataInicio, dataFim, appInstance) {
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFillColor(0, 63, 135);
    doc.rect(0, 0, 210, 35, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text("GUARDA MUNICIPAL DE PITANGUEIRAS - PR", 105, 15, {
      align: "center",
    });
    doc.setFontSize(11);
    doc.text("Relatório por Guarda (com Abordagens)", 105, 25, {
      align: "center",
    });
    doc.setFontSize(9);
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 105, 33, {
      align: "center",
    });

    doc.autoTable({
      startY: 45,
      head: [["Pos", "Guarda", "Ocorrências", "Abordagens", "Total"]],
      body: ranking.map((d, i) => [
        i + 1,
        d.nome,
        d.total,
        d.abordagens,
        d.total + d.abordagens,
      ]),
      headStyles: { fillColor: [0, 63, 135], halign: "center" },
      columnStyles: {
        0: { cellWidth: 15, halign: "center" },
        1: { cellWidth: 80 },
        2: { cellWidth: 25, halign: "center" },
        3: { cellWidth: 25, halign: "center" },
        4: { cellWidth: 25, halign: "center" },
      },
      styles: { fontSize: 9, cellPadding: 3 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
    });

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Período: ${dataInicio.split("-").reverse().join("/")} a ${dataFim.split("-").reverse().join("/")} - Sistema G.M. Pitangueiras`,
        105,
        285,
        { align: "center" },
      );
    }

    doc.save(`Por_Guarda_${dataInicio}.pdf`);
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("PDF gerado com sucesso!", "success");
    }
  } catch (error) {
    console.error("Erro ao gerar PDF:", error);
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Erro ao gerar arquivo PDF", "error");
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
        <button onclick="window.app.navigateTo('dashboard')" class="btn-primary" style="margin-top:16px;max-width:200px;border-radius:12px;">
          Voltar
        </button>
      </div>
    </div>
  `;
}

function formatarData(date) {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR");
}

function getTipoLabel(value) {
  const encontrado = TIPOS_OCORRENCIA.find((t) => t.value === value);
  return encontrado ? encontrado.label : value || "Não informado";
}

function getStatusClass(status) {
  const map = {
    draft: "draft",
    pending_sync: "pending",
    synced: "synced",
    cancelled: "cancelled",
    rectified: "rectified",
    pending_rectification: "pending_rectification",
    rectification_rejected: "rectification_rejected",
  };
  return map[status] || "draft";
}

function getStatusLabel(status) {
  const map = {
    draft: "Rascunho",
    pending_sync: "Pendente",
    synced: "Finalizada",
    cancelled: "Cancelada",
    rectified: "Retificada",
    pending_rectification: "Retificação Pendente",
    rectification_rejected: "Retificação Rejeitada",
  };
  return map[status] || status;
}

function calcularEstatisticas(ocorrencias) {
  return {
    total: ocorrencias.length,
    finalizadas: ocorrencias.filter((o) => o.status === "synced").length,
    pendentes: ocorrencias.filter((o) => o.status === "pending_sync").length,
    canceladas: ocorrencias.filter((o) => o.status === "cancelled").length,
    retificadas: ocorrencias.filter((o) => o.status === "rectified").length,
  };
}

function agruparPorTipo(ocorrencias) {
  const tipos = {};
  const total = ocorrencias.length || 1;

  ocorrencias.forEach((o) => {
    const tipo = o.tipo_ocorrencia || "Não informado";
    if (!tipos[tipo]) {
      tipos[tipo] = { total: 0, finalizadas: 0, pendentes: 0 };
    }
    tipos[tipo].total++;
    if (o.status === "synced") tipos[tipo].finalizadas++;
    if (o.status === "pending_sync") tipos[tipo].pendentes++;
  });

  return Object.keys(tipos)
    .map((key) => ({
      tipo: getTipoLabel(key),
      total: tipos[key].total,
      finalizadas: tipos[key].finalizadas,
      pendentes: tipos[key].pendentes,
      percentual: ((tipos[key].total / total) * 100).toFixed(1),
    }))
    .sort((a, b) => b.total - a.total);
}

function agruparPorMes(ocorrencias) {
  const meses = {};
  ocorrencias.forEach((o) => {
    const data = new Date(o.criado_em);
    const mes = `${String(data.getMonth() + 1).padStart(2, "0")}/${data.getFullYear()}`;
    if (!meses[mes]) meses[mes] = 0;
    meses[mes]++;
  });

  return Object.keys(meses)
    .sort((a, b) => {
      const [mesA, anoA] = a.split("/");
      const [mesB, anoB] = b.split("/");
      return `${anoA}${mesA}`.localeCompare(`${anoB}${mesB}`);
    })
    .map((mes) => ({ label: mes, value: meses[mes] }));
}

function agruparPorBairro(ocorrencias) {
  const bairros = {};
  const total = ocorrencias.length || 1;

  ocorrencias.forEach((o) => {
    const bairro = o.bairro_ocorrencia || "Não informado";
    if (!bairros[bairro]) bairros[bairro] = 0;
    bairros[bairro]++;
  });

  return Object.keys(bairros)
    .map((key) => ({
      bairro: key,
      total: bairros[key],
      percentual: ((bairros[key] / total) * 100).toFixed(1),
    }))
    .sort((a, b) => b.total - a.total);
}

function calcularMediaDiaria(ocorrencias, dataInicio, dataFim) {
  const dias = calcularDiasPeriodo(dataInicio, dataFim);
  return dias > 0 ? (ocorrencias.length / dias).toFixed(1) : 0;
}

function calcularDiasPeriodo(dataInicio, dataFim) {
  const inicio = new Date(dataInicio);
  const fim = new Date(dataFim);
  return Math.ceil((fim - inicio) / (1000 * 60 * 60 * 24)) + 1;
}

function calcularDataAnterior(dataInicio, dataFim) {
  const inicio = new Date(dataInicio);
  const fim = new Date(dataFim);
  const diff = fim - inicio;
  const data = new Date(inicio);
  data.setTime(data.getTime() - diff);
  return data.toISOString().slice(0, 10);
}

function calcularCentroMapa(dados) {
  if (!dados || dados.length === 0) return [-23.456, -47.123];
  let lat = 0,
    lng = 0;
  let count = 0;
  dados.forEach((p) => {
    if (p.latitude && p.longitude) {
      lat += parseFloat(p.latitude);
      lng += parseFloat(p.longitude);
      count++;
    }
  });
  return count > 0 ? [lat / count, lng / count] : [-23.456, -47.123];
}

async function buscarDadosUsuariosEmLote(ids) {
  if (!ids || ids.length === 0) return {};
  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) return {};

    const { data, error } = await client
      .from("usuarios")
      .select("id, nome_completo")
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

async function obterPrimeiroDiaMes() {
  const data = new Date();
  data.setDate(1);
  return data.toISOString().slice(0, 10);
}

async function obterDataAtual() {
  return new Date().toISOString().slice(0, 10);
}

// ============================================
// GRÁFICOS (CHART.JS)
// ============================================

let chartJSCarregado = false;

async function carregarChartJS() {
  return new Promise((resolve) => {
    if (chartJSCarregado || typeof Chart !== "undefined") {
      chartJSCarregado = true;
      resolve();
      return;
    }

    if (document.querySelector('script[src*="chart.js"]')) {
      chartJSCarregado = true;
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/chart.js";
    script.onload = () => {
      chartJSCarregado = true;
      resolve();
    };
    script.onerror = () => {
      console.warn("⚠️ Erro ao carregar Chart.js");
      resolve();
    };
    document.head.appendChild(script);

    setTimeout(resolve, 5000);
  });
}

async function renderizarGraficoPizza(canvasId, dados, cores) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  await carregarChartJS();

  if (estado.chartInstances[canvasId]) {
    estado.chartInstances[canvasId].destroy();
  }

  const defaultCores = [
    "#003F87",
    "#00843D",
    "#DC2626",
    "#F59E0B",
    "#8B5CF6",
    "#EC4899",
    "#06B6D4",
    "#F97316",
    "#14B8A6",
    "#6366F1",
  ];

  estado.chartInstances[canvasId] = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: dados.map((d) => d.tipo),
      datasets: [
        {
          data: dados.map((d) => d.total),
          backgroundColor: (cores || defaultCores).slice(0, dados.length),
          borderWidth: 2,
          borderColor: "#fff",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            font: { size: 10 },
            boxWidth: 10,
            padding: 6,
          },
        },
      },
    },
  });
}

async function renderizarGraficoBarras(canvasId, dados) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  await carregarChartJS();

  if (estado.chartInstances[canvasId]) {
    estado.chartInstances[canvasId].destroy();
  }

  estado.chartInstances[canvasId] = new Chart(canvas, {
    type: "bar",
    data: {
      labels: dados.map((d) => d.label),
      datasets: [
        {
          label: "Ocorrências",
          data: dados.map((d) => d.value),
          backgroundColor: "rgba(0, 63, 135, 0.7)",
          borderColor: "#003F87",
          borderWidth: 1,
          borderRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, font: { size: 9 } },
        },
        x: {
          ticks: { font: { size: 9 } },
        },
      },
    },
  });
}

async function renderizarGraficoLinha(canvasId, dados, label) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  await carregarChartJS();

  if (estado.chartInstances[canvasId]) {
    estado.chartInstances[canvasId].destroy();
  }

  estado.chartInstances[canvasId] = new Chart(canvas, {
    type: "line",
    data: {
      labels: dados.map((d) => d.label),
      datasets: [
        {
          label: label || "Projeção",
          data: dados.map((d) => d.value),
          borderColor: "#003F87",
          backgroundColor: "rgba(0, 63, 135, 0.1)",
          fill: true,
          tension: 0.4,
          pointRadius: 2,
          pointBackgroundColor: "#003F87",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { font: { size: 9 } },
        },
        x: {
          ticks: { font: { size: 8 }, maxTicksLimit: 15 },
        },
      },
    },
  });
}

// ============================================
// EXPORTAÇÕES
// ============================================

export default {
  renderRelatorios,
  renderRelatorioDetalhado,
};
