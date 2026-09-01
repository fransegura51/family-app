import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

// Sin esto, un fallo de render deja la pantalla completamente en blanco
// y sin ninguna pista (bug real detectado en el primer despliegue: la
// app no arrancaba y no había forma de saber por qué). Mejor mostrar
// algo, aunque sea el propio error.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('Family App crash:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="screen screen-centered">
          <h1>Algo ha fallado</h1>
          <p className="error">{this.state.error.message}</p>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#6b7280' }}>
            {this.state.error.stack}
          </pre>
          <button type="button" onClick={() => location.reload()}>
            Recargar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
