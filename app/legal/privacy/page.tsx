export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white px-6 py-12">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Alpha Marino</p>
          <h1 className="text-2xl font-bold">Política de Privacidad</h1>
          <p className="text-sm text-muted-foreground mt-1">Última actualización: abril 2025</p>
        </div>

        <Section title="1. Quiénes somos">
          Alpha Marino es una agencia de marketing digital. Este dashboard es una herramienta interna utilizada exclusivamente por el equipo de Alpha Marino y sus colaboradores autorizados para gestionar campañas publicitarias y proyectos de clientes.
        </Section>

        <Section title="2. Datos que recopilamos">
          Esta aplicación accede a datos de cuentas publicitarias de Meta (Facebook/Instagram) mediante la API de Marketing de Meta, únicamente con fines operativos internos:
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Métricas de campañas publicitarias (gasto, CTR, impresiones, conversiones)</li>
            <li>Identificadores de cuentas publicitarias</li>
            <li>Datos de rendimiento de anuncios</li>
          </ul>
        </Section>

        <Section title="3. Cómo usamos los datos">
          Los datos se utilizan exclusivamente para:
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Visualizar métricas de campañas en el dashboard interno</li>
            <li>Generar reportes para los clientes de Alpha Marino</li>
            <li>Optimizar estrategias de paid media</li>
          </ul>
          No compartimos, vendemos ni transferimos datos a terceros.
        </Section>

        <Section title="4. Almacenamiento y seguridad">
          Los datos se almacenan en servidores seguros mediante Supabase. El acceso está restringido a usuarios autorizados de Alpha Marino con autenticación requerida.
        </Section>

        <Section title="5. Retención de datos">
          Los datos de métricas se conservan durante el período activo de la relación con el cliente. Al finalizar la relación, los datos pueden ser eliminados previa solicitud.
        </Section>

        <Section title="6. Contacto">
          Para cualquier consulta relacionada con privacidad o manejo de datos:
          <br />
          <a href="mailto:remioi622@gmail.com" className="text-blue-600 underline mt-1 inline-block">
            remioi622@gmail.com
          </a>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-sm text-gray-700 leading-relaxed">{children}</p>
    </div>
  )
}
