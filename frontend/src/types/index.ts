export interface VMSProject {
  name: string
  project_name: string
  description?: string
  status: "Open" | "In Progress" | "In Review" | "Completed" | "Archived"
  owner_user: string
  due_date?: string
  thumbnail_url?: string
  creation: string
  modified: string
}

export interface VMSAsset {
  name: string
  project?: string
  file_name: string
  r2_key: string
  file_size?: number
  file_type?: string
  status: "Uploading" | "Ready" | "Processing" | "Error"
  category: "Source" | "Cut" | "Review" | "Final"
  uploaded_by: string
  uploader_name?: string
  uploader_image?: string | null
  uploaded_at?: string
  duration_seconds?: number
  thumbnail_r2_key?: string
  creation: string
  modified: string
}

export interface UploadUrlResponse {
  upload_url: string
  r2_key: string
  asset_name: string
}

export interface ViewUrlResponse {
  url: string
}

export interface ConfirmUploadResponse {
  status: string
  asset_name: string
}
