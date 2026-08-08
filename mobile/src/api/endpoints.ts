/** Typed wrappers over the van_sales whitelisted methods. */

import { call, type Credentials } from './client';
import type {
  BarcodeHit,
  Bootstrap,
  CatalogItem,
  CustomerList,
  CustomerSnapshot,
  OpenInvoice,
  PostedDoc,
  PrintPayload,
  Profile,
  Quote,
  Statement,
} from './types';

const M = 'van_sales.api';

export const api = (cred: Credentials) => ({
  bootstrap: () => call<Bootstrap>(`${M}.session.bootstrap`, { credentials: cred }),

  ping: () =>
    call<{ user: string; server_time: string }>(`${M}.auth.ping`, { credentials: cred }),

  listCustomers: (args: {
    search?: string;
    scope?: 'all' | 'due' | 'overdue';
    include_team?: 0 | 1;
    limit?: number;
    start?: number;
    company?: string;
  }) => call<CustomerList>(`${M}.customers.list_customers`, { credentials: cred, args }),

  customerSnapshot: (customer: string, company?: string) =>
    call<CustomerSnapshot>(`${M}.customers.snapshot`, {
      credentials: cred,
      args: { customer, company },
    }),

  statement: (customer: string, company?: string) =>
    call<Statement>(`${M}.customers.statement`, {
      credentials: cred,
      args: { customer, company },
    }),

  openInvoices: (customer: string, company?: string) =>
    call<{ invoices: OpenInvoice[] }>(`${M}.customers.open_invoices`, {
      credentials: cred,
      args: { customer, company },
    }),

  resolveBarcode: (args: {
    barcode: string;
    warehouse?: string;
    customer?: string;
    price_list?: string;
    company?: string;
    currency?: string;
  }) => call<BarcodeHit>(`${M}.catalog.resolve_barcode`, { credentials: cred, args }),

  searchItems: (args: {
    query?: string;
    warehouse?: string;
    customer?: string;
    price_list?: string;
    company?: string;
    currency?: string;
    in_stock_only?: 0 | 1;
    limit?: number;
  }) => call<{ items: CatalogItem[] }>(`${M}.catalog.search_items`, { credentials: cred, args }),

  vanStock: (warehouse: string) =>
    call<{ warehouse: string; items: any[]; total_value: number }>(`${M}.catalog.van_stock`, {
      credentials: cred,
      args: { warehouse },
    }),

  quote: (payload: Record<string, unknown>) =>
    call<Quote>(`${M}.selling.quote`, { credentials: cred, args: { payload } }),

  createInvoice: (payload: Record<string, unknown>) =>
    call<PostedDoc>(`${M}.selling.create_invoice`, {
      credentials: cred,
      method: 'POST',
      args: { payload },
    }),

  createReturn: (payload: Record<string, unknown>) =>
    call<PostedDoc>(`${M}.selling.create_return`, {
      credentials: cred,
      method: 'POST',
      args: { payload },
    }),

  invoiceForPrint: (name: string) =>
    call<PrintPayload>(`${M}.selling.invoice_for_print`, { credentials: cred, args: { name } }),

  createReceipt: (payload: Record<string, unknown>) =>
    call<PostedDoc>(`${M}.payments.create_receipt`, {
      credentials: cred,
      method: 'POST',
      args: { payload },
    }),

  suggestAllocation: (customer: string, amount: number, company?: string) =>
    call<{ allocations: any[]; unallocated: number }>(`${M}.payments.suggest_allocation`, {
      credentials: cred,
      args: { customer, amount, company },
    }),

  getProfile: () => call<Profile>(`${M}.profile.get_profile`, { credentials: cred }),

  updateProfile: (payload: Record<string, unknown>) =>
    call<Profile>(`${M}.profile.update_profile`, {
      credentials: cred,
      method: 'POST',
      args: { payload },
    }),

  changePassword: (args: {
    old_password: string;
    new_password: string;
    logout_other_devices?: 0 | 1;
  }) =>
    call<{ changed: boolean }>(`${M}.profile.change_password`, {
      credentials: cred,
      method: 'POST',
      args,
    }),

  myCollections: (args: { from_date?: string; to_date?: string; company?: string } = {}) =>
    call<{
      entries: any[];
      cash_on_hand: number;
      total_collected: number;
      draft_count: number;
    }>(`${M}.payments.my_collections`, { credentials: cred, args }),
});

export type Api = ReturnType<typeof api>;
