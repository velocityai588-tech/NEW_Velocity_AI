import fetch from 'node-fetch';
(async ()=>{
  try{
    const res = await fetch('http://localhost:4000/health');
    console.log('HTTP', res.status);
    const txt = await res.text();
    console.log('BODY:', txt);
  } catch(e){
    console.error('ERR', e);
  }
})();