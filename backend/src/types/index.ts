// API Response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface ApiError {
  success: false;
  error: string;
  details?: unknown;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// Domain types
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

export interface VendorMaterialRow {
  id: number;
  vendor_id: string;
  grade: string;
  customer_name: string;
  casting_code: string;
  rm_weight: number;
  revised_rate_per_kg: number;
  mmr_rate: number;
  ro_rate: number;
  consumables_rate: number;
  extra_factor: number;
  from_date?: string;
  to_date?: string;
  machine_type?: string;
  coating?: string;
  cavity?: string;
  core_sleeve?: string;
  item_code?: string;
  item_description?: string;
  created_at: string;
  updated_at: string;
}

export interface VendorRow {
  id: string;
  name: string;
  bp_code: string;
  created_at: string;
  updated_at: string;
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
  customerCode?: string; currency?: string;
  customerGroup?: string;
  vendorId?: string;
  customerName?: string;
  customerApprovalFoundry?: string;
  rejectionCost?: number;
  specialCoating?: string;
  powderCoating?: number;
  powderCoatingWeight?: number;
  powderCoatingRate?: number;
  specialProcess?: number;
  specialProcessWeight?: number;
  specialProcessRate?: number;
  process?: number;
  transCharges?: number;
  ohp?: number;
  packing?: number;
  totalWorkingCost?: number;
  finalPrice?: number;
  fromDate?: string;
  toDate?: string;
  weight?: number;
  ratePerKg?: number;
  hardeningWt?: number;
  hardeningRate?: number;
  grinding?: number;
  hardChromeWt?: number;
  hardChromeRate?: number;
  cuttingWeight?: number;
  cuttingRate?: number;
  cutting?: number;
  lessDomesticPacking?: number;
  assemblyCost?: number;
  exportPackingCost?: string;
  fobCost?: number;
  ohIccExport?: number;
  addedExportOverheads?: number;
  unitPriceExport?: string;
  forex?: number;
  unitPriceForeignCurrency?: string;
}


export interface PricingItem extends ItemMaster {
  customerName: string;
  customerType: string;
  coating: string;
  machining: number;
  weight: number;
  ratePerKg: number;
  currentPrice: number;
  vendorId: string;
  vendorName: string;
  createdAt: string;
  // Vendor cost fields for profit/loss indicator
  vendorRmCost?: number | null;
  vendorRmWeight?: number | null;
  vendorRmRate?: number | null;
  vendorProcessCost?: number | null;
}

export interface ItemMasterRow {
  id: string;
  casting_code: string;
  item_code: string;
  customer_name: string;
  description: string;
  grade: string;
  coating: string;
  machining: number;
  weight: number;
  rate_per_kg: number;
  current_price: number;
  vendor_id: string;
  vendor_name?: string;
  created_at: string;
}

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
  fromDate?: string;
  toDate?: string;
}

export interface PricingBatchRow {
  id: number;
  batch_number: string;
  description: string;
  status: BatchStatus;
  grade: string | null;
  vendor_id: string | null;
  vendor_name?: string;
  item_count: number;
  created_at: string;
  approved_at: string | null;
  updated_mmr?: string | number;
  updated_coating_rate?: string | number;
  updated_consumables_rate?: string | number;
  updated_extra_factor?: string | number;
  from_date?: string;
  to_date?: string;
}

export type BatchStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export interface PricingBatchItem {
  id: number;
  batchId: number;
  itemMasterId: string;
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
  // customer side
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

export interface PricingBatchItemRow {
  id: number;
  batch_id: number;
  item_master_id: string;
  casting_code: string;
  item_code: string;
  customer_name: string;
  rm_weight: number;
  rm_cost: number;
  machining: number;
  subcon: number;
  overhead_pct: number;
  packing: number;
  old_price: number;
  new_price: number;
  delta: number;
  customer_rm_weight: number;
  customer_rate_per_kg: number;
  customer_rm_price: number;
  customer_total_price: number;
  customer_delta: number;
  old_rate_per_kg?: number;
  old_coating?: number;
  customer_approval_foundry?: string;
  old_mmr?: number;
  old_ro?: number;
  old_consumables?: number;
  old_extra?: number;
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

  // Customer-specific fields (populated in customer mode)
  customerCode?: string;
  customerApprovalFoundry?: string;
  domesticExport?: string;
  groupName?: string;
  itemDescription?: string;
  grade?: string;
  rmWeight?: number;
  oldCastWeight?: number;
  newCastWeight?: number;
  oldCastRate?: number;
  newCastRate?: number;
}

export interface ItemPriceHistoryRow {
  id: number;
  batch_id?: number;
  item_code: string;
  casting_code: string;
  customer_name: string;
  vendor_id?: string;
  vendor_name?: string;
  batch_number: string;
  from_date?: string;
  to_date?: string;
  updated_by?: string;

  old_mmr?: number;
  new_mmr?: number;
  old_coating?: number;
  new_coating?: number;
  old_consumables?: number;
  new_consumables?: number;
  old_extra?: number;
  new_extra?: number;
  old_rate_per_kg?: number;
  new_rate_per_kg?: number;

  old_price: number;
  new_price: number;
  delta: number;

  created_at?: string;

  // Customer-specific row fields
  customer_code?: string;
  customer_approval_foundry?: string;
  domestic_export?: string;
  group_name?: string;
  item_description?: string;
  grade?: string;
  old_cast_weight?: number;
  new_cast_weight?: number;
  old_cast_rate?: number;
  new_cast_rate?: number;
}

// Request body types
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
  foreignNames?: string[];
}

export interface ListItemsQuery {
  grade?: string;
  vendorId?: string;
  customerName?: string;
  customerType?: string;
  page?: string;
  pageSize?: string;
  search?: string;
  itemGroup?: string;
  foreignName?: string;
  hasPricing?: string;
  itemCode?: string;
  date?: string;
  description?: string;
  castingCode?: string;
  boughtOutJobWork?: string;
  /** Filter by item approval status: 'pending' | 'approved' | 'disputed' */
  approvalStatus?: string;
}

