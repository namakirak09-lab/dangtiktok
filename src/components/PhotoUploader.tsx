import { DndContext, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable'
import { ImagePlus } from 'lucide-react'
import { useRef } from 'react'
import type { UploadItem } from '../lib/types'
import { SortablePhoto } from './SortablePhoto'

export function PhotoUploader({ items, onChange }: { items: UploadItem[]; onChange: (items: UploadItem[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
  )

  function addFiles(files: FileList | null) {
    if (!files) return
    const next = [...items]
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      next.push({ id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file) })
      if (next.length >= 35) break
    }
    onChange(next)
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((x) => x.id === active.id)
    const newIndex = items.findIndex((x) => x.id === over.id)
    onChange(arrayMove(items, oldIndex, newIndex))
  }

  return (
    <div>
      <button type="button" className="dropzone" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files) }}>
        <div className="drop-icon"><ImagePlus size={24} /></div>
        <strong>Ném ảnh vào đây</strong>
        <span>Kéo thả hoặc bấm để chọn • tối đa 35 ảnh</span>
      </button>
      <input ref={inputRef} hidden type="file" accept="image/*" multiple onChange={(e) => addFiles(e.target.files)} />

      {items.length > 0 && (
        <>
          <div className="section-row compact-row">
            <div><strong>Thứ tự ảnh</strong><span>Kéo ảnh để sắp xếp đúng carousel</span></div>
            <span className="count-pill">{items.length}/35</span>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={items.map((x) => x.id)} strategy={rectSortingStrategy}>
              <div className="photo-grid">
                {items.map((item, index) => (
                  <SortablePhoto key={item.id} item={item} index={index} onRemove={() => onChange(items.filter((x) => x.id !== item.id))} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </>
      )}
    </div>
  )
}
