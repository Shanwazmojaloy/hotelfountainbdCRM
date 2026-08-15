import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const CORS={'Access-Control-Allow-Origin':'*','Content-Type':'application/json'};
const KEY=Deno.env.get('GEMINI_API_KEY')??'';
Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers:CORS});
  if(!KEY) return new Response(JSON.stringify({error:'No key'}),{headers:CORS});
  // List available models
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${KEY}`);
  const d=await r.json();
  const models=(d.models||[]).map((m:any)=>({name:m.name,displayName:m.displayName,supportedMethods:m.supportedGenerationMethods}));
  // Test gemini-1.5-flash-latest
  const test=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${KEY}`,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({contents:[{role:'user',parts:[{text:'Say OK'}]}],generationConfig:{maxOutputTokens:10}})
  });
  const td=await test.json();
  return new Response(JSON.stringify({available_models:models.slice(0,20),test_flash_latest:{status:test.status,response:td}},null,2),{headers:CORS});
});
