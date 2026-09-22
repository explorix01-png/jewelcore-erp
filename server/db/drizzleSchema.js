import { pgTable, varchar, text, boolean, timestamp, jsonb, numeric, index, uniqueIndex } from 'drizzle-orm/pg-core';

// Auth users table definition in Drizzle
export const authUsers = pgTable('_auth_users', {
  id: varchar('id', { length: 100 }).primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }),
  fullName: varchar('full_name', { length: 255 }),
  role: varchar('role', { length: 50 }).default('user'),
  activeShopRole: varchar('active_shop_role', { length: 50 }).default('staff'),
  onboardingCompleted: boolean('onboarding_completed').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

// Helper to define standard entity table with JSONB and timestamps
function createEntityTable(tableName, indexes = []) {
  return pgTable(tableName, {
    id: varchar('id', { length: 100 }).primaryKey(),
    createdDate: timestamp('created_date', { withTimezone: true }).notNull(),
    updatedDate: timestamp('updated_date', { withTimezone: true }).notNull(),
    data: jsonb('data').notNull()
  });
}

// 29 Entity Table definitions
export const activityLog = createEntityTable('ActivityLog');
export const bill = createEntityTable('Bill');
export const billItem = createEntityTable('BillItem');
export const categoryMaster = createEntityTable('CategoryMaster');
export const customer = createEntityTable('Customer');
export const customerOrder = createEntityTable('CustomerOrder');
export const customerOutstanding = createEntityTable('CustomerOutstanding');
export const dueReminder = createEntityTable('DueReminder');
export const exchangeTransaction = createEntityTable('ExchangeTransaction');
export const gstConfig = createEntityTable('GSTConfig');
export const inventoryItem = createEntityTable('InventoryItem');
export const inventoryTransaction = createEntityTable('InventoryTransaction');
export const itemMaster = createEntityTable('ItemMaster');
export const karagir = createEntityTable('Karagir');
export const karagirOrder = createEntityTable('KaragirOrder');
export const notification = createEntityTable('Notification');
export const payment = createEntityTable('Payment');
export const purchase = createEntityTable('Purchase');
export const purchaseItem = createEntityTable('PurchaseItem');
export const purityMaster = createEntityTable('PurityMaster');
export const rateHistory = createEntityTable('RateHistory');
export const returnTransaction = createEntityTable('ReturnTransaction');
export const shopMembership = createEntityTable('ShopMembership');
export const shopSettings = createEntityTable('ShopSettings');
export const supplier = createEntityTable('Supplier');
export const supplierTransaction = createEntityTable('SupplierTransaction');
export const user = createEntityTable('User');
export const whatsAppConfig = createEntityTable('WhatsAppConfig');
export const whatsAppShare = createEntityTable('WhatsAppShare');

export const schema = {
  authUsers,
  activityLog,
  bill,
  billItem,
  categoryMaster,
  customer,
  customerOrder,
  customerOutstanding,
  dueReminder,
  exchangeTransaction,
  gstConfig,
  inventoryItem,
  inventoryTransaction,
  itemMaster,
  karagir,
  karagirOrder,
  notification,
  payment,
  purchase,
  purchaseItem,
  purityMaster,
  rateHistory,
  returnTransaction,
  shopMembership,
  shopSettings,
  supplier,
  supplierTransaction,
  user,
  whatsAppConfig,
  whatsAppShare
};

export default schema;
