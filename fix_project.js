const fs = require('fs');
const path = require('path');

const crmPath = path.join(__dirname, 'crm.html');

if (fs.existsSync(crmPath)) {
    let content = fs.readFileSync(crmPath, 'utf8');
    
    // This code replaces the hardcoded "2026-04-16" with a dynamic JavaScript date
    const dynamicDateLogic = 'new Date().toISOString().split("T")[0]';
    
    // Update the Table Filter to be dynamic
    const dynamicFilter = `activeGuests.filter(guest => {
        const today = ${dynamicDateLogic};
        const paidToday = guest.payments ? 
            guest.payments.filter(p => p.date === today)
            .reduce((sum, p) => sum + Number(p.amount || 0), 0) : 0;
        const balanceDue = Number(guest.billTotal || 0) - Number(guest.paid || 0);
        return (paidToday > 0) || (balanceDue > 0);
    })`;

    content = content.replace(/activeGuests\.filter\(guest =>.*?\)/s, dynamicFilter);
    
    // Update the Summary Card to be dynamic
    content = content.replace(/allTransactions\.filter\(.*?\)\.reduce/g, 
        `allTransactions.filter(t => t.date === ${dynamicDateLogic}).reduce`);

    fs.writeFileSync(crmPath, content);
    console.log("✅ Project Fixed: Report is now dynamic and will work every day.");
}