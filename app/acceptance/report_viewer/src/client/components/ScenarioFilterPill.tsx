/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useEffect, useLayoutEffect, useRef, useState, useId } from 'react'
import { createPortal } from 'react-dom'

export type ScenarioFilterAction = 'add' | 'restart'

export function ScenarioFilterPill({ name, selected, hidden, onChoose }: {
  name: string
  selected: boolean
  hidden: boolean
  onChoose: (action: ScenarioFilterAction) => void
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const trigger = useRef<globalThis.HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const menuId = useId()

  const close = () => {
    setOpen(false)
    trigger.current?.focus({ preventScroll: true })
  }

  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return
    const placeMenu = () => {
      if (!trigger.current || !menu.current) return
      const anchor = trigger.current.getBoundingClientRect()
      const popup = menu.current.getBoundingClientRect()
      if (anchor.bottom < 0 || anchor.top > window.innerHeight) {
        setOpen(false)
        return
      }
      setPosition({
        left: Math.max(8, Math.min(anchor.left, window.innerWidth - popup.width - 8)),
        top: anchor.bottom + popup.height + 12 <= window.innerHeight
          ? anchor.bottom + 4
          : Math.max(8, anchor.top - popup.height - 4),
      })
    }
    placeMenu()
    menu.current.querySelector('button')?.focus({ preventScroll: true })
    window.addEventListener('resize', placeMenu)
    window.addEventListener('scroll', placeMenu, true)
    return () => {
      window.removeEventListener('resize', placeMenu)
      window.removeEventListener('scroll', placeMenu, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const outside = (event: MouseEvent) => {
      const target = event.target as globalThis.Node
      if (!trigger.current?.contains(target) && !menu.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => {
      document.removeEventListener('mousedown', outside)
    }
  }, [open])

  return <>
    <button
      ref={trigger}
      type="button"
      className="scenario-metadata-chip max-w-full break-words rounded-full px-2 py-0.5 text-left font-medium text-neutral-600 cursor-pointer"
      data-selected={selected}
      data-muted={hidden}
      title={selected ? 'Selected in the filters above' : hidden ? 'Hidden in the filters above' : undefined}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? menuId : undefined}
      onClick={() => setOpen(value => !value)}
    >
      {name}
    </button>
    {open && createPortal(
      <div
        ref={menu}
        id={menuId}
        role="menu"
        aria-label={`Filter by ${name}`}
        className="fixed z-50 w-40 rounded-md border border-neutral-200 bg-white p-1 shadow-lg"
        style={position}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.preventDefault()
            close()
          } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault()
            const items = Array.from(event.currentTarget.querySelectorAll('button'))
            const index = items.indexOf(document.activeElement as globalThis.HTMLButtonElement)
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
              : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
            items[next]?.focus()
          }
        }}
      >
        {([
          ['add', 'add to current'], ['restart', 'restart with this'], ['cancel', 'cancel'],
        ] as const).map(([action, label]) => (
          <button
            key={action}
            type="button"
            role="menuitem"
            className="block w-full rounded px-2 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-100 focus:bg-neutral-100 focus:outline-none"
            onClick={() => {
              close()
              if (action !== 'cancel') onChoose(action)
            }}
          >
            {label}
          </button>
        ))}
      </div>,
      document.body,
    )}
  </>
}
