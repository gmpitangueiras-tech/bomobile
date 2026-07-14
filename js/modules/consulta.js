/**
 * MÓDULO CONSULTA - Consulta Operacional
 * Guarda Municipal de Pitangueiras - PR
 *
 * Este módulo gerencia:
 * - Abordagens de veículos (histórico, busca, registro)
 * - Abordagens de pessoas (histórico, busca, registro)
 * - Timeline de abordagens
 * - Reincidência
 * - Conversão de abordagem para BO
 * - Anexos em abordagens (fotos com compressão)
 * - Reconhecimento de placa por foto (Tesseract.js)
 * - Histórico rápido (busca automática)
 * - Fases automáticas (Advertência → Multa)
 * - Câmera rápida (capture="environment")
 * - GPS contínuo
 * - Debounce em buscas
 * - Ranking de reincidentes
 *
 * Depende de: authManager (global), supabaseClient (global),
 *             ocorrenciaManager (global)
 */

// ============================================
// CONSTANTES
// ============================================

const MAX_ANEXOS = 5;
const MAX_IMAGE_SIZE = 1024 * 1024; // 1MB
const MAX_IMAGE_WIDTH = 800;
const IMAGE_QUALITY = 0.7;
const REINCIDENCIA_LIMITE_ADVERTENCIA = 2;
const REINCIDENCIA_LIMITE_MULTA = 4;

// ============================================
// FUNÇÕES INTERNAS (FALLBACK)
// ============================================

/**
 * Função interna para obter data/hora formatada sem timezone
 * @returns {string} Data no formato YYYY-MM-DD HH:MM:SS
 */
function obterDataHoraLocalFormatada() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  const horas = String(agora.getHours()).padStart(2, "0");
  const minutos = String(agora.getMinutes()).padStart(2, "0");
  const segundos = String(agora.getSeconds()).padStart(2, "0");
  return `${ano}-${mes}-${dia} ${horas}:${minutos}:${segundos}`;
}

/**
 * Função interna para comprimir imagem
 * @param {File} file - Arquivo de imagem
 * @param {number} maxWidth - Largura máxima
 * @param {number} quality - Qualidade da imagem
 * @returns {Promise<File>}
 */
function comprimirImagemInterna(
  file,
  maxWidth = MAX_IMAGE_WIDTH,
  quality = IMAGE_QUALITY,
) {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) {
      resolve(file);
      return;
    }

    // Se o arquivo já é pequeno, não comprime
    if (file.size < MAX_IMAGE_SIZE && file.type === "image/jpeg") {
      resolve(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name, {
                type: "image/jpeg",
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            } else {
              resolve(file);
            }
          },
          "image/jpeg",
          quality,
        );
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

/**
 * Função interna para gerar hash SHA-256 de um arquivo
 * @param {File|Blob} file - Arquivo para gerar hash
 * @returns {Promise<string|null>}
 */
async function gerarHashArquivoInterna(file) {
  try {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (error) {
    console.warn("Erro ao gerar hash do arquivo:", error);
    return null;
  }
}

/**
 * Função interna para obter localização via GPS
 * @returns {Promise<{latitude: number|null, longitude: number|null}>}
 */
function obterLocalizacaoInterna() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ latitude: null, longitude: null });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => {
        resolve({ latitude: null, longitude: null });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      },
    );
  });
}

/**
 * Função interna para aplicar máscara de CPF
 * @param {string} value - Valor atual do campo
 * @returns {string} Valor com máscara aplicada
 */
function aplicarMascaraCPFInterna(value) {
  const limpo = value.replace(/\D/g, "");
  if (limpo.length > 11) return value;
  if (limpo.length === 0) return "";
  if (limpo.length <= 3) return limpo;
  if (limpo.length <= 6) return limpo.replace(/(\d{3})(\d{1,3})/, "$1.$2");
  if (limpo.length <= 9)
    return limpo.replace(/(\d{3})(\d{3})(\d{1,3})/, "$1.$2.$3");
  return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, "$1.$2.$3-$4");
}

/**
 * Função interna para aplicar máscara de placa
 * @param {string} value - Valor atual do campo
 * @returns {string} Valor com máscara aplicada (uppercase)
 */
function aplicarMascaraPlacaInterna(value) {
  let upper = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (upper.length > 7) upper = upper.slice(0, 7);
  if (upper.length === 0) return "";
  if (upper.length <= 3) return upper;
  if (upper.length <= 4) return `${upper.slice(0, 3)}${upper.slice(3)}`;
  if (upper.length <= 6)
    return `${upper.slice(0, 3)}${upper.slice(3, 4)}${upper.slice(4)}`;
  return `${upper.slice(0, 3)}${upper.slice(3, 4)}${upper.slice(4, 5)}${upper.slice(5, 7)}`;
}

// ============================================
// ESTADO DO MÓDULO
// ============================================

let estado = {
  abaAtiva: "veiculos",
  filtros: {
    dataInicio: "",
    dataFim: "",
    guarda: "",
    tipo: "todos",
  },
  listaGuardas: [],
  arquivosTemp: [],
  timeoutBusca: null,
  ultimaBusca: "",
  rankingReincidentes: [],
  carregandoRanking: false,
};

// ============================================
// FUNÇÕES PRINCIPAIS
// ============================================

/**
 * Renderiza a página de consulta operacional
 * @param {HTMLElement} container - Elemento onde renderizar
 * @param {Object} appInstance - Instância do app
 */
export async function renderConsultaOperacional(container, appInstance) {
  // Carregar lista de guardas para o filtro
  await carregarListaGuardas();

  // Definir filtros do estado
  const dataInicio = estado.filtros.dataInicio || "";
  const dataFim = estado.filtros.dataFim || "";
  const guardaId = estado.filtros.guarda || "";

  let html = `
    <div class="container" style="padding-bottom:100px;">
      <h2 style="color:var(--azul-bandeira);margin-bottom:16px;">
        <i class="fas fa-search" style="margin-right:8px;"></i>
        Consulta Operacional
      </h2>

      <!-- Tabs -->
      <div class="tabs-container" style="display:flex;gap:4px;margin-bottom:16px;background:var(--cinza-claro);padding:4px;border-radius:var(--border-radius);">
        <button onclick="window._consultaMudarAba('veiculos')" id="tabVeiculos" class="tab-btn" style="flex:1;padding:8px;border:none;border-radius:var(--border-radius);font-weight:600;font-size:12px;cursor:pointer;background:${estado.abaAtiva === "veiculos" ? "var(--branco)" : "none"};">
          <i class="fas fa-motorcycle"></i> Veículos
        </button>
        <button onclick="window._consultaMudarAba('pessoas')" id="tabPessoas" class="tab-btn" style="flex:1;padding:8px;border:none;border-radius:var(--border-radius);font-weight:600;font-size:12px;cursor:pointer;background:${estado.abaAtiva === "pessoas" ? "var(--branco)" : "none"};">
          <i class="fas fa-user-friends"></i> Pessoas
        </button>
      </div>

      <!-- Ranking de Reincidentes -->
      <div id="rankingReincidentes" style="margin-bottom:12px;display:none;">
        <div style="background:var(--branco);border-radius:var(--border-radius);padding:10px;box-shadow:var(--sombra-suave);">
          <h4 style="font-size:12px;color:var(--cinza-medio);margin:0 0 8px 0;">
            <i class="fas fa-trophy" style="color:var(--aviso);"></i> 
            Ranking de Reincidentes
          </h4>
          <div id="rankingLista" style="max-height:150px;overflow-y:auto;">
            <div style="text-align:center;padding:10px;color:var(--cinza-medio);font-size:12px;">
              Carregando ranking...
            </div>
          </div>
        </div>
      </div>

      <!-- Filtros -->
      <div class="filtros-consulta">
        <div class="filtros-row">
          <div class="filtro-group" style="flex:1;min-width:60px;">
            <label style="font-size:10px;font-weight:600;color:var(--cinza-medio);display:block;margin-bottom:2px;">
              <i class="fas fa-calendar-alt"></i> Início
            </label>
            <input type="date" id="consultaDataInicio" value="${dataInicio}" style="width:100%;padding:4px 6px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:11px;background:var(--branco);color:var(--cinza-escuro);">
          </div>
          <div class="filtro-group" style="flex:1;min-width:60px;">
            <label style="font-size:10px;font-weight:600;color:var(--cinza-medio);display:block;margin-bottom:2px;">
              <i class="fas fa-calendar-alt"></i> Fim
            </label>
            <input type="date" id="consultaDataFim" value="${dataFim}" style="width:100%;padding:4px 6px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:11px;background:var(--branco);color:var(--cinza-escuro);">
          </div>
          <div class="filtro-group" style="flex:1.2;min-width:80px;">
            <label style="font-size:10px;font-weight:600;color:var(--cinza-medio);display:block;margin-bottom:2px;">
              <i class="fas fa-user-shield"></i> Guarda
            </label>
            <select id="consultaGuarda" style="width:100%;padding:4px 6px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:11px;background:var(--branco);color:var(--cinza-escuro);">
              <option value="">Todos</option>
              ${estado.listaGuardas
                .map(
                  (g) => `
                <option value="${g.id}" ${guardaId === g.id ? "selected" : ""}>${g.nome_completo}</option>
              `,
                )
                .join("")}
            </select>
          </div>
          <div class="filtros-actions" style="display:flex;gap:4px;align-self:flex-end;padding-bottom:2px;">
            <button onclick="window._consultaAplicarFiltros()" class="btn-primary" style="padding:4px 8px;font-size:12px;min-height:28px;width:auto;border-radius:8px;" title="Filtrar">
              <i class="fas fa-search"></i>
            </button>
            <button onclick="window._consulteLimparFiltros()" class="btn-secondary" style="padding:4px 8px;font-size:12px;min-height:28px;width:auto;border-radius:8px;" title="Limpar filtros">
              <i class="fas fa-undo"></i>
            </button>
          </div>
        </div>
        <div id="consultaFiltrosInfo" style="margin-top:4px;font-size:10px;color:var(--cinza-medio);display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px;">
          <span id="consultaTotalRegistros">Carregando...</span>
          <span id="consultaFiltrosAtivos" style="display:none;color:var(--azul-bandeira);">
            <i class="fas fa-filter"></i> Filtros ativos
          </span>
        </div>
      </div>

      <!-- Área de busca -->
      <div id="consultaBuscaArea"></div>

      <!-- Resultados -->
      <div id="consultaResultadosArea" style="margin-top:12px;"></div>
    </div>
  `;

  container.innerHTML = html;

  // Renderizar aba de busca
  renderAbaConsulta();

  // Carregar feed inicial
  await carregarFeedConsultas();

  // Carregar ranking de reincidentes
  await carregarRankingReincidentes();

  // Registrar funções no escopo global para os eventos onclick
  window._consultaMudarAba = mudarAbaConsulta;
  window._consultaAplicarFiltros = aplicarFiltrosConsulta;
  window._consulteLimparFiltros = limparFiltrosConsulta;
  window._consultaExecutarBusca = executarBuscaConsulta;
  window._consultaSalvarAbordagem = salvarAbordagemComAnexos;
  window._consultaPreviewImagens = previewMultiplasImagensAbordagem;
  window._consultaRemoverImagem = removerImagemAbordagemPreview;
  window._consultaConverterBO = converterEmBO;
  window._consultaAbrirFormulario = abrirFormularioAbordagem;
  window._consultaReconhecerPlaca = reconhecerPlacaPorFoto;

  // Salvar referência do app
  window._consultaApp = appInstance;
}

// ============================================
// LISTA DE GUARDAS
// ============================================

async function carregarListaGuardas() {
  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) return;

    const { data, error } = await client
      .from("usuarios")
      .select("id, nome_completo")
      .eq("status", "ativo")
      .order("nome_completo");

    if (error) throw error;
    estado.listaGuardas = data || [];
  } catch (error) {
    console.error("Erro ao carregar lista de guardas:", error);
    estado.listaGuardas = [];
  }
}

// ============================================
// RANKING DE REINCIDENTES
// ============================================

async function carregarRankingReincidentes() {
  try {
    estado.carregandoRanking = true;
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) return;

    // Buscar veículos
    const { data: veiculos, error: veicError } = await client
      .from("abordagens_veiculos")
      .select("placa")
      .order("criado_em", { ascending: false });

    if (veicError) throw veicError;

    // Buscar pessoas
    const { data: pessoas, error: pesError } = await client
      .from("abordagens_pessoas")
      .select("nome, cpf")
      .order("criado_em", { ascending: false });

    if (pesError) throw pesError;

    // Agrupar manualmente
    const veiculosCount = {};
    if (veiculos) {
      veiculos.forEach((v) => {
        const placa = v.placa || "Sem placa";
        if (!veiculosCount[placa]) veiculosCount[placa] = 0;
        veiculosCount[placa]++;
      });
    }

    const pessoasCount = {};
    if (pessoas) {
      pessoas.forEach((p) => {
        const nome = p.nome || "Sem nome";
        if (!pessoasCount[nome]) pessoasCount[nome] = 0;
        pessoasCount[nome]++;
        if (p.cpf) {
          if (!pessoasCount[p.cpf]) pessoasCount[p.cpf] = 0;
          pessoasCount[p.cpf]++;
        }
      });
    }

    // Montar ranking
    const ranking = [];

    Object.keys(veiculosCount).forEach((key) => {
      ranking.push({
        identificador: key,
        tipo: "veiculo",
        total: veiculosCount[key],
        label: "🚗 " + key,
      });
    });

    Object.keys(pessoasCount).forEach((key) => {
      const isCpf = /^\d{11}$/.test(key.replace(/\D/g, ""));
      ranking.push({
        identificador: key,
        tipo: "pessoa",
        total: pessoasCount[key],
        label: "👤 " + (isCpf ? `CPF: ${key}` : key),
      });
    });

    // Ordenar por total
    ranking.sort((a, b) => b.total - a.total);
    estado.rankingReincidentes = ranking.slice(0, 10);

    // Mostrar ranking se houver resultados
    const rankingEl = document.getElementById("rankingReincidentes");
    if (rankingEl && ranking.length > 0) {
      rankingEl.style.display = "block";
      renderizarRanking(ranking);
    } else if (rankingEl) {
      rankingEl.style.display = "none";
    }
  } catch (error) {
    console.error("Erro ao carregar ranking:", error);
  } finally {
    estado.carregandoRanking = false;
  }
}

function renderizarRanking(ranking) {
  const lista = document.getElementById("rankingLista");
  if (!lista) return;

  if (ranking.length === 0) {
    lista.innerHTML = `
      <div style="text-align:center;padding:10px;color:var(--cinza-medio);font-size:12px;">
        Nenhum reincidente encontrado
      </div>
    `;
    return;
  }

  lista.innerHTML = ranking
    .slice(0, 10)
    .map((item, index) => {
      const medalha =
        index === 0
          ? "🥇"
          : index === 1
            ? "🥈"
            : index === 2
              ? "🥉"
              : `${index + 1}º`;
      const emoji = item.tipo === "veiculo" ? "🚗" : "👤";
      return `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--cinza-claro);font-size:12px;">
        <span>
          <span style="font-weight:700;color:var(--cinza-medio);min-width:30px;display:inline-block;">${medalha}</span>
          ${emoji} ${item.identificador}
          ${item.total > 1 ? ` (${item.total}x)` : ""}
        </span>
        <span style="font-weight:700;color:var(--azul-bandeira);">
          ${item.total} ${item.total === 1 ? "abordagem" : "abordagens"}
        </span>
      </div>
    `;
    })
    .join("");
}

// ============================================
// ABAS
// ============================================

export function mudarAbaConsulta(aba) {
  estado.abaAtiva = aba;
  estado.filtros.tipo = aba;

  const tabVeiculos = document.getElementById("tabVeiculos");
  const tabPessoas = document.getElementById("tabPessoas");

  if (tabVeiculos && tabPessoas) {
    tabVeiculos.style.background =
      aba === "veiculos" ? "var(--branco)" : "none";
    tabPessoas.style.background = aba === "pessoas" ? "var(--branco)" : "none";
  }

  renderAbaConsulta();
}

function renderAbaConsulta() {
  const area = document.getElementById("consultaBuscaArea");
  if (!area) return;

  const isVeiculo = estado.abaAtiva === "veiculos";
  const placeholder = isVeiculo
    ? "Digite a Placa (ex: ABC1D23)"
    : "Nome, CPF, RG ou Apelido";
  const icone = isVeiculo ? "fa-motorcycle" : "fa-user";

  area.innerHTML = `
    <div class="search-card" style="background:var(--branco);padding:16px;border-radius:var(--border-radius);box-shadow:var(--sombra-suave);">
      <div style="display:flex;gap:8px;margin-bottom:8px;">
        <div style="position:relative;flex:1;">
          <i class="fas ${icone}" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--cinza-medio);"></i>
          <input type="text" id="inputBuscaConsulta" 
            placeholder="${placeholder}" 
            style="width:100%;padding:10px 10px 10px 35px;border:2px solid var(--cinza-claro);border-radius:var(--border-radius);text-transform:uppercase;font-size:14px;"
            oninput="window._consultaBuscaAutomatica(this.value)"
            onkeydown="if(event.key==='Enter') window._consultaExecutarBusca()">
        </div>
        <button onclick="window._consultaExecutarBusca()" class="btn-primary" style="width:auto;min-height:auto;padding:0 16px;border-radius:var(--border-radius);">
          <i class="fas fa-search"></i>
        </button>
      </div>
      ${
        isVeiculo
          ? `
        <div style="display:flex;gap:8px;margin-bottom:8px;">
          <button onclick="window._consultaReconhecerPlaca()" class="btn-secondary" style="flex:1;font-size:11px;padding:6px;border-radius:var(--border-radius);">
            <i class="fas fa-camera"></i> Reconhecer Placa por Foto
          </button>
        </div>
      `
          : ""
      }
      <button onclick="window._consultaAbrirFormulario()" class="btn-secondary" style="width:100%;font-size:12px;padding:8px;border-radius:var(--border-radius);">
        <i class="fas fa-plus-circle"></i> Registrar Nova Abordagem
      </button>
    </div>
  `;

  // Registrar função de busca automática
  window._consultaBuscaAutomatica = (termo) => {
    if (termo && termo.length >= 2) {
      if (estado.timeoutBusca) {
        clearTimeout(estado.timeoutBusca);
      }
      estado.timeoutBusca = setTimeout(() => {
        executarBuscaConsulta();
      }, 500);
    }
  };
}

// ============================================
// FILTROS
// ============================================

export function aplicarFiltrosConsulta() {
  const dataInicio = document.getElementById("consultaDataInicio")?.value || "";
  const dataFim = document.getElementById("consultaDataFim")?.value || "";
  const guarda = document.getElementById("consultaGuarda")?.value || "";

  if (dataInicio && dataFim && dataFim < dataInicio) {
    if (typeof window.app !== "undefined" && window.app.showToast) {
      window.app.showToast(
        "Data final deve ser maior ou igual à data inicial",
        "warning",
      );
    } else {
      showToast("Data final deve ser maior ou igual à data inicial", "warning");
    }
    return;
  }

  estado.filtros = {
    dataInicio,
    dataFim,
    guarda,
    tipo: estado.abaAtiva,
  };

  carregarFeedConsultas();
  carregarRankingReincidentes();

  if (typeof window.app !== "undefined" && window.app.showToast) {
    window.app.showToast("Filtros aplicados", "success");
  } else {
    showToast("Filtros aplicados", "success");
  }
}

export function limparFiltrosConsulta() {
  const dataInicioInput = document.getElementById("consultaDataInicio");
  const dataFimInput = document.getElementById("consultaDataFim");
  const guardaSelect = document.getElementById("consultaGuarda");

  if (dataInicioInput) dataInicioInput.value = "";
  if (dataFimInput) dataFimInput.value = "";
  if (guardaSelect) guardaSelect.value = "";

  estado.filtros = {
    dataInicio: "",
    dataFim: "",
    guarda: "",
    tipo: estado.abaAtiva,
  };

  carregarFeedConsultas();
  carregarRankingReincidentes();

  if (typeof window.app !== "undefined" && window.app.showToast) {
    window.app.showToast("Filtros removidos", "info");
  } else {
    showToast("Filtros removidos", "info");
  }
}

// ============================================
// FEED DE CONSULTAS
// ============================================

export async function carregarFeedConsultas() {
  const areaResultados = document.getElementById("consultaResultadosArea");
  if (!areaResultados) return;

  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) {
      areaResultados.innerHTML = `<p style="color:var(--erro);text-align:center;">Erro ao conectar ao servidor.</p>`;
      return;
    }

    const { dataInicio, dataFim, guarda, tipo } = estado.filtros;

    let queryVeiculos = client
      .from("abordagens_veiculos")
      .select("*, usuarios(nome_completo)");
    let queryPessoas = client
      .from("abordagens_pessoas")
      .select("*, usuarios(nome_completo)");

    if (dataInicio) {
      queryVeiculos = queryVeiculos.gte("criado_em", dataInicio);
      queryPessoas = queryPessoas.gte("criado_em", dataInicio);
    }
    if (dataFim) {
      queryVeiculos = queryVeiculos.lte("criado_em", dataFim + "T23:59:59");
      queryPessoas = queryPessoas.lte("criado_em", dataFim + "T23:59:59");
    }
    if (guarda) {
      queryVeiculos = queryVeiculos.eq("criado_por", guarda);
      queryPessoas = queryPessoas.eq("criado_por", guarda);
    }

    queryVeiculos = queryVeiculos
      .order("criado_em", { ascending: false })
      .limit(50);
    queryPessoas = queryPessoas
      .order("criado_em", { ascending: false })
      .limit(50);

    const [veiculosResult, pessoasResult] = await Promise.all([
      queryVeiculos,
      queryPessoas,
    ]);

    const veiculos = veiculosResult.data || [];
    const pessoas = pessoasResult.data || [];

    let todasAbordagens = [];

    if (tipo === "todos" || tipo === "veiculos") {
      todasAbordagens = [
        ...todasAbordagens,
        ...veiculos.map((v) => ({ ...v, tipo_abordagem: "veiculo" })),
      ];
    }
    if (tipo === "todos" || tipo === "pessoas") {
      todasAbordagens = [
        ...todasAbordagens,
        ...pessoas.map((p) => ({ ...p, tipo_abordagem: "pessoa" })),
      ];
    }

    todasAbordagens.sort(
      (a, b) => new Date(b.criado_em) - new Date(a.criado_em),
    );

    // Atualizar contador
    const totalSpan = document.getElementById("consultaTotalRegistros");
    if (totalSpan) {
      totalSpan.textContent = `${todasAbordagens.length} registro(s) encontrado(s)`;
    }

    // Mostrar indicador de filtros ativos
    const filtrosAtivos = document.getElementById("consultaFiltrosAtivos");
    if (filtrosAtivos) {
      const hasFilters = dataInicio || dataFim || guarda;
      filtrosAtivos.style.display = hasFilters ? "inline" : "none";
    }

    if (todasAbordagens.length === 0) {
      areaResultados.innerHTML = `
        <div style="text-align:center;padding:40px 20px;background:var(--branco);border-radius:var(--border-radius);box-shadow:var(--sombra-suave);">
          <i class="fas fa-info-circle" style="font-size:32px;color:var(--cinza-medio);margin-bottom:12px;opacity:0.3;"></i>
          <p>Nenhuma consulta/abordagem registrada com os filtros atuais.</p>
          <button onclick="window._consultaAbrirFormulario()" class="btn-primary" style="margin-top:16px;">
            <i class="fas fa-plus"></i> Registrar Abordagem
          </button>
        </div>
      `;
      return;
    }

    await renderTimeline(areaResultados, todasAbordagens.slice(0, 20));
  } catch (error) {
    console.error("Erro ao carregar feed:", error);
    areaResultados.innerHTML = `<p style="color:var(--erro);text-align:center;">Erro ao carregar histórico: ${error.message}</p>`;
  }
}

// ============================================
// TIMELINE
// ============================================

async function renderTimeline(container, abordagens) {
  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <h3 style="font-size:14px;color:var(--cinza-escuro);margin:0;">
        <i class="fas fa-clock" style="margin-right:8px;color:var(--azul-bandeira);"></i>
        Últimas Orientações
      </h3>
      <span class="badge" style="background:var(--azul-bandeira);color:white;padding:2px 8px;border-radius:10px;font-size:10px;">
        ${abordagens.length} registros
      </span>
    </div>
    <div class="timeline" style="position:relative;padding-left:20px;border-left:2px solid var(--cinza-claro);margin-left:10px;">
  `;

  for (const h of abordagens) {
    const isVeiculo = h.tipo_abordagem === "veiculo";
    const reincidencias = await contarReincidencias(h, isVeiculo);
    const data = new Date(h.criado_em).toLocaleString("pt-BR");
    const guardaNome = h.usuarios?.nome_completo || "Desconhecido";

    let icone, identificador, detalhes, badgeColor, badgeIcon;
    if (isVeiculo) {
      icone = "fa-motorcycle";
      identificador = h.placa || "Placa não informada";
      detalhes =
        `${h.marca_modelo || ""} (${h.cor || "cor não informada"})`.trim() ||
        "Detalhes não informados";
      badgeColor = "badge-veiculo";
      badgeIcon = "🚗";
    } else {
      icone = "fa-user";
      identificador = h.nome || "Nome não informado";
      detalhes = h.alcunha ? `(${h.alcunha})` : "";
      if (h.cpf) detalhes += ` - CPF: ${h.cpf}`;
      if (h.rg) detalhes += ` - RG: ${h.rg}`;
      badgeColor = "badge-pessoa";
      badgeIcon = "👤";
    }

    // Determinar fase automaticamente com base na reincidência
    let fase = h.fase || "advertencia";
    if (reincidencias >= REINCIDENCIA_LIMITE_MULTA) {
      fase = "multa";
    } else if (
      reincidencias >= REINCIDENCIA_LIMITE_ADVERTENCIA &&
      fase === "advertencia"
    ) {
      fase = "advertencia";
    }

    // Badge de reincidência
    let reincidenciaHTML = "";
    if (reincidencias > 0) {
      const classe =
        reincidencias >= REINCIDENCIA_LIMITE_MULTA
          ? "reincidencia-alta"
          : "reincidencia-media";
      const emoji = reincidencias >= REINCIDENCIA_LIMITE_MULTA ? "🔴" : "🟡";
      reincidenciaHTML = `
        <div style="margin-top:4px;">
          <span class="badge ${classe}" style="font-size:9px;padding:2px 10px;">
            ${emoji} Reincidente (${reincidencias + 1}x)
          </span>
        </div>
      `;
    } else {
      reincidenciaHTML = `
        <div style="margin-top:4px;">
          <span class="badge badge-primeira" style="font-size:9px;padding:2px 10px;background:var(--verde-muito-claro);color:var(--verde-escuro);">
            ✅ Primeira orientação
          </span>
        </div>
      `;
    }

    // Anexos
    let anexosHTML = "";
    if (h.anexos && h.anexos.length > 0) {
      anexosHTML = `
        <div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap;">
          ${h.anexos
            .slice(0, 3)
            .map(
              (a, i) => `
            <img src="${a.url}" alt="Anexo ${i + 1}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;cursor:pointer;" onclick="window.open('${a.url}', '_blank')">
          `,
            )
            .join("")}
          ${h.anexos.length > 3 ? `<span style="font-size:10px;color:var(--cinza-medio);align-self:center;">+${h.anexos.length - 3}</span>` : ""}
        </div>
      `;
    }

    // Fase
    let faseHTML = "";
    if (fase) {
      const faseLabels = { advertencia: "⚠️ Advertência", multa: "💰 Multa" };
      faseHTML = `
        <span class="badge ${fase === "multa" ? "badge-cancelled" : "badge-pending"}" style="font-size:9px;padding:2px 8px;">
          ${faseLabels[fase] || fase}
        </span>
      `;
    }

    // Prazo
    let prazoHTML = "";
    if (h.prazo) {
      const prazoDate = new Date(h.prazo);
      const hoje = new Date();
      const vencido = prazoDate < hoje;
      prazoHTML = `
        <span class="badge ${vencido ? "badge-cancelled" : "badge-pending"}" style="font-size:9px;padding:2px 8px;">
          ${vencido ? "🔴 Prazo vencido" : `📅 Prazo: ${prazoDate.toLocaleDateString("pt-BR")}`}
        </span>
      `;
    }

    html += `
      <div class="timeline-item" style="margin-bottom:20px;position:relative;">
        <div style="position:absolute;left:-26px;top:0;width:10px;height:10px;border-radius:50%;background:${isVeiculo ? "var(--azul-bandeira)" : "var(--verde-bandeira)"};border:2px solid var(--branco);"></div>
        <div style="background:var(--branco);padding:12px;border-radius:var(--border-radius);box-shadow:var(--sombra-suave);border-left:4px solid ${isVeiculo ? "var(--azul-bandeira)" : "var(--verde-bandeira)"};">
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--cinza-medio);margin-bottom:4px;">
            <span><i class="fas fa-calendar-alt"></i> ${data}</span>
            <span><i class="fas fa-map-marker-alt"></i> ${h.local_abordagem || "Local não informado"}</span>
          </div>
          <div style="font-weight:700;color:var(--azul-bandeira);font-size:13px;margin-bottom:4px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span class="badge ${badgeColor}" style="font-size:10px;padding:2px 10px;">
              ${badgeIcon} ${isVeiculo ? "Veículo" : "Pessoa"}
            </span>
            <i class="fas ${icone}"></i> ${identificador}
            <span style="font-size:10px;font-weight:400;color:var(--cinza-medio);">${detalhes}</span>
            ${faseHTML}
            ${prazoHTML}
          </div>
          ${reincidenciaHTML}
          ${anexosHTML}
          <div style="font-size:12px;color:var(--cinza-escuro);line-height:1.4;background:var(--cinza-muito-claro);padding:8px;border-radius:4px;margin-top:4px;">
            <strong>Motivo:</strong> ${h.motivo || "Não informado"}
          </div>
          ${
            h.observacoes
              ? `
            <div style="font-size:12px;color:var(--cinza-escuro);margin-top:4px;padding:4px 8px;background:var(--azul-muito-claro);border-radius:4px;">
              <strong>Obs:</strong> ${h.observacoes}
            </div>
          `
              : ""
          }
          <div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">
            <span style="font-size:10px;color:var(--cinza-medio);">
              <i class="fas fa-user-shield"></i> ${guardaNome}
            </span>
            <button onclick="window._consultaConverterBO('${isVeiculo ? "veiculo" : "pessoa"}', '${btoa(JSON.stringify(h))}')" class="btn-secondary" style="font-size:10px;min-height:auto;padding:4px 8px;width:auto;border-radius:8px;">
              <i class="fas fa-file-export"></i> Converter em BO
            </button>
          </div>
        </div>
      </div>
    `;
  }

  html += `</div>`;
  container.innerHTML = html;
}

// ============================================
// BUSCA
// ============================================

export async function executarBuscaConsulta() {
  const termo =
    document
      .getElementById("inputBuscaConsulta")
      ?.value?.trim()
      ?.toUpperCase() || "";
  const areaResultados = document.getElementById("consultaResultadosArea");

  if (!termo) {
    await carregarFeedConsultas();
    return;
  }

  estado.ultimaBusca = termo;

  areaResultados.innerHTML = `
    <div style="text-align:center;padding:20px;">
      <div class="spinner-azul" style="margin:0 auto;"></div>
      <p>Buscando histórico...</p>
    </div>
  `;

  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) {
      areaResultados.innerHTML = `<p style="color:var(--erro);text-align:center;">Erro ao conectar.</p>`;
      return;
    }

    const { dataInicio, dataFim, guarda } = estado.filtros;
    let data = [];

    if (estado.abaAtiva === "veiculos") {
      let query = client
        .from("abordagens_veiculos")
        .select("*, usuarios(nome_completo)")
        .eq("placa", termo);

      if (dataInicio) query = query.gte("criado_em", dataInicio);
      if (dataFim) query = query.lte("criado_em", dataFim + "T23:59:59");
      if (guarda) query = query.eq("criado_por", guarda);

      const res = await query.order("criado_em", { ascending: false });
      data = res.data || [];
    } else {
      let query = client
        .from("abordagens_pessoas")
        .select("*, usuarios(nome_completo)")
        .or(
          `nome.ilike.%${termo}%,cpf.ilike.%${termo}%,rg.ilike.%${termo}%,alcunha.ilike.%${termo}%`,
        );

      if (dataInicio) query = query.gte("criado_em", dataInicio);
      if (dataFim) query = query.lte("criado_em", dataFim + "T23:59:59");
      if (guarda) query = query.eq("criado_por", guarda);

      const res = await query.order("criado_em", { ascending: false });
      data = res.data || [];
    }

    if (data.length === 0) {
      areaResultados.innerHTML = `
        <div style="text-align:center;padding:40px 20px;background:var(--branco);border-radius:var(--border-radius);box-shadow:var(--sombra-suave);">
          <i class="fas fa-info-circle" style="font-size:32px;color:var(--cinza-medio);margin-bottom:12px;opacity:0.3;"></i>
          <p>Nenhum histórico encontrado para "<strong>${termo}</strong>".</p>
          <p style="font-size:13px;color:var(--cinza-medio);">Deseja registrar uma nova orientação para este item?</p>
          <button onclick="window._consultaAbrirFormulario('${termo}')" class="btn-primary" style="margin-top:16px;">
            <i class="fas fa-plus"></i> Registrar Nova Abordagem
          </button>
          <button onclick="window._consultaExecutarBusca()" class="btn-secondary" style="margin-top:8px;margin-left:8px;">
            <i class="fas fa-arrow-left"></i> Ver Todas
          </button>
        </div>
      `;
      return;
    }

    await renderTimeline(areaResultados, data);
  } catch (error) {
    console.error("Erro na busca:", error);
    areaResultados.innerHTML = `<p style="color:var(--erro);text-align:center;">Erro ao realizar busca: ${error.message}</p>`;
  }
}

// ============================================
// RECONHECIMENTO DE PLACA POR FOTO
// ============================================

export async function reconhecerPlacaPorFoto() {
  try {
    if (typeof Tesseract === "undefined") {
      if (typeof window.app !== "undefined" && window.app.showToast) {
        window.app.showToast(
          "Biblioteca de reconhecimento não carregada",
          "warning",
        );
      } else {
        showToast("Biblioteca de reconhecimento não carregada", "warning");
      }
      const script = document.createElement("script");
      script.src =
        "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
      document.head.appendChild(script);
      await new Promise((resolve) => {
        script.onload = resolve;
        script.onerror = resolve;
        setTimeout(resolve, 5000);
      });
      if (typeof Tesseract === "undefined") {
        if (typeof window.app !== "undefined" && window.app.showToast) {
          window.app.showToast(
            "Erro ao carregar biblioteca de reconhecimento",
            "error",
          );
        } else {
          showToast("Erro ao carregar biblioteca de reconhecimento", "error");
        }
        return;
      }
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment";
    input.style.display = "none";

    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (typeof window.app !== "undefined" && window.app.showToast) {
        window.app.showToast("Reconhecendo placa...", "info");
      } else {
        showToast("Reconhecendo placa...", "info");
      }

      try {
        const imageUrl = URL.createObjectURL(file);
        const result = await Tesseract.recognize(imageUrl, "por", {
          logger: (m) => {
            if (m.status === "recognizing text") {
              console.log("Reconhecendo:", m.progress);
            }
          },
        });

        const text = result.data.text || "";
        console.log("Texto reconhecido:", text);

        const placaRegex = /[A-Z]{3}[0-9][A-Z]{2}[0-9]/g;
        const matches = text.match(placaRegex);

        if (matches && matches.length > 0) {
          const placa = matches[0];
          const inputBusca = document.getElementById("inputBuscaConsulta");
          if (inputBusca) {
            inputBusca.value = placa;
            await executarBuscaConsulta();
          }
          if (typeof window.app !== "undefined" && window.app.showToast) {
            window.app.showToast(`Placa reconhecida: ${placa}`, "success");
          } else {
            showToast(`Placa reconhecida: ${placa}`, "success");
          }
        } else {
          if (typeof window.app !== "undefined" && window.app.showToast) {
            window.app.showToast(
              "Nenhuma placa reconhecida na imagem",
              "warning",
            );
          } else {
            showToast("Nenhuma placa reconhecida na imagem", "warning");
          }
        }

        URL.revokeObjectURL(imageUrl);
      } catch (error) {
        console.error("Erro no reconhecimento:", error);
        if (typeof window.app !== "undefined" && window.app.showToast) {
          window.app.showToast("Erro ao reconhecer placa", "error");
        } else {
          showToast("Erro ao reconhecer placa", "error");
        }
      }
    };

    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  } catch (error) {
    console.error("Erro ao abrir câmera:", error);
    if (typeof window.app !== "undefined" && window.app.showToast) {
      window.app.showToast("Erro ao abrir câmera", "error");
    } else {
      showToast("Erro ao abrir câmera", "error");
    }
  }
}

// ============================================
// REINCIDÊNCIA
// ============================================

export async function contarReincidencias(registro, isVeiculo) {
  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) return 0;

    const tabela = isVeiculo ? "abordagens_veiculos" : "abordagens_pessoas";
    let campo, valor;

    if (isVeiculo) {
      campo = "placa";
      valor = registro.placa;
    } else {
      if (registro.cpf && registro.cpf.trim() !== "") {
        campo = "cpf";
        valor = registro.cpf.replace(/\D/g, "");
      } else if (registro.nome) {
        campo = "nome";
        valor = registro.nome;
      } else {
        return 0;
      }
    }

    if (!valor || valor.trim() === "") return 0;

    let query = client
      .from(tabela)
      .select("*", { count: "exact", head: true })
      .eq(campo, valor);

    if (registro.id) {
      query = query.neq("id", registro.id);
    }

    const { count, error } = await query;
    if (error) {
      console.error("Erro ao contar reincidências:", error);
      return 0;
    }

    return count || 0;
  } catch (error) {
    console.error("Erro ao contar reincidências:", error);
    return 0;
  }
}

// ============================================
// FORMULÁRIO DE ABORDAGEM
// ============================================

export function abrirFormularioAbordagem(termoPreenchido = "") {
  const area = document.getElementById("consultaResultadosArea");
  if (!area) return;

  const isVeiculo = estado.abaAtiva === "veiculos";
  estado.arquivosTemp = [];

  const localizacaoAtual =
    typeof window.app !== "undefined"
      ? window.app.obterLocalizacaoAtual()
      : null;

  let html = `
    <div style="background:var(--branco);padding:16px;border-radius:var(--border-radius);box-shadow:var(--sombra-media);">
      <h3 style="font-size:14px;color:var(--azul-bandeira);margin-bottom:16px;">
        <i class="fas fa-plus-circle"></i> Nova Abordagem/Orientação
        ${
          localizacaoAtual
            ? `
          <span style="font-size:10px;color:var(--cinza-medio);font-weight:400;display:block;margin-top:2px;">
            📍 GPS: ${localizacaoAtual.latitude.toFixed(6)}, ${localizacaoAtual.longitude.toFixed(6)}
          </span>
        `
            : ""
        }
      </h3>
      <form id="formAbordagem" onsubmit="event.preventDefault();">
  `;

  if (isVeiculo) {
    html += `
      <div class="form-group" style="margin-bottom:12px;">
        <label style="display:block;font-size:12px;margin-bottom:4px;font-weight:600;">Placa *</label>
        <input type="text" id="formPlaca" value="${termoPreenchido}" style="width:100%;padding:8px;border:2px solid var(--cinza-claro);border-radius:8px;text-transform:uppercase;font-size:14px;" required>
      </div>
      <div class="form-group" style="margin-bottom:12px;">
        <label style="display:block;font-size:12px;margin-bottom:4px;font-weight:600;">Marca/Modelo</label>
        <input type="text" id="formMarcaModelo" placeholder="Ex: Honda Civic" style="width:100%;padding:8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:14px;">
      </div>
      <div class="form-group" style="margin-bottom:12px;">
        <label style="display:block;font-size:12px;margin-bottom:4px;font-weight:600;">Cor</label>
        <input type="text" id="formCor" placeholder="Ex: Prata" style="width:100%;padding:8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:14px;">
      </div>
      <div class="form-group" style="margin-bottom:12px;">
        <label style="display:block;font-size:12px;margin-bottom:4px;font-weight:600;">Condutor (Nome)</label>
        <input type="text" id="formCondutor" placeholder="Nome completo" style="width:100%;padding:8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:14px;">
      </div>
      <div class="form-group" style="margin-bottom:12px;">
        <label style="display:block;font-size:12px;margin-bottom:4px;font-weight:600;">CPF do Condutor</label>
        <input type="text" id="formCondutorCpf" placeholder="000.000.000-00" style="width:100%;padding:8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:14px;">
      </div>
    `;
  } else {
    html += `
      <div class="form-group" style="margin-bottom:12px;">
        <label style="display:block;font-size:12px;margin-bottom:4px;font-weight:600;">Nome Completo *</label>
        <input type="text" id="formNome" value="${termoPreenchido}" style="width:100%;padding:8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:14px;" required>
      </div>
      <div class="form-group" style="margin-bottom:12px;">
        <label style="display:block;font-size:12px;margin-bottom:4px;font-weight:600;">Alcunha (Apelido)</label>
        <input type="text" id="formAlcunha" placeholder="Ex: 'Neguinho', 'Magrão'" style="width:100%;padding:8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:14px;">
      </div>
      <div class="form-group" style="display:flex;gap:8px;margin-bottom:12px;">
        <div style="flex:1;">
          <label style="display:block;font-size:12px;margin-bottom:4px;font-weight:600;">CPF</label>
          <input type="text" id="formCpf" placeholder="000.000.000-00" style="width:100%;padding:8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:14px;">
        </div>
        <div style="flex:1;">
          <label style="display:block;font-size:12px;margin-bottom:4px;font-weight:600;">RG</label>
          <input type="text" id="formRg" placeholder="00.000.000-0" style="width:100%;padding:8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:14px;">
        </div>
      </div>
      <div class="form-group" style="margin-bottom:12px;">
        <label style="display:block;font-size:12px;margin-bottom:4px;font-weight:600;">Características Físicas</label>
        <textarea id="formCaracteristicas" rows="2" placeholder="Altura, peso, tatuagens, cicatrizes..." style="width:100%;padding:8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:14px;"></textarea>
      </div>
      <div class="form-group" style="margin-bottom:12px;">
        <label style="display:block;font-size:12px;margin-bottom:4px;font-weight:600;">Vestimentas</label>
        <textarea id="formVestimentas" rows="2" placeholder="Roupas, calçados, acessórios..." style="width:100%;padding:8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:14px;"></textarea>
      </div>
    `;
  }

  html += `
    <div class="form-group" style="margin-bottom:12px;">
      <label style="display:block;font-size:12px;margin-bottom:4px;font-weight:600;">Local da Abordagem</label>
      <input type="text" id="formLocal" placeholder="Endereço ou Ponto de Referência" style="width:100%;padding:8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:14px;" 
        value="${localizacaoAtual ? "Coordenadas GPS disponíveis" : ""}">
    </div>
    <div class="form-group" style="margin-bottom:12px;">
      <label style="display:block;font-size:12px;margin-bottom:4px;font-weight:600;">Motivo da Abordagem</label>
      <textarea id="formMotivo" rows="3" placeholder="Descreva o que motivou a orientação..." style="width:100%;padding:8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:14px;"></textarea>
    </div>
    <div class="form-group" style="margin-bottom:12px;">
      <label style="display:block;font-size:12px;margin-bottom:4px;font-weight:600;">Observações Adicionais</label>
      <textarea id="formObservacoesAbordagem" rows="2" placeholder="Informações complementares..." style="width:100%;padding:8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:14px;"></textarea>
    </div>

    <div class="form-group" style="margin-bottom:12px;">
      <label style="display:block;font-size:12px;margin-bottom:4px;font-weight:600;">Fase da Abordagem</label>
      <select id="formFase" style="width:100%;padding:8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:14px;">
        <option value="advertencia">⚠️ Advertência</option>
        <option value="multa">💰 Multa</option>
      </select>
    </div>

    <div class="form-group" style="margin-bottom:12px;display:flex;align-items:center;gap:8px;">
      <input type="checkbox" id="formTemPrazo" style="width:18px;height:18px;accent-color:var(--azul-bandeira);" onchange="document.getElementById('formPrazo').disabled = !this.checked">
      <label style="font-size:12px;font-weight:600;">📅 Definir prazo para regularização</label>
    </div>
    <div class="form-group" style="margin-bottom:12px;">
      <input type="date" id="formPrazo" style="width:100%;padding:8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:14px;" disabled>
    </div>

    <div class="form-group" style="margin-bottom:12px;">
      <label style="display:block;font-size:12px;margin-bottom:4px;font-weight:600;">
        <i class="fas fa-camera"></i> Fotos (máx 5)
      </label>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <input type="file" id="abordagemFileInput" accept="image/*" multiple style="display:none;" onchange="window._consultaPreviewImagens(this)">
        <button type="button" onclick="document.getElementById('abordagemFileInput').click()" class="btn-secondary" style="width:100%;font-size:12px;padding:8px;border-radius:8px;">
          <i class="fas fa-camera"></i> Selecionar Fotos (máx 5)
        </button>
        <button type="button" onclick="window._consultaAbrirCameraRapida()" class="btn-secondary" style="width:100%;font-size:12px;padding:8px;border-radius:8px;background:var(--azul-muito-claro);color:var(--azul-bandeira);">
          <i class="fas fa-camera-retro"></i> Tirar Foto Agora
        </button>
        <div id="abordagemPreviewArea" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;"></div>
        <div class="input-hint">
          <i class="fas fa-info-circle" style="font-size:12px;color:var(--cinza-medio);"></i>
          Máximo 5 imagens. Cada imagem será comprimida para até 1MB.
        </div>
      </div>
    </div>

    <div style="display:flex;gap:8px;margin-top:20px;">
      <button type="button" onclick="window._consultaSalvarAbordagem()" class="btn-primary" style="flex:2;border-radius:8px;">
        <i class="fas fa-save"></i> Salvar Orientação
      </button>
      <button type="button" onclick="window._consultaAbrirFormulario()" class="btn-secondary" style="flex:1;border-radius:8px;">
        Cancelar
      </button>
    </div>
  `;

  html += `</form></div>`;
  area.innerHTML = html;

  const cpfInput =
    document.getElementById("formCpf") ||
    document.getElementById("formCondutorCpf");
  if (cpfInput) {
    cpfInput.addEventListener("input", function (e) {
      this.value = aplicarMascaraCPFInterna(this.value);
    });
  }

  const placaInput = document.getElementById("formPlaca");
  if (placaInput) {
    placaInput.addEventListener("input", function (e) {
      this.value = aplicarMascaraPlacaInterna(this.value);
    });
  }

  window._consultaAbrirCameraRapida = () => {
    const fileInput = document.getElementById("abordagemFileInput");
    if (fileInput) {
      fileInput.setAttribute("capture", "environment");
      fileInput.click();
    }
  };
}

// ============================================
// PREVIEW DE IMAGENS
// ============================================

export function previewMultiplasImagensAbordagem(input) {
  const area = document.getElementById("abordagemPreviewArea");
  if (!area) return;

  const files = input.files;
  if (files.length > MAX_ANEXOS) {
    if (typeof window.app !== "undefined" && window.app.showToast) {
      window.app.showToast(
        `Máximo ${MAX_ANEXOS} imagens permitidas`,
        "warning",
      );
    } else {
      showToast(`Máximo ${MAX_ANEXOS} imagens permitidas`, "warning");
    }
    input.value = "";
    return;
  }

  area.innerHTML = "";
  const imagensData = [];

  for (const file of files) {
    if (file.size > 10 * 1024 * 1024) {
      if (typeof window.app !== "undefined" && window.app.showToast) {
        window.app.showToast(`Arquivo ${file.name} excede 10MB`, "warning");
      } else {
        showToast(`Arquivo ${file.name} excede 10MB`, "warning");
      }
      continue;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const div = document.createElement("div");
      div.style.cssText =
        "position:relative;width:80px;height:80px;border-radius:8px;overflow:hidden;border:2px solid var(--cinza-claro);";
      div.innerHTML = `
        <img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;">
        <button type="button" onclick="window._consultaRemoverImagem(this)" style="position:absolute;top:2px;right:2px;background:rgba(220,38,38,0.8);color:white;border:none;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:12px;">
          <i class="fas fa-times"></i>
        </button>
      `;
      area.appendChild(div);
      imagensData.push(file);
    };
    reader.readAsDataURL(file);
  }

  estado.arquivosTemp = imagensData;
}

export function removerImagemAbordagemPreview(btn) {
  const div = btn.closest("div");
  div.remove();

  const files = estado.arquivosTemp || [];
  const img = div.querySelector("img");
  if (img) {
    const index = files.findIndex(
      (f) => f.name === img.alt || f.name === img.src.split("/").pop(),
    );
    if (index > -1) {
      files.splice(index, 1);
      estado.arquivosTemp = files;
    }
  }
}

// ============================================
// SALVAR ABORDAGEM COM ANEXOS - CORRIGIDO
// ============================================

export async function salvarAbordagemComAnexos() {
  const isVeiculo = estado.abaAtiva === "veiculos";
  const user =
    typeof authManager !== "undefined" ? authManager.getUser() : null;

  if (!user) {
    if (typeof window.app !== "undefined" && window.app.showToast) {
      window.app.showToast("Usuário não autenticado", "error");
    } else {
      showToast("Usuário não autenticado", "error");
    }
    return;
  }

  // Validar campos obrigatórios
  const identificador = isVeiculo
    ? document.getElementById("formPlaca")?.value?.toUpperCase()?.trim()
    : document.getElementById("formNome")?.value?.trim();

  if (!identificador) {
    if (typeof window.app !== "undefined" && window.app.showToast) {
      window.app.showToast(
        isVeiculo ? "Placa é obrigatória" : "Nome é obrigatório",
        "warning",
      );
    } else {
      showToast(
        isVeiculo ? "Placa é obrigatória" : "Nome é obrigatório",
        "warning",
      );
    }
    return;
  }

  // Verificar reincidência para sugerir fase
  let reincidencia = 0;
  try {
    const registro = {
      placa: isVeiculo ? identificador : null,
      nome: !isVeiculo ? identificador : null,
      cpf: document.getElementById("formCpf")?.value || null,
    };
    reincidencia = await contarReincidencias(registro, isVeiculo);

    if (reincidencia >= REINCIDENCIA_LIMITE_MULTA) {
      const faseSelect = document.getElementById("formFase");
      if (faseSelect) {
        faseSelect.value = "multa";
        if (typeof window.app !== "undefined" && window.app.showToast) {
          window.app.showToast(
            `⚠️ ${reincidencia + 1}ª abordagem - Fase alterada para Multa automaticamente`,
            "warning",
          );
        } else {
          showToast(
            `⚠️ ${reincidencia + 1}ª abordagem - Fase alterada para Multa automaticamente`,
            "warning",
          );
        }
      }
    } else if (reincidencia >= REINCIDENCIA_LIMITE_ADVERTENCIA) {
      if (typeof window.app !== "undefined" && window.app.showToast) {
        window.app.showToast(
          `⚠️ ${reincidencia + 1}ª abordagem - Considere aplicar Multa`,
          "warning",
        );
      } else {
        showToast(
          `⚠️ ${reincidencia + 1}ª abordagem - Considere aplicar Multa`,
          "warning",
        );
      }
    }
  } catch (e) {
    console.warn("Erro ao verificar reincidência:", e);
  }

  if (typeof window.app !== "undefined" && window.app.showToast) {
    window.app.showToast("Processando...", "info");
  } else {
    showToast("Processando...", "info");
  }

  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) throw new Error("Erro ao conectar ao servidor");

    // Processar anexos
    const files = estado.arquivosTemp || [];
    let anexosUrls = [];

    if (files.length > 0) {
      const anexosProcessados = await processarAnexosAbordagem(files);
      anexosUrls = await uploadAnexosAbordagem(anexosProcessados, isVeiculo);
    }

    // Obter localização (GPS contínuo ou fallback)
    let localizacao =
      typeof window.app !== "undefined"
        ? window.app.obterLocalizacaoAtual()
        : null;
    if (!localizacao) {
      localizacao = await obterLocalizacaoInterna();
    }

    // CORREÇÃO: Formatar data sem timezone para o PostgreSQL
    const dataHoraFormatada = obterDataHoraLocalFormatada();

    const dados = {
      criado_por: user.id,
      local_abordagem: document.getElementById("formLocal")?.value || "",
      motivo: document.getElementById("formMotivo")?.value || "",
      observacoes:
        document.getElementById("formObservacoesAbordagem")?.value || "",
      fase: document.getElementById("formFase")?.value || "advertencia",
      anexos: anexosUrls,
      criado_em: dataHoraFormatada,
      atualizado_em: dataHoraFormatada,
      latitude: localizacao?.latitude || null,
      longitude: localizacao?.longitude || null,
    };

    // Prazo
    const temPrazo = document.getElementById("formTemPrazo")?.checked || false;
    if (temPrazo) {
      dados.prazo = document.getElementById("formPrazo")?.value || null;
      dados.tem_prazo = true;
      dados.status_regularizacao = "pendente";
    }

    // Campos específicos
    if (isVeiculo) {
      dados.placa = identificador;
      dados.marca_modelo =
        document.getElementById("formMarcaModelo")?.value || "";
      dados.cor = document.getElementById("formCor")?.value || "";
      dados.condutor_nome =
        document.getElementById("formCondutor")?.value || "";
      dados.condutor_cpf =
        document.getElementById("formCondutorCpf")?.value || "";
    } else {
      dados.nome = identificador;
      dados.alcunha = document.getElementById("formAlcunha")?.value || "";
      dados.cpf = document.getElementById("formCpf")?.value || "";
      dados.rg = document.getElementById("formRg")?.value || "";
      dados.caracteristicas_fisicas =
        document.getElementById("formCaracteristicas")?.value || "";
      dados.vestimentas =
        document.getElementById("formVestimentas")?.value || "";
    }

    const tabela = isVeiculo ? "abordagens_veiculos" : "abordagens_pessoas";
    const { data, error } = await client.from(tabela).insert([dados]).select();

    if (error) throw error;

    // Limpar arquivos temporários
    estado.arquivosTemp = [];
    const previewArea = document.getElementById("abordagemPreviewArea");
    if (previewArea) previewArea.innerHTML = "";
    const fileInput = document.getElementById("abordagemFileInput");
    if (fileInput) fileInput.value = "";

    if (typeof window.app !== "undefined" && window.app.showToast) {
      window.app.showToast("Abordagem registrada com sucesso!", "success");
    } else {
      showToast("Abordagem registrada com sucesso!", "success");
    }

    // Recarregar feed e ranking
    await carregarFeedConsultas();
    await carregarRankingReincidentes();

    // Limpar campo de busca
    const buscaInput = document.getElementById("inputBuscaConsulta");
    if (buscaInput) buscaInput.value = "";
  } catch (error) {
    console.error("Erro ao salvar abordagem:", error);
    if (typeof window.app !== "undefined" && window.app.showToast) {
      window.app.showToast("Erro ao salvar: " + error.message, "error");
    } else {
      showToast("Erro ao salvar: " + error.message, "error");
    }
  }
}

// ============================================
// ANEXOS - PROCESSAMENTO E UPLOAD
// ============================================

async function processarAnexosAbordagem(files) {
  const anexos = [];
  const filesToProcess = Array.from(files).slice(0, MAX_ANEXOS);

  for (const file of filesToProcess) {
    try {
      let fileProcessado = await comprimirImagemInterna(
        file,
        MAX_IMAGE_WIDTH,
        IMAGE_QUALITY,
      );

      if (fileProcessado.size > MAX_IMAGE_SIZE) {
        fileProcessado = await comprimirImagemInterna(file, 600, 0.6);
        if (fileProcessado.size > MAX_IMAGE_SIZE) {
          if (typeof window.app !== "undefined" && window.app.showToast) {
            window.app.showToast(
              `Arquivo ${file.name} excede 1MB após compressão`,
              "warning",
            );
          } else {
            showToast(
              `Arquivo ${file.name} excede 1MB após compressão`,
              "warning",
            );
          }
          continue;
        }
      }

      // Gerar hash da imagem
      let hash = null;
      try {
        hash = await gerarHashArquivoInterna(fileProcessado);
      } catch (e) {}

      anexos.push({
        nome: file.name,
        tipo: "image",
        tamanho: fileProcessado.size,
        arquivo: fileProcessado,
        hash: hash,
        url: null,
      });
    } catch (error) {
      console.error("Erro ao processar anexo:", error);
    }
  }

  return anexos;
}

async function uploadAnexosAbordagem(anexos, isVeiculo) {
  if (!anexos || anexos.length === 0) return [];

  const client =
    typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
  if (!client) return [];

  const prefix = isVeiculo ? "abordagens_veiculos" : "abordagens_pessoas";
  const timestamp = Date.now();
  const resultados = [];

  for (const anexo of anexos) {
    try {
      const fileExt = anexo.arquivo.name.split(".").pop();
      const fileName = `${prefix}/${timestamp}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;

      const { error: uploadError } = await client.storage
        .from("anexos")
        .upload(fileName, anexo.arquivo);

      if (uploadError) throw uploadError;

      const { data: urlData } = client.storage
        .from("anexos")
        .getPublicUrl(fileName);

      resultados.push({
        url: urlData.publicUrl,
        nome: anexo.nome,
        tipo: anexo.tipo,
        tamanho: anexo.tamanho,
        hash: anexo.hash,
      });
    } catch (error) {
      console.error("Erro no upload do anexo:", error);
    }
  }

  return resultados;
}

// ============================================
// CONVERTER ABORDAGEM EM BO
// ============================================

export function converterEmBO(tipo, dadosBase64) {
  try {
    const dados = JSON.parse(atob(dadosBase64));

    const dadosBO = {
      tipo_abordagem: tipo,
      dados: dados,
    };

    window._dadosPreenchimentoBO = dadosBO;

    if (typeof window.app !== "undefined" && window.app.navigateTo) {
      window.app.navigateTo("nova-ocorrencia");
      if (typeof window.app.showToast === "function") {
        window.app.showToast("Iniciando BO com dados da abordagem", "info");
      }
    } else {
      console.warn("⚠️ app.navigateTo não disponível");
      alert("Dados da abordagem prontos para converter em BO.");
    }
  } catch (error) {
    console.error("Erro ao converter em BO:", error);
    if (typeof window.app !== "undefined" && window.app.showToast) {
      window.app.showToast("Erro ao converter: " + error.message, "error");
    } else {
      showToast("Erro ao converter: " + error.message, "error");
    }
  }
}

// ============================================
// FUNÇÃO AUXILIAR: SHOW TOAST (fallback local)
// ============================================

function showToast(message, type = "info") {
  if (typeof window.app !== "undefined" && window.app.showToast) {
    window.app.showToast(message, type);
    return;
  }

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
  renderConsultaOperacional,
  mudarAbaConsulta,
  aplicarFiltrosConsulta,
  limparFiltrosConsulta,
  executarBuscaConsulta,
  carregarFeedConsultas,
  contarReincidencias,
  abrirFormularioAbordagem,
  salvarAbordagemComAnexos,
  previewMultiplasImagensAbordagem,
  removerImagemAbordagemPreview,
  converterEmBO,
  reconhecerPlacaPorFoto,
  carregarRankingReincidentes,
};
