/** Shapes returned by the van_sales Frappe app. */

export type Persona =
  | 'van'
  | 'pre_sales'
  | 'team_leader'
  | 'driver'
  | 'store'
  | 'management';

export interface Tab {
  route: string;
  label: string;
  icon: string;
}

export interface VanProfile {
  profile: string;
  company: string;
  warehouse: string;
  warehouse_name: string;
  source_warehouse: string | null;
  vehicle: string | null;
  driver: string | null;
  currency: string;
  price_list: string;
  cost_center: string | null;
  taxes_and_charges: string | null;
  update_stock_on_invoice: boolean;
  payment_modes: {
    mode_of_payment: string;
    default_account: string | null;
    is_default: 0 | 1;
  }[];
}

export interface Policy {
  barcode_scanning: boolean;
  require_scan_to_add_item: boolean;
  manual_item_search: boolean;
  offline_window_hours: number;
  max_queue_age_hours: number;
  capture_gps: boolean;
  gps_max_accuracy_meters: number;
  block_over_credit_limit: boolean;
  payment_on_invoice: boolean;
  customer_creation_needs_approval: boolean;
}

export interface Bootstrap {
  user: {
    id: string;
    full_name: string;
    image: string | null;
    language: string;
    time_zone: string;
    roles: string[];
  };
  personas: Persona[];
  active_persona: Persona;
  home: string;
  tabs: Record<string, Tab[]>;
  vans: VanProfile[];
  defaults: {
    company: string | null;
    currency: string | null;
    country: string | null;
    date_format: string;
    float_precision: number;
    currency_precision: number;
  };
  policy: Policy;
  server_time: string;
}

export type AgeingBucket = 'current' | '1-30' | '31-60' | '60+';
export type Ageing = Record<AgeingBucket, number>;

export interface CustomerRow {
  name: string;
  customer_name: string;
  customer_group: string | null;
  territory: string | null;
  payment_terms: string | null;
  tax_id: string | null;
  mobile_no: string | null;
  outstanding: number;
  overdue: number;
  open_invoices: number;
  overdue_invoices: number;
  oldest_due_date: string | null;
  ageing: Ageing;
  credit_limit: number;
  credit_headroom: number | null;
}

export interface CustomerList {
  customers: CustomerRow[];
  total: number;
  company: string;
  totals: { outstanding: number; overdue: number; ageing: Ageing };
}

export interface CustomerSnapshot extends CustomerRow {
  default_price_list: string | null;
  blocked: boolean;
}

export interface CatalogItem {
  item_code: string;
  item_name: string;
  description: string | null;
  item_group: string | null;
  image: string | null;
  stock_uom: string;
  uom: string;
  conversion_factor: number;
  rate: number;
  net_rate: number;
  has_batch_no: 0 | 1;
  has_serial_no: 0 | 1;
  item_tax_template: string | null;
  van_qty: number;
}

export interface BarcodeHit {
  found: boolean;
  barcode: string;
  barcode_type?: string | null;
  item?: CatalogItem;
}

export interface OpenInvoice {
  name: string;
  posting_date: string;
  due_date: string;
  grand_total: number;
  outstanding_amount: number;
  currency: string;
  days_overdue: number;
  bucket: AgeingBucket;
}

export interface StatementLine {
  doctype: string;
  name: string;
  date: string;
  due_date?: string;
  amount: number;
  paid: number;
  balance: number;
  partial: boolean;
  state: string;
  mode_of_payment?: string | null;
  reference_no?: string | null;
  unallocated?: number;
}

export interface Statement {
  customer: string;
  billed: number;
  paid: number;
  outstanding: number;
  lines: StatementLine[];
}

export interface PostedDoc {
  name: string;
  doctype: string;
  docstatus: number;
  duplicate: boolean;
  is_paid?: boolean;
  status?: string;
  change_amount?: number;
  grand_total?: number;
  outstanding_amount?: number;
  paid_amount?: number;
  unallocated_amount?: number;
  is_post_dated?: boolean;
  currency?: string;
  posting_date?: string;
}

export interface PrintPayload {
  name: string;
  posting_date: string;
  posting_time: string;
  due_date: string | null;
  status: string;
  docstatus: number;
  is_pos: number;
  paid_amount: number;
  change_amount: number;
  payments: { mode_of_payment: string; amount: number; reference_no: string | null }[];
  company: { company_name: string; tax_id: string | null; phone_no: string | null };
  customer: string;
  customer_name: string;
  customer_tax_id: string | null;
  currency: string;
  items: {
    item_code: string;
    item_name: string;
    qty: number;
    uom: string;
    rate: number;
    amount: number;
  }[];
  taxes: { description: string; amount: number }[];
  net_total: number;
  total_taxes: number;
  grand_total: number;
  rounded_total: number;
  outstanding_amount: number;
  is_return: number;
}

export interface Quote {
  net_total: number;
  total_taxes: number;
  grand_total: number;
  rounded_total: number;
  currency: string;
  items: {
    item_code: string;
    item_name: string;
    qty: number;
    uom: string;
    rate: number;
    amount: number;
  }[];
  taxes: { description: string; rate: number; amount: number }[];
  credit: {
    limit: number;
    outstanding: number;
    balance_after: number;
    over_limit: boolean;
    over_by: number;
    blocks_credit_sale: boolean;
  };
}

export interface ProfileUser {
  name: string;
  email: string;
  full_name: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  username: string | null;
  phone: string | null;
  mobile_no: string | null;
  gender: string | null;
  birth_date: string | null;
  location: string | null;
  bio: string | null;
  interest: string | null;
  language: string | null;
  time_zone: string | null;
  user_image: string | null;
  last_active: string | null;
  last_login: string | null;
  enabled: 0 | 1;
}

export interface ProfileEmployee {
  name: string;
  employee_name: string | null;
  designation: string | null;
  department: string | null;
  branch: string | null;
  company: string | null;
  date_of_joining: string | null;
  employment_type: string | null;
  grade: string | null;
  reports_to: string | null;
  reports_to_name?: string | null;
  status: string | null;
  image: string | null;
  holiday_list: string | null;
  cell_number: string | null;
  personal_email: string | null;
  current_address: string | null;
  emergency_phone_number: string | null;
  person_to_be_contacted: string | null;
  relation: string | null;
}

export interface Profile {
  user: ProfileUser;
  employee: ProfileEmployee | null;
  van: VanProfile | null;
  roles: string[];
  /** Which fields the server will actually accept a write for. */
  editable: { user: string[]; employee: string[] };
  updated?: { user: string[]; employee: string[] };
}
