// Check if user is logged in
if (!localStorage.getItem('visaflow_user')) {
  window.location.href = 'signup.html?redirect=scanner.html';
}

const visaRequirements = {
  "B1/B2": {
    documents: [
      { name: "DS-160 Confirmation Page", critical: true, keywords: ["ds-160","ds160","confirmation"] },
      { name: "Valid Passport", critical: true, keywords: ["passport"] },
      { name: "2x2 Color Photograph", critical: true, keywords: ["photo","2x2"] }
    ],
    countrySpecific: {
      india: ["Income Tax Returns (3 years)"]
    }
  },
  "F1": { 
    documents: [ 
      { name: "Form I-20", critical:true, keywords:["i-20","i20"] }, 
      { name: "DS-160", critical:true, keywords:["ds-160"] } 
    ] 
  },
  "H1B": { 
    documents: [ 
      { name: "Form I-129", critical:true, keywords:["i-129"] } 
    ] 
  }
};

const visaTypeSelect = document.getElementById('visaType');
const countryOriginSelect = document.getElementById('countryOrigin');
const requirementsList = document.getElementById('requirementsList');
const fileInfo = document.getElementById('fileInfo');
const analyzeBtn = document.getElementById('analyzeBtn');
const resultsContent = document.getElementById('resultsContent');
const resultsPlaceholder = document.getElementById('resultsPlaceholder');
const loadingIndicator = document.getElementById('loadingIndicator');
const currentStatusSpan = document.getElementById('currentStatus');
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');

let currentFiles = [];
let currentVisaType = '';
let currentCountry = 'general';

visaTypeSelect.addEventListener('change', updateRequirements);
countryOriginSelect.addEventListener('change', updateRequirements);
fileInput.addEventListener('change', handleFileSelect);
analyzeBtn.addEventListener('click', analyzeDocuments);
uploadArea.addEventListener('click', () => fileInput.click());

function updateRequirements(){
  currentVisaType = visaTypeSelect.value;
  currentCountry = countryOriginSelect.value;
  
  if(!currentVisaType){ 
    requirementsList.textContent = 'Select a visa type to see requirements'; 
    analyzeBtn.style.display='none'; 
    return;
  }
  
  const req = visaRequirements[currentVisaType];
  if(!req) { 
    requirementsList.textContent = 'No requirements available'; 
    return;
  }
  
  let html = '';
  req.documents.forEach(d=>{
    html += `<div class="req-item">
      <strong>${d.name}</strong>${d.critical?'<span class="req-critical">(Critical)</span>':''}
      <div class="req-keywords">${d.keywords.join(', ')}</div>
    </div>`;
  });
  
  if(req.countrySpecific && req.countrySpecific[currentCountry]){
    html += '<div class="req-item"><strong>Country-specific:</strong>';
    req.countrySpecific[currentCountry].forEach(c=> html += `<div class="req-keywords">• ${c}</div>`);
    html += '</div>';
  }
  
  requirementsList.innerHTML = html;
  analyzeBtn.style.display = currentFiles.length ? 'inline-flex' : 'none';
}

function handleFileSelect(e){
  const files = Array.from(e.target.files || []);
  const valid = files.filter(f=> {
    const t = f.type;
    const ok = t.startsWith('image/') || t === 'application/pdf';
    const sizeOk = f.size <= 10 * 1024 * 1024;
    if(!ok) alert('Unsupported file: '+f.name);
    if(!sizeOk) alert('File too large: '+f.name+' (max 10MB)');
    return ok && sizeOk;
  });
  
  currentFiles = valid;
  
  if(valid.length){
    uploadArea.querySelector('h4').textContent = `${valid.length} File(s) Selected`;
    fileInfo.textContent = valid.map(f=>`${f.name} (${(f.size/1024/1024).toFixed(2)} MB)`).join('\n');
    if(currentVisaType) analyzeBtn.style.display='inline-flex';
  } else {
    uploadArea.querySelector('h4').textContent = 'Upload document image';
    fileInfo.textContent = '';
    analyzeBtn.style.display='none';
  }
}

async function analyzeDocuments(){
  if(!currentVisaType || currentFiles.length===0){ 
    alert('Select visa type and upload files'); 
    return;
  }
  
  resultsPlaceholder.style.display='none'; 
  resultsContent.style.display='none'; 
  loadingIndicator.style.display='block'; 
  currentStatusSpan.textContent='Initializing OCR';

  try{
    let allText = '';
    const worker = Tesseract.createWorker({ 
      logger: m => {
        if(m.status) currentStatusSpan.textContent = m.status + (m.progress ? ' '+Math.round(m.progress*100)+'%':'' );
      }
    });
    
    await worker.load(); 
    await worker.loadLanguage('eng'); 
    await worker.initialize('eng');
    
    for(const file of currentFiles){
      currentStatusSpan.textContent = 'Processing '+file.name;
      const { data: { text } } = await worker.recognize(file);
      allText += '\n\n' + text;
    }
    
    await worker.terminate();

    currentStatusSpan.textContent = 'Analyzing content';
    const analysis = performAnalysis(allText, currentVisaType, currentCountry);
    displayResults(analysis, allText);
  }catch(err){
    console.error(err); 
    resultsContent.innerHTML = `<div class="status-badge status-error">Error: ${err.message || err}</div>`; 
    resultsContent.style.display='block';
  }finally{ 
    loadingIndicator.style.display='none'; 
  }
}

function performAnalysis(text, visaType, country){
  const requirements = visaRequirements[visaType];
  const lower = text.toLowerCase();
  const results = { found:[], missing:[], criticalMissing:0, confidence:0, warnings:[] };
  
  requirements.documents.forEach(doc=>{
    let score = 0; 
    doc.keywords.forEach(k=>{ if(lower.includes(k)) score += 1 });
    
    if(score >= 1){ 
      results.found.push({...doc, confidence: Math.min(100, Math.round(score/doc.keywords.length*100))}); 
    } else { 
      results.missing.push(doc); 
      if(doc.critical) results.criticalMissing++; 
    }
  });
  
  if(requirements.countrySpecific && requirements.countrySpecific[country]){
    requirements.countrySpecific[country].forEach(cs=>{
      if(!lower.includes(cs.substring(0,6).toLowerCase())){ 
        results.missing.push({name:cs, critical:true, countrySpecific:true}); 
        results.criticalMissing++; 
      }
    });
  }
  
  const total = requirements.documents.length; 
  results.confidence = Math.round((results.found.length/total)*100);
  
  if(results.criticalMissing) results.warnings.push(`🚨 ${results.criticalMissing} critical documents missing`);
  if(results.confidence < 80) results.warnings.push(`⚠️ Low document confidence (${results.confidence}%)`);
  
  return results;
}

function displayResults(analysis, extractedText){
  let html = '';
  
  if(analysis.criticalMissing>0) {
    html += `<div class="status-badge status-error">HIGH RISK: ${analysis.criticalMissing} critical documents missing</div>`;
  } else if(analysis.confidence >= 90) {
    html += `<div class="status-badge status-success">Ready for submission</div>`;
  } else {
    html += `<div class="status-badge status-warning">Needs review</div>`;
  }

  html += `<div style="margin-bottom:16px;font-size:14px"><strong>Document Confidence:</strong> ${analysis.confidence}%</div>`;
  
  if(analysis.warnings.length){ 
    html += `<div style="color:var(--text-muted);margin-bottom:16px;font-size:14px">${analysis.warnings.join('<br>')}</div>` 
  }

  html += '<div class="results-grid">';
  html += `<div class="results-col"><h4>Verified (${analysis.found.length})</h4>`;
  analysis.found.forEach(f=> html += `<div class="result-item"><strong>${f.name}</strong><div>Confidence: ${f.confidence}%</div></div>`);
  html += `</div><div class="results-col"><h4>Missing (${analysis.missing.length})</h4>`;
  analysis.missing.forEach(m=> html += `<div class="result-item missing-item"><strong>${m.name}</strong>${m.countrySpecific?'<div>Country-specific</div>':''}</div>`);
  html += '</div></div>';

  html += `<details><summary>View Extracted Text</summary><pre>${extractedText.substring(0,5000)}</pre></details>`;

  resultsContent.innerHTML = html; 
  resultsContent.style.display='block';
}