// Left panel: every indexed object, grouped by category.
import { useEditor } from '../../state/editor'

export default function SceneTree() {
  const { scene, selectedId, select, updateObject } = useEditor()
  if (!scene) return null

  const groups = new Map<string, typeof scene.objects>()
  for (const o of scene.objects) {
    const g = groups.get(o.category) ?? []
    g.push(o)
    groups.set(o.category, g)
  }

  return (
    <div className="panel scene-tree">
      <div className="panel-header">
        <span>Objects</span>
        <span className="count">{scene.objects.filter((o) => !o.state.hidden).length}</span>
      </div>
      <div className="panel-body">
        {[...groups.entries()].map(([category, objs]) => (
          <div key={category} className="tree-group">
            <div className="tree-group-label">{category}</div>
            {objs.map((o) => (
              <div
                key={o.id}
                className={`tree-item ${selectedId === o.id ? 'selected' : ''} ${o.state.hidden ? 'hidden-obj' : ''}`}
                onClick={() => select(o.id)}
              >
                <span className="tree-dot" style={{ background: o.appearance.dominantColors?.[0] ?? '#888' }} />
                <span className="tree-name">{o.name}</span>
                <span className="tree-conf" title={`Detection confidence ${(o.perception.confidence * 100).toFixed(0)}%`}>
                  {(o.perception.confidence * 100).toFixed(0)}%
                </span>
                <button
                  className="tree-eye"
                  title={o.state.hidden ? 'Show' : 'Hide'}
                  onClick={(e) => {
                    e.stopPropagation()
                    updateObject(o.id, (obj) => ({ ...obj, state: { ...obj.state, hidden: !obj.state.hidden } }))
                  }}
                >
                  {o.state.hidden ? '◌' : '●'}
                </button>
              </div>
            ))}
          </div>
        ))}
        {scene.objects.length === 0 && (
          <div className="empty-note">No objects indexed in this capture.</div>
        )}
      </div>
    </div>
  )
}
