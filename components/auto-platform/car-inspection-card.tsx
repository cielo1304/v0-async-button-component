'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Loader2, ClipboardCheck, Plus, Trash2 } from 'lucide-react'

const CONDITIONS = [
  { value: 'EXCELLENT', label: 'Отлично', color: 'bg-emerald-500' },
  { value: 'GOOD', label: 'Хорошо', color: 'bg-blue-500' },
  { value: 'SATISFACTORY', label: 'Удовл.', color: 'bg-amber-500' },
  { value: 'BAD', label: 'Плохо', color: 'bg-red-500' },
]

interface Defect {
  id: string
  area: string
  description: string
  severity: 'MINOR' | 'MEDIUM' | 'MAJOR'
}

interface Inspection {
  id: string
  body_condition: string | null
  interior_condition: string | null
  technical_condition: string | null
  defects: Defect[]
  recommendations: string | null
  estimated_repair_cost: number | null
  inspected_at: string
}

interface CarInspectionCardProps {
  carId: string
}

export function CarInspectionCard({ carId }: CarInspectionCardProps) {
  const [inspection, setInspection] = useState<Inspection | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  const [bodyCondition, setBodyCondition] = useState('')
  const [interiorCondition, setInteriorCondition] = useState('')
  const [technicalCondition, setTechnicalCondition] = useState('')
  const [defects, setDefects] = useState<Defect[]>([])
  const [recommendations, setRecommendations] = useState('')
  const [repairCost, setRepairCost] = useState('')

  const supabase = createClient()

  useEffect(() => {
    loadInspection()
  }, [carId])

  async function loadInspection() {
    try {
      const { data, error } = await supabase
        .from('auto_inspections')
        .select('*')
        .eq('car_id', carId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (error && error.code !== 'PGRST116') throw error

      if (data) {
        setInspection(data)
        setBodyCondition(data.body_condition || '')
        setInteriorCondition(data.interior_condition || '')
        setTechnicalCondition(data.technical_condition || '')
        setDefects(data.defects || [])
        setRecommendations(data.recommendations || '')
        setRepairCost(data.estimated_repair_cost?.toString() || '')
      }
    } catch (error) {
      console.error('[v0] Error loading inspection:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const addDefect = () => {
    setDefects([
      ...defects,
      {
        id: crypto.randomUUID(),
        area: '',
        description: '',
        severity: 'MINOR',
      },
    ])
  }

  const removeDefect = (id: string) => {
    setDefects(defects.filter((d) => d.id !== id))
  }

  const updateDefect = (id: string, field: keyof Defect, value: string) => {
    setDefects(
      defects.map((d) => (d.id === id ? { ...d, [field]: value } : d))
    )
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const inspectionData = {
        car_id: carId,
        body_condition: bodyCondition || null,
        interior_condition: interiorCondition || null,
        technical_condition: technicalCondition || null,
        defects: defects.filter((d) => d.description),
        recommendations: recommendations || null,
        estimated_repair_cost: repairCost ? parseFloat(repairCost) : null,
        inspected_at: new Date().toISOString().split('T')[0],
      }

      if (inspection) {
        const { error } = await supabase
          .from('auto_inspections')
          .update(inspectionData)
          .eq('id', inspection.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('auto_inspections')
          .insert(inspectionData)
        if (error) throw error
      }

      toast.success('Оценка сохранена')
      setIsEditing(false)
      loadInspection()
    } catch (error) {
      console.error('[v0] Error saving inspection:', error)
      toast.error('Ошибка сохранения')
    } finally {
      setIsSaving(false)
    }
  }

  const getConditionBadge = (condition: string | null) => {
    const cond = CONDITIONS.find((c) => c.value === condition)
    if (!cond) return null
    return (
      <Badge className={`${cond.color} text-white`}>{cond.label}</Badge>
    )
  }

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-foreground">
          <ClipboardCheck className="h-5 w-5 text-blue-400" />
          Оценка состояния
        </CardTitle>
        {!isEditing ? (
          <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
            {inspection ? 'Редактировать' : 'Создать оценку'}
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
              Отмена
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Сохранить
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {isEditing ? (
          <>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Кузов</label>
                <Select value={bodyCondition} onValueChange={setBodyCondition}>
                  <SelectTrigger>
                    <SelectValue placeholder="Оценка" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Салон</label>
                <Select value={interiorCondition} onValueChange={setInteriorCondition}>
                  <SelectTrigger>
                    <SelectValue placeholder="Оценка" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Техника</label>
                <Select value={technicalCondition} onValueChange={setTechnicalCondition}>
                  <SelectTrigger>
                    <SelectValue placeholder="Оценка" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm text-muted-foreground">Дефекты</label>
                <Button type="button" variant="ghost" size="sm" onClick={addDefect}>
                  <Plus className="h-4 w-4 mr-1" /> Добавить
                </Button>
              </div>
              {defects.map((defect) => (
                <div key={defect.id} className="flex gap-2 items-start p-2 bg-secondary/30 rounded">
                  <input
                    type="text"
                    className="flex-1 bg-transparent border-b border-border text-sm px-1"
                    placeholder="Область"
                    value={defect.area}
                    onChange={(e) => updateDefect(defect.id, 'area', e.target.value)}
                  />
                  <input
                    type="text"
                    className="flex-2 bg-transparent border-b border-border text-sm px-1"
                    placeholder="Описание"
                    value={defect.description}
                    onChange={(e) => updateDefect(defect.id, 'description', e.target.value)}
                  />
                  <select
                    className="bg-secondary text-sm rounded px-2 py-1"
                    value={defect.severity}
                    onChange={(e) => updateDefect(defect.id, 'severity', e.target.value)}
                  >
                    <option value="MINOR">Незначит.</option>
                    <option value="MEDIUM">Средний</option>
                    <option value="MAJOR">Серьезный</option>
                  </select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => removeDefect(defect.id)}
                  >
                    <Trash2 className="h-4 w-4 text-red-400" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Рекомендации</label>
              <Textarea
                value={recommendations}
                onChange={(e) => setRecommendations(e.target.value)}
                placeholder="Рекомендации по ремонту и подготовке"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Ориент. стоимость ремонта (₽)</label>
              <input
                type="number"
                className="w-full bg-secondary/50 border border-border rounded px-3 py-2 text-sm"
                value={repairCost}
                onChange={(e) => setRepairCost(e.target.value)}
                placeholder="0"
              />
            </div>
          </>
        ) : inspection ? (
          <>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Кузов</p>
                {getConditionBadge(inspection.body_condition)}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Салон</p>
                {getConditionBadge(inspection.interior_condition)}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Техника</p>
                {getConditionBadge(inspection.technical_condition)}
              </div>
            </div>

            {inspection.defects && inspection.defects.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Дефекты ({inspection.defects.length})</p>
                <div className="space-y-1">
                  {inspection.defects.map((d: Defect) => (
                    <div key={d.id} className="text-sm flex items-center gap-2">
                      <Badge variant={d.severity === 'MAJOR' ? 'destructive' : 'secondary'} className="text-xs">
                        {d.severity === 'MAJOR' ? 'Серьезный' : d.severity === 'MEDIUM' ? 'Средний' : 'Незначит.'}
                      </Badge>
                      <span className="text-muted-foreground">{d.area}:</span>
                      <span>{d.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {inspection.recommendations && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Рекомендации</p>
                <p className="text-sm">{inspection.recommendations}</p>
              </div>
            )}

            {inspection.estimated_repair_cost && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Ориент. стоимость ремонта</p>
                <p className="text-lg font-mono font-bold text-amber-400">
                  {Number(inspection.estimated_repair_cost).toLocaleString()} ₽
                </p>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            Оценка не проведена
          </p>
        )}
      </CardContent>
    </Card>
  )
}
