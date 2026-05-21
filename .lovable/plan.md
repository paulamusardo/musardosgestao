## Problema

Ao clicar num card de projeto, a URL muda para `/projects/<id>` mas o Kanban não abre — a lista de projetos continua na tela.

**Causa raiz:** no roteamento por arquivos do TanStack Router, ter ao mesmo tempo `_authenticated.projects.tsx` e `_authenticated.projects.$projectId.tsx` transforma o primeiro em um **layout pai** do segundo. Para o filho aparecer, o pai precisa renderizar `<Outlet />` — e o componente `ProjectsList` não faz isso. Resultado: rota correta, tela errada.

## Correção

Separar a página de lista do layout, renomeando o arquivo da lista para um segmento `index`:

- Renomear `src/routes/_authenticated.projects.tsx` → `src/routes/_authenticated.projects.index.tsx` (mantendo o mesmo conteúdo: `component: ProjectsList`).

Assim:
- `/projects` → renderiza `ProjectsList` (rota index).
- `/projects/<id>` → renderiza o `KanbanBoard` diretamente, sem precisar de Outlet intermediário.

O `routeTree.gen.ts` é regenerado automaticamente pelo plugin do Vite, não precisa ser editado.

## Verificação

1. Abrir `/projects`, ver a lista.
2. Clicar num card → deve abrir o Kanban do projeto com as quatro colunas e o cabeçalho com nome/cliente.
3. Botão "voltar" (seta) no header do board retorna para `/projects`.
