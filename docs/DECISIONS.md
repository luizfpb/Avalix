# BodyTrack — DECISIONS.md
Cole este arquivo no início de chats novos sobre o projeto. Última atualização: Etapa 3.2 (auth + organização) concluída e validada em runtime.

## O que é
PWA de avaliação física e postural para profissionais (avaliadores, personais, nutricionistas, academias). V1 para beta com uma avaliadora real. Dev: Luiz, solo, Windows + VSCode + CMD. Sem loja de app, sem domínio próprio por ora.

## Stack (fechada)
- Front: Vite + React + TypeScript, Tailwind + shadcn/ui, Recharts, TanStack Query, react-hook-form + zod, react-router.
- Back: Supabase free tier (Auth com confirmação de e-mail + MFA TOTP, Postgres com RLS, Storage privado). Sem backend próprio, sem Python.
- Deploy: Cloudflare Pages (domínio *.pages.dev no beta).
- PDF client-side com @react-pdf/renderer; CSV com papaparse; testes com vitest.

## Decisões-chave
- Tudo modelado como organização (multi-tenant) desde a migration 0001; V1 opera solo, UI de equipe depois. Termo exibido configurável: aluno/cliente/paciente/atleta/avaliado.
- Camadas: RLS = visibilidade; triggers = integridade (org herdada do pai, paths canônicos, relações congeladas, avaliador legítimo); constraints = domínio. org_id denormalizado nas filhas, copiado por trigger b1 e congelado depois. Triggers before insert disparam em ordem alfabética, daí os prefixos b1/b2 nos nomes.
- Visibilidade central em `app.can_view_subject`: owner/admin veem tudo; avaliador comum vê os seus, ou todos se `evaluators_see_all`. Filhas herdam via `can_view_*_id`.
- Consentimento é pré-condição de banco, não de UI: `app.has_active_consent*` no with check de INSERT de assessments, leituras, posture_sessions, posture_photos e posture_annotations. Revogação (`revoked_at`) bloqueia coleta nova; select e correção de dado antigo continuam; apagar é só pela exclusão definitiva. Registro de consentimento imutável exceto revoked_at.
- `evaluator_id` not null com default auth.uid() em subjects, assessments e posture_sessions; trigger `check_evaluator`: atribuído precisa ser membro da org; owner/admin atribuem a qualquer membro, avaliador comum só a si; valida no insert e só quando o campo muda no update. subjects usa on delete restrict: excluir conta exige excluir a org (ou reatribuir) antes.
- Fotos: cliente nunca manda path. Insert em posture_photos dispara trigger que gera `{org}/{subject}/{session}/{photo_id}.{ext}` e `_thumb` (ext por `format`: webp/jpeg) e devolve no select da inserção. Fluxo: linha primeiro, upload depois exatamente nesses paths; falhou o upload, apaga a linha. Storage de fotos não valida por pasta: a policy resolve o name para a linha de posture_photos (paths únicos/indexados) e aplica can_view_photo_id; upload exige também consentimento vigente. Path não registrado = negado. Buckets privados, URL assinada TTL 300 s, mime types e tamanho limitados no bucket.
- Protocolos são código TS (registry tipado + função pura + testes com vetores publicados), não tabelas. Resultados em snapshot jsonb em assessments.results com engine_version. V1: JP7, JP3, JP-Ward (mulheres), Durnin & Womersley, US Navy; conversões Siri e Brozek. Petroski/Guedes/Faulkner/Sloan fora até verificação. Nenhuma fórmula sem teste batendo com exemplo publicado.
- Dobras em mm, 1 a 3 aferições por ponto com média; circunferências em cm com extras e customizadas; sexo M/F (exigência das equações).
- Postural V1: captura/upload, categorias, compressão client-side (canvas ~1600 px, webp com fallback jpeg, remove EXIF/GPS), thumbs 320 px, comparação lado a lado/grade/overlay por opacidade. Anotações: v1.1, tabela já existe.
- PDFs não armazenados (regenerados do snapshot). CSV default internacional + opção Excel BR, UTF-8 com BOM. Resumo IA identificado/anônimo. Exportações logadas em audit_logs (EXPORT_CSV/EXPORT_JSON/PDF_REPORT/AI_SUMMARY).
- LGPD: dados sensíveis (art. 11); consentimento eletrônico no app (texto versionado + hash, nome digitado, titular ou responsável p/ menor de 18); exclusão definitiva remove arquivos do storage ANTES do banco (a policy resolve o objeto pela linha). Profissional = controlador, BodyTrack = operador.
- Auditoria mínima (sem payload). Custo: free tier; com 50 clientes, fotos migram para R2 via costura única em lib/storage.ts (a regra de visibilidade por foto será reimplementada no Worker), total projetado R$0-10/mês. Supabase Pro fora de cogitação.
- Operação: GitHub Actions com keep-alive (a cada 3 dias) e backup semanal pg_dump criptografado (gpg) como artifact; restore testado antes do beta.

## Convenções
- Tabelas/colunas/código em inglês; UI em pt-BR. Comentários escassos, em pt-BR, explicando porquês. Commits curtos em pt-BR, sem emoji.
- Migrations numeradas em supabase/migrations/. Testes colocalizados (x.test.ts ao lado de x.ts). Features em src/features/, infra em src/lib/.
- Fluxo no chat: colar erro (não arquivo inteiro), pedir diff para mudanças pequenas, "ok" quando comando funcionar, agrupar dúvidas.

## Estado atual
Etapa 3.2 entregue e validada em runtime: auth Supabase (cadastro/login/logout/recuperação), AuthProvider com onAuthStateChange, OrganizationProvider via TanStack Query lendo org_members, roteamento centralizado (resolveRedirect + RouteGuard), onboarding criando org via RPC create_organization(p_name) e gravando subject_term por update, dashboard e páginas placeholder. Correção de boot: o cliente lia VITE_SUPABASE_ANON_KEY (inexistente) e quebrava; passou a usar VITE_SUPABASE_PUBLISHABLE_KEY, a convenção do projeto (o bug afetava também produção no Cloudflare). Senha mínima 6 (padrão Supabase) adotada como canônica. Tabela de membros é org_members; database.types.ts em src/lib/. Formulários de auth em estado nativo. MFA adiada. Entregue na sequência: Avaliados + Consentimento (CRUD de subjects com subject_term na UI, react-hook-form + zod, responsável obrigatório p/ menor de 18; consentimento eletrônico versionado com hash sha256 e revogação) e Avaliação física (motor de protocolos puro e testado em src/features/assessment/protocols — JP7, JP3, JP-Ward, Durnin-Womersley, US Navy + Siri/Brozek; registry tipado, ENGINE_VERSION, filtro por sexo; formulário com cálculo ao vivo gravando snapshot reproduzível em assessments.results + leituras). Avaliação postural (core): sessões + captura/upload de fotos com compressão client-side (canvas 1600px, webp com fallback jpeg, remove EXIF/GPS e corrige orientação), thumbs 320px, fluxo do DECISIONS (insere a linha, trigger gera os paths, sobe os arquivos, desfaz se falhar), exibição em grade com URLs assinadas (TTL 300s) e exclusão definitiva (arquivo antes da linha).

## Próximo passo
Comparação postural: ver fotos de sessões lado a lado, em grade e overlay por opacidade (o resto do postural — sessões, captura/upload com compressão, exclusão — já está pronto). Depois: relatórios (PDF do snapshot, CSV) e MFA TOTP antes do beta. Pendência: texto de consentimento ainda em rascunho (0.1-rascunho), precisa de revisão jurídica antes do beta.