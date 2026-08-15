import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const SB="https://mynwfkgksqqwlqowlscj.supabase.co";
const KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
// SECURITY 2026-08-15: a live token was hardcoded here and is redacted in this repo.
// Rotate it, set the env var in Supabase Edge Function secrets, then redeploy.
const NT_TOKEN=Deno.env.get("NETLIFY_TOKEN")??"";
const SITE_ID="f8849319-3de0-445e-a087-0d0512947553";

Deno.serve(async(req:Request)=>{
  const {action}=await req.json().catch(()=>({action:"status"}));
  const res:Record<string,unknown>={};
  
  if(action==="deploy"){
    if(!NT_TOKEN) return new Response(JSON.stringify({error:"NETLIFY_TOKEN is not configured"}),{status:503,headers:{"Content-Type":"application/json"}});
    // Deploy HTML to Netlify via API
    const html_b64=Deno.env.get("HTML_B64")??""; // fallback
    // Try fetching the HTML from Supabase storage
    const sr=await fetch(SB+"/storage/v1/object/public/crm-app/index.html");
    res.storage_status=sr.status;
    if(sr.ok){
      const html=await sr.text();
      res.html_size=html.length;
      // Deploy to Netlify
      const dr=await fetch(`https://api.netlify.com/api/v1/sites/${SITE_ID}/deploys`,{
        method:"POST",
        headers:{Authorization:"Bearer "+NT_TOKEN,"Content-Type":"application/zip"}
      });
      res.netlify={status:dr.status,body:(await dr.text()).slice(0,200)};
    }
  } else {
    // Count current guests
    const gr=await fetch(SB+"/rest/v1/guests?select=count",{headers:{apikey:KEY,Authorization:"Bearer "+KEY,Prefer:"count=exact","Range-Unit":"items",Range:"0-0"}});
    res.guest_count=gr.headers.get("content-range");
    res.status="ok";
  }
  return new Response(JSON.stringify(res,null,2),{headers:{"Content-Type":"application/json"}});
});
