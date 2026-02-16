'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { postExchangeDealToCashboxes } from '@/app/actions/exchange'
import { useRouter } from 'next/navigation'
import { CheckCircle, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface PostToCashboxesButtonProps {
  dealId: string
}

export function PostToCashboxesButton({ dealId }: PostToCashboxesButtonProps) {
  const [isPosting, setIsPosting] = useState(false)
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  const handlePost = async () => {
    setIsPosting(true)
    
    try {
      const result = await postExchangeDealToCashboxes(dealId)
      
      if (result.success) {
        toast({
          title: 'Успешно',
          description: 'Сделка обмена проведена по кассам',
        })
        setOpen(false)
        router.refresh()
      } else {
        toast({
          title: 'Ошибка',
          description: result.error || 'Не удалось провести сделку',
          variant: 'destructive',
        })
      }
    } catch (error) {
      toast({
        title: 'Ошибка',
        description: 'Произошла непредвиденная ошибка',
        variant: 'destructive',
      })
    } finally {
      setIsPosting(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="sm">
          <CheckCircle className="w-4 h-4 mr-2" />
          Провести по кассе
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Провести сделку по кассе</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              Эта операция выполнит следующие действия:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>Проверит соответствие валют касс и операций</li>
              <li>Проверит достаточность средств в кассах</li>
              <li>Обновит балансы всех задействованных касс</li>
              <li>Создаст записи в журнале транзакций</li>
              <li>Изменит статус сделки на "Завершена"</li>
            </ul>
            <p className="font-semibold text-foreground mt-2">
              Это действие нельзя будет отменить.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPosting}>Отмена</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              handlePost()
            }}
            disabled={isPosting}
          >
            {isPosting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Проведение...
              </>
            ) : (
              'Провести'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
