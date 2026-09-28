/**
 * INTERNAL MAILBOX - Google Apps Script Backend
 * Backend: Google Sheets + Google Drive
 * Mail model: internal only; no Gmail delivery.
 *
 * Configuration spreadsheet:
 * https://docs.google.com/spreadsheets/d/1nEVX-k4gQfXfl-pzEU4CNRshJtgjCiCtD-xiKCHqs2s/edit
 */

const CONFIG_SPREADSHEET_ID = '1nEVX-k4gQfXfl-pzEU4CNRshJtgjCiCtD-xiKCHqs2s';
const SESSION_PREFIX = 'IMBX_SESSION_';
const SESSION_SECONDS = 21600; // 6 hours, CacheService maximum practical lifetime.

const REQUIRED_HEADERS = {
  Users: [
    'User_ID','Email_Address','Password_Hash','Full_Name','Designation','Department',
    'Mobile','Role','Status','Profile_Image_URL','Created_Date','Last_Login',
    'Failed_Login_Count','Last_Failed_Login','Session_Revoked'
  ],
  Emails: [
    'Mail_ID','Reference_No','Thread_ID','Message_ID','Parent_Message_ID','Sender_Email',
    'Sender_Name','To_Email','Cc_Email','Bcc_Email','Subject','Body','Body_Type',
    'Sent_DateTime','Received_DateTime','Folder','Status','Is_Read','Is_Starred',
    'Is_Archived','Is_Spam','Is_Deleted','Label','Has_Attachment','Attachment_Count',
    'Reply_To','Forwarded_From','Created_By','Last_Updated','Last_Updated_By'
  ],
  Mailbox_Index: [
    'Mailbox_Record_ID','Mail_ID','Reference_No','User_ID','User_Email','Folder',
    'Is_Read','Is_Starred','Is_Archived','Is_Spam','Is_Deleted','Received_DateTime',
    'Last_Updated'
  ],
  Attachments: [
    'Attachment_ID','Reference_No','Message_ID','Thread_ID','User_ID',
    'Original_File_Name','Drive_File_Name','Drive_File_ID','Drive_URL','Mime_Type',
    'File_Size','Drive_Folder_ID','Uploaded_By','Uploaded_DateTime','Status','Deleted_DateTime'
  ]
};

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'health';
  try {
    if (action === 'health') return json_({ok:true, service:'internal-mailbox', time:now_()});
    return json_({ok:false,error:'Use POST for mailbox operations.'});
  } catch (err) {
    return json_({ok:false,error:String(err)});
  }
}

function doPost(e) {
  try {
    const body = parseRequest_(e);
    const action = String(body.action || '').trim();

    if (action === 'login') return json_(login_(body));
    if (action === 'logout') return json_(logout_(body));
    if (action === 'bootstrap') return json_(bootstrap_(body));
    if (action === 'listMessages') return json_(listMessages_(body));
    if (action === 'getMessage') return json_(getMessage_(body));
    if (action === 'sendMessage') return json_(sendMessage_(body));
    if (action === 'saveDraft') return json_(saveDraft_(body));
    if (action === 'updateMessage') return json_(updateMessage_(body));
    if (action === 'search') return json_(searchMessages_(body));
    if (action === 'setupCheck') return json_(setupCheck_());

    return json_({ok:false,error:'Unknown action: ' + action});
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return json_({ok:false,error:String(err && err.message ? err.message : err)});
  }
}

function parseRequest_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  const raw = e.postData.contents;
  try { return JSON.parse(raw); }
  catch (_) { return {action:'', raw:raw}; }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function setupCheck_() {
  const cfg = readConfig_();
  const result = {
    ok:true,
    configSpreadsheetId:CONFIG_SPREADSHEET_ID,
    usersSpreadsheetId:extractId_(cfg.USERS_SHEET_ID || cfg.USERS_SHEET_URL || ''),
    mailDatabaseSpreadsheetId:extractId_(cfg.MAIL_DATABASE_SHEET_ID || cfg.MAIL_DATABASE_URL || ''),
    driveRegisterSpreadsheetId:extractId_(cfg.DRIVE_REGISTER_SHEET_ID || cfg.DRIVE_REGISTER_URL || ''),
    driveFolderId:extractId_(cfg.MAIL_DRIVE_FOLDER_ID || cfg.MAIL_DRIVE_FOLDER_URL || ''),
    missing:[]
  };
  Object.keys(result).forEach(k => {
    if (k !== 'missing' && result[k] === '') result.missing.push(k);
  });
  return result;
}

function bootstrap_(body) {
  const session = requireSession_(body.token);
  const cfg = readConfig_();
  const user = getUserByEmail_(session.email);
  if (!user) throw new Error('User account not found.');

  return {
    ok:true,
    user:safeUser_(user),
    config:{
      appName:cfg.APP_NAME || 'Internal Mailbox',
      appVersion:cfg.APP_VERSION || '1.0.0',
      pageSize:Number(cfg.DEFAULT_PAGE_SIZE || 25),
      timezone:cfg.TIMEZONE || Session.getScriptTimeZone() || 'Asia/Kolkata',
      maxAttachmentSizeMB:Number(cfg.MAX_ATTACHMENT_SIZE_MB || 25),
      maxAttachments:Number(cfg.MAX_ATTACHMENTS || 10),
      allowCc:String(cfg.ALLOW_CC || 'YES').toUpperCase() === 'YES',
      allowBcc:String(cfg.ALLOW_BCC || 'YES').toUpperCase() === 'YES'
    }
  };
}

function login_(body) {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || !password) throw new Error('Email address and password are required.');

  const user = getUserByEmail_(email);
  if (!user) throw new Error('Invalid login credentials.');
  if (String(user.Status || '').toUpperCase() !== 'ACTIVE') throw new Error('User account is not active.');
  if (String(user.Session_Revoked || '').toUpperCase() === 'YES') throw new Error('User session has been revoked.');

  const expected = String(user.Password_Hash || '').trim();
  const actual = sha256_(password);

  // During initial setup, Password_Hash must be populated.
  // A temporary plaintext fallback is intentionally NOT enabled.
  if (!expected || expected.toLowerCase() !== actual.toLowerCase()) {
    incrementFailedLogin_(user);
    throw new Error('Invalid login credentials.');
  }

  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g,'');
  CacheService.getScriptCache().put(
    SESSION_PREFIX + token,
    JSON.stringify({email:email, userId:String(user.User_ID), created:Date.now()}),
    SESSION_SECONDS
  );

  updateUserLogin_(user);
  return {ok:true, token:token, user:safeUser_(user)};
}

function logout_(body) {
  if (body && body.token) CacheService.getScriptCache().remove(SESSION_PREFIX + body.token);
  return {ok:true};
}

function requireSession_(token) {
  token = String(token || '');
  if (!token) throw new Error('Session expired. Please login again.');
  const raw = CacheService.getScriptCache().get(SESSION_PREFIX + token);
  if (!raw) throw new Error('Session expired. Please login again.');
  const session = JSON.parse(raw);
  const user = getUserById_(session.userId);
  if (!user || String(user.Status).toUpperCase() !== 'ACTIVE') {
    CacheService.getScriptCache().remove(SESSION_PREFIX + token);
    throw new Error('User account is inactive.');
  }
  if (String(user.Session_Revoked || '').toUpperCase() === 'YES') {
    CacheService.getScriptCache().remove(SESSION_PREFIX + token);
    throw new Error('Session revoked. Please login again.');
  }
  // Refresh the session TTL.
  CacheService.getScriptCache().put(SESSION_PREFIX + token, raw, SESSION_SECONDS);
  return session;
}

function listMessages_(body) {
  const session = requireSession_(body.token);
  const folder = String(body.folder || 'INBOX').toUpperCase();
  const search = String(body.search || '').trim().toLowerCase();
  const limit = Math.min(Math.max(Number(body.limit || 50), 1), 200);

  const rows = getSheetObjects_('Mailbox_Index');
  const emails = getSheetObjects_('Emails');
  const emailMap = {};
  emails.forEach(m => emailMap[String(m.Mail_ID)] = m);

  const result = [];
  rows.forEach(r => {
    if (String(r.User_ID) !== String(session.userId)) return;
    if (folder === 'STARRED') {
      if (String(r.Is_Starred).toUpperCase() !== 'YES') return;
    } else if (String(r.Folder).toUpperCase() !== folder) {
      return;
    }
    if (String(r.Is_Deleted).toUpperCase() === 'YES' && folder !== 'TRASH') return;

    const m = emailMap[String(r.Mail_ID)];
    if (!m) return;

    const hay = [
      m.Subject,m.Sender_Name,m.Sender_Email,m.To_Email,m.Cc_Email,m.Body,m.Reference_No
    ].join(' ').toLowerCase();
    if (search && !hay.includes(search)) return;

    result.push(messageView_(m, r));
  });

  result.sort((a,b) => String(b.date).localeCompare(String(a.date)));
  return {ok:true, folder:folder, count:result.length, messages:result.slice(0, limit)};
}

function getMessage_(body) {
  const session = requireSession_(body.token);
  const mailId = String(body.mailId || '').trim();
  if (!mailId) throw new Error('Mail ID is required.');

  const emails = getSheetObjects_('Emails');
  const m = emails.find(x => String(x.Mail_ID) === mailId);
  if (!m) throw new Error('Message not found.');

  const idxRows = getSheetObjects_('Mailbox_Index');
  const r = idxRows.find(x => String(x.Mail_ID) === mailId && String(x.User_ID) === String(session.userId));
  if (!r) throw new Error('You do not have access to this message.');

  // Mark as read for this recipient.
  updateMailboxIndex_(r.Mailbox_Record_ID, {Is_Read:'YES', Last_Updated:now_()});

  const attachments = getSheetObjects_('Attachments')
    .filter(a => String(a.Message_ID) === String(m.Message_ID) && String(a.Status).toUpperCase() === 'ACTIVE');

  return {ok:true, message:messageView_(m, r), attachments:attachments.map(a => ({
    attachmentId:a.Attachment_ID,
    fileName:a.Original_File_Name,
    fileId:a.Drive_File_ID,
    url:a.Drive_URL,
    mimeType:a.Mime_Type,
    size:a.File_Size
  }))};
}

function sendMessage_(body) {
  const session = requireSession_(body.token);
  const to = normalizeEmails_(body.to);
  const cc = normalizeEmails_(body.cc);
  const bcc = normalizeEmails_(body.bcc);
  const subject = String(body.subject || '').trim();
  const messageBody = String(body.body || '');

  if (!to.length) throw new Error('At least one recipient is required.');
  if (!subject) throw new Error('Subject is required.');

  const allRecipients = unique_(to.concat(cc, bcc));
  const users = allRecipients.map(getUserByEmail_).filter(Boolean);
  if (users.length !== allRecipients.length) {
    const known = users.map(u => String(u.Email_Address).toLowerCase());
    const missing = allRecipients.filter(x => !known.includes(x));
    throw new Error('Recipient is not an internal mailbox user: ' + missing.join(', '));
  }

  const cfg = readConfig_();
  const maxAttachments = Number(cfg.MAX_ATTACHMENTS || 10);
  const maxBytes = Number(cfg.MAX_ATTACHMENT_SIZE_MB || 25) * 1024 * 1024;
  const files = Array.isArray(body.attachments) ? body.attachments : [];
  if (files.length > maxAttachments) throw new Error('Too many attachments.');
  files.forEach(f => {
    if (Number(f.size || 0) > maxBytes) throw new Error('Attachment exceeds configured size limit: ' + f.name);
  });

  const mailId = nextId_('MAIL');
  const messageId = nextId_('MSG');
  const reference = nextReference_();
  const threadId = body.threadId ? String(body.threadId) : nextId_('THR');
  const now = now_();
  const sender = getUserById_(session.userId);
  const subjectSafe = subject;
  const bodyType = String(body.bodyType || 'TEXT').toUpperCase();

  appendObject_('Emails', {
    Mail_ID:mailId,
    Reference_No:reference,
    Thread_ID:threadId,
    Message_ID:messageId,
    Parent_Message_ID:String(body.parentMessageId || ''),
    Sender_Email:String(sender.Email_Address),
    Sender_Name:String(sender.Full_Name),
    To_Email:to.join(', '),
    Cc_Email:cc.join(', '),
    Bcc_Email:bcc.join(', '),
    Subject:subjectSafe,
    Body:messageBody,
    Body_Type:bodyType,
    Sent_DateTime:now,
    Received_DateTime:now,
    Folder:'SENT',
    Status:'SENT',
    Is_Read:'YES',
    Is_Starred:'NO',
    Is_Archived:'NO',
    Is_Spam:'NO',
    Is_Deleted:'NO',
    Label:String(body.label || ''),
    Has_Attachment:files.length ? 'YES' : 'NO',
    Attachment_Count:files.length,
    Reply_To:String(body.replyTo || ''),
    Forwarded_From:String(body.forwardedFrom || ''),
    Created_By:String(sender.User_ID),
    Last_Updated:now,
    Last_Updated_By:String(sender.User_ID)
  });

  appendObject_('Mailbox_Index', {
    Mailbox_Record_ID:nextId_('MBX'),
    Mail_ID:mailId,
    Reference_No:reference,
    User_ID:String(sender.User_ID),
    User_Email:String(sender.Email_Address),
    Folder:'SENT',
    Is_Read:'YES',
    Is_Starred:'NO',
    Is_Archived:'NO',
    Is_Spam:'NO',
    Is_Deleted:'NO',
    Received_DateTime:now,
    Last_Updated:now
  });

  users.forEach(recipient => {
    if (String(recipient.User_ID) === String(sender.User_ID)) return;
    appendObject_('Mailbox_Index', {
      Mailbox_Record_ID:nextId_('MBX'),
      Mail_ID:mailId,
      Reference_No:reference,
      User_ID:String(recipient.User_ID),
      User_Email:String(recipient.Email_Address),
      Folder:'INBOX',
      Is_Read:'NO',
      Is_Starred:'NO',
      Is_Archived:'NO',
      Is_Spam:'NO',
      Is_Deleted:'NO',
      Received_DateTime:now,
      Last_Updated:now
    });
  });

  if (files.length) saveAttachments_(files, {
    reference:reference,
    messageId:messageId,
    threadId:threadId,
    userId:String(sender.User_ID),
    uploadedBy:String(sender.User_ID),
    now:now
  });

  return {ok:true, mailId:mailId, referenceNo:reference, threadId:threadId, messageId:messageId};
}

function saveDraft_(body) {
  const session = requireSession_(body.token);
  const sender = getUserById_(session.userId);
  const now = now_();
  const mailId = String(body.mailId || nextId_('MAIL'));
  const existing = getSheetObjects_('Emails').find(x => String(x.Mail_ID) === mailId);
  const reference = existing ? existing.Reference_No : nextReference_();
  const threadId = String(body.threadId || (existing ? existing.Thread_ID : nextId_('THR')));
  const messageId = existing ? existing.Message_ID : nextId_('MSG');

  const values = {
    Mail_ID:mailId, Reference_No:reference, Thread_ID:threadId, Message_ID:messageId,
    Parent_Message_ID:String(body.parentMessageId || ''),
    Sender_Email:String(sender.Email_Address), Sender_Name:String(sender.Full_Name),
    To_Email:String(body.to || ''), Cc_Email:String(body.cc || ''), Bcc_Email:String(body.bcc || ''),
    Subject:String(body.subject || ''), Body:String(body.body || ''), Body_Type:String(body.bodyType || 'TEXT'),
    Sent_DateTime:'', Received_DateTime:'', Folder:'DRAFT', Status:'DRAFT',
    Is_Read:'YES', Is_Starred:'NO', Is_Archived:'NO', Is_Spam:'NO', Is_Deleted:'NO',
    Label:String(body.label || ''), Has_Attachment:'NO', Attachment_Count:0,
    Reply_To:String(body.replyTo || ''), Forwarded_From:String(body.forwardedFrom || ''),
    Created_By:String(sender.User_ID), Last_Updated:now, Last_Updated_By:String(sender.User_ID)
  };

  if (existing) updateEmail_(mailId, values);
  else appendObject_('Emails', values);

  const idx = getSheetObjects_('Mailbox_Index').find(x =>
    String(x.Mail_ID) === mailId && String(x.User_ID) === String(sender.User_ID)
  );
  if (idx) updateMailboxIndex_(idx.Mailbox_Record_ID, {
    Folder:'DRAFT', Last_Updated:now
  });
  else appendObject_('Mailbox_Index', {
    Mailbox_Record_ID:nextId_('MBX'), Mail_ID:mailId, Reference_No:reference,
    User_ID:String(sender.User_ID), User_Email:String(sender.Email_Address),
    Folder:'DRAFT', Is_Read:'YES', Is_Starred:'NO', Is_Archived:'NO',
    Is_Spam:'NO', Is_Deleted:'NO', Received_DateTime:now, Last_Updated:now
  });

  return {ok:true, mailId:mailId, referenceNo:reference, threadId:threadId, messageId:messageId};
}

function updateMessage_(body) {
  const session = requireSession_(body.token);
  const mailId = String(body.mailId || '');
  const idx = getSheetObjects_('Mailbox_Index').find(x =>
    String(x.Mail_ID) === mailId && String(x.User_ID) === String(session.userId)
  );
  if (!idx) throw new Error('Message not found.');

  const allowed = ['Folder','Is_Read','Is_Starred','Is_Archived','Is_Spam','Is_Deleted'];
  const changes = {};
  allowed.forEach(k => { if (body[k] !== undefined) changes[k] = body[k]; });
  changes.Last_Updated = now_();
  updateMailboxIndex_(idx.Mailbox_Record_ID, changes);
  return {ok:true};
}

function searchMessages_(body) {
  body.folder = body.folder || 'INBOX';
  return listMessages_(body);
}

function messageView_(m, r) {
  return {
    mailId:String(m.Mail_ID),
    referenceNo:String(m.Reference_No),
    threadId:String(m.Thread_ID),
    messageId:String(m.Message_ID),
    senderEmail:String(m.Sender_Email),
    senderName:String(m.Sender_Name),
    to:String(m.To_Email),
    cc:String(m.Cc_Email),
    bcc:String(m.Bcc_Email),
    subject:String(m.Subject),
    body:String(m.Body),
    bodyType:String(m.Body_Type || 'TEXT'),
    date:String(m.Sent_DateTime || m.Received_DateTime || ''),
    folder:String(r.Folder || ''),
    status:String(m.Status || ''),
    isRead:String(r.Is_Read).toUpperCase() === 'YES',
    isStarred:String(r.Is_Starred).toUpperCase() === 'YES',
    hasAttachment:String(m.Has_Attachment).toUpperCase() === 'YES',
    attachmentCount:Number(m.Attachment_Count || 0),
    label:String(m.Label || '')
  };
}

function saveAttachments_(files, meta) {
  const cfg = readConfig_();
  const folderId = extractId_(cfg.MAIL_DRIVE_FOLDER_ID || cfg.MAIL_DRIVE_FOLDER_URL || '');
  if (!folderId) throw new Error('MAIL_DRIVE_FOLDER_ID is not configured.');

  const root = DriveApp.getFolderById(folderId);
  const year = Utilities.formatDate(new Date(), cfg.TIMEZONE || Session.getScriptTimeZone() || 'Asia/Kolkata', 'yyyy');
  const month = Utilities.formatDate(new Date(), cfg.TIMEZONE || Session.getScriptTimeZone() || 'Asia/Kolkata', 'MM');
  const yearFolder = getOrCreateFolder_(root, year);
  const monthFolder = getOrCreateFolder_(yearFolder, month);
  const mailFolder = getOrCreateFolder_(monthFolder, meta.reference);

  files.forEach((f, i) => {
    const bytes = Utilities.base64Decode(String(f.base64 || ''));
    const blob = Utilities.newBlob(bytes, String(f.mimeType || 'application/octet-stream'), String(f.name || ('attachment-' + (i+1))));
    const file = mailFolder.createFile(blob);
    appendObject_('Attachments', {
      Attachment_ID:nextId_('ATT'),
      Reference_No:meta.reference,
      Message_ID:meta.messageId,
      Thread_ID:meta.threadId,
      User_ID:meta.userId,
      Original_File_Name:String(f.name || ''),
      Drive_File_Name:file.getName(),
      Drive_File_ID:file.getId(),
      Drive_URL:file.getUrl(),
      Mime_Type:String(f.mimeType || ''),
      File_Size:bytes.length,
      Drive_Folder_ID:mailFolder.getId(),
      Uploaded_By:meta.uploadedBy,
      Uploaded_DateTime:meta.now,
      Status:'ACTIVE',
      Deleted_DateTime:''
    });
  });
}

function readConfig_() {
  const ss = SpreadsheetApp.openById(CONFIG_SPREADSHEET_ID);
  const sh = ss.getSheetByName('Configuration');
  if (!sh) throw new Error('Configuration tab not found.');
  const values = sh.getDataRange().getValues();
  const out = {};
  for (let i=1; i<values.length; i++) {
    const key = String(values[i][0] || '').trim();
    if (key) out[key] = values[i][1];
  }
  return out;
}

function getSpreadsheetFor_(type) {
  const cfg = readConfig_();
  let raw = '';
  if (type === 'Users') raw = cfg.USERS_SHEET_ID || cfg.USERS_SHEET_URL;
  if (type === 'Emails' || type === 'Mailbox_Index') raw = cfg.MAIL_DATABASE_SHEET_ID || cfg.MAIL_DATABASE_URL;
  if (type === 'Attachments') raw = cfg.DRIVE_REGISTER_SHEET_ID || cfg.DRIVE_REGISTER_URL;
  const id = extractId_(raw);
  if (!id) throw new Error('Spreadsheet ID is not configured for ' + type);
  return SpreadsheetApp.openById(id);
}

function getSheetObjects_(sheetName) {
  const type = sheetName === 'Users' ? 'Users' :
               (sheetName === 'Attachments' ? 'Attachments' : 'Emails');
  const ss = getSpreadsheetFor_(type);
  let sh = ss.getSheetByName(sheetName);
  if (!sh && sheetName === 'Mailbox_Index') {
    sh = ss.insertSheet('Mailbox_Index');
  }
  if (!sh) throw new Error('Sheet/tab not found: ' + sheetName);

  const values = sh.getDataRange().getValues();
  if (!values.length) return [];
  const headers = values[0].map(String);
  return values.slice(1).filter(row => row.some(v => v !== '')).map(row => {
    const o = {};
    headers.forEach((h,i) => o[h] = row[i] instanceof Date ? formatDate_(row[i]) : row[i]);
    return o;
  });
}

function appendObject_(sheetName, obj) {
  const type = sheetName === 'Users' ? 'Users' :
               (sheetName === 'Attachments' ? 'Attachments' : 'Emails');
  const ss = getSpreadsheetFor_(type);
  let sh = ss.getSheetByName(sheetName);
  if (!sh) sh = ss.insertSheet(sheetName);
  ensureHeaders_(sh, REQUIRED_HEADERS[sheetName] || Object.keys(obj));
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);
  const row = headers.map(h => obj[h] === undefined ? '' : obj[h]);
  sh.getRange(sh.getLastRow()+1,1,1,row.length).setValues([row]);
}

function ensureHeaders_(sh, headers) {
  const current = sh.getLastColumn() ? sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String) : [];
  if (!current.length || current.every(x => !x)) {
    sh.getRange(1,1,1,headers.length).setValues([headers]);
    return;
  }
  const missing = headers.filter(h => !current.includes(h));
  if (missing.length) sh.getRange(1,current.length+1,1,missing.length).setValues([missing]);
}

function updateMailboxIndex_(recordId, changes) {
  updateByKey_('Mailbox_Index', 'Mailbox_Record_ID', recordId, changes);
}

function updateEmail_(mailId, changes) {
  updateByKey_('Emails', 'Mail_ID', mailId, changes);
}

function updateByKey_(sheetName, keyHeader, keyValue, changes) {
  const type = sheetName === 'Emails' ? 'Emails' : sheetName;
  const ss = getSpreadsheetFor_(type === 'Users' ? 'Users' : (sheetName === 'Attachments' ? 'Attachments' : 'Emails'));
  const sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error('Sheet/tab not found: ' + sheetName);
  const values = sh.getDataRange().getValues();
  if (!values.length) return;
  const headers = values[0].map(String);
  const keyCol = headers.indexOf(keyHeader);
  if (keyCol < 0) throw new Error('Missing column ' + keyHeader);
  for (let r=1; r<values.length; r++) {
    if (String(values[r][keyCol]) === String(keyValue)) {
      Object.keys(changes).forEach(k => {
        const c = headers.indexOf(k);
        if (c >= 0) sh.getRange(r+1,c+1).setValue(changes[k]);
      });
      return;
    }
  }
  throw new Error('Record not found: ' + keyValue);
}

function getUserByEmail_(email) {
  const users = getSheetObjects_('Users');
  const target = String(email || '').trim().toLowerCase();
  return users.find(u => String(u.Email_Address || '').trim().toLowerCase() === target) || null;
}

function getUserById_(id) {
  const users = getSheetObjects_('Users');
  return users.find(u => String(u.User_ID) === String(id)) || null;
}

function safeUser_(u) {
  return {
    userId:String(u.User_ID),
    email:String(u.Email_Address),
    name:String(u.Full_Name),
    designation:String(u.Designation || ''),
    department:String(u.Department || ''),
    role:String(u.Role || ''),
    profileImageUrl:String(u.Profile_Image_URL || '')
  };
}

function incrementFailedLogin_(user) {
  const count = Number(user.Failed_Login_Count || 0) + 1;
  updateByKey_('Users', 'User_ID', user.User_ID, {
    Failed_Login_Count:count,
    Last_Failed_Login:now_()
  });
}

function updateUserLogin_(user) {
  updateByKey_('Users', 'User_ID', user.User_ID, {
    Last_Login:now_(),
    Failed_Login_Count:0,
    Last_Failed_Login:''
  });
}

function nextReference_() {
  const cfg = readConfig_();
  const prefix = String(cfg.REFERENCE_PREFIX || 'TSRY-MAIL');
  const year = Utilities.formatDate(new Date(), cfg.TIMEZONE || Session.getScriptTimeZone() || 'Asia/Kolkata', 'yyyy');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const props = PropertiesService.getScriptProperties();
    const key = 'MAIL_SEQ_' + year;
    const next = Number(props.getProperty(key) || 0) + 1;
    props.setProperty(key, String(next));
    return prefix + '-' + year + '-' + ('000000' + next).slice(-6);
  } finally {
    lock.releaseLock();
  }
}

function nextId_(prefix) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const props = PropertiesService.getScriptProperties();
    const key = 'SEQ_' + prefix;
    const next = Number(props.getProperty(key) || 0) + 1;
    props.setProperty(key, String(next));
    return prefix + Utilities.formatString('%06d', next);
  } finally {
    lock.releaseLock();
  }
}

function normalizeEmails_(value) {
  if (Array.isArray(value)) return unique_(value.map(x => String(x).trim().toLowerCase()).filter(Boolean));
  return unique_(String(value || '').split(/[;,]/).map(x => x.trim().toLowerCase()).filter(Boolean));
}

function unique_(arr) {
  return Array.from(new Set(arr));
}

function sha256_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(b => {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function now_() {
  const cfg = readConfig_();
  return Utilities.formatDate(new Date(), cfg.TIMEZONE || Session.getScriptTimeZone() || 'Asia/Kolkata', 'dd/MM/yyyy HH:mm:ss');
}

function formatDate_(d) {
  const cfg = readConfig_();
  return Utilities.formatDate(d, cfg.TIMEZONE || Session.getScriptTimeZone() || 'Asia/Kolkata', 'dd/MM/yyyy HH:mm:ss');
}

function extractId_(value) {
  const s = String(value || '').trim();
  const m = s.match(/[-\w]{20,}/);
  return m ? m[0] : '';
}

function getOrCreateFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

