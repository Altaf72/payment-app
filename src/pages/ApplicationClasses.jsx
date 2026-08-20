import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function ApplicationClasses() {
  const { user } = useAuth()
  const [classes, setClasses] = useState([])
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')

  async function load() {
    const { data, error } = await supabase.from('application_classes').select('*').order('name')
    if (error) setMessage(error.message)
    else setClasses(data || [])
  }
  useEffect(() => { load() }, [])

  async function addClass() {
    const value = name.trim()
    if (!value) return
    const { error } = await supabase.from('application_classes').insert({ name: value, created_by: user.id })
    if (error) return setMessage(error.message)
    setName('')
    setMessage('Class added.')
    load()
  }

  async function toggle(item) {
    const { error } = await supabase.from('application_classes').update({ active: !item.active }).eq('id', item.id)
    if (error) return setMessage(error.message)
    load()
  }

  async function saveEdit(item) {
    const value = editingName.trim()
    if (!value) return setMessage('Class name is required.')
    const { error } = await supabase.from('application_classes').update({ name: value }).eq('id', item.id)
    if (error) return setMessage(error.message)
    setEditingId(null)
    setEditingName('')
    setMessage('Class updated.')
    load()
  }

  return <div>
    <div className="page-header"><h1>Application Classes</h1><p>Manage the Class options staff can select on payment applications.</p></div>
    {message && <div className="alert alert-info">{message}</div>}
    <div className="card" style={{marginBottom:'16px'}}><div className="card-body" style={{display:'flex',gap:'8px',alignItems:'end',flexWrap:'wrap'}}>
      <label className="form-group" style={{margin:0,flex:'1 1 260px'}}>Class name
        <input className="form-control" value={name} onChange={event => setName(event.target.value)} onKeyDown={event => event.key === 'Enter' && addClass()} placeholder="e.g. Operations" />
      </label>
      <button className="btn btn-primary" onClick={addClass}>Add Class</button>
    </div></div>
    <div className="card"><div className="table-wrap"><table><thead><tr><th>Class</th><th>Status</th><th /></tr></thead><tbody>
      {classes.map(item => <tr key={item.id}><td>{editingId === item.id ? <input className="form-control" value={editingName} onChange={event => setEditingName(event.target.value)} onKeyDown={event => event.key === 'Enter' && saveEdit(item)} autoFocus /> : item.name}</td><td>{item.active ? 'Active' : 'Inactive'}</td><td><div style={{display:'flex',gap:6}}>{editingId === item.id ? <><button className="btn btn-primary btn-sm" onClick={() => saveEdit(item)}>Save</button><button className="btn btn-outline btn-sm" onClick={() => setEditingId(null)}>Cancel</button></> : <><button className="btn btn-outline btn-sm" onClick={() => { setEditingId(item.id); setEditingName(item.name) }}>Edit</button><button className="btn btn-outline btn-sm" onClick={() => toggle(item)}>{item.active ? 'Deactivate' : 'Activate'}</button></>}</div></td></tr>)}
      {!classes.length && <tr><td colSpan="3" className="text-muted" style={{padding:24,textAlign:'center'}}>No classes have been added.</td></tr>}
    </tbody></table></div></div>
  </div>
}
