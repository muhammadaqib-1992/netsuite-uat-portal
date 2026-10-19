// Invented demo data for `npm run dev` and the demo build. Generic NetSuite flows; no client data.
import type { CaseStatus, CommentType, CycleStatus, Level } from '../types';

export interface DemoPerson {
  id: number;
  name: string;
  team: boolean;
}

export const PEOPLE: Record<string, DemoPerson> = {
  taylor: { id: 11, name: 'Taylor Reed', team: true },
  morgan: { id: 12, name: 'Morgan Diaz', team: true },
  chris: { id: 21, name: 'Chris Walker', team: false },
  jordan: { id: 22, name: 'Jordan Lee', team: false },
  sam: { id: 23, name: 'Sam Patel', team: false },
  maria: { id: 24, name: 'Maria Lopez', team: false },
};

/** Who the demo signs in as for each access level. */
export const DEMO_USER: Record<Level, keyof typeof PEOPLE> = { team: 'taylor', lead: 'chris', tester: 'jordan' };

export interface DemoComment {
  by: keyof typeof PEOPLE;
  type?: CommentType;
  text: string;
  /** Hours before now. */
  ago: number;
  replies?: DemoComment[];
}

export interface DemoCase {
  ref: string;
  module: string;
  scenario: string;
  precond: string;
  testData: string;
  steps: string[];
  expected: string;
  assigned: keyof typeof PEOPLE;
  status: CaseStatus;
  actual?: string;
  defect?: string;
  /** Hours before now that it was executed. */
  ran?: number;
  comments?: DemoComment[];
}

export interface DemoCycle {
  name: string;
  env: string;
  start: string;
  end: string;
  status: CycleStatus;
  owner: keyof typeof PEOPLE;
  sourceFile: string;
  sheetName: string;
  cases: DemoCase[];
}

export const DEMO_CYCLES: DemoCycle[] = [
  {
    name: 'UAT Round 1 · Order to Cash',
    env: 'Sandbox 1',
    start: '2026-10-12',
    end: '2026-10-30',
    status: 'Active',
    owner: 'taylor',
    sourceFile: 'uat-order-to-cash.xlsx',
    sheetName: 'Test Cases',
    cases: [
      {
        ref: 'O2C-001', module: 'Customer', scenario: 'Create a new customer with default terms and credit limit',
        precond: 'User has the Sales Manager role.', testData: 'Customer: Sample Customer 01\nSubsidiary: Main\nTerms: Net 30',
        steps: ['Go to Lists > Relationships > Customers > New', 'Enter the company name and subsidiary', 'Set terms and a 50,000 credit limit', 'Save'],
        expected: 'Customer saves with Net 30 terms and the credit limit shown on the Financial subtab.',
        assigned: 'jordan', status: 'Pass', actual: 'Saved as expected.', ran: 150,
      },
      {
        ref: 'O2C-002', module: 'Customer', scenario: 'Duplicate detection warns on a matching customer name',
        precond: 'Duplicate detection is enabled.', testData: 'Customer: Sample Customer 01 (already exists)',
        steps: ['Create a new customer with the same name as O2C-001', 'Save'],
        expected: 'A duplicate warning appears and the user can merge or keep both.',
        assigned: 'jordan', status: 'Pass', actual: 'Warning shown with merge option.', ran: 148,
      },
      {
        ref: 'O2C-003', module: 'Sales Order', scenario: 'Create a sales order for a stock item',
        precond: 'Customer and item exist; item has stock in Main Warehouse.', testData: 'Item: Sample Item A\nQty: 5\nLocation: Main Warehouse',
        steps: ['Go to Transactions > Sales > Enter Sales Orders', 'Select the customer', 'Add Sample Item A, quantity 5', 'Save'],
        expected: 'Order saves as Pending Fulfilment with correct tax and totals.',
        assigned: 'sam', status: 'Pass', actual: 'Order SO-1042 created, totals correct.', ran: 120,
      },
      {
        ref: 'O2C-004', module: 'Sales Order', scenario: 'Discount above 20% routes the order for approval',
        precond: 'Sales order approval workflow is active.', testData: 'Discount: 25% line discount',
        steps: ['Create a sales order', 'Add a 25% discount line', 'Save'],
        expected: 'Order status is Pending Approval and the approver receives a notification.',
        assigned: 'sam', status: 'Fail', actual: 'Order saved as Pending Fulfilment; no approval was requested.', defect: 'DEF-118', ran: 96,
        comments: [
          {
            by: 'sam', type: 'Fail Reason', text: 'The order skipped approval completely. Tried twice with 25% and 30% discounts.', ago: 96,
            replies: [
              { by: 'taylor', text: 'Thanks Sam. The workflow condition reads the header discount only, not line discounts. Fix is in progress.', ago: 90 },
              { by: 'sam', text: 'Understood. Let me know when to retest.', ago: 89 },
            ],
          },
        ],
      },
      {
        ref: 'O2C-005', module: 'Sales Order', scenario: 'Credit hold blocks an order over the credit limit',
        precond: 'Customer balance is above the credit limit.', testData: 'Customer: Sample Customer 02',
        steps: ['Create a sales order for Sample Customer 02', 'Save'],
        expected: 'A credit limit warning appears and the order is placed on hold.',
        assigned: 'maria', status: 'Pass', actual: 'Warning displayed and order on hold.', ran: 70,
      },
      {
        ref: 'O2C-006', module: 'Fulfilment', scenario: 'Pick, pack and ship a sales order in full',
        precond: 'Approved sales order from O2C-003.', testData: 'Order: SO-1042',
        steps: ['Open the sales order', 'Click Fulfil', 'Mark as Picked, Packed, then Shipped', 'Save'],
        expected: 'Item fulfilment is created and the order moves to Pending Billing.',
        assigned: 'maria', status: 'Pass', actual: 'Fulfilment IF-311 created.', ran: 66,
      },
      {
        ref: 'O2C-007', module: 'Fulfilment', scenario: 'Partial fulfilment leaves a back-order',
        precond: 'Only 3 of 5 units on hand.', testData: 'Item: Sample Item B',
        steps: ['Fulfil 3 of 5 units', 'Save'],
        expected: 'Order shows Partially Fulfilled with 2 units back-ordered.',
        assigned: 'maria', status: 'In Progress', ran: 20,
        comments: [{ by: 'maria', type: 'Clarification', text: 'Should the back-ordered units reserve stock automatically when it arrives?', ago: 19 }],
      },
      {
        ref: 'O2C-008', module: 'Fulfilment', scenario: 'Shipping label prints with the carrier tracking number',
        precond: 'Carrier integration configured in the sandbox.', testData: 'Carrier: Sample Carrier Ground',
        steps: ['Open a packed fulfilment', 'Click Print Label'],
        expected: 'Label PDF opens with a tracking number that is stored on the fulfilment.',
        assigned: 'jordan', status: 'Blocked', actual: 'Carrier credentials are not set up in Sandbox 1, so labels cannot print.', ran: 44,
        comments: [
          {
            by: 'jordan', type: 'Fail Reason', text: 'Blocked until the carrier account is connected in the sandbox.', ago: 44,
            replies: [{ by: 'morgan', text: 'Requested sandbox credentials from the carrier. Expected by Friday.', ago: 30 }],
          },
        ],
      },
      {
        ref: 'O2C-009', module: 'Invoicing', scenario: 'Bill a fulfilled sales order',
        precond: 'Order is Pending Billing.', testData: 'Order: SO-1042',
        steps: ['Open the sales order', 'Click Bill', 'Check totals and save'],
        expected: 'Invoice is created with the same totals and tax as the order.',
        assigned: 'sam', status: 'Pass', actual: 'Invoice INV-2207 created.', ran: 60,
      },
      {
        ref: 'O2C-010', module: 'Invoicing', scenario: 'Invoice email uses the standard template and attaches the PDF',
        precond: 'Email template deployed.', testData: 'Invoice: INV-2207',
        steps: ['Open the invoice', 'Click Email', 'Review the preview and send to a test inbox'],
        expected: 'Email uses the standard template with the company logo and PDF attached.',
        assigned: 'sam', status: 'Fail', actual: 'Email arrives without the PDF attachment.', defect: 'DEF-121', ran: 40,
        comments: [
          {
            by: 'sam', type: 'Fail Reason', text: 'No attachment on the email. The template preview does show it.', ago: 40,
            replies: [
              { by: 'taylor', text: 'The attach-PDF preference is off for this subsidiary. Turned it on; please retest.', ago: 6 },
            ],
          },
        ],
      },
      {
        ref: 'O2C-011', module: 'Invoicing', scenario: 'Consolidated invoice for multiple orders',
        precond: 'Two orders pending billing for the same customer.', testData: 'Orders: SO-1050, SO-1051',
        steps: ['Go to Transactions > Sales > Bill Sales Orders', 'Select both orders', 'Submit'],
        expected: 'One invoice covers both orders.',
        assigned: 'chris', status: 'N/A', actual: 'Consolidated invoicing is out of scope for phase 1.', ran: 50,
      },
      {
        ref: 'O2C-012', module: 'Payments', scenario: 'Apply a customer payment to a single invoice',
        precond: 'Open invoice exists.', testData: 'Amount: full invoice balance',
        steps: ['Go to Transactions > Customers > Accept Customer Payments', 'Select the customer', 'Apply to INV-2207 and save'],
        expected: 'Invoice status is Paid In Full.',
        assigned: 'jordan', status: 'Pass', actual: 'Invoice paid in full.', ran: 30,
      },
      {
        ref: 'O2C-013', module: 'Payments', scenario: 'Short payment leaves the remaining balance open',
        precond: 'Open invoice exists.', testData: 'Amount: 50% of balance',
        steps: ['Accept a payment for half the balance', 'Save'],
        expected: 'Invoice stays Open with the remaining balance due.',
        assigned: 'jordan', status: 'Pass', actual: 'Remaining balance shown correctly.', ran: 28,
      },
      {
        ref: 'O2C-014', module: 'Payments', scenario: 'Customer deposit is applied when the invoice is created',
        precond: 'Deposit recorded against the sales order.', testData: 'Deposit: 1,000.00',
        steps: ['Record a customer deposit on a sales order', 'Fulfil and bill the order', 'Open the invoice'],
        expected: 'Deposit is applied automatically and the balance is reduced.',
        assigned: 'chris', status: 'Fail', actual: 'Deposit sits unapplied; invoice shows the full amount due.', defect: 'DEF-124', ran: 18,
        comments: [{ by: 'chris', type: 'Fail Reason', text: 'Deposit was not applied. Our finance team needs this for prepaid orders.', ago: 18 }],
      },
      {
        ref: 'O2C-015', module: 'Returns', scenario: 'Return authorisation and credit memo for one unit',
        precond: 'Paid invoice exists.', testData: 'Return: 1 unit of Sample Item A',
        steps: ['Open the sales order', 'Click Authorise Return', 'Receive the return', 'Issue a credit memo'],
        expected: 'Credit memo is created for one unit and stock increases by one.',
        assigned: 'maria', status: 'In Progress', ran: 4,
      },
      {
        ref: 'O2C-016', module: 'Returns', scenario: 'Refund a credit memo to the original payment method',
        precond: 'Credit memo from O2C-015.', testData: '',
        steps: ['Open the credit memo', 'Click Refund', 'Save'],
        expected: 'Customer refund is created and the credit memo is fully applied.',
        assigned: 'maria', status: 'Not Started',
      },
      {
        ref: 'O2C-017', module: 'Reporting', scenario: 'A/R ageing shows the short-paid balance',
        precond: 'Short payment from O2C-013.', testData: '',
        steps: ['Go to Reports > Customers/Receivables > A/R Ageing', 'Run for today'],
        expected: 'The customer balance appears in the 0–30 days column.',
        assigned: 'chris', status: 'Not Started',
        comments: [{ by: 'chris', type: 'Clarification', text: 'Which report layout should we use, the standard one or the saved finance version?', ago: 26 }],
      },
      {
        ref: 'O2C-018', module: 'Reporting', scenario: 'Sales by item summary matches the orders entered',
        precond: 'Orders from this cycle are billed.', testData: 'Period: current month',
        steps: ['Go to Reports > Sales > Sales by Item Summary', 'Filter to the current month'],
        expected: 'Quantities and amounts match the orders created in this cycle.',
        assigned: 'sam', status: 'Pass', actual: 'Figures match.', ran: 8,
      },
    ],
  },
  {
    name: 'UAT Round 1 · Procure to Pay',
    env: 'Sandbox 1',
    start: '2026-10-14',
    end: '2026-10-31',
    status: 'Active',
    owner: 'morgan',
    sourceFile: 'uat-procure-to-pay.xlsx',
    sheetName: 'UAT Scripts',
    cases: [
      {
        ref: 'P2P-001', module: 'Vendor', scenario: 'Create a vendor with payment terms and bank details',
        precond: 'User has the A/P Clerk role.', testData: 'Vendor: Sample Vendor 01\nTerms: Net 45',
        steps: ['Go to Lists > Relationships > Vendors > New', 'Enter name, subsidiary and terms', 'Add bank details', 'Save'],
        expected: 'Vendor saves with Net 45 terms.', assigned: 'maria', status: 'Pass', actual: 'Vendor created.', ran: 100,
      },
      {
        ref: 'P2P-002', module: 'Requisition', scenario: 'Employee raises a purchase requisition',
        precond: 'Requisitions enabled.', testData: 'Item: Sample Item C, Qty 10',
        steps: ['Go to Transactions > Purchases > Enter Requisitions', 'Add the item', 'Submit'],
        expected: 'Requisition is Pending Approval.', assigned: 'jordan', status: 'Pass', actual: 'Requisition REQ-77 pending approval.', ran: 90,
      },
      {
        ref: 'P2P-003', module: 'Purchase Order', scenario: 'Approved requisition becomes a linked purchase order',
        precond: 'Requisition from P2P-002 approved.', testData: '',
        steps: ['Approve the requisition', 'Create the purchase order from it'],
        expected: 'Purchase order is created and linked to the requisition.',
        assigned: 'jordan', status: 'Fail', actual: 'PO created but the requisition link is missing.', defect: 'DEF-130', ran: 80,
        comments: [
          {
            by: 'jordan', type: 'Fail Reason', text: 'The Related Records subtab on the PO is empty.', ago: 80,
            replies: [
              { by: 'morgan', text: 'Reproduced. The custom form hides the link field. Form updated in the sandbox.', ago: 50 },
              { by: 'morgan', type: 'Resolution', text: 'Please retest with the updated Purchase Order form.', ago: 49 },
            ],
          },
        ],
      },
      {
        ref: 'P2P-004', module: 'Purchase Order', scenario: 'PO above 10,000 needs a second approval',
        precond: 'Approval rules configured.', testData: 'Amount: 12,500.00',
        steps: ['Create a PO above the threshold', 'Submit for approval'],
        expected: 'PO routes to the second approver after the first approval.',
        assigned: 'sam', status: 'In Progress', ran: 10,
      },
      {
        ref: 'P2P-005', module: 'Receiving', scenario: 'Receive a purchase order in full',
        precond: 'Approved PO.', testData: '',
        steps: ['Open the PO', 'Click Receive', 'Save'],
        expected: 'Item receipt is created and stock increases.', assigned: 'maria', status: 'Pass', actual: 'Receipt IR-58 created.', ran: 46,
      },
      {
        ref: 'P2P-006', module: 'Receiving', scenario: 'Partial receipt keeps the PO open',
        precond: 'Approved PO for 4 units.', testData: 'Receive 2 of 4',
        steps: ['Receive 2 units', 'Save'],
        expected: 'PO shows Partially Received.', assigned: 'maria', status: 'Pass', actual: 'Status correct.', ran: 45,
      },
      {
        ref: 'P2P-007', module: 'Bills', scenario: 'Three-way match on the vendor bill',
        precond: 'Receipt exists.', testData: '',
        steps: ['Bill the PO', 'Compare quantities and prices with the receipt'],
        expected: 'Bill matches PO and receipt with no variance.',
        assigned: 'sam', status: 'Blocked', actual: 'Matching tolerances are not configured yet.', ran: 36,
        comments: [{ by: 'sam', type: 'Fail Reason', text: 'Cannot test until tolerances are set up.', ago: 36 }],
      },
      {
        ref: 'P2P-008', module: 'Bills', scenario: 'Duplicate vendor invoice number is rejected',
        precond: 'A bill with reference INV-9001 exists.', testData: 'Reference: INV-9001',
        steps: ['Enter a new bill with the same vendor and reference', 'Save'],
        expected: 'NetSuite warns about a duplicate reference number.', assigned: 'jordan', status: 'Pass', actual: 'Warning shown.', ran: 24,
      },
      {
        ref: 'P2P-009', module: 'Payments', scenario: 'Pay a vendor bill by bank transfer',
        precond: 'Approved bill.', testData: '',
        steps: ['Go to Transactions > Payables > Pay Bills', 'Select the bill', 'Submit'],
        expected: 'Bill status is Paid In Full.', assigned: 'chris', status: 'Not Started',
      },
      {
        ref: 'P2P-010', module: 'Payments', scenario: 'Payment file exports in the bank format',
        precond: 'Electronic payments configured.', testData: '',
        steps: ['Create a payment batch', 'Export the payment file'],
        expected: 'File downloads in the agreed bank format.', assigned: 'chris', status: 'Not Started',
      },
      {
        ref: 'P2P-011', module: 'Reporting', scenario: 'A/P ageing shows open bills',
        precond: 'Unpaid bill exists.', testData: '',
        steps: ['Run the A/P Ageing report'],
        expected: 'Bill appears in the correct ageing bucket.', assigned: 'maria', status: 'N/A', actual: 'Covered by the finance reporting cycle.', ran: 20,
      },
      {
        ref: 'P2P-012', module: 'Reporting', scenario: 'Open purchase orders report',
        precond: 'Open POs exist.', testData: '',
        steps: ['Run Reports > Purchases > Open Purchase Orders'],
        expected: 'All open POs from this cycle are listed.', assigned: 'sam', status: 'Not Started',
      },
    ],
  },
  {
    name: 'UAT Round 1 · Record to Report',
    env: 'Sandbox 1',
    start: '2026-11-02',
    end: '2026-11-13',
    status: 'Planned',
    owner: 'taylor',
    sourceFile: 'uat-record-to-report.xlsx',
    sheetName: 'Test Cases',
    cases: [
      { ref: 'R2R-001', module: 'Journals', scenario: 'Post a manual journal entry with approval', precond: 'Journal approval enabled.', testData: 'Amount: 2,500.00', steps: ['Enter a journal', 'Submit for approval', 'Approve'], expected: 'Journal posts after approval.', assigned: 'chris', status: 'Not Started' },
      { ref: 'R2R-002', module: 'Journals', scenario: 'Reversing journal posts on the first day of next period', precond: '', testData: '', steps: ['Create a journal with a reversal date', 'Save'], expected: 'Reversal is created for the next period.', assigned: 'chris', status: 'Not Started' },
      { ref: 'R2R-003', module: 'Period Close', scenario: 'Close checklist locks A/R and A/P', precond: 'All transactions posted.', testData: '', steps: ['Open Manage Accounting Periods', 'Run the close checklist'], expected: 'A/R and A/P are locked for the period.', assigned: 'maria', status: 'Not Started' },
      { ref: 'R2R-004', module: 'Period Close', scenario: 'Revaluation of open foreign currency balances', precond: 'Foreign currency transactions exist.', testData: '', steps: ['Run Revalue Open Currency Balances'], expected: 'Unrealised gain/loss journal is posted.', assigned: 'maria', status: 'Not Started' },
      { ref: 'R2R-005', module: 'Reporting', scenario: 'Income statement matches the trial balance', precond: 'Period closed.', testData: '', steps: ['Run the income statement', 'Compare with the trial balance'], expected: 'Net income agrees.', assigned: 'sam', status: 'Not Started' },
      { ref: 'R2R-006', module: 'Reporting', scenario: 'Balance sheet by subsidiary', precond: '', testData: '', steps: ['Run the balance sheet', 'Filter by subsidiary'], expected: 'Each subsidiary balances.', assigned: 'sam', status: 'Not Started' },
    ],
  },
];
