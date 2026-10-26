# PWA Guarda Municipal de Pitangueiras — homologação Fase 4

**Build local:** `v87-p4-governanca`
**Service Worker:** `v87`
**Supabase do app:** projeto principal `wswezvcxfljzcttpqkch`
**Edge Function administrativa:** `admin-governance` — versão remota 10, status ACTIVE
**Publicação:** esta build é para teste local; não foi publicada no GitHub Pages.

## Escopo desta build

Esta cópia reúne as melhorias das quatro fases de governança:

- Fase 1: correção de versão, resumo administrativo, filtro de contas excluídas, contadores, auditoria, mascaramento, paginação e proteção do último administrador.
- Fase 2: fila de retificações, comparação antes/depois, aprovação e rejeição com justificativa e métricas de sincronização.
- Fase 3: auditoria administrativa, filtros avançados, triagem de erros e ajustes responsivos da tela de governança.
- Fase 4: visão LGPD, políticas de retenção, prévia de expurgo sem exclusão automática, solicitações de exportação, registro de acesso a anexos e revisão periódica de permissões.

## Banco e funções

As migrations de governança aplicadas no projeto principal incluem as versões v84, v85, v87 e v88. A migration v87 cria índices auxiliares para a fila, auditoria e triagem de erros. A migration v88 cria a base aditiva de ciclo de vida LGPD; nenhum registro é excluído automaticamente.

A Edge Function `admin-governance` foi publicada nativamente no Supabase, sem wrappers ou carregamento dinâmico. O preflight CORS responde HTTP 200 e uma tentativa controlada com credenciais inválidas responde HTTP 401, sem `WORKER_ERROR`.

## Executar localmente

1. Baixe ou extraia o pacote da Fase 4 mantendo a estrutura de pastas.
2. Na raiz do projeto, execute `python3 -m http.server 8080`.
3. Acesse `http://localhost:8080/`. Não abra o `index.html` com `file://`.
4. Aguarde o Service Worker v87 assumir o controle e recarregue quando solicitado.
5. Para instalações antigas, conecte-se à internet, feche e reabra o app e aguarde a atualização do Service Worker. Preserve `localStorage`, IndexedDB e rascunhos.

## Roteiro de homologação

- Confirmar em DevTools/Network que `js/config.js` aponta somente para `https://wswezvcxfljzcttpqkch.supabase.co`.
- Acessar a tela de governança com uma conta administradora autorizada.
- Validar os contadores, paginação, mascaramento e consulta de usuários.
- Validar a fila de retificações, comparação antes/depois e decisões com justificativa.
- Validar auditoria, filtros, triagem de erros e estados de falha.
- Validar a seção LGPD em modo de prévia; não executar exclusão real durante a homologação.
- Confirmar que as decisões, exportações, acessos a anexos e revisões de permissões geram registros esperados.
- Não registrar ou enviar senhas, tokens, CPF completo ou dados pessoais em capturas e relatórios.

## Limites conhecidos

A homologação funcional ainda depende do teste com credenciais e dados reais pelo responsável. Os avisos de segurança e performance do Supabase devem ser tratados em uma etapa própria antes da produção, especialmente policies RLS das tabelas de governança, permissões de funções `SECURITY DEFINER`, `search_path` das funções e índices duplicados.

O GitHub Pages não foi alterado nesta build.
