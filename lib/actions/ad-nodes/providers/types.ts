// Common contract every image/video generation provider adapter implements,
// so the executor (../executor.ts) can dispatch to whichever provider+model
// a node's config picks without knowing that provider's actual request/
// response shape. Deliberately separate from lib/actions/image-clone.ts's
// Replicate functions — those are hard-coded to one model, Ad Nodes needs
// an arbitrary model per node.
export interface GenerationAdapter {
  submit(input: Record<string, unknown>): Promise<{ jobId: string }>
  poll(jobId: string): Promise<GenerationPollResult>
}

export type GenerationPollResult =
  | { state: "running" }
  | { state: "succeeded"; urls: string[] }
  | { state: "failed"; error: string }
