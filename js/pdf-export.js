/**
 * PDF EXPORT - Exportação de ocorrências
 * Placeholder para desenvolvimento futuro
 */

class PDFExport {
  constructor() {
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    this.initialized = true;
    console.log("📄 PDF Export (placeholder) inicializado");
  }

  async exportarOcorrencia(ocorrenciaId) {
    try {
      console.log("📄 Exportando ocorrência:", ocorrenciaId);
      const { data: o, error } = await ocorrenciaManager.buscar(ocorrenciaId);
      if (error) throw error;

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      
      // Cabeçalho
      doc.setFillColor(0, 63, 135); // Azul Bandeira
      doc.rect(0, 0, 210, 40, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.text("GUARDA MUNICIPAL DE PITANGUEIRAS - PR", 105, 15, { align: "center" });
      doc.setFontSize(12);
      doc.text("Relatório de Registro de Ocorrência", 105, 25, { align: "center" });
      doc.setFontSize(10);
      doc.text(`Número: ${o.numero_ocorrencia || 'RASCUNHO'} | Data: ${new Date(o.criado_em).toLocaleDateString('pt-BR')}`, 105, 33, { align: "center" });

      // Corpo
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(12);
      let y = 50;

      const addField = (label, value) => {
        doc.setFont("helvetica", "bold");
        doc.text(`${label}:`, 20, y);
        doc.setFont("helvetica", "normal");
        doc.text(`${value || 'N/A'}`, 70, y);
        y += 10;
      };

      addField("Natureza", o.tipo_ocorrencia);
      addField("Sub-tipo", o.sub_tipo_ocorrencia);
      addField("Local", o.local_ocorrencia);
      addField("Bairro", o.bairro_ocorrencia);
      addField("Data/Hora Fato", app.formatarDataHoraLocal(o.data_hora_inicio));
      
      y += 5;
      doc.setFont("helvetica", "bold");
      doc.text("Descrição dos Fatos:", 20, y);
      y += 7;
      doc.setFont("helvetica", "normal");
      const splitDesc = doc.splitTextToSize(o.observacoes || "Sem descrição informada.", 170);
      doc.text(splitDesc, 20, y);
      
      y += (splitDesc.length * 7) + 10;
      
      // Rodapé
      doc.setFontSize(8);
      doc.text(`Gerado por: ${app.getNome()} | CPF: ${app.getCPF()}`, 20, 285);
      doc.text(`Página 1 de 1`, 180, 285);

      doc.save(`Ocorrencia_${o.numero_ocorrencia || 'Rascunho'}.pdf`);
      return { success: true };
    } catch (error) {
      console.error("Erro PDF:", error);
      alert("Erro ao gerar PDF: " + error.message);
      return { success: false, error: error.message };
    }
  }

  async exportarRelatorio(filtros) {
    console.log("📄 [PLACEHOLDER] Exportando relatório:", filtros);
    alert("📄 Exportação de relatório em desenvolvimento");
    return { success: true };
  }
}

const pdfExport = new PDFExport();
window.pdfExport = pdfExport;
