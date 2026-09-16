import { memo } from 'react'
import type { Prompt, ViewMode } from '../types'
import { highlight, snippet } from '../lib/search'
import { useStore } from '../state/store'
import { Menu, useMenu } from './ui'
import {
  IconArchive,
  IconCopy,
  IconDuplicate,
  IconEdit,
  IconImage,
  IconMore,
  IconRestore,
  IconStar,
  IconTemplate,
  IconTrash,
} from './Icons'
import { hasPlaceholders } from '../lib/template'

function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  const segs = highlight(text, terms)
  return (
    <>
      {segs.map((s, i) => (s.hit ? <mark key={i}>{s.text}</mark> : <span key={i}>{s.text}</span>))}
    </>
  )
}

export interface CardProps {
  prompt: Prompt
  terms: string[]
  viewMode: ViewMode
  categoryName: string
  selectionMode: boolean
  selected: boolean
  onOpen: () => void
  onEdit: () => void
  onToggleSelect: () => void
  onUseTemplate: () => void
}

function PromptCardInner({
  prompt,
  terms,
  viewMode,
  categoryName,
  selectionMode,
  selected,
  onOpen,
  onEdit,
  onToggleSelect,
  onUseTemplate,
}: CardProps) {
  const store = useStore()
  const menu = useMenu()
  const isTemplate = hasPlaceholders(prompt.body)
  const preview = snippet(prompt.body, terms, viewMode === 'list' ? 110 : 200)

  const activate = () => (selectionMode ? onToggleSelect() : onOpen())

  const items = [
    { label: 'Bearbeiten', icon: <IconEdit size={17} />, onSelect: onEdit },
    ...(isTemplate
      ? [{ label: 'Vorlage verwenden', icon: <IconTemplate size={17} />, onSelect: onUseTemplate }]
      : []),
    {
      label: 'Duplizieren',
      icon: <IconDuplicate size={17} />,
      onSelect: async () => {
        const c = await store.duplicatePrompt(prompt.id)
        if (c) store.notify(`„${c.title}“ angelegt`, 'success')
      },
    },
    ...(prompt.negative
      ? [
          {
            label: 'Negativen Prompt kopieren',
            icon: <IconCopy size={17} />,
            onSelect: () => store.copyPrompt(prompt.id, prompt.negative, 'Negativer Prompt kopiert'),
          },
        ]
      : []),
    {
      label: 'Mehrfachauswahl starten',
      icon: <IconArchive size={17} />,
      separatorBefore: true,
      onSelect: onToggleSelect,
    },
    ...(prompt.status === 'active'
      ? [
          {
            label: 'Archivieren',
            icon: <IconArchive size={17} />,
            onSelect: async () => {
              await store.setStatus([prompt.id], 'archived')
              store.notify('Archiviert', 'success')
            },
          },
        ]
      : [
          {
            label: 'In die Bibliothek zurück',
            icon: <IconRestore size={17} />,
            onSelect: async () => {
              await store.setStatus([prompt.id], 'active')
              store.notify('Wieder in der Bibliothek', 'success')
            },
          },
        ]),
    ...(prompt.status === 'trashed'
      ? []
      : [
          {
            label: 'In den Papierkorb',
            icon: <IconTrash size={17} />,
            danger: true,
            onSelect: async () => {
              await store.setStatus([prompt.id], 'trashed')
              store.notify('In den Papierkorb verschoben', 'success')
            },
          },
        ]),
  ]

  const meta = (
    <div className="card-meta">
      {categoryName && <span className="badge">{categoryName}</span>}
      {prompt.tool && <span className="badge badge-accent">{prompt.tool}</span>}
      {isTemplate && <span className="badge">Vorlage</span>}
      {(prompt.imageIds ?? []).length > 0 && (
        <span
          className="badge"
          title={`${prompt.imageIds.length} ${prompt.imageIds.length === 1 ? 'Bild' : 'Bilder'} angehängt`}
        >
          <IconImage size={13} /> {prompt.imageIds.length}
        </span>
      )}
      {prompt.isExample && <span className="badge badge-example">Beispiel</span>}
      {prompt.tags.slice(0, viewMode === 'list' ? 2 : 3).map((t) => (
        <span className="badge chip-tag" key={t}>
          #{t}
        </span>
      ))}
      {prompt.tags.length > (viewMode === 'list' ? 2 : 3) && (
        <span className="badge chip-tag">+{prompt.tags.length - (viewMode === 'list' ? 2 : 3)}</span>
      )}
    </div>
  )

  const actions = (
    <>
      <button
        className="icon-btn"
        onClick={(e) => {
          e.stopPropagation()
          store.copyPrompt(prompt.id, prompt.body)
        }}
        aria-label={`Prompt „${prompt.title}“ kopieren`}
      >
        <IconCopy size={18} />
      </button>
      <button
        className={`icon-btn${prompt.favorite ? ' is-active' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          store.toggleFavorite(prompt.id)
        }}
        aria-pressed={prompt.favorite}
        aria-label={prompt.favorite ? 'Favorit entfernen' : 'Als Favorit markieren'}
      >
        <IconStar size={18} filled={prompt.favorite} />
      </button>
      <button
        className="icon-btn"
        onClick={(e) => {
          e.stopPropagation()
          onEdit()
        }}
        aria-label={`„${prompt.title}“ bearbeiten`}
      >
        <IconEdit size={18} />
      </button>
      <div className="spacer" />
      <button className="icon-btn" onClick={menu.open} aria-label="Weitere Aktionen">
        <IconMore size={18} />
      </button>
    </>
  )

  return (
    <>
      <article
        className={`card${selected ? ' is-selected' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={prompt.title || 'Ohne Titel'}
        onClick={activate}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            activate()
          }
        }}
      >
        {viewMode === 'cards' ? (
          <>
            <div className="card-top">
              {selectionMode && (
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={onToggleSelect}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Auswählen"
                  style={{ width: 20, height: 20, accentColor: 'var(--accent)' }}
                />
              )}
              <div className="card-title">
                <Highlighted text={prompt.title || 'Ohne Titel'} terms={terms} />
              </div>
              {prompt.favorite && (
                <IconStar size={17} filled style={{ color: 'var(--violet)', flex: 'none' }} />
              )}
            </div>
            <div className="card-preview">
              <Highlighted text={preview} terms={terms} />
            </div>
            {meta}
            <div className="card-actions">{actions}</div>
          </>
        ) : (
          <>
            {selectionMode && (
              <input
                type="checkbox"
                checked={selected}
                onChange={onToggleSelect}
                onClick={(e) => e.stopPropagation()}
                aria-label="Auswählen"
                style={{ width: 20, height: 20, accentColor: 'var(--accent)' }}
              />
            )}
            <div className="card-body">
              <div className="card-title" style={{ fontSize: 'var(--step-0)' }}>
                <Highlighted text={prompt.title || 'Ohne Titel'} terms={terms} />
              </div>
              <div className="card-preview">
                <Highlighted text={preview} terms={terms} />
              </div>
              {meta}
            </div>
            <div className="card-actions">{actions}</div>
          </>
        )}
      </article>
      {menu.anchor && <Menu items={items} anchor={menu.anchor} onClose={menu.close} />}
    </>
  )
}

export const PromptCard = memo(PromptCardInner)
