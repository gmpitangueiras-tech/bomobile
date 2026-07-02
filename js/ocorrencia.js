/**
 * ============================================
 * GERENCIADOR DE OCORRÊNCIAS
 * Sistema de Registro de Ocorrências
 * Guarda Municipal de Pitangueiras - PR
 * ============================================
 */

class OcorrenciaManager {
  constructor() {
    this.initialized = false;
    this.ocorrencias = [];
  }

  async init() {
    if (this.initialized) return;
    this.initialized = true;
    console.log("✅ Ocorrência Manager inicializado");
  }

  async criar(dados) {
    try {
      const ocorrencia = {
        ...dados,
        status: "draft",
        criado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
        numero_temporario: `LOCAL-${Date.now()}`,
      };

      if (dbManager && dbManager.initialized) {
        const id = await dbManager.salvar("ocorrencias", ocorrencia);
        ocorrencia.id = id;

        // Adiciona à fila de sincronização
        await dbManager.salvar("sincronizacao", {
          ocorrencia_id: id,
          status: "pending",
          criado_em: new Date().toISOString(),
        });
      }

      this.ocorrencias.push(ocorrencia);
      return { success: true, data: ocorrencia };
    } catch (error) {
      console.error("❌ Erro ao criar ocorrência:", error);
      return { success: false, error: error.message };
    }
  }

  async listar(filtros = {}) {
    try {
      if (dbManager && dbManager.initialized) {
        const items = await dbManager.listar("ocorrencias");

        // Aplica filtros
        let result = items || [];

        if (filtros.status) {
          result = result.filter((item) => item.status === filtros.status);
        }

        if (filtros.criado_por) {
          result = result.filter(
            (item) => item.criado_por === filtros.criado_por,
          );
        }

        return result;
      }
      return this.ocorrencias;
    } catch (error) {
      console.error("❌ Erro ao listar ocorrências:", error);
      return [];
    }
  }

  async buscar(id) {
    try {
      if (dbManager && dbManager.initialized) {
        const item = await dbManager.buscar("ocorrencias", id);
        return item;
      }
      return this.ocorrencias.find((o) => o.id === id);
    } catch (error) {
      console.error("❌ Erro ao buscar ocorrência:", error);
      return null;
    }
  }

  async atualizar(id, dados) {
    try {
      const ocorrencia = await this.buscar(id);
      if (!ocorrencia) {
        return { success: false, error: "Ocorrência não encontrada" };
      }

      const atualizada = {
        ...ocorrencia,
        ...dados,
        atualizado_em: new Date().toISOString(),
      };

      if (dbManager && dbManager.initialized) {
        await dbManager.salvar("ocorrencias", atualizada);
      }

      const index = this.ocorrencias.findIndex((o) => o.id === id);
      if (index !== -1) {
        this.ocorrencias[index] = atualizada;
      }

      return { success: true, data: atualizada };
    } catch (error) {
      console.error("❌ Erro ao atualizar ocorrência:", error);
      return { success: false, error: error.message };
    }
  }

  async cancelar(id, motivo) {
    return this.atualizar(id, {
      status: "cancelled",
      motivo_cancelamento: motivo,
      cancelado_em: new Date().toISOString(),
    });
  }
}

const ocorrenciaManager = new OcorrenciaManager();
window.ocorrenciaManager = ocorrenciaManager;
console.log("📦 Ocorrência Manager carregado");
