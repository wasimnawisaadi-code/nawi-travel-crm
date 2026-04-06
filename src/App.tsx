import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth-context";

import Login from "./pages/Login";
import AppLayout from "./components/layout/AppLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import EmployeeList from "./pages/admin/EmployeeList";
import EmployeeProfile from "./pages/admin/EmployeeProfile";
import AdminAttendance from "./pages/admin/AdminAttendance";
import PayrollManagement from "./pages/admin/PayrollManagement";
import AuditLog from "./pages/admin/AuditLog";
import ReportsPage from "./pages/admin/ReportsPage";
import EmployeeDashboard from "./pages/employee/EmployeeDashboard";
import AttendancePage from "./pages/employee/AttendancePage";
import ClientList from "./pages/shared/ClientList";
import ClientProfile from "./pages/shared/ClientProfile";
import AddClientWizard from "./pages/shared/AddClientWizard";
import OperationsCalendar from "./pages/shared/OperationsCalendar";
import LeaveManagement from "./pages/shared/LeaveManagement";
import TeamChat from "./pages/shared/TeamChat";
import ImportantDates from "./pages/shared/ImportantDates";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Navigate to="/login" replace />} />

            {/* Admin Routes */}
            <Route element={<AppLayout />}>
              <Route path="/admin/dashboard" element={<AdminDashboard />} />
              <Route path="/admin/employees" element={<EmployeeList />} />
              <Route path="/admin/employees/new" element={<EmployeeList />} />
              <Route path="/admin/employees/:id" element={<EmployeeProfile />} />
              <Route path="/admin/clients" element={<ClientList adminView />} />
              <Route path="/admin/clients/new" element={<AddClientWizard />} />
              <Route path="/admin/clients/:id" element={<ClientProfile />} />
              <Route path="/admin/calendar" element={<OperationsCalendar />} />
              <Route path="/admin/attendance" element={<AdminAttendance />} />
              <Route path="/admin/leave" element={<LeaveManagement />} />
              <Route path="/admin/payroll" element={<PayrollManagement />} />
              <Route path="/admin/reports" element={<ReportsPage />} />
              <Route path="/admin/audit-log" element={<AuditLog />} />
              <Route path="/admin/important-dates" element={<ImportantDates />} />
              <Route path="/admin/chat" element={<TeamChat />} />

              {/* Employee Routes */}
              <Route path="/employee/dashboard" element={<EmployeeDashboard />} />
              <Route path="/employee/clients" element={<ClientList />} />
              <Route path="/employee/clients/new" element={<AddClientWizard />} />
              <Route path="/employee/clients/:id" element={<ClientProfile />} />
              <Route path="/employee/calendar" element={<OperationsCalendar />} />
              <Route path="/employee/attendance" element={<AttendancePage />} />
              <Route path="/employee/leave" element={<LeaveManagement isEmployee />} />
              <Route path="/employee/important-dates" element={<ImportantDates />} />
              <Route path="/employee/chat" element={<TeamChat />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
