import { Routes, Route, Navigate } from "react-router"
import { useFrappeAuth } from "frappe-react-sdk"
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
        <div className="text-muted-foreground">Loading...</div>
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
      <Route
        path="review/:assetId"
        element={
          <ProtectedRoute>
            <ReviewPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
