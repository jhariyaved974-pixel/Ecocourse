(function(){
  var y=document.getElementById("yr"); if(y) y.textContent=new Date().getFullYear();
  var form=document.getElementById("quote-form"); if(!form) return;
  var status=document.getElementById("q-status"), btn=document.getElementById("q-submit");
  // Plan buttons on the B2B page preselect that plan in the form's plan select.
  var plan=document.getElementById("q-plan");
  if(plan) document.querySelectorAll("[data-plan]").forEach(function(a){ a.addEventListener("click",function(){ plan.value=a.getAttribute("data-plan"); }); });
  function say(msg,cls){status.textContent=msg;status.className="status "+(cls||"");}
  form.addEventListener("submit",async function(e){
    e.preventDefault();
    var fd=new FormData(form);
    if(fd.get("website")) { say("Thanks, we'll be in touch.","ok"); return; }
    var name=(fd.get("name")||"").trim(), email=(fd.get("email")||"").trim(), message=(fd.get("message")||"").trim();
    if(!name||!email||!message){ say("Please add your name, email and a short description.","err"); return; }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ say("That email address doesn't look right. Please check it.","err"); return; }
    var cfg=window.AUTOWEBLY||{};
    var row={name:name,email:email,company:(fd.get("company")||"").trim()||null,country:fd.get("country"),
      services:fd.getAll("services"),message:message,page:location.pathname,source:document.referrer||null};
    btn.disabled=true; say("Sending…");
    try{
      var r=await fetch(cfg.supabaseUrl+"/rest/v1/autowebly_leads",{method:"POST",
        headers:{"apikey":cfg.supabaseKey,"Content-Type":"application/json","Prefer":"return=minimal"},
        body:JSON.stringify(row)});
      if(!r.ok) throw new Error(r.status);
      form.reset(); say("Thanks, "+name.split(" ")[0]+". Your request is in. We'll reply within one working day.","ok");
    }catch(err){
      say("Your request didn't send. Please email vedjhariya009@gmail.com instead and we'll reply the same way.","err");
    }finally{ btn.disabled=false; }
  });
})();
