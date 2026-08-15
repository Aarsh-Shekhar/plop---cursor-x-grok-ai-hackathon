// Last-resort guard: a crash anywhere renders a recover card instead of a
// white page.
import { Component, type ReactNode } from 'react'

export default class ErrorBoundary extends Component<
  { children: ReactNode }, { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="editor-error">
          <p>Something broke while rendering: {this.state.error.message}</p>
          <button className="btn primary" onClick={() => {
            this.setState({ error: null })
            window.location.reload()
          }}>Reload</button>
        </div>
      )
    }
    return this.props.children
  }
}
