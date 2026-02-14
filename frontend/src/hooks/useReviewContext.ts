import { use } from "react"
import { ReviewContext } from "@/contexts/ReviewContext"

export function useReviewContext() {
  const ctx = use(ReviewContext)
  if (!ctx) throw new Error("useReviewContext must be used within ReviewProvider")
  return ctx
}
