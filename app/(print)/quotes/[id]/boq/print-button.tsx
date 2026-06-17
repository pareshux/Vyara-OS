'use client'

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      style={{
        position: 'fixed', top: 20, right: 24,
        background: '#1F5E55', color: '#fff',
        border: 'none', borderRadius: 8,
        padding: '10px 20px', fontSize: 14, fontWeight: 500,
        cursor: 'pointer', zIndex: 99,
      }}
    >
      Print / Save PDF
    </button>
  )
}
