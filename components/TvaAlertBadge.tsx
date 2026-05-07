'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { isTvaErronnee } from '@/lib/tva-validation'

export function TvaAlertBadge() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    async function fetchCount() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: m } = await supabase.from('memberships').select('workspace_id').eq('user_id', user.id).single()
      if (!m) return
      const [{ data: f }, { data: d }] = await Promise.all([
        supabase.from('factures').select('taux_tva,montant_ht,montant_tva,montant_ttc,tva_lines').eq('workspace_id', m.workspace_id),
        supabase.from('depenses').select('taux_tva,montant_ht,montant_tva,montant_ttc,tva_lines').eq('workspace_id', m.workspace_id),
      ])
      const all = [...(f ?? []), ...(d ?? [])]
      setCount(all.filter(isTvaErronnee).length)
    }
    fetchCount()
  }, [])

  if (count === 0) return null
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 18, height: 18, borderRadius: 9,
      background: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b',
      fontSize: 10, fontWeight: 700, flexShrink: 0,
      fontFamily: 'Inter, sans-serif', padding: '0 4px',
      lineHeight: 1,
    }}>
      {count > 99 ? '99+' : count}
    </span>
  )
}
