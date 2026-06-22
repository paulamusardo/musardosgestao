import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Bold, Italic, List, ListOrdered, ListChecks, Strikethrough, SquareArrowOutUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect } from "react";

type Props = {
  value: string;
  onChange: (html: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  minHeight?: number;
  onConvertChecklistItem?: (text: string) => Promise<boolean> | boolean;
};

function ToolbarBtn({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={cn(
        "h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition",
        active && "bg-accent text-foreground"
      )}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({ value, onChange, onBlur, placeholder, minHeight = 96, onConvertChecklistItem }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({}),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class: "rte-content focus:outline-none px-3 py-2 text-sm",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    onBlur: () => onBlur?.(),
  });

  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  if (!editor) return null;

  const convertCurrentTaskItem = async () => {
    if (!onConvertChecklistItem) return;
    const { state } = editor;
    const { $from } = state.selection;
    let depth = $from.depth;
    let itemPos = -1;
    let itemNode: { textContent: string; nodeSize: number } | null = null;
    while (depth > 0) {
      const node = $from.node(depth);
      if (node.type.name === "taskItem") {
        itemPos = $from.before(depth);
        itemNode = node;
        break;
      }
      depth--;
    }
    if (!itemNode || itemPos < 0) return;
    const text = itemNode.textContent.trim();
    if (!text) return;
    const ok = await onConvertChecklistItem(text);
    if (ok) {
      editor.chain().focus().deleteRange({ from: itemPos, to: itemPos + itemNode.nodeSize }).run();
    }
  };

  const inTaskItem = editor.isActive("taskItem");

  return (
    <div className="rounded-md border bg-background focus-within:ring-1 focus-within:ring-ring">
      <Toolbar editor={editor} />
      {onConvertChecklistItem && inTaskItem && (
        <div className="px-2 py-1 border-b bg-muted/40 flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">Item da checklist selecionado</span>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={convertCurrentTaskItem}
            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border bg-background hover:bg-accent text-foreground"
            title="Transformar este item em um novo card"
          >
            <SquareArrowOutUpRight className="h-3 w-3" />
            Transformar em card
          </button>
        </div>
      )}
      <div style={{ minHeight }} className="text-sm" data-placeholder={placeholder}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex items-center gap-0.5 px-1.5 py-1 border-b">
      <ToolbarBtn
        title="Negrito"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        title="Itálico"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        title="Tachado"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <span className="w-px h-4 bg-border mx-1" />
      <ToolbarBtn
        title="Lista"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        title="Lista numerada"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        title="Checklist"
        active={editor.isActive("taskList")}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      >
        <ListChecks className="h-3.5 w-3.5" />
      </ToolbarBtn>
    </div>
  );
}

export function RichTextView({ html, className }: { html: string; className?: string }) {
  if (!html || !html.trim()) return null;
  return (
    <div
      className={cn("rte-content text-sm", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  if (typeof document === "undefined") return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || div.innerText || "").trim();
}
