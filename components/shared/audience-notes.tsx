'use client'

import { useState } from 'react'
import { Users, Plus, Trash2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * client_audience_notes JSONB structure:
 * { "Салман": "Собственник, знает всё", "Виктор": "Водитель, только про авто" }
 *
 * This component renders + edits that map.
 */

interface AudienceNotesProps {
  notes: Record<string, string>
  onChange: (notes: Record<string, string>) => void
  onSave?: () => void
  /** Read-only mode */
  readOnly?: boolean
  /** Compact inline without card wrapper */
  inline?: boolean
}

export function AudienceNotes({ notes, onChange, onSave, readOnly, inline }: AudienceNotesProps) {
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')

  const entries = Object.entries(notes || {})

  const addEntry = () => {
    if (!newKey.trim()) return
    onChange({ ...notes, [newKey.trim()]: newValue.trim() })
    setNewKey('')
    setNewValue('')
  }

  const removeEntry = (key: string) => {
    const updated = { ...notes }
    delete updated[key]
    onChange(updated)
  }

  const updateValue = (key: string, value: string) => {
    onChange({ ...notes, [key]: value })
  }

  const content = (
    <div className="space-y-2">
      {entries.length === 0 && (
        <p className="text-xs text-muted-foreground py-1">
          Нет заметок о клиентской стороне
        </p>
      )}
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-center gap-2">
          <span className="text-sm font-medium min-w-[80px] shrink-0">{key}</span>
          <span className="text-muted-foreground text-xs">{'='}</span>
          {readOnly ? (
            <span className="text-sm text-muted-foreground">{value}</span>
          ) : (
            <>
              <Input
                value={value}
                onChange={e => updateValue(key, e.target.value)}
                className="h-7 text-sm flex-1"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive bg-transparent shrink-0"
                onClick={() => removeEntry(key)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      ))}
      {!readOnly && (
        <div className="flex items-center gap-2 pt-1">
          <Input
            placeholder="Имя..."
            value={newKey}
            onChange={e => setNewKey(e.target.value)}
            className="h-7 text-sm w-[120px]"
            onKeyDown={e => e.key === 'Enter' && addEntry()}
          />
          <Input
            placeholder="Роль / заметка..."
            value={newValue}
            onChange={e => setNewValue(e.target.value)}
            className="h-7 text-sm flex-1"
            onKeyDown={e => e.key === 'Enter' && addEntry()}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 bg-transparent shrink-0"
            onClick={addEntry}
            disabled={!newKey.trim()}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      {onSave && !readOnly && entries.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs bg-transparent"
          onClick={onSave}
        >
          <Save className="h-3 w-3 mr-1" />Сохранить заметки
        </Button>
      )}
    </div>
  )

  if (inline) return content

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          Кто со стороны клиента что знает
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {content}
      </CardContent>
    </Card>
  )
}
