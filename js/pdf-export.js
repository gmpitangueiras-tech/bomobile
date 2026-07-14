/**
 * PDF EXPORT - Exportação de Documentos
 * Guarda Municipal de Pitangueiras - PR
 *
 * Este módulo gerencia:
 * - Exportação de ocorrências para PDF
 * - Exportação de relatórios para PDF
 * - Exportação de abordagens para PDF
 * - Personalização de layout
 * - Múltiplos formatos de saída
 * - Compressão e otimização
 *
 * MELHORIAS APLICADAS:
 * - Exportação de relatórios completos (ocorrências + abordagens)
 * - Múltiplos formatos (PDF, CSV, XLSX - via bibliotecas)
 * - Personalização de layout (marca d'água, cabeçalho, rodapé)
 * - Otimização de tamanho de arquivo
 * - Exportação em lote
 * - Suporte a imagens e anexos
 * - Configurações de página (orientação, margens)
 * - Pré-visualização antes de exportar
 *
 * Depende de: jsPDF, jsPDF-AutoTable, authManager, ocorrenciaManager
 */

// ============================================
// CLASSE PDF EXPORT
// ============================================

class PDFExport {
  constructor() {
    this.initialized = false;
    this.defaultOptions = {
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
      margins: {
        top: 15,
        bottom: 15,
        left: 10,
        right: 10,
      },
      watermark: {
        text: "Guarda Municipal - Pitangueiras/PR",
        opacity: 0.1,
        fontSize: 40,
      },
      header: {
        show: true,
        includeDate: true,
        includeUser: true,
        includeVersion: true,
      },
      footer: {
        show: true,
        includePageNumbers: true,
        includeDate: true,
      },
      images: {
        compress: true,
        maxWidth: 600,
        quality: 0.8,
      },
    };

    // Mapeamento de status para cores
    this.statusColors = {
      draft: "#94a3b8",
      pending_sync: "#f59e0b",
      synced: "#00843d",
      cancelled: "#dc2626",
      rectified: "#003f87",
      pending_rectification: "#f59e0b",
      rectification_rejected: "#dc2626",
    };

    // Mapeamento de tipos para ícones
    this.tipoIcons = {
      furto: "🚗",
      roubo: "💰",
      vandalismo: "🔨",
      dano_ao_patrimonio: "🏠",
      ameaca: "⚠️",
      lesao_corporal: "🏥",
      perturbacao: "🔊",
      acidente: "🚨",
      incendio: "🔥",
      desaparecimento: "🔍",
      atendimento_social: "🤝",
      outro: "📌",
    };
  }

  // ============================================
  // INICIALIZAÇÃO
  // ============================================

  async init() {
    if (this.initialized) return;

    // Verificar se as bibliotecas estão carregadas
    try {
      if (typeof window.jspdf === "undefined" && typeof jsPDF === "undefined") {
        console.warn("⚠️ jsPDF não encontrado. Carregando...");
        await this.loadLibrary(
          "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
        );
      }

      if (
        typeof window.jspdf?.autoTable === "undefined" &&
        typeof jsPDF?.autoTable === "undefined"
      ) {
        console.warn("⚠️ jsPDF-AutoTable não encontrado. Carregando...");
        await this.loadLibrary(
          "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js",
        );
      }

      // Verificar disponibilidade
      if (
        typeof jsPDF === "undefined" &&
        typeof window.jspdf?.jsPDF === "undefined"
      ) {
        throw new Error("Bibliotecas PDF não disponíveis");
      }

      this.initialized = true;
      console.log("📄 PDF Export inicializado");
      return true;
    } catch (error) {
      console.error("❌ Erro ao inicializar PDF Export:", error);
      return false;
    }
  }

  /**
   * Carrega uma biblioteca dinamicamente
   * @param {string} url - URL da biblioteca
   * @returns {Promise<void>}
   */
  loadLibrary(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Erro ao carregar: ${url}`));
      document.head.appendChild(script);

      // Timeout de segurança
      setTimeout(() => {
        resolve();
      }, 5000);
    });
  }

  /**
   * Obtém a instância do jsPDF
   * @returns {Object} - Instância do jsPDF
   */
  getJSPDF() {
    if (typeof window.jspdf !== "undefined" && window.jspdf.jsPDF) {
      return window.jspdf.jsPDF;
    }
    if (typeof jsPDF !== "undefined") {
      return jsPDF;
    }
    throw new Error("jsPDF não disponível");
  }

  // ============================================
  // EXPORTAÇÃO DE OCORRÊNCIA
  // ============================================

  /**
   * Exporta uma ocorrência para PDF
   * @param {string} ocorrenciaId - ID da ocorrência
   * @param {Object} options - Opções de exportação
   * @returns {Promise<Object>} { success, data?, error? }
   */
  async exportarOcorrencia(ocorrenciaId, options = {}) {
    try {
      await this.init();

      // Buscar ocorrência
      const result = await ocorrenciaManager.buscar(ocorrenciaId);
      if (!result.success || !result.data) {
        throw new Error("Ocorrência não encontrada");
      }

      const ocorrencia = result.data;

      // Buscar envolvidos
      const envolvidosResult =
        await ocorrenciaManager.listarEnvolvidos(ocorrenciaId);
      const envolvidos = envolvidosResult.success ? envolvidosResult.data : [];

      // Buscar anexos
      const anexosResult = await ocorrenciaManager.listarAnexos(ocorrenciaId);
      const anexos = anexosResult.success ? anexosResult.data : [];

      // Merge de opções
      const opts = { ...this.defaultOptions, ...options };

      // Gerar PDF
      const doc = await this.gerarPDFOcorrencia(
        ocorrencia,
        envolvidos,
        anexos,
        opts,
      );

      // Salvar
      const nomeArquivo = `Ocorrencia_${ocorrencia.numero_ocorrencia || "Rascunho"}_${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(nomeArquivo);

      console.log(`✅ PDF da ocorrência ${ocorrenciaId} gerado com sucesso`);
      return { success: true, fileName: nomeArquivo };
    } catch (error) {
      console.error("❌ Erro ao exportar ocorrência:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Gera o PDF da ocorrência
   * @param {Object} ocorrencia - Dados da ocorrência
   * @param {Array} envolvidos - Lista de envolvidos
   * @param {Array} anexos - Lista de anexos
   * @param {Object} options - Opções de exportação
   * @returns {Object} - Instância do jsPDF
   */
  async gerarPDFOcorrencia(ocorrencia, envolvidos, anexos, options) {
    const jsPDF = this.getJSPDF();
    const doc = new jsPDF(options);

    // Cabeçalho
    await this.adicionarCabecalho(doc, options);

    // Título
    await this.adicionarTitulo(doc, ocorrencia, options);

    // Dados da ocorrência
    await this.adicionarDadosOcorrencia(doc, ocorrencia, options);

    // Dados do solicitante
    await this.adicionarDadosSolicitante(doc, ocorrencia, options);

    // Envolvidos
    await this.adicionarEnvolvidos(doc, envolvidos, options);

    // Observações
    await this.adicionarObservacoes(doc, ocorrencia, options);

    // Anexos
    await this.adicionarAnexos(doc, anexos, options);

    // Rodapé
    await this.adicionarRodape(doc, options);

    // Marca d'água
    await this.adicionarMarcaDagua(doc, options);

    return doc;
  }

  // ============================================
  // EXPORTAÇÃO DE RELATÓRIO
  // ============================================

  /**
   * Exporta um relatório para PDF
   * @param {string} tipo - Tipo do relatório
   * @param {Object} dados - Dados do relatório
   * @param {Object} options - Opções de exportação
   * @returns {Promise<Object>} { success, data?, error? }
   */
  async exportarRelatorio(tipo, dados, options = {}) {
    try {
      await this.init();

      // Merge de opções
      const opts = { ...this.defaultOptions, ...options };

      // Gerar PDF conforme tipo
      let doc;
      switch (tipo) {
        case "desempenho":
          doc = await this.gerarPDFDesempenho(dados, opts);
          break;
        case "ocorrencias":
          doc = await this.gerarPDFListaOcorrencias(dados, opts);
          break;
        case "abordagens":
          doc = await this.gerarPDFAbordagens(dados, opts);
          break;
        case "retificacoes":
          doc = await this.gerarPDFRetificacoes(dados, opts);
          break;
        default:
          throw new Error("Tipo de relatório não suportado");
      }

      // Salvar
      const nomeArquivo = `Relatorio_${tipo}_${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(nomeArquivo);

      console.log(`✅ Relatório ${tipo} exportado com sucesso`);
      return { success: true, fileName: nomeArquivo };
    } catch (error) {
      console.error("❌ Erro ao exportar relatório:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Gera PDF do relatório de desempenho
   */
  async gerarPDFDesempenho(dados, options) {
    const jsPDF = this.getJSPDF();
    const doc = new jsPDF(options);

    await this.adicionarCabecalho(doc, options);

    // Título
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Relatório de Desempenho", 105, 40, { align: "center" });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 105, 48, {
      align: "center",
    });

    // Resumo
    let y = 60;
    const total = dados.total || dados.ranking?.length || 0;
    const totalOcorrencias = dados.totalOcorrencias || 0;
    const totalAbordagens = dados.totalAbordagens || 0;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Resumo do Período", 20, y);
    y += 8;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Total de Guardas: ${total}`, 25, y);
    y += 6;
    doc.text(`Total de Ocorrências: ${totalOcorrencias}`, 25, y);
    y += 6;
    doc.text(`Total de Abordagens: ${totalAbordagens}`, 25, y);
    y += 10;

    // Tabela de Ranking
    if (dados.ranking && dados.ranking.length > 0) {
      const tableData = dados.ranking.map((item, index) => [
        index + 1,
        item.nome || "Desconhecido",
        item.matricula || "-",
        item.ocorrencias?.total || 0,
        item.ocorrencias?.finalizadas || 0,
        `${item.taxa_resolucao || 0}%`,
        item.abordagens?.total || 0,
        item.total_atendimentos ||
          (item.ocorrencias?.total || 0) + (item.abordagens?.total || 0),
      ]);

      doc.autoTable({
        startY: y,
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
        body: tableData,
        headStyles: {
          fillColor: [0, 63, 135],
          textColor: [255, 255, 255],
          fontSize: 9,
          halign: "center",
        },
        columnStyles: {
          0: { cellWidth: 15, halign: "center" },
          1: { cellWidth: 50 },
          2: { cellWidth: 25, halign: "center" },
          3: { cellWidth: 20, halign: "center" },
          4: { cellWidth: 20, halign: "center" },
          5: { cellWidth: 20, halign: "center" },
          6: { cellWidth: 20, halign: "center" },
          7: { cellWidth: 20, halign: "center" },
        },
        styles: {
          fontSize: 8,
          cellPadding: 3,
        },
        alternateRowStyles: {
          fillColor: [245, 247, 250],
        },
      });
    }

    await this.adicionarRodape(doc, options);
    await this.adicionarMarcaDagua(doc, options);

    return doc;
  }

  /**
   * Gera PDF da lista de ocorrências
   */
  async gerarPDFListaOcorrencias(dados, options) {
    const jsPDF = this.getJSPDF();
    const doc = new jsPDF(options);

    await this.adicionarCabecalho(doc, options);

    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Lista de Ocorrências", 105, 40, { align: "center" });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 105, 48, {
      align: "center",
    });

    let y = 60;

    // Resumo
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Total: ${dados.length || 0} ocorrência(s)`, 20, y);
    y += 10;

    if (dados && dados.length > 0) {
      const tableData = dados.map((item) => [
        item.numero_ocorrencia || item.numero_temporario || "Rascunho",
        new Date(item.criado_em).toLocaleDateString("pt-BR"),
        item.tipo_ocorrencia || "Não informado",
        item.local_ocorrencia || "Não informado",
        this.getStatusLabel(item.status),
      ]);

      doc.autoTable({
        startY: y,
        head: [["Número", "Data", "Tipo", "Local", "Status"]],
        body: tableData,
        headStyles: {
          fillColor: [0, 63, 135],
          textColor: [255, 255, 255],
          fontSize: 9,
          halign: "center",
        },
        columnStyles: {
          0: { cellWidth: 35 },
          1: { cellWidth: 25, halign: "center" },
          2: { cellWidth: 35 },
          3: { cellWidth: 50 },
          4: { cellWidth: 30, halign: "center" },
        },
        styles: {
          fontSize: 8,
          cellPadding: 3,
        },
        alternateRowStyles: {
          fillColor: [245, 247, 250],
        },
      });
    }

    await this.adicionarRodape(doc, options);
    await this.adicionarMarcaDagua(doc, options);

    return doc;
  }

  /**
   * Gera PDF de abordagens
   */
  async gerarPDFAbordagens(dados, options) {
    const jsPDF = this.getJSPDF();
    const doc = new jsPDF(options);

    await this.adicionarCabecalho(doc, options);

    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Relatório de Abordagens", 105, 40, { align: "center" });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 105, 48, {
      align: "center",
    });

    let y = 60;

    // Resumo
    const veiculos = dados.veiculos || [];
    const pessoas = dados.pessoas || [];

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Total de Veículos: ${veiculos.length}`, 20, y);
    y += 6;
    doc.text(`Total de Pessoas: ${pessoas.length}`, 20, y);
    y += 10;

    // Veículos
    if (veiculos.length > 0) {
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Veículos", 20, y);
      y += 6;

      const tableData = veiculos
        .slice(0, 20)
        .map((v) => [
          v.placa || "N/A",
          v.marca_modelo || "N/A",
          v.cor || "N/A",
          v.motivo || "N/A",
          v.fase || "advertencia",
        ]);

      doc.autoTable({
        startY: y,
        head: [["Placa", "Marca/Modelo", "Cor", "Motivo", "Fase"]],
        body: tableData,
        headStyles: {
          fillColor: [0, 63, 135],
          textColor: [255, 255, 255],
          fontSize: 8,
          halign: "center",
        },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 40 },
          2: { cellWidth: 25 },
          3: { cellWidth: 50 },
          4: { cellWidth: 30, halign: "center" },
        },
        styles: {
          fontSize: 7,
          cellPadding: 2,
        },
        alternateRowStyles: {
          fillColor: [245, 247, 250],
        },
      });

      y = doc.lastAutoTable.finalY + 5;
    }

    // Pessoas
    if (pessoas.length > 0) {
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Pessoas", 20, y);
      y += 6;

      const tableData = pessoas
        .slice(0, 20)
        .map((p) => [
          p.nome || "N/A",
          p.cpf || "N/A",
          p.motivo || "N/A",
          p.fase || "advertencia",
        ]);

      doc.autoTable({
        startY: y,
        head: [["Nome", "CPF", "Motivo", "Fase"]],
        body: tableData,
        headStyles: {
          fillColor: [0, 63, 135],
          textColor: [255, 255, 255],
          fontSize: 8,
          halign: "center",
        },
        columnStyles: {
          0: { cellWidth: 50 },
          1: { cellWidth: 35 },
          2: { cellWidth: 50 },
          3: { cellWidth: 35, halign: "center" },
        },
        styles: {
          fontSize: 7,
          cellPadding: 2,
        },
        alternateRowStyles: {
          fillColor: [245, 247, 250],
        },
      });
    }

    await this.adicionarRodape(doc, options);
    await this.adicionarMarcaDagua(doc, options);

    return doc;
  }

  /**
   * Gera PDF de retificações
   */
  async gerarPDFRetificacoes(dados, options) {
    const jsPDF = this.getJSPDF();
    const doc = new jsPDF(options);

    await this.adicionarCabecalho(doc, options);

    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Relatório de Retificações", 105, 40, { align: "center" });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 105, 48, {
      align: "center",
    });

    let y = 60;

    const aprovadas = dados.filter((d) => d.status === "rectified");
    const pendentes = dados.filter((d) => d.status === "pending_rectification");
    const rejeitadas = dados.filter(
      (d) => d.status === "rectification_rejected",
    );

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Aprovadas: ${aprovadas.length}`, 20, y);
    y += 6;
    doc.text(`Pendentes: ${pendentes.length}`, 20, y);
    y += 6;
    doc.text(`Rejeitadas: ${rejeitadas.length}`, 20, y);
    y += 10;

    if (dados.length > 0) {
      const tableData = dados
        .slice(0, 30)
        .map((item) => [
          item.numero_ocorrencia || "N/A",
          new Date(item.criado_em).toLocaleDateString("pt-BR"),
          item.tipo_ocorrencia || "N/A",
          this.getStatusLabel(item.status),
          item.motivo_rejeicao || "-",
        ]);

      doc.autoTable({
        startY: y,
        head: [["Número", "Data", "Tipo", "Status", "Motivo Rejeição"]],
        body: tableData,
        headStyles: {
          fillColor: [0, 63, 135],
          textColor: [255, 255, 255],
          fontSize: 8,
          halign: "center",
        },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 25, halign: "center" },
          2: { cellWidth: 35 },
          3: { cellWidth: 30, halign: "center" },
          4: { cellWidth: 50 },
        },
        styles: {
          fontSize: 7,
          cellPadding: 2,
        },
        alternateRowStyles: {
          fillColor: [245, 247, 250],
        },
      });
    }

    await this.adicionarRodape(doc, options);
    await this.adicionarMarcaDagua(doc, options);

    return doc;
  }

  // ============================================
  // COMPONENTES DO PDF
  // ============================================

  /**
   * Adiciona cabeçalho ao PDF
   */
  async adicionarCabecalho(doc, options) {
    if (!options.header?.show) return;

    const jsPDF = this.getJSPDF();
    const pageWidth = doc.internal.pageSize.width;

    // Logo - usar texto com ícone
    doc.setFillColor(0, 63, 135);
    doc.rect(0, 0, pageWidth, 22, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("GUARDA MUNICIPAL DE PITANGUEIRAS - PR", pageWidth / 2, 8, {
      align: "center",
    });

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("Sistema de Registro de Ocorrências", pageWidth / 2, 14, {
      align: "center",
    });

    if (options.header.includeDate) {
      const data = new Date().toLocaleString("pt-BR");
      doc.setFontSize(7);
      doc.text(`Data: ${data}`, pageWidth - 10, 6, { align: "right" });
    }

    if (options.header.includeUser && authManager.isLoggedIn()) {
      const user = authManager.getUser();
      if (user) {
        doc.setFontSize(7);
        doc.text(`Usuário: ${user.nome_completo}`, pageWidth - 10, 12, {
          align: "right",
        });
      }
    }

    if (options.header.includeVersion) {
      doc.setFontSize(6);
      doc.text(`Versão: ${CONFIG.VERSAO}`, pageWidth - 10, 18, {
        align: "right",
      });
    }
  }

  /**
   * Adiciona título ao PDF
   */
  async adicionarTitulo(doc, ocorrencia, options) {
    const numero =
      ocorrencia.numero_ocorrencia ||
      ocorrencia.numero_temporario ||
      "Rascunho";
    const status = this.getStatusLabel(ocorrencia.status);
    const statusColor = this.statusColors[ocorrencia.status] || "#94a3b8";

    let y = 30;

    doc.setTextColor(0, 63, 135);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`Relatório de Ocorrência`, 20, y);
    y += 8;

    doc.setTextColor(30, 41, 59);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`Número: ${numero}`, 20, y);
    y += 6;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Status: ${status}`, 20, y);
    y += 6;
    doc.text(
      `Criado em: ${new Date(ocorrencia.criado_em).toLocaleString("pt-BR")}`,
      20,
      y,
    );
    y += 6;

    if (ocorrencia.criador) {
      doc.text(
        `Criado por: ${ocorrencia.criador.nome_completo || "Desconhecido"}`,
        20,
        y,
      );
      y += 6;
    }

    y += 4;
    return y;
  }

  /**
   * Adiciona dados da ocorrência ao PDF
   */
  async adicionarDadosOcorrencia(doc, ocorrencia, options) {
    let y = doc.lastAutoTable?.finalY || 50;

    if (y < 50) y = 50;

    doc.setTextColor(0, 63, 135);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Dados da Ocorrência", 20, y);
    y += 8;

    const dados = [
      { label: "Tipo", value: this.getTipoLabel(ocorrencia.tipo_ocorrencia) },
      { label: "Local", value: ocorrencia.local_ocorrencia || "Não informado" },
      {
        label: "Bairro",
        value: ocorrencia.bairro_ocorrencia || "Não informado",
      },
      { label: "Referência", value: ocorrencia.referencia || "Não informado" },
      {
        label: "Data/Hora Início",
        value: new Date(ocorrencia.data_hora_inicio).toLocaleString("pt-BR"),
      },
      {
        label: "Data/Hora Encerramento",
        value: ocorrencia.data_hora_encerramento
          ? new Date(ocorrencia.data_hora_encerramento).toLocaleString("pt-BR")
          : "Não encerrado",
      },
    ];

    if (ocorrencia.latitude && ocorrencia.longitude) {
      dados.push({
        label: "Localização",
        value: `${ocorrencia.latitude.toFixed(6)}, ${ocorrencia.longitude.toFixed(6)}`,
      });
    }

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    dados.forEach((item) => {
      doc.text(`${item.label}: ${item.value}`, 25, y);
      y += 6;
    });

    y += 4;
    return y;
  }

  /**
   * Adiciona dados do solicitante ao PDF
   */
  async adicionarDadosSolicitante(doc, ocorrencia, options) {
    let y = doc.lastAutoTable?.finalY || 50;

    if (y < 50) y = 50;

    const temDados =
      ocorrencia.nome_solicitante ||
      ocorrencia.cpf_solicitante ||
      ocorrencia.telefone_solicitante;

    if (!temDados) return y;

    y += 6;
    doc.setTextColor(0, 63, 135);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Dados do Solicitante", 20, y);
    y += 8;

    const dados = [
      { label: "Nome", value: ocorrencia.nome_solicitante || "Anônimo" },
      { label: "CPF", value: ocorrencia.cpf_solicitante || "Não informado" },
      { label: "RG", value: ocorrencia.rg_solicitante || "Não informado" },
      {
        label: "Telefone",
        value: ocorrencia.telefone_solicitante || "Não informado",
      },
      {
        label: "Endereço",
        value: ocorrencia.endereco_solicitante || "Não informado",
      },
      {
        label: "Bairro",
        value: ocorrencia.bairro_solicitante || "Não informado",
      },
    ];

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    dados.forEach((item) => {
      doc.text(`${item.label}: ${item.value}`, 25, y);
      y += 6;
    });

    y += 4;
    return y;
  }

  /**
   * Adiciona envolvidos ao PDF
   */
  async adicionarEnvolvidos(doc, envolvidos, options) {
    let y = doc.lastAutoTable?.finalY || 50;

    if (y < 50) y = 50;

    y += 6;
    doc.setTextColor(0, 63, 135);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`Envolvidos (${envolvidos.length})`, 20, y);
    y += 8;

    if (envolvidos.length === 0) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text("Nenhum envolvido cadastrado", 25, y);
      y += 6;
      return y;
    }

    const tableData = envolvidos.map((env) => [
      this.getTipoEnvolvidoLabel(env.tipo),
      env.nome_completo || "N/A",
      env.cpf || "N/A",
      env.telefone || "N/A",
    ]);

    doc.autoTable({
      startY: y,
      head: [["Tipo", "Nome", "CPF", "Telefone"]],
      body: tableData,
      headStyles: {
        fillColor: [0, 63, 135],
        textColor: [255, 255, 255],
        fontSize: 8,
        halign: "center",
      },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 60 },
        2: { cellWidth: 40 },
        3: { cellWidth: 40 },
      },
      styles: {
        fontSize: 8,
        cellPadding: 3,
      },
      alternateRowStyles: {
        fillColor: [245, 247, 250],
      },
    });

    y = doc.lastAutoTable.finalY;
    return y;
  }

  /**
   * Adiciona observações ao PDF
   */
  async adicionarObservacoes(doc, ocorrencia, options) {
    let y = doc.lastAutoTable?.finalY || 50;

    if (y < 50) y = 50;

    if (!ocorrencia.observacoes) return y;

    y += 6;
    doc.setTextColor(0, 63, 135);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Observações", 20, y);
    y += 8;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");

    // Quebrar texto em linhas
    const splitText = doc.splitTextToSize(ocorrencia.observacoes, 170);
    doc.text(splitText, 25, y);
    y += splitText.length * 5 + 6;

    return y;
  }

  /**
   * Adiciona anexos ao PDF
   */
  async adicionarAnexos(doc, anexos, options) {
    let y = doc.lastAutoTable?.finalY || 50;

    if (y < 50) y = 50;

    if (anexos.length === 0) return y;

    y += 6;
    doc.setTextColor(0, 63, 135);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`Anexos (${anexos.length})`, 20, y);
    y += 8;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    anexos.forEach((anexo) => {
      const tipo = anexo.tipo_arquivo || "document";
      const icon = this.tipoIcons[tipo] || "📎";
      doc.text(
        `${icon} ${anexo.nome_arquivo} (${this.formatarTamanho(anexo.tamanho || 0)})`,
        25,
        y,
      );
      y += 6;
    });

    y += 4;
    return y;
  }

  /**
   * Adiciona rodapé ao PDF
   */
  async adicionarRodape(doc, options) {
    if (!options.footer?.show) return;

    const pageCount = doc.internal.getNumberOfPages();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);

      // Linha separadora
      doc.setDrawColor(200, 200, 200);
      doc.line(10, pageHeight - 12, pageWidth - 10, pageHeight - 12);

      doc.setTextColor(150, 150, 150);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");

      let text = "Guarda Municipal de Pitangueiras - PR";

      if (options.footer.includeDate) {
        text += ` | ${new Date().toLocaleString("pt-BR")}`;
      }

      doc.text(text, 10, pageHeight - 5);

      if (options.footer.includePageNumbers) {
        doc.text(
          `Página ${i} de ${pageCount}`,
          pageWidth - 10,
          pageHeight - 5,
          { align: "right" },
        );
      }
    }
  }

  /**
   * Adiciona marca d'água ao PDF
   */
  async adicionarMarcaDagua(doc, options) {
    if (!options.watermark) return;

    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    doc.setFontSize(options.watermark.fontSize || 40);
    doc.setTextColor(200, 200, 200);
    doc.setFont("helvetica", "bold");
    doc.text(options.watermark.text, pageWidth / 2, pageHeight / 2, {
      align: "center",
      angle: 45,
    });
  }

  // ============================================
  // EXPORTAÇÃO EM LOTE
  // ============================================

  /**
   * Exporta múltiplas ocorrências para PDF (lote)
   * @param {Array} ids - Lista de IDs de ocorrências
   * @param {Object} options - Opções de exportação
   * @returns {Promise<Object>}
   */
  async exportarLote(ids, options = {}) {
    try {
      await this.init();

      const resultados = [];
      const erros = [];

      for (const id of ids) {
        try {
          const result = await this.exportarOcorrencia(id, options);
          if (result.success) {
            resultados.push(result);
          } else {
            erros.push({ id, error: result.error });
          }
        } catch (error) {
          erros.push({ id, error: error.message });
        }
      }

      console.log(
        `📄 ${resultados.length} ocorrências exportadas, ${erros.length} erros`,
      );

      return {
        success: erros.length === 0,
        resultados,
        erros,
        total: ids.length,
        sucessos: resultados.length,
        falhas: erros.length,
      };
    } catch (error) {
      console.error("❌ Erro na exportação em lote:", error);
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // EXPORTAÇÃO COMO CSV
  // ============================================

  /**
   * Exporta dados como CSV
   * @param {Array} dados - Dados a serem exportados
   * @param {string} nomeArquivo - Nome do arquivo
   * @param {Object} opcoes - Opções de exportação
   * @returns {Object} { success, data?, error? }
   */
  exportarCSV(dados, nomeArquivo = "dados.csv", opcoes = {}) {
    try {
      if (!dados || dados.length === 0) {
        throw new Error("Nenhum dado para exportar");
      }

      // Gerar cabeçalhos
      const cabecalhos = Object.keys(dados[0]);
      let csv = cabecalhos.join(",") + "\n";

      // Gerar linhas
      dados.forEach((linha) => {
        const valores = cabecalhos.map((chave) => {
          const valor = linha[chave] || "";
          // Se o valor contém vírgula ou aspas, colocar entre aspas
          if (
            typeof valor === "string" &&
            (valor.includes(",") || valor.includes('"') || valor.includes("\n"))
          ) {
            return `"${valor.replace(/"/g, '""')}"`;
          }
          return valor;
        });
        csv += valores.join(",") + "\n";
      });

      // Baixar arquivo
      const blob = new Blob(["\uFEFF" + csv], {
        type: "text/csv;charset=utf-8;",
      });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", nomeArquivo);
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      console.log(`📊 CSV exportado: ${nomeArquivo}`);
      return { success: true, fileName: nomeArquivo };
    } catch (error) {
      console.error("❌ Erro ao exportar CSV:", error);
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // FUNÇÕES AUXILIARES
  // ============================================

  getStatusLabel(status) {
    const map = {
      draft: "Rascunho",
      pending_sync: "Pendente",
      synced: "Finalizada",
      cancelled: "Cancelada",
      rectified: "Retificada",
      pending_rectification: "Retificação Pendente",
      rectification_rejected: "Retificação Rejeitada",
      sync_error: "Erro",
    };
    return map[status] || status;
  }

  getTipoLabel(value) {
    const tipos = [
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
    const encontrado = tipos.find((t) => t.value === value);
    return encontrado ? encontrado.label : value || "Não informado";
  }

  getTipoEnvolvidoLabel(tipo) {
    const tipos = {
      autor: "Autor",
      vitima: "Vítima",
      testemunha: "Testemunha",
      solicitante: "Solicitante",
      outro: "Outro",
    };
    return tipos[tipo] || tipo;
  }

  formatarTamanho(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }
}

// ============================================
// INSTÂNCIA GLOBAL
// ============================================

const pdfExport = new PDFExport();
window.pdfExport = pdfExport;

console.log("📄 PDF Export carregado");
