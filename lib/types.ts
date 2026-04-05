export type Role = "admin" | "employee"

export interface Profile {
  id: string
  full_name: string
  email: string
  role: Role
  position: string | null
  phone: string | null
  avatar_url: string | null
  created_at: string
}

export type CustomerStatus = "Prospect" | "Active" | "Inactive" | "Churned"

export interface Customer {
  id: string
  name: string
  status: CustomerStatus
  company: string | null
  email: string | null
  phone: string | null
  created_at: string
}

export type ProjectStatus = "Planning" | "In Progress" | "Review" | "Completed"

export interface Project {
  id: string
  name: string
  customer_id: string | null
  status: ProjectStatus
  progress: number
  start_date: string | null
  end_date: string | null
  budget: number | null
  description: string | null
  created_at: string
  customer?: Customer
  tasks?: Task[]
  members?: Profile[]
}

export type TaskStatus = "Todo" | "In Progress" | "Done"
export type TaskPriority = "Low" | "Medium" | "High"

export interface Task {
  id: string
  project_id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null
  assignee_id: string | null
  created_at: string
  project?: Project
  assignee?: Profile
}

export type ExpenseFrequency = "Monthly" | "Weekly" | "Annual" | "One-time"
export type ExpenseCategory = "Payroll" | "Software" | "Rent" | "Utilities" | "Other"

export interface RecurringExpense {
  id: string
  name: string
  amount: number
  frequency: ExpenseFrequency
  category: ExpenseCategory
  start_date: string
  is_active: boolean
  created_at: string
}

export interface Income {
  id: string
  project_id: string | null
  amount: number
  date: string
  description: string | null
  invoice_number: string | null
  created_at: string
  project?: Project
}

export interface ProjectExpense {
  id: string
  project_id: string
  amount: number
  date: string
  description: string | null
  category: string | null
  created_at: string
  project?: Project
}
