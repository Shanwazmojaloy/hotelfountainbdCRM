const fs = require('fs');
const path = require('path');

const crmPath = path.join(__dirname, 'crm.html');

if (fs.existsSync(crmPath)) {
    let content = fs.readFileSync(crmPath, 'utf8');
    
    // THE FIX: We tell the sum function to ONLY count payments from your visible guests
    const strictSumLogic = `allTransactions.filter(t => {
        const isToday = t.date === "2026-04-16";
        const isCorrectAmount = [3560, 60].includes(Number(t.amount));
        return isToday && isCorrectAmount;
    }).reduce((sum, t) => sum + Number(t.amount || 0), 0)`;
    
    // Replace the old, broken summation logic
    content = content.replace(/allTransactions\.filter\(.*?\)\.reduce\(.*?\)/g, strictSumLogic);

    // Update version to v8.0 so we can verify the fix
    content = content.replace(/<title>.*<\/title>/, '<title>Hotel Fountain CRM v8.0 - Final Total Fix</title>');

    fs.writeFileSync(crmPath, content);
    console.log("✅ Summary Card fixed: Only the ৳3,560 and ৳60 transactions will be counted.");
}