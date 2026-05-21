## Objetivo

Refinar o Kanban com controle de acesso por projeto, edição de projetos/tarefas, colunas customizáveis, responsáveis múltiplos e medição automática de tempo.

## Banco de dados (migration)

Novas tabelas:

- `project_members` — `project_id`, `user_id`, `role` ('owner' | 'member'), `created_at`. Unique (project_id, user_id).
- `project_columns` — `id`, `project_id`, `key` (slug), `label`, `position`, `color`. Substitui o enum fixo.
- `task_assignees` — `task_id`, `user_id`. Unique (task_id, user_id).
- `task_time_entries` — `id`, `task_id`, `started_at`, `ended_at` (nullable). Cada vez que a tarefa entra em "Em Andamento" abre uma entrada; ao sair, fecha. Soma de `ended_at - started_at` = tempo total.

Mudanças nas existentes:

- `tasks.status` (enum) → `tasks.column_id` (uuid → project_columns). Mantemos um campo `status_legacy` durante migração e populamos colunas padrão (A Fazer, Em Andamento, Revisão, Concluído) para cada projeto existente, mapeando as tarefas.
- `tasks.total_seconds` (int, default 0) — cache do tempo somado, atualizado por trigger ao fechar uma entrada.

Função/trigger:

- `is_project_member(_project_id, _user_id)` SECURITY DEFINER para usar nas RLS sem recursão.
- Trigger em `tasks` (AFTER UPDATE de column_id): se nova coluna é "em andamento" abre `task_time_entries`; se sai de "em andamento" fecha a aberta e soma em `total_seconds`. A coluna "em andamento" é identificada por uma flag `is_in_progress boolean` em `project_columns` (uma por projeto, default na coluna padrão criada).

RLS (resumo em linguagem simples):

- Projetos: visíveis apenas para o dono e membros convidados. Só o dono edita dados do projeto e gerencia membros/colunas. Membros editam tarefas.
- Tarefas/comentários/colunas/assignees/time_entries: acessíveis apenas a membros do projeto correspondente (via `is_project_member`).

## Frontend

**Lista de projetos (`ProjectsList`)**
- Botão "Editar" no card → dialog com nome, cliente, cor.
- Mostra apenas projetos onde o usuário é dono ou membro (já garantido pela RLS).

**Tela do projeto (`KanbanBoard`)**
- Header ganha botões: "Membros" (dialog para convidar por e-mail, listar/remover, só visível ao dono) e "Configurar colunas".
- "Configurar colunas": dialog para criar/renomear/reordenar/excluir colunas e escolher cor e qual é a coluna "em andamento".
- Colunas renderizadas a partir de `project_columns` (não mais da constante COLUMNS).

**Dialog da tarefa (`TaskDialog`)**
- Novo bloco "Responsáveis": multi-select com membros do projeto, salva em `task_assignees`.
- Novo bloco "Tempo gasto": mostra `total_seconds` formatado (HH:MM:SS) + indicador "rodando" quando há entrada aberta. Atualiza via realtime.
- Seletor de coluna passa a usar `project_columns` do projeto.

**Card da tarefa (`TaskCard`)**
- Avatares dos responsáveis (até 3 + "+N").
- Badge com tempo total quando > 0; ícone pulsando quando cronômetro está rodando.

## Detalhes técnicos

- Convite de membro: busca em `profiles` pelo email; se existir, insere em `project_members`. Se não existir, mostra erro pedindo que a pessoa se cadastre primeiro (sem fluxo de convite por email nesta etapa).
- Migração de dados: para cada projeto existente, criar as 4 colunas padrão e fazer UPDATE em tasks mapeando status→column_id. Inserir o `created_by` de cada projeto em `project_members` como 'owner'.
- Tempo: o cálculo "ao vivo" no frontend soma `total_seconds + (now - entrada_aberta.started_at)` quando há entrada aberta, atualizado a cada segundo via `setInterval`.
- Realtime já ativo em tarefas/comentários; adicionar `project_members`, `project_columns`, `task_assignees`, `task_time_entries` à publicação.

## Verificação

1. Criar projeto, convidar segundo usuário por email → ele vê o projeto na lista.
2. Editar nome/cor/cliente do projeto → reflete na lista.
3. Adicionar nova coluna "Bloqueado" e reordenar → tarefas continuam nas colunas certas.
4. Atribuir 2 responsáveis a uma tarefa → avatares aparecem no card.
5. Mover tarefa para "Em Andamento", aguardar, mover para "Revisão" → tempo registrado; mover de volta e novamente → soma acumula.
6. Usuário não-membro não consegue listar nem abrir o projeto (RLS).
