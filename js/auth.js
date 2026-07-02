/**
 * ============================================
 * GERENCIADOR DE AUTENTICAÇÃO
 * Sistema de Registro de Ocorrências
 * Guarda Municipal de Pitangueiras - PR
 * ============================================
 */

/**
 * Gerenciador de Autenticação - Gerencia login, logout, sessão e redirecionamentos
 */
class AuthManager {
    constructor() {
        this.isLoggedIn = false;
        this.userData = null;
        this.onAuthChangeCallback = null;
        this.initialized = false;
        this.loginAttempts = 0;
        this.maxLoginAttempts = 5;
        this.blockedUntil = null;
        this.currentPage = null;
        this.authListeners = [];
        this.redirectTimeout = null;
    }

    /**
     * Inicializa o gerenciador de autenticação
     * @returns {Promise<boolean>} True se autenticado
     */
    async init() {
        if (this.initialized) return this.isLoggedIn;
        
        console.log('🔐 Inicializando AuthManager...');
        
        try {
            // Aguarda o Supabase inicializar
            const initialized = await supabaseClient.init();
            
            if (initialized && supabaseClient.isAuthenticated()) {
                const userId = supabaseClient.getCurrentUser()?.id;
                if (userId) {
                    const perfil = await this.carregarPerfil(userId);
                    
                    if (perfil) {
                        this.isLoggedIn = true;
                        this.userData = perfil;
                        this.initialized = true;
                        
                        console.log('✅ Usuário autenticado:', perfil.nome_completo);
                        console.log('👤 Perfil:', perfil.perfil);
                        console.log('📋 Matrícula:', perfil.matricula);
                        
                        // Notifica listeners
                        this.notificarAuthChange('login', perfil);
                        
                        // Redireciona
                        this.redirecionarPorPerfil(perfil.perfil);
                        return true;
                    } else {
                        // Usuário autenticado mas sem perfil - faz logout
                        console.warn('⚠️ Usuário sem perfil encontrado. Fazendo logout...');
                        await supabaseClient.logout();
                        this.isLoggedIn = false;
                        this.userData = null;
                    }
                }
            }
            
            this.initialized = true;
            
            // Se não está autenticado, mostra tela de login
            this.mostrarLogin();
            console.log('👤 Usuário não autenticado');
            return false;
            
        } catch (error) {
            console.error('❌ Erro ao inicializar AuthManager:', error);
            this.initialized = true;
            this.mostrarLogin();
            return false;
        }
    }

    /**
     * Carrega perfil do usuário do banco
     * @param {string} userId - ID do usuário
     * @returns {Promise<Object|null>} Dados do perfil
     */
    async carregarPerfil(userId) {
        try {
            const result = await supabaseClient.getPerfilUsuario(userId);
            if (result.success) {
                return result.data;
            }
            
            // Se não encontrou, tenta criar perfil padrão
            if (result.code === 'not_found') {
                console.log('🔄 Criando perfil para usuário:', userId);
                return await this.criarPerfilPadrao(userId);
            }
            
            return null;
        } catch (error) {
            console.error('❌ Erro ao carregar perfil:', error);
            return null;
        }
    }

    /**
     * Cria perfil padrão para novo usuário
     * @param {string} userId - ID do usuário
     * @returns {Promise<Object|null>} Perfil criado
     */
    async criarPerfilPadrao(userId) {
        try {
            const user = supabaseClient.getCurrentUser();
            if (!user) return null;
            
            // Extrai matrícula do email (remove @guarda.pitangueiras.pr.gov.br)
            const email = user.email || '';
            let matricula = email.split('@')[0] || 'USUARIO';
            
            // Remove caracteres especiais
            matricula = matricula.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            
            // Se matrícula muito curta, usa parte do ID
            if (matricula.length < 4) {
                matricula = 'GM' + userId.substring(0, 6).toUpperCase();
            }
            
            const novoPerfil = {
                nome_completo: user.user_metadata?.nome || user.email || 'Usuário',
                matricula: matricula,
                cpf: '00000000000', // Será atualizado depois
                email: user.email,
                perfil: 'guarda', // Perfil padrão
                status: 'ativo'
            };
            
            const { data, error } = await supabaseClient
                .getClient()
                .from('usuarios')
                .insert([novoPerfil])
                .select()
                .single();
            
            if (error) {
                console.error('❌ Erro ao criar perfil:', error);
                return null;
            }
            
            console.log('✅ Perfil criado com sucesso para:', matricula);
            return data;
        } catch (error) {
            console.error('❌ Erro ao criar perfil:', error);
            return null;
        }
    }

    /**
     * Realiza login do usuário
     * @param {string} matricula - Matrícula ou CPF
     * @param {string} senha - Senha do usuário
     * @returns {Promise<Object>} Resultado do login
     */
    async login(matricula, senha) {
        // Verifica se o usuário está bloqueado
        if (this.isBlocked()) {
            const tempoRestante = this.getTempoBloqueio();
            this.mostrarToast(`Muitas tentativas. Aguarde ${Math.ceil(tempoRestante / 60)} minutos.`, 'error');
            return { 
                success: false, 
                error: `Muitas tentativas. Aguarde ${Math.ceil(tempoRestante / 60)} minutos.` 
            };
        }

        this.mostrarLoading(true);
        
        try {
            console.log('🔐 Tentando login com:', matricula);
            
            const result = await supabaseClient.login(matricula, senha);
            
            if (result.success) {
                // Resetar tentativas em caso de sucesso
                this.loginAttempts = 0;
                this.blockedUntil = null;
                
                // Busca perfil do usuário
                const perfil = await this.carregarPerfil(result.user.id);
                
                if (perfil) {
                    this.isLoggedIn = true;
                    this.userData = perfil;
                    
                    this.mostrarToast('Login realizado com sucesso!', 'success');
                    this.notificarAuthChange('login', perfil);
                    
                    // Redireciona após 1 segundo
                    if (this.redirectTimeout) {
                        clearTimeout(this.redirectTimeout);
                    }
                    this.redirectTimeout = setTimeout(() => {
                        this.redirecionarPorPerfil(perfil.perfil);
                    }, 1000);
                    
                    return { success: true };
                } else {
                    // Faz logout se não encontrar perfil
                    await supabaseClient.logout();
                    this.mostrarToast('Erro: Perfil não encontrado', 'error');
                    return { success: false, error: 'Perfil não encontrado' };
                }
            } else {
                // Incrementa tentativas em caso de erro
                this.loginAttempts++;
                if (this.loginAttempts >= this.maxLoginAttempts) {
                    this.blockedUntil = new Date(Date.now() + 15 * 60 * 1000); // Bloqueia por 15 minutos
                    this.mostrarToast('Muitas tentativas. Aguarde 15 minutos.', 'error');
                } else {
                    const tentativasRestantes = this.maxLoginAttempts - this.loginAttempts;
                    this.mostrarToast(`${result.error}. ${tentativasRestantes} tentativas restantes.`, 'error');
                }
                return { success: false, error: result.error };
            }
        } catch (error) {
            console.error('❌ Erro no login:', error);
            this.mostrarToast('Erro ao realizar login', 'error');
            return { success: false, error: error.message };
        } finally {
            this.mostrarLoading(false);
        }
    }

    /**
     * Realiza logout do usuário
     * @returns {Promise<Object>} Resultado do logout
     */
    async logout() {
        try {
            this.mostrarLoading(true);
            
            const result = await supabaseClient.logout();
            
            if (result.success) {
                this.isLoggedIn = false;
                this.userData = null;
                this.currentPage = null;
                
                // Limpa dados locais
                if (window.dbManager && typeof window.dbManager.clearAll === 'function') {
                    try {
                        await window.dbManager.clearAll();
                    } catch (error) {
                        console.warn('⚠️ Erro ao limpar dados locais:', error);
                    }
                }
                
                // Cancela redirecionamento pendente
                if (this.redirectTimeout) {
                    clearTimeout(this.redirectTimeout);
                    this.redirectTimeout = null;
                }
                
                this.mostrarLogin();
                this.mostrarToast('Logout realizado com sucesso', 'info');
                this.notificarAuthChange('logout', null);
                
                return { success: true };
            } else {
                this.mostrarToast('Erro ao realizar logout', 'error');
                return { success: false, error: result.error };
            }
        } catch (error) {
            console.error('❌ Erro no logout:', error);
            this.mostrarToast('Erro ao realizar logout', 'error');
            return { success: false, error: error.message };
        } finally {
            this.mostrarLoading(false);
        }
    }

    /**
     * Verifica se o usuário está bloqueado
     * @returns {boolean} True se bloqueado
     */
    isBlocked() {
        if (!this.blockedUntil) return false;
        return new Date() < this.blockedUntil;
    }

    /**
     * Obtém tempo restante de bloqueio em segundos
     * @returns {number} Segundos restantes
     */
    getTempoBloqueio() {
        if (!this.blockedUntil) return 0;
        const diff = this.blockedUntil - new Date();
        return Math.max(0, Math.ceil(diff / 1000));
    }

    /**
     * Redireciona baseado no perfil do usuário
     * @param {string} perfil - Perfil do usuário ('guarda' ou 'supervisor')
     */
    redirecionarPorPerfil(perfil) {
        console.log('🔄 Redirecionando para:', perfil);
        
        if (perfil === 'supervisor') {
            window.location.href = '/pages/dashboard-supervisor.html';
        } else {
            window.location.href = '/pages/home.html';
        }
    }

    /**
     * Mostra tela de login
     */
    mostrarLogin() {
        const container = document.getElementById('page-content');
        if (!container) {
            console.warn('⚠️ Container #page-content não encontrado');
            return;
        }
        
        container.innerHTML = this.gerarHTMLLogin();
        this.setupLoginForm();
        this.setupSocialButtons();
    }

    /**
     * Gera HTML da tela de login - VERSÃO PREMIUM
     * @returns {string} HTML da tela de login
     */
    gerarHTMLLogin() {
        return `
            <div class="login-screen">
                <!-- Partículas decorativas -->
                <div class="particles">
                    <div class="particle"></div>
                    <div class="particle"></div>
                    <div class="particle"></div>
                    <div class="particle"></div>
                    <div class="particle"></div>
                    <div class="particle"></div>
                    <div class="particle"></div>
                    <div class="particle"></div>
                </div>
                
                <div class="login-card">
                    <div class="logo-container">
                        <div class="logo-wrapper">
                            <div class="logo-ring"></div>
                            <img src="/assets/logo.png" 
                                 alt="Guarda Municipal de Pitangueiras" 
                                 onerror="this.style.display='none'; this.parentElement.querySelector('.logo-fallback').style.display='flex'">
                            <div class="logo-fallback" style="display:none;">🛡️</div>
                        </div>
                        <h1>Guarda Municipal</h1>
                        <h2>Pitangueiras - PR</h2>
                        <div class="municipio">⚜️ ${CONFIG.MUNICIPIO} - ${CONFIG.ESTADO}</div>
                        <div class="subtitle">Sistema de Registro de Ocorrências</div>
                    </div>
                    
                    <div class="divider">
                        <span class="line"></span>
                        <span class="shield-icon">🛡️</span>
                        <span class="line"></span>
                    </div>
                    
                    <form id="loginForm" autocomplete="off" novalidate>
                        <div class="form-group">
                            <label for="matricula">
                                CPF ou Matrícula <span class="required">*</span>
                            </label>
                            <div class="input-wrapper">
                                <span class="input-icon-left">👤</span>
                                <input 
                                    type="text" 
                                    id="matricula" 
                                    placeholder="Ex: GM12345 ou 123.456.789-00"
                                    autocomplete="username"
                                    required
                                    maxlength="20"
                                >
                            </div>
                            <div class="input-error" id="matriculaError"></div>
                        </div>
                        
                        <div class="form-group">
                            <label for="senha">
                                Senha <span class="required">*</span>
                            </label>
                            <div class="input-wrapper">
                                <span class="input-icon-left">🔒</span>
                                <input 
                                    type="password" 
                                    id="senha" 
                                    placeholder="Digite sua senha"
                                    autocomplete="current-password"
                                    required
                                    maxlength="50"
                                >
                                <button type="button" class="toggle-password" onclick="window.authManager?.toggleSenha()">
                                    👁️
                                </button>
                            </div>
                            <div class="input-error" id="senhaError"></div>
                        </div>
                        
                        <div class="options-row">
                            <label class="checkbox-container">
                                <input type="checkbox" id="remember-me">
                                <span>Lembrar-me</span>
                            </label>
                            <a href="#" class="forgot-link" onclick="event.preventDefault(); window.authManager?.mostrarToast('Entre em contato com o administrador do sistema para redefinir sua senha.', 'info')">
                                Esqueceu a senha?
                            </a>
                        </div>
                        
                        <button type="submit" class="btn-primario" id="loginBtn">
                            <span class="btn-content">
                                <span class="btn-text">🔐 Entrar no Sistema</span>
                                <span class="spinner-small"></span>
                            </span>
                        </button>
                    </form>
                    
                    <div id="loginLoading" style="display: none; text-align: center; padding: 16px;">
                        <div class="spinner spinner-azul" style="margin: 0 auto; width: 32px; height: 32px; border-width: 3px;"></div>
                        <p style="margin-top: 8px; color: var(--cinza-medio); font-size: 14px; font-weight: 500;">Aguarde...</p>
                    </div>
                    
                    <div class="login-footer">
                        <div class="footer-text">
                            Ambiente seguro · v<span class="version">${CONFIG.VERSAO}</span>
                        </div>
                        <div class="footer-badges">
                            <span>🔒 SSL</span>
                            <span>🛡️ Guarda Municipal</span>
                            <span>⚜️ Pitangueiras</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Configura formulário de login
     */
    setupLoginForm() {
        const form = document.getElementById('loginForm');
        if (!form) return;

        // Remove listeners anteriores (evita duplicação)
        const newForm = form.cloneNode(true);
        form.parentNode.replaceChild(newForm, form);
        
        const formAtual = document.getElementById('loginForm');
        if (!formAtual) return;

        // Submit do formulário
        formAtual.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Valida campos
            const matricula = document.getElementById('matricula').value.trim();
            const senha = document.getElementById('senha').value;
            
            // Limpa erros anteriores
            this.limparErros();
            
            let hasError = false;
            
            if (!matricula) {
                this.mostrarErro('matricula', 'Digite sua matrícula ou CPF');
                hasError = true;
            }
            
            if (!senha) {
                this.mostrarErro('senha', 'Digite sua senha');
                hasError = true;
            }
            
            if (hasError) return;
            
            await this.login(matricula, senha);
        });

        // Validação em tempo real
        const matriculaInput = document.getElementById('matricula');
        const senhaInput = document.getElementById('senha');
        
        if (matriculaInput) {
            matriculaInput.addEventListener('input', () => {
                this.limparErro('matricula');
            });
            matriculaInput.addEventListener('blur', () => {
                const valor = matriculaInput.value.trim();
                if (valor && valor.length < 3) {
                    this.mostrarErro('matricula', 'Digite uma matrícula válida');
                }
            });
        }
        
        if (senhaInput) {
            senhaInput.addEventListener('input', () => {
                this.limparErro('senha');
                if (senhaInput.value.length > 0 && senhaInput.value.length < 4) {
                    this.mostrarErro('senha', 'A senha deve ter pelo menos 4 caracteres');
                }
            });
        }

        // Enter key já é tratado pelo submit do form

        // Salva o estado do "Lembrar-me"
        const rememberCheck = document.getElementById('remember-me');
        if (rememberCheck) {
            const saved = localStorage.getItem('remember_me');
            if (saved === 'true') {
                rememberCheck.checked = true;
                const savedMatricula = localStorage.getItem('saved_matricula');
                if (savedMatricula && matriculaInput) {
                    matriculaInput.value = savedMatricula;
                }
            }
            
            rememberCheck.addEventListener('change', () => {
                localStorage.setItem('remember_me', rememberCheck.checked);
                if (rememberCheck.checked) {
                    const matricula = document.getElementById('matricula').value.trim();
                    if (matricula) {
                        localStorage.setItem('saved_matricula', matricula);
                    }
                } else {
                    localStorage.removeItem('saved_matricula');
                }
            });
        }
    }

    /**
     * Configura botões sociais (se houver)
     */
    setupSocialButtons() {
        // Placeholder para futuras integrações (ex: login com Google, etc)
    }

    /**
     * Mostra erro em um campo
     * @param {string} fieldId - ID do campo
     * @param {string} message - Mensagem de erro
     */
    mostrarErro(fieldId, message) {
        const input = document.getElementById(fieldId);
        const errorDiv = document.getElementById(fieldId + 'Error');
        
        if (input) {
            input.classList.add('error');
        }
        
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
        }
    }

    /**
     * Limpa erro de um campo
     * @param {string} fieldId - ID do campo
     */
    limparErro(fieldId) {
        const input = document.getElementById(fieldId);
        const errorDiv = document.getElementById(fieldId + 'Error');
        
        if (input) {
            input.classList.remove('error');
        }
        
        if (errorDiv) {
            errorDiv.textContent = '';
            errorDiv.style.display = 'none';
        }
    }

    /**
     * Limpa todos os erros
     */
    limparErros() {
        this.limparErro('matricula');
        this.limparErro('senha');
    }

    /**
     * Mostra/esconde senha
     */
    toggleSenha() {
        const input = document.getElementById('senha');
        const btn = document.querySelector('.toggle-password');
        
        if (input && btn) {
            if (input.type === 'password') {
                input.type = 'text';
                btn.textContent = '🙈';
            } else {
                input.type = 'password';
                btn.textContent = '👁️';
            }
        }
    }

    /**
     * Mostra/esconde loading
     * @param {boolean} show - True para mostrar loading
     */
    mostrarLoading(show) {
        const form = document.getElementById('loginForm');
        const loading = document.getElementById('loginLoading');
        const btn = document.getElementById('loginBtn');
        
        if (form) {
            form.style.display = show ? 'none' : 'block';
        }
        
        if (loading) {
            loading.style.display = show ? 'block' : 'none';
        }
        
        if (btn) {
            btn.disabled = show;
            if (show) {
                btn.classList.add('loading');
                btn.querySelector('.btn-text').textContent = 'AGUARDE...';
            } else {
                btn.classList.remove('loading');
                btn.querySelector('.btn-text').textContent = '🔐 Entrar no Sistema';
            }
        }
    }

    /**
     * Mostra toast/notificação
     * @param {string} mensagem - Mensagem a ser exibida
     * @param {string} tipo - Tipo: success, error, warning, info
     */
    mostrarToast(mensagem, tipo = 'info') {
        // Remove toast existente
        const old = document.querySelector('.toast');
        if (old) old.remove();
        
        const toast = document.createElement('div');
        toast.className = `toast toast-${tipo}`;
        
        // Ícones para cada tipo
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        
        toast.innerHTML = `${icons[tipo] || 'ℹ️'} ${mensagem}`;
        document.body.appendChild(toast);
        
        // Remove após 4 segundos
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s ease';
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 4000);
    }

    /**
     * Adiciona listener para mudanças de autenticação
     * @param {Function} callback - Função a ser chamada quando houver mudança
     */
    onAuthChange(callback) {
        if (typeof callback === 'function') {
            this.onAuthChangeCallback = callback;
            console.log('✅ Listener de autenticação registrado');
        } else {
            console.warn('⚠️ Callback inválido para onAuthChange');
        }
    }

    /**
     * Notifica mudanças de autenticação
     * @param {string} event - Evento ('login' ou 'logout')
     * @param {Object} data - Dados do evento
     */
    notificarAuthChange(event, data) {
        // Notifica o callback principal
        if (this.onAuthChangeCallback) {
            try {
                this.onAuthChangeCallback(event, data);
            } catch (error) {
                console.error('❌ Erro no callback de autenticação:', error);
            }
        }
        
        // Notifica os listeners adicionais
        this.authListeners.forEach(callback => {
            try {
                callback(event, data);
            } catch (error) {
                console.error('❌ Erro no listener de autenticação:', error);
            }
        });
    }

    /**
     * Adiciona um listener para eventos de autenticação
     * @param {Function} callback - Função a ser chamada
     */
    addAuthListener(callback) {
        if (typeof callback === 'function') {
            this.authListeners.push(callback);
            console.log('✅ Listener adicional de autenticação registrado');
        }
    }

    /**
     * Remove um listener de autenticação
     * @param {Function} callback - Função a ser removida
     */
    removeAuthListener(callback) {
        this.authListeners = this.authListeners.filter(cb => cb !== callback);
        console.log('🗑️ Listener de autenticação removido');
    }

    /**
     * Verifica se usuário está logado
     * @returns {boolean} True se logado
     */
    isLoggedIn() {
        return this.isLoggedIn;
    }

    /**
     * Obtém dados do usuário
     * @returns {Object|null} Dados do usuário
     */
    getUser() {
        return this.userData;
    }

    /**
     * Obtém o perfil do usuário
     * @returns {string|null} Perfil do usuário
     */
    getPerfil() {
        return this.userData?.perfil || null;
    }

    /**
     * Obtém a matrícula do usuário
     * @returns {string|null} Matrícula do usuário
     */
    getMatricula() {
        return this.userData?.matricula || null;
    }

    /**
     * Obtém o nome completo do usuário
     * @returns {string|null} Nome do usuário
     */
    getNomeCompleto() {
        return this.userData?.nome_completo || null;
    }

    /**
     * Obtém o ID do usuário
     * @returns {string|null} ID do usuário
     */
    getUserId() {
        return this.userData?.id || null;
    }

    /**
     * Obtém o email do usuário
     * @returns {string|null} Email do usuário
     */
    getEmail() {
        return this.userData?.email || null;
    }

    /**
     * Obtém o status do usuário
     * @returns {string|null} Status do usuário
     */
    getStatus() {
        return this.userData?.status || null;
    }

    /**
     * Verifica se o usuário atual é supervisor
     * @returns {Promise<boolean>} True se supervisor
     */
    async isSupervisor() {
        if (!this.userData) return false;
        return this.userData.perfil === 'supervisor';
    }

    /**
     * Verifica se o usuário atual é guarda
     * @returns {boolean} True se guarda
     */
    isGuarda() {
        if (!this.userData) return false;
        return this.userData.perfil === 'guarda';
    }

    /**
     * Recupera a página atual
     * @returns {string} Página atual
     */
    getCurrentPage() {
        return this.currentPage;
    }

    /**
     * Define a página atual
     * @param {string} page - Nome da página
     */
    setCurrentPage(page) {
        this.currentPage = page;
    }

    /**
     * Verifica se o usuário tem permissão para acessar uma página
     * @param {string} page - Página a ser acessada
     * @returns {boolean} True se tem permissão
     */
    hasPermission(page) {
        if (!this.userData) return false;
        
        // Páginas de supervisor
        const supervisorPages = [
            '/pages/dashboard-supervisor.html',
            '/pages/relatorios.html',
            '/pages/usuarios.html',
            '/pages/auditoria.html',
            '/pages/configuracoes-sistema.html'
        ];
        
        // Páginas de guarda
        const guardaPages = [
            '/pages/home.html',
            '/pages/nova-ocorrencia.html',
            '/pages/detalhes.html',
            '/pages/minhas-ocorrencias.html'
        ];
        
        // Páginas públicas (qualquer um logado pode acessar)
        const publicPages = [
            '/pages/perfil.html',
            '/pages/configuracoes.html',
            '/pages/ajuda.html'
        ];
        
        if (publicPages.includes(page)) return true;
        
        if (this.userData.perfil === 'supervisor') {
            return true; // Supervisor tem acesso a tudo
        }
        
        if (this.userData.perfil === 'guarda') {
            return guardaPages.includes(page) || !supervisorPages.includes(page);
        }
        
        return false;
    }

    /**
     * Verifica se o usuário tem permissão para editar uma ocorrência
     * @param {Object} ocorrencia - Dados da ocorrência
     * @returns {boolean} True se pode editar
     */
    podeEditar(ocorrencia) {
        if (!this.userData) return false;
        
        // Supervisor pode editar qualquer uma
        if (this.userData.perfil === 'supervisor') return true;
        
        // Guarda só pode editar as próprias (se não estiver finalizada)
        if (this.userData.perfil === 'guarda') {
            return ocorrencia.criado_por === this.userData.id && 
                   ocorrencia.status !== 'synced' &&
                   ocorrencia.status !== 'cancelled';
        }
        
        return false;
    }

    /**
     * Verifica se o usuário tem permissão para visualizar uma ocorrência
     * @param {Object} ocorrencia - Dados da ocorrência
     * @returns {boolean} True se pode visualizar
     */
    podeVisualizar(ocorrencia) {
        if (!this.userData) return false;
        
        // Supervisor pode visualizar qualquer uma
        if (this.userData.perfil === 'supervisor') return true;
        
        // Guarda só pode visualizar as próprias
        if (this.userData.perfil === 'guarda') {
            return ocorrencia.criado_por === this.userData.id;
        }
        
        return false;
    }

    /**
     * Verifica se o usuário tem permissão para cancelar uma ocorrência
     * @param {Object} ocorrencia - Dados da ocorrência
     * @returns {boolean} True se pode cancelar
     */
    podeCancelar(ocorrencia) {
        if (!this.userData) return false;
        
        // Supervisor pode cancelar qualquer uma
        if (this.userData.perfil === 'supervisor') return true;
        
        // Guarda só pode cancelar as próprias (se não estiver finalizada)
        if (this.userData.perfil === 'guarda') {
            return ocorrencia.criado_por === this.userData.id && 
                   ocorrencia.status !== 'synced' &&
                   ocorrencia.status !== 'cancelled';
        }
        
        return false;
    }

    /**
     * Verifica se o usuário tem permissão para finalizar uma ocorrência
     * @param {Object} ocorrencia - Dados da ocorrência
     * @returns {boolean} True se pode finalizar
     */
    podeFinalizar(ocorrencia) {
        if (!this.userData) return false;
        
        // Supervisor pode finalizar qualquer uma
        if (this.userData.perfil === 'supervisor') return true;
        
        // Guarda só pode finalizar as próprias
        if (this.userData.perfil === 'guarda') {
            return ocorrencia.criado_por === this.userData.id && 
                   ocorrencia.status === 'draft';
        }
        
        return false;
    }

    /**
     * Verifica se o usuário tem permissão para anexar arquivos
     * @param {Object} ocorrencia - Dados da ocorrência
     * @returns {boolean} True se pode anexar
     */
    podeAnexar(ocorrencia) {
        if (!this.userData) return false;
        
        // Supervisor pode anexar a qualquer uma
        if (this.userData.perfil === 'supervisor') return true;
        
        // Guarda só pode anexar às próprias (se não estiver finalizada)
        if (this.userData.perfil === 'guarda') {
            return ocorrencia.criado_por === this.userData.id && 
                   ocorrencia.status !== 'cancelled';
        }
        
        return false;
    }

    /**
     * Verifica se o usuário tem permissão para visualizar relatórios
     * @returns {boolean} True se pode visualizar relatórios
     */
    podeVisualizarRelatorios() {
        if (!this.userData) return false;
        return this.userData.perfil === 'supervisor';
    }

    /**
     * Verifica se o usuário tem permissão para gerenciar usuários
     * @returns {boolean} True se pode gerenciar usuários
     */
    podeGerenciarUsuarios() {
        if (!this.userData) return false;
        return this.userData.perfil === 'supervisor';
    }

    /**
     * Verifica se o usuário tem permissão para visualizar auditoria
     * @returns {boolean} True se pode visualizar auditoria
     */
    podeVisualizarAuditoria() {
        if (!this.userData) return false;
        return this.userData.perfil === 'supervisor';
    }

    /**
     * Atualiza os dados do usuário
     * @param {Object} novosDados - Novos dados do usuário
     * @returns {Promise<Object>} Resultado da operação
     */
    async atualizarUsuario(novosDados) {
        try {
            if (!this.userData) {
                return { success: false, error: 'Usuário não logado' };
            }

            const { data, error } = await supabaseClient
                .getClient()
                .from('usuarios')
                .update(novosDados)
                .eq('id', this.userData.id)
                .select()
                .single();

            if (error) {
                throw error;
            }

            this.userData = data;
            console.log('✅ Dados do usuário atualizados');
            this.notificarAuthChange('user_update', data);
            
            return { success: true, data: data };
        } catch (error) {
            console.error('❌ Erro ao atualizar usuário:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Verifica se a sessão é válida
     * @returns {Promise<boolean>} True se a sessão é válida
     */
    async verificarSessao() {
        try {
            if (!this.isLoggedIn) return false;
            
            const { data: { user }, error } = await supabaseClient
                .getClient()
                .auth.getUser();
            
            if (error || !user) {
                console.warn('⚠️ Sessão inválida');
                await this.logout();
                return false;
            }
            
            return true;
        } catch (error) {
            console.error('❌ Erro ao verificar sessão:', error);
            return false;
        }
    }

    /**
     * Renova a sessão do usuário
     * @returns {Promise<boolean>} True se renovou com sucesso
     */
    async renovarSessao() {
        try {
            const { data, error } = await supabaseClient
                .getClient()
                .auth.refreshSession();
            
            if (error) {
                throw error;
            }
            
            if (data.session) {
                console.log('✅ Sessão renovada com sucesso');
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('❌ Erro ao renovar sessão:', error);
            return false;
        }
    }

    /**
     * Limpa dados de autenticação
     */
    limparDadosAutenticacao() {
        localStorage.removeItem('supabase-auth-token');
        localStorage.removeItem('remember_me');
        localStorage.removeItem('saved_matricula');
        this.isLoggedIn = false;
        this.userData = null;
        this.initialized = false;
        console.log('🗑️ Dados de autenticação limpos');
    }

    /**
     * Obtém o token de acesso atual
     * @returns {string|null} Token de acesso
     */
    getAccessToken() {
        return supabaseClient.getAccessToken();
    }

    /**
     * Verifica se o token está expirado
     * @returns {boolean} True se expirado
     */
    isTokenExpired() {
        return supabaseClient.isTokenExpired();
    }

    /**
     * Redireciona para a página de login
     */
    redirectToLogin() {
        window.location.href = '/';
    }

    /**
     * Redireciona para a página inicial do perfil
     */
    redirectToHome() {
        if (!this.userData) {
            this.redirectToLogin();
            return;
        }
        this.redirecionarPorPerfil(this.userData.perfil);
    }
}

// ============================================
// INSTÂNCIA GLOBAL
// ============================================

// Cria a instância global
const authManager = new AuthManager();

// 🔴 EXPÕE PARA O WINDOW (GLOBAL)
window.authManager = authManager;

// ============================================
// LOG DE INICIALIZAÇÃO
// ============================================

console.log('🔐 AuthManager inicializado');
console.log('📋 Versão:', CONFIG.VERSAO);

// ============================================
// EXPORTA PARA MÓDULOS (CASO USE)
// ============================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { authManager };
}

if (typeof define === 'function' && define.amd) {
    define([], function() {
        return { authManager };
    });
}

console.log('✅ AuthManager pronto para uso');
