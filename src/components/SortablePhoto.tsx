import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, X } from 'lucide-react'
import type { UploadItem } from '../lib/types'

export function SortablePhoto({ item, index, onRemove }: { item: UploadItem; index: number; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  }
  return (
    <div ref={setNodeRef} style={style} className="photo-card">
      <img src={item.previewUrl} alt={`Ảnh ${index + 1}`} />
      <div className="photo-index">{index + 1}</div>
      <button className="photo-remove" onClick={onRemove} type="button" aria-label="Xóa ảnh"><X size={15} /></button>
      <button className="photo-grip" type="button" {...attributes} {...listeners} aria-label="Kéo để sắp xếp"><GripVertical size={18} /></button>
    </div>
  )
}
