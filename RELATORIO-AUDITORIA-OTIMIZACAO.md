# Auditoria técnica e plano de otimização
## Guarda Municipal de Pitangueiras — app `bomobile`

**Data da auditoria:** 06/11/2026  
**Repositório analisado:** `gmpitangueiras-tech/bomobile`  
**Supabase principal analisado:** `wswezvcxfljzcttpqkch` (`gmpitangueiras-tech's Project`)  
**Projeto de homologação identificado:** `etwhrqkpwohkrvzcmewn` (`homologacao`, atualmente inativo)

## 1. Conclusão executiva

A aplicação não está em HTML/CSS/JavaScript “simples” no sentido funcional: ela já possui uma arquitetura de PWA relativamente completa, com módulos ES, Service Worker, IndexedDB, cofre local AES-GCM/PBKDF2, fila offline, retentativas, sincronização e separação parcial por módulos. O problema principal é outro: a base cresceu organicamente e hoje tem muita lógica acoplada ao DOM, estado global em `window`, renderização por grandes strings `innerHTML`, consultas `select("*")` e arquivos muito grandes.

**Recomendação:** não fazer uma reescrita total antes da produção. Primeiro estabilizar e otimizar a base atual. Em seguida, migrar gradualmente para **React + TypeScript + Vite**, mantendo o Supabase, o modelo de dados e a lógica de sincronização, mas extraindo os serviços de domínio antes da migração visual.

Para este caso, React é a minha primeira escolha por causa do ecossistema de PWA, TypeScript, testes, formulários, acessibilidade e contratação/manutenção. Vue também funcionaria e seria uma opção válida se a equipe já dominar Vue. A troca de framework, sozinha, não resolveria performance; a maior parte do ganho vem de arquitetura de dados, bundle e renderização.

## 2. O que foi encontrado

### Front-end

- PWA mobile-first já existente, com manifesto e Service Worker.
- Navegação própria com páginas renderizadas no mesmo shell.
- Módulos ES misturados com scripts clássicos e muitas dependências globais.
- Cerca de **42.678 linhas de JavaScript**, **11.036 linhas de CSS** e **572 linhas de HTML**.
- Arquivos grandes: `consulta.js` ~181 KB, `relatorios.js` ~168 KB, `nova-ocorrencia.js` ~139 KB, `pdf-export.js` ~113 KB, `ocorrencia.js` ~93 KB.
- Muitos pontos de `window.*` e funções globais para conectar HTML renderizado com handlers.
- Uso recorrente de `innerHTML`, inclusive para telas grandes.
- Muitos `.select("*")`, o que aumenta tráfego, memória e exposição de dados.
- O Service Worker faz pré-cache de quase todos os módulos JavaScript, aumentando o custo de instalação e atualização no celular.
- Dependências principais são carregadas por CDN em runtime: Supabase JS, Leaflet, MarkerCluster, Font Awesome e jsPDF.
- Não foi identificado `package.json`/pipeline de build no checkout analisado; a aplicação é entregue essencialmente como arquivos estáticos.
- Há um `js/supabase-client.js` com placeholders (`seu-projeto.supabase.co`), enquanto a aplicação efetiva usa `js/supabase.js` e `CONFIG`. Esse arquivo duplicado deve ser removido ou claramente isolado para não induzir uma configuração incorreta.

### Offline e sincronização

A solução offline é um ponto forte: o cofre usa AES-GCM com chave derivada por PBKDF2, o conteúdo fica no IndexedDB e o Service Worker não recebe a chave. A fila tem idempotência, prioridade e retry.

Os principais riscos de manutenção são a complexidade e a duplicação: há lógica de sincronização extensa, estados de ocorrência e abordagens distribuídos em vários módulos, além de dependência de objetos globais. Essa parte deve ser preservada funcionalmente e extraída para uma camada de serviços antes de qualquer troca de framework.

### Supabase

O projeto ativo possui, no momento da auditoria:

- 27 tabelas públicas;
- 6 views;
- 102 funções públicas;
- 133 índices;
- RLS habilitado nas tabelas operacionais principais;
- 3 Edge Functions ativas: `legacy-login`, `admin-governance` e `upload-avatar`.

O repositório informa corretamente que o app aponta para o projeto principal ativo, não para a homologação inativa.

## 3. Itens que devem ser resolvidos antes da produção

### Prioridade P0 — segurança e governança

1. **Revisar as 8 tabelas com RLS habilitado e sem policy**, identificadas pelo advisor do Supabase: `configuracoes`, `gm_auth_login_attempts`, `governance_attachment_access`, `governance_export_requests`, `governance_permission_reviews`, `governance_retention_policies`, `historico_fases` e `sistema_erros`.

   Isso pode ser intencional para tabelas acessíveis somente por Edge Functions/SQL SECURITY DEFINER, mas precisa estar documentado e testado. Se alguma for acessada diretamente pelo cliente, haverá falha ou risco de implementação alternativa insegura. Não criar policy ampla apenas para “fazer funcionar”.

2. **Revisar as funções SECURITY DEFINER expostas a `anon` ou `authenticated`**, principalmente as funções de senha, auditoria, notificações e governança. O advisor apontou funções executáveis diretamente por papéis externos. A regra recomendada é: revogar `EXECUTE` por padrão e conceder apenas ao papel necessário; manter SECURITY DEFINER somente onde for indispensável.

3. **Fixar o `search_path` das funções**. O advisor apontou 23 funções com search path mutável. Definir `SET search_path = ...` explicitamente e qualificar nomes de tabelas/funções reduz risco de resolução inesperada.

4. **Ativar proteção contra senhas vazadas no Supabase Auth** e confirmar política mínima de senha, expiração/revogação de sessão e fluxo de primeiro acesso.

5. **Validar os Edge Functions com `verify_jwt: false`**. O código faz validação manual do token, o que é melhor do que confiar apenas no CORS, mas é preferível habilitar a verificação nativa quando compatível com o fluxo. O CORS não é mecanismo de autenticação.

6. **Revisar armazenamento de PII**. A tabela `usuarios` e as estruturas de ocorrência/envolvidos contêm CPF, RG, telefone e outros dados pessoais. Confirmar minimização, retenção, exportação, acesso a anexos, logs sem PII desnecessária e política de descarte conforme LGPD.

### Prioridade P1 — performance e confiabilidade

1. Remover `select("*")` de telas e sincronização. Criar projeções explícitas por caso de uso, por exemplo:
   - lista de ocorrências: campos de resumo;
   - detalhe: campos completos e filhos sob demanda;
   - dashboard: view/RPC agregada;
   - relatórios: consultas paginadas e específicas.

2. Adicionar índices para as 17 foreign keys sem índice de cobertura apontadas pelo advisor, priorizando as tabelas de governança, logs, mural e as chaves de ocorrência. Validar os índices com dados reais antes de criar todos.

3. Eliminar os 4 pares de índices duplicados identificados pelo advisor, depois de confirmar nomes usados por migrations e consultas:
   - `abordagens_veiculos`: `idx_abordagens_placa` / `idx_abordagens_veiculos_placa`;
   - `notificacoes`: `idx_notificacoes_usuario` / `idx_notificacoes_usuario_id`;
   - `ocorrencias`: `idx_ocorrencias_numero` / `idx_ocorrencias_numero_ocorrencia`;
   - `sistema_erros`: `sistema_erros_governance_triage_idx` / `sistema_erros_resolvido_idx`.

4. Não remover índices apenas porque aparecem como “unused” no advisor agora: a base ainda tem volume pequeno e o uso histórico pode não representar produção. Fazer isso somente após métricas e uma janela real de operação.

5. Criar views/RPCs read-only para dashboard, contadores, pendências e relatórios. Isso reduz múltiplas chamadas do celular e centraliza regras de agregação no banco.

6. Usar paginação por cursor/keyset para listas grandes, especialmente logs, ocorrências, notificações e relatórios. Evitar `count: exact` em toda atualização de tela quando não for indispensável.

## 4. Otimização imediata do front-end, sem trocar de framework

### Etapa A — baixo risco e alto retorno

- Criar um build com Vite/rollup mesmo mantendo JavaScript por algumas semanas: minificação, compressão, hashing de assets, importação sob demanda e análise de bundle.
- Migrar dependências CDN para dependências versionadas e empacotadas, especialmente Supabase JS, Leaflet, Font Awesome e jsPDF.
- Dividir o bundle por rota: o guarda não precisa baixar governança, relatórios e administração no primeiro acesso.
- Fazer lazy-load de mapa, PDF, relatórios, governança, mural e consulta profunda.
- Pré-cachear apenas o shell mínimo e os assets realmente necessários para o fluxo offline; não pré-cachear todos os módulos administrativos no celular.
- Remover o cliente Supabase duplicado com placeholders e consolidar uma única fábrica de cliente.
- Centralizar `CONFIG`, status e tipos de dados em um único módulo.
- Substituir `select("*")` por colunas explícitas.
- Comprimir imagens antes do upload e gerar thumbnails no backend/storage quando necessário.
- Medir Web Vitals, tempo de login, tempo de abertura de “nova ocorrência”, tamanho do cache e duração da sincronização.

### Etapa B — manutenção e robustez

- Extrair `services/` para autenticação, ocorrências, abordagens, anexos, notificações, relatórios e governança.
- Extrair `repositories/` para as consultas Supabase; nenhum componente/tela deve montar query diretamente.
- Criar `domain/` para regras de status, retificação, finalização e conflito.
- Criar um store único de sessão e sincronização, em vez de vários globais `window.*`.
- Validar payloads de entrada/saída com TypeScript e/ou schemas runtime.
- Adicionar testes automatizados para: login, criação offline, reabertura do cofre, retry, idempotência, conflito, retificação e permissões.
- Adicionar tratamento consistente de erro e telemetria sem CPF, senha, token ou conteúdo sensível.

## 5. Arquitetura recomendada para a evolução

### Stack sugerida

- **React + TypeScript + Vite** para a camada de interface;
- React Router ou roteamento equivalente para separar rotas de guarda, supervisor e administrador;
- TanStack Query para cache, invalidação, paginação e estados de rede;
- Zustand ou store pequeno equivalente apenas para sessão, sincronização e estado de UI;
- IndexedDB com uma camada própria ou biblioteca madura, mantendo AES-GCM/PBKDF2 e a regra de que a chave não vai para o Service Worker;
- Supabase JS somente nos repositories/services;
- Vitest + Testing Library para testes unitários e de interface;
- Playwright para testes de fluxo em viewport móvel e desktop administrativo;
- Workbox ou Service Worker próprio enxuto para o shell PWA.

### Separação de interfaces

Manter o mesmo backend, mas ter dois shells de interface:

1. **Aplicativo operacional móvel:** dashboard curto, nova ocorrência, consulta, notificações, mural e perfil; foco em toque, câmera, GPS, baixa conectividade e formulários em etapas.
2. **Console administrativo desktop:** usuários, logs, governança, relatórios e auditoria; foco em tabelas, filtros, exportação e navegação por teclado.

Isso evita que o usuário móvel carregue e processe a área administrativa inteira.

### Estratégia de migração

1. Congelar o comportamento atual com testes de contrato e uma matriz de permissões.
2. Criar build e TypeScript sem alterar fluxos.
3. Extrair serviços/repositories da aplicação atual.
4. Migrar primeiro login, shell, dashboard e nova ocorrência.
5. Migrar sincronização/offline como módulo independente, sem reescrever a criptografia por estética.
6. Migrar consulta, retificações e relatórios.
7. Migrar console administrativo por último.
8. Fazer rollout gradual, com possibilidade de voltar à versão anterior.

## 6. O que eu não recomendo

- Não reescrever tudo para React antes de corrigir os advisors de segurança.
- Não transformar o app em um conjunto de chamadas REST próprias se o Supabase já atende; primeiro organizar repositories e RPCs.
- Não colocar service role key no navegador.
- Não usar `localStorage` para dados operacionais sensíveis ou tokens persistentes; a direção atual do cofre cifrado é mais adequada.
- Não criar policies RLS genéricas apenas para eliminar erros de leitura.
- Não remover índices “unused” sem volume de produção e análise de plano.
- Não tentar fazer o Service Worker sincronizar a fila cifrada se ele não possui a chave; a restrição atual é uma decisão de segurança coerente.

## 7. Ordem prática de execução

### Sprint 1 — pré-produção

- Corrigir/revisar os 8 casos RLS sem policy.
- Revisar grants de todas as SECURITY DEFINER.
- Fixar search_path das funções críticas.
- Ativar proteção de senha vazada.
- Retirar arquivo cliente Supabase duplicado.
- Registrar um baseline de performance em três celulares reais e em desktop.

### Sprint 2 — ganho perceptível no celular

- Build Vite e code splitting por rota.
- Remover `select("*")` das telas de maior uso.
- Melhorar paginação e evitar contagens exatas frequentes.
- Lazy-load de mapa/PDF/relatórios/administração.
- Reduzir pré-cache do Service Worker.

### Sprint 3 — backend para escala

- Criar views/RPCs para dashboard, pendências e relatórios.
- Criar índices de foreign key após validar queries.
- Remover índices duplicados confirmados.
- Instrumentar sincronização e tempo de resposta.

### Sprint 4 em diante — migração gradual

- TypeScript + services/repositories.
- React por fluxo, começando pelos fluxos móveis de maior uso.
- Console administrativo separado por rota e bundle.
- Testes E2E e rollout gradual.

## 8. Veredito

**Tecnologia atual:** pode continuar em homologação e receber uma otimização de curto prazo.  
**Para produção imediata:** corrigir os itens P0 e fazer o pacote de performance P1.  
**Para os próximos meses:** migrar gradualmente para React + TypeScript, sem reescrever o backend nem o offline de uma vez.  
**Backend:** manter Supabase, mas criar uma camada de views/RPCs, revisar grants/RLS/SECURITY DEFINER e reduzir payloads.  
**Frontend:** mobile-first continua sendo PWA; o administrador recebe uma experiência desktop separada, carregada sob demanda.

Nenhum arquivo do repositório ou objeto do Supabase foi alterado durante esta auditoria.
