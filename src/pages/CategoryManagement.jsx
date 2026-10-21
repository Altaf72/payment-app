import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function CategoryManagement() {
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    setBusy(true)
    const all = []
    for (let start = 0; ; start += 500) {
      const { data, error } = await supabase.from('payment_reasons').select('id,name,active').order('name').order('id').range(start, start + 499)
      if (error) { setMessage(error.message); setBusy(false); return }
      all.push(...data)
      if (data.length < 500) break
    }
    setItems(all)
    setBusy(false)
  }
  useEffect(() => { load() }, [])
  const filtered = useMemo(() => items.filter(item => item.name.toLowerCase().includes(search.trim().toLowerCase())), [items, search])
  const allSelected = filtered.length > 0 && filtered.every(item => selected.has(item.id))

  function toggleAll() {
    setSelected(previous => {
      const next = new Set(previous)
      filtered.forEach(item => allSelected ? next.delete(item.id) : next.add(item.id))
      return next
    })
  }

  function navigateRows(event) {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return
    const cell = event.target.closest('td')
    const row = cell?.parentElement
    if (!row) return
    const nextRow = event.key === 'ArrowDown' ? row.nextElementSibling : row.previousElementSibling
    const nextCell = nextRow?.children[cell.cellIndex]
    if (!nextCell) return
    event.preventDefault()
    ;(nextCell.querySelector('input') || nextCell).focus()
  }

  async function removeSelected() {
    const ids = [...selected]
    if (!ids.length || !window.confirm(`Delete ${ids.length} selected categor${ids.length === 1 ? 'y' : 'ies'}? Existing applications will keep their saved category. This cannot be undone.`)) return
    setBusy(true)
    let removed = 0
    for (let start = 0; start < ids.length; start += 100) {
      const { data, error } = await supabase.from('payment_reasons').delete().in('id', ids.slice(start, start + 100)).select('id')
      if (error || data.length !== Math.min(100, ids.length - start)) {
        setMessage(`Deleted ${removed + (data?.length || 0)} categories. ${error?.message || 'Some categories could not be deleted; check database permissions.'}`)
        setSelected(new Set())
        await load()
        return
      }
      removed += data.length
    }
    setSelected(new Set())
    setMessage(`Deleted ${removed} categor${removed === 1 ? 'y' : 'ies'}.`)
    await load()
  }

  return <div>
    <div className="page-header"><h1>Category Management</h1><p>Remove unwanted category suggestions. Existing applications keep their saved category.</p></div>
    {message && <div className="alert alert-info" role="status">{message}</div>}
    <div className="card"><div className="card-body">
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',marginBottom:16}}>
        <input className="form-control" style={{flex:'1 1 250px'}} placeholder="Search categories" aria-label="Search categories" value={search} onChange={event => setSearch(event.target.value)} />
        <button className="btn btn-outline" onClick={() => setSearch('')} disabled={!search}>Clear search</button>
        <button className="btn btn-outline" onClick={toggleAll} disabled={busy || !filtered.length}>{allSelected ? 'Deselect shown' : 'Select shown'}</button>
        <button className="btn btn-primary" onClick={removeSelected} disabled={busy || !selected.size}>Delete selected ({selected.size})</button>
      </div>
      <p className="text-muted">{filtered.length} shown · {selected.size} selected. Selections remain when searching.</p>
      <div className="table-wrap"><table><thead><tr><th>Select</th><th>Category</th><th>Status</th></tr></thead><tbody onKeyDown={navigateRows}>
        {filtered.map(item => <tr key={item.id}><td><input type="checkbox" aria-label={`Select ${item.name}`} checked={selected.has(item.id)} onChange={() => setSelected(previous => { const next = new Set(previous); next.has(item.id) ? next.delete(item.id) : next.add(item.id); return next })} /></td><td tabIndex={0} onClick={event => event.currentTarget.focus()}>{item.name}</td><td tabIndex={0} onClick={event => event.currentTarget.focus()}>{item.active ? 'Active' : 'Inactive'}</td></tr>)}
        {!filtered.length && <tr><td colSpan="3">{busy ? 'Loading…' : 'No categories found.'}</td></tr>}
      </tbody></table></div>
    </div></div>
  </div>
}
