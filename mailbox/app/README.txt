# Internal Mailbox Application

Backend: Google Apps Script
Database: Google Sheets
Attachments: Google Drive
Mail delivery: INTERNAL ONLY (no Gmail)

## 1. Apps Script setup

Create a new standalone Google Apps Script project.

Add:
- Code.gs
- appsscript.json

Paste the supplied files.

Run `setupCheck_()` once from the Apps Script editor and authorize access.

Deploy:
Deploy > New deployment > Web app
- Execute as: Me
- Who has access: Anyone

Copy the Web app URL.

## 2. Set the Web App URL

In:
- login.html
- inbox.html
- compose.html
- read.html

replace:

PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE

with the deployed Apps Script Web App URL.

Example:
https://script.google.com/macros/s/XXXXXXXX/exec

The same URL must be used in all four files.

## 3. Password hash

The Users sheet uses Password_Hash.

The backend expects SHA-256 of the password.

A browser-side quick hash generator is intentionally not included. You can create a temporary Apps Script function:

function generatePasswordHash() {
  const password = 'CHANGE_ME';
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password, Utilities.Charset.UTF_8);
  const hash = bytes.map(b => {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
  Logger.log(hash);
}

Run it, copy the hash to Users > Password_Hash, then remove the temporary function.

## 4. Existing AdminLTE assets

The supplied inbox.html and compose.html are retained as the starting pages.
Their existing AdminLTE structure/styles are not redesigned.

If the pages are hosted on your existing AdminLTE static site, keep the same relative CSS/JS asset paths.

## 5. Current working functions

- Internal login
- Session token
- Inbox listing
- Search
- Folder listing
- Star/unstar
- Read message
- Mark read
- Compose
- Send internal message
- CC/BCC
- Draft saving
- Google Drive attachment upload
- Attachment register
- Internal recipient validation
- Reference number generation
- Thread ID and Message ID generation

## 6. Important

The application does not send email through Gmail or any external mail server.
A message is delivered by creating:
1. one record in Emails
2. sender mailbox record in Mailbox_Index
3. recipient mailbox record(s) in Mailbox_Index
4. optional attachment records in Attachments
5. optional physical files in the configured Drive folder
