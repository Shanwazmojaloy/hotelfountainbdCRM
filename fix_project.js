const fs = require('fs');
const path = require('path');

// Dynamically get today's date in YYYY-MM-DD format
const today = new Date().toISOString().split('T')[0]; 
const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.html'));

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    
    // SMART FILTER: Include any guest who paid yesterday OR today
    const smartFilter = `activeGuests.filter(guest => {
        const hasRecentPayment = guest.payments && guest.payments.some(p => ["${yesterday}", "${today}"].includes(p.date));
        return hasRecentPayment;
    })`;

    // Replace the old rigid filter with this smart one
    content = content.replace(/activeGuests\.filter\(guest =>.*?\)/s, smartFilter);
    
    // Also update the Summary Card to be inclusive
    content = content.replace(/allTransactions\.filter\(.*?\)\.reduce/g, 
        `allTransactions.filter(t => ["${yesterday}", "${today}"].includes(t.date)).reduce`);

    fs.writeFileSync(file, content);
    console.log(`✅ Smart report logic applied to ${file}`);
});