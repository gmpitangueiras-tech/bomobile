/**
 * MÓDULO MURAL - Mural de Avisos com layout moderno
 * Guarda Municipal de Pitangueiras - PR
 *
 * Layout com:
 * - Cards com imagem de capa (destaque)
 * - Badges coloridos por tipo
 * - Título em destaque
 * - Prévia do conteúdo com "Ver mais"
 * - Autor com avatar e perfil
 * - Data de publicação
 * - Reações (like, olhos, alerta, ok, duvida)
 * - Comentários (últimos 2 com "Ver todos")
 * - Filtros compactos e colapsáveis
 * - Suporte a múltiplas imagens com carrossel
 * - Avisos urgentes com destaque
 *
 * Depende de: authManager (global), supabaseClient (global),
 *             utils, ui
 */

// ============================================
// CONSTANTES
// ============================================

const REACOES_EMOJIS = {
  like: "👍",
  olhos: "👀",
  alerta: "🚨",
  ok: "✅",
  duvida: "❓",
};

const REACOES_LABELS = {
  like: "Curtir",
  olhos: "Visualizar",
  alerta: "Alerta",
  ok: "Confirmar",
  duvida: "Dúvida",
};

const TIPOS_AVISO = {
  noticia: {
    label: "NOTÍCIA",
    icon: "📢",
    badge: "badge-noticia",
    cor: "#003f87",
    corBg: "var(--azul-bandeira)",
  },
  alerta: {
    label: "ALERTA",
    icon: "🔴",
    badge: "badge-alerta",
    cor: "#dc2626",
    corBg: "var(--erro)",
  },
  ordem_servico: {
    label: "ORDEM DE SERVIÇO",
    icon: "📋",
    badge: "badge-ordem-servico",
    cor: "#8b5cf6",
    corBg: "var(--roxo)",
  },
  informativo: {
    label: "INFORMATIVO",
    icon: "ℹ️",
    badge: "badge-informativo",
    cor: "#00843d",
    corBg: "var(--verde-bandeira)",
  },
};

const TIPOS_AVISO_LISTA = [
  { value: "todos", label: "Todos" },
  { value: "noticia", label: "Notícia" },
  { value: "alerta", label: "Alerta" },
  { value: "ordem_servico", label: "Ordem de Serviço" },
  { value: "informativo", label: "Informativo" },
];

const CACHE_KEY_MURAL = "mural_avisos_cache";
const CACHE_EXPIRY = 60000; // 1 minuto
const ITENS_POR_PAGINA = 5;

// ============================================
// ESTADO DO MÓDULO
// ============================================

let estado = {
  filtros: {
    busca: "",
    tipo: "todos",
    dataInicio: "",
    dataFim: "",
  },
  avisos: [],
  totalRegistros: 0,
  totalPaginas: 0,
  paginaAtual: 1,
  carregando: false,
  filtrosVisiveis: false,
  isRefreshing: false,
};

// ============================================
// FUNÇÃO PRINCIPAL
// ============================================

/**
 * Renderiza a página do mural de avisos
 * @param {HTMLElement} container - Elemento onde renderizar
 * @param {Object} appInstance - Instância do app
 */
export async function renderMural(container, appInstance) {
  const user =
    typeof authManager !== "undefined" ? authManager.getUser() : null;
  const isSupervisor =
    typeof authManager !== "undefined" && authManager.isSupervisor();

  // Marcar como lido ao entrar
  await marcarMuralComoLido();

  // Mostrar loader
  container.innerHTML = renderLoader();

  try {
    // Carregar avisos
    await carregarAvisosMural();

    // Renderizar
    renderizarLista(container, appInstance, isSupervisor);

    // Registrar funções globais
    window._muralAplicarFiltros = () => aplicarFiltros(container, appInstance);
    window._muralLimparFiltros = () => limparFiltros(container, appInstance);
    window._muralToggleFiltros = () => toggleFiltros(container, appInstance);
    window._muralFiltrarCategoria = (tipo) =>
      filtrarPorCategoria(tipo, container, appInstance);
    window._muralNovoAviso = () => abrirFormularioMural(container, appInstance);
    window._muralEditar = (id) => editarAvisoMural(id, container, appInstance);
    window._muralDeletar = (id) =>
      deletarAvisoMural(id, container, appInstance);
    window._muralExpandir = (id) => expandirConteudoMural(id);
    window._muralReagir = (id, tipo) =>
      toggleReacao(id, tipo, container, appInstance);
    window._muralComentar = (id) =>
      adicionarComentario(id, container, appInstance);
    window._muralVerComentarios = (id) => verTodosComentarios(id, appInstance);
    window._muralVerDetalhes = (id) => abrirModalDetalhes(id, appInstance);
    window._muralRecarregar = () => renderMural(container, appInstance);
    window._muralPagina = (pagina) =>
      irParaPagina(pagina, container, appInstance);
    window._muralVerMais = (id) => verMaisConteudo(id, appInstance);
    window._muralCompartilhar = (id) => compartilharAviso(id, appInstance);
    window._muralVerImagens = (id) => verImagensAviso(id, appInstance);
  } catch (error) {
    console.error("❌ Erro ao renderizar mural:", error);
    container.innerHTML = renderErro(error, appInstance);
  }
}

// ============================================
// CARREGAR AVISOS
// ============================================

export async function carregarAvisosMural(pagina = 1) {
  estado.carregando = true;
  estado.paginaAtual = pagina;

  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) {
      estado.avisos = [];
      estado.totalRegistros = 0;
      estado.totalPaginas = 1;
      estado.carregando = false;
      return;
    }

    const { busca, tipo, dataInicio, dataFim } = estado.filtros;
    const offset = (pagina - 1) * ITENS_POR_PAGINA;

    let query = client.from("mural_avisos").select("*", { count: "exact" });

    if (tipo !== "todos") {
      query = query.eq("tipo", tipo);
    }

    if (busca && busca.trim() !== "") {
      const termo = `%${busca.trim()}%`;
      query = query.or(`titulo.ilike.${termo},conteudo.ilike.${termo}`);
    }

    if (dataInicio) {
      query = query.gte("criado_em", dataInicio);
    }

    if (dataFim) {
      query = query.lte("criado_em", dataFim + "T23:59:59");
    }

    query = query
      .order("prioridade", { ascending: false })
      .order("criado_em", { ascending: false })
      .range(offset, offset + ITENS_POR_PAGINA - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    // Buscar dados dos criadores, comentários e reações
    const avisos = data || [];
    if (avisos.length > 0) {
      const idsCriadores = avisos.map((a) => a.criado_por).filter((id) => id);
      const dadosUsuarios = await buscarDadosUsuariosEmLote(idsCriadores);

      const avisosComDados = await Promise.all(
        avisos.map(async (aviso) => {
          // Buscar comentários
          const { data: comentarios } = await client
            .from("mural_comentarios")
            .select("*, usuarios(nome_completo, perfil)")
            .eq("aviso_id", aviso.id)
            .order("criado_em", { ascending: true })
            .limit(3);

          // Buscar reações
          const { data: reacoes } = await client
            .from("mural_reações")
            .select("*")
            .eq("aviso_id", aviso.id);

          const user =
            typeof authManager !== "undefined" ? authManager.getUser() : null;
          const reacaoUsuario = reacoes?.find((r) => r.usuario_id === user?.id);

          // Processar anexos
          let anexos = [];
          if (aviso.anexos) {
            try {
              anexos =
                typeof aviso.anexos === "string"
                  ? JSON.parse(aviso.anexos)
                  : aviso.anexos || [];
            } catch (e) {
              anexos = [];
            }
          }

          return {
            ...aviso,
            criador: dadosUsuarios[aviso.criado_por] || {
              nome_completo: "Desconhecido",
              perfil: null,
            },
            comentarios: comentarios || [],
            reacoes: reacoes || [],
            reacao_usuario: reacaoUsuario,
            total_reacoes: reacoes?.length || 0,
            anexos: anexos || [],
          };
        }),
      );

      estado.avisos = avisosComDados;
    } else {
      estado.avisos = [];
    }

    estado.totalRegistros = count || 0;
    estado.totalPaginas = Math.max(
      1,
      Math.ceil(estado.totalRegistros / ITENS_POR_PAGINA),
    );
  } catch (error) {
    console.error("Erro ao carregar avisos:", error);
    estado.avisos = [];
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
      .select("id, nome_completo, perfil")
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

async function renderizarLista(container, appInstance, isSupervisor) {
  const { avisos, totalRegistros, totalPaginas, paginaAtual, filtros } = estado;

  const temFiltros =
    filtros.busca ||
    filtros.tipo !== "todos" ||
    filtros.dataInicio ||
    filtros.dataFim;

  const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA + 1;
  const fim = Math.min(paginaAtual * ITENS_POR_PAGINA, totalRegistros);

  const filtrosAbertos = estado.filtrosVisiveis;

  let html = `
    <div class="container" style="padding-bottom:100px;" id="muralContainer">
      <!-- Cabeçalho -->
      <div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
          <div>
            <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;font-weight:700;">
              <i class="fas fa-bullhorn" style="margin-right:6px;color:var(--azul-bandeira);"></i>
              Mural de Avisos
            </h2>
            <p style="color:var(--cinza-medio);font-size:12px;margin:0;">
              Fique por dentro das comunicações da corporação.
            </p>
          </div>
          ${
            isSupervisor
              ? `
            <button onclick="window._muralNovoAviso()" class="btn-primary" 
              style="padding:6px 14px;font-size:12px;min-height:auto;width:auto;border-radius:30px;background:var(--gradiente-principal);box-shadow:0 2px 12px rgba(0,63,135,0.25);">
              <i class="fas fa-plus" style="margin-right:4px;"></i> Novo
            </button>
          `
              : ""
          }
        </div>
      </div>

      <!-- Filtros compactos -->
      <div class="filtros-mural" style="background:var(--branco);border-radius:var(--border-radius);padding:8px 10px;margin-bottom:10px;box-shadow:var(--sombra-suave);">
        <!-- Linha 1: Busca + Toggle -->
        <div style="display:flex;gap:6px;margin-bottom:4px;">
          <div style="flex:1;position:relative;">
            <i class="fas fa-search" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--cinza-medio);font-size:12px;z-index:2;"></i>
            <input type="text" id="muralBusca" placeholder="Buscar aviso..." 
              value="${filtros.busca || ""}"
              style="width:100%;padding:6px 10px 6px 32px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:12px;background:var(--branco);color:var(--cinza-escuro);min-height:32px;"
              oninput="window._muralBuscar(this.value)">
          </div>
          <div style="display:flex;gap:4px;flex-shrink:0;">
            <button onclick="window._muralToggleFiltros()" 
              style="padding:4px 10px;min-height:32px;border:2px solid var(--cinza-claro);border-radius:8px;background:${filtrosAbertos ? "var(--azul-muito-claro)" : "var(--branco)"};color:${filtrosAbertos ? "var(--azul-bandeira)" : "var(--cinza-medio)"};font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;">
              <i class="fas fa-sliders-h" style="margin-right:4px;"></i>
              ${filtrosAbertos ? "▲" : "▼"}
            </button>
            ${temFiltros ? `<button onclick="window._muralLimparFiltros()" style="padding:4px 8px;min-height:32px;border:2px solid var(--cinza-claro);border-radius:8px;background:var(--branco);color:var(--azul-bandeira);font-size:11px;font-weight:600;cursor:pointer;"><i class="fas fa-times"></i></button>` : ""}
          </div>
        </div>

        <!-- Linha 2: Categorias (abas) - Compactas -->
        <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-start;">
          ${TIPOS_AVISO_LISTA.map(
            (cat) => `
            <button 
              onclick="window._muralFiltrarCategoria('${cat.value}')" 
              class="categoria-aba-mural"
              style="
                flex:1 1 auto;
                min-width:0;
                padding:4px 6px;
                border:2px solid ${filtros.tipo === cat.value ? "var(--azul-bandeira)" : "var(--cinza-claro)"};
                border-radius:20px;
                font-size:10px;
                font-weight:${filtros.tipo === cat.value ? "700" : "500"};
                background:${filtros.tipo === cat.value ? "var(--azul-bandeira)" : "var(--branco)"};
                color:${filtros.tipo === cat.value ? "var(--branco)" : "var(--cinza-escuro)"};
                cursor:pointer;
                transition:all 0.2s ease;
                white-space:nowrap;
                min-height:26px;
                text-align:center;
                max-width:100%;
                overflow:hidden;
                text-overflow:ellipsis;
              "
            >
              ${cat.label}
            </button>
          `,
          ).join("")}
        </div>

        <!-- Linha 3: Filtros avançados (colapsáveis) -->
        <div id="filtrosAvancadosMural" style="display:${filtrosAbertos ? "block" : "none"};margin-top:6px;padding-top:6px;border-top:1px solid var(--cinza-claro);">
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <div style="flex:1;min-width:80px;">
              <label style="display:block;font-size:9px;font-weight:600;color:var(--cinza-medio);text-transform:uppercase;letter-spacing:0.2px;margin-bottom:1px;">Início</label>
              <input type="date" id="muralDataInicio" value="${filtros.dataInicio || ""}" 
                style="width:100%;padding:4px 6px;border:2px solid var(--cinza-claro);border-radius:6px;font-size:11px;background:var(--branco);color:var(--cinza-escuro);min-height:30px;"
                onchange="window._muralAplicarFiltros()">
            </div>
            <div style="flex:1;min-width:80px;">
              <label style="display:block;font-size:9px;font-weight:600;color:var(--cinza-medio);text-transform:uppercase;letter-spacing:0.2px;margin-bottom:1px;">Fim</label>
              <input type="date" id="muralDataFim" value="${filtros.dataFim || ""}" 
                style="width:100%;padding:4px 6px;border:2px solid var(--cinza-claro);border-radius:6px;font-size:11px;background:var(--branco);color:var(--cinza-escuro);min-height:30px;"
                onchange="window._muralAplicarFiltros()">
            </div>
          </div>
        </div>
      </div>

      <!-- Contador -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:4px;">
        <span style="font-size:12px;color:var(--cinza-medio);font-weight:500;">
          <i class="fas fa-bullhorn" style="margin-right:4px;"></i>
          ${
            totalRegistros > 0
              ? `Mostrando <strong>${inicio}</strong> a <strong>${fim}</strong> de <strong>${totalRegistros}</strong> avisos`
              : "Nenhum aviso encontrado"
          }
          ${temFiltros ? `<span style="color:var(--azul-bandeira);font-weight:600;">(filtrado)</span>` : ""}
        </span>
      </div>

      <!-- Lista de avisos -->
      <div id="muralListaAvisos">
  `;

  if (estado.carregando) {
    html += renderLoaderCards();
  } else if (avisos.length === 0) {
    html += renderVazio(temFiltros, isSupervisor);
  } else {
    avisos.forEach((aviso) => {
      html += renderAvisoCard(aviso, isSupervisor, appInstance);
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
            ? `Exibindo ${avisos.length} de ${totalRegistros} avisos`
            : "Nenhum aviso cadastrado"
        }
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Registrar função de busca com debounce
  window._muralBuscar = (termo) => {
    clearTimeout(estado._timeoutBusca);
    estado._timeoutBusca = setTimeout(() => {
      estado.filtros.busca = termo.trim();
      estado.paginaAtual = 1;
      renderMural(container, appInstance);
    }, 400);
  };

  // Atualizar badge
  await atualizarBadgeMural();
}

// ============================================
// RENDERIZAÇÃO: CARD DE AVISO
// ============================================

function renderAvisoCard(aviso, isSupervisor, appInstance) {
  const tipoInfo = TIPOS_AVISO[aviso.tipo] || TIPOS_AVISO.noticia;
  const corBadge = tipoInfo.corBg || "var(--cinza-medio)";
  const badgeClass = tipoInfo.badge || "badge-noticia";

  const autorNome = aviso.criador?.nome_completo || "Desconhecido";
  const isSupervisorAutor = aviso.criador?.perfil === "supervisor";
  const dataFormatada = formatarDataHoraLocal(aviso.criado_em);

  // Processar anexos/imagens
  const imagens =
    aviso.anexos?.filter(
      (a) => a.tipo === "image" || a.tipo_arquivo === "image",
    ) || [];
  const primeiraImagem = imagens.length > 0 ? imagens[0] : null;
  const totalImagens = imagens.length;

  // Conteúdo - prévia de 150 caracteres
  const conteudoLongo = aviso.conteudo && aviso.conteudo.length > 150;
  const conteudoPreview = conteudoLongo
    ? aviso.conteudo.substring(0, 150) + "..."
    : aviso.conteudo;

  // Reações
  const reacoes = aviso.reacoes || [];
  const reacaoUsuario = aviso.reacao_usuario;
  const totalReacoes = reacoes.length;

  // Comentários - últimos 2
  const comentarios = aviso.comentarios || [];
  const ultimosComentarios = comentarios.slice(-2);
  const totalComentarios = comentarios.length;

  // Verificar se é urgente
  const isUrgente = aviso.prioridade === true;

  // Extrair localização e tag do conteúdo
  let localizacao = "";
  let tag = "";
  if (aviso.conteudo) {
    const linhas = aviso.conteudo.split("\n");
    for (const linha of linhas) {
      const trimmed = linha.trim();
      if (trimmed.startsWith("-") || trimmed.startsWith("•")) {
        const texto = trimmed.replace(/^[-•]\s*/, "").trim();
        if (
          texto.includes("PR") ||
          texto.includes("Rodovia") ||
          texto.includes("km")
        ) {
          if (!localizacao) localizacao = texto;
        } else if (!tag) {
          tag = texto;
        }
      }
    }
  }

  // Usar campos específicos se existirem
  if (aviso.localizacao) localizacao = aviso.localizacao;
  if (aviso.tag) tag = aviso.tag;

  // Gerar ID para o card
  const cardId = `aviso-card-${aviso.id}`;

  // Calcular contagem de reações
  const reacoesCount = {};
  Object.keys(REACOES_EMOJIS).forEach((key) => {
    reacoesCount[key] = reacoes.filter((r) => r.tipo === key).length;
  });

  return `
    <div class="mural-card-modern" id="${cardId}" style="
      background:var(--branco);
      border-radius:var(--border-radius);
      overflow:hidden;
      margin-bottom:14px;
      box-shadow:var(--sombra-suave);
      border: ${isUrgente ? "2px solid var(--erro)" : "1px solid var(--cinza-claro)"};
      position:relative;
    ">
      ${isUrgente ? `<div style="position:absolute;top:10px;right:10px;background:var(--erro);color:white;font-size:9px;font-weight:700;padding:2px 12px;border-radius:20px;text-transform:uppercase;z-index:2;box-shadow:0 2px 8px rgba(220,38,38,0.3);animation:pulse-urgent 2s ease-in-out infinite;">🚨 Urgente</div>` : ""}

      <!-- Imagem de capa -->
      <div style="width:100%;height:180px;background:var(--cinza-claro);position:relative;overflow:hidden;">
        ${
          primeiraImagem
            ? `
          <img src="${primeiraImagem.url_thumb || primeiraImagem.url}" alt="${aviso.titulo}" 
            style="width:100%;height:100%;object-fit:cover;"
            loading="lazy"
            onclick="event.stopPropagation(); window._muralVerImagens('${aviso.id}')">
          ${totalImagens > 1 ? `<span style="position:absolute;bottom:8px;right:8px;background:rgba(0,0,0,0.7);color:white;font-size:10px;font-weight:700;padding:2px 10px;border-radius:12px;backdrop-filter:blur(4px);">+${totalImagens - 1}</span>` : ""}
          <button onclick="event.stopPropagation(); window._muralVerImagens('${aviso.id}')" 
            style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.5);border:none;color:white;width:32px;height:32px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;">
            <i class="fas fa-expand"></i>
          </button>
        `
            : `
          <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg, ${tipoInfo.cor}15, var(--cinza-claro));">
            <i class="fas fa-bullhorn" style="font-size:48px;color:var(--cinza-medio);opacity:0.3;"></i>
          </div>
        `
        }
      </div>

      <!-- Conteúdo -->
      <div style="padding:12px 14px;">
        <!-- Badge e Data -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:4px;">
          <span class="badge ${badgeClass}" style="font-size:9px;padding:2px 12px;font-weight:700;background:${corBadge};color:white;border:none;text-transform:uppercase;letter-spacing:0.5px;">
            ${tipoInfo.label}
          </span>
          <span style="font-size:10px;color:var(--cinza-medio);display:flex;align-items:center;gap:4px;">
            <i class="fas fa-clock" style="font-size:10px;"></i>
            ${dataFormatada}
          </span>
        </div>

        <!-- Título -->
        <h3 style="font-size:15px;font-weight:700;color:var(--azul-bandeira);margin:0 0 6px 0;line-height:1.3;">
          ${aviso.titulo}
        </h3>

        <!-- Conteúdo -->
        <div style="font-size:13px;color:var(--cinza-escuro);line-height:1.5;margin-bottom:4px;">
          <span id="conteudo-${aviso.id}">
            ${conteudoPreview}
          </span>
          ${
            conteudoLongo
              ? `
            <button onclick="event.stopPropagation(); window._muralVerMais('${aviso.id}')" 
              style="background:none;border:none;color:var(--azul-bandeira);font-weight:600;font-size:12px;cursor:pointer;padding:0 2px;">
              <span id="verMaisBtn-${aviso.id}">Ver mais</span>
            </button>
          `
              : ""
          }
        </div>

        <!-- Tags (Localização e Tag) -->
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;padding-top:6px;border-top:1px solid var(--cinza-claro);">
          ${
            localizacao
              ? `
            <span style="font-size:10px;color:var(--cinza-medio);background:var(--branco-fumaca);padding:2px 10px;border-radius:12px;">
              <i class="fas fa-map-marker-alt" style="margin-right:4px;font-size:9px;"></i>
              ${localizacao}
            </span>
          `
              : ""
          }
          ${
            tag
              ? `
            <span style="font-size:10px;color:var(--cinza-medio);background:var(--branco-fumaca);padding:2px 10px;border-radius:12px;">
              <i class="fas fa-tag" style="margin-right:4px;font-size:9px;"></i>
              ${tag}
            </span>
          `
              : ""
          }
        </div>

        <!-- Autor -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:8px;border-top:1px solid var(--cinza-claro);">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:28px;height:28px;border-radius:50%;background:var(--gradiente-principal);color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0;">
              ${autorNome.charAt(0).toUpperCase()}
            </div>
            <div>
              <span style="font-size:12px;font-weight:600;color:var(--cinza-escuro);">${autorNome}</span>
              ${isSupervisorAutor ? `<span style="font-size:8px;font-weight:700;color:var(--azul-bandeira);background:var(--azul-muito-claro);padding:1px 8px;border-radius:10px;margin-left:4px;">SUPERVISOR</span>` : ""}
            </div>
          </div>
          ${
            isSupervisor
              ? `
            <div style="display:flex;gap:4px;">
              <button onclick="event.stopPropagation(); window._muralEditar('${aviso.id}')" 
                style="padding:2px 8px;font-size:10px;min-height:auto;width:auto;border-radius:6px;background:var(--azul-muito-claro);color:var(--azul-bandeira);border:none;cursor:pointer;">
                <i class="fas fa-edit"></i>
              </button>
              <button onclick="event.stopPropagation(); window._muralDeletar('${aviso.id}')" 
                style="padding:2px 8px;font-size:10px;min-height:auto;width:auto;border-radius:6px;background:var(--erro-claro);color:var(--erro);border:none;cursor:pointer;">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          `
              : `
            <button onclick="event.stopPropagation(); window._muralCompartilhar('${aviso.id}')" 
              style="padding:2px 8px;font-size:10px;min-height:auto;width:auto;border-radius:6px;background:var(--azul-muito-claro);color:var(--azul-bandeira);border:none;cursor:pointer;">
              <i class="fas fa-share-alt"></i>
            </button>
          `
          }
        </div>

        <!-- Reações -->
        <div style="display:flex;flex-wrap:wrap;gap:4px;padding:6px 0 0 0;margin-top:6px;border-top:1px solid var(--cinza-claro);">
          ${Object.entries(REACOES_EMOJIS)
            .map(([key, emoji]) => {
              const count = reacoesCount[key] || 0;
              const isUserReacted = reacaoUsuario?.tipo === key;
              return `
              <button onclick="event.stopPropagation(); window._muralReagir('${aviso.id}', '${key}')" 
                class="reacao-btn-mural ${isUserReacted ? "ativo" : ""}" 
                style="background:${isUserReacted ? "var(--azul-muito-claro)" : "var(--branco-fumaca)"};border:2px solid ${isUserReacted ? "var(--azul-bandeira)" : "transparent"};border-radius:30px;padding:2px 8px;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:3px;transition:all 0.2s ease;min-height:28px;">
                ${emoji}
                <span class="count" style="font-size:10px;font-weight:600;color:${isUserReacted ? "var(--azul-bandeira)" : "var(--cinza-medio)"};">${count}</span>
              </button>
            `;
            })
            .join("")}
          <span style="font-size:10px;color:var(--cinza-medio);display:flex;align-items:center;margin-left:auto;">
            ${totalReacoes > 0 ? `${totalReacoes} reações` : ""}
          </span>
        </div>

        <!-- Comentários -->
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--cinza-claro);">
          ${
            ultimosComentarios.length > 0
              ? `
            <div style="margin-bottom:4px;">
              ${ultimosComentarios
                .map(
                  (c) => `
                <div style="display:flex;gap:6px;padding:3px 0;font-size:12px;">
                  <span style="font-weight:600;color:var(--azul-bandeira);font-size:11px;">${c.usuarios?.nome_completo || "Usuário"}:</span>
                  <span style="color:var(--cinza-escuro);word-break:break-word;">${c.comentario}</span>
                </div>
              `,
                )
                .join("")}
            </div>
          `
              : ""
          }
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
            <div style="flex:1;min-width:100px;position:relative;">
              <input type="text" id="comentarioInput-${aviso.id}" 
                placeholder="Escreva um comentário..." 
                style="width:100%;padding:4px 8px;border:2px solid var(--cinza-claro);border-radius:8px;font-size:11px;background:var(--branco-fumaca);min-height:28px;"
                onkeydown="if(event.key==='Enter') window._muralComentar('${aviso.id}')">
            </div>
            <button onclick="window._muralComentar('${aviso.id}')" class="btn-primary" 
              style="padding:4px 10px;font-size:11px;min-height:28px;width:auto;border-radius:8px;">
              <i class="fas fa-paper-plane"></i>
            </button>
            ${
              totalComentarios > 2
                ? `
              <button onclick="window._muralVerComentarios('${aviso.id}')" 
                style="background:none;border:none;color:var(--azul-bandeira);font-size:10px;font-weight:600;cursor:pointer;padding:2px 6px;">
                Ver todos (${totalComentarios})
              </button>
            `
                : totalComentarios > 0 && totalComentarios <= 2
                  ? `
              <span style="font-size:10px;color:var(--cinza-medio);">
                ${totalComentarios} comentário(s)
              </span>
            `
                  : ""
            }
          </div>
        </div>
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

  html += `
    <button onclick="window._muralPagina(1)" ${atual <= 1 ? "disabled" : ""}
      style="padding:4px 8px;border:1px solid var(--cinza-claro);border-radius:6px;background:var(--branco);color:var(--cinza-escuro);font-size:12px;cursor:pointer;min-height:30px;min-width:30px;${atual <= 1 ? "opacity:0.3;pointer-events:none;" : ""}">
      <i class="fas fa-angle-double-left"></i>
    </button>
  `;

  html += `
    <button onclick="window._muralPagina(${atual - 1})" ${atual <= 1 ? "disabled" : ""}
      style="padding:4px 8px;border:1px solid var(--cinza-claro);border-radius:6px;background:var(--branco);color:var(--cinza-escuro);font-size:12px;cursor:pointer;min-height:30px;min-width:30px;${atual <= 1 ? "opacity:0.3;pointer-events:none;" : ""}">
      <i class="fas fa-angle-left"></i>
    </button>
  `;

  const maxVisible = 5;
  let inicio = Math.max(1, atual - Math.floor(maxVisible / 2));
  let fim = Math.min(total, inicio + maxVisible - 1);

  if (fim - inicio < maxVisible - 1) {
    inicio = Math.max(1, fim - maxVisible + 1);
  }

  if (inicio > 1) {
    html += `<button onclick="window._muralPagina(1)" style="padding:4px 8px;border:1px solid var(--cinza-claro);border-radius:6px;background:var(--branco);color:var(--cinza-escuro);font-size:12px;cursor:pointer;min-height:30px;min-width:30px;">1</button>`;
    if (inicio > 2) {
      html += `<span style="padding:0 2px;color:var(--cinza-medio);font-size:12px;">…</span>`;
    }
  }

  for (let i = inicio; i <= fim; i++) {
    html += `
      <button onclick="window._muralPagina(${i})" 
        style="padding:4px 8px;border:1px solid ${i === atual ? "var(--azul-bandeira)" : "var(--cinza-claro)"};border-radius:6px;background:${i === atual ? "var(--azul-bandeira)" : "var(--branco)"};color:${i === atual ? "var(--branco)" : "var(--cinza-escuro)"};font-size:12px;cursor:pointer;min-height:30px;min-width:30px;font-weight:${i === atual ? "700" : "400"};">
        ${i}
      </button>
    `;
  }

  if (fim < total) {
    if (fim < total - 1) {
      html += `<span style="padding:0 2px;color:var(--cinza-medio);font-size:12px;">…</span>`;
    }
    html += `<button onclick="window._muralPagina(${total})" style="padding:4px 8px;border:1px solid var(--cinza-claro);border-radius:6px;background:var(--branco);color:var(--cinza-escuro);font-size:12px;cursor:pointer;min-height:30px;min-width:30px;">${total}</button>`;
  }

  html += `
    <button onclick="window._muralPagina(${atual + 1})" ${atual >= total ? "disabled" : ""}
      style="padding:4px 8px;border:1px solid var(--cinza-claro);border-radius:6px;background:var(--branco);color:var(--cinza-escuro);font-size:12px;cursor:pointer;min-height:30px;min-width:30px;${atual >= total ? "opacity:0.3;pointer-events:none;" : ""}">
      <i class="fas fa-angle-right"></i>
    </button>
  `;

  html += `
    <button onclick="window._muralPagina(${total})" ${atual >= total ? "disabled" : ""}
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
      <p style="margin-top:12px;color:var(--cinza-medio);">Carregando avisos...</p>
    </div>
  `;
}

function renderLoaderCards() {
  let html = "";
  for (let i = 0; i < 3; i++) {
    html += `
      <div style="background:var(--branco);border-radius:var(--border-radius);overflow:hidden;margin-bottom:14px;box-shadow:var(--sombra-suave);opacity:0.6;">
        <div style="width:100%;height:160px;background:var(--cinza-claro);"></div>
        <div style="padding:12px;">
          <div style="background:var(--cinza-claro);height:14px;width:40%;border-radius:4px;margin-bottom:6px;"></div>
          <div style="background:var(--cinza-claro);height:18px;width:70%;border-radius:4px;margin-bottom:6px;"></div>
          <div style="background:var(--cinza-claro);height:12px;width:90%;border-radius:4px;margin-bottom:4px;"></div>
          <div style="background:var(--cinza-claro);height:12px;width:80%;border-radius:4px;margin-bottom:6px;"></div>
          <div style="display:flex;gap:4px;">
            ${[1, 2, 3, 4].map(() => `<div style="background:var(--cinza-claro);height:28px;width:40px;border-radius:20px;"></div>`).join("")}
          </div>
        </div>
      </div>
    `;
  }
  return html;
}

function renderVazio(temFiltros, isSupervisor) {
  return `
    <div style="text-align:center;padding:40px 20px;color:var(--cinza-medio);background:var(--branco);border-radius:var(--border-radius);box-shadow:var(--sombra-suave);">
      <div style="font-size:48px;color:var(--cinza-claro);margin-bottom:12px;">
        <i class="fas fa-bullhorn"></i>
      </div>
      <p style="font-weight:500;font-size:15px;">Nenhum aviso encontrado</p>
      ${
        temFiltros
          ? `<p style="font-size:13px;">Tente ajustar os filtros aplicados</p>
             <button onclick="window._muralLimparFiltros()" class="btn-secondary" style="margin-top:10px;padding:6px 14px;font-size:12px;min-height:auto;width:auto;border-radius:8px;">
               <i class="fas fa-undo" style="margin-right:4px;"></i> Limpar Filtros
             </button>`
          : isSupervisor
            ? `<p style="font-size:13px;">Clique em "Novo" para criar seu primeiro aviso</p>
             <button onclick="window._muralNovoAviso()" class="btn-primary" style="margin-top:10px;padding:6px 16px;font-size:12px;min-height:auto;width:auto;border-radius:30px;">
               <i class="fas fa-plus" style="margin-right:4px;"></i> Novo Aviso
             </button>`
            : `<p style="font-size:13px;">Nenhum aviso publicado ainda.</p>`
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
      <h3>Erro ao carregar avisos</h3>
      <p style="color:var(--cinza-medio);">${error.message}</p>
      <button onclick="window._muralRecarregar()" class="btn-primary" style="margin-top:16px;border-radius:12px;">
        Tentar novamente
      </button>
    </div>
  `;
}

// ============================================
// FILTROS
// ============================================

export function aplicarFiltros(container, appInstance) {
  const busca = document.getElementById("muralBusca")?.value || "";
  const dataInicio = document.getElementById("muralDataInicio")?.value || "";
  const dataFim = document.getElementById("muralDataFim")?.value || "";

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
    busca,
    dataInicio,
    dataFim,
  };
  estado.paginaAtual = 1;

  renderMural(container, appInstance);
}

export function limparFiltros(container, appInstance) {
  estado.filtros = {
    busca: "",
    tipo: "todos",
    dataInicio: "",
    dataFim: "",
  };
  estado.paginaAtual = 1;

  const fields = ["muralBusca", "muralDataInicio", "muralDataFim"];
  fields.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  renderMural(container, appInstance);

  if (appInstance && appInstance.showToast) {
    appInstance.showToast("Filtros removidos", "info");
  }
}

export function filtrarPorCategoria(tipo, container, appInstance) {
  estado.filtros.tipo = tipo;
  estado.paginaAtual = 1;
  renderMural(container, appInstance);
}

function toggleFiltros(container, appInstance) {
  estado.filtrosVisiveis = !estado.filtrosVisiveis;
  renderMural(container, appInstance);
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
  carregarAvisosMural(pagina).then(() => {
    const isSupervisor =
      typeof authManager !== "undefined" && authManager.isSupervisor();
    renderizarLista(container, appInstance, isSupervisor);
  });
}

// ============================================
// INTERAÇÕES - REAÇÕES
// ============================================

export async function toggleReacao(avisoId, tipo, container, appInstance) {
  try {
    const user =
      typeof authManager !== "undefined" ? authManager.getUser() : null;
    if (!user) {
      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Usuário não autenticado", "error");
      }
      return;
    }

    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) {
      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Erro ao conectar", "error");
      }
      return;
    }

    const { data: reacoesExistentes, error: checkError } = await client
      .from("mural_reações")
      .select("*")
      .eq("aviso_id", avisoId)
      .eq("usuario_id", user.id);

    if (checkError) throw checkError;

    const reacaoExistente = reacoesExistentes?.find((r) => r.tipo === tipo);

    if (reacaoExistente) {
      const { error } = await client
        .from("mural_reações")
        .delete()
        .eq("id", reacaoExistente.id);

      if (error) throw error;
    } else {
      if (reacoesExistentes && reacoesExistentes.length > 0) {
        const idsParaRemover = reacoesExistentes.map((r) => r.id);
        const { error: deleteError } = await client
          .from("mural_reações")
          .delete()
          .in("id", idsParaRemover);

        if (deleteError) throw deleteError;
      }

      const { error: insertError } = await client.from("mural_reações").insert({
        aviso_id: avisoId,
        usuario_id: user.id,
        tipo: tipo,
        criado_em: new Date().toISOString(),
      });

      if (insertError) throw insertError;
    }

    await renderMural(container, appInstance);
  } catch (error) {
    console.error("Erro ao alternar reação:", error);
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Erro ao processar reação", "error");
    }
  }
}

// ============================================
// INTERAÇÕES - COMENTÁRIOS
// ============================================

export async function adicionarComentario(avisoId, container, appInstance) {
  const input = document.getElementById(`comentarioInput-${avisoId}`);
  if (!input) return;

  const comentario = input.value.trim();
  if (!comentario) {
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Digite um comentário", "warning");
    }
    return;
  }

  try {
    const user =
      typeof authManager !== "undefined" ? authManager.getUser() : null;
    if (!user) {
      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Usuário não autenticado", "error");
      }
      return;
    }

    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) {
      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Erro ao conectar", "error");
      }
      return;
    }

    const { error } = await client.from("mural_comentarios").insert({
      aviso_id: avisoId,
      usuario_id: user.id,
      comentario: comentario,
      criado_em: new Date().toISOString(),
    });

    if (error) throw error;

    input.value = "";
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Comentário adicionado!", "success");
    }

    await renderMural(container, appInstance);
  } catch (error) {
    console.error("Erro ao adicionar comentário:", error);
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Erro ao adicionar comentário", "error");
    }
  }
}

export async function verTodosComentarios(avisoId, appInstance) {
  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) {
      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Erro ao conectar", "error");
      }
      return;
    }

    const { data: comentarios, error } = await client
      .from("mural_comentarios")
      .select("*, usuarios(nome_completo, perfil)")
      .eq("aviso_id", avisoId)
      .order("criado_em", { ascending: true });

    if (error) throw error;

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

    overlay.innerHTML = `
      <div class="modal" style="max-width:480px;width:100%;max-height:80vh;overflow-y:auto;background:var(--branco);border-radius:16px;box-shadow:var(--sombra-forte);">
        <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px 8px 14px;border-bottom:1px solid var(--cinza-claro);position:sticky;top:0;background:var(--branco);border-radius:16px 16px 0 0;z-index:1;">
          <div class="title" style="font-size:15px;font-weight:700;color:var(--azul-bandeira);">
            <i class="fas fa-comments" style="margin-right:6px;"></i>
            Comentários (${comentarios?.length || 0})
          </div>
          <button type="button" class="close-btn" onclick="this.closest('.modal-overlay').remove()" 
            style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--cinza-medio);padding:2px 6px;border-radius:50%;">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body" style="padding:12px 14px;">
          ${
            (comentarios || [])
              .map(
                (c) => `
            <div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--cinza-claro);">
              <div style="width:28px;height:28px;border-radius:50%;background:var(--gradiente-principal);color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;flex-shrink:0;">
                ${c.usuarios?.nome_completo?.charAt(0)?.toUpperCase() || "U"}
              </div>
              <div style="flex:1;min-width:0;">
                <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:2px;">
                  <span style="font-weight:600;font-size:12px;color:var(--azul-bandeira);">
                    ${c.usuarios?.nome_completo || "Usuário"}
                    ${c.usuarios?.perfil === "supervisor" ? `<span style="font-size:8px;font-weight:700;color:var(--azul-bandeira);background:var(--azul-muito-claro);padding:1px 8px;border-radius:10px;margin-left:4px;">SUPER</span>` : ""}
                  </span>
                  <span style="font-size:10px;color:var(--cinza-medio);">${formatarDataHoraLocal(c.criado_em)}</span>
                </div>
                <div style="font-size:13px;color:var(--cinza-escuro);word-break:break-word;margin-top:2px;">${c.comentario}</div>
              </div>
            </div>
          `,
              )
              .join("") ||
            `<p style="text-align:center;color:var(--cinza-medio);padding:20px;">Nenhum comentário ainda</p>`
          }
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
  } catch (error) {
    console.error("Erro ao carregar comentários:", error);
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Erro ao carregar comentários", "error");
    }
  }
}

// ============================================
// INTERAÇÕES - VER MAIS CONTEÚDO
// ============================================

export function verMaisConteudo(id, appInstance) {
  const aviso = estado.avisos.find((a) => a.id === id);
  if (!aviso) return;

  const conteudoEl = document.getElementById(`conteudo-${id}`);
  const btnEl = document.getElementById(`verMaisBtn-${id}`);

  if (!conteudoEl || !btnEl) return;

  const isExpanded = conteudoEl.dataset.expanded === "true";

  if (isExpanded) {
    // Colapsar
    const preview = aviso.conteudo.substring(0, 150) + "...";
    conteudoEl.textContent = preview;
    btnEl.textContent = "Ver mais";
    conteudoEl.dataset.expanded = "false";
  } else {
    // Expandir
    conteudoEl.textContent = aviso.conteudo;
    btnEl.textContent = "Ver menos";
    conteudoEl.dataset.expanded = "true";
  }
}

// ============================================
// INTERAÇÕES - COMPARTILHAR
// ============================================

export function compartilharAviso(id, appInstance) {
  const aviso = estado.avisos.find((a) => a.id === id);
  if (!aviso) return;

  const texto = `📢 ${aviso.titulo}\n\n${aviso.conteudo.substring(0, 200)}...\n\n📌 Guarda Municipal de Pitangueiras - PR`;

  if (navigator.share) {
    navigator
      .share({
        title: aviso.titulo,
        text: texto,
      })
      .catch(() => {
        copiarTexto(texto, appInstance);
      });
  } else {
    copiarTexto(texto, appInstance);
  }
}

function copiarTexto(texto, appInstance) {
  if (navigator.clipboard) {
    navigator.clipboard
      .writeText(texto)
      .then(() => {
        if (appInstance && appInstance.showToast) {
          appInstance.showToast(
            "Copiado para a área de transferência!",
            "success",
          );
        }
      })
      .catch(() => {
        fallbackCopiarTexto(texto, appInstance);
      });
  } else {
    fallbackCopiarTexto(texto, appInstance);
  }
}

function fallbackCopiarTexto(texto, appInstance) {
  const textarea = document.createElement("textarea");
  textarea.value = texto;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
  if (appInstance && appInstance.showToast) {
    appInstance.showToast("Copiado para a área de transferência!", "success");
  }
}

// ============================================
// INTERAÇÕES - VER IMAGENS
// ============================================

export function verImagensAviso(id, appInstance) {
  const aviso = estado.avisos.find((a) => a.id === id);
  if (!aviso) return;

  const imagens =
    aviso.anexos?.filter(
      (a) => a.tipo === "image" || a.tipo_arquivo === "image",
    ) || [];

  if (imagens.length === 0) {
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Nenhuma imagem disponível", "info");
    }
    return;
  }

  // Abrir carrossel
  if (typeof window._consultaAbrirCarrossel === "function") {
    window._consultaAbrirCarrossel(imagens, 0, appInstance);
  } else {
    // Fallback: abrir em nova aba
    window.open(imagens[0].url, "_blank");
  }
}

// ============================================
// BADGE DE NÃO LIDOS
// ============================================

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

    await atualizarBadgeMural();
  } catch (error) {
    console.error("Erro ao marcar mural como lido:", error);
  }
}

// ============================================
// FORMULÁRIO - NOVO AVISO
// ============================================

export function abrirFormularioMural(container, appInstance) {
  const isSupervisor =
    typeof authManager !== "undefined" && authManager.isSupervisor();
  if (!isSupervisor) {
    if (appInstance && appInstance.showToast) {
      appInstance.showToast(
        "Apenas supervisores podem criar avisos",
        "warning",
      );
    }
    return;
  }

  window._muralArquivosTemp = [];

  container.innerHTML = `
    <div class="container" style="padding-bottom:100px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
          <i class="fas fa-plus-circle" style="margin-right:6px;"></i>
          Novo Aviso
        </h2>
        <button onclick="window._muralRecarregar()" class="btn-secondary" style="padding:4px 10px;font-size:12px;min-height:auto;width:auto;border-radius:8px;">
          <i class="fas fa-arrow-left"></i> Voltar
        </button>
      </div>

      <div style="background:var(--branco);padding:14px;border-radius:var(--border-radius);box-shadow:var(--sombra-media);">
        <form id="formNovoAviso" onsubmit="event.preventDefault();">
          <div class="form-group" style="margin-bottom:12px;">
            <label style="display:block;font-size:12px;margin-bottom:4px;font-weight:600;">
              Título <span class="required" style="color:var(--erro);">*</span>
            </label>
            <input type="text" id="muralTitulo" placeholder="Título do aviso" 
              style="width:100%;padding:8px 12px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:14px;min-height:40px;">
          </div>

          <div class="form-group" style="margin-bottom:12px;">
            <label style="display:block;font-size:12px;margin-bottom:4px;font-weight:600;">
              Tipo <span class="required" style="color:var(--erro);">*</span>
            </label>
            <select id="muralTipo" style="width:100%;padding:8px 12px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:14px;min-height:40px;">
              <option value="noticia">📢 NOTÍCIA</option>
              <option value="alerta">🔴 ALERTA</option>
              <option value="ordem_servico">📋 ORDEM DE SERVIÇO</option>
              <option value="informativo">ℹ️ INFORMATIVO</option>
            </select>
          </div>

          <div class="form-group" style="margin-bottom:12px;">
            <label style="display:block;font-size:12px;margin-bottom:4px;font-weight:600;">
              Localização
            </label>
            <input type="text" id="muralLocalizacao" placeholder="Ex: Astorga - PR, Vila Rural" 
              style="width:100%;padding:8px 12px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:14px;min-height:40px;">
          </div>

          <div class="form-group" style="margin-bottom:12px;">
            <label style="display:block;font-size:12px;margin-bottom:4px;font-weight:600;">
              Tag
            </label>
            <input type="text" id="muralTag" placeholder="Ex: Veículo, Pessoa, Patrulhamento" 
              style="width:100%;padding:8px 12px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:14px;min-height:40px;">
          </div>

          <div class="form-group" style="margin-bottom:12px;">
            <label style="display:block;font-size:12px;margin-bottom:4px;font-weight:600;">
              Conteúdo <span class="required" style="color:var(--erro);">*</span>
            </label>
            <textarea id="muralConteudo" rows="4" placeholder="Descreva os detalhes do aviso..." 
              style="width:100%;padding:8px 12px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:14px;min-height:80px;resize:vertical;"></textarea>
          </div>

          <div class="form-group" style="margin-bottom:12px;">
            <label style="display:block;font-size:12px;margin-bottom:4px;font-weight:600;">
              <i class="fas fa-camera"></i> Fotos (máx 3)
            </label>
            <div style="display:flex;flex-direction:column;gap:6px;">
              <input type="file" id="muralArquivo" accept="image/*" multiple style="display:none;" 
                onchange="window._muralPreviewImagens(this)">
              <button type="button" onclick="document.getElementById('muralArquivo').click()" 
                class="btn-secondary" style="width:100%;font-size:12px;padding:6px;border-radius:12px;min-height:40px;">
                <i class="fas fa-camera"></i> Selecionar Fotos
              </button>
              <div id="muralPreviewArea" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;"></div>
            </div>
          </div>

          <div class="form-group" style="margin-bottom:12px;display:flex;align-items:center;gap:8px;">
            <input type="checkbox" id="muralPrioridade" style="width:18px;height:18px;accent-color:var(--erro);">
            <label style="font-size:12px;font-weight:700;color:var(--erro);">🚨 Aviso Prioritário (Urgente)</label>
          </div>

          <div style="display:flex;gap:8px;margin-top:16px;">
            <button type="button" onclick="window._muralSalvarAviso()" class="btn-primary" style="flex:2;border-radius:12px;min-height:44px;">
              <i class="fas fa-paper-plane"></i> Publicar
            </button>
            <button type="button" onclick="window._muralRecarregar()" class="btn-secondary" style="flex:1;border-radius:12px;min-height:44px;">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  window._muralSalvarAviso = () => salvarAvisoMural(container, appInstance);
  window._muralPreviewImagens = (input) => previewMultiplasImagensMural(input);
  window._muralRemoverImagem = (btn) => removerImagemMuralPreview(btn);

  window._muralArquivosTemp = [];
}

function previewMultiplasImagensMural(input) {
  const area = document.getElementById("muralPreviewArea");
  if (!area) return;

  const files = input.files;
  if (files.length > 3) {
    if (typeof window.app !== "undefined" && window.app.showToast) {
      window.app.showToast("Máximo 3 imagens permitidas", "warning");
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
      }
      continue;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const div = document.createElement("div");
      div.style.cssText =
        "position:relative;width:70px;height:70px;border-radius:8px;overflow:hidden;border:2px solid var(--cinza-claro);";
      div.innerHTML = `
        <img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;">
        <button type="button" onclick="window._muralRemoverImagem(this)" 
          style="position:absolute;top:2px;right:2px;background:rgba(220,38,38,0.8);color:white;border:none;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:12px;">
          <i class="fas fa-times"></i>
        </button>
      `;
      area.appendChild(div);
      imagensData.push(file);
    };
    reader.readAsDataURL(file);
  }

  window._muralArquivosTemp = imagensData;
}

function removerImagemMuralPreview(btn) {
  const div = btn.closest("div");
  div.remove();

  const files = window._muralArquivosTemp || [];
  const img = div.querySelector("img");
  if (img) {
    const index = files.findIndex(
      (f) => f.name === img.alt || f.name === img.src.split("/").pop(),
    );
    if (index > -1) {
      files.splice(index, 1);
      window._muralArquivosTemp = files;
    }
  }
}

// ============================================
// SALVAR AVISO
// ============================================

export async function salvarAvisoMural(container, appInstance) {
  const user =
    typeof authManager !== "undefined" ? authManager.getUser() : null;
  if (!user) {
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Usuário não autenticado", "error");
    }
    return;
  }

  const titulo = document.getElementById("muralTitulo")?.value?.trim();
  const tipo = document.getElementById("muralTipo")?.value || "noticia";
  const conteudo = document.getElementById("muralConteudo")?.value?.trim();
  const prioridade =
    document.getElementById("muralPrioridade")?.checked || false;
  const localizacao =
    document.getElementById("muralLocalizacao")?.value?.trim() || "";
  const tag = document.getElementById("muralTag")?.value?.trim() || "";

  if (!titulo || !conteudo) {
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Título e conteúdo são obrigatórios", "warning");
    }
    return;
  }

  const files = window._muralArquivosTemp || [];
  if (files.length > 3) {
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Máximo 3 imagens permitidas", "warning");
    }
    return;
  }

  if (appInstance && appInstance.showToast) {
    appInstance.showToast("Publicando aviso...", "info");
  }

  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) {
      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Erro ao conectar", "error");
      }
      return;
    }

    let anexosUrls = [];
    if (files.length > 0) {
      const anexosProcessados = await processarAnexosMural(files);
      anexosUrls = await uploadAnexosMural(anexosProcessados);
    }

    const dados = {
      titulo,
      tipo,
      conteudo,
      prioridade,
      criado_por: user.id,
      criado_em: new Date().toISOString(),
      anexos: anexosUrls,
      localizacao: localizacao,
      tag: tag,
    };

    const { data: aviso, error } = await client
      .from("mural_avisos")
      .insert([dados])
      .select()
      .single();

    if (error) throw error;

    window._muralArquivosTemp = [];
    const previewArea = document.getElementById("muralPreviewArea");
    if (previewArea) previewArea.innerHTML = "";
    const fileInput = document.getElementById("muralArquivo");
    if (fileInput) fileInput.value = "";

    await notificarNovoAviso(aviso);

    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Aviso publicado com sucesso!", "success");
    }

    await renderMural(container, appInstance);
  } catch (error) {
    console.error("Erro ao salvar aviso:", error);
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Erro ao publicar: " + error.message, "error");
    }
  }
}

async function processarAnexosMural(files) {
  const maxFiles = 3;
  const maxSize = 1 * 1024 * 1024;
  const anexos = [];
  const filesToProcess = Array.from(files).slice(0, maxFiles);

  for (const file of filesToProcess) {
    try {
      let fileProcessado = await comprimirImagem(file, 800, 0.8);

      if (fileProcessado.size > maxSize) {
        fileProcessado = await comprimirImagem(file, 600, 0.6);
        if (fileProcessado.size > maxSize) {
          if (typeof window.app !== "undefined" && window.app.showToast) {
            window.app.showToast(`Arquivo ${file.name} excede 1MB`, "warning");
          }
          continue;
        }
      }

      anexos.push({
        nome: file.name,
        tipo: "image",
        tamanho: fileProcessado.size,
        arquivo: fileProcessado,
        url: null,
      });
    } catch (error) {
      console.error("Erro ao processar anexo:", error);
    }
  }

  return anexos;
}

async function uploadAnexosMural(anexos) {
  if (!anexos || anexos.length === 0) return [];

  const client =
    typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
  if (!client) return [];

  const timestamp = Date.now();
  const resultados = [];

  for (const anexo of anexos) {
    try {
      const fileExt = anexo.arquivo.name.split(".").pop();
      const fileName = `mural/${timestamp}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;

      const { error: uploadError } = await client.storage
        .from("anexos")
        .upload(fileName, anexo.arquivo);

      if (uploadError) throw uploadError;

      const { data: urlData } = client.storage
        .from("anexos")
        .getPublicUrl(fileName);

      const thumbFileName = `mural/${timestamp}-${Math.random().toString(36).substring(2, 8)}_thumb.${fileExt}`;
      const { error: thumbError } = await client.storage
        .from("anexos")
        .upload(thumbFileName, anexo.arquivo);

      let thumbUrl = urlData.publicUrl;
      if (!thumbError) {
        const { data: thumbData } = client.storage
          .from("anexos")
          .getPublicUrl(thumbFileName);
        thumbUrl = thumbData.publicUrl;
      }

      resultados.push({
        url: urlData.publicUrl,
        url_thumb: thumbUrl,
        nome: anexo.nome,
        tipo: anexo.tipo,
        tamanho: anexo.tamanho,
      });
    } catch (error) {
      console.error("Erro no upload do anexo:", error);
    }
  }

  return resultados;
}

function comprimirImagem(file, maxWidth = 800, quality = 0.8) {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) {
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

async function notificarNovoAviso(aviso) {
  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) return;

    const { data: usuarios, error } = await client
      .from("usuarios")
      .select("id")
      .eq("status", "ativo")
      .neq("id", aviso.criado_por);

    if (error) throw error;
    if (usuarios.length === 0) return;

    const notificacoes = usuarios.map((u) => ({
      usuario_id: u.id,
      titulo: `📢 Novo aviso: ${aviso.titulo}`,
      mensagem: `Um novo aviso "${aviso.titulo}" foi publicado no mural.`,
      tipo: "sistema",
      link: "#mural",
      criado_em: new Date().toISOString(),
    }));

    const batchSize = 50;
    for (let i = 0; i < notificacoes.length; i += batchSize) {
      const batch = notificacoes.slice(i, i + batchSize);
      const { error: insertError } = await client
        .from("notificacoes")
        .insert(batch);
      if (insertError) {
        console.warn("Erro ao inserir notificações em lote:", insertError);
      }
    }

    console.log(
      `✅ ${notificacoes.length} notificações enviadas para o novo aviso`,
    );
  } catch (error) {
    console.error("Erro ao enviar notificações:", error);
  }
}

// ============================================
// EDITAR AVISO
// ============================================

export async function editarAvisoMural(id, container, appInstance) {
  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) {
      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Erro ao conectar", "error");
      }
      return;
    }

    const { data: aviso, error } = await client
      .from("mural_avisos")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;

    container.innerHTML = `
      <div class="container" style="padding-bottom:100px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
            <i class="fas fa-edit" style="margin-right:6px;"></i>
            Editar Aviso
          </h2>
          <button onclick="window._muralRecarregar()" class="btn-secondary" style="padding:4px 10px;font-size:12px;min-height:auto;width:auto;border-radius:8px;">
            <i class="fas fa-arrow-left"></i> Voltar
          </button>
        </div>

        <div style="background:var(--branco);padding:14px;border-radius:var(--border-radius);box-shadow:var(--sombra-media);">
          <form id="formEditarAviso" onsubmit="event.preventDefault();">
            <div class="form-group" style="margin-bottom:12px;">
              <label style="display:block;font-size:12px;margin-bottom:4px;font-weight:600;">
                Título <span class="required">*</span>
              </label>
              <input type="text" id="muralTitulo" value="${aviso.titulo}" 
                style="width:100%;padding:8px 12px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:14px;min-height:40px;">
            </div>

            <div class="form-group" style="margin-bottom:12px;">
              <label style="display:block;font-size:12px;margin-bottom:4px;font-weight:600;">
                Tipo <span class="required">*</span>
              </label>
              <select id="muralTipo" style="width:100%;padding:8px 12px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:14px;min-height:40px;">
                <option value="noticia" ${aviso.tipo === "noticia" ? "selected" : ""}>📢 NOTÍCIA</option>
                <option value="alerta" ${aviso.tipo === "alerta" ? "selected" : ""}>🔴 ALERTA</option>
                <option value="ordem_servico" ${aviso.tipo === "ordem_servico" ? "selected" : ""}>📋 ORDEM DE SERVIÇO</option>
                <option value="informativo" ${aviso.tipo === "informativo" ? "selected" : ""}>ℹ️ INFORMATIVO</option>
              </select>
            </div>

            <div class="form-group" style="margin-bottom:12px;">
              <label style="display:block;font-size:12px;margin-bottom:4px;font-weight:600;">
                Localização
              </label>
              <input type="text" id="muralLocalizacao" value="${aviso.localizacao || ""}" 
                style="width:100%;padding:8px 12px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:14px;min-height:40px;">
            </div>

            <div class="form-group" style="margin-bottom:12px;">
              <label style="display:block;font-size:12px;margin-bottom:4px;font-weight:600;">
                Tag
              </label>
              <input type="text" id="muralTag" value="${aviso.tag || ""}" 
                style="width:100%;padding:8px 12px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:14px;min-height:40px;">
            </div>

            <div class="form-group" style="margin-bottom:12px;">
              <label style="display:block;font-size:12px;margin-bottom:4px;font-weight:600;">
                Conteúdo <span class="required">*</span>
              </label>
              <textarea id="muralConteudo" rows="4" 
                style="width:100%;padding:8px 12px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:14px;min-height:80px;resize:vertical;">${aviso.conteudo}</textarea>
            </div>

            <div class="form-group" style="margin-bottom:12px;display:flex;align-items:center;gap:8px;">
              <input type="checkbox" id="muralPrioridade" ${aviso.prioridade ? "checked" : ""} 
                style="width:18px;height:18px;accent-color:var(--erro);">
              <label style="font-size:12px;font-weight:700;color:var(--erro);">🚨 Aviso Prioritário (Urgente)</label>
            </div>

            <div style="display:flex;gap:8px;margin-top:16px;">
              <button type="button" onclick="window._muralSalvarEdicao('${id}')" class="btn-primary" style="flex:2;border-radius:12px;min-height:44px;">
                <i class="fas fa-save"></i> Salvar
              </button>
              <button type="button" onclick="window._muralRecarregar()" class="btn-secondary" style="flex:1;border-radius:12px;min-height:44px;">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    window._muralSalvarEdicao = async (editId) => {
      const titulo = document.getElementById("muralTitulo")?.value?.trim();
      const tipo = document.getElementById("muralTipo")?.value;
      const conteudo = document.getElementById("muralConteudo")?.value?.trim();
      const prioridade =
        document.getElementById("muralPrioridade")?.checked || false;
      const localizacao =
        document.getElementById("muralLocalizacao")?.value?.trim() || "";
      const tag = document.getElementById("muralTag")?.value?.trim() || "";

      if (!titulo || !conteudo) {
        if (appInstance && appInstance.showToast) {
          appInstance.showToast(
            "Título e conteúdo são obrigatórios",
            "warning",
          );
        }
        return;
      }

      try {
        const { error } = await client
          .from("mural_avisos")
          .update({
            titulo,
            tipo,
            conteudo,
            prioridade,
            localizacao: localizacao,
            tag: tag,
            atualizado_em: new Date().toISOString(),
          })
          .eq("id", editId);

        if (error) throw error;

        if (appInstance && appInstance.showToast) {
          appInstance.showToast("Aviso atualizado com sucesso!", "success");
        }

        await renderMural(container, appInstance);
      } catch (error) {
        console.error("Erro ao salvar edição:", error);
        if (appInstance && appInstance.showToast) {
          appInstance.showToast("Erro ao salvar: " + error.message, "error");
        }
      }
    };
  } catch (error) {
    console.error("Erro ao carregar aviso para edição:", error);
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Erro ao carregar aviso", "error");
    }
  }
}

// ============================================
// DELETAR AVISO
// ============================================

export async function deletarAvisoMural(id, container, appInstance) {
  const confirmado = await confirmarModal(
    "Tem certeza que deseja excluir este aviso?\n\nEsta ação não pode ser desfeita.",
    "Confirmar Exclusão",
  );

  if (!confirmado) return;

  try {
    const client =
      typeof supabaseClient !== "undefined" ? supabaseClient.getClient() : null;
    if (!client) {
      if (appInstance && appInstance.showToast) {
        appInstance.showToast("Erro ao conectar", "error");
      }
      return;
    }

    const { error } = await client.from("mural_avisos").delete().eq("id", id);

    if (error) throw error;

    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Aviso excluído com sucesso!", "success");
    }

    await renderMural(container, appInstance);
  } catch (error) {
    console.error("Erro ao excluir aviso:", error);
    if (appInstance && appInstance.showToast) {
      appInstance.showToast("Erro ao excluir aviso: " + error.message, "error");
    }
  }
}

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

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

    overlay.innerHTML = `
      <div class="modal" style="max-width:380px;width:100%;background:var(--branco);border-radius:16px;box-shadow:var(--sombra-forte);">
        <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px 8px 14px;border-bottom:1px solid var(--cinza-claro);">
          <div class="title" style="font-size:15px;font-weight:700;color:var(--azul-bandeira);">
            <i class="fas fa-question-circle" style="margin-right:6px;"></i>
            ${titulo}
          </div>
          <button type="button" class="close-btn" onclick="this.closest('.modal-overlay').remove(); window._confirmModalResolve(false);" 
            style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--cinza-medio);padding:2px 6px;border-radius:50%;">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body" style="padding:12px 14px;">
          <p style="font-size:14px;color:var(--cinza-escuro);margin:0;text-align:center;line-height:1.6;white-space:pre-wrap;">${mensagem}</p>
        </div>
        <div class="modal-footer" style="padding:10px 14px 12px 14px;border-top:1px solid var(--cinza-claro);display:flex;flex-direction:row;gap:8px;">
          <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove(); window._confirmModalResolve(false);" 
            style="flex:1;padding:8px 14px;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;border:none;min-height:36px;background:var(--cinza-claro);color:var(--cinza-escuro);">
            Cancelar
          </button>
          <button type="button" class="btn-primary" onclick="this.closest('.modal-overlay').remove(); window._confirmModalResolve(true);" 
            style="flex:1;padding:8px 14px;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;border:none;min-height:36px;background:var(--gradiente-principal);color:var(--branco);">
            <i class="fas fa-check" style="margin-right:4px;"></i> Confirmar
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

// ============================================
// EXPORTAÇÕES
// ============================================

export default {
  renderMural,
  carregarAvisosMural,
  aplicarFiltros,
  limparFiltros,
  filtrarPorCategoria,
  abrirFormularioMural,
  salvarAvisoMural,
  editarAvisoMural,
  deletarAvisoMural,
  toggleReacao,
  adicionarComentario,
  verTodosComentarios,
  verMaisConteudo,
  compartilharAviso,
  verImagensAviso,
  atualizarBadgeMural,
  marcarMuralComoLido,
};
