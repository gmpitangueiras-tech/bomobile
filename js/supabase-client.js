// supabase-client.js - Configuração do cliente Supabase

import { createClient } from "@supabase/supabase-js";

// Substitua com suas credenciais
const supabaseUrl = "https://seu-projeto.supabase.co";
const supabaseKey = "sua-chave-anonima";

export const supabase = createClient(supabaseUrl, supabaseKey);

// Configuração para persistência de sessão
export const supabaseOptions = {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: localStorage,
    storageKey: "sb-auth-token",
  },
};

// Função para verificar conexão
export const checkConnection = async () => {
  try {
    const { data, error } = await supabase.from("usuarios").select("count");
    return !error;
  } catch (e) {
    return false;
  }
};

// Função para obter dados da sessão
export const getSession = async () => {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) throw error;
  return session;
};

// Função para logout
export const logout = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  localStorage.removeItem("auth_session");
};
