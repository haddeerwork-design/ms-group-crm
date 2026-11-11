import { tr } from './i18n'
import { toast } from 'sonner'
import { supabase } from './supabase'

/**
 * Archive is reversible, so instead of asking "Are you sure?" first we do it
 * and offer Undo for a few seconds (and it can be restored later anyway).
 */
export function archivedToast(label: string, table: string, id: string, after: () => void) {
  toast.success(tr('{label} archived', { label }), {
    duration: 7000,
    action: {
      label: tr('Undo'),
      onClick: async () => {
        const { error } = await supabase.from(table).update({ archived_at: null }).eq('id', id)
        if (error) toast.error(error.message); else { toast.success(tr('{label} restored', { label })); after() }
      },
    },
  })
}
