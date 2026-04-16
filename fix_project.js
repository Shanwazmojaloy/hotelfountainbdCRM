const fs = require('fs');
const path = require('path');

// 1. FIX THE VERCEL BUILD ERROR (Relative Paths)
const routePath = path.join(__dirname, 'src/app/api/orchestrate/route.ts');
if (fs.existsSync(routePath)) {
    let content = fs.readFileSync(routePath, 'utf8');
    // Change @/agents/ or ../../agents/ to the correct relative path
    content = content.replace(/['"](@\/agents\/|\.\.\/\.\.\/agents\/)/g, "'../../../agents/");
    // Fix Supabase service alias too
    content = content.replace(/['"]@\/services\/supabase['"]/g, "'../../../services/supabase'");
    
    fs.writeFileSync(routePath, content);
    console.log('✅ Fixed orchestrate/route.ts imports.');
}

// 2. FIX THE HOTEL FOUNTAIN BILLING LOGIC (Today vs Yesterday)
const crmPath = path.join(__dirname, 'hotel-fountain-crm-fixed.html');
if (fs.existsSync(crmPath)) {
    let html = fs.readFileSync(crmPath, 'utf8');
    const todayStr = new Date().toLocaleDateString('en-CA'); // "2026-04-16"
    
    // Replace the simple reduce with a filter that checks for TODAY'S date only
    const newLogic = `allTransactions.filter(t => t.date === '${todayStr}').reduce(`;
    html = html.replace(/allTransactions\.reduce\(/g, newLogic);
    
    fs.writeFileSync(crmPath, html);
    console.log(`✅ Fixed Billing Logic for Today's Date: ${todayStr}`);
}