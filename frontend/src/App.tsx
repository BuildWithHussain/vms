import { Routes, Route, Navigate } from "react-router"
import { useFrappeAuth } from "frappe-react-sdk"
import { Spinner } from "@/components/ui/spinner"
import { UserProvider } from "@/context/UserContext"
import { AppLayout } from "@/components/layout/AppLayout"
import { DashboardPage } from "@/pages/DashboardPage"
import { InboxPage } from "@/pages/InboxPage"
import { ProjectsPage } from "@/pages/ProjectsPage"
import { ProjectDetailPage } from "@/pages/ProjectDetailPage"
import { ReviewPage } from "@/pages/ReviewPage"
import { AuditLogPage } from "@/pages/AuditLogPage"

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { currentUser, isLoading } = useFrappeAuth()

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Spinner className="size-6" />
      </div>
    )
  }

  if (!currentUser || currentUser === "Guest") {
    window.location.href = "/login"
    return null
  }

  return <UserProvider>{children}</UserProvider>
}

export default function App() {
  return (
    <Routes>
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="inbox" element={<InboxPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="audit-logs" element={<AuditLogPage />} />
      </Route>
      <Route path="review/:assetId" element={<ReviewPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
