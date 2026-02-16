import { lazy, Suspense, useState } from "react"
import { Routes, Route, Navigate } from "react-router"
import { useFrappeAuth, useFrappeGetCall } from "frappe-react-sdk"
import { Spinner } from "@/components/ui/spinner"
import { UserProvider } from "@/context/UserContext"
import { AppLayout } from "@/components/layout/AppLayout"
import { SetupWizard } from "@/pages/SetupWizard"

const DashboardPage = lazy(() =>
  import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
)
const InboxPage = lazy(() =>
  import("@/pages/InboxPage").then((m) => ({ default: m.InboxPage })),
)
const ProjectsPage = lazy(() =>
  import("@/pages/ProjectsPage").then((m) => ({ default: m.ProjectsPage })),
)
const ProjectDetailPage = lazy(() =>
  import("@/pages/ProjectDetailPage").then((m) => ({ default: m.ProjectDetailPage })),
)
const ReviewPage = lazy(() =>
  import("@/pages/ReviewPage").then((m) => ({ default: m.ReviewPage })),
)
const AuditLogPage = lazy(() =>
  import("@/pages/AuditLogPage").then((m) => ({ default: m.AuditLogPage })),
)

function PageSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner className="size-6" />
    </div>
  )
}

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

function SetupGate({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useFrappeGetCall<{
    setup_complete: boolean
    is_system_manager: boolean
  }>("vms.api.get_setup_status")
  const [wizardDone, setWizardDone] = useState(false)

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Spinner className="size-6" />
      </div>
    )
  }

  const setupComplete = data?.message?.setup_complete || wizardDone
  const isSystemManager = data?.message?.is_system_manager ?? false

  // Only show wizard to System Managers; non-admins skip to app
  if (!setupComplete && isSystemManager) {
    return <SetupWizard onComplete={() => setWizardDone(true)} />
  }

  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route
        element={
          <ProtectedRoute>
            <SetupGate>
              <AppLayout />
            </SetupGate>
          </ProtectedRoute>
        }
      >
        <Route index element={<Suspense fallback={<PageSpinner />}><DashboardPage /></Suspense>} />
        <Route path="inbox" element={<Suspense fallback={<PageSpinner />}><InboxPage /></Suspense>} />
        <Route path="projects" element={<Suspense fallback={<PageSpinner />}><ProjectsPage /></Suspense>} />
        <Route path="projects/:projectId" element={<Suspense fallback={<PageSpinner />}><ProjectDetailPage /></Suspense>} />
        <Route path="audit-logs" element={<Suspense fallback={<PageSpinner />}><AuditLogPage /></Suspense>} />
      </Route>
      <Route path="review/:assetId" element={<Suspense fallback={<PageSpinner />}><ReviewPage /></Suspense>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
