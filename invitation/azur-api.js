/* Azur transport: public read-only JSONP + form POST/iframe acknowledgement.
   No CORS bypass service, no unverified no-cors success, no third-party analytics. */
(function () {
  'use strict';
  const cfg=window.AZUR_CONFIG||{};
  const prefix='azur:'+location.pathname+':';
  function randomHex(bytes) {
    if(!window.crypto||!crypto.getRandomValues) throw new Error('secure_browser');
    return Array.from(crypto.getRandomValues(new Uint8Array(bytes)),x=>x.toString(16).padStart(2,'0')).join('');
  }
  function checkApi() {
    if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(cfg.apiUrl||'')) throw new Error('api_config');
  }
  function read(params) {
    return new Promise((resolve,reject)=> {
      try {checkApi();} catch(e) {reject(e);return;}
      const callback='azur_cb_'+randomHex(12), script=document.createElement('script');
      const url=new URL(cfg.apiUrl); Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,v));
      url.searchParams.set('callback',callback);
      const cleanup=()=> {clearTimeout(timer);script.remove();delete window[callback];};
      const timer=setTimeout(()=> {cleanup();reject(new Error('timeout'));},45000);
      window[callback]=data=> {cleanup();data&&data.ok?resolve(data):reject(new Error(data&&data.error||'server_error'));};
      script.onerror=()=> {cleanup();reject(new Error('connection'));}; script.src=url.href;
      document.head.appendChild(script);
    });
  }
  function post(data) {
    return new Promise((resolve,reject)=> {
      try {checkApi();} catch(e) {reject(e);return;}
      if(location.protocol!=='https:') {reject(new Error('https_required'));return;}
      const requestId=randomHex(16), iframe=document.createElement('iframe'), form=document.createElement('form');
      iframe.name='azur_post_'+requestId; iframe.hidden=true; iframe.setAttribute('aria-hidden','true');
      form.method='POST';form.action=cfg.apiUrl;form.target=iframe.name;form.hidden=true;
      const input=document.createElement('input');input.type='hidden';input.name='payload';
      input.value=JSON.stringify({...data,requestId,origin:location.origin});form.appendChild(input);
      const cleanup=()=> {clearTimeout(timer);window.removeEventListener('message',receive);form.remove();iframe.remove();};
      function receive(e) {
        let host=''; try{host=new URL(e.origin).hostname;}catch(_){return;}
        if(!(host==='script.google.com'||host==='script.googleusercontent.com'||host.endsWith('.googleusercontent.com'))) return;
        const p=e.data;
        if(!p||p.type!=='azur-rsvp'||p.requestId!==requestId) return;
        cleanup();p.result&&p.result.ok?resolve(p.result):reject(new Error(p.result&&p.result.error||'server_error'));
      }
      const timer=setTimeout(()=> {cleanup();reject(new Error('timeout'));},60000);
      window.addEventListener('message',receive);
      document.body.append(iframe,form);form.submit();
    });
  }
  function resource(path) {
    if(!path) return '';
    const u=new URL(path,location.href);
    if(u.protocol!=='https:' && !(location.hostname==='localhost'&&u.protocol==='http:')) return '';
    return u.href;
  }
  function normalize(inv) {
    ['design','designBack','stamp','bg'].forEach(k=>inv[k]=resource(inv[k]));
    ['gallery','files','sponsors'].forEach(k=> {
      const items=inv.cfg&&inv.cfg.panel&&inv.cfg.panel[k]&&inv.cfg.panel[k].items||[];
      items.forEach(i=> { if(i.id)i.id=resource(i.id);if(i.logo)i.logo=resource(i.logo); });
    });
    return inv;
  }
  window.AZUR_API={
    prefix,
    load: id=>read({action:'data',inv:id||cfg.defaultEvent||'AZUR-001'}).then(j=>normalize(j.inv)),
    media:id=>Promise.resolve({ok:true,data:resource(id)}),
    send: async payload=> {
      const key=prefix+'edit:'+payload.invId;
      let record;
      try{record=JSON.parse(localStorage.getItem(key)||'null');}catch(e){}
      const email=(payload.people[0].email||'').trim().toLowerCase();
      if(record&&record.confirmed&&record.email!==email) throw new Error('email_change');
      if(!record||record.email!==email) record={email,token:randomHex(32),confirmed:false};
      // Persist BEFORE sending, so a lost acknowledgement can be retried with the same token.
      try{localStorage.setItem(key,JSON.stringify(record));}catch(e){throw new Error('storage_required');}
      const result=await post({action:'rsvp',payload:{...payload,editToken:record.token}});
      record.confirmed=true;
      try{localStorage.setItem(key,JSON.stringify(record));}catch(e){}
      return result;
    }
  };
})();
