"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ClientScriptReview } from "@/components/share/client-script-review"
import type { AdCloneLine, ClientReviewStatus } from "@/lib/types"

interface Script {
  briefId:         string
  scriptKey:       string
  lines:           AdCloneLine[]
  client_status:   ClientReviewStatus | null
  client_feedback: string | null
}

export function ScriptReviewModal({ script, label, open, onClose }: {
  script:  Script
  label:   string
  open:    boolean
  onClose: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        <ClientScriptReview script={script} />
      </DialogContent>
    </Dialog>
  )
}
