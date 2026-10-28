import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
const EMPTY = { name:'', category:'', description:'', ownership:'company', owner_name:'', location_type:'apartment', class_id:'', store_id:'', quantity:'1', purchase_price:'', purchase_date:todayLocal(), serial_number:'', status:'active' }
const money = value => `AED ${Number(value || 0).toLocaleString('en-AE',{minimumFractionDigits:2,maximumFractionDigits:2})}`
const MAX_IMAGE = 200 * 1024

async function optimizeImage(file) {
  if (!file?.type?.startsWith('image/')) throw Error('Choose an image file.')
  if (typeof createImageBitmap !== 'function') throw Error('This browser cannot process the image. Please use an updated browser.')
  const bitmap = await createImageBitmap(file)
  try {
    for (const width of [1400,1100,850,650,450,320]) {
      const ratio = Math.min(1,width / bitmap.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1,Math.round(bitmap.width*ratio))
      canvas.height = Math.max(1,Math.round(bitmap.height*ratio))
      canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height)
      for (const quality of [.82,.68,.5,.35]) {
        const blob = await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality))
        if (blob && blob.size <= MAX_IMAGE) return blob
      }
    }
    throw Error('Image could not be compressed below 200 KB. Choose a different image.')
  } finally { bitmap.close?.() }
}

export default function InventoryControl() {
  const { profile } = useAuth()
  const [assets,setAssets] = useState([])
  const [classes,setClasses] = useState([])
  const [stores,setStores] = useState([])
  const [form,setForm] = useState(EMPTY)
  const [editing,setEditing] = useState(null)
  const [images,setImages] = useState([])
  const [attachments,setAttachments] = useState([])
  const [suppressed,setSuppressed] = useState(()=>{try{return JSON.parse(localStorage.getItem('inventory_hidden_suggestions')||'{}')}catch{return {}}})
  const [suggestOpen,setSuggestOpen] = useState('')
  const [search,setSearch] = useState('')
  const [filter,setFilter] = useState('all')
  const [busy,setBusy] = useState(false)
  const [message,setMessage] = useState('')
  const [transfer,setTransfer] = useState(null)
  const [history,setHistory] = useState(null)
  const [newStore,setNewStore] = useState('')
  const [imageUrls,setImageUrls] = useState({})
  const [photoViewer,setPhotoViewer] = useState(null)
  const [reportLocation,setReportLocation] = useState('all')
  const [reportStatus,setReportStatus] = useState('all')
  const [reportSearch,setReportSearch] = useState('')

  async function load() {
    const [a,c,s,att] = await Promise.all([
      supabase.from('inventory_assets').select('*').order('created_at',{ascending:false}).limit(2000),
      supabase.from('application_classes').select('id,name,active').order('name'),
      supabase.from('inventory_stores').select('*').order('name'),
      supabase.from('inventory_asset_images').select('id,asset_id,image_path,created_at').order('created_at',{ascending:true}).limit(5000)
    ])
    if (a.error || c.error || s.error || att.error) throw Error(a.error?.message || c.error?.message || s.error?.message || att.error?.message)
    setAssets(a.data||[]); setClasses(c.data||[]); setStores(s.data||[]); setAttachments(att.data||[])
    const paths = [...new Set([...(a.data||[]).map(x=>x.image_path),...(att.data||[]).map(x=>x.image_path)].filter(Boolean))]
    if (paths.length) {
      const signed = await supabase.storage.from('inventory-images').createSignedUrls(paths,3600)
      if (!signed.error) setImageUrls(Object.fromEntries((signed.data||[]).filter(x=>x.signedUrl).map(x=>[x.path,x.signedUrl])))
    } else setImageUrls({})
  }
  useEffect(()=>{ load().catch(e=>setMessage(e.message)) },[])
  const className = id => classes.find(x=>String(x.id)===String(id))?.name || 'Unknown apartment'
  const storeName = id => stores.find(x=>String(x.id)===String(id))?.name || 'Unknown store'
  const locationName = x => x.location_type==='apartment' ? className(x.class_id) : storeName(x.store_id)
  const filtered = useMemo(()=>assets.filter(x=>!x.deleted_at && (filter==='all'||x.status===filter) && [x.asset_code,x.name,x.category,x.serial_number,locationName(x)].join(' ').toLowerCase().includes(search.toLowerCase())),[assets,search,filter,classes,stores])
  const reportAssets = useMemo(()=>assets.filter(x=>{
    if(x.deleted_at || (reportStatus!=='all' && x.status!==reportStatus)) return false
    const locationKey = x.location_type==='apartment' ? `apartment:${x.class_id}` : `store:${x.store_id}`
    if(reportLocation!=='all' && locationKey!==reportLocation) return false
    const haystack = [x.asset_code,x.name,x.category,x.serial_number,x.owner_name,locationName(x)].join(' ').toLowerCase()
    return haystack.includes(reportSearch.trim().toLowerCase())
  }).sort((a,b)=>locationName(a).localeCompare(locationName(b)) || a.name.localeCompare(b.name)),[assets,classes,stores,reportLocation,reportStatus,reportSearch])
  const reportTotals = useMemo(()=>({quantity:reportAssets.reduce((n,x)=>n+Number(x.quantity||0),0),cost:reportAssets.reduce((n,x)=>n+Number(x.quantity||0)*Number(x.purchase_price||0),0)}),[reportAssets])
  const csvCell = value => `"${String(value??'').replace(/"/g,'""')}"`
  function exportReport(){
    const rows=[['Asset ID','Asset Name','Category','Location','Ownership','Owner','Serial Number','System Qty','Physical Qty','Difference','Condition','Remarks','Purchase Date','Unit Price AED','Total Cost AED','Status'],...reportAssets.map(x=>[x.asset_code,x.name,x.category,locationName(x),x.ownership,x.owner_name||'',x.serial_number||'',x.quantity,'','','','',x.purchase_date,x.purchase_price,(Number(x.purchase_price||0)*Number(x.quantity||0)).toFixed(2),x.status])]
    const blob=new Blob(['\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'})
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`inventory-verification-${todayLocal()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
  function printVerification(){
    const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>Inventory Physical Verification</title><style>@page{size:A4 landscape;margin:12mm}body{font:11px Arial,sans-serif;color:#111}h1{font-size:20px;margin:0 0 8px}.meta{margin-bottom:12px}.meta span{margin-right:24px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #777;padding:6px 5px;text-align:left;vertical-align:top}th{background:#eee}tr{break-inside:avoid}thead{display:table-header-group}.sign{margin-top:22px;display:flex;justify-content:space-between;gap:18px}.sign div{width:30%;border-top:1px solid #777;padding-top:6px}@media print{button{display:none}}</style></head><body><h1>Inventory Physical Verification Sheet</h1><div class="meta"><span>Generated: ${escapeHtml(todayLocal())}</span><span>Location: ${escapeHtml(reportLocation==='all'?'All locations':reportLocation.startsWith('apartment:')?className(reportLocation.slice(10)):storeName(reportLocation.slice(6)))}</span><span>Assets: ${reportAssets.length}</span><span>Recorded units: ${reportTotals.quantity}</span></div><table><thead><tr><th>#</th><th>Asset ID</th><th>Asset / Category</th><th>Location</th><th>Serial</th><th>System Qty</th><th>Physical Qty</th><th>Difference</th><th>Condition</th><th>Remarks</th></tr></thead><tbody>${reportAssets.map((x,i)=>`<tr><td>${i+1}</td><td>${escapeHtml(x.asset_code)}</td><td>${escapeHtml(x.name)}<br>${escapeHtml(x.category)}</td><td>${escapeHtml(locationName(x))}</td><td>${escapeHtml(x.serial_number)}</td><td>${escapeHtml(x.quantity)}</td><td style="min-width:45px"></td><td style="min-width:45px"></td><td style="min-width:65px"></td><td style="min-width:90px"></td></tr>`).join('')}</tbody></table><div class="sign"><div>Checked by / Signature</div><div>Verification date</div><div>Reviewed by / Signature</div></div><p>Record discrepancies for review. This sheet does not change inventory quantities.</p></body></html>`
    const win=window.open('','_blank','width=1200,height=850')
    if(!win){setMessage('Popup blocked. Allow popups for this site to print the verification sheet.');return}
    win.document.open();win.document.write(html);win.document.close();win.focus()
  }
  function openPhotos(paths,index=0){const available=[...new Set(paths.filter(path=>imageUrls[path]))];if(available.length)setPhotoViewer({urls:available.map(path=>imageUrls[path]),index:Math.max(0,Math.min(index,available.length-1))})}
  const set = (field,value) => setForm(f=>({...f,[field]:value}))
  function reset() {images.forEach(x=>URL.revokeObjectURL(x.url));setForm({...EMPTY,purchase_date:todayLocal()});setEditing(null);setImages([])}
  function addImages(files) {
    const accepted=Array.from(files||[]).filter(f=>f.type.startsWith('image/'))
    setImages(prev=>[...prev,...accepted.map(file=>({id:crypto.randomUUID(),file,url:URL.createObjectURL(file)}))])
  }
  function removeImage(id) {setImages(prev=>{const found=prev.find(x=>x.id===id);if(found)URL.revokeObjectURL(found.url);return prev.filter(x=>x.id!==id)})}
  const suggestions = field => [...new Set(assets.map(a=>a[field]?.trim()).filter(Boolean))].filter(v=>!suppressed[field]?.includes(v)).sort((a,b)=>a.localeCompare(b))
  function hideSuggestion(field,value){const next={...suppressed,[field]:[...(suppressed[field]||[]),value]};setSuppressed(next);localStorage.setItem('inventory_hidden_suggestions',JSON.stringify(next))}
  function nameField(field,label){
    const options = suggestions(field).filter(v=>!form[field]||v.toLowerCase().includes(form[field].trim().toLowerCase()))
    return <div style={{position:'relative'}}>
      <label htmlFor={`inventory-${field}`}>{label}</label>
      <input id={`inventory-${field}`} className="form-control" autoComplete="off" value={form[field]}
        onFocus={()=>setSuggestOpen(field)}
        onBlur={()=>setSuggestOpen('')}
        onChange={e=>{set(field,e.target.value);setSuggestOpen(field)}}
        onKeyDown={e=>{if(e.key==='Escape')setSuggestOpen('');if(e.key==='Enter'&&suggestOpen===field&&options.length){e.preventDefault();set(field,options[0]);setSuggestOpen('')}}}
        maxLength={180} required={field==='name'} placeholder={field==='category'?'TV / Fridge / Furniture':''}/>
      {suggestOpen===field&&options.length>0&&<div role="listbox" aria-label={`${label} suggestions`} style={{position:'absolute',top:'100%',left:0,right:0,maxHeight:180,overflowY:'auto',background:'white',border:'1px solid #ccc',zIndex:30,boxShadow:'0 4px 10px #0002'}}>
        {options.map(v=><div key={v} role="option" aria-selected={form[field]===v} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 8px',gap:8}}>
          <button type="button" style={{flex:1,textAlign:'left',background:'none',border:0,cursor:'pointer'}}
            onMouseDown={e=>{e.preventDefault();set(field,v);setSuggestOpen('')}}
            onClick={()=>{set(field,v);setSuggestOpen('')}}>{v}</button>
          <button type="button" title="Hide suggestion (does not delete registered assets)" aria-label={`Hide ${v} from suggestions`}
            onMouseDown={e=>{e.preventDefault();hideSuggestion(field,v)}}
            onClick={()=>hideSuggestion(field,v)} style={{border:0,background:'none',cursor:'pointer',color:'#991b1b'}}>×</button>
        </div>)}
      </div>}
    </div>
  }
  async function deleteAsset(asset){
    if(!window.confirm(`CAUTION: Delete ${asset.asset_code} — ${asset.name}?\n\nThis will hide the asset from the active register. Historical movements will be retained. This action cannot be undone from the inventory screen.`))return
    const reason=window.prompt('Reason for deleting this inventory item (required):','')
    if(reason===null)return
    if(!reason.trim())return setMessage('Deletion cancelled: a reason is required.')
    setBusy(true)
    try{const {error}=await supabase.rpc('inventory_soft_delete_asset',{p_asset_id:asset.id,p_reason:reason.trim()});if(error)throw error;setMessage('Asset deleted from active register; audit history preserved.');await load()}catch(e){setMessage(e.message)}finally{setBusy(false)}
  }
  function editAsset(x) {setEditing(x.id);setImages([]);setForm({name:x.name||'',category:x.category||'',description:x.description||'',ownership:x.ownership,owner_name:x.owner_name||'',location_type:x.location_type,class_id:String(x.class_id||''),store_id:String(x.store_id||''),quantity:String(x.quantity),purchase_price:String(x.purchase_price),purchase_date:x.purchase_date||'',serial_number:x.serial_number||'',status:x.status});window.scrollTo({top:0,behavior:'smooth'})}

  function duplicateAsset(x) {
    images.forEach(img=>URL.revokeObjectURL(img.url))
    setImages([])
    setEditing(null)
    setSuggestOpen('')
    setForm({name:x.name||'',category:x.category||'',description:x.description||'',ownership:x.ownership,
      owner_name:x.owner_name||'',location_type:x.location_type,class_id:String(x.class_id||''),store_id:String(x.store_id||''),
      quantity:String(x.quantity),purchase_price:String(x.purchase_price),purchase_date:todayLocal(),
      serial_number:'',status:'active'})
    setMessage(`New registration copied from ${x.asset_code}. Confirm the location, quantity and purchase details. Serial number and photographs are not copied.`)
    window.scrollTo({top:0,behavior:'smooth'})
  }

  async function save(e) {
    e.preventDefault();setMessage('')
    if (!form.name.trim()) return setMessage('Asset name is required.')
    if (form.location_type==='apartment'&&!form.class_id) return setMessage('Select an apartment.')
    if (form.location_type==='store'&&!form.store_id) return setMessage('Select a store.')
    if (form.ownership==='property_owner'&&!form.owner_name.trim()) return setMessage('Enter the property owner name.')
    if (!Number.isInteger(Number(form.quantity))||Number(form.quantity)<1) return setMessage('Quantity must be a positive whole number.')
    if (form.serial_number.trim() && Number(form.quantity)!==1) return setMessage('Serialized assets must have quantity 1.')
    if (form.purchase_price===''||!Number.isFinite(Number(form.purchase_price))||Number(form.purchase_price)<0) return setMessage('Enter a valid purchase price (zero is allowed).')
    setBusy(true)
    const uploadedPaths = []
    try {
      const payload = {name:form.name.trim(),category:form.category.trim(),description:form.description.trim(),ownership:form.ownership,owner_name:form.ownership==='property_owner'?form.owner_name.trim():null,purchase_price:Number(form.purchase_price),purchase_date:form.purchase_date||null,serial_number:form.serial_number.trim()||null,status:form.status}
      // The live SQL grants no direct UPDATE on quantity or location.
      // These fields must only be supplied when creating an asset.
      if (!editing) payload.quantity = Number(form.quantity)
      if (!editing) Object.assign(payload,{location_type:form.location_type,class_id:form.location_type==='apartment'?form.class_id:null,store_id:form.location_type==='store'?form.store_id:null})
      const result=editing?await supabase.from('inventory_assets').update(payload).eq('id',editing).select('id').single():await supabase.from('inventory_assets').insert(payload).select('id').single()
      if (result.error) throw Error(result.error.message)
      let imageErrors=[]
      for(const entry of images){
        try{
          const blob=await optimizeImage(entry.file)
          const path=`${crypto.randomUUID()}.webp`
          const upload=await supabase.storage.from('inventory-images').upload(path,blob,{contentType:'image/webp',upsert:false})
          if(upload.error)throw upload.error
          uploadedPaths.push(path)
          const saved=await supabase.from('inventory_asset_images').insert({asset_id:result.data.id,image_path:path})
          if(saved.error)throw saved.error
        }catch(err){imageErrors.push(`${entry.file.name}: ${err.message}`)}
      }
      // Keep the uploaded image if the asset-image record succeeded; remove orphaned objects only.
      const registered=(await supabase.from('inventory_asset_images').select('image_path').eq('asset_id',result.data.id)).data||[]
      const used=new Set(registered.map(x=>x.image_path))
      const orphans=uploadedPaths.filter(x=>!used.has(x))
      if(orphans.length)await supabase.storage.from('inventory-images').remove(orphans)
      setMessage((editing?'Asset updated.':'Asset registered.')+(imageErrors.length?` Some images failed: ${imageErrors.join('; ')}`:''));reset();await load()
    } catch(err) {
      setMessage(err.message)
    } finally {setBusy(false)}
  }
  async function addStore(e) {
    e.preventDefault();if (!newStore.trim()) return
    setBusy(true)
    try {const {error}=await supabase.from('inventory_stores').insert({name:newStore.trim()});if(error)throw Error(error.message);setNewStore('');await load();setMessage('Store created.')}catch(e){setMessage(e.message)}finally{setBusy(false)}
  }
  async function moveAsset(e) {
    e.preventDefault();setBusy(true)
    try {
      const qty=Number(transfer.qty)
      if (!Number.isInteger(qty)||qty<1||qty>transfer.asset.quantity) throw Error('Invalid transfer quantity.')
      const {error}=await supabase.rpc('inventory_transfer_asset',{p_asset_id:transfer.asset.id,p_quantity:qty,p_location_type:transfer.location_type,p_class_id:transfer.location_type==='apartment'?transfer.class_id||null:null,p_store_id:transfer.location_type==='store'?transfer.store_id||null:null,p_note:transfer.note||''})
      if(error)throw Error(error.message)
      setTransfer(null);setMessage('Transfer completed.');await load()
    }catch(e){setMessage(e.message)}finally{setBusy(false)}
  }
  async function showHistory(asset) {
    setHistory({asset,rows:[],loading:true})
    const {data,error}=await supabase.from('inventory_movements').select('*').eq('asset_id',asset.id).order('created_at',{ascending:false}).limit(100)
    setHistory({asset,rows:data||[],error:error?.message,loading:false})
  }
  const locationInputs = (value,onChange,allowInactive=false) => <>
    <label>Location type<select className="form-control" value={value.location_type} onChange={e=>onChange({...value,location_type:e.target.value,class_id:'',store_id:''})}><option value="apartment">Apartment / UnitClass</option><option value="store">Central warehouse / store</option></select></label>
    {value.location_type==='apartment'?<label>Apartment / UnitClass<select className="form-control" value={value.class_id||''} required onChange={e=>onChange({...value,class_id:e.target.value})}><option value="">Select apartment</option>{classes.filter(x=>x.active||(allowInactive&&String(x.id)===String(value.class_id))).map(x=><option key={x.id} value={x.id}>{x.name}{!x.active?' (inactive)':''}</option>)}</select></label>:<label>Warehouse / Store<select className="form-control" value={value.store_id||''} required onChange={e=>onChange({...value,store_id:e.target.value})}><option value="">Select store</option>{stores.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
  </>
  return <div>
    <div className="page-header"><h1>Asset Inventory Control</h1><p>Apartment and warehouse assets · purchase cost · ownership · movements</p></div>
    {message&&<div className="alert alert-info" role="status">{message}</div>}
    <div className="card"><div className="card-body"><h3>{editing?'Edit Asset':'Register Asset'}</h3>
      <form onSubmit={save}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}}>
          {nameField('name','Asset name *')}
          {nameField('category','Category')}
          <label>Purchase price (AED) *<input className="form-control" type="text" inputMode="decimal" value={form.purchase_price} onChange={e=>set('purchase_price',e.target.value)} required/></label>
          <label>Quantity *<input className="form-control" type="number" min="1" step="1" value={form.quantity} disabled={!!editing} onChange={e=>set('quantity',e.target.value)}/></label>
          <label>Ownership<select className="form-control" value={form.ownership} onChange={e=>set('ownership',e.target.value)}><option value="company">Company-owned</option><option value="property_owner">Property-owner-owned</option></select></label>
          {form.ownership==='property_owner'&&<label>Owner name *<input className="form-control" value={form.owner_name} onChange={e=>set('owner_name',e.target.value)} required/></label>}
          {!editing&&locationInputs(form,setForm)}
          <label>Purchase date<input className="form-control" type="date" value={form.purchase_date} onChange={e=>set('purchase_date',e.target.value)}/></label>
          <label>Serial number<input className="form-control" value={form.serial_number} onChange={e=>set('serial_number',e.target.value)}/></label>
          <label>Status<select className="form-control" value={form.status} onChange={e=>set('status',e.target.value)}><option value="active">Active</option><option value="repair">Under repair</option><option value="damaged">Damaged</option><option value="disposed">Disposed</option><option value="lost">Lost</option></select></label>
          <label>Asset photographs (max 200 KB each stored)<input className="form-control" type="file" accept="image/*" multiple onChange={e=>{addImages(e.target.files);e.target.value=""}}/></label>
        </div>
        {images.length>0&&<div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:12}}>{images.map(img=><div key={img.id} style={{border:'1px solid #ddd',padding:6,borderRadius:6}}><button type="button" title="View attachment" onClick={()=>setPhotoViewer({urls:images.map(x=>x.url),index:images.findIndex(x=>x.id===img.id)})} style={{padding:0,border:0,background:"none",cursor:"zoom-in"}}><img src={img.url} alt={img.file.name} style={{width:90,height:80,objectFit:'cover'}}/></button><div style={{maxWidth:100,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:11}}>{img.file.name}</div><button type="button" className="btn btn-outline btn-sm" onClick={()=>removeImage(img.id)}>Remove</button></div>)}</div>}
        <label style={{display:'block',marginTop:12}}>Notes<textarea className="form-control" rows="2" value={form.description} onChange={e=>set('description',e.target.value)}/></label>
        <div style={{display:'flex',gap:8,marginTop:12}}><button className="btn btn-primary" disabled={busy}>{busy?'Saving…':editing?'Update Asset':'Save Asset'}</button>{editing&&<button className="btn btn-outline" type="button" onClick={reset}>Cancel Edit</button>}</div>
      </form>
    </div></div>
    <div className="card" style={{marginTop:16}}><div className="card-body"><h3>Warehouse / Store Master</h3><form onSubmit={addStore} style={{display:'flex',gap:8,flexWrap:'wrap'}}><input className="form-control" style={{flex:'1 1 240px'}} placeholder="New store name" value={newStore} onChange={e=>setNewStore(e.target.value)}/><button className="btn btn-outline" disabled={busy||!newStore.trim()}>Add Store</button></form></div></div>
    <div className="card" style={{marginTop:16}}><div className="card-body"><h3>Asset Register ({filtered.length})</h3>
      <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}><input className="form-control" style={{flex:'1 1 240px'}} placeholder="Search assets, serials, apartments" value={search} onChange={e=>setSearch(e.target.value)}/><select className="form-control" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All statuses</option>{['active','repair','damaged','disposed','lost'].map(x=><option key={x} value={x}>{x}</option>)}</select></div>
      <div className="table-wrap"><table><thead><tr><th>Image</th><th>Asset ID</th><th>Description</th><th>Location</th><th>Ownership</th><th>Qty</th><th>Unit price</th><th>Total cost</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {filtered.map(x=><tr key={x.id}><td>{(()=>{const pics=[...attachments.filter(a=>a.asset_id===x.id).map(a=>a.image_path),x.image_path].filter(Boolean);return pics.length?<div style={{display:'flex',gap:3,flexWrap:'wrap'}}>{pics.map(path=>imageUrls[path]?<button key={path} type="button" title="Enlarge image" onClick={()=>openPhotos(pics,pics.indexOf(path))} style={{padding:0,border:0,background:"none",cursor:"zoom-in"}}><img src={imageUrls[path]} alt={x.name} style={{width:45,height:42,objectFit:'cover',borderRadius:4}}/></button>:null)}</div>:'—'})()}</td><td>{x.asset_code}</td><td><strong>{x.name}</strong><div className="text-muted">{x.category}{x.serial_number?` · ${x.serial_number}`:''}</div></td><td>{locationName(x)}</td><td>{x.ownership==='company'?'Company':`Owner: ${x.owner_name}`}</td><td>{x.quantity}</td><td>{money(x.purchase_price)}</td><td>{money(x.purchase_price*x.quantity)}</td><td>{x.status}</td><td><div style={{display:'flex',gap:6,flexWrap:'wrap'}}><button className="btn btn-outline" onClick={()=>editAsset(x)}>Edit</button><button className="btn btn-outline" type="button" disabled={busy} onClick={()=>duplicateAsset(x)}>Duplicate</button><button className="btn btn-outline" disabled={x.status==='disposed'||x.status==='lost'} onClick={()=>setTransfer({asset:x,qty:String(x.quantity),location_type:'apartment',class_id:'',store_id:'',note:''})}>Transfer</button><button className="btn btn-outline" onClick={()=>showHistory(x)}>History</button>{['finance','superadmin'].includes(profile?.role)&&<button className="btn btn-danger" disabled={busy} onClick={()=>deleteAsset(x)}>Delete</button>}</div></td></tr>)}
        {!filtered.length&&<tr><td colSpan="10">No assets found.</td></tr>}
      </tbody></table></div>
      <p className="text-muted">Showing up to 2,000 most recently created records. Asset quantities and purchase prices are historical-cost tracking, not accounting depreciation.</p>
    </div></div>
    <div className="card" style={{marginTop:16}}><div className="card-body">
      <h3>Inventory Report &amp; On-site Verification</h3>
      <p className="text-muted">Filter the recorded assets, export a CSV for Excel, or print a count sheet for inventory staff. Physical counts and discrepancies are for review only and do not update the asset register.</p>
      <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'end',marginBottom:12}}>
        <label style={{flex:'1 1 210px'}}>Location<select className="form-control" value={reportLocation} onChange={e=>setReportLocation(e.target.value)}><option value="all">All locations</option><optgroup label="Apartments">{classes.map(x=><option key={x.id} value={`apartment:${x.id}`}>{x.name}</option>)}</optgroup><optgroup label="Warehouses">{stores.map(x=><option key={x.id} value={`store:${x.id}`}>{x.name}</option>)}</optgroup></select></label>
        <label style={{flex:'1 1 130px'}}>Status<select className="form-control" value={reportStatus} onChange={e=>setReportStatus(e.target.value)}><option value="all">All statuses</option>{['active','repair','damaged','disposed','lost'].map(x=><option key={x} value={x}>{x}</option>)}</select></label>
        <label style={{flex:'2 1 220px'}}>Search<input className="form-control" placeholder="Name, category, serial, owner" value={reportSearch} onChange={e=>setReportSearch(e.target.value)}/></label>
        <button type="button" className="btn btn-outline" disabled={!reportAssets.length} onClick={exportReport}>Export CSV</button>
        <button type="button" className="btn btn-primary" disabled={!reportAssets.length} onClick={printVerification}>Print On-site Check Sheet</button>
      </div>
      <p><strong>{reportAssets.length}</strong> asset records · <strong>{reportTotals.quantity}</strong> units · <strong>{money(reportTotals.cost)}</strong> historical cost</p>
      <div className="table-wrap"><table><thead><tr><th>Asset ID</th><th>Asset</th><th>Category</th><th>Location</th><th>Ownership</th><th>Qty</th><th>Unit Cost</th><th>Total Cost</th><th>Status</th></tr></thead><tbody>{reportAssets.map(x=><tr key={x.id}><td>{x.asset_code}</td><td>{x.name}</td><td>{x.category}</td><td>{locationName(x)}</td><td>{x.ownership==='company'?'Company':x.owner_name||'Owner'}</td><td>{x.quantity}</td><td>{money(x.purchase_price)}</td><td>{money(Number(x.purchase_price)*Number(x.quantity))}</td><td>{x.status}</td></tr>)}{!reportAssets.length&&<tr><td colSpan="9">No assets match these filters.</td></tr>}</tbody></table></div>
      <p className="text-muted">Report uses the loaded register (up to 2,000 assets). For a complete audit of larger inventories, pagination will be required.</p>
    </div></div>
    {photoViewer&&<div role="dialog" aria-modal="true" aria-label="Asset photograph" onClick={()=>setPhotoViewer(null)} style={{position:'fixed',inset:0,zIndex:4000,background:'rgba(0,0,0,.85)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div onClick={e=>e.stopPropagation()} style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12}}>
        <div style={{display:'flex',alignItems:'center',gap:14,color:'white'}}><span>Photo {photoViewer.index+1} of {photoViewer.urls.length}</span><button type="button" className="btn btn-outline" onClick={()=>setPhotoViewer(null)}>Close ✕</button></div>
        <img src={photoViewer.urls[photoViewer.index]} alt="Enlarged asset photograph" style={{maxWidth:'95vw',maxHeight:'78vh',objectFit:'contain',borderRadius:6}}/>
        {photoViewer.urls.length>1&&<div style={{display:'flex',gap:12}}><button type="button" className="btn btn-outline" onClick={()=>setPhotoViewer(v=>({...v,index:(v.index+v.urls.length-1)%v.urls.length}))}>← Previous</button><button type="button" className="btn btn-outline" onClick={()=>setPhotoViewer(v=>({...v,index:(v.index+1)%v.urls.length}))}>Next →</button></div>}
      </div>
    </div>}
    {transfer&&<div className="card" style={{marginTop:16}}><div className="card-body"><h3>Transfer — {transfer.asset.name}</h3><form onSubmit={moveAsset}><p>From: {locationName(transfer.asset)} · Available: {transfer.asset.quantity}</p><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}}><label>Quantity<input className="form-control" type="number" min="1" max={transfer.asset.quantity} required value={transfer.qty} onChange={e=>setTransfer({...transfer,qty:e.target.value})}/></label>{locationInputs(transfer,setTransfer)}</div><label>Transfer notes<input className="form-control" value={transfer.note} onChange={e=>setTransfer({...transfer,note:e.target.value})}/></label><div style={{display:'flex',gap:8,marginTop:12}}><button className="btn btn-primary" disabled={busy}>Confirm Transfer</button><button className="btn btn-outline" type="button" onClick={()=>setTransfer(null)}>Cancel</button></div></form></div></div>}
    {history&&<div className="card" style={{marginTop:16}}><div className="card-body"><div style={{display:'flex',justifyContent:'space-between'}}><h3>Movement History — {history.asset.name}</h3><button className="btn btn-outline" onClick={()=>setHistory(null)}>Close</button></div>{history.loading?'Loading…':history.error?<div className="alert alert-info">{history.error}</div>:<div className="table-wrap"><table><thead><tr><th>Date</th><th>Movement</th><th>Qty</th><th>From</th><th>To</th><th>Notes</th></tr></thead><tbody>{history.rows.map(x=><tr key={x.id}><td>{new Date(x.created_at).toLocaleString()}</td><td>{x.movement_type}</td><td>{x.quantity}</td><td>{x.from_location_type==='apartment'?className(x.from_class_id):x.from_location_type==='store'?storeName(x.from_store_id):'—'}</td><td>{x.to_location_type==='apartment'?className(x.to_class_id):x.to_location_type==='store'?storeName(x.to_store_id):'—'}</td><td>{x.note}</td></tr>)}{!history.rows.length&&<tr><td colSpan="6">No movements recorded.</td></tr>}</tbody></table></div>}</div></div>}
  </div>
}
