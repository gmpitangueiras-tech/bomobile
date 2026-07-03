/**
 * DASHBOARD - Estatísticas e gráficos
 * Placeholder para desenvolvimento futuro
 */

class DashboardManager {
  constructor() {
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    this.initialized = true;
    console.log("📊 Dashboard Manager (placeholder) inicializado");
  }

  async getStats() {
    return {
      total: 0,
      hoje: 0,
      pendentes: 0,
      finalizadas: 0,
      canceladas: 0,
    };
  }

  async getChartData() {
    return {
      labels: [],
      values: [],
    };
  }
}

const dashboardManager = new DashboardManager();
window.dashboardManager = dashboardManager;
