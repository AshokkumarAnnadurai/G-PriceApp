// ── API wrapper ───────────────────────────────────────────────────────────────
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ── Domain ────────────────────────────────────────────────────────────────────
export interface VendorMaterial {
  id: number;
  vendorId: string;
  grade: string;
  customerName: string;
  castingCode: string;
  rmWeight: number;
  revisedRatePerKg: number;
  mmrRate: number;
  roRate: number;
  consumablesRate: number;
  extraFactor: number;
  fromDate?: string;
  toDate?: string;
  machineType?: string;
  coating?: string;
  cavity?: string;
  coreSleeve?: string;
  itemCode?: string;
  itemDescription?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Vendor {
  id: string;
  name: string;
  bpCode: string;
  groupCode?: string;
  groupName?: string;
  materials: VendorMaterial[];
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  bpCode: string;
  name: string;
  foreignName?: string;
  localName?: string;
  groupCode?: string;
  groupName?: string;
}

export interface ItemMaster {
  id: string;
  itemCode: string;
  description: string;
  inStock: number;
  itemGroup: string;
  castingCode: string;
  foreignName: string;
  grade: string;
  boughtOutJobWork: string;
  chapterId: string;
  purchasingItem: string;
  salesItem: string;
  inventoryItem: string;
  subGroup1: string;
  active: string;
  stage: string;
  uom: string;
  uom2: string;
  price: number;
  kit: string;
  exportDomestic: string;
  // Restored legacy fields for other pages
  customerName: string;
  customerType: string;
  customerCode?: string; currency?: string;
  customerGroup?: string;
  coating: string;
  machining: number;
  weight: number;
  ratePerKg: number;
  currentPrice: number;
  vendorId: string;
  vendorName: string;
  vendor?: string;
  castWeight?: string;
  cost?: string;
  customerApprovalFoundry?: string;
  rejectionCost?: number;
  specialCoating?: string;
  powderCoating?: number;
  specialProcess?: number;
  process?: number;
  transCharges?: number;
  ohp?: number;
  packing?: number;
  totalWorkingCost?: number;
  finalPrice?: number;
  fromDate?: string;
  toDate?: string;
  lessDomesticPacking?: number;
  assemblyCost?: number;
  exportPackingCost?: number;
  fobCost?: number;
  ohIccExport?: number;
  addedExportOverheads?: number;
  unitPriceExport?: number;
  forex?: number;
  unitPriceForeignCurrency?: number;
  // Pin & Bush specifics
  hardeningWt?: number;
  hardeningRate?: number;
  grinding?: number;
  hardChromeWt?: number;
  hardChromeRate?: number;
  powderCoatingWeight?: number;
  powderCoatingRate?: number;
  cutting?: number;
  cuttingWeight?: number;
  cuttingRate?: number;
  specialProcessWeight?: number;
  specialProcessRate?: number;
  createdAt: string;
}
export type BatchStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export interface PricingBatch {
  id: number;
  batchNumber: string;
  description: string;
  status: BatchStatus;
  grade: string | null;
  vendorId: string | null;
  vendorName?: string;
  customerName?: string;
  itemCount: number;
  createdAt: string;
  approvedAt: string | null;
  updatedMmr?: number;
  updatedCoatingRate?: number;
  updatedConsumablesRate?: number;
  updatedExtraFactor?: number;
  mmrChange?: number;
  roChange?: number;
  consChange?: number;
  extraChange?: number;
  newRedOxide?: number;
  newConsumables?: number;
  newExtra?: number;
  fromDate?: string;
  toDate?: string;
}

export interface PricingBatchItem {
  id: number;
  batchId: number;
  itemMasterId: number;
  castingCode: string;
  itemCode: string;
  customerName: string;
  rmWeight: number;
  rmCost: number;
  machining: number;
  subcon: number;
  overheadPct: number;
  packing: number;
  oldPrice: number;
  newPrice: number;
  delta: number;
  customerRmWeight: number;
  customerRatePerKg: number;
  customerRmPrice: number;
  customerTotalPrice: number;
  customerDelta: number;
  oldRatePerKg?: number;
  oldCoating?: number;
  customerApprovalFoundry?: string;
  oldMmr?: number;
  oldRo?: number;
  oldConsumables?: number;
  oldExtra?: number;
}

export interface ItemPriceHistory {
  id: number;
  batchId?: number;
  itemCode: string;
  castingCode: string;
  customerName: string;
  vendorId?: string;
  vendorName?: string;
  batchNumber: string;
  fromDate?: string;
  toDate?: string;
  updatedBy?: string;
  
  oldMmr?: number;
  newMmr?: number;
  oldCoating?: number;
  newCoating?: number;
  oldConsumables?: number;
  newConsumables?: number;
  oldExtra?: number;
  newExtra?: number;
  oldRatePerKg?: number;
  newRatePerKg?: number;
  
  oldPrice: number;
  newPrice: number;
  delta: number;
  changedFields?: any;
  createdAt?: string;
  itemDescription?: string;
  grade?: string;
  rmWeight?: number;
  machineType?: string;
  coating?: string;
  cavity?: string;
  coreSleeve?: string;

  // Customer-specific fields (populated in customer mode)
  customerCode?: string;
  customerApprovalFoundry?: string;
  domesticExport?: string;
  groupName?: string;
  oldCastWeight?: number;
  newCastWeight?: number;
  oldCastRate?: number;
  newCastRate?: number;
}

export interface VendorMaterialHistory {
  id: number;
  vendor_id: string;
  vendor_name: string;
  grade: string;
  customer_name: string;
  casting_code: string;
  old_mmr_rate: number;
  new_mmr_rate: number;
  old_ro_rate: number;
  new_ro_rate: number;
  old_consumables_rate: number;
  new_consumables_rate: number;
  old_extra_factor: number;
  new_extra_factor: number;
  old_rm_weight: number;
  new_rm_weight: number;
  old_revised_rate_per_kg: number;
  new_revised_rate_per_kg: number;
  old_revised_price: number;
  new_revised_price: number;
  operation: string;
  changed_at: string;
}

export interface PriceLogFiltersResponse {
  castingCodes: string[];
  itemCodes?: string[];
  vendors?: { id: string; name: string }[];
  customers?: { code: string; name: string }[];
}


export interface ItemApproval {
  id: number;
  batchId: number;
  itemMasterId: number;
  itemCode: string;
  castingCode: string;
  customerName: string;
  rmWeight: number;
  rmCost: number;
  machining: number;
  subcon: number;
  oldPrice: number;
  newPrice: number;
  delta: number;
  custRate: number;
  custPrice: number;
  status: string;
  batchNumber: string;
  grade: string;
  fromDate: string | null;
  toDate: string | null;
  vendorName: string | null;
  description: string | null;
  wt: number;
  oldRate: number;
  oldMmr?: number;
  oldRo?: number;
  oldConsumables?: number;
  oldExtra?: number;
  newMmr?: number;
  newRo?: number;
  newConsumables?: number;
  newExtra?: number;
  customerOldMmr?: number;
  customerOldRo?: number;
  customerOldConsumables?: number;
  customerOldExtra?: number;
  customerNewMmr?: number;
  customerNewRo?: number;
  customerNewConsumables?: number;
  customerNewExtra?: number;
}

export interface FilterOptions {
  grades: string[];
  customers: string[];
  customerTypes: string[];
  vendors: { id: string; name: string }[];
  castingCodes?: string[];
  itemGroups?: { code: number; name: string }[];
  stages?: string[];
  itemCodes?: string[];
  descriptions?: string[];
  customerApprovalFoundries?: string[];
  customerFoundryMappings?: { customerCode: string; customerName: string; foundry: string }[];
  foreignNames?: string[];
}


// ── Form bodies ───────────────────────────────────────────────────────────────
export interface CreateBatchBody {
  description: string;
  status?: string;
  grade?: string;
  vendorId?: string;
  itemMasterIds: string[];
  updatedMmr?: number;
  mmrChange?: number;
  updatedCoatingRate?: number;
  roChange?: number;
  updatedConsumablesRate?: number;
  consChange?: number;
  updatedExtraFactor?: number;
  extraChange?: number;
  fromDate: string;
  toDate: string;
}

export interface CreateMaterialBody {
  grade: string;
  customerName: string;
  castingCode: string;
  rmWeight: number;
  revisedRatePerKg: number;
  mmrRate: number;
  roRate: number;
  consumablesRate: number;
  extraFactor: number;
  fromDate?: string;
  toDate?: string;
  machineType?: string;
  coating?: string;
  cavity?: string;
  coreSleeve?: string;
  itemCode?: string;
  itemDescription?: string;
}

export interface UpdateMaterialBody {
  customerName: string;
  castingCode: string;
  rmWeight: number;
  revisedRatePerKg: number;
  mmrRate: number;
  roRate: number;
  consumablesRate: number;
  extraFactor: number;
  fromDate?: string;
  toDate?: string;
  machineType?: string;
  coating?: string;
  cavity?: string;
  coreSleeve?: string;
  itemCode?: string;
  itemDescription?: string;
}

export interface ItemListFilters {
  grade?: string;
  vendorId?: string;
  customerName?: string;
  customerType?: string;
  page?: number;
  pageSize?: number;
  search?: string;
  itemGroup?: string;
  foreignName?: string;
  hasPricing?: boolean;
  itemCode?: string;
  date?: string;
  description?: string;
  castingCode?: string;
  boughtOutJobWork?: string;
}
