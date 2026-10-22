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
 * - 🔥 NOVO: Seção específica para assinaturas
 * - 🔥 NOVO: Identificação do papel de cada signatário
 * - 🔥 NOVO: Assinaturas NÃO aparecem na galeria de anexos
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
        assinaturas: true, // 🔥 NOVO: Seção de assinaturas
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

    // 🔥 NOVO: Labels para tipos de assinatura
    this.tiposAssinaturaLabels = {
      autor: "Autor",
      vitima: "Vítima",
      testemunha: "Testemunha",
      solicitante: "Solicitante",
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

      // P4: equipe operacional do BO, separada dos envolvidos civis.
      const guardasResult = ocorrenciaManager.listarGuardas
        ? await ocorrenciaManager.listarGuardas(ocorrenciaId)
        : { success: true, data: [] };
      const guardas = guardasResult.success ? guardasResult.data : [];

      const anexosResult = await ocorrenciaManager.listarAnexos(ocorrenciaId);
      const anexos = anexosResult.success ? anexosResult.data : [];

      // 🔥 NOVO: Buscar assinaturas separadamente
      const assinaturasResult =
        await ocorrenciaManager.listarAssinaturas(ocorrenciaId);
      const assinaturas = assinaturasResult.success
        ? assinaturasResult.data
        : [];

      // 🔥 FILTRAR: Separar anexos reais de assinaturas
      const anexosReais = anexos.filter((a) => a.tipo !== "assinatura");

      const historicoResult =
        await ocorrenciaManager.buscarHistorico(ocorrenciaId);
      const historico = historicoResult.success ? historicoResult.data : [];

      const opts = { ...this.defaultOptions, ...options };

      // Carregar imagens apenas dos anexos reais (não assinaturas)
      const imagensUrls = anexosReais
        .filter((a) => a.tipo_arquivo === "image" || a.tipo === "image")
        .map((a) => a.url);
      const imagensCarregadas = await Promise.all(
        imagensUrls.map(async (url) => ({
          url,
          base64: await this.carregarImagemBase64(url),
        })),
      );

      const anexosComImagens = anexosReais.map((anexo) => {
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
        guardas,
        anexosComImagens,
        assinaturas, // 🔥 NOVO: Passar assinaturas
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
  // GERAR PDF OCORRÊNCIA (COM ASSINATURAS)
  // ============================================

  async gerarPDFOcorrencia(
      ocorrencia,
      envolvidos,
      guardas,
      anexos,
      assinaturas,
      historico,
      options,
    ) {
      const jsPDF = this.getJSPDF();
      const doc = new jsPDF({
        ...options,
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      });
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      const margin = 14;
      const contentWidth = pageWidth - margin * 2;
      const ink = [0, 0, 0];
      const rule = [45, 45, 45];
      const softRule = [125, 125, 125];
      const logoUrl = options.logoUrl || "assets/logo-guarda.png";
      const logo = await this.carregarImagemBase64(logoUrl);
      const numero = ocorrencia.numero_ocorrencia || ocorrencia.numero_temporario || "Rascunho";
      const emissao = new Date();
      const emissaoTexto = emissao.toLocaleString("pt-BR");
      const titulo = `BO ${numero} — ${this.getTipoLabel(ocorrencia.tipo_ocorrencia)}`;

      doc.setProperties({
        title: titulo,
        author: ocorrencia.criador?.nome_completo || "Guarda Municipal de Pitangueiras/PR",
        subject: "Registro de ocorrência — Guarda Municipal de Pitangueiras/PR",
        keywords: `Guarda Municipal, BO, ${ocorrencia.tipo_ocorrencia || ""}`,
        creator: "Sistema de Registro de Ocorrências — Guarda Municipal de Pitangueiras/PR",
      });

      const safe = (value, fallback = "Não informado") =>
        value === null || value === undefined || String(value).trim() === ""
          ? fallback
          : String(value);
      const hasValue = (value) =>
        value !== null && value !== undefined && String(value).trim() !== "";
      const date = (value, fallback = "Não informado") => {
        if (!value) return fallback;
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? safe(value, fallback) : d.toLocaleString("pt-BR");
      };
      const shortDate = (value, fallback = "Não informado") => {
        if (!value) return fallback;
        const dateOnly = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? safe(value, fallback) : d.toLocaleDateString("pt-BR");
      };
      const role = (value) =>
        ({ responsavel: "RESPONSÁVEL", acompanhante: "ACOMPANHANTE" }[value] || String(value || "PARTICIPANTE").toUpperCase());
      const equipeAtiva = (guardas || []).filter((g) => g.esta_ativo !== false);
      const footerLimit = pageHeight - 19;
      let page = 1;
      let y = 39;
      let historicoResumo = "";

      // Cabeçalho institucional em três blocos: brasão, identificação e número do BO.
      const drawHeader = (pageNumber) => {
        doc.setPage(pageNumber);
        doc.setDrawColor(...rule);
        doc.setLineWidth(0.55);
        doc.line(margin, 4, pageWidth - margin, 4);
        if (logo) {
          try {
            doc.addImage(logo, "PNG", margin + 1, 6, 21, 21, undefined, "FAST");
          } catch (e) {
            doc.setLineWidth(0.35);
            doc.rect(margin + 1, 6, 21, 21);
          }
        }

        const centerX = pageWidth / 2;
        doc.setTextColor(...ink);
        doc.setFont("times", "bold");
        doc.setFontSize(8.5);
        doc.text("GUARDA MUNICIPAL DE PITANGUEIRAS/PR", centerX, 9, { align: "center" });
        doc.setFontSize(7.2);
        doc.text("REGISTRO OPERACIONAL", centerX, 15, { align: "center" });
        doc.setFontSize(9);
        doc.text("BOLETIM DE OCORRÊNCIA", centerX, 21, { align: "center" });
        doc.setFontSize(6.2);
        doc.text("COMUNICAÇÃO DA OCORRÊNCIA", centerX, 26, { align: "center" });

        const rightX = pageWidth - margin - 35;
        doc.setDrawColor(...softRule);
        doc.setLineWidth(0.25);
        doc.line(rightX - 3, 6, rightX - 3, 27);
        doc.setFont("courier", "bold");
        doc.setFontSize(6.2);
        doc.text("NÚMERO DO BO", rightX, 9);
        doc.setFontSize(8.2);
        const numeroLines = doc.splitTextToSize(String(numero), 34).slice(0, 2);
        doc.text(numeroLines, rightX, 14);
        doc.setFont("courier", "normal");
        doc.setFontSize(5.8);
        doc.text(`EMISSÃO ${shortDate(emissao)}`, rightX, 24);

        doc.setDrawColor(...rule);
        doc.setLineWidth(0.55);
        doc.line(margin, 31, pageWidth - margin, 31);
        doc.setLineWidth(0.2);
        doc.line(margin, 32.2, pageWidth - margin, 32.2);
      };

      const drawFooter = (pageNumber, totalPages) => {
        doc.setPage(pageNumber);
        doc.setDrawColor(...rule);
        doc.setLineWidth(0.45);
        doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
        doc.setTextColor(...ink);
        doc.setFont("courier", "normal");
        doc.setFontSize(5.8);
        doc.text("GUARDA MUNICIPAL DE PITANGUEIRAS/PR  |  SISTEMA DE REGISTRO DE OCORRÊNCIAS", margin, pageHeight - 10);
        doc.text(`EMITIDO EM ${emissaoTexto}`, pageWidth - margin, pageHeight - 10, { align: "right" });
        doc.setFont("courier", "bold");
        doc.text(`PÁGINA ${pageNumber} DE ${totalPages}`, pageWidth / 2, pageHeight - 5, { align: "center" });
      };

      const newPage = () => {
        doc.addPage();
        page = doc.internal.getCurrentPageInfo().pageNumber;
        drawHeader(page);
        y = 39;
      };
      const ensureSpace = (height) => {
        if (y + height > footerLimit) newPage();
      };
      const sectionTitle = (label) => {
        ensureSpace(11);
        doc.setTextColor(...ink);
        doc.setFont("times", "bold");
        doc.setFontSize(8.5);
        doc.text(String(label).toUpperCase(), pageWidth / 2, y + 4, { align: "center" });
        doc.setDrawColor(...rule);
        doc.setLineWidth(0.3);
        doc.line(margin, y + 6.2, pageWidth - margin, y + 6.2);
        y += 9;
      };

      const drawParagraphSection = (label, value, fontSize = 8.1, lineHeight = 3.8) => {
        const text = safe(value, "");
        if (!text) return;
        sectionTitle(label);
        const lines = doc.splitTextToSize(text, contentWidth);
        let offset = 0;
        while (offset < lines.length) {
          const availableLines = Math.max(1, Math.floor((footerLimit - y - 2) / lineHeight));
          const chunk = lines.slice(offset, offset + availableLines);
          doc.setFont("courier", "normal");
          doc.setFontSize(fontSize);
          doc.setTextColor(...ink);
          doc.text(chunk, margin, y + 2.5, { lineHeightFactor: 1.12 });
          y += chunk.length * lineHeight + 4;
          offset += chunk.length;
          if (offset < lines.length) {
            newPage();
            sectionTitle(`${label} — continuação`);
          }
        }
      };

      const prepareField = (item, width) => {
        const labelText = `${String(item[0]).toUpperCase()}: `;
        const valueText = safe(item[1], "—");
        doc.setFont("courier", "bold");
        doc.setFontSize(6.4);
        const labelWidth = doc.getTextWidth(labelText);
        const stacked = labelWidth > width * 0.46;
        const valueWidth = Math.max(12, width - (stacked ? 0 : labelWidth + 1.2));
        doc.setFont("courier", "normal");
        doc.setFontSize(7.2);
        const valueLines = doc.splitTextToSize(valueText, valueWidth);
        const height = Math.max(4, (stacked ? 3.1 : 0) + valueLines.length * 3.2);
        return { labelText, labelWidth, stacked, valueLines, height };
      };

      const drawRow = (items) => {
        if (!items || !items.length) return;
        const gap = items.length === 1 ? 0 : 4;
        const cellWidth = (contentWidth - gap * (items.length - 1)) / items.length;
        const prepared = items.map((item) => prepareField(item, cellWidth));
        const rowHeight = Math.max(...prepared.map((p) => p.height));
        ensureSpace(rowHeight + 3);
        const top = y;
        items.forEach((item, i) => {
          const x = margin + i * (cellWidth + gap);
          const p = prepared[i];
          doc.setTextColor(...ink);
          doc.setFont("courier", "bold");
          doc.setFontSize(6.4);
          if (p.stacked) {
            doc.text(p.labelText.trim(), x, top + 2.5);
            doc.setFont("courier", "normal");
            doc.setFontSize(7.2);
            doc.text(p.valueLines, x, top + 5.7, { lineHeightFactor: 1.05 });
          } else {
            doc.text(p.labelText, x, top + 2.7);
            doc.setFont("courier", "normal");
            doc.setFontSize(7.2);
            doc.text(p.valueLines, x + p.labelWidth + 1.2, top + 2.7, { lineHeightFactor: 1.05 });
          }
          doc.setDrawColor(...softRule);
          doc.setLineWidth(0.15);
          doc.line(x, top + rowHeight + 1, x + cellWidth, top + rowHeight + 1);
        });
        y += rowHeight + 4;
      };

      const drawTable = (titleText, headers, rows, widths) => {
        if (!rows || !rows.length) return;
        sectionTitle(titleText);
        doc.autoTable({
          startY: y,
          margin: { left: margin, right: margin, top: 38, bottom: 18 },
          theme: "grid",
          head: [headers],
          body: rows,
          styles: {
            font: "courier",
            fontSize: 6.8,
            textColor: ink,
            cellPadding: 1.6,
            lineColor: rule,
            lineWidth: 0.18,
            overflow: "linebreak",
            valign: "middle",
          },
          headStyles: {
            fillColor: [255, 255, 255],
            textColor: ink,
            font: "courier",
            fontStyle: "bold",
            fontSize: 6.6,
            lineColor: rule,
            lineWidth: 0.3,
          },
          alternateRowStyles: { fillColor: [255, 255, 255] },
          columnStyles: widths.reduce((result, width, i) => {
            result[i] = { cellWidth: width };
            return result;
          }, {}),
          didDrawPage: (data) => {
            const pageNumber = data.doc.internal.getCurrentPageInfo().pageNumber;
            page = Math.max(page, pageNumber);
            drawHeader(pageNumber);
          },
        });
        page = doc.internal.getCurrentPageInfo().pageNumber;
        y = (doc.lastAutoTable?.finalY || y) + 4;
      };

      drawHeader(page);
      sectionTitle("Identificação do registro");
      drawRow([
        ["Número do BO", numero],
        ["Natureza", this.getTipoLabel(ocorrencia.tipo_ocorrencia)],
        ["Situação", this.getStatusLabel(ocorrencia.status)],
      ]);
      drawRow([
        ["Data e hora do registro", date(ocorrencia.criado_em)],
        ["Origem da comunicação", safe(ocorrencia.forma_solicitacao)],
      ]);
      drawRow([
        ["Início da ocorrência", date(ocorrencia.data_hora_inicio)],
        ["Encerramento", date(ocorrencia.data_hora_encerramento, "Não encerrado")],
      ]);
      if (hasValue(ocorrencia.codigo_operacional)) {
        drawRow([["Código operacional", ocorrencia.codigo_operacional]]);
      }
      if (hasValue(ocorrencia.data_hora_finalizacao) || hasValue(ocorrencia.completado_em)) {
        drawRow([
          ["Finalização", hasValue(ocorrencia.data_hora_finalizacao) ? date(ocorrencia.data_hora_finalizacao) : "—"],
          ["Conclusão", hasValue(ocorrencia.completado_em) ? date(ocorrencia.completado_em) : "—"],
        ]);
      }
      if (hasValue(ocorrencia.modo_criacao)) {
        drawRow([["Modo de criação", ocorrencia.modo_criacao]]);
      }
      if (hasValue(ocorrencia.criador?.nome_completo)) {
        drawRow([["Registrado por", ocorrencia.criador.nome_completo]]);
      }

      if (options.sections.equipe !== false) {
        const equipe = equipeAtiva.length
          ? equipeAtiva
          : [{ papel: "participante", nome_snapshot: "Equipe não informada", matricula_snapshot: "—", perfil_snapshot: "—" }];
        drawTable(
          "Equipe operacional",
          ["PAPEL", "NOME", "MATRÍCULA", "PERFIL"],
          equipe.map((g) => [
            role(g.papel),
            safe(g.nome_snapshot || g.nome_completo),
            safe(g.matricula_snapshot || g.matricula, "—"),
            safe(g.perfil_snapshot || g.perfil, "—"),
          ]),
          [28, 68, 40, 46],
        );
      }

      sectionTitle("Dados do local da ocorrência");
      const camposLocal = [
        ["Local/endereço", ocorrencia.local_ocorrencia],
        ["Bairro da ocorrência", ocorrencia.bairro_ocorrencia],
        ["Rodovia", ocorrencia.rodovia],
        ["Referência", ocorrencia.referencia],
        ["Latitude", ocorrencia.latitude],
        ["Longitude", ocorrencia.longitude],
      ].filter(([, value]) => hasValue(value));
      if (camposLocal.length) {
        for (let i = 0; i < camposLocal.length; i += 2) {
          drawRow(camposLocal.slice(i, i + 2));
        }
      } else {
        drawRow([["Local/endereço", "Não informado"]]);
      }

      if (options.sections.solicitante !== false) {
        sectionTitle("Identificação do solicitante");
        const camposSolicitante = [
          ["Nome", hasValue(ocorrencia.nome_solicitante) ? ocorrencia.nome_solicitante : "Anônimo"],
          ["CPF", ocorrencia.cpf_solicitante],
          ["RG", ocorrencia.rg_solicitante],
          ["Telefone", ocorrencia.telefone_solicitante],
          ["Endereço", ocorrencia.endereco_solicitante],
          ["Bairro", ocorrencia.bairro_solicitante],
          ["Complemento", ocorrencia.complemento],
          ["Código municipal", ocorrencia.codigo_municipal],
          ["Identificação adicional", ocorrencia.identificacao_adicional],
        ].filter(([, value]) => hasValue(value));
        for (let i = 0; i < camposSolicitante.length; i += 2) {
          drawRow(camposSolicitante.slice(i, i + 2));
        }
      }

      if (options.sections.observacoes !== false) {
        drawParagraphSection("Histórico / narrativa da ocorrência", ocorrencia.observacoes);
      }

      sectionTitle("Classificação da ocorrência");
      drawRow([
        ["Natureza constatada", this.getTipoLabel(ocorrencia.tipo_ocorrencia)],
        ["Subtipo", safe(ocorrencia.sub_tipo_ocorrencia, "—")],
      ]);
      drawRow([["Gravidade", safe(ocorrencia.gravidade, "—")]]);

      if (hasValue(ocorrencia.numero_bo) || hasValue(ocorrencia.orgao_bo) || hasValue(ocorrencia.data_bo)) {
        sectionTitle("Referência de BO de outro órgão");
        drawRow([
          ["Número do BO", safe(ocorrencia.numero_bo, "—")],
          ["Órgão registrador", safe(ocorrencia.orgao_bo, "—")],
          ["Data do BO", hasValue(ocorrencia.data_bo) ? shortDate(ocorrencia.data_bo) : "—"],
        ]);
      }

      if (options.sections.envolvidos !== false && envolvidos?.length) {
        drawTable(
          `Envolvidos (${envolvidos.length})`,
          ["PAPEL", "NOME", "RG", "CPF", "TELEFONE"],
          envolvidos.map((e) => [
            this.getTipoEnvolvidoLabel(e.tipo),
            safe(e.nome_completo),
            safe(e.rg, "—"),
            safe(e.cpf, "—"),
            safe(e.telefone, "—"),
          ]),
          [30, 52, 30, 39, 31],
        );
        for (const envolvido of envolvidos) {
          const detalhesEnvolvido = [
            ["Nascimento", hasValue(envolvido.data_nascimento) ? shortDate(envolvido.data_nascimento) : null],
            ["Nome do pai", envolvido.nome_pai],
            ["Nome da mãe", envolvido.nome_mae],
            ["Endereço", envolvido.endereco],
            ["Bairro", envolvido.bairro],
            ["Cidade", envolvido.cidade],
          ].filter(([, value]) => hasValue(value));
          if (detalhesEnvolvido.length) {
            sectionTitle("Dados complementares do envolvido");
            drawRow([["Nome", safe(envolvido.nome_completo)]]);
            for (let i = 0; i < detalhesEnvolvido.length; i += 2) {
              drawRow(detalhesEnvolvido.slice(i, i + 2));
            }
          }
          if (hasValue(envolvido.observacoes)) {
            sectionTitle("Observações do envolvido");
            drawRow([["Nome", safe(envolvido.nome_completo)]]);
            drawParagraphSection("Relato complementar", envolvido.observacoes, 7.4, 3.5);
          }
        }
      }

      if (options.sections.assinaturas !== false && assinaturas?.length) {
        drawTable(
          `Assinaturas (${assinaturas.length})`,
          ["TIPO", "ASSINANTE", "CPF", "RESPONSÁVEL PELA COLETA / DATA"],
          assinaturas.map((a) => [
            this.getTipoAssinaturaLabel(a.tipo),
            safe(a.nome),
            safe(a.cpf, "—"),
            `${safe(a.nome_guarda, "—")} / ${date(a.assinado_em)}`,
          ]),
          [28, 51, 35, 68],
        );
      }

      if (options.sections.historico !== false && historico?.length > 1) {
        const versoes = historico
          .slice()
          .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em))
          .slice(0, 8);
        historicoResumo = versoes
          .map((h) => (h.is_original ? "Original" : `v${h.numero_versao || 1}`))
          .join(" / ");
        sectionTitle("Controle de versões");
        drawRow([["Versões registradas", historicoResumo]]);
      }

      const justificativaRetificacao =
        ocorrencia.justificativa_retificacao || ocorrencia.solicitacao_retificacao_justificativa;
      const isRetificacao =
        hasValue(ocorrencia.ocorrencia_original_id) || Number(ocorrencia.numero_versao || 1) > 1;
      if (isRetificacao || hasValue(justificativaRetificacao)) {
        sectionTitle("Controle de retificação");
        const dataControle = ocorrencia.retificado_em || ocorrencia.solicitada_em;
        drawRow([
          ["Tipo de registro", isRetificacao ? "Retificação vinculada" : "Registro original"],
          ["Versão", safe(ocorrencia.numero_versao, "1")],
          [hasValue(ocorrencia.retificado_em) ? "Retificado em" : "Solicitado em", hasValue(dataControle) ? date(dataControle) : "—"],
        ]);
        if (hasValue(justificativaRetificacao)) {
          drawParagraphSection("Justificativa da retificação", justificativaRetificacao, 7.4, 3.5);
        }
        if (hasValue(ocorrencia.campos_alterados)) {
          const camposAlterados = Array.isArray(ocorrencia.campos_alterados)
            ? ocorrencia.campos_alterados.join(", ")
            : typeof ocorrencia.campos_alterados === "object"
              ? Object.keys(ocorrencia.campos_alterados).join(", ")
              : String(ocorrencia.campos_alterados);
          if (hasValue(camposAlterados)) drawRow([["Campos alterados", camposAlterados]]);
        }
      }
      if (hasValue(ocorrencia.motivo_cancelamento)) {
        sectionTitle("Cancelamento do registro");
        drawRow([
          ["Cancelado em", hasValue(ocorrencia.cancelado_em) ? date(ocorrencia.cancelado_em) : "—"],
        ]);
        drawParagraphSection("Motivo do cancelamento", ocorrencia.motivo_cancelamento, 7.4, 3.5);
      }

      const imagens = (anexos || []).filter(
        (a) => a.base64 && (a.tipo_arquivo === "image" || a.tipo === "image") && a.tipo !== "assinatura",
      );
      if (options.sections.anexos !== false && imagens.length) {
        newPage();
        sectionTitle("Anexos fotográficos");
        for (const img of imagens) {
          try {
            const image = new Image();
            image.src = img.base64;
            await new Promise((resolve) => {
              if (image.complete) resolve();
              else {
                image.onload = resolve;
                image.onerror = resolve;
              }
            });
            const ratio = image.width && image.height ? image.width / image.height : 1.4;
            const width = Math.min(contentWidth - 8, 92);
            const height = Math.min(68, width / ratio);
            if (y + height + 12 > footerLimit) {
              newPage();
              sectionTitle("Anexos fotográficos — continuação");
            }
            const x = margin + (contentWidth - width) / 2;
            doc.setDrawColor(...rule);
            doc.setLineWidth(0.25);
            doc.rect(x - 1, y - 1, width + 2, height + 2);
            const format = String(img.base64).startsWith("data:image/png") ? "PNG" : "JPEG";
            doc.addImage(img.base64, format, x, y, width, height);
            y += height + 3;
            doc.setFont("courier", "normal");
            doc.setFontSize(6.8);
            doc.setTextColor(...ink);
            doc.text(safe(img.nome_arquivo || img.nome, "Anexo fotográfico"), x, y + 2.5);
            y += 7;
          } catch (e) {
            ensureSpace(8);
            doc.setFont("courier", "normal");
            doc.setFontSize(7);
            doc.setTextColor(...ink);
            doc.text(`Imagem não disponível: ${safe(img.nome_arquivo || img.nome, "Anexo")}`, margin, y + 3);
            y += 7;
          }
        }
      }

      if (hasValue(ocorrencia.hash_pericial)) {
        sectionTitle("Integridade do registro");
        drawRow([["Hash registrado no sistema", ocorrencia.hash_pericial]]);
      }

      const totalPages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) drawFooter(i, totalPages);
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

  // 🔥 NOVO: Retorna label do tipo de assinatura
  getTipoAssinaturaLabel(tipo) {
    return this.tiposAssinaturaLabels[tipo] || tipo || "Não informado";
  }

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
