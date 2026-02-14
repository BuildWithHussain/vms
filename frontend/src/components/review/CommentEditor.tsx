import { useEffect, useImperativeHandle, forwardRef, useState, useCallback, useRef } from "react"
import { useEditor, EditorContent, ReactRenderer } from "@tiptap/react"
import { StarterKit } from "@tiptap/starter-kit"
import { Placeholder } from "@tiptap/extensions"
import { Mention } from "@tiptap/extension-mention"
import type { SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion"
import tippy, { type Instance as TippyInstance } from "tippy.js"
import { useFrappeGetCall } from "frappe-react-sdk"

interface MentionUser {
  name: string
  full_name: string
  user_image?: string | null
}

export interface CommentEditorHandle {
  getHTML: () => string
  getText: () => string
  clearContent: () => void
  focus: () => void
  isEmpty: () => boolean
}

interface CommentEditorProps {
  placeholder?: string
  onSubmit?: () => void
  isGuest?: boolean
  className?: string
}

// --- Mention suggestion list component ---
interface MentionListProps extends SuggestionProps<MentionUser> {}

const MentionList = forwardRef<{ onKeyDown: (props: SuggestionKeyDownProps) => boolean }, MentionListProps>(
  (props, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0)

    const selectItem = useCallback(
      (index: number) => {
        const item = props.items[index]
        if (item) {
          props.command({ id: item.name, label: item.full_name })
        }
      },
      [props],
    )

    useEffect(() => {
      setSelectedIndex(0)
    }, [props.items])

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: SuggestionKeyDownProps) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : props.items.length - 1))
          return true
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((prev) => (prev < props.items.length - 1 ? prev + 1 : 0))
          return true
        }
        if (event.key === "Enter") {
          selectItem(selectedIndex)
          return true
        }
        return false
      },
    }))

    if (props.items.length === 0) {
      return (
        <div className="rounded-md border bg-popover p-2 text-xs text-muted-foreground shadow-md">
          No users found
        </div>
      )
    }

    return (
      <div className="rounded-md border bg-popover shadow-md overflow-hidden">
        {props.items.map((item, index) => (
          <button
            key={item.name}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent ${
              index === selectedIndex ? "bg-accent" : ""
            }`}
            onClick={() => selectItem(index)}
          >
            {item.user_image ? (
              <img
                src={item.user_image}
                alt={item.full_name}
                className="size-5 rounded-full object-cover"
              />
            ) : (
              <div className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
                {item.full_name?.[0]?.toUpperCase() ?? "?"}
              </div>
            )}
            <span>{item.full_name}</span>
          </button>
        ))}
      </div>
    )
  },
)
MentionList.displayName = "MentionList"

// --- Main CommentEditor ---
export const CommentEditor = forwardRef<CommentEditorHandle, CommentEditorProps>(
  ({ placeholder = "Add a comment...", onSubmit, isGuest = false, className }, ref) => {
    // Fetch mentionable users (only for authenticated users)
    const { data: usersData } = useFrappeGetCall<{ message: MentionUser[] }>(
      "vms.review_api.get_mentionable_users",
      !isGuest ? {} : undefined,
      !isGuest ? "mentionable-users" : undefined,
    )
    const mentionUsers = usersData?.message ?? []

    // Keep a ref to mentionUsers so the suggestion plugin always has latest
    const mentionUsersRef = useRef<MentionUser[]>(mentionUsers)
    useEffect(() => {
      mentionUsersRef.current = mentionUsers
    }, [mentionUsers])

    const editor = useEditor({
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({
          heading: false,
          blockquote: false,
          bulletList: false,
          orderedList: false,
          codeBlock: false,
          horizontalRule: false,
          hardBreak: {
            keepMarks: true,
          },
        }),
        Placeholder.configure({
          placeholder,
        }),
        // Only add mention extension for non-guests
        ...(!isGuest
          ? [
              Mention.configure({
                HTMLAttributes: {
                  class: "mention",
                },
                suggestion: {
                  char: "@",
                  items: ({ query }) => {
                    return mentionUsersRef.current
                      .filter((user) =>
                        user.full_name.toLowerCase().includes(query.toLowerCase()),
                      )
                      .slice(0, 8)
                  },
                  render: () => {
                    let component: ReactRenderer<
                      { onKeyDown: (props: SuggestionKeyDownProps) => boolean },
                      MentionListProps
                    >
                    let popup: TippyInstance[]

                    return {
                      onStart: (props: SuggestionProps<MentionUser>) => {
                        component = new ReactRenderer(MentionList, {
                          props,
                          editor: props.editor,
                        })

                        if (!props.clientRect) return

                        popup = tippy("body", {
                          getReferenceClientRect: props.clientRect as () => DOMRect,
                          appendTo: () => document.body,
                          content: component.element,
                          showOnCreate: true,
                          interactive: true,
                          trigger: "manual",
                          placement: "bottom-start",
                        })
                      },
                      onUpdate(props: SuggestionProps<MentionUser>) {
                        component?.updateProps(props)
                        if (props.clientRect) {
                          popup?.[0]?.setProps({
                            getReferenceClientRect: props.clientRect as () => DOMRect,
                          })
                        }
                      },
                      onKeyDown(props: SuggestionKeyDownProps) {
                        if (props.event.key === "Escape") {
                          popup?.[0]?.hide()
                          return true
                        }
                        return component?.ref?.onKeyDown(props) ?? false
                      },
                      onExit() {
                        popup?.[0]?.destroy()
                        component?.destroy()
                      },
                    }
                  },
                },
              }),
            ]
          : []),
      ],
      editorProps: {
        attributes: {
          class: "focus:outline-none text-sm",
        },
        handleKeyDown: (_view, event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            onSubmit?.()
            return true
          }
          return false
        },
      },
    })

    useImperativeHandle(ref, () => ({
      getHTML: () => editor?.getHTML() ?? "",
      getText: () => editor?.getText() ?? "",
      clearContent: () => editor?.commands.clearContent(),
      focus: () => editor?.commands.focus(),
      isEmpty: () => editor?.isEmpty ?? true,
    }))

    if (!editor) return null

    return (
      <div className={className}>
        <EditorContent
          editor={editor}
          className="comment-editor max-h-24 overflow-y-auto rounded-md border bg-background px-3 py-2 [&_.ProseMirror]:min-h-[2rem] [&_.ProseMirror]:outline-none [&_.is-editor-empty:first-child::before]:text-muted-foreground [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:pointer-events-none [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.mention]:rounded [&_.mention]:bg-primary/10 [&_.mention]:px-1 [&_.mention]:py-0.5 [&_.mention]:font-medium [&_.mention]:text-primary"
        />
      </div>
    )
  },
)
CommentEditor.displayName = "CommentEditor"
