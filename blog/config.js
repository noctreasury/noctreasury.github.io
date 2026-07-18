// config.js - Updated with Apps Script URL
const CONFIG = {
    // Your Google Sheet ID
    SHEET_ID: '1UuyJa9qNaynwTPJh_Cg8FL7BPuj8wFF6-1nq0Ix-bK8',
    
    // Google Sheets API Key (for reading only)
    API_KEY: 'AIzaSyBAuS3Brpsw5JOJnjNJii1UlFa7ClXf8d4',  // Replace with your restricted API key
    
    // Apps Script Web App URL (for writes - likes/comments)
    // DEPLOY THIS FIRST: Go to Extensions > Apps Script, paste code.gs, Deploy > New deployment > Web App
    APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbwdiKDPKG0-12X6pK9kEXokvojxik-Io1GybWLJP8M6SP__iwPPCkPDUnjL3gg3GCDP/exec',
    
    // Sheet names
   
    SHEETS: {
        BLOG_DATA: 'blog data',
        COMMENTS_DATA: 'Comments data',
        CONFIGURE: 'configure',
        MASTER_CATEGORIES: 'master_categories',
        MASTER_TAGS: 'master_tags'
    }
};