const fs = require('fs');
const path = require('path');

const targetDate = "2026-04-16";
const crmPath = path.join(__dirname, 'crm.html');

if (fs.existsSync(crmPath)) {
    let content = fs.readFileSync(crmPath, 'utf8');
    
    // THE HARD-HIDE LOGIC
    const hardHideFilter = `activeGuests.filter(guest => {
        const name = guest.name ? guest.name.toUpperCase() : "";
        const bannedNames = ["KUTUB UDDIN", "NAFIZ ALAM", "MD ROBIN MIAH"];
        
        const todayPayments = guest.payments ? 
            guest.payments.filter(p => p.date === "${targetDate}") : [];
        const paidToday = todayPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
        
        const balanceDue = Number(guest.billTotal || 0) - Number(guest.paid || 0);

        // 1. If they paid today, ALWAYS show them
        if (paidToday > 0) return true;
        
        // 2. If they are in the 'Past Guest' list and owe 0, ALWAYS hide them
        if (bannedNames.some(bn => name.includes(bn)) && balanceDue <= 0) return false;

        // 3. Otherwise, show only if they still owe money
        return balanceDue > 0;
    })`;

    content = content.replace(/activeGuests\.filter\(guest =>.*?\)/s, hardHideFilter);
    
    // Ensure Summary Card is strictly today's cash
    content = content.replace(/allTransactions\.filter\(.*?\)\.reduce/g, 
        `allTransactions.filter(t => t.date === "${targetDate}").reduce`);

    fs.writeFileSync(crmPath, content);
    console.log("✅ Hard-Hide applied for Kutub, Nafiz, and Robin.");
}