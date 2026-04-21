export default function DataDeletionPage() {
  return (
    <div className="min-h-screen bg-white px-6 py-12">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Alpha Marino</p>
          <h1 className="text-2xl font-bold">Eliminación de Datos de Usuario</h1>
          <p className="text-sm text-muted-foreground mt-1">Instrucciones para solicitar la eliminación de datos</p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 text-sm text-blue-800">
          Esta aplicación es una herramienta interna de Alpha Marino. No recopila datos de usuarios finales públicos. Los únicos datos almacenados corresponden a métricas de cuentas publicitarias de Meta accedidas mediante la API de Marketing.
        </div>

        <Section title="¿Qué datos almacenamos?">
          <ul className="list-disc pl-5 space-y-1">
            <li>Métricas de rendimiento de campañas (gasto, CTR, impresiones, conversiones)</li>
            <li>Identificadores de cuentas publicitarias</li>
            <li>Datos de acceso de usuarios internos (nombre, email, rol)</li>
          </ul>
        </Section>

        <Section title="Cómo solicitar la eliminación">
          Para solicitar la eliminación de tus datos o los de tu cuenta publicitaria de nuestros sistemas, envía un correo con el asunto <strong>"Solicitud de eliminación de datos"</strong> a:
          <br />
          <a href="mailto:remioi622@gmail.com?subject=Solicitud%20de%20eliminaci%C3%B3n%20de%20datos" className="text-blue-600 underline mt-2 inline-block font-medium">
            remioi622@gmail.com
          </a>
        </Section>

        <Section title="Tiempo de respuesta">
          Procesamos las solicitudes de eliminación en un plazo máximo de <strong>30 días hábiles</strong>. Recibirás confirmación por correo una vez completada la eliminación.
        </Section>

        <Section title="Eliminación de permisos en Meta">
          Si deseas revocar el acceso de esta aplicación a tus cuentas de Meta directamente:
          <ol className="list-decimal pl-5 mt-2 space-y-1">
            <li>Ve a <strong>Configuración de Facebook</strong> → <strong>Seguridad y acceso</strong></li>
            <li>Selecciona <strong>Aplicaciones y sitios web</strong></li>
            <li>Busca <strong>Glaciar Dashboard AlphaMarino</strong> y elimina el acceso</li>
          </ol>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="text-sm text-gray-700 leading-relaxed">{children}</div>
    </div>
  )
}
