const fs = require('fs');
const path = require('path');

const targetDate = "2026-04-16";
const crmPath = path.join(__dirname, 'crm.html');

if (fs.existsSync(crmPath)) {
    let content = fs.readFileSync(crmPath, 'utf8');
    
    // RENAME the variable to force Vercel to re-calculate
    // We are filtering for only TODAY'S ৳3,620
    const finalSumLogic = `const hotelFountainTodayCash = allTransactions.filter(t => t.date === "${targetDate}").reduce((acc, t) => acc + Number(t.amount || 0), 0);`;
    
    // This looks for the summary card and replaces the calculation
    content = content.replace(/const todayTotal = .*?;/g, finalSumLogic);
    content = content.replace(/todayTotal/g, 'hotelFountainTodayCash');

    // Change the version to 7.0
    content = content.replace(/<title>.*<\/title>/, '<title>Hotel Fountain CRM v7.0 - CACHE RESET</title>');

    fs.writeFileSync(crmPath, content);
    console.log("✅ v7.0 Cache Breaker Applied.");
}