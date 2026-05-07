export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)', fontFamily: 'Inter, sans-serif' }}>
      {children}
    </div>
  )
}
