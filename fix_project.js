const fs = require('fs');
const path = require('path');

// THE STRICT DATE
const targetDate = "2026-04-16";
const crmPath = path.join(__dirname, 'crm.html');

if (fs.existsSync(crmPath)) {
    let content = fs.readFileSync(crmPath, 'utf8');
    
    // THE LOGIC: Show if (Paid Today > 0) OR (Total Bill - Total Paid > 0)
    const activeReportFilter = `activeGuests.filter(guest => {
        // 1. Check if they paid anything TODAY
        const paidToday = guest.payments ? 
            guest.payments.filter(p => p.date === "${targetDate}")
            .reduce((sum, p) => sum + Number(p.amount || 0), 0) : 0;
        
        // 2. Check if they still owe money (Balance Due)
        const totalBill = Number(guest.billTotal || 0);
        const totalPaidAllTime = Number(guest.paid || 0);
        const balanceDue = totalBill - totalPaidAllTime;

        // Keep them visible if they paid today OR if they still owe money
        return (paidToday > 0) || (balanceDue > 0);
    })`;

    // Inject the new filter into the HTML
    content = content.replace(/activeGuests\.filter\(guest =>.*?\)/s, activeReportFilter);
    
    // Keep the Summary Card strictly to April 16th cash only
    content = content.replace(/allTransactions\.filter\(.*?\)\.reduce/g, 
        `allTransactions.filter(t => t.date === "${targetDate}").reduce`);

    fs.writeFileSync(crmPath, content);
    console.log("✅ Report Optimized: Showing today's payers and all outstanding debtors.");
}