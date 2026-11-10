import { toast } from 'sonner'
import { supabase } from './supabase'

/**
 * Archive is reversible, so instead of asking "Are you sure?" first we do it
 * and offer Undo for a few seconds (and it can be restored later anyway).
 */
export function archivedToast(label: string, table: string, id: string, after: () => void) {
  toast.success(`${label} archived`, {
    duration: 7000,
    action: {
      label: 'Undo',
      onClick: async () => {
        const { error } = await supabase.from(table).update({ archived_at: null }).eq('id', id)
        if (error) toast.error(error.message); else { toast.success(`${label} restored`); after() }
      },
    },
  })
}
