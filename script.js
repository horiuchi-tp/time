// ★★★ GASのウェブアプリURL設定 ★★★
const API_URL = "https://script.google.com/macros/s/AKfycbyH9aWS3TRHF9Ja2OA2-qSJk9KyR9SuAt88v8hWu2MFrURp-dnuDSi9__1K1JWyNHpS/exec";

document.addEventListener('DOMContentLoaded', () => {
  const visitDateInput = document.getElementById('visitDate');
  const staffCodeInput = document.getElementById('staffCode');
  const staffCodeError = document.getElementById('staffCodeError');
  const phoneTimeFields = document.getElementById('phoneTimeFields');
  const submitBtn = document.getElementById('submitBtn');
  const openSearchModalBtn = document.getElementById('openSearchModalBtn');
  const successModalOverlay = document.getElementById('successModalOverlay');
  const successModal = document.getElementById('successModal');
  const successOkBtn = document.getElementById('successOkBtn');

  const searchInputModalOverlay = document.getElementById('searchInputModalOverlay');
  const searchResultModalOverlay = document.getElementById('searchResultModalOverlay');
  const searchVisitDate = document.getElementById('searchVisitDate');
  const searchStaffCode = document.getElementById('searchStaffCode');
  const executeSearchBtn = document.getElementById('executeSearchBtn');
  const searchResultArea = document.getElementById('searchResultArea');

  const scannerPopup = document.getElementById('scanner-popup');
  const closeScannerButton = document.getElementById('close-scanner');
  const fallingAlert = document.getElementById('fallingAlert');
  const loadingOverlay = document.getElementById('loadingOverlay'); 
  let codeReader = null;

  let fieldCount = 0;
  const MAX_FIELDS = 50;
  
  function setTomorrowDateAsDefault() {
    const t = new Date(), tm = new Date(t); tm.setDate(t.getDate()+1);
    const iso = tm.toISOString().split('T')[0];
    visitDateInput.value = iso; searchVisitDate.value = iso;
  }
  function loadStaffCode(){ const v = localStorage.getItem('savedStaffCode'); if(v){ staffCodeInput.value = v; searchStaffCode.value = v; } }
  function saveStaffCode(){ const v = staffCodeInput.value.trim(); if(v) localStorage.setItem('savedStaffCode', v); }

  function validateStaffCode(el, errEl){
    const v = el.value.trim();
    const ok = /^\d{4,5}$/.test(v);
    el.classList.toggle('error', !ok);
    if(errEl) errEl.textContent = ok ? '' : '担当者コードは4〜5桁の数字で必須です。';
    return ok;
  }

  function addPhoneTimeField(isFirst=false){
    if (fieldCount>=MAX_FIELDS) return; fieldCount++;
    const id = `field-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
    const div = document.createElement('div'); div.className='input-pair';
    div.id=id; div.dataset.qrFullData=''; div.dataset.customerName='';
    let timeOptions = '<option value="" selected>時間選択</option>'; for(let i=7;i<=21;i++){ timeOptions += `<option value="${i}">${i}:00</option>`; }
    div.innerHTML = `
      <div class="tel-input">
        <label for="tel-${id}">電話番号 (${fieldCount})</label>
        <div class="input-with-icon">
          <input type="tel" id="tel-${id}" placeholder="ハイフン不要" pattern="[0-9]*">
          <span class="icon-inside gallery-icon-inside" role="button" aria-label="画像からQRを読み込み">📁</span>
          <span class="icon-inside camera-icon-inside" role="button" aria-label="QRコードをカメラで入力">📸</span>
          <input type="file" id="file-${id}" accept="image/*" class="hidden">
        </div>
        <div class="customer-name-display" id="name-${id}"></div>
      </div>
      <div class="time-input">
        <label for="time-${id}">時間 (${fieldCount})</label>
        <select id="time-${id}">${timeOptions}</select>
      </div>
      ${!isFirst?`<button class="delete-btn" data-target="${id}" aria-label="削除">&times;</button>`:''}
    `;
    phoneTimeFields.appendChild(div);

    const telInput = div.querySelector(`#tel-${id}`);
    const nameDisplay = div.querySelector(`#name-${id}`);
    const timeSelect = div.querySelector(`#time-${id}`);
    const cameraIcon = div.querySelector('.camera-icon-inside');
    const galleryIcon = div.querySelector('.gallery-icon-inside');
    const fileInput = div.querySelector(`#file-${id}`);

    if(!isFirst) div.querySelector('.delete-btn').addEventListener('click', e => { const t=e.target.dataset.target; document.getElementById(t)?.remove(); fieldCount--; updateFieldLabels(); });
    
    // カメラ起動
    cameraIcon.addEventListener('click', ()=> startScanner(telInput, nameDisplay));
    
    // 画像選択（ローディング表示付き）
    galleryIcon.addEventListener('click', ()=> fileInput.click());
    fileInput.addEventListener('change', async ev => {
      if (ev.target.files && ev.target.files[0]) {
        showLoading(); 
        try {
          await handleImageQR(div, ev.target.files[0], telInput, nameDisplay);
          checkAndAddField(div);
        } catch(e) {
          console.error(e);
        } finally {
          hideLoading(); 
          ev.target.value=''; 
        }
      }
    });
    
    telInput.addEventListener('input', ()=> checkAndAddField(div));
    timeSelect.addEventListener('change', ()=> checkAndAddField(div));
  }
  function updateFieldLabels(){ document.querySelectorAll('.input-pair').forEach((p,i)=>{ p.querySelector('.tel-input label').textContent=`電話番号 (${i+1})`; p.querySelector('.time-input label').textContent=`時間 (${i+1})`; }); }
  function checkAndAddField(pair){ const tel=pair.querySelector('input[type="tel"]'), sel=pair.querySelector('select'); const isLast=!pair.nextElementSibling; if(isLast && tel.value.trim()!=='' && sel.value!=='') addPhoneTimeField(); }

  // ---- 画像 → QR（ハイブリッド高速化版） ----
  async function handleImageQR(pairDiv, file, telInput, nameDisplay){
    try{
      const texts = await detectQRCandidates(file);
      if(!texts.length){ alert('QRが検出できませんでした。'); return; }
      let best=null, bestScore=-999;
      for(const t of texts){ const s=scoreCustomerQR(t); if(s>bestScore){ bestScore=s; best=t; } }
      if(best===null || bestScore<7){ alert('顧客情報形式のQRが見つかりませんでした。'); return; }
      const parts = best.split(',').map(x=>(x||'').trim());
      const tel = (parts[1]||'').replace(/-/g,''); const cust = parts[2]||'';
      if(!/^0\d{9,10}$/.test(tel)){ alert('QR内の電話番号形式が想定外です。'); return; }
      telInput.value=tel; nameDisplay.textContent = cust?`(${cust} 様)`:''; pairDiv.dataset.customerName=cust; pairDiv.dataset.qrFullData=best;
    }catch(e){ console.error(e); alert('読み取りエラーが発生しました。'); }
  }

  // ★修正: 2段階解析ロジック
  async function detectQRCandidates(file){
    const img = await loadImageFromFile(file);
    const canvases = [];
    
    // 1. まずリサイズ版（高速）を用意
    const MAX_DIM = 1200;
    let scale = 1.0;
    let resized = false;
    if (img.width > MAX_DIM || img.height > MAX_DIM) {
      scale = MAX_DIM / Math.max(img.width, img.height);
      resized = true;
    }

    // パターンA: リサイズ画像（通常）
    canvases.push(drawToCanvas(img, scale, false));
    // パターンB: リサイズ画像（白黒強調）
    canvases.push(drawToCanvas(img, scale, true));

    // パターンC: 元のサイズ（保険）
    // リサイズしていた場合のみ、最後に元画像も解析リストへ入れる
    if (resized) {
       canvases.push(drawToCanvas(img, 1.0, false));
    }

    // 解析実行（見つかり次第終了）
    if('BarcodeDetector' in window){
      try{
        const det = new BarcodeDetector({formats:['qr_code']});
        for(const c of canvases){
          const bitmap = await createImageBitmap(c);
          const codes = await det.detect(bitmap);
          const vals = codes.map(x=>(x.rawValue||'').trim()).filter(Boolean);
          if(vals.length) return uniq(vals); // 見つかったら即リターン（高速）
        }
      }catch(e){ console.warn('BarcodeDetector失敗→ZXing', e); }
    }

    // ZXing 試行（BarcodeDetectorが使えない、または見つからなかった場合）
    const reader = new ZXing.BrowserQRCodeReader();
    const out = [];
    for(const c of canvases){
      await tryZXing(reader, c, out);
      if(out.length > 0) break; // 見つかったら即終了
    }
    return uniq(out.filter(Boolean));
  }

  function scoreCustomerQR(text){
    let score=0; const t=(text||'').trim(); const p=t.split(',');
    if(p.length===4) score+=5;
    const ord=(p[0]||'').trim(); if(/^[0-9A-Za-z\-]{10,18}$/.test(ord)) score+=2;
    const tel=(p[1]||'').replace(/-/g,'').trim(); if(/^0\d{9,10}$/.test(tel)) score+=4;
    const name=(p[2]||'').trim(); if(/^[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}・\sA-Za-z0-9\-（）()]+$/u.test(name) && name.length>=1) score+=2;
    const addr=(p[3]||'').trim(); if(/(都|道|府|県|市|区|郡|町|村|丁目|番地|号|〒)/.test(addr)) score+=3;
    if(/https?:\/\/(goo\.gl\/maps|maps\.google|map\.app|yahoo\.co\.jp\/map)/i.test(t)) score-=5;
    if(/https?:\/\//i.test(t) && p.length<3) score-=3;
    return score;
  }
  async function loadImageFromFile(file){
    try{ return await createImageBitmap(file, { imageOrientation:'from-image' }); }
    catch(_){
      const img = await new Promise((res,rej)=>{ const u=URL.createObjectURL(file); const i=new Image(); i.onload=()=>{URL.revokeObjectURL(u); res(i)}; i.onerror=rej; i.src=u; });
      const c = document.createElement('canvas'); c.width=img.naturalWidth; c.height=img.naturalHeight;
      c.getContext('2d').drawImage(img,0,0);
      return await createImageBitmap(c);
    }
  }
  function drawToCanvas(bitmap, scale=1.0, bin=false){
    const w=Math.round(bitmap.width*scale), h=Math.round(bitmap.height*scale);
    const c=document.createElement('canvas'); c.width=w; c.height=h;
    const ctx=c.getContext('2d',{willReadFrequently:true});
    ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
    ctx.drawImage(bitmap,0,0,w,h);
    if(bin){
      const img=ctx.getImageData(0,0,w,h); const d=img.data;
      const gray=new Uint8ClampedArray(w*h);
      for(let i=0,j=0;i<d.length;i+=4,j++){ gray[j]= (d[i]*0.299 + d[i+1]*0.587 + d[i+2]*0.114)|0; }
      let sum=0; for(const v of gray) sum+=v; const mean=sum/gray.length;
      let varsum=0; for(const v of gray) varsum+=(v-mean)*(v-mean); const std=Math.sqrt(varsum/gray.length);
      const thr=Math.min(255, Math.max(0, mean - 0.2*std));
      for(let i=0,j=0;i<d.length;i+=4,j++){ const v = gray[j] < thr ? 0 : 255; d[i]=d[i+1]=d[i+2]=v; }
      ctx.putImageData(img,0,0);
    }
    return c;
  }
  async function tryZXing(reader, canvas, out){
    try{
      const dataUrl = canvas.toDataURL('image/png');
      const img = await new Promise((res,rej)=>{ const el=new Image(); el.onload=()=>res(el); el.onerror=rej; el.src=dataUrl; });
      const r = await reader.decodeFromImageElement(img);
      if(r && r.text) out.push((r.text||'').trim());
    }catch(_){ /* 無視 */ }
  }
  function uniq(a){ return Array.from(new Set(a)); }

  // ---- カメラQR ----
  function startScanner(telInput, nameDisplay){
    if (typeof ZXing==='undefined'){ alert('スキャナライブラリの読み込みに失敗しました。'); return; }
    codeReader = new ZXing.BrowserMultiFormatReader(); scannerPopup.style.display='flex';
    codeReader.listVideoInputDevices().then(devs=>{
      if(devs.length>0){
        codeReader.decodeFromVideoDevice(undefined,'scanner-video',(result,err)=>{
          if(result){
            const txt=result.getText();
            const parent=telInput.closest('.input-pair'); parent.dataset.qrFullData=txt;
            const common=(txt.split('||')[0]||'').split(',');
            const phone=common.length>1?(common[1]||'').replace(/-/g,''):'';
            const cust=common.length>2?(common[2]||'').trim():'';
            parent.dataset.customerName=cust; telInput.value=phone; nameDisplay.textContent=cust?`(${cust} 様)`:''; stopScanner();
            const sel=parent.querySelector('select'); if(sel) sel.focus(); checkAndAddField(parent);
          }
          if(err && !(err instanceof ZXing.NotFoundException)){ console.error(err); stopScanner(); }
        });
      }else{ alert("利用可能なカメラが見つかりませんでした。"); stopScanner(); }
    }).catch(err=>{ console.error(err); alert("カメラへのアクセス中にエラーが発生しました。"); stopScanner(); });
  }
  function stopScanner(){ if(codeReader){ codeReader.reset(); } scannerPopup.style.display='none'; }

  function showFallingAlert(text='記入漏れアリ！'){
    fallingAlert.textContent = text;
    fallingAlert.classList.remove('show');
    void fallingAlert.offsetWidth;
    fallingAlert.classList.add('show');
  }

  // ローディング制御
  function showLoading() { loadingOverlay.style.display = 'flex'; }
  function hideLoading() { loadingOverlay.style.display = 'none'; }

  // ---- 送信まわり（fetch使用） ----
  function validateForm(){
    let ok=true;
    visitDateInput.classList.remove('error'); staffCodeInput.classList.remove('error'); staffCodeError.textContent='';
    if(visitDateInput.value.trim()===''){ visitDateInput.classList.add('error'); ok=false; }
    if(!validateStaffCode(staffCodeInput, staffCodeError)) ok=false;
    const pairs=document.querySelectorAll('.input-pair'); let has=false, bad=false;
    pairs.forEach(p=>{ const t=p.querySelector('input[type="tel"]').value.trim(); const m=p.querySelector('select').value.trim();
      p.querySelector('input[type="tel"]').classList.remove('error'); p.querySelector('select').classList.remove('error');
      if(t!=='' && m!=='') has=true;
      else if(t!=='' || m!==''){ bad=true; if(t==='') p.querySelector('input[type="tel"]').classList.add('error'); if(m==='') p.querySelector('select').classList.add('error'); }
    });
    if(!ok || bad || (!has && !bad)){ showFallingAlert('記入漏れアリ！'); return false; }
    return true;
  }

  function onSuccess(msg){
    console.log(msg); saveStaffCode(); phoneTimeFields.innerHTML=''; fieldCount=0; addPhoneTimeField(true);
    submitBtn.disabled=false; submitBtn.textContent='送信';
    hideLoading();
    successModalOverlay.style.display='flex';
    successModal.classList.remove('show'); void successModal.offsetWidth; successModal.classList.add('show');
  }
  function onFailure(err){
    hideLoading();
    alert('残念！送信失敗です！\nもう一度送信してください。\n\nエラー内容: '+err.message);
    submitBtn.disabled=false; submitBtn.textContent='送信';
  }

  submitBtn.addEventListener('click', ()=>{
    if(!validateForm()) return;
    const dataPairs=[]; document.querySelectorAll('.input-pair').forEach(p=>{
      const tel=p.querySelector('input[type="tel"]').value.trim(); const tim=p.querySelector('select').value.trim();
      if(tel!=='' && tim!==''){ dataPairs.push({ tel:tel, time:tim, qrData:p.dataset.qrFullData, customerName:p.dataset.customerName }); }
    });
    if(!dataPairs.length){ showFallingAlert('記入漏れアリ！'); return; }
    
    submitBtn.disabled=true; submitBtn.textContent='送信中...';
    showLoading();

    const payload = {
      visitDate: visitDateInput.value,
      staffCode: staffCodeInput.value.trim(),
      dataPairs: dataPairs
    };

    fetch(API_URL, {
      method: "POST",
      body: JSON.stringify(payload)
    })
    .then(response => response.json())
    .then(result => {
      if(result.status === 'success') onSuccess(result.message);
      else onFailure(new Error(result.message));
    })
    .catch(err => onFailure(err));
  });

  openSearchModalBtn.addEventListener('click', ()=>{ searchInputModalOverlay.style.display='flex'; });

  executeSearchBtn.addEventListener('click', ()=>{
    const date=searchVisitDate.value; const code=searchStaffCode.value.trim(); let ok=true;
    searchVisitDate.classList.remove('error'); searchStaffCode.classList.remove('error');
    if(date===''){ searchVisitDate.classList.add('error'); ok=false; }
    if(!/^\d{4,5}$/.test(code)){ searchStaffCode.classList.add('error'); ok=false; }
    if(!ok){ showFallingAlert('記入漏れアリ！'); return; }
    
    executeSearchBtn.disabled=true; executeSearchBtn.textContent='検索中...'; searchResultArea.innerHTML='<p>検索しています...</p>';

    const url = `${API_URL}?action=search&date=${date}&code=${code}`;

    fetch(url)
    .then(response => response.json())
    .then(result => {
      executeSearchBtn.disabled=false; executeSearchBtn.textContent='この条件で検索';
      if(result.status === 'success'){
        const results = result.data;
if (results && results.length > 0) {
          // テーブル生成（4列：訪問日、顧客名、電話番号、時間）※F列削除
          let html = '<table class="result-table"><thead><tr><th>訪問日</th><th>顧客名</th><th>電話番号</th><th>時間</th></tr></thead><tbody>';
          
          results.forEach(r => {
            const tel = String(r.tel1 || '');
            const maskedTel = tel.length > 4 ? '****' + tel.substring(tel.length - 4) : tel;
            const timeDisplay = r.time ? r.time + ':00' : '';
            
            html += `<tr>
              <td>${r.date || ''}</td>
              <td>${r.customerName || ''}</td>
              <td>${maskedTel}</td>
              <td>${timeDisplay}</td>
            </tr>`;
          });
          
          html += '</tbody></table>';
          searchResultArea.innerHTML = html;
        } else {
          searchResultArea.innerHTML = '<p>指定された条件に一致する記録は見つかりませんでした。</p>';
        }
        searchInputModalOverlay.style.display = 'none';
        searchResultModalOverlay.style.display = 'flex';
      } else {        alert(`検索に失敗しました: ${result.message}`);
      }
    })
    .catch(err => {
      executeSearchBtn.disabled=false; executeSearchBtn.textContent='この条件で検索'; 
      alert(`検索に失敗しました: ${err.message}`);
    });
  });

  document.querySelectorAll('.modal-close-btn').forEach(b=>b.addEventListener('click', ()=>document.querySelectorAll('.modal-overlay').forEach(m=>m.style.display='none')));
  document.querySelectorAll('.modal-overlay').forEach(ov=>ov.addEventListener('click', e=>{ if(e.target===ov) document.querySelectorAll('.modal-overlay').forEach(m=>m.style.display='none'); }));
  successOkBtn.addEventListener('click', ()=>document.querySelectorAll('.modal-overlay').forEach(m=>m.style.display='none'));
  closeScannerButton.addEventListener('click', ()=>{ if(codeReader) codeReader.reset(); scannerPopup.style.display='none'; });

  setTomorrowDateAsDefault(); loadStaffCode(); addPhoneTimeField(true);
});