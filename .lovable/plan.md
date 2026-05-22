## Identidade visual Musardos

Inspirada em musardos.com: azul vibrante (#1E88E5 / `oklch(0.62 0.18 250)`), branco, cantos suaves, marca "M" em quadrado azul. Vou atualizar `src/styles.css`:

- `--primary` → azul Musardos; `--accent` → azul claro
- Tipografia: Inter (corpo) + um display sóbrio (Manrope) — coerente com o tom corporativo limpo do site
- Logo: quadrado azul com "M" branca, igual ao do site, usada na sidebar e no login

## Banco de dados (migration)

1. **Bucket `task-attachments`** (privado) + tabela `task_attachments`:
   - `id`, `task_id`, `comment_id` (nullable, FK lógica), `uploader_id`, `path`, `name`, `mime`, `size`, `created_at`
   - RLS: SELECT/INSERT/DELETE só para membros do projeto da tarefa (via `is_project_member`)
   - Policies de storage no bucket: leitura/escrita só para membros do projeto correspondente (path = `{project_id}/{task_id}/{uuid}-{name}`)

2. **Mapeamento de colunas entre projetos** (para "mover no kanban pessoal reflete no projeto"):
   - Adicionar `kind` em `project_columns` (`'todo' | 'in_progress' | 'review' | 'done' | 'custom'`), default `'custom'`
   - Trigger de seed atualiza as 4 padrão com o `kind` correto
   - Quando o usuário arrasta no kanban pessoal entre as 4 colunas fixas, o backend procura a coluna do projeto da tarefa com o mesmo `kind` (fallback: primeira por position)

3. Realtime: adicionar `task_attachments` à publicação.

## Frontend

### Layout com sidebar (`src/routes/_authenticated.tsx`)

Substituir o `<Outlet/>` por `SidebarProvider` + `AppSidebar` + área principal com `SidebarTrigger` no header. Sidebar (collapsible="icon"):

- **Meu Kanban** → `/me`
- **Calendário** → `/calendar`
- **Projetos** (grupo expansível, lista projetos do usuário via query) → cada item vai para `/projects/$id`
- **Perfil** → `/profile`
- Rodapé: avatar + email + sair

### Novas rotas

- `src/routes/_authenticated.me.tsx` — Kanban pessoal. 4 colunas fixas (A Fazer / Em Andamento / Revisão / Concluído). Lista tarefas onde `auth.uid()` está em `task_assignees`. Drag-and-drop reusa lógica do `KanbanBoard` mas resolve `column_id` no projeto destino via `kind`. Badge no card mostra o projeto (cor + nome).
- `src/routes/_authenticated.calendar.tsx` — Calendário mensal (componente próprio, sem libs novas; grade 7×N). Toggle "Minhas / Todos os projetos". Cada célula mostra pílulas coloridas por projeto, clicáveis para abrir o `TaskDialog`. Navegação ‹ mês › ano.
- `src/routes/_authenticated.profile.tsx` — Editar `display_name` em `profiles`, trocar avatar (bucket `avatars` público), trocar senha via `supabase.auth.updateUser`.
- `src/routes/_authenticated.index.tsx` — redirect para `/me`.

Atualizar `src/routes/index.tsx` para redirect → `/me` quando logado.

### Anexos em descrição/comentário

Novo componente `AttachmentList` + `AttachmentUploader`:
- Upload via `supabase.storage.from('task-attachments').upload(...)`
- Lista miniaturas para imagens, ícone + nome para outros, player nativo para vídeo, link para PDF/doc
- URL via `createSignedUrl(path, 3600)` (bucket privado)
- Integrado em:
  - `TaskDialog` — bloco "Anexos" abaixo da descrição
  - `CommentItem` / form de novo comentário — botão clipe que adiciona o arquivo ao comentário ao postar

### Atualização de componentes existentes

- `KanbanBoard.tsx` — header recebe título do projeto + breadcrumb e o botão "Voltar" agora navega via sidebar (manter consistência)
- `TaskCard.tsx` — indicador de anexos (clipe + contagem)
- `ProjectsList.tsx` — passa a ser usado dentro de `/projects` (rota índice) e também alimenta o menu lateral

## Detalhes técnicos

- Calendário sem nova dependência: gerar a grade com `date-fns` (já no projeto se houver, senão adicionar) — confirmar e instalar `date-fns` se necessário
- Avatar: bucket público `avatars`, path `{user_id}/avatar.{ext}`, policies padrão (leitura pública, escrita só do dono)
- Para "mover no pessoal reflete no projeto": função RPC `move_task_to_kind(task_id, kind)` que faz o lookup e UPDATE da `column_id` correta — evita lógica duplicada no client
- Realtime mantém o kanban pessoal e o calendário em sincronia ao alterar tarefas/assignees

## Verificação

1. Sidebar abre/colapsa; itens ativos destacam corretamente
2. `/me` lista só tarefas em que sou assignee, agrupadas nas 4 colunas
3. Arrastar uma tarefa minha de "Em Andamento" para "Revisão" reflete no Kanban do projeto e dispara o cálculo de tempo
4. Calendário mostra tarefas pela `due_date` no dia certo; toggle alterna escopo
5. Upload de imagem na descrição da tarefa aparece para outro membro do projeto; usuário não-membro recebe 403 ao tentar URL assinada
6. Perfil: trocar nome e avatar reflete em todos os lugares (cards, sidebar, comentários)
7. Cores/logo Musardos aparecem em login, sidebar, botões primários
