# PWA Guarda Municipal de Pitangueiras — build v78

**Versão:** `1.0.0-v78`
**BUILD:** `v78-login-project-main-cache-recovery`
**Service Worker:** `v78`
**Supabase do app:** projeto principal `wswezvcxfljzcttpqkch`
**Publicação:** GitHub Pages `main`, `https://gmpitangueiras-tech.github.io/bomobile/`

## Correção do login

O login deve usar sempre `https://wswezvcxfljzcttpqkch.supabase.co/functions/v1/legacy-login`. O erro relatado apontava para `etwhrqkpwohkrvzcmewn`, projeto identificado como “homologacao”. A configuração-fonte v77 já apontava ao projeto principal; a causa provável foi um `config.js` antigo mantido no cache de assets do Service Worker (`guarda-assets-v3`), que permanecia com o mesmo nome entre builds.

No v78, o Service Worker recebe novos nomes de cache (`guarda-pitangueiras-v78` e `guarda-assets-v4`) e carrega `js/config.js` pela rede primeiro, validando que o conteúdo aponta ao projeto principal antes de armazená-lo. Em contingência offline, só aceita cache cujo conteúdo também corresponda ao ref principal; não reutiliza uma configuração de homologação. A `legacy-login` está ativa no Supabase principal. Esta correção não altera credenciais, usuários ou dados no banco.

## Executar localmente

1. Baixe ou extraia a cópia do projeto mantendo a estrutura de pastas.
2. Abra um terminal na raiz do projeto e execute `python3 -m http.server 8080`.
3. Acesse `http://localhost:8080/`. Não abra o `index.html` com `file://`: módulos ES, Service Worker e recursos do PWA exigem HTTP.
4. Aguarde o Service Worker v78 assumir o controle e recarregue o app quando solicitado.
5. Para instalações que já estavam abertas, conecte-se à internet, feche e reabra o app e aguarde a atualização do Service Worker. Não limpe `localStorage`, IndexedDB, rascunhos ou dados do usuário.

## Verificações da versão

- Confirmar em DevTools/Network que `js/config.js` retorna HTTP 200 e contém somente a URL `https://wswezvcxfljzcttpqkch.supabase.co`.
- Confirmar que a requisição de login vai para `wswezvcxfljzcttpqkch.supabase.co/functions/v1/legacy-login`, nunca para o projeto `etwhrqkpwohkrvzcmewn`.
- Testar o login com uma conta autorizada e senha correta. Não registrar nem enviar senha, token, CPF completo ou dados pessoais em capturas/relatórios.
- Se o login ao projeto principal ainda retornar 401, registrar apenas horário, status e corpo sanitizado da resposta; não repetir tentativas em sequência para evitar bloqueio de conta.
- A resposta 503 observada em `index.html` pode corresponder ao fallback offline do Service Worker; a causa do 503 anterior não foi confirmada. Testar com conexão estável e guardar URL, status e horário se persistir.

## Estado de segurança e escopo

RLS continua habilitada nas tabelas protegidas; o acesso de leitura operacional permanece conforme as policies do Supabase principal. A migration v82 concede `SELECT` de `usuarios.deleted_at` ao papel `authenticated`, necessário para filtrar o diretório de usuários, sem abrir acesso ao papel `anon`. `anexos` continua privado e `gm-avatars` público.

O projeto Supabase “homologacao” e o servidor oficial da Guarda não foram alterados nesta correção. Não houve limpeza de dados locais. A atualização do Service Worker remove caches antigos de assets, mas preserva IndexedDB, `localStorage` e rascunhos.

## Homologação funcional

A correção de roteamento/cache foi validada por inspeção do código publicado e sintaxe local. A validação final de login com credencial real depende de teste do responsável na instalação afetada após o Service Worker v78 assumir o controle. Não considerar o build aprovado funcionalmente antes desse teste.
