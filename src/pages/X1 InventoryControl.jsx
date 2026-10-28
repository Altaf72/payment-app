import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const EMPTY = { name:'', category:'', description:'', ownership:'company', owner_name:'', location_type:'apartment', class_id:'', store_id:'', quantity:'1', purchase_price:'', purchase_date:'', serial_number:'', status:'active' }
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
  const [assets,setAssets] = useState([])
  const [classes,setClasses] = useState([])
  const [stores,setStores] = useState([])
  const [form,setForm] = useState(EMPTY)
  const [editing,setEditing] = useState(null)
  const [image,setImage] = useState(null)
  const [search,setSearch] = useState('')
  const [filter,setFilter] = useState('all')
  const [busy,setBusy] = useState(false)
  const [message,setMessage] = useState('')
  const [transfer,setTransfer] = useState(null)
  const [history,setHistory] = useState(null)
  const [newStore,setNewStore] = useState('')
  const [imageUrls,setImageUrls] = useState({})

  async function load() {
    const [a,c,s] = await Promise.all([
      supabase.from('inventory_assets').select('*').order('created_at',{ascending:false}).limit(2000),
      supabase.from('application_classes').select('id,name,active').order('name'),
      supabase.from('inventory_stores').select('*').order('name')
    ])
    if (a.error || c.error || s.error) throw Error(a.error?.message || c.error?.message || s.error?.message)
    setAssets(a.data||[]); setClasses(c.data||[]); setStores(s.data||[])
    const paths = [...new Set((a.data||[]).map(x=>x.image_path).filter(Boolean))]
    if (paths.length) {
      const signed = await supabase.storage.from('inventory-images').createSignedUrls(paths,3600)
      if (!signed.error) setImageUrls(Object.fromEntries((signed.data||[]).filter(x=>x.signedUrl).map(x=>[x.path,x.signedUrl])))
    } else setImageUrls({})
  }
  useEffect(()=>{ load().catch(e=>setMessage(e.message)) },[])
  const className = id => classes.find(x=>String(x.id)===String(id))?.name || 'Unknown apartment'
  const storeName = id => stores.find(x=>String(x.id)===String(id))?.name || 'Unknown store'
  const locationName = x => x.location_type==='apartment' ? className(x.class_id) : storeName(x.store_id)
  const filtered = useMemo(()=>assets.filter(x=>(filter==='all'||x.status===filter) && [x.asset_code,x.name,x.category,x.serial_number,locationName(x)].join(' ').toLowerCase().includes(search.toLowerCase())),[assets,search,filter,classes,stores])
  const set = (field,value) => setForm(f=>({...f,[field]:value}))
  function reset() {setForm(EMPTY);setEditing(null);setImage(null)}
  function editAsset(x) {setEditing(x.id);setImage(null);setForm({name:x.name||'',category:x.category||'',description:x.description||'',ownership:x.ownership,owner_name:x.owner_name||'',location_type:x.location_type,class_id:String(x.class_id||''),store_id:String(x.store_id||''),quantity:String(x.quantity),purchase_price:String(x.purchase_price),purchase_date:x.purchase_date||'',serial_number:x.serial_number||'',status:x.status});window.scrollTo({top:0,behavior:'smooth'})}

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
    let uploadedPath = null
    try {
      const payload = {name:form.name.trim(),category:form.category.trim(),description:form.description.trim(),ownership:form.ownership,owner_name:form.ownership==='property_owner'?form.owner_name.trim():null,purchase_price:Number(form.purchase_price),purchase_date:form.purchase_date||null,serial_number:form.serial_number.trim()||null,status:form.status}
      // The live SQL grants no direct UPDATE on quantity or location.
      // These fields must only be supplied when creating an asset.
      if (!editing) payload.quantity = Number(form.quantity)
      if (!editing) Object.assign(payload,{location_type:form.location_type,class_id:form.location_type==='apartment'?form.class_id:null,store_id:form.location_type==='store'?form.store_id:null})
      if (image) {
        const blob=await optimizeImage(image)
        uploadedPath=`${crypto.randomUUID()}.webp`
        const upload=await supabase.storage.from('inventory-images').upload(uploadedPath,blob,{contentType:'image/webp',upsert:false})
        if (upload.error) throw Error(upload.error.message)
        payload.image_path=uploadedPath
      }
      const result=editing?await supabase.from('inventory_assets').update(payload).eq('id',editing).select('id').single():await supabase.from('inventory_assets').insert(payload).select('id').single()
      if (result.error) throw Error(result.error.message)
      setMessage(editing?'Asset updated.':'Asset registered.');reset();await load()
    } catch(err) {
      if (uploadedPath) await supabase.storage.from('inventory-images').remove([uploadedPath])
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
          <label>Asset name *<input className="form-control" value={form.name} onChange={e=>set('name',e.target.value)} required maxLength={180}/></label>
          <label>Category<input className="form-control" value={form.category} onChange={e=>set('category',e.target.value)} placeholder="TV / Fridge / Furniture"/></label>
          <label>Purchase price (AED) *<input className="form-control" type="number" min="0" step="0.01" value={form.purchase_price} onChange={e=>set('purchase_price',e.target.value)} required/></label>
          <label>Quantity *<input className="form-control" type="number" min="1" step="1" value={form.quantity} disabled={!!editing} onChange={e=>set('quantity',e.target.value)}/></label>
          <label>Ownership<select className="form-control" value={form.ownership} onChange={e=>set('ownership',e.target.value)}><option value="company">Company-owned</option><option value="property_owner">Property-owner-owned</option></select></label>
          {form.ownership==='property_owner'&&<label>Owner name *<input className="form-control" value={form.owner_name} onChange={e=>set('owner_name',e.target.value)} required/></label>}
          {!editing&&locationInputs(form,setForm)}
          <label>Purchase date<input className="form-control" type="date" value={form.purchase_date} onChange={e=>set('purchase_date',e.target.value)}/></label>
          <label>Serial number<input className="form-control" value={form.serial_number} onChange={e=>set('serial_number',e.target.value)}/></label>
          <label>Status<select className="form-control" value={form.status} onChange={e=>set('status',e.target.value)}><option value="active">Active</option><option value="repair">Under repair</option><option value="damaged">Damaged</option><option value="disposed">Disposed</option><option value="lost">Lost</option></select></label>
          <label>Asset photograph (max 200 KB stored)<input className="form-control" type="file" accept="image/*" onChange={e=>setImage(e.target.files?.[0]||null)}/></label>
        </div>
        <label style={{display:'block',marginTop:12}}>Notes<textarea className="form-control" rows="2" value={form.description} onChange={e=>set('description',e.target.value)}/></label>
        <div style={{display:'flex',gap:8,marginTop:12}}><button className="btn btn-primary" disabled={busy}>{busy?'Saving…':editing?'Update Asset':'Save Asset'}</button>{editing&&<button className="btn btn-outline" type="button" onClick={reset}>Cancel Edit</button>}</div>
      </form>
    </div></div>
    <div className="card" style={{marginTop:16}}><div className="card-body"><h3>Warehouse / Store Master</h3><form onSubmit={addStore} style={{display:'flex',gap:8,flexWrap:'wrap'}}><input className="form-control" style={{flex:'1 1 240px'}} placeholder="New store name" value={newStore} onChange={e=>setNewStore(e.target.value)}/><button className="btn btn-outline" disabled={busy||!newStore.trim()}>Add Store</button></form></div></div>
    <div className="card" style={{marginTop:16}}><div className="card-body"><h3>Asset Register ({filtered.length})</h3>
      <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}><input className="form-control" style={{flex:'1 1 240px'}} placeholder="Search assets, serials, apartments" value={search} onChange={e=>setSearch(e.target.value)}/><select className="form-control" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All statuses</option>{['active','repair','damaged','disposed','lost'].map(x=><option key={x} value={x}>{x}</option>)}</select></div>
      <div className="table-wrap"><table><thead><tr><th>Image</th><th>Asset ID</th><th>Description</th><th>Location</th><th>Ownership</th><th>Qty</th><th>Unit price</th><th>Total cost</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {filtered.map(x=><tr key={x.id}><td>{imageUrls[x.image_path]?<a href={imageUrls[x.image_path]} target="_blank" rel="noreferrer"><img src={imageUrls[x.image_path]} alt={x.name} style={{width:54,height:48,objectFit:'cover',borderRadius:4}}/></a>:'—'}</td><td>{x.asset_code}</td><td><strong>{x.name}</strong><div className="text-muted">{x.category}{x.serial_number?` · ${x.serial_number}`:''}</div></td><td>{locationName(x)}</td><td>{x.ownership==='company'?'Company':`Owner: ${x.owner_name}`}</td><td>{x.quantity}</td><td>{money(x.purchase_price)}</td><td>{money(x.purchase_price*x.quantity)}</td><td>{x.status}</td><td><div style={{display:'flex',gap:6,flexWrap:'wrap'}}><button className="btn btn-outline" onClick={()=>editAsset(x)}>Edit</button><button className="btn btn-outline" disabled={x.status==='disposed'||x.status==='lost'} onClick={()=>setTransfer({asset:x,qty:String(x.quantity),location_type:'apartment',class_id:'',store_id:'',note:''})}>Transfer</button><button className="btn btn-outline" onClick={()=>showHistory(x)}>History</button></div></td></tr>)}
        {!filtered.length&&<tr><td colSpan="10">No assets found.</td></tr>}
      </tbody></table></div>
      <p className="text-muted">Showing up to 2,000 most recently created records. Asset quantities and purchase prices are historical-cost tracking, not accounting depreciation.</p>
    </div></div>
    {transfer&&<div className="card" style={{marginTop:16}}><div className="card-body"><h3>Transfer — {transfer.asset.name}</h3><form onSubmit={moveAsset}><p>From: {locationName(transfer.asset)} · Available: {transfer.asset.quantity}</p><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}}><label>Quantity<input className="form-control" type="number" min="1" max={transfer.asset.quantity} required value={transfer.qty} onChange={e=>setTransfer({...transfer,qty:e.target.value})}/></label>{locationInputs(transfer,setTransfer)}</div><label>Transfer notes<input className="form-control" value={transfer.note} onChange={e=>setTransfer({...transfer,note:e.target.value})}/></label><div style={{display:'flex',gap:8,marginTop:12}}><button className="btn btn-primary" disabled={busy}>Confirm Transfer</button><button className="btn btn-outline" type="button" onClick={()=>setTransfer(null)}>Cancel</button></div></form></div></div>}
    {history&&<div className="card" style={{marginTop:16}}><div className="card-body"><div style={{display:'flex',justifyContent:'space-between'}}><h3>Movement History — {history.asset.name}</h3><button className="btn btn-outline" onClick={()=>setHistory(null)}>Close</button></div>{history.loading?'Loading…':history.error?<div className="alert alert-info">{history.error}</div>:<div className="table-wrap"><table><thead><tr><th>Date</th><th>Movement</th><th>Qty</th><th>From</th><th>To</th><th>Notes</th></tr></thead><tbody>{history.rows.map(x=><tr key={x.id}><td>{new Date(x.created_at).toLocaleString()}</td><td>{x.movement_type}</td><td>{x.quantity}</td><td>{x.from_location_type==='apartment'?className(x.from_class_id):x.from_location_type==='store'?storeName(x.from_store_id):'—'}</td><td>{x.to_location_type==='apartment'?className(x.to_class_id):x.to_location_type==='store'?storeName(x.to_store_id):'—'}</td><td>{x.note}</td></tr>)}{!history.rows.length&&<tr><td colSpan="6">No movements recorded.</td></tr>}</tbody></table></div>}</div></div>}
  </div>
}
