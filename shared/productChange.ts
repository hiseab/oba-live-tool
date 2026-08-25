export type ProductChangeStatus = 'requested' | 'assigned' | 'completed'
export type ProductChangeCurrentStatus = ProductChangeStatus | 'normal'
export type ProductMaterialType = 'image' | 'video' | 'audio'

export interface ProductMaterial {
  id: string
  associationId: string
  type: ProductMaterialType
  name: string
  url: string
  size: number
  role: 'cover' | 'normal'
  sort: number
}

export interface AssignedProduct {
  id: string
  name: string
  platform: string
  platformProductId: string
  coverUrl: string
  materialCount: number
  materials: ProductMaterial[]
}

export interface ProductChangeRecord {
  id: string
  workstationId: string
  status: ProductChangeStatus
  productId: string
  assignedBy: string
  requestedAt: number | null
  assignedAt: number | null
  completedAt: number | null
  product: AssignedProduct | null
}

export interface ProductChangeSnapshot {
  currentStatus: ProductChangeCurrentStatus
  activeChangeId: string
  changes: ProductChangeRecord[]
}

export interface ProductMaterialDownloadFailure {
  materialId: string
  name: string
  message: string
}

export interface ProductMaterialDownloadResult {
  directory: string
  successCount: number
  failed: ProductMaterialDownloadFailure[]
}

export interface ProductChangeClientState {
  connected: boolean
  snapshot: ProductChangeSnapshot
}

export interface ProductChangeErrorMessage {
  operation: string
  message: string
}
