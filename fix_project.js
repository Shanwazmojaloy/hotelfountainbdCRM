const fs = require('fs');
const path = require('path');

// We will allow both yesterday and today to be counted in the "Today" report
const datesToInclude = ["2026-04-15", "2026-04-16"];

const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.html'));

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    
    // Updated Logic: Count any transaction if its date is in our list
    const newLogic = `allTransactions.filter(t => ["2026-04-15", "2026-04-16"].includes(t.date)).reduce`;
    
    // We replace the old strict filter with the new inclusive one
    const updatedContent = content.replace(/allTransactions\.filter\(t => t\.date === "2026-04-16"\)\.reduce/g, newLogic);
    
    fs.writeFileSync(file, updatedContent);
    console.log(`✅ Updated ${file} to include yesterday and today.`);
});