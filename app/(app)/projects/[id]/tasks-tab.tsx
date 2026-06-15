'use client'

import { useTransition, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CheckSquare, Plus } from 'lucide-react'
import { toggleTask, createTask } from '@/lib/actions/tasks'

interface Task {
  id: string
  title: string
  type: string | null
  priority: string | null
  is_done: boolean
  due_at: string | null
}

const PRIORITY_STYLES: Record<string, string> = {
  high: 'bg-red-50 text-red-700',
  medium: 'bg-amber-50 text-amber-700',
  low: 'bg-muted text-muted-foreground',
}

function TaskItem({ task }: { task: Task }) {
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(task.is_done)

  function handleToggle() {
    startTransition(async () => {
      setDone((prev) => !prev)
      await toggleTask(task.id)
    })
  }

  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-3">
        <button
          onClick={handleToggle}
          disabled={pending}
          aria-label={done ? 'Mark incomplete' : 'Mark complete'}
          className={`size-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
            done
              ? 'border-primary bg-primary'
              : 'border-border hover:border-primary/60'
          } disabled:opacity-50`}
        >
          {done && (
            <svg className="size-2.5 text-primary-foreground" viewBox="0 0 12 10">
              <path
                d="M1 5l3.5 3.5L11 1"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <p
            className={`text-sm font-medium truncate ${
              done ? 'line-through text-muted-foreground' : 'text-foreground'
            }`}
          >
            {task.title}
          </p>
          {task.due_at && (
            <span className="text-xs tabular-nums text-muted-foreground">
              Due{' '}
              {new Date(task.due_at).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
              })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {task.type && task.type !== 'manual' && (
            <Badge variant="secondary" className="text-xs capitalize">
              {task.type.replace(/_/g, ' ')}
            </Badge>
          )}
          {task.priority && (
            <Badge
              variant="outline"
              className={`border-0 text-xs capitalize ${PRIORITY_STYLES[task.priority] ?? ''}`}
            >
              {task.priority}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function CreateTaskSheet({
  open,
  onOpenChange,
  projectId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  projectId: string
}) {
  const [pending, startTransition] = useTransition()
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState('medium')
  const [dueAt, setDueAt] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return

    setError(null)
    startTransition(async () => {
      const result = await createTask({
        project_id: projectId,
        title: title.trim(),
        priority,
        due_at: dueAt || undefined,
      })
      if ('error' in result) {
        setError(result.error)
      } else {
        setTitle('')
        setPriority('medium')
        setDueAt('')
        onOpenChange(false)
      }
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Add task</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ptask-title">Title</Label>
            <Input
              id="ptask-title"
              placeholder="What needs to be done?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ptask-priority">Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger id="ptask-priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ptask-due">Due date (optional)</Label>
            <Input
              id="ptask-due"
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <SheetFooter>
            <Button type="submit" disabled={pending || !title.trim()} className="w-full">
              {pending ? 'Adding…' : 'Add task'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

export function TasksTab({ tasks, projectId }: { tasks: Task[]; projectId: string }) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const pendingCount = tasks.filter((t) => !t.is_done).length

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground tabular-nums">{pendingCount} pending</p>
          <Button onClick={() => setSheetOpen(true)} size="sm">
            <Plus className="size-4" />
            Add task
          </Button>
        </div>

        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-12 text-center">
            <CheckSquare className="size-7 mb-3 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">No tasks yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Tasks will appear here when created or auto-generated.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {tasks.map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
          </div>
        )}
      </div>

      <CreateTaskSheet open={sheetOpen} onOpenChange={setSheetOpen} projectId={projectId} />
    </>
  )
}
