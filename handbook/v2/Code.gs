/* ===== ZONE 1 · CONFIG / CẤU HÌNH =====
   BRIEF: Mọi cấu hình nằm ở đây | All config lives here
   EDITABLE: GOOGLE_SHEET_ID, WEB_APP_URL, loại phép, màu email | IDs, leave types, mail colors
   FIX AT: search "CONFIG" */
const GOOGLE_SHEET_ID = '1QJ6a19pNWvgP_-6HlRoHr-8alVZOiQZX6nf93TE8ytw';
const WEB_APP_URL = 'DAN_WEB_APP_URL_VAO_DAY';

const CONFIG = {
  EMAIL_SHEET: 'email',
  // Tên sheet đơn vị = giá trị cột BỘ PHẬN | Unit sheet name = DEPT value
  UNIT_SHEETS: ['ePlus', 'The Wall', 'Bức Tường', 'Nguyễn Mộc', 'Green Wall', 'Engage'],
  LEAVE_TYPES: ['Nghỉ phép', 'Nghỉ không lương'],
  STATUS: { PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối' },
  ACTIVE: 'Active',
  PREFIX: '[CỔNG NGHỈ PHÉP]',
  MAX_REASON: 1000,
  MAX_HANDOVER: 200,
  MSG: {
    NOT_REGISTERED: 'Bạn chưa đăng ký email. Vui lòng liên hệ Phòng Nhân sự để đăng ký email.',
    INACTIVE: 'Email của bạn hiện không hoạt động. Vui lòng liên hệ Phòng Nhân sự.',
    DUPLICATE_HR: 'Dữ liệu đăng ký bị trùng. Vui lòng liên hệ Phòng Nhân sự.',
    BAD_DEPT: 'Bộ phận của bạn chưa được cấu hình. Vui lòng liên hệ Phòng Nhân sự.',
    BAD_INPUT: 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.',
    BAD_RANGE: 'Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.',
    DUP_REQUEST: 'Đơn này đã được gửi trước đó.',
    SYSTEM: 'Có lỗi hệ thống. Vui lòng thử lại sau.',
    SENT: 'Gửi đơn thành công. Đơn đang chờ người duyệt xử lý.',
    DONE: 'Đã duyệt đơn nghỉ phép thành công.',
    HANDLED: 'Đơn này đã được xử lý trước đó.',
    BAD_LINK: 'Liên kết không hợp lệ hoặc đã hết hiệu lực.'
  },
  // Màu dùng trong email/trang duyệt | Colors for emails / approval page
  COLOR: { brand: '#0c2e24', accent: '#b8975a', line: '#e6e1d6', text: '#1a1f1c', white: '#ffffff', muted: '#6b726d' }
};

// Vị trí cột (bắt đầu từ 0) | Column index (0-based)
const EC = { NAME: 1, EMAIL: 2, DEPT: 3, APPROVER: 4, APPROVER_EMAIL: 5, STATUS: 6 };
const UC = { STT: 0, NAME: 1, FROM: 2, TO: 3, DAYS: 4, TYPE: 5, REASON: 6, HANDOVER: 7, APPROVER: 8, STATUS: 9, NOTE: 10 };

/* ===== ZONE 2a · ENTRY POINTS / ĐIỂM VÀO WEB APP =====
   BRIEF: doPost cho form, doGet cho link duyệt | doPost for form, doGet for approve link
   EDITABLE: không | none
   FIX AT: search "doPost" */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === 'verify') return json_(verifyEmail_(data.email));
    if (data.action === 'submit') return json_(submitLeave_(data));
    return json_({ ok: false, message: CONFIG.MSG.BAD_INPUT });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, message: CONFIG.MSG.SYSTEM });
  }
}

// Link trong email chỉ mở trang xác nhận (GET không đổi dữ liệu → bot quét link không tự duyệt)
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action !== 'approve') return page_('Cổng nghỉ phép', '<p>' + esc_(CONFIG.MSG.BAD_LINK) + '</p>');
  const req = loadRequest_(p.sheet, p.stt, p.sig);
  if (req.error) return page_('Cổng nghỉ phép', '<p>' + esc_(req.error) + '</p>');
  const v = req.vals;
  if (norm_(v[UC.STATUS]) !== norm_(CONFIG.STATUS.PENDING)) {
    return page_('Cổng nghỉ phép', '<p>' + esc_(CONFIG.MSG.HANDLED) + '</p>');
  }
  const body = '<h2>Duyệt đơn nghỉ phép</h2>' + infoTable_([
    ['Họ và tên', v[UC.NAME]], ['Bộ phận', req.sheetName],
    ['Nghỉ từ ngày', fmtDate_(v[UC.FROM])], ['Nghỉ đến ngày', fmtDate_(v[UC.TO])],
    ['Tổng số ngày nghỉ', v[UC.DAYS]], ['Loại phép', v[UC.TYPE]]
  ]) + '<p id="m"></p><button id="b" onclick="go()">XÁC NHẬN DUYỆT ĐƠN</button>' +
    '<script>function go(){var b=document.getElementById("b");b.disabled=true;b.textContent="Đang xử lý...";' +
    'google.script.run.withSuccessHandler(function(r){document.getElementById("m").textContent=r.message;b.style.display="none";})' +
    '.withFailureHandler(function(){document.getElementById("m").textContent="Có lỗi xảy ra. Vui lòng thử lại.";b.disabled=false;b.textContent="XÁC NHẬN DUYỆT ĐƠN";})' +
    '.approveFromLink(' + js_(req.sheetName) + ',' + js_(String(req.stt)) + ',' + js_(p.sig) + ');}</script>';
  return page_('Cổng nghỉ phép', body);
}

/* ===== ZONE 2b · VERIFY + SUBMIT / XÁC THỰC + GỬI ĐƠN =====
   BRIEF: Mọi quyết định (họ tên, bộ phận, sheet, người duyệt, STT, trạng thái) do server quyết
   EDITABLE: không | none
   FIX AT: search "submitLeave_" */
function verifyEmail_(email) {
  const emp = getEmployee_(email);
  if (emp.error) return { ok: false, message: emp.error };
  return { ok: true, name: emp.name, dept: emp.dept, approver: emp.approver };
}

function submitLeave_(data) {
  const emp = getEmployee_(data.email);
  if (emp.error) return { ok: false, message: emp.error };
  const leave = validateLeave_(data);
  if (leave.error) return { ok: false, message: leave.error };
  const sheetName = CONFIG.UNIT_SHEETS.filter(n => norm_(n) === norm_(emp.dept))[0];
  if (!sheetName) return { ok: false, message: CONFIG.MSG.BAD_DEPT };

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let stt;
  try {
    const sh = SpreadsheetApp.openById(GOOGLE_SHEET_ID).getSheetByName(sheetName);
    if (!sh) return { ok: false, message: CONFIG.MSG.BAD_DEPT };
    const rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 11).getValues() : [];
    // Chống gửi trùng | Block duplicate request
    const dup = rows.some(r => r[UC.NAME] === emp.name && r[UC.TYPE] === leave.type &&
      fmtIso_(r[UC.FROM]) === leave.from && fmtIso_(r[UC.TO]) === leave.to &&
      [norm_(CONFIG.STATUS.PENDING), norm_(CONFIG.STATUS.APPROVED)].indexOf(norm_(r[UC.STATUS])) > -1);
    if (dup) return { ok: false, message: CONFIG.MSG.DUP_REQUEST };
    // STT tiếp theo = max + 1 | Next STT
    stt = rows.reduce((m, r) => Math.max(m, Number(r[UC.STT]) || 0), 0) + 1;
    const tz = Session.getScriptTimeZone();
    const rowNum = sh.getLastRow() + 1;
    sh.getRange(rowNum, UC.REASON + 1, 1, 2).setNumberFormat('@'); // text thuần, chặn công thức
    sh.getRange(rowNum, UC.FROM + 1, 1, 2).setNumberFormat('dd/MM/yyyy');
    sh.getRange(rowNum, 1, 1, 11).setValues([[
      stt, emp.name, Utilities.parseDate(leave.from, tz, 'yyyy-MM-dd'), Utilities.parseDate(leave.to, tz, 'yyyy-MM-dd'),
      leave.days, leave.type, leave.reason, leave.handover, emp.approver, CONFIG.STATUS.PENDING, ''
    ]]);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  try {
    sendApproverMail_(sheetName, stt, emp, leave);
  } catch (err) {
    console.error(err);
    return { ok: true, message: 'Đơn đã được ghi nhận nhưng chưa gửi được email cho người duyệt. Vui lòng báo Phòng Nhân sự.' };
  }
  return { ok: true, message: CONFIG.MSG.SENT };
}

// Tra nhân viên trong sheet "email" | Look up employee
function getEmployee_(email) {
  const key = norm_(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) return { error: CONFIG.MSG.NOT_REGISTERED };
  const hits = employees_().filter(x => norm_(x.email) === key);
  if (!hits.length) return { error: CONFIG.MSG.NOT_REGISTERED };
  if (hits.length > 1) return { error: CONFIG.MSG.DUPLICATE_HR };
  if (hits[0].status !== norm_(CONFIG.ACTIVE)) return { error: CONFIG.MSG.INACTIVE };
  const sameName = employees_().filter(x => x.name === hits[0].name && norm_(x.dept) === norm_(hits[0].dept));
  if (sameName.length > 1) return { error: CONFIG.MSG.DUPLICATE_HR };
  return hits[0];
}

function employees_() {
  const sh = SpreadsheetApp.openById(GOOGLE_SHEET_ID).getSheetByName(CONFIG.EMAIL_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues().map(r => ({
    name: String(r[EC.NAME]).trim(), email: String(r[EC.EMAIL]).trim(), dept: String(r[EC.DEPT]).trim(),
    approver: String(r[EC.APPROVER]).trim(), approverEmail: String(r[EC.APPROVER_EMAIL]).trim(),
    status: norm_(r[EC.STATUS])
  }));
}

// Validate lại toàn bộ dữ liệu form + tự tính số ngày | Re-validate + recompute days
function validateLeave_(d) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const reason = String(d.reason || '').trim(), handover = String(d.handover || '').trim();
  if (!re.test(d.from) || !re.test(d.to) || CONFIG.LEAVE_TYPES.indexOf(d.type) < 0 ||
    !reason || !handover || reason.length > CONFIG.MAX_REASON || handover.length > CONFIG.MAX_HANDOVER) {
    return { error: CONFIG.MSG.BAD_INPUT };
  }
  const a = Date.parse(d.from + 'T00:00:00Z'), b = Date.parse(d.to + 'T00:00:00Z');
  if (isNaN(a) || isNaN(b)) return { error: CONFIG.MSG.BAD_INPUT };
  if (b < a) return { error: CONFIG.MSG.BAD_RANGE };
  return { from: d.from, to: d.to, type: d.type, reason: reason, handover: handover, days: Math.round((b - a) / 86400000) + 1 };
}

/* ===== ZONE 2c · APPROVE / DUYỆT =====
   BRIEF: Duyệt qua link email (có chữ ký) hoặc đổi trạng thái trong Sheet
   EDITABLE: không | none
   FIX AT: search "approveFromLink" */
// Gọi từ trang xác nhận | Called from confirmation page
function approveFromLink(sheetName, stt, sig) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const req = loadRequest_(sheetName, stt, sig);
    if (req.error) return { ok: false, message: req.error };
    if (norm_(req.vals[UC.STATUS]) !== norm_(CONFIG.STATUS.PENDING)) return { ok: false, message: CONFIG.MSG.HANDLED };
    req.sh.getRange(req.rowNum, UC.STATUS + 1).setValue(CONFIG.STATUS.APPROVED);
    SpreadsheetApp.flush();
    req.vals[UC.STATUS] = CONFIG.STATUS.APPROVED;
    try { sendResultMail_(req.sheetName, req.vals); } catch (err) { console.error(err); }
    return { ok: true, message: CONFIG.MSG.DONE };
  } finally {
    lock.releaseLock();
  }
}

// Tìm đơn + kiểm tra chữ ký (không hard-code ID) | Find row + verify signature
function loadRequest_(sheetName, stt, sig) {
  const bad = { error: CONFIG.MSG.BAD_LINK };
  if (CONFIG.UNIT_SHEETS.indexOf(sheetName) < 0) return bad;
  const sh = SpreadsheetApp.openById(GOOGLE_SHEET_ID).getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return bad;
  const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(stt)) {
      const rowNum = i + 2;
      const vals = sh.getRange(rowNum, 1, 1, 11).getValues()[0];
      if (sign_(sheetName, stt, vals[UC.NAME]) !== sig) return bad;
      return { sh: sh, sheetName: sheetName, stt: stt, rowNum: rowNum, vals: vals };
    }
  }
  return bad;
}

// Installable trigger (On edit): người duyệt đổi TRẠNG THÁI trong Sheet
function onStatusEdit(e) {
  if (!e || !e.range) return;
  const r = e.range, sh = r.getSheet();
  if (CONFIG.UNIT_SHEETS.indexOf(sh.getName()) < 0) return;
  if (r.getColumn() !== UC.STATUS + 1 || r.getRow() < 2 || r.getNumRows() !== 1 || r.getNumColumns() !== 1) return;
  const was = norm_(e.oldValue), now = norm_(e.value);
  if (was !== norm_(CONFIG.STATUS.PENDING)) return; // chỉ Chờ duyệt → ... | only from Pending
  if (now !== norm_(CONFIG.STATUS.APPROVED) && now !== norm_(CONFIG.STATUS.REJECTED)) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const vals = sh.getRange(r.getRow(), 1, 1, 11).getValues()[0];
    sendResultMail_(sh.getName(), vals);
  } finally {
    lock.releaseLock();
  }
}

// Chạy 1 lần: tạo trigger + khóa bí mật cho link | Run once: create trigger + link secret
function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'onStatusEdit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onStatusEdit').forSpreadsheet(GOOGLE_SHEET_ID).onEdit().create();
  secret_();
}

/* ===== ZONE 2d · EMAIL / GỬI EMAIL =====
   BRIEF: Email cho người duyệt và cho nhân viên | Mail to approver and employee
   EDITABLE: CONFIG.COLOR, CONFIG.PREFIX
   FIX AT: search "sendApproverMail_" */
function sendApproverMail_(sheetName, stt, emp, leave) {
  const sh = SpreadsheetApp.openById(GOOGLE_SHEET_ID).getSheetByName(sheetName);
  const approveUrl = WEB_APP_URL + '?action=approve&sheet=' + encodeURIComponent(sheetName) +
    '&stt=' + stt + '&sig=' + sign_(sheetName, stt, emp.name);
  const sheetUrl = 'https://docs.google.com/spreadsheets/d/' + GOOGLE_SHEET_ID + '/edit#gid=' + sh.getSheetId();
  const html = mailShell_('Có đơn xin nghỉ phép cần duyệt', infoTable_([
    ['Họ và tên', emp.name], ['Email', emp.email], ['Bộ phận', emp.dept],
    ['Nghỉ từ ngày', fmtDate_(leave.from)], ['Nghỉ đến ngày', fmtDate_(leave.to)], ['Tổng số ngày nghỉ', leave.days],
    ['Loại phép', leave.type], ['Lý do', leave.reason], ['Người nhận bàn giao', leave.handover],
    ['Người duyệt', emp.approver], ['Trạng thái', CONFIG.STATUS.PENDING]
  ]) + '<p>' + btn_(approveUrl, 'DUYỆT ĐƠN', true) + ' ' + btn_(sheetUrl, 'MỞ GOOGLE SHEET', false) + '</p>');
  MailApp.sendEmail({
    to: emp.approverEmail,
    subject: CONFIG.PREFIX + ' Đơn xin nghỉ phép cần duyệt - ' + emp.name,
    htmlBody: html
  });
}

// Gửi kết quả cho nhân viên (tra email theo HỌ TÊN + BỘ PHẬN) | Result mail to employee
function sendResultMail_(sheetName, v) {
  const emp = employees_().filter(x => x.name === String(v[UC.NAME]).trim() && norm_(x.dept) === norm_(sheetName))[0];
  if (!emp) { console.error('Không tìm thấy email nhân viên: ' + v[UC.NAME]); return; }
  const approved = norm_(v[UC.STATUS]) === norm_(CONFIG.STATUS.APPROVED);
  const rows = [
    ['Họ và tên', v[UC.NAME]],
    ['Thời gian nghỉ', fmtDate_(v[UC.FROM]) + ' - ' + fmtDate_(v[UC.TO])]
  ];
  if (approved) rows.push(['Tổng số ngày', v[UC.DAYS]], ['Loại phép', v[UC.TYPE]]);
  rows.push(['Người duyệt', v[UC.APPROVER]], ['Trạng thái', approved ? CONFIG.STATUS.APPROVED : CONFIG.STATUS.REJECTED]);
  if (!approved && String(v[UC.NOTE]).trim()) rows.push(['Ghi chú / lý do từ chối', v[UC.NOTE]]);
  MailApp.sendEmail({
    to: emp.email,
    subject: CONFIG.PREFIX + (approved ? ' Đơn nghỉ phép đã được duyệt' : ' Đơn nghỉ phép không được duyệt'),
    htmlBody: mailShell_(approved ? 'Đơn nghỉ phép đã được duyệt' : 'Đơn nghỉ phép không được duyệt', infoTable_(rows))
  });
}

/* ===== ZONE 2e · HELPERS / HÀM TIỆN ÍCH =====
   BRIEF: Hàm dùng chung | Shared helpers
   EDITABLE: không | none
   FIX AT: search "norm_" */
function norm_(s) { return String(s === undefined || s === null ? '' : s).trim().toLowerCase(); }
function esc_(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function js_(s) { return JSON.stringify(String(s)).replace(/</g, '\\u003c'); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// Date (Sheet) hoặc 'yyyy-MM-dd' → dd/MM/yyyy
function fmtDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  return m ? m[3] + '/' + m[2] + '/' + m[1] : String(v);
}
function fmtIso_(v) { return v instanceof Date ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(v); }

// Chữ ký HMAC cho link duyệt | HMAC signature for approve link
function secret_() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('LINK_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('LINK_SECRET', s); }
  return s;
}
function sign_(sheetName, stt, name) {
  const raw = Utilities.computeHmacSha256Signature([sheetName, stt, String(name).trim()].join('|'), secret_());
  return Utilities.base64EncodeWebSafe(raw).replace(/=+$/, '');
}

function infoTable_(rows) {
  const C = CONFIG.COLOR;
  return '<table style="border-collapse:collapse;width:100%;font-size:14px">' + rows.map(r =>
    '<tr><td style="padding:8px;border-bottom:1px solid ' + C.line + ';color:' + C.muted + ';width:38%">' + esc_(r[0]) +
    '</td><td style="padding:8px;border-bottom:1px solid ' + C.line + ';color:' + C.text + ';font-weight:600">' + esc_(r[1]) + '</td></tr>'
  ).join('') + '</table>';
}
function btn_(url, label, primary) {
  const C = CONFIG.COLOR;
  return '<a href="' + esc_(url) + '" style="display:inline-block;padding:12px 20px;margin:4px 0;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;' +
    (primary ? 'background:' + C.brand + ';color:' + C.white : 'background:' + C.white + ';color:' + C.brand + ';border:1px solid ' + C.brand) + '">' + esc_(label) + '</a>';
}
function mailShell_(title, inner) {
  const C = CONFIG.COLOR;
  return '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:' + C.text + '">' +
    '<div style="background:' + C.brand + ';color:' + C.white + ';padding:14px 18px;border-bottom:3px solid ' + C.accent + ';font-weight:700">' + esc_(title) + '</div>' +
    '<div style="padding:16px 4px">' + inner + '</div></div>';
}
function page_(title, bodyHtml) {
  const C = CONFIG.COLOR;
  const css = 'body{font-family:Arial,sans-serif;background:' + C.white + ';color:' + C.text + ';margin:0;padding:16px}' +
    '.c{max-width:520px;margin:auto}h2{color:' + C.brand + '}' +
    'button{width:100%;padding:14px;border:0;border-radius:8px;background:' + C.brand + ';color:' + C.white + ';font-weight:700;cursor:pointer}' +
    'button:disabled{opacity:.6}#m{font-weight:700;color:' + C.brand + '}';
  return HtmlService.createHtmlOutput('<!DOCTYPE html><html><head><meta charset="utf-8"><base target="_top">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style></head><body><div class="c">' +
    bodyHtml + '</div></body></html>').setTitle(title);
}