'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Loader2, MessageSquare, Send } from 'lucide-react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

const MESSAGE_TYPES = [
  { value: 'COMMENT', label: 'Комментарий', color: 'bg-blue-500' },
  { value: 'DEFECT', label: 'Дефект', color: 'bg-red-500' },
  { value: 'QUESTION', label: 'Вопрос', color: 'bg-amber-500' },
  { value: 'UPDATE', label: 'Обновление', color: 'bg-emerald-500' },
  { value: 'REMINDER', label: 'Напоминание', color: 'bg-violet-500' },
]

interface Message {
  id: string
  message_type: string
  content: string
  tagged_defect: string | null
  created_at: string
}

interface CarChatMessagesProps {
  carId: string
}

export function CarChatMessages({ carId }: CarChatMessagesProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [newMessage, setNewMessage] = useState('')
  const [messageType, setMessageType] = useState('COMMENT')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const supabase = createClient()

  useEffect(() => {
    loadMessages()
  }, [carId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadMessages() {
    try {
      const { data, error } = await supabase
        .from('auto_chat_messages')
        .select('*')
        .eq('car_id', carId)
        .order('created_at', { ascending: true })

      if (error) throw error
      setMessages(data || [])
    } catch (error) {
      console.error('[v0] Error loading messages:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSend = async () => {
    if (!newMessage.trim()) return

    setIsSending(true)
    try {
      const { error } = await supabase.from('auto_chat_messages').insert({
        car_id: carId,
        message_type: messageType,
        content: newMessage.trim(),
      })

      if (error) throw error

      setNewMessage('')
      loadMessages()
    } catch (error) {
      console.error('[v0] Error sending message:', error)
      toast.error('Ошибка отправки')
    } finally {
      setIsSending(false)
    }
  }

  const getTypeInfo = (type: string) => {
    return MESSAGE_TYPES.find((t) => t.value === type) || MESSAGE_TYPES[0]
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <MessageSquare className="h-5 w-5 text-blue-400" />
          Комментарии ({messages.length})
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Messages list */}
        <div className="max-h-64 overflow-y-auto space-y-3 pr-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Нет комментариев
            </p>
          ) : (
            messages.map((msg) => {
              const typeInfo = getTypeInfo(msg.message_type)
              return (
                <div
                  key={msg.id}
                  className="p-3 rounded-lg bg-secondary/30 border border-border"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className={`${typeInfo.color} text-white text-xs`}>
                      {typeInfo.label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(msg.created_at), 'dd MMM yyyy, HH:mm', { locale: ru })}
                    </span>
                  </div>
                  <p className="text-sm text-foreground">{msg.content}</p>
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* New message form */}
        <div className="space-y-2 pt-2 border-t border-border">
          <div className="flex gap-2">
            <Select value={messageType} onValueChange={setMessageType}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESSAGE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Написать комментарий..."
              rows={1}
              className="flex-1 min-h-[38px] resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
            />
            <Button onClick={handleSend} disabled={isSending || !newMessage.trim()}>
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
