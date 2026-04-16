const fs = require('fs');
const path = require('path');

const targetDate = "2026-04-16";
const crmPath = path.join(__dirname, 'crm.html');

if (fs.existsSync(crmPath)) {
    let content = fs.readFileSync(crmPath, 'utf8');
    
    // THE DOUBLE-LOCK FILTER
    const finalFilter = `activeGuests.filter(guest => {
        // 1. Calculate Today's Payment
        const todayPayments = guest.payments ? 
            guest.payments.filter(p => p.date === "${targetDate}") : [];
        const paidToday = todayPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
        
        // 2. Calculate Remaining Balance
        const totalBill = Number(guest.billTotal || 0);
        const totalPaidAllTime = Number(guest.paid || 0);
        const balanceDue = totalBill - totalPaidAllTime;

        // LOCK: Only show if they gave you cash TODAY or if they still OWE you money
        return (paidToday > 0) || (balanceDue > 0);
    })`;

    content = content.replace(/activeGuests\.filter\(guest =>.*?\)/s, finalFilter);
    
    // Ensure Summary Card only reflects April 16th cash
    content = content.replace(/allTransactions\.filter\(.*?\)\.reduce/g, 
        `allTransactions.filter(t => t.date === "${targetDate}").reduce`);

    fs.writeFileSync(crmPath, content);
    console.log("✅ Double-Lock Applied: Nafiz, Kutub, and Robin will be removed if balance is 0.");
}