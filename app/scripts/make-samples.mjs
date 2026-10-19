// Writes dummy UAT workbooks to ../sample-data. Invented, generic NetSuite flows only.
// Run: npm run samples
import * as XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

XLSX.set_fs(fs);
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../sample-data');

const instructions = [
  ['How to use this workbook'],
  [''],
  ['1. Execute each test case in the UAT environment.'],
  ['2. Record the status: Not Started, In Progress, Pass, Fail, Blocked or N/A.'],
  ['3. For Fail or Blocked, describe the actual result.'],
  [''],
  ['All data in this workbook is invented for testing the UAT portal.'],
];

function steps(...lines) {
  return lines.map((l, i) => `${i + 1}. ${l}`).join('\n');
}

const o2c = [
  ['O2C-001', 'Customer', 'Create a new customer with default terms', 'Admin access to customers', 'Name: Sample Customer 01', steps('Go to Lists > Relationships > Customers > New', 'Enter the name and subsidiary', 'Save'), 'Customer saves with Net 30 terms', 'High', 'Tester A'],
  ['O2C-002', 'Sales Order', 'Create a sales order for a stock item', 'Customer and item exist', 'Item: Sample Item A, Qty 5', steps('Go to Transactions > Sales > Enter Sales Orders', 'Select the customer', 'Add the item line', 'Save'), 'Order saves as Pending Fulfilment', 'High', 'Tester A'],
  ['O2C-003', 'Sales Order', 'Discount above the approval limit routes for approval', 'Approval workflow active', 'Discount 25%', steps('Create a sales order', 'Apply a 25% discount line', 'Save'), 'Order status is Pending Approval', 'Medium', 'Tester B'],
  ['O2C-004', 'Sales Order', 'Credit hold blocks a new order', 'Customer over credit limit', 'Customer: Sample Customer 02', steps('Create a sales order for the customer', 'Save'), 'Warning shown and order placed on hold', 'Medium', 'Tester B'],
  ['O2C-005', 'Fulfilment', 'Fulfil a sales order in full', 'Approved sales order', '', steps('Open the sales order', 'Click Fulfil', 'Set status to Shipped and save'), 'Item fulfilment created; order is Pending Billing', 'High', 'Tester A'],
  ['O2C-006', 'Fulfilment', 'Partial fulfilment leaves a back-order', 'Approved order, 3 of 5 on hand', '', steps('Fulfil 3 units', 'Save'), 'Order shows Partially Fulfilled with 2 back-ordered', 'Medium', 'Tester C'],
  ['O2C-007', 'Invoicing', 'Bill a fulfilled sales order', 'Order is Pending Billing', '', steps('Open the sales order', 'Click Bill', 'Save the invoice'), 'Invoice created with the correct totals and tax', 'High', 'Tester C'],
  ['O2C-008', 'Invoicing', 'Invoice email uses the standard template', 'Email template set up', '', steps('Open the invoice', 'Click Email', 'Check the preview'), 'Email uses the standard template and attaches the PDF', 'Low', 'Tester B'],
  ['O2C-009', 'Payments', 'Apply a customer payment to one invoice', 'Open invoice exists', 'Amount: full balance', steps('Go to Transactions > Customers > Accept Customer Payments', 'Select the customer', 'Apply to the invoice and save'), 'Invoice status is Paid In Full', 'High', 'Tester A'],
  ['O2C-010', 'Payments', 'Short payment leaves the invoice open', 'Open invoice exists', 'Amount: 50% of balance', steps('Accept a payment for half the balance', 'Save'), 'Invoice remains Open with the remaining balance', 'Medium', 'Tester C'],
  ['O2C-011', 'Returns', 'Create a return authorisation and credit memo', 'Paid invoice exists', 'Return 1 unit', steps('Open the sales order', 'Click Authorise Return', 'Receive and refund'), 'Credit memo created for one unit', 'Medium', 'Tester B'],
  ['O2C-012', 'Reporting', 'A/R ageing shows the open balance', 'Short payment from O2C-010', '', steps('Go to Reports > Customers/Receivables > A/R Ageing', 'Run for today'), 'Customer balance appears in the 0-30 bucket', 'Low', 'Tester A'],
];

const p2p = [
  ['P2P-001', 'Vendor', 'Create a vendor with payment terms', 'Admin access to vendors', 'Name: Sample Vendor 01', steps('Go to Lists > Relationships > Vendors > New', 'Enter name, subsidiary and terms', 'Save'), 'Vendor saves with Net 45 terms', 'Not Started', '', ''],
  ['P2P-002', 'Requisition', 'Employee raises a purchase requisition', 'Requisitions enabled', 'Item: Sample Item B', steps('Go to Transactions > Purchases > Enter Requisitions', 'Add the item', 'Submit'), 'Requisition is Pending Approval', 'Pass', '', ''],
  ['P2P-003', 'Purchase Order', 'Approve a requisition into a purchase order', 'Requisition from P2P-002', '', steps('Approve the requisition', 'Create the purchase order from it'), 'Purchase order created and linked to the requisition', 'Fail', 'PO created without the requisition link', 'DEF-101'],
  ['P2P-004', 'Purchase Order', 'PO above the threshold needs a second approval', 'Approval rules configured', 'Amount above limit', steps('Create a PO above the limit', 'Submit'), 'PO routes to the second approver', 'Not Started', '', ''],
  ['P2P-005', 'Receiving', 'Receive a purchase order in full', 'Approved PO', '', steps('Open the PO', 'Click Receive', 'Save'), 'Item receipt created; stock increases', 'In Progress', '', ''],
  ['P2P-006', 'Receiving', 'Partial receipt keeps the PO open', 'Approved PO', 'Receive 2 of 4', steps('Receive 2 units', 'Save'), 'PO shows Partially Received', 'Not Started', '', ''],
  ['P2P-007', 'Bills', 'Three-way match on vendor bill', 'Receipt exists', '', steps('Bill the PO', 'Compare quantities and prices'), 'Bill matches PO and receipt; no variance', 'Blocked', 'Matching tolerance not configured yet', ''],
  ['P2P-008', 'Payments', 'Pay a vendor bill', 'Approved bill', '', steps('Go to Transactions > Payables > Pay Bills', 'Select the bill', 'Submit'), 'Bill status is Paid In Full', 'Not Started', '', ''],
  ['P2P-009', 'Reporting', 'A/P ageing shows open bills', 'Unpaid bill exists', '', steps('Run the A/P Ageing report'), 'Bill appears in the correct ageing bucket', 'N/A', '', ''],
];

function write(name, sheetName, title, header, rows, cols) {
  const wb = XLSX.utils.book_new();
  const aoa = title ? [[title], [], header, ...rows] : [header, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = cols.map((wch) => ({ wch }));
  if (title) ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instructions), 'Instructions');
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const file = path.join(outDir, name);
  XLSX.writeFile(wb, file);
  console.log('wrote', file);
}

write(
  'sample-order-to-cash.xlsx',
  'Test Cases',
  'UAT – Order to Cash (sample data)',
  ['Case ID', 'Module', 'Scenario', 'Pre-conditions', 'Test Data', 'Steps', 'Expected Result', 'Priority', 'Tester', 'Status', 'Actual Result', 'Defect ID'],
  o2c.map((r) => [...r, '', '', '']),
  [10, 14, 44, 28, 26, 50, 44, 9, 11, 12, 30, 10]
);

write(
  'sample-procure-to-pay.xlsx',
  'UAT Scripts',
  null,
  ['Test ID', 'Process', 'Description', 'Prerequisites', 'Data', 'Test Steps', 'Expected Results', 'Result', 'Actual Results', 'Bug ID'],
  p2p,
  [10, 14, 44, 28, 22, 50, 44, 12, 34, 10]
);

// ---------- multi-sheet workbook (one sheet per module, tracker with formulas, dropdowns) ----------
// Mirrors a common UAT layout: table starts in column B, title row, header on row 2,
// section heading rows between cases, a Results dropdown, and a tracker sheet that counts results.
import ExcelJS from 'exceljs';

const RESULTS = ['Pass', 'Fail', 'Needs Discussion', 'Pending', 'Retest', 'N/A'];
const HEAD = ['No.', 'Scenario', 'Step Name', 'Step Instructions', 'Notes / Prerequisites', 'Expected Results', 'Results\n(Pass / Fail / N/A)', 'Role', 'Actual Results & Date', 'Comments'];
const web = {
  'Home Page': [
    ['Hero Banner', [['Banner rotates through slides', 'Open the home page.\nWait 10 seconds.', 'Guest visitor', 'Slides change automatically and arrows work.']]],
    ['Featured Products', [['Featured products show prices', 'Scroll to Featured Products.', 'Signed-in customer', 'Each product shows image, name and price.'], ['Guest sees no prices', 'Sign out and open the home page.', 'Guest visitor', 'Prices are replaced by "Sign in for pricing".']]],
  ],
  Search: [
    ['Keyword Search', [['Search by item name', 'Type "Sample Lamp" in search and press Enter.', '', 'Matching items are listed first.'], ['No results message', 'Search for "zzzz".', '', 'A friendly no-results message appears.']]],
  ],
  'Cart and Checkout': [
    ['Cart', [['Add an item to the cart', 'Open a product page.\nClick Add to Cart.', 'Signed-in customer', 'Cart count increases by one.']]],
    ['Checkout', [['Place an order on account', 'Go to checkout.\nChoose Pay on Account.\nSubmit.', 'Customer with terms', 'Order confirmation page shows the order number.'], ['Card payment is hidden for account customers', 'Go to checkout as an account customer.', 'Customer with terms', 'Credit card option is not shown.']]],
  ],
  'My Account': [
    ['Order History', [['View past orders', 'Open My Account > Orders.', 'Signed-in customer', 'Orders list shows the last 12 months.']]],
    ['Invoices', [['Download an invoice PDF', 'Open My Account > Invoices.\nClick Download.', 'Signed-in customer', 'Invoice PDF downloads.']]],
  ],
};

const xb = new ExcelJS.Workbook();
const tracker = xb.addWorksheet('UAT Tracker');
tracker.getCell('A1').value = 'Web Store UAT (sample data)';
tracker.getCell('A1').font = { bold: true, size: 14 };
tracker.addRow([]);
const tHead = ['Worksheet', 'Total', ...RESULTS, 'Not Run'];
tracker.getRow(2).values = tHead;
tracker.getRow(2).font = { bold: true };
const names = Object.keys(web);
names.forEach((n, i) => {
  const r = 4 + i;
  const q = `'${n}'`;
  tracker.getRow(r).values = [n, { formula: `COUNTA(${q}!B3:B200)-COUNTIF(${q}!B3:B200,"* *")` }];
  RESULTS.forEach((res, j) => {
    tracker.getRow(r).getCell(3 + j).value = { formula: `COUNTIF(${q}!H3:H200,"${res}")` };
  });
  tracker.getRow(r).getCell(3 + RESULTS.length).value = { formula: `B${r}-SUM(C${r}:${String.fromCharCode(66 + RESULTS.length)}${r})` };
});
tracker.getRow(3).values = ['All', { formula: `SUM(B4:B${3 + names.length})` }];
tracker.columns.forEach((c) => (c.width = 16));

for (const n of names) {
  const ws = xb.addWorksheet(n);
  ws.getColumn(1).width = 3;
  [8, 22, 32, 42, 28, 40, 14, 18, 30, 30].forEach((w, i) => (ws.getColumn(i + 2).width = w));
  ws.mergeCells('B1:K1');
  ws.getCell('B1').value = `Web Store UAT – ${n} (sample data)`;
  ws.getCell('B1').font = { bold: true, size: 14 };
  const hr = ws.getRow(2);
  HEAD.forEach((h, i) => {
    const c = hr.getCell(i + 2);
    c.value = h;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } };
    c.alignment = { wrapText: true, vertical: 'middle' };
  });
  let r = 3;
  web[n].forEach(([section, steps], si) => {
    ws.mergeCells(`B${r}:K${r}`);
    ws.getCell(`B${r}`).value = `${si + 1} ${section}`;
    ws.getCell(`B${r}`).font = { bold: true };
    ws.getCell(`B${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F2' } };
    r++;
    steps.forEach(([name, instr, role, expected], k) => {
      ws.getRow(r).values = [null, `${si + 1}.${k + 1}`, section, name, instr, '- Use the sample web store in the test environment.', expected, null, role, null, null];
      ws.getRow(r).alignment = { wrapText: true, vertical: 'top' };
      ws.getCell(`H${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${RESULTS.join(',')}"`] };
      r++;
    });
  });
}
await xb.xlsx.writeFile(path.join(outDir, 'sample-web-store-multi-sheet.xlsx'));
console.log('wrote', path.join(outDir, 'sample-web-store-multi-sheet.xlsx'));
