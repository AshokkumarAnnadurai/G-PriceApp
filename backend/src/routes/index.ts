import { Router } from 'express';
import * as authController from '../controllers/authController';
import * as customerController from '../controllers/customerController';
import * as itemController from '../controllers/itemController';
import * as managementController from '../controllers/managementController';
import * as pricingController from '../controllers/pricingController';
import * as sapSyncController from '../controllers/sapSyncController';
import * as vendorController from '../controllers/vendorController';
import * as vendorWeightDrawingController from '../controllers/vendorWeightDrawingController';
import * as weightDrawingController from '../controllers/weightDrawingController';
import { verifyToken } from '../middleware/auth';
import { verifyPermission } from '../middleware/rbac';

export const router: Router = Router();

// Auth (Public)
router.post('/auth/login', authController.login);
router.post('/auth/refresh', authController.refresh);

// Secure all other routes
router.use(verifyToken);
router.use(verifyPermission);

// Vendors
router.get('/vendors', vendorController.getAll);
router.get('/vendors/materials/history', vendorController.getHistory);
router.get('/vendors/:id', vendorController.getOne);
router.post('/vendors/sync-materials', vendorController.syncMaterials);
router.post('/vendors/:id/materials', vendorController.addMaterial);
router.put('/vendors/:id/materials/:materialId', vendorController.updateMaterial);
router.delete('/vendors/:id/materials/:materialId', vendorController.deleteMaterial);
router.get('/vendors/:id/materials/:materialId/weight-drawings', vendorWeightDrawingController.getVendorWeightDrawingsHandler);
router.post('/vendors/:id/materials/:materialId/weight-drawings', vendorWeightDrawingController.saveVendorWeightDrawingsHandler);
router.get('/vendors/:id/materials/:materialId/periods', vendorWeightDrawingController.getMaterialPeriodsHandler);

// Customers
router.get('/customers', customerController.getAll);
router.get('/customers/:id/items', customerController.getCustomerItems);
router.post('/customers/:id/items', customerController.addCustomerItem);
router.delete('/customers/:id/items', customerController.deleteCustomerItem);

// Items
router.get('/items', itemController.listItems);
router.post('/items', itemController.createItem);
router.get('/items/pricing', itemController.listPricingItems);
router.get('/items/filter-options', itemController.getFilterOptions);
router.post('/items/import', itemController.importPricing);
router.get('/items/:id', itemController.getItem);
router.get('/items/:itemCode/history', itemController.getItemHistory);
router.put('/items/:id', itemController.updateItem);
router.post('/items/:id/map-vendors', itemController.mapItemToVendors);
router.get('/items/:id/bom', itemController.getItemBom);
router.get('/items/weight-drawings/:itemCode', weightDrawingController.getWeightDrawingsHandler);
router.post('/items/weight-drawings', weightDrawingController.saveWeightDrawingsHandler);


// Pricing batches
router.get('/pricing/batches', pricingController.listBatches);
router.post('/pricing/batches', pricingController.createBatch);
router.get('/pricing/batches/:id', pricingController.getBatch);
router.get('/pricing/batches/:id/items', pricingController.getBatchItems);
router.post('/pricing/batches/:id/approve', pricingController.approveBatch);
router.post('/pricing/batches/:id/revert', pricingController.revertBatch);
router.patch('/pricing/batches/:id/reject', pricingController.rejectBatch);
router.patch('/pricing/batches/:id/submit', pricingController.submitBatch);
router.delete('/pricing/batches/:id', pricingController.deleteBatch);

// Price log
router.get('/pricing/log/filters', pricingController.getPriceLogFilters);
router.get('/pricing/log', pricingController.getPriceLog);

// Item Pricing Approvals
router.get('/pricing/item-approvals', pricingController.getItemApprovals);
router.post('/pricing/item-approvals/approve', pricingController.approveItems);
router.post('/pricing/item-approvals/hold', pricingController.holdItems);
router.post('/pricing/item-approvals/dispute', pricingController.disputeItems);
router.post('/pricing/disputes/raise-from-master', pricingController.raiseDisputeFromMaster);
router.post('/pricing/items/approve-from-master', pricingController.approveItemFromMaster);
router.get('/pricing/disputes', pricingController.getDisputes);
router.post('/pricing/disputes/:id/revise', pricingController.reviseDispute);
router.put('/pricing/batches/items/:id', pricingController.updateBatchItem);

// Price Audit (Customer + Vendor Pricing)
router.get('/pricing/audit/items', pricingController.getPricingAudit);
router.get('/pricing/audit/approved-items', pricingController.getApprovedAudit);
router.get('/pricing/audit/items/details', pricingController.getItemPricingDetails);
router.post('/pricing/audit/items/approve', pricingController.approvePricingItem);
router.post('/pricing/sap/push-approved', pricingController.pushApprovedItemsToSap);
router.get('/pricing/sap/sync-status', pricingController.getSyncStatus);

// Order Price Auditing
router.get('/pricing/audit/po', pricingController.getPoPriceAudit);
router.post('/pricing/audit/po/:docEntry/:lineNum/verify', pricingController.verifyPoLine);
router.get('/pricing/audit/so', pricingController.getSoPriceAudit);

// Pricing Comparison (SAP invoices vs App master prices)
router.get('/pricing/comparison/filters', pricingController.getPricingComparisonFilters);
router.get('/pricing/comparison', pricingController.getPricingComparison);

// SAP Sync
router.post('/sap/sync/vendor-price', sapSyncController.pushVendorPrice);
router.post('/sap/sync/customer-price', sapSyncController.pushCustomerPrice);
router.post('/sap/sync/batch/:batchId', sapSyncController.pushBatchToSap);
router.post('/sap/sync/approved-items', sapSyncController.pushApprovedItemsToSap);
router.post('/sap/sync/check-existence', sapSyncController.checkExistenceInSap);
router.get('/sap/sync/status', sapSyncController.getSyncStatus);
router.get('/sap/sync/latest-push', sapSyncController.getLatestPushDate);

// Management module
router.get('/management/users', managementController.listUsers);
router.post('/management/users', managementController.createUser);
router.put('/management/users/:id', managementController.updateUser);
router.delete('/management/users/:id', managementController.deleteUser);
router.post('/management/users/:id/reset-password', managementController.resetPassword);

router.get('/management/roles', managementController.listRoles);
router.post('/management/roles', managementController.createRole);
router.put('/management/roles/:id', managementController.updateRole);
router.delete('/management/roles/:id', managementController.deleteRole);
router.post('/management/roles/:id/clone', managementController.cloneRole);
router.get('/management/roles/:id/permissions', managementController.getRolePermissions);
router.put('/management/roles/:id/permissions', managementController.updateRolePermissions);

router.get('/management/screens', managementController.listScreens);
router.put('/management/screens/:id', managementController.updateScreen);
router.put('/management/screens/reorder', managementController.reorderScreens);

router.get('/management/apis', managementController.listApis);
router.get('/management/permissions-matrix', managementController.getPermissionsMatrix);
router.get('/management/api-permissions-matrix', managementController.getApiPermissionsMatrix);
router.get('/management/audit-logs', managementController.listAuditLogs);

