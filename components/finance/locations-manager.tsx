'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { AsyncButton } from '@/components/ui/async-button'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, MapPin, GripVertical } from 'lucide-react'

interface CashboxLocation {
  id: string
  name: string
  description: string | null
  sort_order: number
  is_active: boolean
}

export function LocationsManager() {
  const [locations, setLocations] = useState<CashboxLocation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingLocation, setEditingLocation] = useState<CashboxLocation | null>(null)
  const [saving, setSaving] = useState(false)
  
  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const supabase = createClient()

  useEffect(() => {
    loadLocations()
  }, [])

  const loadLocations = async () => {
    try {
      const { data, error } = await supabase
        .from('cashbox_locations')
        .select('*')
        .order('sort_order', { ascending: true })

      if (error) throw error
      setLocations(data || [])
    } catch {
      toast.error('Ошибка загрузки локаций')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Введите название локации')
      return
    }

    setSaving(true)
    try {
      if (editingLocation) {
        // Обновление
        const { error } = await supabase
          .from('cashbox_locations')
          .update({
            name: name.trim(),
            description: description.trim() || null,
          })
          .eq('id', editingLocation.id)

        if (error) throw error
        toast.success('Локация обновлена')
      } else {
        // Создание
        const maxOrder = locations.length > 0 
          ? Math.max(...locations.map(l => l.sort_order)) + 1 
          : 1

        const { error } = await supabase
          .from('cashbox_locations')
          .insert({
            name: name.trim(),
            description: description.trim() || null,
            sort_order: maxOrder,
            is_active: true,
          })

        if (error) throw error
        toast.success('Локация добавлена')
      }

      setDialogOpen(false)
      resetForm()
      loadLocations()
    } catch {
      toast.error('Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (location: CashboxLocation) => {
    if (!confirm(`Удалить локацию "${location.name}"?`)) return

    try {
      const { error } = await supabase
        .from('cashbox_locations')
        .delete()
        .eq('id', location.id)

      if (error) throw error
      toast.success('Локация удалена')
      loadLocations()
    } catch {
      toast.error('Ошибка удаления')
    }
  }

  const openEditDialog = (location: CashboxLocation) => {
    setEditingLocation(location)
    setName(location.name)
    setDescription(location.description || '')
    setDialogOpen(true)
  }

  const openCreateDialog = () => {
    setEditingLocation(null)
    resetForm()
    setDialogOpen(true)
  }

  const resetForm = () => {
    setName('')
    setDescription('')
    setEditingLocation(null)
  }

  if (isLoading) {
    return <div className="text-muted-foreground text-center py-4">Загрузка...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-foreground">Локации касс</h3>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-1" />
              Добавить
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">
                {editingLocation ? 'Редактировать локацию' : 'Новая локация'}
              </DialogTitle>
              <DialogDescription>
                Место, где может находиться касса (офис, у курьера и т.д.)
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Название *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Например: Офис, У шефа, У курьера"
                  className="bg-background border-border"
                />
              </div>
              <div className="space-y-2">
                <Label>Описание</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Дополнительная информация"
                  className="bg-background border-border"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Отмена
              </Button>
              <AsyncButton
                isLoading={saving}
                loadingText="Сохранение..."
                onClick={handleSave}
              >
                {editingLocation ? 'Сохранить' : 'Добавить'}
              </AsyncButton>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {locations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Локации не созданы</p>
          </div>
        ) : (
          locations.map((location) => (
            <div
              key={location.id}
              className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border group hover:bg-secondary/50 transition-colors cursor-pointer"
              onClick={() => openEditDialog(location)}
            >
              <div className="flex items-center gap-3">
                <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-50 cursor-grab" />
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="font-medium text-foreground">{location.name}</div>
                  {location.description && (
                    <div className="text-xs text-muted-foreground">{location.description}</div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => {
                    e.stopPropagation()
                    openEditDialog(location)
                  }}
                >
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-red-500/10"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(location)
                  }}
                >
                  <Trash2 className="h-4 w-4 text-red-400" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
