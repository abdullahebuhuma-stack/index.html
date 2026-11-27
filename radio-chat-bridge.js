(function () {
  'use strict';
  window.RadioAITelegram = function (options) {
    const api = options.api.replace(/\/+$/, '');
    const storageKey = 'radioai-telegram-messages-v1';
    const entries = new Map();
    const save = () => { try { localStorage.setItem(storageKey, JSON.stringify([...entries.values()].map(({timer,...entry}) => entry))); } catch (_) {} };
    const status = (entry, value) => { entry.status=value; save(); options.onStatus(entry,value); };
    const schedule = entry => {
      clearTimeout(entry.timer);
      if (Date.now()-entry.createdAt > 3600000) return;
      entry.timer=setTimeout(()=>poll(entry),document.hidden?20000:5000);
    };
    const poll = async entry => {
      try {
        const response=await fetch(api+'/reply?id='+encodeURIComponent(entry.id)+'&after='+entry.cursor,{
          headers:{'X-RadioAI-Reply-Token':entry.replyToken},cache:'no-store',signal:AbortSignal.timeout(12000)
        });
        if (response.ok) {
          const result=await response.json();
          if (result.status !== entry.status) status(entry,result.status);
          for (const reply of result.replies || []) {
            if (reply.id <= entry.cursor) continue;
            entry.cursor=reply.id; options.onReply(entry,String(reply.text)); save();
          }
        }
      } catch (_) {}
      schedule(entry);
    };
    const transmit = async (entry, retry=true) => {
      try {
        const response=await fetch(api+'/message',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({id:entry.id,replyToken:entry.replyToken,name:'Dinleyici',text:entry.text}),signal:AbortSignal.timeout(15000)});
        if (!response.ok) { status(entry,response.status===429?'rate_limited':'failed'); return; }
        const result=await response.json(); status(entry,result.status); schedule(entry);
      } catch (_) {
        if (retry) { setTimeout(()=>transmit(entry,false),1500); return; }
        status(entry,'connection_lost'); schedule(entry);
      }
    };
    try {
      const old=JSON.parse(localStorage.getItem(storageKey)||'[]');
      for (const entry of Array.isArray(old)?old.slice(-10):[]) {
        if (!entry || typeof entry.text!=='string' || !/^[\w-]{20,80}$/.test(entry.id) ||
            !/^[a-f0-9]{64}$/.test(entry.replyToken) || Date.now()-entry.createdAt>86400000) continue;
        entries.set(entry.id,entry); options.onMessage(entry); options.onStatus(entry,entry.status);
        if (!entry.cursor) transmit(entry); else poll(entry);
      }
    } catch (_) {}
    document.addEventListener('visibilitychange',()=>{
      if (!document.hidden) for(const entry of entries.values()) { clearTimeout(entry.timer); poll(entry); }
    });
    return {
      send(text) {
        if (!text || text.length>1500) return false;
        const entry={id:crypto.randomUUID(),replyToken:Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join(''),
          text,createdAt:Date.now(),cursor:0,status:'pending'};
        if(entries.size>=10){const oldest=entries.keys().next().value;clearTimeout(entries.get(oldest).timer);entries.delete(oldest);}
        entries.set(entry.id,entry);save();options.onMessage(entry);status(entry,'pending');transmit(entry);return true;
      }
    };
  };
})();
