/**
 * PDF EXPORT - Exportação de Documentos (Versão Completa)
 * Guarda Municipal de Pitangueiras - PR
 *
 * Este módulo gerencia:
 * - Exportação de ocorrências para PDF com layout profissional
 * - Exportação de relatórios para PDF
 * - Exportação de abordagens para PDF
 * - Inclusão de imagens anexas
 * - Personalização de layout
 *
 * Depende de: jsPDF, jsPDF-AutoTable, authManager, ocorrenciaManager
 */

// ============================================
// CLASSE PDF EXPORT
// ============================================

class PDFExport {
  constructor() {
    this.initialized = false;
    this._jsPDF = null;
    this.defaultOptions = {
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
      margins: {
        top: 20,
        bottom: 20,
        left: 15,
        right: 15,
      },
      watermark: {
        text: "CÓPIA OFICIAL - GUARDA MUNICIPAL DE PITANGUEIRAS/PR",
        opacity: 0.08,
        fontSize: 32,
        color: "#000000",
        angle: 45,
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
        includeHash: true,
      },
      images: {
        maxWidth: 80,
        maxHeight: 60,
        quality: 0.7,
      },
      sections: {
        dados: true,
        solicitante: true,
        envolvidos: true,
        observacoes: true,
        anexos: true,
        assinatura: true,
        historico: true,
      },
    };

    this.statusColors = {
      draft: "#94a3b8",
      pending_sync: "#f59e0b",
      synced: "#00843d",
      cancelled: "#dc2626",
      rectified: "#003f87",
      pending_rectification: "#f59e0b",
      rectification_rejected: "#dc2626",
    };

    this.imageCache = {};
  }

  // ============================================
  // INICIALIZAÇÃO
  // ============================================

  async init() {
    if (this.initialized) return true;

    try {
      // Tentar obter jsPDF de várias fontes
      if (typeof jsPDF !== "undefined") {
        this._jsPDF = jsPDF;
      } else if (typeof window.jspdf !== "undefined" && window.jspdf.jsPDF) {
        this._jsPDF = window.jspdf.jsPDF;
      } else if (typeof window.jsPDF !== "undefined") {
        this._jsPDF = window.jsPDF;
      }

      if (!this._jsPDF) {
        console.warn("⚠️ jsPDF não encontrado. Tentando carregar...");
        await this.loadLibrary(
          "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
        );
        if (typeof jsPDF !== "undefined") {
          this._jsPDF = jsPDF;
        } else if (typeof window.jspdf !== "undefined" && window.jspdf.jsPDF) {
          this._jsPDF = window.jspdf.jsPDF;
        }
      }

      if (!this._jsPDF) {
        throw new Error("jsPDF não disponível mesmo após carregamento");
      }

      if (typeof this._jsPDF.prototype.autoTable === "undefined") {
        console.warn("⚠️ jsPDF-AutoTable não encontrado. Carregando...");
        await this.loadLibrary(
          "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js",
        );
        if (typeof window.jspdf !== "undefined" && window.jspdf.autoTable) {
          window.jspdf.autoTable(this._jsPDF);
        }
      }

      this.initialized = true;
      console.log("📄 PDF Export inicializado com sucesso");
      return true;
    } catch (error) {
      console.error("❌ Erro ao inicializar PDF Export:", error);
      this.initialized = false;
      return false;
    }
  }

  loadLibrary(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Erro ao carregar: ${url}`));
      document.head.appendChild(script);
      setTimeout(() => resolve(), 8000);
    });
  }

  getJSPDF() {
    if (!this._jsPDF) {
      throw new Error("jsPDF não inicializado. Chame init() primeiro.");
    }
    return this._jsPDF;
  }

  // ============================================
  // CARREGAR IMAGEM
  // ============================================

  async carregarImagemBase64(url) {
    if (!url) return null;
    if (this.imageCache[url]) return this.imageCache[url];

    try {
      const response = await fetch(url, { mode: "cors" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result;
          this.imageCache[url] = base64;
          resolve(base64);
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.warn("Erro ao carregar imagem:", url, error.message);
      return null;
    }
  }

  // ============================================
  // EXPORTAÇÃO DE OCORRÊNCIA
  // ============================================

  async exportarOcorrencia(ocorrenciaId, options = {}) {
    try {
      await this.init();

      const result = await ocorrenciaManager.buscar(ocorrenciaId);
      if (!result.success || !result.data) {
        throw new Error("Ocorrência não encontrada");
      }
      const ocorrencia = result.data;

      const envolvidosResult =
        await ocorrenciaManager.listarEnvolvidos(ocorrenciaId);
      const envolvidos = envolvidosResult.success ? envolvidosResult.data : [];

      const anexosResult = await ocorrenciaManager.listarAnexos(ocorrenciaId);
      const anexos = anexosResult.success ? anexosResult.data : [];

      const historicoResult =
        await ocorrenciaManager.buscarHistorico(ocorrenciaId);
      const historico = historicoResult.success ? historicoResult.data : [];

      const opts = { ...this.defaultOptions, ...options };

      const imagensUrls = anexos
        .filter((a) => a.tipo_arquivo === "image" || a.tipo === "image")
        .map((a) => a.url);
      const imagensCarregadas = await Promise.all(
        imagensUrls.map(async (url) => ({
          url,
          base64: await this.carregarImagemBase64(url),
        })),
      );

      const anexosComImagens = anexos.map((anexo) => {
        if (anexo.tipo_arquivo === "image" || anexo.tipo === "image") {
          const encontrado = imagensCarregadas.find(
            (img) => img.url === anexo.url,
          );
          return { ...anexo, base64: encontrado ? encontrado.base64 : null };
        }
        return anexo;
      });

      const doc = await this.gerarPDFOcorrencia(
        ocorrencia,
        envolvidos,
        anexosComImagens,
        historico,
        opts,
      );

      const nomeArquivo = `Ocorrencia_${ocorrencia.numero_ocorrencia || "Rascunho"}_${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(nomeArquivo);

      return { success: true, fileName: nomeArquivo };
    } catch (error) {
      console.error("❌ Erro ao exportar ocorrência:", error);
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // GERAR PDF OCORRÊNCIA
  // ============================================

  async gerarPDFOcorrencia(ocorrencia, envolvidos, anexos, historico, options) {
    const jsPDF = this.getJSPDF();
    const doc = new jsPDF(options);
    const pageWidth = doc.internal.pageSize.width;
    const margin = options.margins.left || 15;
    let y = 15;

    const titulo = `Ocorrência ${ocorrencia.numero_ocorrencia || "Rascunho"} - ${this.getTipoLabel(ocorrencia.tipo_ocorrencia)}`;
    doc.setProperties({
      title: titulo,
      author: ocorrencia.criador?.nome_completo || "Guarda Municipal",
      subject: `Registro de Ocorrência - ${ocorrencia.tipo_ocorrencia || "Sem tipo"}`,
      keywords: `Guarda Municipal, Ocorrência, ${ocorrencia.tipo_ocorrencia || ""}`,
      creator: "Sistema da Guarda Municipal de Pitangueiras - PR",
    });

    // Cabeçalho
    doc.setFillColor(0, 63, 135);
    doc.rect(margin - 5, y - 3, pageWidth - 2 * margin + 10, 28, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("GUARDA MUNICIPAL DE PITANGUEIRAS - PR", pageWidth / 2, y + 6, {
      align: "center",
    });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Sistema de Registro de Ocorrências", pageWidth / 2, y + 14, {
      align: "center",
    });
    doc.setFontSize(8);
    doc.text(`Documento: ${titulo}`, pageWidth / 2, y + 22, {
      align: "center",
    });
    y += 32;

    const numero =
      ocorrencia.numero_ocorrencia ||
      ocorrencia.numero_temporario ||
      "Rascunho";
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 63, 135);
    doc.text(`Ocorrência #${numero}`, margin, y);
    y += 8;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 41, 59);
    doc.text(`Status: ${this.getStatusLabel(ocorrencia.status)}`, margin, y);
    doc.text(
      `Tipo: ${this.getTipoLabel(ocorrencia.tipo_ocorrencia)}`,
      margin + 70,
      y,
    );
    y += 6;

    if (ocorrencia.hash_pericial) {
      doc.setFontSize(7);
      doc.setTextColor(0, 63, 135);
      doc.setFont("helvetica", "italic");
      doc.text(`Hash SHA-256: ${ocorrencia.hash_pericial}`, margin, y);
      y += 6;
      doc.setFont("helvetica", "normal");
    }

    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 4;

    // Informações Gerais
    const infoData = [
      {
        label: "Criado em:",
        value: new Date(ocorrencia.criado_em).toLocaleString("pt-BR"),
      },
      {
        label: "Data/Hora Início:",
        value: ocorrencia.data_hora_inicio
          ? new Date(ocorrencia.data_hora_inicio).toLocaleString("pt-BR")
          : "Não informado",
      },
      {
        label: "Data/Hora Encerramento:",
        value: ocorrencia.data_hora_encerramento
          ? new Date(ocorrencia.data_hora_encerramento).toLocaleString("pt-BR")
          : "Não encerrado",
      },
      {
        label: "Criado por:",
        value: ocorrencia.criador?.nome_completo || "Desconhecido",
      },
    ];

    if (ocorrencia.local_ocorrencia)
      infoData.push({ label: "Local:", value: ocorrencia.local_ocorrencia });
    if (ocorrencia.bairro_ocorrencia)
      infoData.push({ label: "Bairro:", value: ocorrencia.bairro_ocorrencia });
    if (ocorrencia.referencia)
      infoData.push({ label: "Referência:", value: ocorrencia.referencia });
    if (ocorrencia.latitude && ocorrencia.longitude) {
      infoData.push({
        label: "Coordenadas:",
        value: `${ocorrencia.latitude.toFixed(6)}, ${ocorrencia.longitude.toFixed(6)}`,
      });
    }

    doc.setDrawColor(200, 200, 200);
    doc.roundedRect(
      margin,
      y - 2,
      pageWidth - 2 * margin,
      10 + infoData.length * 6,
      3,
      3,
      "S",
    );
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(
      margin,
      y - 2,
      pageWidth - 2 * margin,
      10 + infoData.length * 6,
      3,
      3,
      "F",
    );

    y = y + 4;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 63, 135);
    doc.text("INFORMAÇÕES GERAIS", margin + 4, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 41, 59);

    infoData.forEach((item) => {
      doc.setFontSize(9);
      doc.text(`${item.label}`, margin + 6, y);
      doc.setFont("helvetica", "bold");
      doc.text(`${item.value}`, margin + 50, y);
      doc.setFont("helvetica", "normal");
      y += 6;
    });
    y += 4;

    // Solicitante
    if (
      options.sections.solicitante !== false &&
      (ocorrencia.nome_solicitante || ocorrencia.telefone_solicitante)
    ) {
      y += 6;
      doc.setDrawColor(200, 200, 200);
      doc.roundedRect(margin, y - 2, pageWidth - 2 * margin, 30, 3, 3, "S");
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin, y - 2, pageWidth - 2 * margin, 30, 3, 3, "F");

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 63, 135);
      doc.text("DADOS DO SOLICITANTE", margin + 4, y + 4);
      y += 8;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 41, 59);

      const solicitanteData = [
        { label: "Nome:", value: ocorrencia.nome_solicitante || "Anônimo" },
        { label: "CPF:", value: ocorrencia.cpf_solicitante || "Não informado" },
        {
          label: "Telefone:",
          value: ocorrencia.telefone_solicitante || "Não informado",
        },
        {
          label: "Endereço:",
          value: ocorrencia.endereco_solicitante || "Não informado",
        },
      ];

      let sx = margin + 6;
      let sy = y;
      solicitanteData.forEach((item) => {
        if (
          item.value &&
          item.value !== "Não informado" &&
          item.value !== "Anônimo"
        ) {
          doc.setFontSize(8);
          doc.text(`${item.label}`, sx, sy);
          doc.setFont("helvetica", "bold");
          doc.text(`${item.value}`, sx + 30, sy);
          doc.setFont("helvetica", "normal");
          sy += 5;
        }
      });
      y = sy + 4;
    }

    // Envolvidos
    if (options.sections.envolvidos !== false && envolvidos.length > 0) {
      y += 6;
      doc.setDrawColor(200, 200, 200);
      doc.roundedRect(
        margin,
        y - 2,
        pageWidth - 2 * margin,
        10 + envolvidos.length * 12,
        3,
        3,
        "S",
      );
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(
        margin,
        y - 2,
        pageWidth - 2 * margin,
        10 + envolvidos.length * 12,
        3,
        3,
        "F",
      );

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 63, 135);
      doc.text(`ENVOLVIDOS (${envolvidos.length})`, margin + 4, y + 4);
      y += 8;

      envolvidos.forEach((env, idx) => {
        const tipo = this.getTipoEnvolvidoLabel(env.tipo);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text(`${idx + 1}. ${tipo}:`, margin + 6, y);
        doc.setFont("helvetica", "normal");
        doc.text(`${env.nome_completo || "N/A"}`, margin + 40, y);
        if (env.cpf) {
          doc.text(`CPF: ${env.cpf}`, margin + 100, y);
        }
        y += 6;
      });
      y += 4;
    }

    // Observações
    if (options.sections.observacoes !== false && ocorrencia.observacoes) {
      y += 6;
      doc.setDrawColor(200, 200, 200);
      doc.roundedRect(margin, y - 2, pageWidth - 2 * margin, 20, 3, 3, "S");
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin, y - 2, pageWidth - 2 * margin, 20, 3, 3, "F");

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 63, 135);
      doc.text("OBSERVAÇÕES", margin + 4, y + 4);
      y += 8;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 41, 59);
      const textoQuebrado = doc.splitTextToSize(
        ocorrencia.observacoes,
        pageWidth - 2 * margin - 12,
      );
      doc.text(textoQuebrado, margin + 6, y);
      y += textoQuebrado.length * 5 + 4;
    }

    // Anexos (imagens)
    const imagensParaExibir = anexos.filter(
      (a) => a.base64 && (a.tipo_arquivo === "image" || a.tipo === "image"),
    );
    if (options.sections.anexos !== false && imagensParaExibir.length > 0) {
      y += 6;
      doc.setDrawColor(200, 200, 200);
      doc.roundedRect(margin, y - 2, pageWidth - 2 * margin, 15, 3, 3, "S");
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin, y - 2, pageWidth - 2 * margin, 15, 3, 3, "F");

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 63, 135);
      doc.text(
        `ANEXOS (${imagensParaExibir.length} IMAGENS)`,
        margin + 4,
        y + 4,
      );
      y += 10;

      const maxHeight = options.images.maxHeight || 50;
      const spacing = 6;
      const cols = 2;
      const imgWidth = (pageWidth - 2 * margin - (cols - 1) * spacing) / cols;

      let imgX = margin + 6;
      let imgY = y;
      let colCount = 0;

      for (const img of imagensParaExibir) {
        try {
          const base64 = img.base64;
          if (!base64) continue;
          const imgObj = new Image();
          imgObj.src = base64;
          await new Promise((resolve) => {
            if (imgObj.complete) resolve();
            else imgObj.onload = resolve;
          });
          const aspectRatio = imgObj.width / imgObj.height;
          let w = Math.min(imgWidth, 70);
          let h = w / aspectRatio;
          if (h > maxHeight) {
            h = maxHeight;
            w = h * aspectRatio;
          }
          doc.addImage(base64, "JPEG", imgX, imgY, w, h);
          doc.setFontSize(6);
          doc.setTextColor(100, 100, 100);
          const nome = img.nome_arquivo || "Imagem";
          const nomeExibido =
            nome.length > 20 ? nome.slice(0, 18) + "..." : nome;
          doc.text(nomeExibido, imgX, imgY + h + 4);

          imgX += w + spacing;
          colCount++;
          if (colCount >= cols) {
            imgX = margin + 6;
            imgY += h + 10;
            colCount = 0;
          }
        } catch (e) {
          console.warn("Erro ao adicionar imagem:", e.message);
        }
      }
      y = imgY + 10;
    }

    // Histórico
    if (
      options.sections.historico !== false &&
      historico &&
      historico.length > 1
    ) {
      y += 6;
      doc.setDrawColor(200, 200, 200);
      doc.roundedRect(
        margin,
        y - 2,
        pageWidth - 2 * margin,
        15 + Math.min(historico.length, 4) * 10,
        3,
        3,
        "S",
      );
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(
        margin,
        y - 2,
        pageWidth - 2 * margin,
        15 + Math.min(historico.length, 4) * 10,
        3,
        3,
        "F",
      );

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 63, 135);
      doc.text("HISTÓRICO DE VERSÕES", margin + 4, y + 4);
      y += 8;
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 41, 59);

      const sorted = [...historico].sort(
        (a, b) => new Date(b.criado_em) - new Date(a.criado_em),
      );
      const mostrar = sorted.slice(0, 4);
      mostrar.forEach((item) => {
        const versao = item.numero_versao || 1;
        const data = new Date(item.criado_em).toLocaleString("pt-BR");
        const isOriginal = item.is_original;
        const status = this.getStatusLabel(item.status);
        doc.text(
          `${isOriginal ? "Original" : `v${versao}`} - ${data} (${status})`,
          margin + 6,
          y,
        );
        y += 6;
      });
      if (sorted.length > 4) {
        doc.text(`+ ${sorted.length - 4} outras versões`, margin + 6, y);
        y += 6;
      }
      y += 4;
    }

    // Rodapé
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setDrawColor(200, 200, 200);
      doc.line(
        margin,
        doc.internal.pageSize.height - 12,
        pageWidth - margin,
        doc.internal.pageSize.height - 12,
      );
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Guarda Municipal de Pitangueiras - PR | ${new Date().toLocaleString("pt-BR")}`,
        margin,
        doc.internal.pageSize.height - 5,
      );
      if (options.footer.includeHash && ocorrencia.hash_pericial) {
        const hashShort = ocorrencia.hash_pericial.substring(0, 16) + "...";
        doc.text(
          `Hash: ${hashShort}`,
          pageWidth / 2,
          doc.internal.pageSize.height - 5,
          { align: "center" },
        );
      }
      doc.text(
        `Página ${i} de ${pageCount}`,
        pageWidth - margin,
        doc.internal.pageSize.height - 5,
        { align: "right" },
      );
    }

    // Marca d'água
    if (options.watermark) {
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(options.watermark.fontSize || 32);
        doc.setTextColor(200, 200, 200);
        doc.setFont("helvetica", "bold");
        try {
          doc.text(
            options.watermark.text,
            pageWidth / 2,
            doc.internal.pageSize.height / 2,
            {
              align: "center",
              angle: options.watermark.angle || 45,
            },
          );
        } catch (e) {
          doc.text(
            options.watermark.text,
            pageWidth / 2,
            doc.internal.pageSize.height / 2,
            {
              align: "center",
            },
          );
        }
      }
    }

    return doc;
  }

  // ============================================
  // EXPORTAÇÃO DE RELATÓRIO
  // ============================================

  async exportarRelatorio(tipo, dados, options = {}) {
    try {
      await this.init();

      const opts = { ...this.defaultOptions, ...options };

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
          throw new Error(`Tipo de relatório não suportado: ${tipo}`);
      }

      const nomeArquivo = `Relatorio_${tipo}_${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(nomeArquivo);
      console.log(`✅ Relatório ${tipo} exportado com sucesso`);
      return { success: true, fileName: nomeArquivo };
    } catch (error) {
      console.error("❌ Erro ao exportar relatório:", error);
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // PDF - RELATÓRIO DE DESEMPENHO
  // ============================================

  async gerarPDFDesempenho(dados, options) {
    const jsPDF = this.getJSPDF();
    const doc = new jsPDF(options);
    const pageWidth = doc.internal.pageSize.width;
    const margin = options.margins?.left || 15;

    doc.setProperties({
      title: options.title || "Relatório de Desempenho - Guarda Municipal",
      author: options.author || "Guarda Municipal de Pitangueiras - PR",
      subject: options.subject || "Desempenho operacional dos guardas",
      keywords:
        options.keywords ||
        "Guarda Municipal, Desempenho, Ocorrências, Abordagens",
      creator: "Sistema da Guarda Municipal de Pitangueiras - PR",
    });

    let y = 15;
    doc.setFillColor(0, 63, 135);
    doc.rect(margin - 5, y - 3, pageWidth - 2 * margin + 10, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("GUARDA MUNICIPAL DE PITANGUEIRAS - PR", pageWidth / 2, y + 6, {
      align: "center",
    });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(
      options.title || "Relatório de Desempenho",
      pageWidth / 2,
      y + 14,
      { align: "center" },
    );
    y += 28;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 63, 135);
    doc.text(options.title || "Relatório de Desempenho", margin, y);
    y += 8;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 41, 59);
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, margin, y);
    y += 8;

    const totalGuardas = dados.totalGuardas || dados.ranking?.length || 0;
    const totalOcorrencias = dados.totalOcorrencias || 0;
    const totalAbordagens = dados.totalAbordagens || 0;

    doc.text(`Total de Guardas: ${totalGuardas}`, margin, y);
    y += 6;
    doc.text(`Total de Ocorrências: ${totalOcorrencias}`, margin, y);
    y += 6;
    doc.text(`Total de Abordagens: ${totalAbordagens}`, margin, y);
    y += 10;

    if (dados.ranking && dados.ranking.length > 0) {
      const tableData = dados.ranking.map((item, index) => [
        index + 1,
        item.nome || "Desconhecido",
        item.matricula || "-",
        item.ocorrencias?.total || 0,
        item.ocorrencias?.finalizadas || 0,
        `${item.taxa_resolucao || 0}%`,
        item.abordagens?.total || 0,
        item.total_atendimentos || 0,
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
        styles: { fontSize: 8, cellPadding: 3 },
        alternateRowStyles: { fillColor: [245, 247, 250] },
      });
    }

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setDrawColor(200, 200, 200);
      doc.line(
        margin,
        doc.internal.pageSize.height - 12,
        pageWidth - margin,
        doc.internal.pageSize.height - 12,
      );
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Guarda Municipal de Pitangueiras - PR | ${new Date().toLocaleString("pt-BR")}`,
        margin,
        doc.internal.pageSize.height - 5,
      );
      doc.text(
        `Página ${i} de ${pageCount}`,
        pageWidth - margin,
        doc.internal.pageSize.height - 5,
        { align: "right" },
      );
    }

    if (options.watermark) {
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(options.watermark.fontSize || 32);
        doc.setTextColor(200, 200, 200);
        doc.setFont("helvetica", "bold");
        try {
          doc.text(
            options.watermark.text,
            pageWidth / 2,
            doc.internal.pageSize.height / 2,
            {
              align: "center",
              angle: options.watermark.angle || 45,
            },
          );
        } catch (e) {
          doc.text(
            options.watermark.text,
            pageWidth / 2,
            doc.internal.pageSize.height / 2,
            {
              align: "center",
            },
          );
        }
      }
    }

    return doc;
  }

  // ============================================
  // PDF - RELATÓRIO DE OCORRÊNCIAS (LISTA)
  // ============================================

  async gerarPDFListaOcorrencias(dados, options) {
    const jsPDF = this.getJSPDF();
    const doc = new jsPDF(options);
    const pageWidth = doc.internal.pageSize.width;
    const margin = options.margins?.left || 15;

    doc.setProperties({
      title: options.title || "Lista de Ocorrências - Guarda Municipal",
      author: options.author || "Guarda Municipal de Pitangueiras - PR",
      subject: options.subject || "Listagem de ocorrências registradas",
      keywords: options.keywords || "Guarda Municipal, Ocorrências, Listagem",
      creator: "Sistema da Guarda Municipal de Pitangueiras - PR",
    });

    let y = 15;
    doc.setFillColor(0, 63, 135);
    doc.rect(margin - 5, y - 3, pageWidth - 2 * margin + 10, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("GUARDA MUNICIPAL DE PITANGUEIRAS - PR", pageWidth / 2, y + 6, {
      align: "center",
    });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(options.title || "Lista de Ocorrências", pageWidth / 2, y + 14, {
      align: "center",
    });
    y += 28;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 63, 135);
    doc.text(options.title || "Lista de Ocorrências", margin, y);
    y += 8;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 41, 59);
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, margin, y);
    y += 8;

    const ocorrencias = dados.ocorrencias || [];
    doc.text(`Total: ${ocorrencias.length || 0} ocorrência(s)`, margin, y);
    y += 10;

    if (ocorrencias.length > 0) {
      const tableData = ocorrencias.map((item) => [
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
        },
        columnStyles: {
          0: { cellWidth: 35 },
          1: { cellWidth: 25, halign: "center" },
          2: { cellWidth: 35 },
          3: { cellWidth: 50 },
          4: { cellWidth: 30, halign: "center" },
        },
        styles: { fontSize: 8, cellPadding: 3 },
        alternateRowStyles: { fillColor: [245, 247, 250] },
      });
    }

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setDrawColor(200, 200, 200);
      doc.line(
        margin,
        doc.internal.pageSize.height - 12,
        pageWidth - margin,
        doc.internal.pageSize.height - 12,
      );
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Guarda Municipal de Pitangueiras - PR | ${new Date().toLocaleString("pt-BR")}`,
        margin,
        doc.internal.pageSize.height - 5,
      );
      doc.text(
        `Página ${i} de ${pageCount}`,
        pageWidth - margin,
        doc.internal.pageSize.height - 5,
        { align: "right" },
      );
    }

    if (options.watermark) {
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(options.watermark.fontSize || 32);
        doc.setTextColor(200, 200, 200);
        doc.setFont("helvetica", "bold");
        try {
          doc.text(
            options.watermark.text,
            pageWidth / 2,
            doc.internal.pageSize.height / 2,
            {
              align: "center",
              angle: options.watermark.angle || 45,
            },
          );
        } catch (e) {
          doc.text(
            options.watermark.text,
            pageWidth / 2,
            doc.internal.pageSize.height / 2,
            {
              align: "center",
            },
          );
        }
      }
    }

    return doc;
  }

  // ============================================
  // PDF - RELATÓRIO DE ABORDAGENS
  // ============================================

  async gerarPDFAbordagens(dados, options) {
    const jsPDF = this.getJSPDF();
    const doc = new jsPDF(options);
    const pageWidth = doc.internal.pageSize.width;
    const margin = options.margins?.left || 15;

    doc.setProperties({
      title: options.title || "Relatório de Abordagens - Guarda Municipal",
      author: options.author || "Guarda Municipal de Pitangueiras - PR",
      subject: options.subject || "Relatório de abordagens operacionais",
      keywords:
        options.keywords || "Guarda Municipal, Abordagens, Veículos, Pessoas",
      creator: "Sistema da Guarda Municipal de Pitangueiras - PR",
    });

    let y = 15;
    doc.setFillColor(0, 63, 135);
    doc.rect(margin - 5, y - 3, pageWidth - 2 * margin + 10, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("GUARDA MUNICIPAL DE PITANGUEIRAS - PR", pageWidth / 2, y + 6, {
      align: "center",
    });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(
      options.title || "Relatório de Abordagens",
      pageWidth / 2,
      y + 14,
      { align: "center" },
    );
    y += 28;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 63, 135);
    doc.text(options.title || "Relatório de Abordagens", margin, y);
    y += 8;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 41, 59);
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, margin, y);
    y += 8;

    const veiculos = dados.veiculos || [];
    const pessoas = dados.pessoas || [];

    doc.text(`Total de Veículos: ${veiculos.length}`, margin, y);
    y += 6;
    doc.text(`Total de Pessoas: ${pessoas.length}`, margin, y);
    y += 10;

    if (veiculos.length > 0) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 63, 135);
      doc.text("Veículos", margin, y);
      y += 6;

      const tableData = veiculos.map((v) => [
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
        },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 40 },
          2: { cellWidth: 25 },
          3: { cellWidth: 50 },
          4: { cellWidth: 30 },
        },
        styles: { fontSize: 8, cellPadding: 2 },
        alternateRowStyles: { fillColor: [245, 247, 250] },
      });
      y = doc.lastAutoTable.finalY + 5;
    }

    if (pessoas.length > 0) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 63, 135);
      doc.text("Pessoas", margin, y);
      y += 6;

      const tableData = pessoas.map((p) => [
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
        },
        columnStyles: {
          0: { cellWidth: 50 },
          1: { cellWidth: 35 },
          2: { cellWidth: 50 },
          3: { cellWidth: 35 },
        },
        styles: { fontSize: 8, cellPadding: 2 },
        alternateRowStyles: { fillColor: [245, 247, 250] },
      });
    }

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setDrawColor(200, 200, 200);
      doc.line(
        margin,
        doc.internal.pageSize.height - 12,
        pageWidth - margin,
        doc.internal.pageSize.height - 12,
      );
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Guarda Municipal de Pitangueiras - PR | ${new Date().toLocaleString("pt-BR")}`,
        margin,
        doc.internal.pageSize.height - 5,
      );
      doc.text(
        `Página ${i} de ${pageCount}`,
        pageWidth - margin,
        doc.internal.pageSize.height - 5,
        { align: "right" },
      );
    }

    if (options.watermark) {
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(options.watermark.fontSize || 32);
        doc.setTextColor(200, 200, 200);
        doc.setFont("helvetica", "bold");
        try {
          doc.text(
            options.watermark.text,
            pageWidth / 2,
            doc.internal.pageSize.height / 2,
            {
              align: "center",
              angle: options.watermark.angle || 45,
            },
          );
        } catch (e) {
          doc.text(
            options.watermark.text,
            pageWidth / 2,
            doc.internal.pageSize.height / 2,
            {
              align: "center",
            },
          );
        }
      }
    }

    return doc;
  }

  // ============================================
  // PDF - RELATÓRIO DE RETIFICAÇÕES
  // ============================================

  async gerarPDFRetificacoes(dados, options) {
    const jsPDF = this.getJSPDF();
    const doc = new jsPDF(options);
    const pageWidth = doc.internal.pageSize.width;
    const margin = options.margins?.left || 15;

    doc.setProperties({
      title: options.title || "Relatório de Retificações - Guarda Municipal",
      author: options.author || "Guarda Municipal de Pitangueiras - PR",
      subject: options.subject || "Relatório de retificações de ocorrências",
      keywords:
        options.keywords || "Guarda Municipal, Retificações, Ocorrências",
      creator: "Sistema da Guarda Municipal de Pitangueiras - PR",
    });

    let y = 15;
    doc.setFillColor(0, 63, 135);
    doc.rect(margin - 5, y - 3, pageWidth - 2 * margin + 10, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("GUARDA MUNICIPAL DE PITANGUEIRAS - PR", pageWidth / 2, y + 6, {
      align: "center",
    });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(
      options.title || "Relatório de Retificações",
      pageWidth / 2,
      y + 14,
      { align: "center" },
    );
    y += 28;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 63, 135);
    doc.text(options.title || "Relatório de Retificações", margin, y);
    y += 8;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 41, 59);
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, margin, y);
    y += 8;

    const retificacoes = dados.retificacoes || [];
    const aprovadas = retificacoes.filter(
      (r) => r.status === "rectified",
    ).length;
    const pendentes = retificacoes.filter(
      (r) => r.status === "pending_rectification",
    ).length;
    const rejeitadas = retificacoes.filter(
      (r) => r.status === "rectification_rejected",
    ).length;

    doc.text(`Total: ${retificacoes.length}`, margin, y);
    y += 6;
    doc.text(`Aprovadas: ${aprovadas}`, margin, y);
    y += 6;
    doc.text(`Pendentes: ${pendentes}`, margin, y);
    y += 6;
    doc.text(`Rejeitadas: ${rejeitadas}`, margin, y);
    y += 10;

    if (retificacoes.length > 0) {
      const tableData = retificacoes.map((item) => [
        item.numero || "N/A",
        item.data_solicitacao
          ? new Date(item.data_solicitacao).toLocaleDateString("pt-BR")
          : "N/A",
        item.tipo || "N/A",
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
        },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 25, halign: "center" },
          2: { cellWidth: 35 },
          3: { cellWidth: 30, halign: "center" },
          4: { cellWidth: 50 },
        },
        styles: { fontSize: 7, cellPadding: 2 },
        alternateRowStyles: { fillColor: [245, 247, 250] },
      });
    }

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setDrawColor(200, 200, 200);
      doc.line(
        margin,
        doc.internal.pageSize.height - 12,
        pageWidth - margin,
        doc.internal.pageSize.height - 12,
      );
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Guarda Municipal de Pitangueiras - PR | ${new Date().toLocaleString("pt-BR")}`,
        margin,
        doc.internal.pageSize.height - 5,
      );
      doc.text(
        `Página ${i} de ${pageCount}`,
        pageWidth - margin,
        doc.internal.pageSize.height - 5,
        { align: "right" },
      );
    }

    if (options.watermark) {
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(options.watermark.fontSize || 32);
        doc.setTextColor(200, 200, 200);
        doc.setFont("helvetica", "bold");
        try {
          doc.text(
            options.watermark.text,
            pageWidth / 2,
            doc.internal.pageSize.height / 2,
            {
              align: "center",
              angle: options.watermark.angle || 45,
            },
          );
        } catch (e) {
          doc.text(
            options.watermark.text,
            pageWidth / 2,
            doc.internal.pageSize.height / 2,
            {
              align: "center",
            },
          );
        }
      }
    }

    return doc;
  }

  // ============================================
  // EXPORTAÇÃO EM LOTE
  // ============================================

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
  // EXPORTAÇÃO CSV
  // ============================================

  exportarCSV(dados, nomeArquivo = "dados.csv", opcoes = {}) {
    try {
      if (!dados || dados.length === 0)
        throw new Error("Nenhum dado para exportar");

      const cabecalhos = Object.keys(dados[0]);
      let csv = cabecalhos.join(",") + "\n";

      dados.forEach((linha) => {
        const valores = cabecalhos.map((chave) => {
          const valor = linha[chave] || "";
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

console.log("📄 PDF Export carregado (versão completa)");
