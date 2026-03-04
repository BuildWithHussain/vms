export interface VMSProject {
  name: string
  project_name: string
  description?: string
  status: "Open" | "In Progress" | "In Review" | "Completed" | "Archived"
  owner_user: string
  due_date?: string
  thumbnail_url?: string
  share_token?: string | null
  creation: string
  modified: string
}

export interface VMSFolder {
  name: string
  folder_name: string
  project: string
  deleted_at?: string | null
  deleted_by?: string | null
  deleter_name?: string
  project_name?: string
  creation: string
  modified: string
}

export interface VMSAsset {
  name: string
  project?: string
  folder?: string
  file_name: string
  r2_key: string
  file_size?: number
  file_type?: string
  status: "Uploading" | "Ready" | "Processing" | "Error"
  category: "Footage" | "For Review" | "Deliverable"
  uploaded_by: string
  uploader_name?: string
  uploader_image?: string | null
  uploaded_at?: string
  duration_seconds?: number
  thumbnail_url?: string
  version?: number
  is_public_review?: 0 | 1
  review_token?: string | null
  deleted_at?: string | null
  deleted_by?: string | null
  deleter_name?: string
  project_name?: string
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

export interface VMSAuditLog {
  name: string
  action: "Download" | "Delete" | "Permanent Delete" | "Rename" | "Restore"
  asset_name: string
  user: string
  timestamp: string
  file_name?: string
  file_type?: string
  project?: string
  project_name?: string
  file_size?: number
  user_full_name: string
  user_image?: string | null
}

export interface VMSReviewComment {
  name: string
  asset: string
  parent_comment?: string | null
  comment_text: string
  video_timestamp?: number | null
  commented_by?: string
  guest_name?: string | null
  commenter_name: string
  commenter_image?: string | null
  is_resolved: 0 | 1
  has_annotation: 0 | 1
  is_edited: 0 | 1
  annotation_data?: string | null
  creation: string
  modified: string
}
