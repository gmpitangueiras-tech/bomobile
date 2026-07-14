/**
 * MÓDULO DETALHE OCORRÊNCIA - Visualização e Ações
 * Guarda Municipal de Pitangueiras - PR
 *
 * Este módulo gerencia:
 * - Visualização completa de uma ocorrência
 * - Exibição de dados da solicitação, ocorrência, envolvidos e anexos
 * - Ações disponíveis: editar, finalizar, cancelar, solicitar retificação
 * - Aprovação/rejeição de retificações (supervisor)
 * - Histórico de versões
 * - Exibição de campos alterados em retificações
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
// FUNÇÃO PRINCIPAL
// ============================================

/**
 * Renderiza a página de detalhe de uma ocorrência
 * @param {HTMLElement} container - Elemento onde renderizar
 * @param {Object} appInstance - Instância do app
 */
export async function renderDetalheOcorrencia(container, appInstance) {
  const id = appInstance.currentParams?.id;

  if (!id) {
    container.innerHTML = `
      <div class="container" style="text-align:center;padding:40px 20px;">
        <div style="font-size:48px;color:var(--cinza-claro);margin-bottom:12px;">
          <i class="fas fa-exclamation-triangle"></i>
        </div>
        <h3>Ocorrência não encontrada</h3>
        <button onclick="app.navigateTo('dashboard')" class="btn-primary" style="margin-top:16px;">
          Voltar
        </button>
      </div>
    `;
    return;
  }

  // Mostrar loader
  container.innerHTML = `
    <div class="container" style="text-align:center;padding:40px 20px;">
      <div class="spinner-azul" style="margin:0 auto;"></div>
      <p style="margin-top:12px;color:var(--cinza-medio);">Carregando ocorrência...</p>
    </div>
  `;

  try {
    // Buscar ocorrência
    const result = await ocorrenciaManager.buscar(id);
    if (!result.success || !result.data) {
      container.innerHTML = `
        <div class="container" style="text-align:center;padding:40px 20px;">
          <div style="font-size:48px;color:var(--cinza-claro);margin-bottom:12px;">
            <i class="fas fa-exclamation-triangle"></i>
          </div>
          <h3>Ocorrência não encontrada</h3>
          <p style="color:var(--cinza-medio);">${result.error || "ID inválido"}</p>
          <button onclick="app.navigateTo('dashboard')" class="btn-primary" style="margin-top:16px;">
            Voltar
          </button>
        </div>
      `;
      return;
    }

    const occ = result.data;

    // Buscar envolvidos
    const envolvidosResult = await ocorrenciaManager.listarEnvolvidos(id);
    const envolvidos = envolvidosResult.success ? envolvidosResult.data : [];

    // Buscar anexos
    const anexosResult = await ocorrenciaManager.listarAnexos(id);
    const anexos = anexosResult.success ? anexosResult.data : [];

    // Verificar se é retificação
    const isRetificacao = occ.ocorrencia_original_id !== null;
    let original = null;
    let camposAlterados = [];

    if (isRetificacao) {
      const origResult = await ocorrenciaManager.buscar(
        occ.ocorrencia_original_id,
      );
      if (origResult.success) {
        original = origResult.data;
      }
      if (occ.campos_alterados) {
        try {
          camposAlterados = JSON.parse(occ.campos_alterados);
        } catch (e) {
          console.warn("Erro ao parsear campos alterados:", e);
        }
      }
    }

    // Verificar permissões
    const podeEditar = authManager.podeEditar(occ);
    const podeCancelar = authManager.podeCancelar(occ);
    const podeFinalizar = authManager.podeFinalizar(occ);
    const podeRetificar = authManager.podeSolicitarRetificacao(occ);
    const podeVerHistorico = authManager.podeVerHistorico(occ);
    const isSupervisor = authManager.isSupervisor();

    // Verificar se tem retificações
    const temRetificacoes = await ocorrenciaManager.temRetificacoes(id);

    // Buscar dados do criador
    let criadorNome = "Desconhecido";
    let criadorCPF = "";
    if (occ.criado_por) {
      try {
        const client = supabaseClient.getClient();
        if (client) {
          const { data: criador } = await client
            .from("usuarios")
            .select("nome_completo, cpf")
            .eq("id", occ.criado_por)
            .single();
          if (criador) {
            criadorNome = criador.nome_completo;
            criadorCPF = criador.cpf;
          }
        }
      } catch (error) {
        console.warn("Erro ao buscar dados do criador:", error);
      }
    }

    const cpfExibido = formatarCPFSeguro(criadorCPF);

    // Renderizar
    renderizarDetalhe(
      container,
      occ,
      original,
      envolvidos,
      anexos,
      camposAlterados,
      {
        isRetificacao,
        temRetificacoes,
        podeEditar,
        podeCancelar,
        podeFinalizar,
        podeRetificar,
        podeVerHistorico,
        isSupervisor,
        criadorNome,
        cpfExibido,
      },
      appInstance,
    );

    // Registrar funções globais
    window._detalheFinalizar = (id) => finalizarOcorrencia(id, appInstance);
    window._detalheCancelar = (id) => cancelarOcorrencia(id, appInstance);
    window._detalheSolicitarRetificacao = (id) =>
      solicitarRetificacao(id, appInstance);
    window._detalheAprovarRetificacao = (id) =>
      aprovarRetificacao(id, appInstance);
    window._detalheRejeitarRetificacao = (id) =>
      rejeitarRetificacao(id, appInstance);
    window._detalheVerHistorico = (id) => verHistorico(id, appInstance);
    window._detalheEditar = (id) => editarOcorrencia(id, appInstance);
  } catch (error) {
    console.error("❌ Erro ao carregar detalhe:", error);
    container.innerHTML = `
      <div class="container" style="text-align:center;padding:40px 20px;">
        <div style="font-size:48px;color:var(--erro);margin-bottom:12px;">
          <i class="fas fa-exclamation-triangle"></i>
        </div>
        <h3>Erro ao carregar ocorrência</h3>
        <p style="color:var(--cinza-medio);">${error.message}</p>
        <button onclick="app.navigateTo('dashboard')" class="btn-primary" style="margin-top:16px;">
          Voltar
        </button>
      </div>
    `;
  }
}

// ============================================
// RENDERIZAÇÃO DO DETALHE
// ============================================

function renderizarDetalhe(
  container,
  occ,
  original,
  envolvidos,
  anexos,
  camposAlterados,
  perms,
  appInstance,
) {
  const {
    isRetificacao,
    temRetificacoes,
    podeEditar,
    podeCancelar,
    podeFinalizar,
    podeRetificar,
    podeVerHistorico,
    isSupervisor,
    criadorNome,
    cpfExibido,
  } = perms;

  const numero = occ.numero_ocorrencia || occ.numero_temporario || "Rascunho";
  const statusClass = getStatusClass(occ.status);
  const statusLabel = getStatusLabel(occ.status);
  const dataCriacao = formatarDataHoraLocal(occ.criado_em);
  const dataInicio = occ.data_hora_inicio
    ? formatarDataHoraLocal(occ.data_hora_inicio)
    : "Não informado";
  const dataEncerramento = occ.data_hora_encerramento
    ? formatarDataHoraLocal(occ.data_hora_encerramento)
    : "Não informado";
  const versaoInfo = isRetificacao
    ? `Retificação v${occ.numero_versao || 1}`
    : temRetificacoes
      ? "Versão Original (substituída)"
      : "";
  const isPending = occ.status === "pending_rectification";

  let html = `
    <div class="container" style="padding-bottom:120px;">
      <!-- Cabeçalho -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;flex-wrap:wrap;gap:8px;">
        <div>
          <h2 style="color:var(--azul-bandeira);margin:0;font-size:18px;">
            <i class="fas fa-file-alt" style="margin-right:8px;"></i>
            #${numero}
          </h2>
          <div style="font-size:12px;color:var(--cinza-medio);margin-top:4px;display:flex;flex-wrap:wrap;gap:12px;">
            <span><i class="fas fa-user" style="margin-right:4px;"></i>
              <strong>${criadorNome}</strong>
            </span>
            <span><i class="fas fa-shield-alt" style="margin-right:4px;"></i>${cpfExibido}</span>
            ${
              occ.latitude && occ.longitude
                ? `
              <span>
                <i class="fas fa-map-pin" style="margin-right:4px;"></i>
                📍 ${parseFloat(occ.latitude).toFixed(6)}, ${parseFloat(occ.longitude).toFixed(6)}
              </span>
            `
                : ""
            }
            ${
              occ.hash_pericial
                ? `
              <span title="Hash Pericial SHA-256" style="cursor:help;">
                <i class="fas fa-fingerprint" style="margin-right:4px;color:var(--verde-bandeira);"></i>
                <span style="font-family:monospace;font-size:10px;">${occ.hash_pericial.substring(0, 16)}...</span>
              </span>
            `
                : ""
            }
          </div>
          <div style="font-size:11px;color:var(--cinza-medio);margin-top:2px;">
            <i class="fas fa-calendar" style="margin-right:4px;"></i>
            Criado em ${dataCriacao}
            ${occ.numero_versao > 1 ? ` • v${occ.numero_versao}` : ""}
          </div>
        </div>
        <span class="badge badge-${statusClass}" style="font-size:13px;padding:4px 16px;white-space:nowrap;">
          ${statusLabel}
        </span>
      </div>

      ${isPending ? renderAlertaPendente(occ) : ""}
      ${isRetificacao && occ.justificativa_retificacao ? renderJustificativaRetificacao(occ) : ""}
      ${isRetificacao && original ? renderVersaoOriginal(occ, original, camposAlterados, appInstance) : ""}

      <!-- Dados da Solicitação -->
      ${renderDadosSolicitacao(occ)}

      <!-- Dados da Ocorrência -->
      ${renderDadosOcorrencia(occ, dataInicio, dataEncerramento, versaoInfo)}

      <!-- Envolvidos -->
      ${renderEnvolvidos(envolvidos)}

      <!-- Observações -->
      ${occ.observacoes && occ.observacoes.trim() !== "" ? renderObservacoes(occ.observacoes) : ""}

      <!-- Anexos -->
      ${renderAnexos(anexos)}

      <!-- Ações -->
      ${renderAcoes(
        occ,
        {
          podeEditar,
          podeCancelar,
          podeFinalizar,
          podeRetificar,
          podeVerHistorico,
          isSupervisor,
          isPending,
          isRetificacao,
          temRetificacoes,
        },
        appInstance,
      )}
    </div>
  `;

  container.innerHTML = html;
}

// ============================================
// RENDERIZAÇÃO DE SEÇÕES
// ============================================

function renderAlertaPendente(occ) {
  return `
    <div style="background:#fef3c7;padding:12px 16px;border-radius:var(--border-radius);border-left:4px solid var(--aviso);margin-bottom:16px;">
      <p style="font-size:13px;font-weight:600;margin:0 0 4px 0;color:#92400e;">
        <i class="fas fa-clock" style="margin-right:6px;"></i>
        Solicitação de Retificação Pendente
      </p>
      <p style="font-size:14px;color:#92400e;margin:0;">
        ${occ.solicitacao_retificacao_justificativa || "Aguardando análise do supervisor."}
      </p>
    </div>
  `;
}

function renderJustificativaRetificacao(occ) {
  return `
    <div style="background:var(--azul-muito-claro);padding:12px 16px;border-radius:var(--border-radius);border-left:4px solid var(--azul-bandeira);margin-bottom:16px;">
      <p style="font-size:13px;font-weight:600;margin:0 0 4px 0;color:var(--azul-bandeira);">
        <i class="fas fa-quote-left" style="margin-right:6px;"></i>
        Justificativa da Retificação
      </p>
      <p style="font-size:14px;color:var(--cinza-escuro);margin:0;">
        ${occ.justificativa_retificacao}
      </p>
    </div>
  `;
}

function renderVersaoOriginal(occ, original, camposAlterados, appInstance) {
  let html = `
    <div style="background:var(--verde-muito-claro);padding:12px 16px;border-radius:var(--border-radius);border-left:4px solid var(--verde-bandeira);margin-bottom:16px;">
      <p style="font-size:14px;font-weight:600;margin:0 0 6px 0;color:var(--verde-escuro);">
        <i class="fas fa-code-branch" style="margin-right:6px;"></i>
        Esta é uma retificação da ocorrência #${original.numero_ocorrencia || original.numero_temporario || "original"}
      </p>
      <p style="font-size:13px;color:var(--cinza-escuro);margin:0;">
        Status: ${getStatusLabel(occ.status)} 
        ${
          occ.status === "pending_rectification"
            ? "⏳ Aguardando aprovação"
            : occ.status === "rectified"
              ? "✅ Aprovada"
              : occ.status === "rectification_rejected"
                ? "❌ Rejeitada"
                : ""
        }
      </p>
    </div>
  `;

  if (camposAlterados.length > 0) {
    html += `
      <div style="margin-bottom:16px;">
        <h4 style="color:var(--azul-bandeira);font-size:14px;margin:0 0 8px 0;">
          <i class="fas fa-edit"></i> Campos Alterados
        </h4>
        <div style="background:var(--branco);border-radius:var(--border-radius);overflow:hidden;box-shadow:var(--sombra-suave);">
          ${camposAlterados
            .map(
              (campo) => `
            <div style="display:grid;grid-template-columns:1fr 2fr;gap:4px;padding:8px 12px;border-bottom:1px solid var(--cinza-claro);">
              <div style="font-weight:600;color:var(--cinza-escuro);font-size:13px;">
                ${campo.label || campo.campo}
              </div>
              <div style="display:flex;gap:8px;align-items:center;font-size:13px;flex-wrap:wrap;">
                <span style="color:var(--cinza-medio);text-decoration:line-through;font-size:12px;">
                  ${campo.antes || "(vazio)"}
                </span>
                <i class="fas fa-arrow-right" style="color:var(--cinza-medio);font-size:10px;"></i>
                <span style="color:var(--verde-bandeira);font-weight:500;">
                  ${campo.depois || "(vazio)"}
                </span>
              </div>
            </div>
          `,
            )
            .join("")}
        </div>
      </div>
    `;
  }

  html += `
    <div class="card-revisao" style="margin-bottom:12px;opacity:0.8;">
      <h4 style="font-size:14px;color:var(--cinza-medio);margin:0 0 8px 0;">
        <i class="fas fa-history"></i> Versão Original (para referência)
      </h4>
      <div class="campo"><span class="rotulo">Local:</span><span class="valor">${original.local_ocorrencia || "Não informado"}</span></div>
      <div class="campo"><span class="rotulo">Data/Hora Início:</span><span class="valor">${formatarDataHoraLocal(original.data_hora_inicio)}</span></div>
      <div class="campo"><span class="rotulo">Observações:</span><span class="valor" style="white-space:pre-wrap;">${original.observacoes || "Nenhuma"}</span></div>
      <button class="btn-secondary" style="margin-top:6px;padding:4px 12px;font-size:12px;min-height:auto;width:auto;border-radius:8px;" 
        onclick="app.navigateTo('detalhe-ocorrencia', {id: '${original.id}'})">
        <i class="fas fa-eye"></i> Ver versão original completa
      </button>
    </div>
  `;

  return html;
}

function renderDadosSolicitacao(occ) {
  const camposSolicitacao = [
    { label: "Forma de Solicitação", valor: occ.forma_solicitacao },
    { label: "Nome do Solicitante", valor: occ.nome_solicitante || "Anônimo" },
    {
      label: "CPF do Solicitante",
      valor: occ.cpf_solicitante || "Não informado",
    },
    {
      label: "RG do Solicitante",
      valor: occ.rg_solicitante || "Não informado",
    },
    {
      label: "Telefone do Solicitante",
      valor: occ.telefone_solicitante || "Não informado",
    },
    {
      label: "Endereço do Solicitante",
      valor: occ.endereco_solicitante || "Não informado",
    },
    {
      label: "Bairro do Solicitante",
      valor: occ.bairro_solicitante || "Não informado",
    },
    { label: "Complemento", valor: occ.complemento || "Não informado" },
    {
      label: "Código Municipal",
      valor: occ.codigo_municipal || "Não informado",
    },
    {
      label: "Identificação Adicional",
      valor: occ.identificacao_adicional || "Não informado",
    },
  ];

  const preenchidos = camposSolicitacao.filter(
    (c) => c.valor && c.valor !== "Não informado" && c.valor !== "Anônimo",
  );

  if (preenchidos.length === 0) return "";

  return `
    <div class="card-revisao" style="margin-top:12px;">
      <h4 style="font-size:14px;color:var(--azul-bandeira);margin:0 0 8px 0;">
        <i class="fas fa-phone-alt"></i> Dados da Solicitação
      </h4>
      ${preenchidos
        .map(
          (c) => `
        <div class="campo"><span class="rotulo">${c.label}:</span><span class="valor">${c.valor}</span></div>
      `,
        )
        .join("")}
    </div>
  `;
}

function renderDadosOcorrencia(occ, dataInicio, dataEncerramento, versaoInfo) {
  const camposOcorrencia = [
    {
      label: "Tipo de Ocorrência",
      valor: occ.tipo_ocorrencia
        ? getTipoLabel(occ.tipo_ocorrencia)
        : "Não informado",
    },
    {
      label: "Local da Ocorrência",
      valor: occ.local_ocorrencia || "Não informado",
    },
    { label: "Rodovia", valor: occ.rodovia || "Não informado" },
    {
      label: "Bairro da Ocorrência",
      valor: occ.bairro_ocorrencia || "Não informado",
    },
    { label: "Referência", valor: occ.referencia || "Não informado" },
    {
      label: "Código Operacional",
      valor: occ.codigo_operacional || "Não informado",
    },
    { label: "Data/Hora Início", valor: dataInicio },
    { label: "Data/Hora Encerramento", valor: dataEncerramento },
    { label: "Versão", valor: occ.numero_versao || 1 },
    { label: "Status da Versão", valor: versaoInfo || "Versão atual" },
  ];

  return `
    <div class="card-revisao">
      <h4 style="font-size:14px;color:var(--azul-bandeira);margin:0 0 8px 0;">
        <i class="fas fa-map-marker-alt"></i> Dados da Ocorrência
      </h4>
      ${camposOcorrencia
        .map(
          (c) => `
        <div class="campo"><span class="rotulo">${c.label}:</span><span class="valor">${c.valor}</span></div>
      `,
        )
        .join("")}
    </div>
  `;
}

function renderEnvolvidos(envolvidos) {
  let html = `
    <div class="card-revisao">
      <h4 style="font-size:14px;color:var(--azul-bandeira);margin:0 0 8px 0;">
        <i class="fas fa-users"></i> Envolvidos (${envolvidos.length})
      </h4>
  `;

  if (envolvidos.length === 0) {
    html += `
      <div style="text-align:center;padding:20px;color:var(--cinza-medio);font-size:14px;">
        <i class="fas fa-users" style="font-size:24px;display:block;margin-bottom:8px;color:var(--cinza-claro);"></i>
        Nenhum envolvido cadastrado
      </div>
    `;
  } else {
    envolvidos.forEach((env) => {
      html += `
        <div class="envolvido-item-modern">
          <div class="header">
            <span class="badge badge-azul">
              <i class="fas fa-user" style="margin-right:4px;"></i>
              ${getTipoEnvolvidoLabel(env.tipo)}
            </span>
            <span class="nome">${env.nome_completo || "Nome não informado"}</span>
          </div>
          <div class="detalhes-grid">
            ${
              env.cpf
                ? `
              <div class="campo">
                <i class="fas fa-id-card"></i>
                <span class="label">CPF:</span>
                <span class="valor">${env.cpf}</span>
              </div>
            `
                : ""
            }
            ${
              env.rg
                ? `
              <div class="campo">
                <i class="fas fa-address-card"></i>
                <span class="label">RG:</span>
                <span class="valor">${env.rg}</span>
              </div>
            `
                : ""
            }
            ${
              env.telefone
                ? `
              <div class="campo">
                <i class="fas fa-phone"></i>
                <span class="label">Tel:</span>
                <span class="valor">${env.telefone}</span>
              </div>
            `
                : ""
            }
            ${
              env.data_nascimento
                ? `
              <div class="campo">
                <i class="fas fa-calendar-alt"></i>
                <span class="label">Nasc:</span>
                <span class="valor">${new Date(env.data_nascimento).toLocaleDateString("pt-BR")}</span>
              </div>
            `
                : ""
            }
            ${
              env.endereco
                ? `
              <div class="campo">
                <i class="fas fa-map-marker-alt"></i>
                <span class="label">End:</span>
                <span class="valor">${env.endereco}</span>
              </div>
            `
                : ""
            }
            ${
              env.bairro
                ? `
              <div class="campo">
                <i class="fas fa-location-dot"></i>
                <span class="label">Bairro:</span>
                <span class="valor">${env.bairro}</span>
              </div>
            `
                : ""
            }
            ${
              env.cidade
                ? `
              <div class="campo">
                <i class="fas fa-city"></i>
                <span class="label">Cidade:</span>
                <span class="valor">${env.cidade}</span>
              </div>
            `
                : ""
            }
            ${
              env.observacoes
                ? `
              <div class="campo" style="grid-column: 1 / -1;">
                <i class="fas fa-pencil-alt"></i>
                <span class="label">Obs:</span>
                <span class="valor">${env.observacoes}</span>
              </div>
            `
                : ""
            }
          </div>
        </div>
      `;
    });
  }

  html += `</div>`;
  return html;
}

function renderObservacoes(observacoes) {
  return `
    <div class="card-revisao">
      <h4 style="font-size:14px;color:var(--azul-bandeira);margin:0 0 8px 0;">
        <i class="fas fa-pencil-alt"></i> Observações
      </h4>
      <p style="font-size:14px;white-space:pre-wrap;margin:0;">${observacoes}</p>
    </div>
  `;
}

function renderAnexos(anexos) {
  let html = `
    <div class="card-revisao">
      <h4 style="font-size:14px;color:var(--azul-bandeira);margin:0 0 8px 0;">
        <i class="fas fa-paperclip"></i> Anexos (${anexos.length})
      </h4>
  `;

  if (anexos.length === 0) {
    html += `<p style="color:var(--cinza-medio);font-size:14px;">Nenhum anexo adicionado</p>`;
  } else {
    anexos.forEach((anexo) => {
      const iconClass = getIconAnexo(anexo.tipo_arquivo);
      const tamanho = formatarTamanho(anexo.tamanho || 0);
      html += `
        <div style="font-size:14px;padding:6px 0;border-bottom:1px solid var(--cinza-claro);display:flex;align-items:center;gap:10px;">
          <i class="fas ${iconClass}" style="color:var(--azul-bandeira);font-size:18px;"></i>
          <span style="flex:1;">${anexo.nome_arquivo}</span>
          <span style="color:var(--cinza-medio);font-size:12px;">${tamanho}</span>
          ${anexo.url ? `<a href="${anexo.url}" target="_blank" style="color:var(--azul-bandeira);"><i class="fas fa-external-link-alt"></i></a>` : ""}
        </div>
      `;
    });
  }

  html += `</div>`;
  return html;
}

// ============================================
// AÇÕES
// ============================================

function renderAcoes(occ, perms, appInstance) {
  const {
    podeEditar,
    podeCancelar,
    podeFinalizar,
    podeRetificar,
    podeVerHistorico,
    isSupervisor,
    isPending,
    isRetificacao,
    temRetificacoes,
  } = perms;

  const id = occ.id;

  let html = `
    <div style="margin-top:24px;display:flex;flex-direction:column;gap:10px;">
  `;

  // Aprovar/Rejeitar retificação (apenas supervisor)
  if (isSupervisor && isPending) {
    html += `
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn-success" onclick="window._detalheAprovarRetificacao('${id}')" style="flex:1;min-width:120px;border-radius:12px;">
          <i class="fas fa-check" style="margin-right:6px;"></i> Aprovar Retificação
        </button>
        <button class="btn-danger" onclick="window._detalheRejeitarRetificacao('${id}')" style="flex:1;min-width:120px;border-radius:12px;">
          <i class="fas fa-times" style="margin-right:6px;"></i> Rejeitar Retificação
        </button>
      </div>
    `;
  }

  // Finalizar
  if (podeFinalizar) {
    html += `
      <button class="btn-success" onclick="window._detalheFinalizar('${id}')" style="border-radius:12px;">
        <i class="fas fa-check-circle" style="margin-right:6px;"></i> Finalizar Ocorrência
      </button>
    `;
  }

  // Solicitar retificação
  if (podeRetificar && occ.status === "synced") {
    html += `
      <button class="btn-primary" onclick="window._detalheSolicitarRetificacao('${id}')" style="background:var(--azul-bandeira);border-radius:12px;">
        <i class="fas fa-sync-alt" style="margin-right:6px;"></i> Solicitar Retificação
      </button>
    `;
  }

  // Editar (apenas rascunho)
  if (podeEditar && occ.status === "draft") {
    html += `
      <button class="btn-primary" onclick="window._detalheEditar('${id}')" style="border-radius:12px;">
        <i class="fas fa-edit" style="margin-right:6px;"></i> Editar Ocorrência
      </button>
    `;
  }

  // Cancelar (apenas supervisor)
  if (podeCancelar) {
    html += `
      <button class="btn-danger" onclick="window._detalheCancelar('${id}')" style="border-radius:12px;">
        <i class="fas fa-times-circle" style="margin-right:6px;"></i> Cancelar Ocorrência
      </button>
    `;
  }

  // Ver histórico
  if (podeVerHistorico && (temRetificacoes || isRetificacao)) {
    html += `
      <button class="btn-secondary" onclick="window._detalheVerHistorico('${id}')" style="background:var(--azul-muito-claro);color:var(--azul-bandeira);border:1px solid var(--azul-bandeira);border-radius:12px;">
        <i class="fas fa-history" style="margin-right:6px;"></i> Ver Histórico
      </button>
    `;
  }

  // Voltar
  html += `
    <button class="btn-secondary" onclick="app.navigateTo('dashboard')" style="width:100%;border-radius:12px;">
      <i class="fas fa-arrow-left" style="margin-right:6px;"></i> Voltar
    </button>
  `;

  html += `</div>`;
  return html;
}

// ============================================
// AÇÕES - IMPLEMENTAÇÕES
// ============================================

async function finalizarOcorrencia(id, appInstance) {
  const confirmado = await appInstance.confirmar(
    "Deseja finalizar esta ocorrência?",
  );
  if (!confirmado) return;

  // Obter data/hora atual para encerramento
  const agora = new Date();
  const timezoneOffset = agora.getTimezoneOffset();
  const adjustedDate = new Date(agora.getTime() - timezoneOffset * 60000);
  const dataEncerramento = adjustedDate.toISOString();

  const result = await ocorrenciaManager.atualizar(id, {
    status: "synced",
    data_hora_encerramento: dataEncerramento,
  });

  if (result.success) {
    appInstance.showToast("Ocorrência finalizada com sucesso!", "success");
    await authManager.logFinalizarOcorrencia(authManager.getUserId(), id);

    // Recarregar detalhe
    const container = document.getElementById("detalheOcorrenciaContent");
    if (container) renderDetalheOcorrencia(container, appInstance);
  } else {
    appInstance.showToast("Erro ao finalizar: " + result.error, "error");
  }
}

async function cancelarOcorrencia(id, appInstance) {
  const motivo = await appInstance.inputModal(
    "Informe o motivo do cancelamento:",
    "Cancelar Ocorrência",
    "Digite o motivo do cancelamento...",
  );

  if (!motivo) {
    appInstance.showToast("Operação cancelada", "info");
    return;
  }

  const confirmado = await appInstance.confirmar(
    `Deseja realmente cancelar esta ocorrência?\n\nMotivo: ${motivo}`,
  );
  if (!confirmado) return;

  const result = await ocorrenciaManager.cancelar(id, motivo);

  if (result.success) {
    appInstance.showToast("Ocorrência cancelada com sucesso!", "success");
    await authManager.logCancelarOcorrencia(
      authManager.getUserId(),
      id,
      motivo,
    );

    const container = document.getElementById("detalheOcorrenciaContent");
    if (container) renderDetalheOcorrencia(container, appInstance);
  } else {
    appInstance.showToast("Erro ao cancelar: " + result.error, "error");
  }
}

async function solicitarRetificacao(id, appInstance) {
  // Buscar dados da ocorrência
  const result = await ocorrenciaManager.buscar(id);
  if (!result.success || !result.data) {
    appInstance.showToast("Ocorrência não encontrada", "error");
    return;
  }

  const occ = result.data;

  // Buscar envolvidos para exibição
  const envolvidosResult = await ocorrenciaManager.listarEnvolvidos(id);
  const envolvidos = envolvidosResult.success ? envolvidosResult.data : [];

  const dataInicio = occ.data_hora_inicio
    ? formatarDataHoraLocal(occ.data_hora_inicio)
    : "Não informado";
  const dataEncerramento = occ.data_hora_encerramento
    ? formatarDataHoraLocal(occ.data_hora_encerramento)
    : "Não informado";

  // Criar modal de solicitação
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
    <div class="modal" style="max-width:650px;width:100%;max-height:95vh;overflow-y:auto;">
      <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px 10px 16px;border-bottom:1px solid var(--cinza-claro);position:sticky;top:0;background:var(--branco);border-radius:20px 20px 0 0;z-index:1;">
        <div class="title" style="font-size:16px;font-weight:700;color:var(--azul-bandeira);">
          <i class="fas fa-sync-alt" style="margin-right:8px;"></i>
          Solicitar Retificação
        </div>
        <button type="button" class="close-btn" onclick="this.closest('.modal-overlay').remove()" 
          style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--cinza-medio);padding:4px 8px;border-radius:50%;transition:all 0.3s ease;">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="modal-body" style="padding:14px 16px 4px 16px;max-height:70vh;overflow-y:auto;">
        <p style="color:var(--cinza-medio);font-size:14px;margin-bottom:16px;">
          Preencha apenas os campos que precisam ser corrigidos.
          <strong>Campos imutáveis</strong> (data/hora, número, forma de solicitação) não podem ser alterados.
        </p>

        <div style="background:var(--verde-muito-claro);padding:12px;border-radius:var(--border-radius);margin-bottom:16px;border-left:4px solid var(--verde-bandeira);">
          <p style="font-size:13px;color:var(--verde-escuro);margin:0;">
            <i class="fas fa-info-circle" style="margin-right:6px;"></i>
            A retificação criará uma nova versão da ocorrência. A versão original será mantida como histórico.
            <br><strong>Data/Hora do fato não podem ser alteradas</strong> - são registros históricos.
          </p>
        </div>

        <div style="background:var(--cinza-claro);padding:12px;border-radius:var(--border-radius);margin-bottom:16px;opacity:0.7;">
          <p style="font-weight:600;font-size:13px;color:var(--cinza-escuro);margin-bottom:8px;">
            <i class="fas fa-lock" style="margin-right:6px;"></i>
            Dados Imutáveis (apenas para referência)
          </p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">
            <div><strong>Número:</strong> ${occ.numero_ocorrencia || occ.numero_temporario || "Rascunho"}</div>
            <div><strong>Forma de Solicitação:</strong> ${occ.forma_solicitacao || "Não informado"}</div>
            <div><strong>Data/Hora Início:</strong> ${dataInicio}</div>
            <div><strong>Data/Hora Encerramento:</strong> ${dataEncerramento}</div>
            <div><strong>Criado por:</strong> ${occ.criador?.nome_completo || "Desconhecido"}</div>
            <div><strong>Criado em:</strong> ${formatarDataHoraLocal(occ.criado_em)}</div>
          </div>
        </div>

        <form id="formRetificacao" onsubmit="event.preventDefault();">
          <div class="form-group" style="margin-bottom:14px;">
            <label for="ret_justificativa" style="display:block;font-size:13px;font-weight:600;color:var(--cinza-escuro);margin-bottom:4px;">
              <i class="fas fa-pencil-alt" style="margin-right:6px;"></i>
              Justificativa da Retificação <span class="required" style="color:var(--erro);">*</span>
            </label>
            <textarea id="ret_justificativa" class="form-control" rows="3" 
              placeholder="Explique o motivo da correção..." required
              style="width:100%;padding:10px 12px;border:2px solid var(--cinza-claro);border-radius:16px;font-size:14px;transition:all 0.3s ease;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;min-height:60px;resize:vertical;"></textarea>
            <div class="input-hint" style="font-size:11px;color:var(--cinza-medio);margin-top:3px;display:flex;align-items:center;gap:4px;">
              <i class="fas fa-info-circle" style="font-size:12px;"></i>
              Mínimo 10 caracteres
            </div>
          </div>

          <div style="border-top:1px solid var(--cinza-claro);padding-top:16px;margin-top:8px;">
            <p style="font-weight:600;font-size:14px;color:var(--cinza-escuro);margin-bottom:12px;">
              <i class="fas fa-edit" style="margin-right:6px;"></i>
              Dados que podem ser corrigidos
            </p>
            <p style="font-size:12px;color:var(--cinza-medio);margin-bottom:12px;">
              Deixe em branco os campos que NÃO precisam ser alterados
            </p>

            <!-- Dados do Solicitante -->
            <div style="background:var(--azul-muito-claro);padding:10px;border-radius:var(--border-radius);margin-bottom:12px;">
              <p style="font-weight:600;font-size:13px;color:var(--azul-bandeira);margin-bottom:8px;">
                <i class="fas fa-user" style="margin-right:6px;"></i> Dados do Solicitante
              </p>
              <div class="form-group" style="margin-bottom:10px;">
                <label for="ret_nome_solicitante" style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:2px;">Nome do Solicitante</label>
                <input type="text" id="ret_nome_solicitante" class="form-control" 
                  value="${occ.nome_solicitante || ""}" placeholder="Nome completo"
                  style="width:100%;padding:8px 10px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:13px;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;">
              </div>
              <div class="form-group" style="margin-bottom:10px;">
                <label for="ret_cpf_solicitante" style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:2px;">CPF do Solicitante</label>
                <input type="text" id="ret_cpf_solicitante" class="form-control" 
                  value="${occ.cpf_solicitante || ""}" placeholder="123.456.789-00"
                  style="width:100%;padding:8px 10px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:13px;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;">
              </div>
              <div class="form-group" style="margin-bottom:10px;">
                <label for="ret_rg_solicitante" style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:2px;">RG do Solicitante</label>
                <input type="text" id="ret_rg_solicitante" class="form-control" 
                  value="${occ.rg_solicitante || ""}" placeholder="RG do solicitante"
                  style="width:100%;padding:8px 10px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:13px;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;">
              </div>
              <div class="form-group" style="margin-bottom:10px;">
                <label for="ret_telefone_solicitante" style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:2px;">Telefone do Solicitante</label>
                <input type="text" id="ret_telefone_solicitante" class="form-control" 
                  value="${occ.telefone_solicitante || ""}" placeholder="(44) 99999-9999"
                  style="width:100%;padding:8px 10px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:13px;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;">
              </div>
              <div class="form-group" style="margin-bottom:10px;">
                <label for="ret_endereco_solicitante" style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:2px;">Endereço do Solicitante</label>
                <input type="text" id="ret_endereco_solicitante" class="form-control" 
                  value="${occ.endereco_solicitante || ""}" placeholder="Rua, número, bairro"
                  style="width:100%;padding:8px 10px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:13px;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;">
              </div>
              <div class="form-group" style="margin-bottom:10px;">
                <label for="ret_bairro_solicitante" style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:2px;">Bairro do Solicitante</label>
                <input type="text" id="ret_bairro_solicitante" class="form-control" 
                  value="${occ.bairro_solicitante || ""}" placeholder="Bairro"
                  style="width:100%;padding:8px 10px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:13px;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;">
              </div>
              <div class="form-group" style="margin-bottom:10px;">
                <label for="ret_complemento" style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:2px;">Complemento</label>
                <input type="text" id="ret_complemento" class="form-control" 
                  value="${occ.complemento || ""}" placeholder="Apto, bloco, ponto de referência"
                  style="width:100%;padding:8px 10px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:13px;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;">
              </div>
              <div class="form-group" style="margin-bottom:10px;">
                <label for="ret_identificacao_adicional" style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:2px;">Identificação Adicional</label>
                <input type="text" id="ret_identificacao_adicional" class="form-control" 
                  value="${occ.identificacao_adicional || ""}" placeholder="Informações adicionais"
                  style="width:100%;padding:8px 10px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:13px;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;">
              </div>
              <div class="form-group" style="margin-bottom:10px;">
                <label for="ret_codigo_municipal" style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:2px;">Código Municipal</label>
                <input type="text" id="ret_codigo_municipal" class="form-control" 
                  value="${occ.codigo_municipal || ""}" placeholder="Código do imóvel"
                  style="width:100%;padding:8px 10px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:13px;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;">
              </div>
            </div>

            <!-- Dados do Local -->
            <div style="background:var(--azul-muito-claro);padding:10px;border-radius:var(--border-radius);margin-bottom:12px;">
              <p style="font-weight:600;font-size:13px;color:var(--azul-bandeira);margin-bottom:8px;">
                <i class="fas fa-map-marker-alt" style="margin-right:6px;"></i> Dados do Local
              </p>
              <div class="form-group" style="margin-bottom:10px;">
                <label for="ret_local_ocorrencia" style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:2px;">Local da Ocorrência</label>
                <input type="text" id="ret_local_ocorrencia" class="form-control" 
                  value="${occ.local_ocorrencia || ""}" placeholder="Endereço completo"
                  style="width:100%;padding:8px 10px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:13px;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;">
              </div>
              <div class="form-group" style="margin-bottom:10px;">
                <label for="ret_rodovia" style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:2px;">Rodovia</label>
                <input type="text" id="ret_rodovia" class="form-control" 
                  value="${occ.rodovia || ""}" placeholder="BR-123, km 45"
                  style="width:100%;padding:8px 10px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:13px;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;">
              </div>
              <div class="form-group" style="margin-bottom:10px;">
                <label for="ret_bairro_ocorrencia" style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:2px;">Bairro da Ocorrência</label>
                <input type="text" id="ret_bairro_ocorrencia" class="form-control" 
                  value="${occ.bairro_ocorrencia || ""}" placeholder="Bairro"
                  style="width:100%;padding:8px 10px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:13px;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;">
              </div>
              <div class="form-group" style="margin-bottom:10px;">
                <label for="ret_referencia" style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:2px;">Referência</label>
                <input type="text" id="ret_referencia" class="form-control" 
                  value="${occ.referencia || ""}" placeholder="Ponto de referência próximo"
                  style="width:100%;padding:8px 10px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:13px;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;">
              </div>
            </div>

            <!-- Observações -->
            <div style="background:var(--azul-muito-claro);padding:10px;border-radius:var(--border-radius);margin-bottom:12px;">
              <p style="font-weight:600;font-size:13px;color:var(--azul-bandeira);margin-bottom:8px;">
                <i class="fas fa-pencil-alt" style="margin-right:6px;"></i> Observações
              </p>
              <div class="form-group" style="margin-bottom:10px;">
                <label for="ret_observacoes" style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:2px;">Observações</label>
                <textarea id="ret_observacoes" class="form-control" rows="4" 
                  placeholder="Complemente as informações da ocorrência"
                  style="width:100%;padding:8px 10px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:13px;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;min-height:60px;resize:vertical;">${occ.observacoes || ""}</textarea>
              </div>
            </div>

            <!-- Código Operacional -->
            <div style="background:var(--azul-muito-claro);padding:10px;border-radius:var(--border-radius);margin-bottom:12px;">
              <p style="font-weight:600;font-size:13px;color:var(--azul-bandeira);margin-bottom:8px;">
                <i class="fas fa-barcode" style="margin-right:6px;"></i> Dados Operacionais
              </p>
              <div class="form-group" style="margin-bottom:10px;">
                <label for="ret_codigo_operacional" style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:2px;">Código Operacional</label>
                <input type="text" id="ret_codigo_operacional" class="form-control" 
                  value="${occ.codigo_operacional || ""}" placeholder="Código da ocorrência"
                  style="width:100%;padding:8px 10px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:13px;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;">
              </div>
            </div>

            <!-- Tipo de Ocorrência -->
            <div style="background:var(--azul-muito-claro);padding:10px;border-radius:var(--border-radius);margin-bottom:12px;">
              <p style="font-weight:600;font-size:13px;color:var(--azul-bandeira);margin-bottom:8px;">
                <i class="fas fa-tag" style="margin-right:6px;"></i> Tipo de Ocorrência
              </p>
              <div class="form-group" style="margin-bottom:10px;">
                <label for="ret_tipo_ocorrencia" style="display:block;font-size:12px;font-weight:600;color:var(--cinza-escuro);margin-bottom:2px;">Tipo de Ocorrência</label>
                <select id="ret_tipo_ocorrencia" class="form-control" 
                  style="width:100%;padding:8px 10px;border:2px solid var(--cinza-claro);border-radius:12px;font-size:13px;background:var(--branco);color:var(--cinza-escuro);font-family:inherit;appearance:none;-webkit-appearance:none;background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2364758B' d='M6 8L1 3h10z'/%3E%3C/svg%3E\");background-repeat:no-repeat;background-position:right 10px center;padding-right:32px;cursor:pointer;">
                  <option value="">Selecione o tipo...</option>
                  ${TIPOS_OCORRENCIA.map(
                    (op) => `
                    <option value="${op.value}" ${occ.tipo_ocorrencia === op.value ? "selected" : ""}>${op.label}</option>
                  `,
                  ).join("")}
                </select>
              </div>
            </div>

            <!-- Envolvidos (apenas exibição) -->
            <div style="background:var(--cinza-claro);padding:10px;border-radius:var(--border-radius);margin-bottom:12px;opacity:0.7;">
              <p style="font-weight:600;font-size:13px;color:var(--cinza-escuro);margin-bottom:8px;">
                <i class="fas fa-users" style="margin-right:6px;"></i>
                Envolvidos (${envolvidos.length}) - Não podem ser alterados na retificação
              </p>
              ${
                envolvidos.length === 0
                  ? `
                <p style="font-size:13px;color:var(--cinza-medio);">Nenhum envolvido cadastrado</p>
              `
                  : `
                ${envolvidos
                  .map(
                    (env) => `
                  <div style="font-size:13px;padding:4px 0;border-bottom:1px solid var(--cinza-claro);">
                    <span class="badge badge-azul" style="font-size:10px;">${getTipoEnvolvidoLabel(env.tipo)}</span>
                    <strong>${env.nome_completo}</strong>
                    ${env.cpf ? ` - ${env.cpf}` : ""}
                  </div>
                `,
                  )
                  .join("")}
              `
              }
              <p style="font-size:12px;color:var(--cinza-medio);margin-top:6px;">
                <i class="fas fa-info-circle" style="margin-right:4px;"></i>
                Para alterar envolvidos, crie uma nova ocorrência
              </p>
            </div>
          </div>
        </form>
      </div>
      <div class="modal-footer" style="padding:12px 16px 14px 16px;border-top:1px solid var(--cinza-claro);display:flex;flex-direction:column;gap:8px;position:sticky;bottom:0;background:var(--branco);border-radius:0 0 20px 20px;">
        <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()" 
          style="width:100%;padding:10px 16px;border-radius:16px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;border:none;min-height:42px;background:var(--cinza-claro);color:var(--cinza-escuro);">
          Cancelar
        </button>
        <button type="button" class="btn-primary" onclick="window._confirmarRetificacao('${id}')" 
          style="width:100%;padding:10px 16px;border-radius:16px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;border:none;min-height:42px;background:var(--gradiente-principal);color:var(--branco);">
          <i class="fas fa-check-circle" style="margin-right:6px;"></i> Solicitar Retificação
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Máscara de CPF
  const cpfInput = document.getElementById("ret_cpf_solicitante");
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
  const telefoneInput = document.getElementById("ret_telefone_solicitante");
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
  window._confirmarRetificacao = async (occId) => {
    const justificativa = document.getElementById("ret_justificativa")?.value;
    if (!justificativa || justificativa.trim().length < 10) {
      appInstance.showToast(
        "Justificativa deve ter pelo menos 10 caracteres",
        "warning",
      );
      return;
    }

    const dadosCorrigidos = {};

    // Coletar campos preenchidos
    const campos = [
      "nome_solicitante",
      "cpf_solicitante",
      "rg_solicitante",
      "telefone_solicitante",
      "endereco_solicitante",
      "bairro_solicitante",
      "complemento",
      "identificacao_adicional",
      "codigo_municipal",
      "local_ocorrencia",
      "rodovia",
      "bairro_ocorrencia",
      "referencia",
      "observacoes",
      "codigo_operacional",
      "tipo_ocorrencia",
    ];

    campos.forEach((campo) => {
      const el = document.getElementById(`ret_${campo}`);
      if (el && el.value && el.value.trim() !== "") {
        dadosCorrigidos[campo] = el.value.trim();
      }
    });

    if (Object.keys(dadosCorrigidos).length === 0) {
      appInstance.showToast(
        "Nenhum campo foi preenchido para retificação",
        "warning",
      );
      return;
    }

    const confirmado = await appInstance.confirmar(
      "Confirma a retificação desta ocorrência? Os dados alterados serão revisados por um supervisor.",
    );
    if (!confirmado) return;

    const result = await ocorrenciaManager.solicitarRetificacao(
      occId,
      dadosCorrigidos,
      justificativa,
    );

    if (!result.success) {
      appInstance.showToast(
        "Erro ao solicitar retificação: " + result.error,
        "error",
      );
      return;
    }

    const modal = document.querySelector(".modal-overlay");
    if (modal) modal.remove();

    if (result.is_pending) {
      appInstance.showToast(
        "Retificação solicitada com sucesso! Aguarde aprovação do supervisor.",
        "success",
      );
    } else {
      appInstance.showToast("Retificação criada com sucesso!", "success");
    }

    await authManager.logSolicitarRetificacao(authManager.getUserId(), occId);

    // Recarregar detalhe
    const detailContainer = document.getElementById("detalheOcorrenciaContent");
    if (detailContainer) renderDetalheOcorrencia(detailContainer, appInstance);
  };
}

async function aprovarRetificacao(id, appInstance) {
  const confirmado = await appInstance.confirmar(
    "Confirma a aprovação desta retificação? A versão original será substituída.",
  );
  if (!confirmado) return;

  const result = await ocorrenciaManager.aprovarRetificacao(id);
  if (result.success) {
    appInstance.showToast("Retificação aprovada com sucesso!", "success");
    await authManager.logAprovarRetificacao(authManager.getUserId(), id);

    const container = document.getElementById("detalheOcorrenciaContent");
    if (container) renderDetalheOcorrencia(container, appInstance);
  } else {
    appInstance.showToast(
      "Erro ao aprovar retificação: " + result.error,
      "error",
    );
  }
}

async function rejeitarRetificacao(id, appInstance) {
  const motivo = await appInstance.inputModal(
    "Informe o motivo da rejeição da retificação:",
    "Rejeitar Retificação",
    "Digite o motivo da rejeição...",
  );

  if (!motivo) {
    appInstance.showToast("Operação cancelada", "info");
    return;
  }

  const confirmado = await appInstance.confirmar(
    `Confirma a rejeição desta retificação?\n\nMotivo: ${motivo}`,
  );
  if (!confirmado) return;

  const result = await ocorrenciaManager.rejeitarRetificacao(id, motivo);
  if (result.success) {
    appInstance.showToast("Retificação rejeitada", "info");
    await authManager.logRejeitarRetificacao(authManager.getUserId(), id);

    const container = document.getElementById("detalheOcorrenciaContent");
    if (container) renderDetalheOcorrencia(container, appInstance);
  } else {
    appInstance.showToast(
      "Erro ao rejeitar retificação: " + result.error,
      "error",
    );
  }
}

async function verHistorico(id, appInstance) {
  const result = await ocorrenciaManager.buscarHistorico(id);
  if (!result.success) {
    appInstance.showToast("Erro ao carregar histórico", "error");
    return;
  }

  const historico = result.data;

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

  let html = `
    <div class="modal" style="max-width:600px;width:100%;max-height:95vh;overflow-y:auto;">
      <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px 10px 16px;border-bottom:1px solid var(--cinza-claro);position:sticky;top:0;background:var(--branco);border-radius:20px 20px 0 0;z-index:1;">
        <div class="title" style="font-size:16px;font-weight:700;color:var(--azul-bandeira);">
          <i class="fas fa-history" style="margin-right:8px;"></i>
          Histórico da Ocorrência
        </div>
        <button type="button" class="close-btn" onclick="this.closest('.modal-overlay').remove()" 
          style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--cinza-medio);padding:4px 8px;border-radius:50%;transition:all 0.3s ease;">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="modal-body" style="padding:14px 16px 4px 16px;max-height:70vh;overflow-y:auto;">
  `;

  historico.forEach((item) => {
    const isOriginal = item.is_original;
    const isAtiva = item.esta_ativa !== false;
    const statusClass = getStatusClass(item.status);
    const statusLabel = getStatusLabel(item.status);
    const data = formatarDataHoraLocal(item.criado_em);
    const numero =
      item.numero_ocorrencia || item.numero_temporario || "Rascunho";

    let camposAlterados = [];
    if (item.campos_alterados) {
      try {
        camposAlterados = JSON.parse(item.campos_alterados);
      } catch (e) {}
    }

    html += `
      <div style="border-left:4px solid ${isAtiva ? "var(--verde-bandeira)" : "var(--cinza-medio)"};padding-left:12px;margin-bottom:16px;background:var(--branco);border-radius:var(--border-radius);padding:12px;box-shadow:var(--sombra-suave);">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <div>
            <span style="font-weight:700;color:var(--azul-bandeira);">
              ${isOriginal ? "📄 Versão Original" : `🔄 Retificação v${item.numero_versao || 1}`}
            </span>
            ${isAtiva ? ' <span class="badge badge-synced" style="font-size:10px;">✅ Ativa</span>' : ' <span class="badge badge-draft" style="font-size:10px;">📜 Substituída</span>'}
            ${item.status === "pending_rectification" ? ' <span class="badge badge-pending" style="font-size:10px;">⏳ Pendente</span>' : ""}
            ${item.status === "rectification_rejected" ? ' <span class="badge badge-cancelled" style="font-size:10px;">❌ Rejeitada</span>' : ""}
          </div>
          <span class="badge badge-${statusClass}" style="font-size:10px;">${statusLabel}</span>
        </div>
        <div style="font-size:13px;color:var(--cinza-medio);margin-top:4px;">
          <i class="fas fa-calendar" style="margin-right:4px;"></i> ${data}
          <span style="margin-left:12px;"><i class="fas fa-hashtag" style="margin-right:4px;"></i>#${numero}</span>
          ${
            item.justificativa_retificacao
              ? `
            <div style="margin-top:6px;padding:8px 12px;background:var(--azul-muito-claro);border-radius:var(--border-radius);font-size:13px;color:var(--cinza-escuro);border-left:3px solid var(--azul-bandeira);">
              <i class="fas fa-quote-left" style="color:var(--azul-bandeira);margin-right:4px;"></i>
              ${item.justificativa_retificacao}
            </div>
          `
              : ""
          }
          ${
            item.solicitacao_retificacao_justificativa &&
            item.status === "pending_rectification"
              ? `
            <div style="margin-top:6px;padding:8px 12px;background:#fef3c7;border-radius:var(--border-radius);font-size:13px;color:#92400e;border-left:3px solid var(--aviso);">
              <i class="fas fa-clock" style="color:var(--aviso);margin-right:4px;"></i>
              Solicitação: ${item.solicitacao_retificacao_justificativa}
            </div>
          `
              : ""
          }
          ${
            item.motivo_rejeicao
              ? `
            <div style="margin-top:6px;padding:8px 12px;background:#fee2e2;border-radius:var(--border-radius);font-size:13px;color:#991b1b;border-left:3px solid var(--erro);">
              <i class="fas fa-times-circle" style="color:var(--erro);margin-right:4px;"></i>
              Motivo da rejeição: ${item.motivo_rejeicao}
            </div>
          `
              : ""
          }
          ${
            camposAlterados.length > 0
              ? `
            <div style="margin-top:6px;padding:8px 12px;background:var(--verde-muito-claro);border-radius:var(--border-radius);font-size:13px;color:var(--verde-escuro);border-left:3px solid var(--verde-bandeira);">
              <strong><i class="fas fa-edit" style="margin-right:4px;"></i> Campos Alterados:</strong>
              ${camposAlterados
                .map(
                  (c) => `
                <div style="margin-top:4px;font-size:12px;padding:4px 8px;background:var(--branco);border-radius:4px;">
                  <strong>${c.label || c.campo}:</strong>
                  <span style="color:var(--cinza-medio);text-decoration:line-through;">${c.antes || "(vazio)"}</span>
                  →
                  <span style="color:var(--verde-bandeira);">${c.depois || "(vazio)"}</span>
                </div>
              `,
                )
                .join("")}
            </div>
          `
              : ""
          }
        </div>
        <div style="margin-top:6px;font-size:13px;">
          <strong>Local:</strong> ${item.local_ocorrencia || "Não informado"}
        </div>
        ${
          !isOriginal && item.retificado_por
            ? `
          <div style="font-size:12px;color:var(--cinza-medio);margin-top:4px;">
            <i class="fas fa-user" style="margin-right:4px;"></i>
            Retificado por: Supervisor
          </div>
        `
            : ""
        }
        ${
          !isOriginal && item.solicitada_por
            ? `
          <div style="font-size:12px;color:var(--cinza-medio);margin-top:4px;">
            <i class="fas fa-user" style="margin-right:4px;"></i>
            Solicitado por: Guarda
          </div>
        `
            : ""
        }
        <button onclick="app.navigateTo('detalhe-ocorrencia', { id: '${item.id}' })" 
          class="btn-secondary" style="margin-top:8px;padding:4px 12px;font-size:12px;min-height:auto;width:auto;background:var(--azul-muito-claro);color:var(--azul-bandeira);border-radius:8px;">
          <i class="fas fa-eye" style="margin-right:4px;"></i> Ver Versão
        </button>
      </div>
    `;
  });

  html += `
      </div>
      <div class="modal-footer" style="padding:12px 16px 14px 16px;border-top:1px solid var(--cinza-claro);">
        <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()" 
          style="width:100%;padding:10px 16px;border-radius:16px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;border:none;min-height:42px;background:var(--cinza-claro);color:var(--cinza-escuro);">
          Fechar
        </button>
      </div>
    </div>
  `;

  overlay.innerHTML = html;
  document.body.appendChild(overlay);
}

function editarOcorrencia(id, appInstance) {
  appInstance.showToast("Funcionalidade de edição em desenvolvimento", "info");
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

function getTipoEnvolvidoLabel(tipo) {
  const tipos = {
    autor: "Autor",
    vitima: "Vítima",
    testemunha: "Testemunha",
    solicitante: "Solicitante",
    outro: "Outro",
  };
  return tipos[tipo] || tipo;
}

function getIconAnexo(tipo) {
  const icons = {
    image: "fa-image",
    video: "fa-video",
    document: "fa-file-pdf",
    audio: "fa-music",
  };
  return icons[tipo] || "fa-file";
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

function formatarTamanho(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

// ============================================
// CONSTANTES
// ============================================

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
// EXPORTAÇÕES
// ============================================

export default {
  renderDetalheOcorrencia,
  finalizarOcorrencia,
  cancelarOcorrencia,
  solicitarRetificacao,
  aprovarRetificacao,
  rejeitarRetificacao,
  verHistorico,
  editarOcorrencia,
};
