class SupabaseClient {
  constructor() {
    this.client = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return this.client;

    try {
      let tentativas = 0;
      while (typeof supabase === "undefined" && tentativas < 20) {
        await new Promise((r) => setTimeout(r, 500));
        tentativas++;
      }

      if (typeof supabase === "undefined") {
        throw new Error("Supabase não carregado");
      }

      const { createClient } = supabase;
      this.client = createClient(
        CONFIG.SUPABASE_URL,
        CONFIG.SUPABASE_ANON_KEY,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            storage: localStorage,
          },
        },
      );

      this.initialized = true;
      console.log("✅ Supabase Client inicializado");
      return this.client;
    } catch (error) {
      console.error("❌ Erro ao inicializar Supabase:", error);
      return null;
    }
  }

  getClient() {
    return this.client;
  }
  isInitialized() {
    return this.initialized && this.client !== null;
  }
}

const supabaseClient = new SupabaseClient();
window.supabaseClient = supabaseClient;
