// Central configuration for the Admin Dashboard API URL
// Automatically detects local development vs deployed production
const isLocal = window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.protocol === 'file:';

const CONFIG = {
    API_BASE: (typeof window !== 'undefined' && window.localStorage && window.localStorage.getItem('jj_api_base'))
        ? window.localStorage.getItem('jj_api_base')
        : (isLocal ? 'http://localhost:3000' : 'https://api.jingjangstore.com')
};
