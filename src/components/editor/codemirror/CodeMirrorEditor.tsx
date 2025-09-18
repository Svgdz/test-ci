import { acceptCompletion, autocompletion, closeBrackets } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { bracketMatching, foldGutter, indentOnInput, indentUnit } from '@codemirror/language'
import { searchKeymap } from '@codemirror/search'
import {
  Compartment,
  EditorSelection,
  EditorState,
  StateEffect,
  StateField,
  type Extension,
} from '@codemirror/state'
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  scrollPastEnd,
  showTooltip,
  tooltips,
  type Tooltip,
} from '@codemirror/view'

import { memo, useEffect, useRef, useState, type MutableRefObject } from 'react'
import { l } from '@/lib/clients/logger'
import { cn } from '@/lib/utils'
import { getLanguage, preloadCommonLanguages } from './editor_utils/languages'
import { getTheme, reconfigureTheme, type Theme } from './editor_utils/editor-theme'

const BinaryContent = () => (
  <div style={{ padding: '1rem', fontSize: '0.9rem', color: '#888' }}>
    Binary content preview not available
  </div>
)

const indentKeyBinding = { key: 'Tab', run: acceptCompletion }

export interface EditorDocument {
  value: string
  isBinary: boolean
  filePath: string
  scroll?: ScrollPosition
}

export interface EditorSettings {
  fontSize?: string
  gutterFontSize?: string
  tabSize?: number
}
type TextEditorDocument = EditorDocument & { value: string }

export interface ScrollPosition {
  top: number
  left: number
}

export interface EditorUpdate {
  selection: EditorSelection
  content: string
}

export type OnChangeCallback = (update: EditorUpdate) => void
export type OnScrollCallback = (position: ScrollPosition) => void
export type OnSaveCallback = () => void

interface Props {
  theme?: Theme
  id?: unknown
  doc?: EditorDocument
  editable?: boolean
  autoFocusOnDocumentChange?: boolean
  onChange?: OnChangeCallback
  onScroll?: OnScrollCallback
  onSave?: OnSaveCallback
  className?: string
  settings?: EditorSettings
}

type EditorStates = Map<string, EditorState>

// Helper function for read-only tooltips
function getReadOnlyTooltip(state: EditorState) {
  if (!state.readOnly) return []
  return state.selection.ranges
    .filter((r) => r.empty)
    .map((r) => ({
      pos: r.head,
      above: true,
      strictSide: true,
      arrow: true,
      create: () => {
        const divElement = document.createElement('div')
        divElement.className = 'cm-readonly-tooltip'
        divElement.textContent = 'Cannot edit file while AI response is being generated'
        return { dom: divElement }
      },
    }))
}

// Tooltip state for read-only mode
const readOnlyTooltipStateEffect = StateEffect.define<boolean>()
const editableTooltipField = StateField.define<readonly Tooltip[]>({
  create: () => [],
  update(_tooltips, transaction) {
    if (!transaction.state.readOnly) return []
    const effects = transaction.effects.filter(
      (effect) => effect.is(readOnlyTooltipStateEffect) && effect.value
    )
    if (effects.length > 0) {
      return getReadOnlyTooltip(transaction.state)
    }
    return []
  },
  provide: (field) => showTooltip.computeN([field], (state) => state.field(field)),
})

const editableStateEffect = StateEffect.define<boolean>()
const editableStateField = StateField.define<boolean>({
  create() {
    return true
  },
  update(value, transaction) {
    const effects = transaction.effects.filter((effect) => effect.is(editableStateEffect))
    if (effects.length > 0) {
      return effects[effects.length - 1].value
    }
    return value
  },
})

// Helper Functions
function newEditorState(
  content: string,
  theme: Theme,
  settings: EditorSettings | undefined,
  onScrollRef: MutableRefObject<OnScrollCallback | undefined>,
  onFileSaveRef: MutableRefObject<OnSaveCallback | undefined>,
  extensions: Extension[]
) {
  return EditorState.create({
    doc: content,
    extensions: [
      EditorView.domEventHandlers({
        scroll: (event, view) => {
          if (event.target !== view.scrollDOM) return
          onScrollRef.current?.({
            left: view.scrollDOM.scrollLeft,
            top: view.scrollDOM.scrollTop,
          })
        },
        keydown: (event, view) => {
          if (view.state.readOnly) {
            view.dispatch({ effects: [readOnlyTooltipStateEffect.of(event.key !== 'Escape')] })
            return true
          }
          return false
        },
      }),
      getTheme(theme, settings),
      history(),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        indentKeyBinding,
        {
          key: 'Mod-s',
          preventDefault: true,
          run: () => {
            onFileSaveRef.current?.()
            return true
          },
        },
      ]),
      indentUnit.of('\t'),
      autocompletion({ closeOnBlur: false }),
      tooltips({
        position: 'absolute',
        parent: document.body,
        tooltipSpace: (view) => {
          const rect = view.dom.getBoundingClientRect()
          return {
            top: rect.top - 50,
            left: rect.left,
            bottom: rect.bottom,
            right: rect.right + 10,
          }
        },
      }),
      closeBrackets(),
      lineNumbers(),
      scrollPastEnd(),
      dropCursor(),
      drawSelection(),
      bracketMatching(),
      EditorState.tabSize.of(settings?.tabSize ?? 2),
      indentOnInput(),
      editableTooltipField,
      editableStateField,
      EditorState.readOnly.from(editableStateField, (editable) => !editable),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      foldGutter({
        markerDOM: (open) => {
          const icon = document.createElement('div')
          icon.className = `fold-icon ${open ? 'i-ph-caret-down-bold' : 'i-ph-caret-right-bold'}`
          return icon
        },
      }),
      ...extensions,
    ],
  })
}

function setNoDocument(view: EditorView) {
  view.dispatch({
    selection: { anchor: 0 },
    changes: { from: 0, to: view.state.doc.length, insert: '' },
  })
  view.scrollDOM.scrollTo(0, 0)
}

async function setEditorDocument(
  view: EditorView,
  theme: Theme,
  editable: boolean,
  languageCompartment: Compartment,
  autoFocus: boolean,
  doc: TextEditorDocument
) {
  // Load language support immediately (cached, so it's fast)
  let languageSupport
  try {
    languageSupport = await getLanguage(doc.filePath)
  } catch (error) {
    console.error('Failed to load language support:', error)
  }

  // Update document content and language together to prevent flash
  const effects: StateEffect<unknown>[] = [editableStateEffect.of(editable && !doc.isBinary)]

  if (languageSupport) {
    effects.push(languageCompartment.reconfigure(languageSupport as Extension))
  }

  effects.push(reconfigureTheme(theme))

  // Apply content and language changes together
  if (doc.value !== view.state.doc.toString()) {
    view.dispatch({
      selection: { anchor: 0 },
      changes: { from: 0, to: view.state.doc.length, insert: doc.value },
      effects,
    })
  } else {
    view.dispatch({ effects })
  }

  // Handle scrolling and focus separately with debouncing to prevent measure loops
  requestAnimationFrame(() => {
    try {
      const currentLeft = view.scrollDOM.scrollLeft
      const currentTop = view.scrollDOM.scrollTop
      const newLeft = doc.scroll?.left ?? 0
      const newTop = doc.scroll?.top ?? 0
      const needsScrolling =
        Math.abs(currentLeft - newLeft) > 1 || Math.abs(currentTop - newTop) > 1

      if (autoFocus && editable && !needsScrolling) {
        view.focus()
      }

      if (needsScrolling) {
        // Use a more gentle scrolling approach to prevent measure loops
        const scrollOptions: ScrollToOptions = {
          left: newLeft,
          top: newTop,
          behavior: 'auto',
        }
        view.scrollDOM.scrollTo(scrollOptions)

        if (autoFocus && editable) {
          // Delay focus to avoid interfering with scroll measurement
          setTimeout(() => view.focus(), 50)
        }
      }
    } catch (error) {
      console.warn('CodeMirror scroll/focus error:', error)
    }
  })
}

export const CodeMirrorEditor = memo(
  ({
    id,
    doc,
    autoFocusOnDocumentChange = false,
    editable = true,
    onScroll,
    onChange,
    onSave,
    theme = 'dark',
    settings,
    className = '',
  }: Props) => {
    l.debug('CodeMirrorEditor render')

    const [languageCompartment] = useState(new Compartment())
    const containerRef = useRef<HTMLDivElement | null>(null)
    const viewRef = useRef<EditorView | undefined>(undefined)
    const themeRef = useRef<Theme>(undefined)
    const docRef = useRef<EditorDocument | undefined>(undefined)
    const editorStatesRef = useRef<EditorStates>(new Map<string, EditorState>())
    const onScrollRef = useRef(onScroll)
    const onChangeRef = useRef(onChange)
    const onSaveRef = useRef(onSave)

    // keep refs fresh
    useEffect(() => {
      onScrollRef.current = onScroll
      onChangeRef.current = onChange
      onSaveRef.current = onSave
      docRef.current = doc
      themeRef.current = theme
    })

    // Preload common languages on mount
    useEffect(() => {
      preloadCommonLanguages().catch((error) => {
        console.warn('Failed to preload some languages:', error)
      })
    }, [])

    // create editor instance
    useEffect(() => {
      const onUpdate = (update: EditorUpdate) => {
        onChangeRef.current?.(update)
      }

      const view = new EditorView({
        parent: containerRef.current!,
        dispatchTransactions(transactions) {
          const previousSelection = view.state.selection
          view.update(transactions)
          const newSelection = view.state.selection
          const selectionChanged =
            newSelection !== previousSelection && !newSelection.eq(previousSelection)

          if (docRef.current && (transactions.some((t) => t.docChanged) || selectionChanged)) {
            onUpdate({
              selection: view.state.selection,
              content: view.state.doc.toString(),
            })
            editorStatesRef.current?.set(docRef.current.filePath, view.state)
          }
        },
      })

      viewRef.current = view
      return () => {
        viewRef.current?.destroy()
        viewRef.current = undefined
      }
    }, [])

    // respond to theme changes
    useEffect(() => {
      if (!viewRef.current) return
      viewRef.current.dispatch({ effects: [reconfigureTheme(theme)] })
    }, [theme])

    // new editorStates map for new id
    useEffect(() => {
      editorStatesRef.current = new Map<string, EditorState>()
    }, [id])

    // load doc with optimized dependency checking
    useEffect(() => {
      const editorStates = editorStatesRef.current
      const view = viewRef.current
      const currentTheme = themeRef.current

      if (!editorStates || !view || !currentTheme) return

      if (!view) return // Safety check

      if (!doc) {
        const state = newEditorState('', currentTheme, settings, onScrollRef, onSaveRef, [
          languageCompartment.of([]),
        ])
        view.setState(state)
        setNoDocument(view)
        return
      }

      if (doc.isBinary) return

      let state = editorStates.get(doc.filePath)
      if (!state) {
        state = newEditorState(doc.value, currentTheme, settings, onScrollRef, onSaveRef, [
          languageCompartment.of([]),
        ])
        editorStates.set(doc.filePath, state)
      }

      // Only setState if it's actually different
      if (view.state !== state) {
        view.setState(state)
      }

      setEditorDocument(
        view,
        currentTheme,
        editable,
        languageCompartment,
        autoFocusOnDocumentChange,
        doc as TextEditorDocument
      ).catch((error) => {
        console.error('Failed to set editor document:', error)
      })
    }, [
      doc?.value,
      editable,
      doc?.filePath,
      autoFocusOnDocumentChange,
      languageCompartment,
      settings,
      doc,
    ])

    return (
      <div className={cn('h-full w-full', className)}>
        {doc?.isBinary && <BinaryContent />}
        <div className='h-full w-full' ref={containerRef} />
      </div>
    )
  }
)

CodeMirrorEditor.displayName = 'CodeMirrorEditor'
