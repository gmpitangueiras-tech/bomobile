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

      const nomeArquivo = `Ocorrencia_${ocorrencia.numero_ocorrencia || "Rascunho"}_${globalThis.obterTimestampBrasilSemFuso().slice(0, 10)}.pdf`;
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
        ({ responsavel: "RESPONSÁVEL", acompanhante: "GM DE APOIO" }[value] || String(value || "PARTICIPANTE").toUpperCase());
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

      // Narrative text is set as an official, fully aligned paragraph. Explicitly
      // normalize paragraph breaks and use an inset content box to keep both edges
      // inside the printable area on every page.
      const drawNarrativeSection = (label, value) => {
        const text = safe(value, "").replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").trim();
        if (!text) return;
        sectionTitle(label);
        const paragraphs = text
          .split(/\n\s*\n/)
          .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim())
          .filter(Boolean);
        const bodyX = margin + 2;
        const bodyWidth = contentWidth - 4;
        const lineHeight = 4.2;
        const drawAlignedLine = (line, baseline, width, justify) => {
          const words = String(line).trim().split(/\s+/).filter(Boolean);
          if (!justify || words.length < 2) {
            doc.text(String(line), bodyX, baseline);
            return;
          }
          const wordWidths = words.map((word) => doc.getTextWidth(word));
          const totalWordsWidth = wordWidths.reduce((sum, wordWidth) => sum + wordWidth, 0);
          const gap = (width - totalWordsWidth) / (words.length - 1);
          const normalGap = doc.getTextWidth(" ");
          if (!Number.isFinite(gap) || gap < normalGap * 0.6 || gap > normalGap * 4) {
            doc.text(String(line), bodyX, baseline);
            return;
          }
          let x = bodyX;
          words.forEach((word, index) => {
            doc.text(word, x, baseline);
            x += wordWidths[index] + (index < words.length - 1 ? gap : 0);
          });
        };
        doc.setFont("times", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...ink);
        for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex += 1) {
          const lines = doc.splitTextToSize(paragraphs[paragraphIndex], bodyWidth);
          let offset = 0;
          while (offset < lines.length) {
            const availableLines = Math.max(1, Math.floor((footerLimit - y - 5) / lineHeight));
            const chunk = lines.slice(offset, offset + availableLines);
            chunk.forEach((line, index) => {
              const lineIndex = offset + index;
              drawAlignedLine(line, y + 3, bodyWidth, lineIndex < lines.length - 1);
              y += lineHeight;
            });
            y += 2;
            offset += chunk.length;
            if (offset < lines.length) {
              newPage();
              sectionTitle(`${label} — continuação`);
              doc.setFont("times", "normal");
              doc.setFontSize(9);
              doc.setTextColor(...ink);
            }
          }
          if (paragraphIndex < paragraphs.length - 1) y += 2;
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
        drawNarrativeSection("Descrição do fato", ocorrencia.observacoes);
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

        const automaticColumns = imagens.length === 1 ? 1 : imagens.length >= 6 ? 3 : 2;
        const requestedColumns = Number(options.attachmentColumns);
        const columns = Number.isInteger(requestedColumns) && requestedColumns >= 1 && requestedColumns <= 3
          ? requestedColumns
          : automaticColumns;
        const gapX = 5;
        const gapY = 5;
        const cellWidth = (contentWidth - gapX * (columns - 1)) / columns;
        const maxImageWidth = cellWidth - 8;
        const maxImageHeight = columns === 1 ? 150 : columns === 2 ? 64 : 46;
        const preparedImages = [];

        for (const img of imagens) {
          const caption = safe(img.nome_arquivo || img.nome, "Anexo fotográfico");
          let prepared = {
            base64: img.base64,
            caption,
            loaded: false,
            width: cellWidth - 8,
            height: 24,
            format: "JPEG",
          };
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
            const imageWidth = image.naturalWidth || image.width;
            const imageHeight = image.naturalHeight || image.height;
            if (!imageWidth || !imageHeight) throw new Error("Dimensões de imagem indisponíveis");
            const ratio = imageWidth / imageHeight;
            let fitWidth = maxImageWidth;
            let fitHeight = fitWidth / ratio;
            if (fitHeight > maxImageHeight) {
              fitHeight = maxImageHeight;
              fitWidth = fitHeight * ratio;
            }
            const source = String(img.base64).toLowerCase();
            const format = source.startsWith("data:image/png")
              ? "PNG"
              : source.startsWith("data:image/webp")
                ? "WEBP"
                : "JPEG";
            prepared = {
              base64: img.base64,
              caption,
              loaded: true,
              width: fitWidth,
              height: fitHeight,
              format,
            };
          } catch (e) {
            prepared.error = true;
          }
          doc.setFont("courier", "normal");
          doc.setFontSize(6.4);
          prepared.captionLines = doc.splitTextToSize(prepared.caption, cellWidth - 8).slice(0, 2);
          preparedImages.push(prepared);
        }

        for (let offset = 0; offset < preparedImages.length; offset += columns) {
          const row = preparedImages.slice(offset, offset + columns);
          const imageRowHeight = Math.max(...row.map((item) => item.height));
          const captionLineCount = Math.max(...row.map((item) => Math.max(1, item.captionLines.length)));
          const captionHeight = captionLineCount * 3.1;
          const cardHeight = imageRowHeight + captionHeight + 10;
          if (y + cardHeight > footerLimit) {
            newPage();
            sectionTitle("Anexos fotográficos — continuação");
          }

          row.forEach((item, columnIndex) => {
            const x = margin + columnIndex * (cellWidth + gapX);
            const cardY = y;
            doc.setDrawColor(...softRule);
            doc.setLineWidth(0.2);
            doc.rect(x, cardY, cellWidth, cardHeight);

            const imageX = x + (cellWidth - item.width) / 2;
            const imageY = cardY + 3 + (imageRowHeight - item.height) / 2;
            if (item.loaded) {
              try {
                doc.setDrawColor(...rule);
                doc.setLineWidth(0.25);
                doc.rect(imageX - 0.5, imageY - 0.5, item.width + 1, item.height + 1);
                doc.addImage(item.base64, item.format, imageX, imageY, item.width, item.height);
              } catch (e) {
                item.error = true;
              }
            }
            if (!item.loaded || item.error) {
              doc.setFont("times", "italic");
              doc.setFontSize(8);
              doc.setTextColor(...softRule);
              doc.text("Imagem não disponível", x + cellWidth / 2, cardY + 3 + imageRowHeight / 2, { align: "center" });
            }
            doc.setFont("courier", "normal");
            doc.setFontSize(6.4);
            doc.setTextColor(...ink);
            doc.text(item.captionLines, x + cellWidth / 2, cardY + 3 + imageRowHeight + 3, {
              align: "center",
              maxWidth: cellWidth - 8,
              lineHeightFactor: 1.05,
            });
          });
          y += cardHeight + gapY;
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

  async gerarPDFRelatorioInstitucional(dados, options = {}) {
    const jsPDF = this.getJSPDF();
    const doc = new jsPDF({ ...options, orientation: "portrait", unit: "mm", format: "a4", compress: true });
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 14;
    const contentWidth = pageWidth - margin * 2;
    const footerLimit = pageHeight - 19;
    const ink = [0, 0, 0];
    const rule = [45, 45, 45];
    const softRule = [125, 125, 125];
    const reportType = options.reportType || dados.tipoRelatorio || "detalhado";
    const isApproachDetail = reportType === "abordagem-detalhe-veiculo" || reportType === "abordagem-detalhe-pessoa";
    const isApproachDetailVehicle = reportType === "abordagem-detalhe-veiculo";
    const isApproachReport = reportType === "abordagens" || reportType.startsWith("abordagens-");
    const reportTitle = String(dados.titulo || options.title || "Relatório operacional");
    const period = String(dados.periodo || "Período não informado");
    const emitted = new Date().toLocaleString("pt-BR", { timeZone: globalThis.CONFIG?.TIMEZONE || "America/Sao_Paulo" });
    const logo = await this.carregarImagemBase64(options.logoUrl || "assets/logo-guarda.png");
    const safe = (value, fallback = "—") => value === null || value === undefined || String(value).trim() === "" ? fallback : String(value);
    const list = (value) => Array.isArray(value) ? value : [];
    const approachPhotos = (record) => list(record?.anexos)
      .map((item, index) => typeof item === "string" ? { url: item, nome: `Foto ${index + 1}`, tipo: "image" } : item)
      .filter((item) => item && item.tipo !== "assinatura" &&
        (item.tipo === "image" || item.tipo_arquivo === "image" || (!item.tipo && !item.tipo_arquivo)) &&
        (item.url || item.url_thumb));
    const occurrences = list(dados.ocorrencias);
    const labelStatus = (value) => this.getStatusLabel(value || "Não informado");
    const parseDate = (value) => {
      if (!value) return new Date(NaN);
      if (value instanceof Date) return new Date(value.getTime());
      const raw = String(value).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(`${raw}T00:00:00Z`);
      if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(raw)) {
        return new Date(`${raw.replace(" ", "T")}Z`);
      }
      return new Date(raw);
    };
    const formatDateTime = (value) => {
      if (!value) return "—";
      const d = parseDate(value);
      return Number.isNaN(d.getTime()) ? safe(value) : new Intl.DateTimeFormat("pt-BR", { timeZone: globalThis.CONFIG?.TIMEZONE || "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(d);
    };
    const formatDate = (value) => {
      if (!value) return "—";
      const raw = String(value);
      const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
      const d = parseDate(value);
      return Number.isNaN(d.getTime()) ? safe(value) : new Intl.DateTimeFormat("pt-BR", { timeZone: globalThis.CONFIG?.TIMEZONE || "America/Sao_Paulo", dateStyle: "short" }).format(d);
    };

    const percent = (n, denominator) => denominator > 0 ? `${((n / denominator) * 100).toFixed(1)}%` : "—";
    const countBy = (rows, keyFn) => {
      const map = new Map();
      for (const row of rows) {
        const key = safe(keyFn(row), "Não informado");
        map.set(key, (map.get(key) || 0) + 1);
      }
      return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
    };

    doc.setProperties({
      title: reportTitle,
      author: options.author || "Guarda Municipal de Pitangueiras/PR",
      subject: options.subject || "Relatório operacional — Guarda Municipal de Pitangueiras/PR",
      keywords: options.keywords || `Guarda Municipal, Relatório, ${reportTitle}`,
      creator: "Sistema de Registro de Ocorrências — Guarda Municipal de Pitangueiras/PR",
    });

    let page = 1;
    let y = 39;
    const drawHeader = (pageNumber) => {
      doc.setPage(pageNumber);
      doc.setDrawColor(...rule);
      doc.setLineWidth(0.55);
      doc.line(margin, 4, pageWidth - margin, 4);
      if (logo) {
        try { doc.addImage(logo, "PNG", margin + 1, 6, 21, 21, undefined, "FAST"); }
        catch (e) { doc.setLineWidth(0.35); doc.rect(margin + 1, 6, 21, 21); }
      }
      const centerX = pageWidth / 2;
      doc.setTextColor(...ink);
      doc.setFont("times", "bold");
      doc.setFontSize(8.5);
      doc.text("GUARDA MUNICIPAL DE PITANGUEIRAS/PR", centerX, 9, { align: "center" });
      doc.setFontSize(7.2);
      doc.text("REGISTRO OPERACIONAL", centerX, 15, { align: "center" });
      doc.setFontSize(9);
      doc.text("RELATÓRIO GERENCIAL", centerX, 21, { align: "center" });
      doc.setFont("courier", "normal");
      doc.setFontSize(6.3);
      const titleLines = doc.splitTextToSize(reportTitle.toUpperCase(), 92).slice(0, 2);
      doc.text(titleLines, centerX, 26, { align: "center" });
      const rightX = pageWidth - margin - 35;
      doc.setDrawColor(...softRule);
      doc.setLineWidth(0.25);
      doc.line(rightX - 3, 6, rightX - 3, 27);
      doc.setFont("courier", "bold");
      doc.setFontSize(6.2);
      doc.text("PERÍODO", rightX, 9);
      doc.setFont("courier", "normal");
      doc.setFontSize(5.6);
      doc.text(doc.splitTextToSize(period, 33).slice(0, 2), rightX, 14);
      doc.setFontSize(5.4);
      doc.text(`EMISSÃO ${formatDate(new Date())}`, rightX, 25);
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
      doc.text(`EMITIDO EM ${emitted}`, pageWidth - margin, pageHeight - 10, { align: "right" });
      doc.setFont("courier", "bold");
      doc.text(`PÁGINA ${pageNumber} DE ${totalPages}`, pageWidth / 2, pageHeight - 5, { align: "center" });
    };
    const newPage = () => {
      doc.addPage();
      page = doc.internal.getCurrentPageInfo().pageNumber;
      drawHeader(page);
      y = 39;
    };
    const ensureSpace = (height) => { if (y + height > footerLimit) newPage(); };
    const sectionTitle = (text) => {
      ensureSpace(11);
      doc.setTextColor(...ink);
      doc.setFont("times", "bold");
      doc.setFontSize(8.5);
      doc.text(String(text).toUpperCase(), pageWidth / 2, y + 4, { align: "center" });
      doc.setDrawColor(...rule);
      doc.setLineWidth(0.3);
      doc.line(margin, y + 6.2, pageWidth - margin, y + 6.2);
      y += 9;
    };
    const drawFields = (fields) => {
      for (let i = 0; i < fields.length; i += 2) {
        const row = fields.slice(i, i + 2);
        const gap = row.length > 1 ? 4 : 0;
        const cellWidth = (contentWidth - gap * (row.length - 1)) / row.length;
        const prepared = row.map(([label, value]) => {
          const labelText = `${String(label).toUpperCase()}: `;
          doc.setFont("courier", "bold"); doc.setFontSize(6.4);
          const labelWidth = doc.getTextWidth(labelText);
          const stacked = labelWidth > cellWidth * 0.46;
          const text = doc.splitTextToSize(safe(value), Math.max(12, cellWidth - (stacked ? 0 : labelWidth + 1.2)));
          return { labelText, labelWidth, stacked, text, height: Math.max(4, (stacked ? 3 : 0) + text.length * 3.2) };
        });
        const rowHeight = Math.max(...prepared.map((p) => p.height));
        ensureSpace(rowHeight + 3);
        prepared.forEach((item, index) => {
          const x = margin + index * (cellWidth + gap);
          doc.setTextColor(...ink); doc.setFont("courier", "bold"); doc.setFontSize(6.4);
          if (item.stacked) {
            doc.text(item.labelText.trim(), x, y + 2.5);
            doc.setFont("courier", "normal"); doc.setFontSize(7.2);
            doc.text(item.text, x, y + 5.7, { lineHeightFactor: 1.05 });
          } else {
            doc.text(item.labelText, x, y + 2.7);
            doc.setFont("courier", "normal"); doc.setFontSize(7.2);
            doc.text(item.text, x + item.labelWidth + 1.2, y + 2.7, { lineHeightFactor: 1.05 });
          }
          doc.setDrawColor(...softRule); doc.setLineWidth(0.15);
          doc.line(x, y + rowHeight + 1, x + cellWidth, y + rowHeight + 1);
        });
        y += rowHeight + 4;
      }
    };
    const drawTable = (title, headers, rows) => {
      if (rows.length) ensureSpace(25);
      sectionTitle(title);
      if (!rows.length) {
        ensureSpace(8);
        doc.setTextColor(...ink); doc.setFont("courier", "normal"); doc.setFontSize(7.2);
        doc.text("Nenhum registro no período.", margin, y + 3);
        y += 7;
        return;
      }
      doc.autoTable({
        startY: y,
        margin: { left: margin, right: margin, top: 38, bottom: 18 },
        theme: "grid",
        head: [headers],
        body: rows.map((row) => row.map((cell) => safe(cell))),
        styles: { font: "courier", fontSize: 6.8, textColor: ink, cellPadding: 1.6, lineColor: rule, lineWidth: 0.18, overflow: "linebreak", valign: "middle" },
        headStyles: { fillColor: [255, 255, 255], textColor: ink, font: "courier", fontStyle: "bold", fontSize: 6.6, lineColor: rule, lineWidth: 0.3 },
        alternateRowStyles: { fillColor: [255, 255, 255] },
        didDrawPage: (data) => {
          const pageNumber = data.doc.internal.getCurrentPageInfo().pageNumber;
          page = Math.max(page, pageNumber);
          drawHeader(pageNumber);
        },
      });
      page = doc.internal.getCurrentPageInfo().pageNumber;
      y = (doc.lastAutoTable?.finalY || y) + 4;
    };
    const drawParagraphSection = (title, value) => {
      const raw = String(value || "").trim();
      if (!raw) return;
      sectionTitle(title);
      const paragraphs = raw.replace(/\r\n/g, "\n").split("\n");
      const lineHeight = 4.1;
      for (const paragraph of paragraphs) {
        const lines = paragraph ? doc.splitTextToSize(paragraph, contentWidth) : [""];
        for (const line of lines) {
          if (y + lineHeight > footerLimit) {
            newPage();
            sectionTitle(`${title} — continuação`);
          }
          if (line) {
            doc.setTextColor(...ink);
            doc.setFont("times", "normal");
            doc.setFontSize(8);
            doc.text(line, margin, y + 2.8, { maxWidth: contentWidth });
          }
          y += lineHeight;
        }
        y += 1.2;
      }
      y += 2;
    };
    const drawApproachPhotos = async (record, requestedColumns) => {
      const photos = approachPhotos(record);
      if (!photos.length) return 0;
      newPage();
      sectionTitle("Anexos fotográficos");
      const automaticColumns = photos.length === 1 ? 1 : photos.length >= 6 ? 3 : 2;
      const requested = Number(requestedColumns);
      const columns = Number.isInteger(requested) && requested >= 1 && requested <= 3 ? requested : automaticColumns;
      const gapX = 5;
      const gapY = 5;
      const cellWidth = (contentWidth - gapX * (columns - 1)) / columns;
      const maxImageWidth = cellWidth - 8;
      const maxImageHeight = columns === 1 ? 150 : columns === 2 ? 64 : 46;
      for (let offset = 0; offset < photos.length; offset += columns) {
        const row = [];
        for (const [index, photo] of photos.slice(offset, offset + columns).entries()) {
          const caption = safe(photo.nome_arquivo || photo.nome, `Foto ${offset + index + 1}`);
          const item = { base64: null, caption, loaded: false, width: maxImageWidth, height: 24, format: "JPEG" };
          try {
            const base64 = await this.carregarImagemBase64(photo.url || photo.url_thumb);
            if (!base64) throw new Error("Imagem indisponível");
            const properties = doc.getImageProperties(base64);
            const imageWidth = Number(properties.width);
            const imageHeight = Number(properties.height);
            if (!imageWidth || !imageHeight) throw new Error("Dimensões indisponíveis");
            const ratio = imageWidth / imageHeight;
            let fitWidth = maxImageWidth;
            let fitHeight = fitWidth / ratio;
            if (fitHeight > maxImageHeight) {
              fitHeight = maxImageHeight;
              fitWidth = fitHeight * ratio;
            }
            const source = String(base64).toLowerCase();
            item.base64 = base64;
            item.loaded = true;
            item.width = fitWidth;
            item.height = fitHeight;
            item.format = source.startsWith("data:image/png") ? "PNG" : source.startsWith("data:image/webp") ? "WEBP" : "JPEG";
          } catch (error) {
            item.error = true;
          }
          doc.setFont("courier", "normal");
          doc.setFontSize(6.4);
          item.captionLines = doc.splitTextToSize(item.caption, cellWidth - 8).slice(0, 2);
          row.push(item);
        }

        const imageRowHeight = Math.max(...row.map((item) => item.height));
        const captionLineCount = Math.max(...row.map((item) => Math.max(1, item.captionLines.length)));
        const captionHeight = captionLineCount * 3.1;
        const cardHeight = imageRowHeight + captionHeight + 10;
        if (y + cardHeight > footerLimit) {
          newPage();
          sectionTitle("Anexos fotográficos — continuação");
        }
        row.forEach((item, columnIndex) => {
          const x = margin + columnIndex * (cellWidth + gapX);
          const cardY = y;
          doc.setDrawColor(...softRule);
          doc.setLineWidth(0.2);
          doc.rect(x, cardY, cellWidth, cardHeight);
          const imageX = x + (cellWidth - item.width) / 2;
          const imageY = cardY + 3 + (imageRowHeight - item.height) / 2;
          if (item.loaded) {
            try {
              doc.setDrawColor(...rule);
              doc.setLineWidth(0.25);
              doc.rect(imageX - 0.5, imageY - 0.5, item.width + 1, item.height + 1);
              doc.addImage(item.base64, item.format, imageX, imageY, item.width, item.height);
            } catch (error) {
              item.error = true;
            }
          }
          if (!item.loaded || item.error) {
            doc.setFont("times", "italic");
            doc.setFontSize(8);
            doc.setTextColor(...softRule);
            doc.text("Imagem não disponível", x + cellWidth / 2, cardY + 3 + imageRowHeight / 2, { align: "center" });
          }
          doc.setFont("courier", "normal");
          doc.setFontSize(6.4);
          doc.setTextColor(...ink);
          doc.text(item.captionLines, x + cellWidth / 2, cardY + 3 + imageRowHeight + 3, {
            align: "center",
            maxWidth: cellWidth - 8,
            lineHeightFactor: 1.05,
          });
        });
        y += cardHeight + gapY;
      }
      return photos.length;
    };
    const chartPalette = [
      [0, 63, 135],
    ];
    const chartGrid = [218, 226, 235];
    const chartTrack = [238, 243, 248];
    const chartText = (value) => safe(value);
    const chartInteger = (value) => Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
    const normalizeChartItems = (entries) => list(entries).map((item) => Array.isArray(item)
      ? { label: chartText(item[0]), value: Number(item[1]) }
      : { label: chartText(item?.label), value: Number(item?.value) })
      .filter((item) => Number.isFinite(item.value) && item.value >= 0);

    const drawHorizontalBars = (title, entries, options = {}) => {
      const all = normalizeChartItems(entries);
      const sorted = options.sort === false ? all : all.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "pt-BR"));
      const limit = Math.max(1, Number(options.limit) || 10);
      const items = sorted.slice(0, limit);
      if (!items.length || !items.some((item) => item.value > 0)) return false;

      const labelWidth = 56;
      const valueWidth = 16;
      const plotX = margin + labelWidth + 2;
      const plotWidth = contentWidth - labelWidth - valueWidth - 2;
      const rowHeight = 8;
      const topPad = 2;
      const max = Math.max(1, ...items.map((item) => item.value));
      ensureSpace(items.length * rowHeight + 24);
      sectionTitle(title);
      const chartTop = y + topPad;
      const chartBottom = chartTop + items.length * rowHeight;

      doc.setDrawColor(...chartGrid);
      doc.setLineWidth(0.18);
      [0, 0.5, 1].forEach((fraction) => {
        const x = plotX + plotWidth * fraction;
        doc.line(x, chartTop, x, chartBottom);
      });

      items.forEach((item, index) => {
        const rowY = chartTop + index * rowHeight;
        const labelLines = doc.splitTextToSize(item.label, labelWidth - 3).slice(0, 2);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.2);
        doc.setTextColor(...ink);
        doc.text(labelLines, margin, rowY + (labelLines.length > 1 ? 2.5 : 4.5), { lineHeightFactor: 1 });

        doc.setFillColor(...chartTrack);
        doc.rect(plotX, rowY + 2.5, plotWidth, 3.4, "F");
        const barWidth = item.value > 0 ? Math.max(0.8, (item.value / max) * plotWidth) : 0;
        const color = options.colors?.[index] || chartPalette[index % chartPalette.length];
        if (barWidth > 0) {
          doc.setFillColor(...color);
          doc.rect(plotX, rowY + 2.5, barWidth, 3.4, "F");
        }
        const value = options.valueFormatter ? options.valueFormatter(item.value) : chartInteger(item.value);
        doc.setFontSize(6.1);
        doc.setTextColor(...ink);
        doc.text(chartText(value), plotX + plotWidth + 2, rowY + 4.9);
      });

      const axisY = chartBottom + 4.2;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.2);
      doc.setTextColor(90, 100, 112);
      [0, 0.5, 1].forEach((fraction) => {
        const value = max * fraction;
        const label = options.tickFormatter ? options.tickFormatter(value) : chartInteger(value);
        doc.text(chartText(label), plotX + plotWidth * fraction, axisY, { align: "center" });
      });
      y = axisY + 3.5;
      if (sorted.length > items.length) {
        doc.setFontSize(5.6);
        doc.setTextColor(90, 100, 112);
        doc.text(`Exibidos ${items.length} de ${sorted.length}; a tabela apresenta o conjunto completo.`, margin, y + 2.5);
        y += 4;
      }
      y += 2;
      return true;
    };

    const drawColumnBars = (title, entries, options = {}) => {
      const all = normalizeChartItems(entries);
      const limit = Math.max(1, Number(options.limit) || 12);
      const items = all.slice(-limit);
      if (!items.length || !items.some((item) => item.value > 0)) return false;

      const plotX = margin + 12;
      const plotWidth = contentWidth - 16;
      const plotHeight = 31;
      ensureSpace(plotHeight + 29);
      sectionTitle(title);
      const chartTop = y + 6;
      const chartBottom = chartTop + plotHeight;
      const max = Math.max(1, ...items.map((item) => item.value));

      doc.setDrawColor(...chartGrid);
      doc.setLineWidth(0.18);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.2);
      doc.setTextColor(90, 100, 112);
      [0, 0.5, 1].forEach((fraction) => {
        const lineY = chartBottom - plotHeight * fraction;
        doc.line(plotX, lineY, plotX + plotWidth, lineY);
        if (fraction > 0) doc.text(chartInteger(max * fraction), margin, lineY + 1.6, { align: "left" });
      });

      const band = plotWidth / items.length;
      const barWidth = Math.max(1.2, Math.min(10, band * 0.62));
      items.forEach((item, index) => {
        const x = plotX + index * band + (band - barWidth) / 2;
        const barHeight = item.value > 0 ? Math.max(0.7, (item.value / max) * plotHeight) : 0;
        const color = options.colors?.[index] || chartPalette[index % chartPalette.length];
        if (barHeight > 0) {
          doc.setFillColor(...color);
          doc.rect(x, chartBottom - barHeight, barWidth, barHeight, "F");
        }
        const showValue = options.showValues === true || (options.showValues !== false && items.length <= 14);
        if (showValue && (item.value > 0 || options.showValues === true)) {
          doc.setFontSize(items.length > 14 ? 4.3 : 5.1);
          doc.setTextColor(...ink);
          doc.text(chartInteger(item.value), x + barWidth / 2, chartBottom - barHeight - 1.2, { align: "center" });
        }
        const every = Math.max(1, Number(options.labelEvery) || Math.ceil(items.length / 12));
        if (index % every === 0 || index === items.length - 1) {
          doc.setFontSize(5.1);
          doc.setTextColor(...ink);
          doc.text(item.label, x + barWidth / 2, chartBottom + 4.2, { align: "center" });
        }
      });
      y = chartBottom + 9;
      if (all.length > items.length) {
        doc.setFontSize(5.6);
        doc.setTextColor(90, 100, 112);
        doc.text(`Exibidos os ${items.length} períodos mais recentes; a tabela apresenta o período completo.`, margin, y + 1.8);
        y += 4;
      }
      y += 2;
      return true;
    };

    const drawCompositionBar = (title, segments, denominator) => {
      const total = Number(denominator);
      const items = list(segments).map((segment) => ({
        label: chartText(segment.label),
        value: Math.max(0, Number(segment.value) || 0),
        color: segment.color,
      })).filter((segment) => Number.isFinite(segment.value));
      if (!items.length || !Number.isFinite(total) || total <= 0) return false;
      const segmentTotal = items.reduce((sum, item) => sum + item.value, 0);
      if (segmentTotal <= 0) return false;

      ensureSpace(50);
      sectionTitle(title);
      const x = margin + 1;
      const width = contentWidth - 2;
      const barY = y + 5;
      const barHeight = 10;
      let offset = 0;
      items.forEach((item, index) => {
        const segmentWidth = index === items.length - 1
          ? Math.max(0, width - offset)
          : width * item.value / segmentTotal;
        if (segmentWidth > 0) {
          doc.setFillColor(...(item.color || chartPalette[index % chartPalette.length]));
          doc.rect(x + offset, barY, segmentWidth, barHeight, "F");
          offset += segmentWidth;
        }
      });
      items.forEach((item, index) => {
        const column = index % 2;
        const row = Math.floor(index / 2);
        const legendX = x + column * (width / 2);
        const legendY = barY + barHeight + 6 + row * 6;
        doc.setFillColor(...(item.color || chartPalette[index % chartPalette.length]));
        doc.rect(legendX, legendY - 2.4, 3.2, 3.2, "F");
        const share = total > 0 ? `${((item.value / total) * 100).toFixed(1)}%` : "—";
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.2);
        doc.setTextColor(...ink);
        doc.text(`${item.label}: ${chartInteger(item.value)} (${share})`, legendX + 5, legendY);
      });
      y = barY + barHeight + 8 + Math.ceil(items.length / 2) * 6;
      y += 3;
      return true;
    };

    const groupTable = (title, rows, keyFn, headers = ["Grupo", "Registros", "% do total"]) => {
      const grouped = countBy(rows, keyFn);
      drawTable(title, headers, grouped.map(([key, total]) => [key, total, percent(total, rows.length)]));
    };
    const drawTypeStatusTables = () => {
      const groups = countBy(occurrences, (o) => this.getTipoLabel(o.tipo_ocorrencia));
      const records = groups.map(([tipo, total]) => {
        const rows = occurrences.filter((o) => this.getTipoLabel(o.tipo_ocorrencia) === tipo);
        const synced = rows.filter((o) => o.status === "synced").length;
        const pending = rows.filter((o) => o.status === "pending_sync").length;
        const cancelled = rows.filter((o) => o.status === "cancelled").length;
        const rectified = rows.filter((o) => o.status === "rectified").length;
        const rectPending = rows.filter((o) => o.status === "pending_rectification").length;
        const rectRejected = rows.filter((o) => o.status === "rectification_rejected").length;
        const others = Math.max(0, total - synced - pending - cancelled - rectified - rectPending - rectRejected);
        return { tipo, total, synced, pending, cancelled, rectified, rectPending, rectRejected, others };
      });
      drawTable("Distribuição, sincronização e cancelamentos por tipo", ["Tipo", "Total", "% do total", "Sincronizadas", "Pend. sincronização", "Canceladas", "Rascunhos / outros", "Taxa de sincronização"], records.map((r) => [r.tipo, r.total, percent(r.total, occurrences.length), r.synced, r.pending, r.cancelled, r.others, percent(r.synced, r.total)]));
      drawTable("Retificações por tipo", ["Tipo", "Aplicadas", "Pendentes", "Rejeitadas"], records.map((r) => [r.tipo, r.rectified, r.rectPending, r.rectRejected]));
    };
    const occurrenceRows = (rows) => rows.map((o) => [
      safe(o.numero_ocorrencia || o.numero_temporario),
      formatDateTime(o.criado_em),
      safe(this.getTipoLabel(o.tipo_ocorrencia)),
      safe(o.bairro_ocorrencia || o.local_ocorrencia),
      labelStatus(o.status),
    ]);
    const localParts = (value) => {
      const p = new Intl.DateTimeFormat("en-CA", { timeZone: globalThis.CONFIG?.TIMEZONE || "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(parseDate(value));
      return Object.fromEntries(p.filter((x) => x.type !== "literal").map((x) => [x.type, Number(x.value)]));
    };
    const daysInPeriod = (start, end) => {
      const a = String(start || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const b = String(end || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!a || !b) return 0;
      const startUTC = Date.UTC(+a[1], +a[2]-1, +a[3]);
      const endUTC = Date.UTC(+b[1], +b[2]-1, +b[3]);
      return endUTC >= startUTC ? Math.floor((endUTC-startUTC)/86400000)+1 : 0;
    };
    const monthBins = (rows, start, end) => {
      const counts = new Map();
      rows.forEach((o) => {
        const d = localParts(o.criado_em);
        if (Number.isFinite(d.year) && Number.isFinite(d.month)) {
          const key = `${d.year}-${String(d.month).padStart(2,"0")}`;
          counts.set(key, (counts.get(key)||0)+1);
        }
      });
      const a = String(start || "").match(/^(\d{4})-(\d{2})-\d{2}$/);
      const b = String(end || "").match(/^(\d{4})-(\d{2})-\d{2}$/);
      if (a && b) {
        let year=+a[1], month=+a[2], guard=0;
        const last=+b[1]*12+(+b[2]-1);
        while (year*12+(month-1)<=last && guard++<240) {
          const key=`${year}-${String(month).padStart(2,"0")}`;
          if (!counts.has(key)) counts.set(key,0);
          month++; if (month>12) { month=1; year++; }
        }
      }
      return [...counts.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([key,n])=>[`${key.slice(5,7)}/${key.slice(0,4)}`,n]);
    };
    const validCoordinate = (lat, lng) => {
      if (lat === null || lat === undefined || String(lat).trim() === "" || lng === null || lng === undefined || String(lng).trim() === "") return false;
      const a=Number(lat), b=Number(lng);
      return Number.isFinite(a) && Number.isFinite(b) && a>=-90 && a<=90 && b>=-180 && b<=180;
    };
    const median = (values) => {
      const arr=values.filter(Number.isFinite).sort((a,b)=>a-b);
      if (!arr.length) return null;
      const mid=Math.floor(arr.length/2);
      return arr.length%2 ? arr[mid] : (arr[mid-1]+arr[mid])/2;
    };



    drawHeader(page);
    sectionTitle(isApproachDetail ? "Identificação do registro" : "Resumo do período");
    const finalizadas = occurrences.filter((o) => o.status === "synced").length;
    const pendentes = occurrences.filter((o) => o.status === "pending_sync").length;
    const canceladas = occurrences.filter((o) => o.status === "cancelled").length;
    const totalRegistrosPeriodo = Number.isFinite(Number(dados.totalRegistrosPeriodo)) ? Number(dados.totalRegistrosPeriodo) : occurrences.length;
    const summary = [["Registros consultados", reportType === "cancelamentos" ? totalRegistrosPeriodo : occurrences.length], ["Sincronizadas no sistema", finalizadas], ["Pendentes de sincronização", pendentes], ["Canceladas", canceladas]];
    if (dados.comparacaoPeriodo) {
      const c = dados.comparacaoPeriodo;
      const pct = c.status === "unavailable" ? "Indisponível" : c.anterior > 0 ? `${((c.atual - c.anterior) / c.anterior * 100).toFixed(1)}%` : "Sem base comparável";
      summary.push(["Período anterior equivalente", c.anterior], ["Variação observada", pct]);
    }
    if (reportType === "cancelamentos") {
      summary.splice(0, summary.length, ["Registros consultados no intervalo", totalRegistrosPeriodo], ["Canceladas", canceladas], ["Proporção cancelada do total", percent(canceladas, totalRegistrosPeriodo)]);
    }
    if (reportType === "previsao") {
      summary.splice(0, summary.length, ["Registros históricos no período", occurrences.length]);
    }
    if (reportType === "eficiencia") {
      summary.splice(0, summary.length,
        ["Ocorrências criadas", occurrences.length],
        ["Abordagens de veículos", Number(dados.abordagensVeiculos || 0)],
        ["Abordagens de pessoas", Number(dados.abordagensPessoas || 0)],
        ["Conversão abordagem → BO", "Não calculada — sem vínculo verificável"]);
    }
    if (reportType === "retificacoes") {
      const rows = list(dados.retificacoes);
      summary.splice(0, summary.length,
        ["Eventos no período", rows.length],
        ["Aplicadas", rows.filter((r) => r.status === "rectified").length],
        ["Pendentes", rows.filter((r) => r.status === "pending_rectification").length],
        ["Rejeitadas", rows.filter((r) => r.status === "rectification_rejected").length]);
    }
    if (isApproachReport) {
      const veiculos = list(dados.veiculos), pessoas = list(dados.pessoas);
      if (reportType === "abordagens-veiculos") {
        summary.splice(0, summary.length, ["Abordagens de veículos", veiculos.length], ["Total de abordagens", veiculos.length]);
      } else if (reportType === "abordagens-pessoas") {
        summary.splice(0, summary.length, ["Abordagens de pessoas", pessoas.length], ["Total de abordagens", pessoas.length]);
      } else {
        summary.splice(0, summary.length, ["Abordagens de veículos", veiculos.length], ["Abordagens de pessoas", pessoas.length], ["Total de abordagens", veiculos.length + pessoas.length]);
      }
    }
    if (isApproachDetail) {
      const record = list(isApproachDetailVehicle ? dados.veiculos : dados.pessoas)[0];
      const photosCount = approachPhotos(record).length;
      summary.splice(0, summary.length,
        ["Tipo de abordagem", isApproachDetailVehicle ? "Veículo" : "Pessoa"],
        ["Fotos anexadas", photosCount]);
    }
    drawFields(summary);
    if (dados.notaMetodologica) drawFields([["Nota metodológica", dados.notaMetodologica]]);

    switch (reportType) {
      case "executivo": {
        const dias = daysInPeriod(dados.dataInicio, dados.dataFim);
        const comparacao = dados.comparacaoPeriodo;
        const situacaoComparacao = !comparacao || comparacao.status === "unavailable" ? "Indisponível" : comparacao.anterior > 0 ? `${comparacao.dias} dias equivalentes; sem sobreposição` : "Sem base comparável";
        drawFields([["Taxa de sincronização", percent(finalizadas, occurrences.length)], ["Média registrada por dia", dias ? (occurrences.length / dias).toFixed(1) : "—"]]);
        drawHorizontalBars("Distribuição por tipo de ocorrência", countBy(occurrences, (o) => this.getTipoLabel(o.tipo_ocorrencia)), { limit: 8 });
        const monthly = monthBins(occurrences, dados.dataInicio, dados.dataFim);
        drawColumnBars("Evolução mensal observada", monthly, { limit: 12 });
        drawTypeStatusTables();
        drawTable("Evolução mensal observada", ["Mês", "Registros"], monthly);
        break;
      }
      case "por-tipo":
        drawHorizontalBars("Distribuição por tipo de ocorrência", countBy(occurrences, (o) => this.getTipoLabel(o.tipo_ocorrencia)), { limit: 10 });
        drawTypeStatusTables();
        break;


      case "por-local": {
        const locations = countBy(occurrences, (o) => o.bairro_ocorrencia || o.local_ocorrencia);
        drawHorizontalBars("Localidades com maior volume", locations, { limit: 10 });
        drawTable("Ocorrências por localidade", ["Bairro / localidade", "Registros", "% do total"], locations.map(([local, n]) => [local, n, percent(n, occurrences.length)]));
        break;
      }
      case "atendimento": {
        const valid = occurrences.map((o) => {
          const start = parseDate(o.data_hora_inicio);
          const end = parseDate(o.data_hora_encerramento || o.data_hora_finalizacao);
          return { o, minutes: Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) && end > start ? (end - start) / 60000 : null };
        }).filter((x) => x.minutes !== null);
        const mean = valid.length ? valid.reduce((a, x) => a + x.minutes, 0) / valid.length : null;
        const quick = valid.filter((x) => x.minutes < 15).length;
        const slow = valid.filter((x) => x.minutes > 45).length;
        const totalsByType = countBy(valid, (x) => this.getTipoLabel(x.o.tipo_ocorrencia));
        drawFields([["Amostras com duração válida", valid.length], ["Sem duração válida", occurrences.length - valid.length], ["Média (minutos)", mean === null ? "—" : mean.toFixed(1)], ["Rápidos (< 15 min)", quick], ["Lentos (> 45 min)", slow]]);
        if (valid.length) {
          const durationMeans = totalsByType.map(([tipo]) => {
            const values = valid.filter((x) => this.getTipoLabel(x.o.tipo_ocorrencia) === tipo).map((x) => x.minutes);
            return { label: tipo, value: values.reduce((sum, value) => sum + value, 0) / values.length };
          });
          drawHorizontalBars("Duração média por tipo (minutos)", durationMeans, {
            limit: 10,
            valueFormatter: (value) => `${value.toFixed(1)} min`,
            tickFormatter: (value) => value.toFixed(0),
          });
        }
        drawTable("Duração por tipo", ["Tipo", "Amostras", "Média (min)", "Mediana (min)", "Rápidos (<15)", "Lentos (>45)"], totalsByType.map(([tipo]) => {
          const values = valid.filter((x) => this.getTipoLabel(x.o.tipo_ocorrencia) === tipo).map((x) => x.minutes);
          const med = median(values);
          return [tipo, values.length, (values.reduce((a,b) => a+b,0)/values.length).toFixed(1), med === null ? "—" : med.toFixed(1), values.filter((v)=>v<15).length, values.filter((v)=>v>45).length];
        }));

        break;
      }
      case "desempenho": {
        const ranking = list(dados.ranking);
        const totalAbordagens = Number(dados.totalAbordagens || 0);
        drawFields([["Responsáveis pelo cadastro", ranking.filter((r) => r.total_atendimentos > 0).length], ["Abordagens cadastradas", totalAbordagens]]);
        drawTable("Contagem por responsável pelo cadastro", ["Usuário", "Ocorrências", "Sincronizadas", "Pend. sincronização", "Canceladas", "Abord. veículos", "Abord. pessoas", "Total"], ranking.map((r) => [r.nome, r.ocorrencias?.total || 0, r.ocorrencias?.finalizadas || 0, r.ocorrencias?.pendentes || 0, r.ocorrencias?.canceladas || 0, r.abordagens?.veiculos || 0, r.abordagens?.pessoas || 0, r.total_atendimentos || 0]));
        break;
      }
      case "retificacoes": {
        const rows = list(dados.retificacoes);
        drawHorizontalBars("Situação dos eventos de retificação", [
          { label: "Aplicadas", value: rows.filter((r) => r.status === "rectified").length },
          { label: "Pendentes", value: rows.filter((r) => r.status === "pending_rectification").length },
          { label: "Rejeitadas", value: rows.filter((r) => r.status === "rectification_rejected").length },
        ], { sort: false, colors: [[0, 132, 61], [245, 158, 11], [220, 38, 38]] });
        drawTable("Eventos de retificação", ["Nº GM", "Data do evento", "Tipo", "Situação atual", "Justificativa", "Motivo da rejeição"], rows.map((r) => [r.numero_ocorrencia || r.numero_temporario || r.numero, formatDateTime(r.data_evento || r.data_solicitacao || r.criado_em), this.getTipoLabel(r.tipo_ocorrencia || r.tipo), labelStatus(r.status), r.solicitacao_retificacao_justificativa || r.justificativa_retificacao || r.justificativa, r.motivo_rejeicao]));
        break;
      }
      case "cancelamentos": {
        const cancelledRows = occurrences.filter((o) => o.status === "cancelled");
        const demaisRegistros = Math.max(0, totalRegistrosPeriodo - cancelledRows.length);
        drawCompositionBar("Composição dos registros consultados", [
          { label: "Canceladas", value: cancelledRows.length, color: [220, 38, 38] },
          { label: "Demais registros", value: demaisRegistros, color: [0, 63, 135] },
        ], totalRegistrosPeriodo);
        drawTable("Ocorrências canceladas", ["Nº GM", "Data", "Tipo", "Localidade", "Motivo"], occurrenceRows(cancelledRows).map((row, i) => [row[0], row[1], row[2], row[3], safe(cancelledRows[i].motivo_cancelamento)]));
        break;
      }
      case "tendencias": {
        const days = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
        const byDay = new Map(days.map((d) => [d, 0]));
        const byHour = new Map(Array.from({ length: 24 }, (_, h) => [`${String(h).padStart(2,"0")}:00`, 0]));
        occurrences.forEach((o) => {
          const p = localParts(o.criado_em);
          const day = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long" }).format(new Date(Date.UTC(p.year, p.month - 1, p.day)));
          if (byDay.has(day)) byDay.set(day, byDay.get(day)+1);
          const hour = `${String(p.hour).padStart(2,"0")}:00`;
          if (byHour.has(hour)) byHour.set(hour, byHour.get(hour)+1);
        });
        const monthly = monthBins(occurrences, dados.dataInicio, dados.dataFim);
        const dayRows = [...byDay];
        const hourRows = [...byHour];
        drawColumnBars("Evolução mensal observada", monthly, { limit: 12 });
        drawHorizontalBars("Ocorrências por dia da semana", dayRows, { sort: false });
        drawColumnBars("Ocorrências por hora local", hourRows, { limit: 24, labelEvery: 3, showValues: true });
        newPage();
        drawTable("Evolução mensal observada", ["Mês", "Registros"], monthly);
        drawTable("Ocorrências por dia da semana", ["Dia", "Registros", "% do total"], dayRows.map(([d, n]) => [d, n, percent(n, occurrences.length)]));
        
        break;
      }
      case "mapa": {
        const points = occurrences.filter((o) => validCoordinate(o.latitude, o.longitude));
        drawTable("Registros com coordenadas válidas", ["Nº GM", "Data", "Tipo", "Latitude", "Longitude", "Local"], points.map((o) => [o.numero_ocorrencia || o.numero_temporario, formatDateTime(o.criado_em), this.getTipoLabel(o.tipo_ocorrencia), Number(o.latitude).toFixed(6), Number(o.longitude).toFixed(6), o.bairro_ocorrencia || o.local_ocorrencia]));
        break;
      }
      case "abordagem-detalhe-veiculo":
      case "abordagem-detalhe-pessoa": {
        const isVehicle = reportType === "abordagem-detalhe-veiculo";
        const record = list(isVehicle ? dados.veiculos : dados.pessoas)[0];
        if (!record) {
          drawFields([["Registro", "Abordagem não encontrada ou indisponível."]]);
          break;
        }
        const phaseLabel = (value) => ({ advertencia: "Advertência", multa: "Multa" }[value] || safe(value, "Não informada"));
        const statusLabel = (value) => ({ ativa: "Ativa", encerrada: "Encerrada", finalizada: "Finalizada", cancelada: "Cancelada" }[value] || safe(value, "Não informada"));
        const identificationLabel = (value) => ({ identificado: "Identificado", parcial: "Parcial", nao_identificado: "Não identificado" }[value] || safe(value, "Não informada"));
        const attendanceLabel = (value) => value === "legado_nao_classificado" ? "Legado — contexto não classificado" : safe(value, "Não informado");
        sectionTitle("Dados do atendimento");
        drawFields([
          ["Data/hora de início", formatDateTime(record.data_hora_inicio || record.criado_em)],
          ["Data/hora de encerramento", formatDateTime(record.data_hora_encerramento || record.data_hora_finalizacao)],
          ["Situação", statusLabel(record.status_abordagem)],
          ["Fase", phaseLabel(record.fase)],
          ["Tipo de atendimento", attendanceLabel(record.tipo_atendimento)],
          ["Responsável pelo registro", record.usuarios?.nome_completo || record.nome_responsavel],
        ]);
        sectionTitle(isVehicle ? "Identificação do veículo" : "Identificação da pessoa");
        if (isVehicle) {
          drawFields([
            ["Situação da identificação", identificationLabel(record.identificacao_status)],
            ["Placa", record.placa],
            ["Marca/modelo", record.marca_modelo],
            ["Cor", record.cor],
            ["Condutor", record.condutor_nome],
            ["Local da abordagem", record.local_abordagem],
          ]);
        } else {
          drawFields([
            ["Situação da identificação", identificationLabel(record.identificacao_status)],
            ["Nome", record.nome],
            ["Alcunha", record.alcunha],
            ["RG", record.rg],
            ["CPF", record.cpf],
            ["Local da abordagem", record.local_abordagem],
            ["Situação de regularização", record.status_regularizacao],
            ["Prazo", formatDate(record.prazo_data || record.prazo)],
            ["Reincidências", record.reincidencia_count],
          ]);
        }
        if (record.descricao_identificacao) drawParagraphSection("Descrição complementar da identificação", record.descricao_identificacao);
        sectionTitle("Contexto e providências");
        drawFields([
          ["Coordenadas", record.latitude !== null && record.latitude !== undefined && record.longitude !== null && record.longitude !== undefined ? `${record.latitude}, ${record.longitude}` : "Não registradas"],
        ]);
        drawParagraphSection("Motivo objetivo do atendimento", record.motivo);
        drawParagraphSection("Providências adotadas", record.providencia);
        drawParagraphSection("Observações complementares", record.observacoes);
        await drawApproachPhotos(record, options.attachmentColumns);
        break;
      }
      case "abordagens":
      case "abordagens-veiculos":
      case "abordagens-pessoas":
      case "abordagens-geral": {
        const vehicles = list(dados.veiculos), people = list(dados.pessoas);
        const phaseLabel = (v) => ({ advertencia: "Advertência", multa: "Multa" }[v] || safe(v));
        const approachStatus = (v) => ({ ativa: "Ativa", encerrada: "Encerrada", finalizada: "Finalizada", cancelada: "Cancelada" }[v] || safe(v));
        const attendanceType = (v) => v === "legado_nao_classificado" ? "Legado — contexto não classificado" : safe(v);
        if (reportType === "abordagens-geral" || reportType === "abordagens") {
          drawHorizontalBars("Abordagens por categoria", [
            { label: "Veículos", value: vehicles.length },
            { label: "Pessoas", value: people.length },
          ], { sort: false, colors: [[0, 63, 135], [0, 132, 61]] });
        } else {
          const selected = reportType === "abordagens-veiculos" ? vehicles : people;
          drawHorizontalBars("Abordagens por fase", [
            { label: "Advertência", value: selected.filter((item) => item.fase === "advertencia").length },
            { label: "Multa", value: selected.filter((item) => item.fase === "multa").length },
            { label: "Outra / não informada", value: selected.filter((item) => !["advertencia", "multa"].includes(item.fase)).length },
          ], { sort: false, colors: [[0, 132, 61], [220, 38, 38], [71, 85, 105]] });
        }
        if (reportType !== "abordagens-pessoas") {
          groupTable("Abordagens de veículos por motivo", vehicles, (v) => v.motivo, ["Motivo informado", "Registros", "% das abordagens"]);
          drawTable("Veículos — identificação e local", ["Data", "Placa / descrição", "Marca / modelo / cor", "Local", "Identificação"], vehicles.map((v) => [formatDateTime(v.criado_em), v.placa || v.descricao_identificacao, [v.marca_modelo, v.cor].filter(Boolean).join(" / "), v.local_abordagem, safe(v.identificacao_status)]));
          drawTable("Veículos — contexto e providências", ["Data", "Tipo de atendimento", "Motivo", "Providência", "Fase", "Situação", "Responsável"], vehicles.map((v) => [formatDateTime(v.criado_em), attendanceType(v.tipo_atendimento), v.motivo, v.providencia, phaseLabel(v.fase), approachStatus(v.status_abordagem), v.usuarios?.nome_completo]));
        }
        if (reportType !== "abordagens-veiculos") {
          groupTable("Abordagens de pessoas por motivo", people, (v) => v.motivo, ["Motivo informado", "Registros", "% das abordagens"]);
          drawTable("Pessoas — identificação e local", ["Data", "Nome / alcunha", "RG", "CPF", "Local", "Reincidências"], people.map((v) => [formatDateTime(v.criado_em), [v.nome, v.alcunha].filter(Boolean).join(" / "), v.rg, v.cpf, v.local_abordagem, v.reincidencia_count ?? "—"]));
          drawTable("Pessoas — contexto e providências", ["Data", "Tipo de atendimento", "Motivo", "Providência", "Fase", "Situação / regularização", "Prazo", "Responsável"], people.map((v) => [formatDateTime(v.criado_em), attendanceType(v.tipo_atendimento), v.motivo, v.providencia, phaseLabel(v.fase), [approachStatus(v.status_abordagem), v.status_regularizacao ? safe(v.status_regularizacao) : ""].filter(Boolean).join(" / ") || "—", formatDate(v.prazo_data || v.prazo), v.usuarios?.nome_completo]));
        }

        break;
      }
      case "produtividade": {
        const days = daysInPeriod(dados.dataInicio, dados.dataFim);
        const byDate = new Map();
        occurrences.forEach((o) => {
          const p = localParts(o.criado_em);
          if (!Number.isFinite(p.year) || !Number.isFinite(p.month) || !Number.isFinite(p.day)) return;
          const key = `${p.year}-${String(p.month).padStart(2,"0")}-${String(p.day).padStart(2,"0")}`;
          byDate.set(key, (byDate.get(key) || 0) + 1);
        });
        const topDays = [...byDate.entries()].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0])).slice(0,10);
        const peak = topDays[0];
        drawFields([["Média por dia corrido", days ? (occurrences.length / days).toFixed(1) : "—"], ["Dias com registro", byDate.size], ["Maior volume em um dia", peak ? peak[1] : "—"], ["Data local de pico", peak ? formatDate(peak[0]) : "—"]]);
        const monthly = monthBins(occurrences, dados.dataInicio, dados.dataFim);
        drawColumnBars("Volume mensal registrado", monthly, { limit: 12 });
        drawTable("Volume mensal observado", ["Mês", "Registros criados"], monthly);
        drawTable("Dias com maior volume de registros", ["Data local", "Registros"], topDays.map(([date,count]) => [formatDate(date), count]));
        break;
      }
      case "previsao":
        drawFields([["Projeção", "Não gerada — não há método preditivo validado"], ["Orientação", "Consultar tendências históricas observadas"]]);
        break;
      case "eficiencia":
        drawFields([["Conversão abordagem → BO", "Não calculada"], ["Critério", "Sem vínculo verificável entre uma abordagem específica e um BO"]]);
        break;
      case "detalhado":
        drawTable("Registros do período — campos principais", ["Nº GM", "BO externo", "Data/hora", "Tipo", "Gravidade", "Localidade", "Situação"], occurrences.map((o) => [o.numero_ocorrencia || o.numero_temporario || "Rascunho", o.numero_bo, formatDateTime(o.criado_em), this.getTipoLabel(o.tipo_ocorrencia), o.gravidade, o.bairro_ocorrencia || o.local_ocorrencia, labelStatus(o.status)]));
        break;


      default:
        drawTable("Registros do período — campos principais", ["Nº GM", "BO externo", "Data/hora", "Tipo", "Gravidade", "Localidade", "Situação"], occurrences.map((o) => [o.numero_ocorrencia || o.numero_temporario || "Rascunho", o.numero_bo, formatDateTime(o.criado_em), this.getTipoLabel(o.tipo_ocorrencia), o.gravidade, o.bairro_ocorrencia || o.local_ocorrencia, labelStatus(o.status)]));
        break;
    }

    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) drawFooter(i, totalPages);
    return doc;
  }

  async exportarRelatorio(tipo, dados, options = {}) {
    try {
      await this.init();

      const opts = { ...this.defaultOptions, ...options };
      const reportType = options.reportType || dados?.tipoRelatorio || tipo;
      const doc = await this.gerarPDFRelatorioInstitucional({ ...dados, tipoRelatorio: reportType }, opts);
      const slug = String(reportType).toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
      const nomeArquivo = `Relatorio_${slug}_${globalThis.obterTimestampBrasilSemFuso().slice(0, 10)}.pdf`;
      doc.save(nomeArquivo);
      console.log(`✅ Relatório ${reportType} exportado com sucesso`);
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
      synced: "Sincronizada",
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
